// The labeling rubric. Shared by the classifier prompt and the human labeling tool so the model
// and the answer key are judged against the same definitions.

export const PAIN_POINT_DEFINITION = `A PAIN POINT is a concrete, recurring problem in running a business or doing professional work that a product, service, or automation could plausibly address.
Count it when the post (or its comments) describes: tedious or error-prone manual processes; time or money sinks in operations; frustration with, or gaps in, existing tools; a request for software/tools to do a specific job, with the need stated.
Do NOT count: a one-off dispute or situation seeking advice (a specific tenant, customer, employee, or contract); legal/tax/medical questions about one case; career, job-seeking, or salary talk; general strategy, motivation, or venting without an operational problem; promotions, ads, surveys, or market research posts; news and memes; hiring someone for a one-off job.`;

export const SCALES = {
  willingness_to_pay: `0 = no signal. 1 = a business with this workflow (implied budget). 2 = already pays for tools/services for it, or states what the problem costs (hours, dollars, lost clients). 3 = explicitly says they would pay, or is actively shopping for a solution.`,
  underserved: `0 = existing tools handle it well. 1 = minor gaps. 2 = tools exist but are too expensive, complex, or poorly fitted; people rely on spreadsheets, paper, or workarounds. 3 = nothing works or no tool exists; heavy manual effort.`,
  ai_solvability: `0 = not addressable by software (physical labor, policy, people problems). 1 = ordinary software helps but AI adds little (plain records/CRUD). 2 = AI meaningfully helps part of it (drafting, extraction, triage, summarizing). 3 = the core work is text, documents, communication, or data handling that AI can largely automate.`,
  emotional_intensity: `0 = neutral. 1 = mild annoyance. 2 = clearly frustrated. 3 = intense (rant, burnout, "I hate this").`,
} as const;

export const WORKFLOW_CATEGORIES = [
  "scheduling",
  "intake_onboarding",
  "billing_invoicing_payments",
  "bookkeeping_accounting",
  "documents_paperwork",
  "compliance_regulatory",
  "customer_communication",
  "marketing_lead_generation",
  "sales_quoting_estimating",
  "hiring_staffing_hr",
  "inventory_supply_chain",
  "reporting_analytics",
  "data_entry_record_keeping",
  "tool_integration",
  "field_operations_dispatch",
  "other",
] as const;

export const AI_CAPABILITIES = ["extraction", "generation", "agent", "voice", "vision", "classification", "other"] as const;
