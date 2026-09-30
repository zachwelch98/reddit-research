// Voyage embeddings (same model and endpoint as the research pipeline). 429s/5xx back off and retry.
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
export const EMBED_BATCH = 128;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function embed(texts: string[], inputType: "document" | "query"): Promise<Float32Array[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ input: texts, model: process.env.VOYAGE_MODEL ?? "voyage-3.5", input_type: inputType }),
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

export async function embedOne(text: string, inputType: "document" | "query"): Promise<Float32Array> {
  return (await embed([text], inputType))[0]!;
}
