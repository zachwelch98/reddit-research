// npm run reset — undo a recording take:
//  - restores `pipeline` from the `pipeline_seed` snapshot
//  - deletes candidates added today through the app (resume uploads) and their embeddings
//  - deletes jobs created today through "New job order" (seeded = 0)
//  - re-bases every date (pipeline, pipeline_seed, candidates.last_contacted/created_at, submissions)
//    by (today - meta.seed_date), so "interview today" stays true on the day you record
import { getMeta, openDb, setMeta } from "../lib/store";

const db = openDb("data/demo.db");
const todayStr = new Date().toISOString().slice(0, 10);

db.transaction(() => {
  const addedToday = (db.prepare("SELECT id FROM candidates WHERE source = 'Resume upload' AND created_at = date('now')").all() as { id: number }[]).map((r) => r.id);
  for (const id of addedToday) {
    db.prepare("DELETE FROM vec_candidates WHERE candidate_id = ?").run(BigInt(id));
    db.prepare("DELETE FROM candidates WHERE id = ?").run(id);
  }

  const removedJobs = db.prepare("DELETE FROM jobs WHERE seeded = 0").run().changes;

  db.prepare("DELETE FROM pipeline").run();
  db.exec(`
    INSERT INTO pipeline (id, job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated, rejected_by, reject_reason)
    SELECT id, job_id, candidate_id, stage, origin, fit, why, evidence, gaps, next_step, next_step_date, stage_updated, rejected_by, reject_reason FROM pipeline_seed
  `);

  const seedDate = getMeta(db, "seed_date") ?? todayStr;
  const offsetDays = Math.round((Date.parse(todayStr) - Date.parse(seedDate)) / 86_400_000);
  if (offsetDays !== 0) {
    const mod = `${offsetDays >= 0 ? "+" : ""}${offsetDays} days`;
    for (const table of ["pipeline", "pipeline_seed"] as const) {
      db.prepare(`UPDATE ${table} SET next_step_date = date(next_step_date, ?) WHERE next_step_date IS NOT NULL`).run(mod);
      db.prepare(`UPDATE ${table} SET stage_updated = date(stage_updated, ?)`).run(mod);
    }
    db.prepare("UPDATE candidates SET last_contacted = date(last_contacted, ?) WHERE last_contacted IS NOT NULL").run(mod);
    db.prepare("UPDATE candidates SET created_at = date(created_at, ?)").run(mod);
    db.prepare("UPDATE submissions SET date = date(date, ?)").run(mod);
  }
  setMeta(db, "seed_date", todayStr);

  console.log(`Removed ${addedToday.length} candidate(s) added today, ${removedJobs} job(s) not from seeding. Re-based dates by ${offsetDays >= 0 ? "+" : ""}${offsetDays}d.`);
})();

db.close();
