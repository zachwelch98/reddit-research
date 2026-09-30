import { z } from "zod";
import { AI_CAPABILITIES, PAIN_POINT_DEFINITION, SCALES, WORKFLOW_CATEGORIES } from "./rubric.js";

// Bump when the system prompt or schema changes; classifications and eval predictions are keyed on it.
export const PROMPT_VERSION = "v2";
export const CLASSIFIER_MODEL = "claude-haiku-4-5";

export const SYSTEM_PROMPT = `You analyze Reddit posts from small-business and professional communities to find operational problems that businesses would pay to have solved, especially with AI.

${PAIN_POINT_DEFINITION}

Apply the definition as written:
- Shopping for software or asking "what tool do you use for X" COUNTS when the post or comments state what the tool must do or what isn't working (e.g. needs job costing, mixed property types, affordable for small clients). Don't reject it as "just a recommendation request".
- Whether a solution already exists does NOT decide is_pain_point. Record that in underserved instead.
- Workarounds (spreadsheets, manual reconciliation, copy-pasting between systems) are evidence of a pain point.
- A post by someone building a product still counts when the comments describe practitioners' own frustrations; judge those.

When it is a pain point, fill every field:
- problem_summary: one generalized sentence a reader could cluster with similar posts. No names, no specifics about this poster. Form: "<who> struggle(s) to <task> because <cause>." Example: "Small landlords struggle to track rent payments and maintenance requests because property management software is priced for large portfolios."
- persona: the role facing the problem (e.g. "independent property manager", "HVAC business owner").
- industry: short industry name (e.g. "residential property management").
- workflow_category: the closest category.
- willingness_to_pay: ${SCALES.willingness_to_pay}
- wtp_evidence: a short quote from the text supporting the score, or null if 0.
- underserved: ${SCALES.underserved}
- existing_tools: product names mentioned as used or tried (e.g. "QuickBooks", "Excel"); empty list if none.
- ai_solvability: ${SCALES.ai_solvability}
- ai_capability: the main AI capability that would help.
- emotional_intensity: ${SCALES.emotional_intensity}

When it is NOT a pain point, set every field except rationale and is_pain_point to null (existing_tools to an empty list).

rationale: at most 25 words on why it is or is not a pain point. Write it first.
Judge from the post and comments only. Comments often reveal the real problem or the workarounds people use.`;

// Structured-output schema. Integer ranges aren't expressible here, so Classification (below)
// enforces them when results are read back.
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const score = nullable({ type: "integer" });

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "rationale", "is_pain_point", "problem_summary", "persona", "industry", "workflow_category",
    "willingness_to_pay", "wtp_evidence", "underserved", "existing_tools", "ai_solvability",
    "ai_capability", "emotional_intensity",
  ],
  properties: {
    rationale: { type: "string" },
    is_pain_point: { type: "boolean" },
    problem_summary: nullable({ type: "string" }),
    persona: nullable({ type: "string" }),
    industry: nullable({ type: "string" }),
    workflow_category: nullable({ type: "string", enum: [...WORKFLOW_CATEGORIES] }),
    willingness_to_pay: score,
    wtp_evidence: nullable({ type: "string" }),
    underserved: score,
    existing_tools: { type: "array", items: { type: "string" } },
    ai_solvability: score,
    ai_capability: nullable({ type: "string", enum: [...AI_CAPABILITIES] }),
    emotional_intensity: score,
  },
} as const;

const Score = z.number().int().min(0).max(3).nullable();
export const Classification = z.object({
  rationale: z.string(),
  is_pain_point: z.boolean(),
  problem_summary: z.string().nullable(),
  persona: z.string().nullable(),
  industry: z.string().nullable(),
  workflow_category: z.enum(WORKFLOW_CATEGORIES).nullable(),
  willingness_to_pay: Score,
  wtp_evidence: z.string().nullable(),
  underserved: Score,
  existing_tools: z.array(z.string()),
  ai_solvability: Score,
  ai_capability: z.enum(AI_CAPABILITIES).nullable(),
  emotional_intensity: Score,
});
export type Classification = z.infer<typeof Classification>;
