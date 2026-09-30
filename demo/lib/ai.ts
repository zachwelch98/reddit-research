import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Profile } from "./profile";
import type { CandidateRow, Submission } from "./store";

const client = new Anthropic();
const MODEL = "claude-opus-5";
// Low effort keeps each call short, which matters on a screen recording.
// Server-side refusal fallback: if the model declines, the API retries on a fallback model.
const BETAS = ["server-side-fallback-2026-07-01"];

export async function structured<T extends z.ZodType>(schema: T, system: string, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<z.infer<T>> {
  const params = {
    model: MODEL,
    max_tokens: 6000, // outputs here are ~2k tokens
    fallbacks: "default" as const,
    system,
    messages: [{ role: "user" as const, content }],
    output_config: { effort: "low" as const, format: zodOutputFormat(schema) },
  };
  const started = Date.now();
  const res = await client.beta.messages.parse({ ...params, betas: BETAS });
  console.log(`[ai] ${Date.now() - started}ms out=${res.usage.output_tokens}`);
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (!res.parsed_output) throw new Error(`No structured output (stop_reason: ${res.stop_reason})`);
  return res.parsed_output as z.infer<T>;
}

// ── Resume → profile ─────────────────────────────────────────────────────────
export async function parseResume(pdf: Buffer): Promise<Profile> {
  return structured(
    Profile,
    "You turn candidate resumes into structured recruiting profiles. Use only facts in the resume; for fields it doesn't state (work preference, availability, desired comp), write 'Not stated' or pick 'flexible'. Keep highlights short and concrete.",
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
      { type: "text", text: "Extract this candidate's profile." },
    ],
  );
}

// ── Plain-English search → filters ───────────────────────────────────────────
export const SearchPlan = z.object({
  semantic: z.string().describe("What kind of person to look for, rewritten as a profile description for semantic search"),
  location: z.string().nullable().describe("A city, state or region the candidate must be in, or null"),
  min_years: z.number().int().nullable(),
  contacted_within_days: z.number().int().nullable().describe("Only people last contacted within this many days, or null"),
  chips: z.array(z.string()).describe("2-5 short labels summarising how the query was interpreted, e.g. 'Data engineering', 'Florida', 'Spark', 'Contacted < 6 mo'"),
});
export type SearchPlan = z.infer<typeof SearchPlan>;

export function planSearch(query: string, today: string): Promise<SearchPlan> {
  return structured(
    SearchPlan,
    `You translate a recruiter's plain-English search of their own candidate database into a search plan. Today is ${today}. Only set a filter when the query clearly asks for it. For US states, set location to the state name or its usual abbreviation as a recruiter would write it (e.g. 'FL' for Florida).`,
    [{ type: "text", text: query }],
  );
}

// ── Job order → ranked shortlist ─────────────────────────────────────────────
export const Shortlist = z.object({
  job: z.object({
    title: z.string(),
    must_haves: z.array(z.string()).describe("3-5 short items"),
    nice_to_haves: z.array(z.string()).describe("0-3 short items"),
  }),
  matches: z
    .array(
      z.object({
        id: z.number().int(),
        fit: z.number().int().describe("0-100"),
        why: z.string().describe("One sentence a recruiter could paste into a submittal"),
        evidence: z.array(z.string()).describe("2-3 specific facts from the profile that meet must-haves"),
        gaps: z.array(z.string()).describe("0-2 honest gaps or risks"),
      }),
    )
    .describe("The best candidates, best first"),
});
export type Shortlist = z.infer<typeof Shortlist>;

export function rankForJob(
  jobOrder: string,
  clientName: string,
  candidates: { row: CandidateRow; history: Submission[] }[],
  today: string,
  top = 6,
): Promise<Shortlist> {
  const pool = candidates.map(({ row, history }) => ({
    id: row.id,
    headline: row.profile.headline,
    title: `${row.profile.current_title} at ${row.profile.current_company}`,
    location: `${row.profile.location} (${row.profile.work_pref})`,
    years: row.profile.years_exp,
    skills: row.profile.skills,
    experience: row.profile.experience.map((e) => `${e.title}, ${e.company} ${e.start}–${e.end}: ${e.highlights.join("; ")}`),
    comp: row.profile.desired_comp,
    availability: row.profile.availability,
    recruiter_notes: row.notes,
    last_contacted: row.last_contacted,
    history: history.map((h) => `${h.date} ${h.client} — ${h.job_title}: ${h.stage}${h.note ? ` (${h.note})` : ""}`),
  }));
  return structured(
    Shortlist,
    `You are a senior agency recruiter shortlisting from your own candidate database for a client job order. Today is ${today}. Judge fit on the must-haves first, then location/work preference, compensation and availability. Cite concrete profile facts as evidence; never invent facts. Candidates previously rejected by this same client can still be listed if strong, but say so in gaps. Rank the best ${top} candidates, best first.`,
    [{ type: "text", text: `Client: ${clientName}\n\nJob order:\n${jobOrder}\n\nCandidates:\n${JSON.stringify(pool)}` }],
  );
}
