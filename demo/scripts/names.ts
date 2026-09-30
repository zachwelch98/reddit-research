import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Parallel generation batches reuse names ("Rosalind Achebe" / "Rosalind Achebe-Marsh", seven Marcuses).
// Returns the indices to rename: near-duplicates of an earlier name, and first names beyond MAX_FIRST.
const MAX_FIRST = 2;

export function namesToReplace(names: string[]): number[] {
  const firstCount = new Map<string, number>();
  const seenKeys = new Set<string>();
  const out: number[] = [];
  names.forEach((name, i) => {
    const [first = "", ...rest] = name.toLowerCase().split(/\s+/);
    const key = `${first} ${(rest[0] ?? "").slice(0, 5)}`;
    const n = (firstCount.get(first) ?? 0) + 1;
    if (seenKeys.has(key) || n > MAX_FIRST) return void out.push(i);
    seenKeys.add(key);
    firstCount.set(first, n);
  });
  return out;
}

// `kept` are the names staying as they are; returned names obey the same rules against them and each other.
export async function freshNames(client: Anthropic, count: number, kept: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let attempt = 0; out.length < count && attempt < 4; attempt++) {
    const all = [...kept, ...out];
    const res = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(z.object({ names: z.array(z.string()) })) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: `Invent ${2 * (count - out.length) + 10} fictional full names (first and last) for US tech professionals. They must look ordinary, like names you'd see on LinkedIn, across varied backgrounds; no rare, old-fashioned or fantasy-sounding names. Every first name must differ from each other and from these existing names: ${all.join(", ")}.`,
        },
      ],
    });
    for (const n of res.parsed_output?.names ?? []) {
      if (out.length >= count) break;
      if (!namesToReplace([...kept, ...out, n]).includes(kept.length + out.length)) out.push(n);
    }
  }
  if (out.length < count) throw new Error(`needed ${count} fresh names, got ${out.length}`);
  return out;
}

export const emailFor = (name: string) =>
  `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, "").trim().split(/\s+/).join(".")}@mailbox.example`;
