import type Anthropic from "@anthropic-ai/sdk";
import type { DB } from "../db/index.js";
import { Classification } from "./prompt.js";

// Extracts and validates the structured JSON from a response. Returns an error string on failure.
export function parseClassification(message: Anthropic.Message): Classification | string {
  if (message.stop_reason === "refusal") return "refusal";
  if (message.stop_reason === "max_tokens") return "max_tokens";
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) return "no text block";
  try {
    const parsed = Classification.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : `schema: ${parsed.error.issues[0]?.message}`;
  } catch {
    return "invalid JSON";
  }
}

export function saveClassification(
  db: DB,
  postId: string,
  c: Classification,
  meta: { model: string; promptVersion: string; batchId: string | null },
) {
  db.prepare(
    `INSERT OR REPLACE INTO classifications
       (post_id, batch_id, model, prompt_version, is_pain_point, problem_summary, persona, industry,
        workflow_category, willingness_to_pay, wtp_evidence, existing_tools, underserved, ai_solvability,
        ai_capability, emotional_intensity, rationale, raw)
     VALUES (@post_id, @batch_id, @model, @prompt_version, @is_pain_point, @problem_summary, @persona, @industry,
        @workflow_category, @willingness_to_pay, @wtp_evidence, @existing_tools, @underserved, @ai_solvability,
        @ai_capability, @emotional_intensity, @rationale, @raw)`,
  ).run({
    ...c,
    post_id: postId,
    batch_id: meta.batchId,
    model: meta.model,
    prompt_version: meta.promptVersion,
    is_pain_point: c.is_pain_point ? 1 : 0,
    existing_tools: JSON.stringify(c.existing_tools),
    raw: JSON.stringify(c),
  });
}
