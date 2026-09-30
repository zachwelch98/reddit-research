import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runReadOnlySql } from "@/lib/db";
import { semanticSearch } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You answer questions about a dataset of business pain points mined from Reddit (small-business and professional subreddits). Use the tools; never invent numbers or posts.

SQLite schema (read-only):
- posts(id, subreddit, author, title, selftext, permalink, created_utc, comments_fetched_n, is_removed)
- comments(id, post_id, body, position)  -- position 0 = top comment
- classifications(post_id, is_pain_point, problem_summary, persona, industry, workflow_category, willingness_to_pay 0-3, wtp_evidence, underserved 0-3, existing_tools JSON array, ai_solvability 0-3, ai_capability, emotional_intensity 0-3, rationale)
- clusters(id, is_current, label, problem_statement, who, size, n_subreddits, avg_wtp, avg_underserved, avg_ai_solvability, avg_emotional_intensity, score)  -- use is_current = 1
- cluster_members(cluster_id, post_id, distance)
- sources(id, type, subreddit, vertical)  and post_sources(post_id, source_id, listing)
Reddit URL of a post: 'https://www.reddit.com' || permalink. Dates are unix seconds.

Guidance: use semantic_search to find posts about a theme, sql_query for counts, rankings and joins. Cite specific posts as markdown links with their titles. Say how many posts an answer rests on; if the sample is small, say so. Keep answers concise.

Answers render as Markdown (GitHub-flavored). Lead with a one- or two-sentence direct answer. When the answer has several parts, give each a short ### heading. Bold the key finding and key numbers. Use bullet lists for sets of items, and a table when comparing several clusters, subreddits or scores side by side. Short answers need no headings.`;

const tools = [
  betaZodTool({
    name: "sql_query",
    description: "Run one read-only SQLite SELECT/WITH query against the dataset. Returns up to 100 rows as JSON; long text is truncated.",
    inputSchema: z.object({ query: z.string().describe("A single SELECT or WITH statement") }),
    run: async ({ query }) => {
      try {
        const { rows, truncated } = runReadOnlySql(query, 100);
        const clipped = rows.map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : Buffer.isBuffer(v) ? "[blob]" : v])),
        );
        return JSON.stringify({ rows: clipped, truncated });
      } catch (e) {
        return `SQL error: ${(e as Error).message}`;
      }
    },
  }),
  betaZodTool({
    name: "semantic_search",
    description: "Find pain points whose problem summaries are semantically closest to a natural-language query. Returns post ids, titles, subreddits, summaries, similarity and Reddit URLs.",
    inputSchema: z.object({
      query: z.string().describe("What kind of problem to look for"),
      k: z.number().int().min(1).max(50).optional().describe("How many results (default 15)"),
    }),
    run: async ({ query, k }) => JSON.stringify(await semanticSearch(query, k ?? 15)),
  }),
];

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const client = new Anthropic();
    const final = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 12,
      // Opus 5.5 defaults to medium effort; Opus 5 (which this route used before) ran at high.
      output_config: { effort: "high" },
      // Server-side refusal fallback: if Opus 5.5 declines, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools,
      messages: parsed.data.messages,
    });
    if (final.stop_reason === "refusal") {
      return Response.json({ answer: "The model declined to answer this question." });
    }
    const answer = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return Response.json({
      answer: answer || "(no answer)",
      usage: { input: final.usage.input_tokens, output: final.usage.output_tokens },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Anthropic API key rejected (401). Check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
