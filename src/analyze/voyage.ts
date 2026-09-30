import { voyageEnv } from "../config.js";

// Voyage embeddings API. 128 inputs per request keeps each call small; 429s back off and retry.
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
export const EMBED_BATCH = 128;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function embed(texts: string[], inputType: "document" | "query"): Promise<Float32Array[]> {
  const { VOYAGE_API_KEY, VOYAGE_MODEL } = voyageEnv();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      return json.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(Math.min(60_000, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Voyage embeddings failed: HTTP ${res.status} ${await res.text()}`);
  }
}
