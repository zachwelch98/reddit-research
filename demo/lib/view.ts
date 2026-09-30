import type { CandidateRow, Submission } from "./store";

// What the browser gets for a candidate card.
export type CandidateCard = {
  id: number;
  name: string;
  headline: string;
  title: string;
  location: string;
  work_pref: string;
  years_exp: number;
  skills: string[];
  last_contacted: string | null;
  source: string;
  created_at: string;
};

export const toCard = (r: CandidateRow): CandidateCard => ({
  id: r.id,
  name: r.profile.name,
  headline: r.profile.headline,
  title: `${r.profile.current_title} · ${r.profile.current_company}`,
  location: r.profile.location,
  work_pref: r.profile.work_pref,
  years_exp: r.profile.years_exp,
  skills: r.profile.skills,
  last_contacted: r.last_contacted,
  source: r.source,
  created_at: r.created_at,
});

export type Flag = { kind: "rejected" | "active" | "placed" | "stale" | "new" | "repeat"; text: string };

const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const STAGE_TEXT: Record<string, string> = { screen: "screening", submitted: "submitted", client_interview: "client interview", interviewing: "interviewing", offer: "offer" };

export function flagsFor(row: CandidateRow, history: Submission[], clientName: string, today: string, otherJobs: { job_title: string; client: string }[] = []): Flag[] {
  const flags: Flag[] = [];
  const covered = new Set<string>();
  for (const h of history.filter((h) => h.client === clientName)) {
    covered.add(`${h.job_title}|${h.client}`);
    if (h.stage === "rejected") flags.push({ kind: "rejected", text: `Rejected by ${clientName} · ${month(h.date)}${h.note ? ` — ${h.note}` : ""}` });
    else if (h.stage === "placed") flags.push({ kind: "placed", text: `Placed at ${clientName} · ${month(h.date)}` });
    else if (h.stage === "applied") flags.push({ kind: "repeat", text: `Also applied to ${h.job_title} at ${clientName}` });
    else if (h.stage === "sourced") flags.push({ kind: "repeat", text: `Also in your pipeline for ${h.job_title} at ${clientName}` });
    else flags.push({ kind: "active", text: `Already in process with ${clientName} (${h.job_title}, ${STAGE_TEXT[h.stage] ?? h.stage})` });
  }
  const other = otherJobs.find((j) => !covered.has(`${j.job_title}|${j.client}`));
  if (other) flags.push({ kind: "repeat", text: `Also applied to ${other.job_title} at ${other.client}` });
  if (row.created_at === today) flags.push({ kind: "new", text: "Added today" });
  if (!row.last_contacted || daysBetween(row.last_contacted, today) > 365) flags.push({ kind: "stale", text: "No contact in over a year" });
  return flags;
}

export function contactedLabel(d: string | null, today: string): string {
  if (!d) return "Never contacted";
  const n = daysBetween(d, today);
  if (n <= 0) return "Contacted today";
  if (n < 30) return `Contacted ${n}d ago`;
  if (n < 365) return `Contacted ${Math.round(n / 30)}mo ago`;
  return `Contacted ${(n / 365).toFixed(1)}y ago`;
}
