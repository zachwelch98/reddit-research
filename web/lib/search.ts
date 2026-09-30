import "server-only";
import { getDb, redditUrl } from "./db";

async function embedQuery(text: string): Promise<Float32Array> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ input: [text], model: process.env.VOYAGE_MODEL ?? "voyage-3.5", input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return Float32Array.from(json.data[0]!.embedding);
}

export type SearchHit = {
  post_id: string;
  similarity: number;
  title: string;
  subreddit: string;
  problem_summary: string;
  url: string;
};

// Nearest pain points to a free-text query (cosine), via the sqlite-vec index.
export async function semanticSearch(query: string, k = 15): Promise<SearchHit[]> {
  const v = await embedQuery(query);
  const rows = getDb()
    .prepare(
      `SELECT v.post_id, v.distance, p.title, p.subreddit, p.permalink, c.problem_summary
       FROM vec_pain_points v JOIN posts p ON p.id = v.post_id JOIN classifications c ON c.post_id = v.post_id
       WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`,
    )
    .all(Buffer.from(v.buffer), Math.min(k, 50)) as {
    post_id: string; distance: number; title: string; subreddit: string; permalink: string; problem_summary: string;
  }[];
  return rows.map((r) => ({
    post_id: r.post_id,
    similarity: Math.round((1 - r.distance) * 1000) / 1000,
    title: r.title,
    subreddit: r.subreddit,
    problem_summary: r.problem_summary,
    url: redditUrl(r.permalink),
  }));
}
