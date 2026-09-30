// npm run search -- "<question>" [filters] [--limit N] [--rerank] [--json]
//
// Semantic search over classified pain points: SQL filters on the classifier's fields narrow the set,
// the question's Voyage embedding ranks it by similarity to each problem_summary, and --rerank has
// Claude read the top candidates and drop the ones that don't actually answer the question.
//
// filters: --sub NAME (repeatable)  --vertical NAME (repeatable)  --category WORKFLOW_CATEGORY
//          --capability AI_CAPABILITY  --min-ai N  --min-wtp N  --min-underserved N  (scores are 0–3)
//
// Phrase questions like the stored summaries for the best matches, e.g.
//   "agency owners struggle to write client performance summaries"
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb, getDb } from "../db/index.js";
import { CLASSIFIER_MODEL } from "./prompt.js";
import { embed } from "./voyage.js";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sub: { type: "string", multiple: true },
    vertical: { type: "string", multiple: true },
    category: { type: "string" },
    capability: { type: "string" },
    "min-ai": { type: "string" },
    "min-wtp": { type: "string" },
    "min-underserved": { type: "string" },
    limit: { type: "string", default: "15" },
    rerank: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

const question = positionals.join(" ").trim();
if (!question) {
  console.error('usage: npm run search -- "<question>" [--vertical NAME] [--min-ai N] [--rerank] ...');
  process.exit(1);
}
const limit = Number(args.limit);
const lower = (xs?: string[]) => (xs?.length ? JSON.stringify(xs.map((x) => x.replace(/^r\//i, "").toLowerCase())) : null);

type Hit = {
  post_id: string;
  subreddit: string;
  vertical: string | null;
  title: string;
  permalink: string;
  problem_summary: string;
  persona: string | null;
  workflow_category: string | null;
  ai_capability: string | null;
  willingness_to_pay: number | null;
  ai_solvability: number | null;
  underserved: number | null;
  wtp_evidence: string | null;
  cluster: string | null;
  excerpt: string;
  similarity: number;
  relevance?: number;
  why?: string;
};

function print(hits: Hit[]) {
  if (!hits.length) return console.log("No matching pain points.");
  for (const [i, h] of hits.entries()) {
    const score = h.relevance != null ? `relevance ${h.relevance}/3` : `sim ${h.similarity.toFixed(3)}`;
    console.log(
      `\n${i + 1}. [${score}] r/${h.subreddit}${h.vertical ? ` (${h.vertical})` : ""} · ${h.workflow_category ?? "?"} · ` +
        `wtp ${h.willingness_to_pay} ai ${h.ai_solvability} underserved ${h.underserved}`,
    );
    console.log(`   ${h.problem_summary}`);
    if (h.why) console.log(`   why: ${h.why}`);
    if (h.cluster) console.log(`   cluster: ${h.cluster}`);
    if (h.wtp_evidence) console.log(`   "${h.wtp_evidence}"`);
    console.log(`   https://www.reddit.com${h.permalink}`);
  }
}

const RERANK_SYSTEM = `You judge whether Reddit pain points answer a search question. For each candidate, give relevance:
3 = directly the problem asked about; 2 = closely related, same underlying need; 1 = shares a topic but a different problem; 0 = unrelated.
why: at most 15 words. Judge the summary and excerpt, not just shared keywords.`;

const RERANK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_id", "relevance", "why"],
        properties: { post_id: { type: "string" }, relevance: { type: "integer" }, why: { type: "string" } },
      },
    },
  },
} as const;

const Reranked = z.object({
  results: z.array(z.object({ post_id: z.string(), relevance: z.number().int().min(0).max(3), why: z.string() })),
});

// Keeps candidates Claude rates 2+ ("same underlying need"), ordered by relevance then similarity.
async function rerank(question: string, hits: Hit[]): Promise<Hit[]> {
  const body =
    `<question>${question}</question>\n` +
    hits
      .map((h) => `<candidate post_id="${h.post_id}">\nsummary: ${h.problem_summary}\ntitle: ${h.title}\nexcerpt: ${h.excerpt}\n</candidate>`)
      .join("\n");
  const res = await new Anthropic().messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 8000,
    system: RERANK_SYSTEM,
    output_config: { format: { type: "json_schema", schema: RERANK_SCHEMA } },
    messages: [{ role: "user", content: body }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`rerank: stop_reason ${res.stop_reason}`);
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const scores = new Map(Reranked.parse(JSON.parse(text)).results.map((r) => [r.post_id, r]));
  return hits
    .map((h) => ({ ...h, relevance: scores.get(h.post_id)?.relevance ?? 0, why: scores.get(h.post_id)?.why }))
    .filter((h) => h.relevance >= 2)
    .sort((a, b) => b.relevance - a.relevance || b.similarity - a.similarity);
}

const db = getDb();
try {
  const [q] = await embed([question], "query");
  // Pull extra candidates when reranking, since Claude will discard some.
  const pool = args.rerank ? Math.max(limit * 3, 30) : limit;
  let hits = db
    .prepare(
      `SELECT c.post_id, p.subreddit, s.vertical, p.title, p.permalink, c.problem_summary, c.persona,
              c.workflow_category, c.ai_capability, c.willingness_to_pay, c.ai_solvability, c.underserved,
              c.wtp_evidence,
              (SELECT k.label FROM cluster_members m JOIN clusters k ON k.id = m.cluster_id
                WHERE m.post_id = c.post_id AND k.is_current LIMIT 1) AS cluster,
              substr(COALESCE(p.selftext, ''), 1, 600) AS excerpt,
              1 - vec_distance_cosine(v.embedding, @q) AS similarity
       FROM vec_pain_points v
       JOIN classifications c ON c.post_id = v.post_id
       JOIN posts p ON p.id = c.post_id
       LEFT JOIN sources s ON s.type = 'subreddit' AND lower(s.subreddit) = lower(p.subreddit)
       WHERE c.is_pain_point = 1
         AND (@subs IS NULL OR lower(p.subreddit) IN (SELECT value FROM json_each(@subs)))
         AND (@verticals IS NULL OR lower(s.vertical) IN (SELECT value FROM json_each(@verticals)))
         AND (@category IS NULL OR c.workflow_category = @category)
         AND (@capability IS NULL OR c.ai_capability = @capability)
         AND c.ai_solvability >= @minAi AND c.willingness_to_pay >= @minWtp AND c.underserved >= @minUnder
       ORDER BY similarity DESC
       LIMIT @pool`,
    )
    .all({
      q: q!,
      subs: lower(args.sub),
      verticals: lower(args.vertical),
      category: args.category ?? null,
      capability: args.capability ?? null,
      minAi: Number(args["min-ai"] ?? 0),
      minWtp: Number(args["min-wtp"] ?? 0),
      minUnder: Number(args["min-underserved"] ?? 0),
      pool,
    }) as Hit[];

  if (args.rerank && hits.length) hits = await rerank(question, hits);
  hits = hits.slice(0, limit);

  if (args.json) console.log(JSON.stringify(hits, null, 2));
  else print(hits);
} finally {
  closeDb();
}
