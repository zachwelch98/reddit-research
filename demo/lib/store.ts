import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Profile } from "./profile";
import { STAGES, STRONG_FIT, type Origin, type RejectedBy, type Stage } from "./stages";
export { STAGES, STRONG_FIT, type Origin, type RejectedBy, type Stage };

// Plain module (no server-only) so the seed script can share it with the app.
export const EMBED_DIM = 1024;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidates (
  id             INTEGER PRIMARY KEY,
  profile        TEXT NOT NULL,          -- JSON Profile
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  location       TEXT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL,          -- 'LinkedIn capture' | 'Resume upload' | 'Referral' | 'Inbound application'
  last_contacted TEXT,                   -- YYYY-MM-DD
  created_at     TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS clients (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  client_id    INTEGER NOT NULL REFERENCES clients(id),
  job_title    TEXT NOT NULL,
  stage        TEXT NOT NULL,          -- 'submitted' | 'interviewing' | 'rejected' | 'placed'
  note         TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY,
  client_id     INTEGER NOT NULL REFERENCES clients(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  location      TEXT NOT NULL,
  comp          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  opened_at     TEXT NOT NULL,
  must_haves    TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  nice_to_haves TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  seeded        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pipeline (
  id             INTEGER PRIMARY KEY,
  job_id         INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id   INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  stage          TEXT NOT NULL,         -- sourced|applied|screen|submitted|client_interview|offer|placed|rejected
  origin         TEXT NOT NULL,         -- 'applied' | 'sourced'
  fit            INTEGER,
  why            TEXT,
  evidence       TEXT,                  -- JSON string[]
  gaps           TEXT,                  -- JSON string[]
  next_step      TEXT,
  next_step_date TEXT,
  stage_updated  TEXT NOT NULL,
  rejected_by    TEXT,                  -- 'recruiter' | 'client'
  reject_reason  TEXT,
  UNIQUE(job_id, candidate_id)
);
CREATE TABLE IF NOT EXISTS pipeline_seed (
  id             INTEGER PRIMARY KEY,
  job_id         INTEGER NOT NULL,
  candidate_id   INTEGER NOT NULL,
  stage          TEXT NOT NULL,
  origin         TEXT NOT NULL,
  fit            INTEGER,
  why            TEXT,
  evidence       TEXT,
  gaps           TEXT,
  next_step      TEXT,
  next_step_date TEXT,
  stage_updated  TEXT NOT NULL,
  rejected_by    TEXT,
  reject_reason  TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS vec_candidates USING vec0(candidate_id INTEGER PRIMARY KEY, embedding float[${EMBED_DIM}] distance_metric=cosine);
`;

export function openDb(file: string) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  db.exec(SCHEMA);
  return db;
}
export type DB = ReturnType<typeof openDb>;

export type CandidateRow = {
  id: number;
  profile: Profile;
  notes: string;
  source: string;
  last_contacted: string | null;
  created_at: string;
};

export type Submission = { client: string; job_title: string; stage: string; note: string; date: string };

export type JobRow = {
  id: number;
  client_id: number;
  client: string;
  title: string;
  description: string;
  location: string;
  comp: string;
  status: string;
  opened_at: string;
  must_haves: string[];
  nice_to_haves: string[];
  seeded: number;
};

export type PipelineRow = {
  id: number;
  job_id: number;
  candidate_id: number;
  stage: Stage;
  origin: Origin;
  fit: number | null;
  why: string | null;
  evidence: string[] | null;
  gaps: string[] | null;
  next_step: string | null;
  next_step_date: string | null;
  stage_updated: string;
  rejected_by: RejectedBy | null;
  reject_reason: string | null;
};

export function insertCandidate(
  db: DB,
  c: { profile: Profile; notes: string; source: string; last_contacted: string | null; created_at?: string },
  embedding: Float32Array,
): number {
  const { id } = db
    .prepare(
      `INSERT INTO candidates (profile, name, email, location, notes, source, last_contacted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, coalesce(?, date('now'))) RETURNING id`,
    )
    .get(JSON.stringify(c.profile), c.profile.name, c.profile.email.toLowerCase(), c.profile.location, c.notes, c.source, c.last_contacted, c.created_at ?? null) as {
    id: number;
  };
  db.prepare("INSERT INTO vec_candidates (candidate_id, embedding) VALUES (?, ?)").run(BigInt(id), Buffer.from(embedding.buffer));
  return id;
}

type RawRow = Omit<CandidateRow, "profile"> & { profile: string };
const toRow = (r: RawRow): CandidateRow => ({ ...r, profile: JSON.parse(r.profile) as Profile });
const COLS = "id, profile, notes, source, last_contacted, created_at";

export function getCandidate(db: DB, id: number): CandidateRow | undefined {
  const r = db.prepare(`SELECT ${COLS} FROM candidates WHERE id = ?`).get(id) as RawRow | undefined;
  return r && toRow(r);
}

export function getCandidates(db: DB, ids: number[]): CandidateRow[] {
  if (!ids.length) return [];
  const rows = db.prepare(`SELECT ${COLS} FROM candidates WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as RawRow[];
  const byId = new Map(rows.map((r) => [r.id, toRow(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// Newest first; no limit returns the whole pool.
export function recentCandidates(db: DB, limit = -1): CandidateRow[] {
  return (db.prepare(`SELECT ${COLS} FROM candidates ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit) as RawRow[]).map(toRow);
}

// Nearest candidates to a query vector, closest first.
export function nearest(db: DB, v: Float32Array, k: number): { id: number; similarity: number }[] {
  const rows = db
    .prepare("SELECT candidate_id, distance FROM vec_candidates WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(Buffer.from(v.buffer), k) as { candidate_id: number; distance: number }[];
  return rows.map((r) => ({ id: Number(r.candidate_id), similarity: 1 - r.distance }));
}

export function findByEmailOrName(db: DB, email: string, name: string): { id: number; created_at: string } | undefined {
  return db
    .prepare("SELECT id, created_at FROM candidates WHERE email = ? OR lower(name) = lower(?) LIMIT 1")
    .get(email.toLowerCase(), name) as { id: number; created_at: string } | undefined;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────
const JOB_COLS = "j.id, j.client_id, c.name AS client, j.title, j.description, j.location, j.comp, j.status, j.opened_at, j.must_haves, j.nice_to_haves, j.seeded";
type RawJobRow = Omit<JobRow, "must_haves" | "nice_to_haves"> & { must_haves: string; nice_to_haves: string };
const toJobRow = (r: RawJobRow): JobRow => ({ ...r, must_haves: JSON.parse(r.must_haves), nice_to_haves: JSON.parse(r.nice_to_haves) });

export function getJobs(db: DB): JobRow[] {
  return (db.prepare(`SELECT ${JOB_COLS} FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.status = 'open' ORDER BY j.opened_at ASC, j.id ASC`).all() as RawJobRow[]).map(
    toJobRow,
  );
}

export function getJob(db: DB, id: number): JobRow | undefined {
  const r = db.prepare(`SELECT ${JOB_COLS} FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = ?`).get(id) as RawJobRow | undefined;
  return r && toJobRow(r);
}

export function insertJob(
  db: DB,
  j: { client_id: number; title: string; description: string; location: string; comp: string; opened_at: string; must_haves?: string[]; nice_to_haves?: string[]; seeded?: boolean },
): number {
  const { id } = db
    .prepare(
      `INSERT INTO jobs (client_id, title, description, location, comp, opened_at, must_haves, nice_to_haves, seeded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      j.client_id,
      j.title,
      j.description,
      j.location,
      j.comp,
      j.opened_at,
      JSON.stringify(j.must_haves ?? []),
      JSON.stringify(j.nice_to_haves ?? []),
      j.seeded ? 1 : 0,
    ) as { id: number };
  return id;
}

export function setJobRequirements(db: DB, jobId: number, must_haves: string[], nice_to_haves: string[]): void {
  db.prepare("UPDATE jobs SET must_haves = ?, nice_to_haves = ? WHERE id = ?").run(JSON.stringify(must_haves), JSON.stringify(nice_to_haves), jobId);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
const PIPE_COLS = "id, job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated, rejected_by, reject_reason";
type RawPipeRow = Omit<PipelineRow, "evidence" | "gaps"> & { evidence: string | null; gaps: string | null };
const toPipeRow = (r: RawPipeRow): PipelineRow => ({
  ...r,
  evidence: r.evidence ? JSON.parse(r.evidence) : null,
  gaps: r.gaps ? JSON.parse(r.gaps) : null,
});

export function pipelineFor(db: DB, jobId: number): PipelineRow[] {
  return (db.prepare(`SELECT ${PIPE_COLS} FROM pipeline WHERE job_id = ? ORDER BY fit DESC NULLS LAST, id ASC`).all(jobId) as RawPipeRow[]).map(toPipeRow);
}

export function pipelineForCandidate(db: DB, candidateId: number): (PipelineRow & { job_title: string; client: string })[] {
  return db
    .prepare(
      `SELECT p.${PIPE_COLS.split(", ").join(", p.")}, j.title AS job_title, c.name AS client
       FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id
       WHERE p.candidate_id = ? ORDER BY p.stage_updated DESC`,
    )
    .all(candidateId)
    .map((r) => {
      const row = r as RawPipeRow & { job_title: string; client: string };
      return { ...toPipeRow(row), job_title: row.job_title, client: row.client };
    });
}

export function addToPipeline(
  db: DB,
  p: {
    job_id: number;
    candidate_id: number;
    stage: Stage;
    origin: Origin;
    fit?: number | null;
    why?: string | null;
    evidence?: string[] | null;
    gaps?: string[] | null;
    next_step?: string | null;
    next_step_date?: string | null;
    stage_updated?: string;
  },
): number {
  const { id } = db
    .prepare(
      `INSERT INTO pipeline (job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, date('now')))
       ON CONFLICT(job_id, candidate_id) DO UPDATE SET stage = excluded.stage, origin = excluded.origin RETURNING id`,
    )
    .get(
      p.job_id,
      p.candidate_id,
      p.stage,
      p.origin,
      p.fit ?? null,
      p.why ?? null,
      p.evidence ? JSON.stringify(p.evidence) : null,
      p.gaps ? JSON.stringify(p.gaps) : null,
      p.next_step ?? null,
      p.next_step_date ?? null,
      p.stage_updated ?? null,
    ) as { id: number };
  return id;
}

export function setStage(db: DB, pipelineId: number, stage: Stage, opts: { rejected_by?: RejectedBy; reject_reason?: string } = {}): void {
  db.prepare("UPDATE pipeline SET stage = ?, stage_updated = date('now'), rejected_by = ?, reject_reason = ? WHERE id = ?").run(
    stage,
    opts.rejected_by ?? null,
    opts.reject_reason ?? null,
    pipelineId,
  );
}

export function getPipelineRow(db: DB, id: number): PipelineRow | undefined {
  const r = db.prepare(`SELECT ${PIPE_COLS} FROM pipeline WHERE id = ?`).get(id) as RawPipeRow | undefined;
  return r && toPipeRow(r);
}

// Every job a candidate is in a pipeline for, other than the given one — for the repeat-applicant flag.
export function otherPipelinesFor(db: DB, candidateId: number, excludeJobId: number): { job_title: string; client: string }[] {
  return db
    .prepare(
      `SELECT j.title AS job_title, c.name AS client FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id
       WHERE p.candidate_id = ? AND p.job_id != ? ORDER BY p.stage_updated DESC`,
    )
    .all(candidateId, excludeJobId) as { job_title: string; client: string }[];
}

// Unions past submissions with active pipeline rows, mapped to the Submission shape,
// so flagsFor can show "Already in process with X (job, stage)" from real pipeline data.
// excludeJobId leaves out a candidate's own row on the job currently being viewed, so a
// candidate's pipeline entry doesn't show up as a "flag" about themselves.
export function clientHistory(db: DB, candidateIds: number[], excludeJobId?: number): Map<number, Submission[]> {
  const out = new Map<number, Submission[]>();
  if (!candidateIds.length) return out;
  const ids = candidateIds.map(() => "?").join(",");
  const subRows = db
    .prepare(
      `SELECT s.candidate_id, c.name AS client, s.job_title, s.stage, s.note, s.date
       FROM submissions s JOIN clients c ON c.id = s.client_id
       WHERE s.candidate_id IN (${ids}) ORDER BY s.date DESC`,
    )
    .all(...candidateIds) as (Submission & { candidate_id: number })[];
  // A recruiter-side rejection (screened out before ever reaching the client) shouldn't
  // surface as a "rejected by <client>" flag elsewhere -- only client rejections should.
  const pipeRows = db
    .prepare(
      `SELECT p.candidate_id, c.name AS client, j.title AS job_title, p.stage, coalesce(p.reject_reason, '') AS note, p.stage_updated AS date
       FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id
       WHERE p.candidate_id IN (${ids}) AND p.job_id != ? AND NOT (p.stage = 'rejected' AND coalesce(p.rejected_by, '') != 'client')
       ORDER BY p.stage_updated DESC`,
    )
    .all(...candidateIds, excludeJobId ?? -1) as (Submission & { candidate_id: number })[];
  for (const { candidate_id, ...s } of [...subRows, ...pipeRows]) out.set(candidate_id, [...(out.get(candidate_id) ?? []), s]);
  return out;
}

// ── Dashboard queries ─────────────────────────────────────────────────────────
// Listed in urgency order; needsAttention sorts by it.
export const ATTENTION_KINDS = ["overdue", "interview_today", "interview_tomorrow", "stale_submission", "offer_waiting", "no_contact"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export type AttentionItem = {
  candidate_id: number;
  candidate: string;
  job_id: number;
  job_title: string;
  client: string;
  kind: AttentionKind;
  reason: string;
  due: string;
  next_step: string | null;
};

export function needsAttention(db: DB, todayStr: string): AttentionItem[] {
  const rows = db
    .prepare(
      `SELECT p.candidate_id, ca.name AS candidate, p.job_id, j.title AS job_title, cl.name AS client, p.stage, p.next_step, p.next_step_date, p.stage_updated, ca.last_contacted
       FROM pipeline p
       JOIN jobs j ON j.id = p.job_id
       JOIN clients cl ON cl.id = j.client_id
       JOIN candidates ca ON ca.id = p.candidate_id
       WHERE p.stage NOT IN ('rejected', 'placed')`,
    )
    .all() as {
    candidate_id: number;
    candidate: string;
    job_id: number;
    job_title: string;
    client: string;
    stage: Stage;
    next_step: string | null;
    next_step_date: string | null;
    stage_updated: string;
    last_contacted: string | null;
  }[];
  const days = (d: string) => Math.round((Date.parse(todayStr) - Date.parse(d)) / 86_400_000);
  const items: AttentionItem[] = [];
  for (const r of rows) {
    const base = { candidate_id: r.candidate_id, candidate: r.candidate, job_id: r.job_id, job_title: r.job_title, client: r.client, next_step: r.next_step };
    if (r.next_step_date && days(r.next_step_date) > 0) items.push({ ...base, kind: "overdue", reason: "Overdue", due: `${days(r.next_step_date)}d overdue` });
    else if (r.stage === "submitted" && days(r.stage_updated) > 10) items.push({ ...base, kind: "stale_submission", reason: "No client reply", due: `Submitted ${days(r.stage_updated)}d ago` });
    else if (r.stage === "offer" && days(r.stage_updated) > 5) items.push({ ...base, kind: "offer_waiting", reason: "Offer pending", due: `Sent ${days(r.stage_updated)}d ago` });
    else if (r.stage === "client_interview" && r.next_step_date && days(r.next_step_date) >= -1 && days(r.next_step_date) <= 0)
      items.push(days(r.next_step_date) === 0 ? { ...base, kind: "interview_today", reason: "Interview", due: "Today" } : { ...base, kind: "interview_tomorrow", reason: "Interview", due: "Tomorrow" });
    // "In-process" for this rule means past the initial application -- a brand-new sourced or
    // applied candidate hasn't been engaged with yet, so a stale last_contacted isn't a lapse.
    else if ((r.stage === "screen" || r.stage === "submitted" || r.stage === "client_interview" || r.stage === "offer") && (!r.last_contacted || days(r.last_contacted) >= 14))
      items.push({ ...base, kind: "no_contact", reason: "Gone quiet", due: r.last_contacted ? `Last spoke ${days(r.last_contacted)}d ago` : "Never contacted" });
  }
  return items.sort((a, b) => ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind));
}

export type PipelineCounts = { job_id: number; job_title: string; client: string; counts: Record<Stage, number> };

export function applicantStats(db: DB): Map<number, { total: number; strong: number }> {
  const rows = db
    .prepare(`SELECT job_id, count(*) AS total, sum(CASE WHEN fit >= ${STRONG_FIT} THEN 1 ELSE 0 END) AS strong FROM pipeline WHERE origin = 'applied' GROUP BY job_id`)
    .all() as { job_id: number; total: number; strong: number }[];
  return new Map(rows.map((r) => [r.job_id, { total: r.total, strong: r.strong }]));
}

export function pipelineByJob(db: DB): PipelineCounts[] {
  const jobs = getJobs(db);
  const rows = db.prepare("SELECT job_id, stage, count(*) AS n FROM pipeline GROUP BY job_id, stage").all() as { job_id: number; stage: Stage; n: number }[];
  const byJob = new Map<number, Record<Stage, number>>();
  for (const r of rows) {
    const counts = byJob.get(r.job_id) ?? (Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>);
    counts[r.stage] = r.n;
    byJob.set(r.job_id, counts);
  }
  return jobs.map((j) => ({ job_id: j.id, job_title: j.title, client: j.client, counts: byJob.get(j.id) ?? (Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>) }));
}

export function todayTiles(db: DB, todayStr: string) {
  const openJobs = (db.prepare("SELECT count(*) AS n FROM jobs WHERE status = 'open'").get() as { n: number }).n;
  const clientInterviews = (db.prepare("SELECT count(*) AS n FROM pipeline WHERE stage = 'client_interview'").get() as { n: number }).n;
  const waitingOnFeedback = (db.prepare("SELECT count(*) AS n FROM pipeline WHERE stage = 'submitted'").get() as { n: number }).n;
  const newApplicants = (db.prepare("SELECT count(*) AS n FROM pipeline WHERE stage = 'applied' AND stage_updated >= date(?, '-7 days')").get(todayStr) as { n: number }).n;
  const strongApplicants = (
    db.prepare("SELECT count(*) AS n FROM pipeline WHERE stage = 'applied' AND stage_updated >= date(?, '-7 days') AND fit >= ?").get(todayStr, STRONG_FIT) as { n: number }
  ).n;
  return { openJobs, clientInterviews, waitingOnFeedback, newApplicants, strongApplicants };
}

// ── meta ──────────────────────────────────────────────────────────────────────
export function getMeta(db: DB, key: string): string | undefined {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
