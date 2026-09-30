// npm run seed:pipeline
// Rebuilds only `jobs` and `pipeline` against the existing candidate pool (no candidate regeneration,
// no re-embedding). Ranks each job's applicants once with Claude so fit/why/evidence/gaps are stored
// on the rows and the job page loads instantly on camera. Snapshots pipeline -> pipeline_seed so
// `npm run reset` can restore between takes.
import { rankForJob } from "../lib/ai";
import { addToPipeline, clientHistory, getCandidates, getMeta, insertJob, nearest, openDb, setJobRequirements, setMeta, type Stage } from "../lib/store";
import { embedOne } from "../lib/voyage";
import { config } from "./seed-config";

const DB_FILE = "data/demo.db";
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(today.getTime() - n * 86_400_000));
const daysFromNow = (n: number) => iso(new Date(today.getTime() + n * 86_400_000));

// Deterministic randomness so re-seeding gives the same layout.
let seedN = 3033;
const rand = () => {
  seedN = (seedN + 0x6d2b79f5) | 0;
  let t = Math.imul(seedN ^ (seedN >>> 15), 1 | seedN);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const ACTIVE_STAGES: Stage[] = ["screen", "submitted", "client_interview", "offer"];

function nextStepFor(stage: Stage, name: string, client: string): string | null {
  switch (stage) {
    case "sourced": return `Reach out to ${name}`;
    case "applied": return `Review ${name}'s application`;
    case "screen": return `Schedule a screen with ${name}`;
    case "submitted": return `Chase ${client} for feedback on ${name}`;
    case "client_interview": return `Prep ${name} for the interview with ${client}`;
    case "offer": return `Follow up with ${name} on the offer`;
    default: return null;
  }
}

async function main() {
  const db = openDb(DB_FILE);

  log("Clearing jobs, pipeline and pipeline_seed…");
  db.exec("DELETE FROM pipeline; DELETE FROM pipeline_seed; DELETE FROM jobs;");

  const clientIds = new Map((db.prepare("SELECT id, name FROM clients").all() as { id: number; name: string }[]).map((c) => [c.name, c.id]));
  const allCandidateIds = (db.prepare("SELECT id FROM candidates").all() as { id: number }[]).map((r) => r.id);
  const names = new Map((db.prepare("SELECT id, name FROM candidates").all() as { id: number; name: string }[]).map((r) => [r.id, r.name]));

  // Pick up whichever candidates seed.ts planted as "rejected by Cobalt Pay" and "already
  // interviewing with Cobalt Pay". The interviewing row is replaced by a real pipeline row below,
  // so both ids are remembered in meta to keep re-runs working.
  const cobaltPayId = clientIds.get(config.demoClient)!;
  const plant = (key: string, stage: string): { candidate_id: number } | undefined => {
    const saved = getMeta(db, key);
    if (saved) return { candidate_id: Number(saved) };
    const row = db.prepare("SELECT candidate_id FROM submissions WHERE client_id = ? AND stage = ? ORDER BY date DESC LIMIT 1").get(cobaltPayId, stage) as
      | { candidate_id: number }
      | undefined;
    if (row) setMeta(db, key, String(row.candidate_id));
    return row;
  };
  const rejectedPlant = plant("plant_rejected", "rejected");
  const interviewingPlant = plant("plant_interviewing", "interviewing");

  // ── 1. Create the jobs ───────────────────────────────────────────────────
  const jobIds = config.jobs.map((jd) => {
    const clientId = clientIds.get(jd.client);
    if (!clientId) throw new Error(`Unknown client in seed-config.jobs: ${jd.client}`);
    return insertJob(db, {
      client_id: clientId,
      title: jd.title,
      description: jd.description,
      location: jd.location,
      comp: jd.comp,
      opened_at: daysAgo(20 + Math.floor(rand() * 60)),
      seeded: true,
    });
  });
  const cobaltSDEJobId = jobIds[0]!; // Senior Data Engineer
  const cobaltAEJobId = jobIds[1]!; // Analytics Engineer
  log(`Created ${jobIds.length} jobs`);

  // ── 2. Per job: active pipeline + applicant pool (ids only, not yet ranked) ──
  type ActiveRow = { jobId: number; candidateId: number; stage: Stage };
  const activeRows: ActiveRow[] = [];
  const applicantsByJob = new Map<number, number[]>();

  for (let ji = 0; ji < config.jobs.length; ji++) {
    const jd = config.jobs[ji]!;
    const jobId = jobIds[ji]!;
    const isCobaltSDE = jobId === cobaltSDEJobId;

    const hits = nearest(db, await embedOne(jd.description, "query"), 60);
    const activeCount = isCobaltSDE ? 9 : 6 + Math.floor(rand() * 4); // Cobalt SDE: exactly 9, so good fits start at rank 10 (Q17)
    const activeIds = hits.slice(0, activeCount).map((h) => h.id);
    const usedInJob = new Set(activeIds);

    for (const id of activeIds) activeRows.push({ jobId, candidateId: id, stage: pick(ACTIVE_STAGES) });

    const goodFitPool = hits.slice(activeCount, activeCount + 16).map((h) => h.id);
    const goodFits = shuffle(goodFitPool).slice(0, 4);
    for (const id of goodFits) usedInJob.add(id);

    const nearIds = new Set(hits.map((h) => h.id));
    const farPool = shuffle(allCandidateIds.filter((id) => !nearIds.has(id) && !usedInJob.has(id)));
    const unrelated = farPool.slice(0, 8);
    for (const id of unrelated) usedInJob.add(id);

    applicantsByJob.set(jobId, [...goodFits, ...unrelated]);
    log(`  ${jd.client} — ${jd.title}: ${activeCount} active, ${goodFits.length + unrelated.length} applicants`);
  }

  // ── 3. Cobalt Pay specifics: repeat applicant, previously-rejected applicant, in-process flag ──
  // A candidate must play exactly one role (active-pipeline row XOR applicant row) within a given
  // job -- the two share a (job_id, candidate_id) unique key, so placing someone in both silently
  // clobbers the first insert's stage/origin via the upsert. These helpers enforce that exclusivity
  // for the candidates we're about to force into a specific role.
  const removeFromApplicants = (jobId: number, candidateId: number) => {
    const arr = applicantsByJob.get(jobId);
    if (!arr) return;
    const i = arr.indexOf(candidateId);
    if (i >= 0) arr.splice(i, 1);
  };
  const removeFromActive = (jobId: number, candidateId: number) => {
    for (let i = activeRows.length - 1; i >= 0; i--) {
      if (activeRows[i]!.jobId === jobId && activeRows[i]!.candidateId === candidateId) activeRows.splice(i, 1);
    }
  };

  // The in-process plant becomes a real pipeline row on the Analytics Engineer job, so its legacy
  // submissions row would duplicate it. The rejected plant keeps its submissions row: that past
  // rejection is what flags him when he applies to the Senior Data Engineer job.
  if (interviewingPlant) db.prepare("DELETE FROM submissions WHERE candidate_id = ? AND client_id = ? AND stage = 'interviewing'").run(interviewingPlant.candidate_id, cobaltPayId);

  const sdeApplicants = applicantsByJob.get(cobaltSDEJobId)!;
  const aeApplicants = applicantsByJob.get(cobaltAEJobId)!;
  // Avoid picking either special-cased candidate as the repeat applicant -- they each need to
  // play their own distinct role rather than doubling up as the repeat-applicant demo too.
  const reserved = new Set([rejectedPlant?.candidate_id, interviewingPlant?.candidate_id].filter((x): x is number => x != null));
  const repeatApplicantId = sdeApplicants.find((id) => !reserved.has(id)) ?? sdeApplicants[0]!;
  removeFromActive(cobaltAEJobId, repeatApplicantId);
  if (!aeApplicants.includes(repeatApplicantId)) aeApplicants.push(repeatApplicantId);

  if (rejectedPlant) {
    removeFromActive(cobaltSDEJobId, rejectedPlant.candidate_id);
    if (!sdeApplicants.includes(rejectedPlant.candidate_id)) sdeApplicants.push(rejectedPlant.candidate_id);
  }
  if (interviewingPlant) {
    // Keep her off the Senior Data Engineer job entirely: she has to surface in its Suggestions
    // tab (with her "already in process" flag) so she can be added live in the recording.
    removeFromActive(cobaltSDEJobId, interviewingPlant.candidate_id);
    removeFromApplicants(cobaltSDEJobId, interviewingPlant.candidate_id);
    removeFromApplicants(cobaltAEJobId, interviewingPlant.candidate_id);
    if (!activeRows.some((r) => r.jobId === cobaltAEJobId && r.candidateId === interviewingPlant.candidate_id)) {
      activeRows.push({ jobId: cobaltAEJobId, candidateId: interviewingPlant.candidate_id, stage: "client_interview" });
    }
  }

  // ── 4. Rank each job's applicants once, store must-haves on the job ─────────
  for (let ji = 0; ji < config.jobs.length; ji++) {
    const jd = config.jobs[ji]!;
    const jobId = jobIds[ji]!;
    const applicantIds = applicantsByJob.get(jobId)!;
    const rows = getCandidates(db, applicantIds);
    log(`Ranking ${rows.length} applicants for ${jd.client} — ${jd.title}…`);
    const history = clientHistory(db, applicantIds);
    const list = await rankForJob(jd.description, jd.client, rows.map((row) => ({ row, history: history.get(row.id) ?? [] })), iso(today), rows.length);
    setJobRequirements(db, jobId, list.job.must_haves, list.job.nice_to_haves);
    const byId = new Map(list.matches.map((m) => [m.id, m]));

    for (const candidateId of applicantIds) {
      const m = byId.get(candidateId);
      addToPipeline(db, {
        job_id: jobId,
        candidate_id: candidateId,
        stage: "applied",
        origin: "applied",
        fit: m?.fit ?? null,
        why: m?.why ?? null,
        evidence: m?.evidence ?? null,
        gaps: m?.gaps ?? null,
        next_step: nextStepFor("applied", names.get(candidateId) ?? "them", jd.client),
        stage_updated: daysAgo(Math.floor(rand() * 5)),
      });
    }
  }

  // ── 5. Insert active-pipeline rows with next-step dates ─────────────────────
  // Guarantee: at least one overdue item, one interview today, one interview tomorrow,
  // one offer waiting on an answer, one submission stale 12+ days (Today page verification).
  let forcedOverdue = false, forcedToday = false, forcedTomorrow = false, forcedOffer = false, forcedStale = false;
  for (const r of shuffle(activeRows)) {
    const jd = config.jobs[jobIds.indexOf(r.jobId)]!;
    const name = names.get(r.candidateId) ?? "them";
    let nextStepDate: string | null = null;
    let stageUpdated = daysAgo(Math.floor(rand() * 10) + 1);

    if (r.stage === "client_interview" && interviewingPlant?.candidate_id === r.candidateId) {
      nextStepDate = daysFromNow(1); // Ana Lucia-equivalent: interview tomorrow
      forcedTomorrow = true;
    } else if (r.stage === "client_interview" && !forcedToday) {
      nextStepDate = daysFromNow(0);
      forcedToday = true;
    } else if (r.stage === "offer" && !forcedOffer) {
      stageUpdated = daysAgo(7);
      forcedOffer = true;
    } else if (r.stage === "offer") {
      stageUpdated = daysAgo(1 + Math.floor(rand() * 4)); // recent offers aren't yet "waiting"
    } else if (r.stage === "submitted" && !forcedStale) {
      stageUpdated = daysAgo(14);
      forcedStale = true;
    } else if ((r.stage === "screen" || r.stage === "client_interview") && !forcedOverdue) {
      nextStepDate = daysAgo(2);
      forcedOverdue = true;
    } else if (r.stage === "client_interview") {
      nextStepDate = daysFromNow(1 + Math.floor(rand() * 5));
    } else if (r.stage === "screen") {
      nextStepDate = daysFromNow(1 + Math.floor(rand() * 4));
    }

    addToPipeline(db, {
      job_id: r.jobId,
      candidate_id: r.candidateId,
      stage: r.stage,
      origin: "sourced",
      next_step: nextStepFor(r.stage, name, jd.client),
      next_step_date: nextStepDate,
      stage_updated: stageUpdated,
    });

    // candidates.last_contacted is a global "last time I talked to this person" field left over
    // from the original pool seed, almost always well over 14 days old. Being in an active
    // pipeline implies a recent conversation, so refresh it.
    db.prepare("UPDATE candidates SET last_contacted = ? WHERE id = ?").run(daysAgo(Math.floor(rand() * 10) + 1), r.candidateId);
  }

  // One deliberately stale contact for the "no contact in 14+ days" attention item: a recently
  // submitted candidate in only one pipeline, so no earlier attention rule claims the row.
  const staleContact = db
    .prepare(
      `SELECT candidate_id FROM pipeline WHERE origin = 'sourced' AND stage = 'submitted' AND stage_updated >= ?
       AND candidate_id IN (SELECT candidate_id FROM pipeline GROUP BY candidate_id HAVING count(*) = 1) ORDER BY id LIMIT 1`,
    )
    .get(daysAgo(10)) as { candidate_id: number } | undefined;
  if (staleContact) db.prepare("UPDATE candidates SET last_contacted = ? WHERE id = ?").run(daysAgo(20), staleContact.candidate_id);
  const forcedStaleContact = !!staleContact;
  if (!forcedOverdue || !forcedToday || !forcedOffer || !forcedStale || !forcedStaleContact) log("Warning: not every 'needs attention' scenario got a guaranteed row this run.");

  // ── 6. Snapshot pipeline -> pipeline_seed, record the seed date ─────────────
  db.exec(`
    INSERT INTO pipeline_seed (id, job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated, rejected_by, reject_reason)
    SELECT id, job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated, rejected_by, reject_reason FROM pipeline
  `);
  setMeta(db, "seed_date", iso(today));

  const counts = db.prepare("SELECT count(*) AS n FROM pipeline").get() as { n: number };
  log(`Done. ${jobIds.length} jobs, ${counts.n} pipeline rows.`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
