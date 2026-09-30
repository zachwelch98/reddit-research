import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { DB } from "../db/index.js";

// Names a cluster and writes its problem statement from its most central members.
export const DESCRIBER_MODEL = "claude-sonnet-5";
const MAX_MEMBERS = 25;

const SYSTEM = `You summarize a cluster of related business problems mined from Reddit posts. Each member has a one-line problem summary written by a classifier plus an excerpt of the original post.
Write:
- label: at most 8 words naming the shared problem (e.g. "Small landlords lack affordable rent tracking").
- problem_statement: 2–3 sentences: who has the problem, what they are trying to do, why current options fail. Only state what the members support.
- who: the personas affected, comma-separated.
- quotes: up to 3 short quotes (under 30 words each) that best show the pain, copied VERBATIM from the excerpts, with the post_id they came from.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "problem_statement", "who", "quotes"],
  properties: {
    label: { type: "string" },
    problem_statement: { type: "string" },
    who: { type: "string" },
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_id", "quote"],
        properties: { post_id: { type: "string" }, quote: { type: "string" } },
      },
    },
  },
} as const;

const Description = z.object({
  label: z.string(),
  problem_statement: z.string(),
  who: z.string(),
  quotes: z.array(z.object({ post_id: z.string(), quote: z.string() })),
});
export type Description = z.infer<typeof Description>;

type Member = { post_id: string; title: string; problem_summary: string; persona: string | null; text: string };

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function describeCluster(db: DB, client: Anthropic, clusterId: number): Promise<Description> {
  const members = db
    .prepare(
      `SELECT c.post_id, p.title, c.problem_summary, c.persona,
              p.title || char(10) || COALESCE(p.selftext, '') || char(10) ||
              COALESCE((SELECT group_concat(body, char(10)) FROM
                (SELECT body FROM comments WHERE post_id = p.id ORDER BY position LIMIT 3)), '') AS text
       FROM cluster_members m JOIN classifications c ON c.post_id = m.post_id JOIN posts p ON p.id = m.post_id
       WHERE m.cluster_id = ? ORDER BY m.distance LIMIT ?`,
    )
    .all(clusterId, MAX_MEMBERS) as Member[];

  const body = members
    .map((m) => `<member post_id="${m.post_id}">\nsummary: ${m.problem_summary}\npersona: ${m.persona ?? "?"}\nexcerpt: ${m.text.slice(0, 700)}\n</member>`)
    .join("\n");

  const res = await client.messages.create({
    model: DESCRIBER_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: body }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
    throw new Error(`cluster ${clusterId}: stop_reason ${res.stop_reason}`);
  }
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const d = Description.parse(JSON.parse(text));

  // Keep only quotes that really appear in the named post; drop paraphrases.
  const byId = new Map(members.map((m) => [m.post_id, squash(m.text)]));
  d.quotes = d.quotes.filter((q) => byId.get(q.post_id)?.includes(squash(q.quote).replace(/^["“]|["”]$/g, "")));
  return d;
}
