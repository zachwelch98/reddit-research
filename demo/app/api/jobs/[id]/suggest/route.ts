import { rankForJob } from "@/lib/claude";
import { getDb, today } from "@/lib/db";
import { clientHistory, getCandidates, getJob, nearest, otherPipelinesFor, pipelineFor, setJobRequirements } from "@/lib/store";
import { flagsFor, toCard } from "@/lib/view";
import { embedOne } from "@/lib/voyage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGEST = 6; // best matches returned
const CONSIDER = 20; // closest profiles read before excluding people already in this job's pipeline

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jobId = Number((await params).id);
  if (!Number.isInteger(jobId)) return Response.json({ error: "Invalid job." }, { status: 400 });
  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  try {
    const now = today();
    const inPipeline = new Set(pipelineFor(db, jobId).map((p) => p.candidate_id));
    const hits = nearest(db, await embedOne(job.description, "query"), CONSIDER).filter((h) => !inPipeline.has(h.id));
    const rows = getCandidates(db, hits.map((h) => h.id));
    const history = clientHistory(db, rows.map((r) => r.id), jobId);
    const list = await rankForJob(job.description, job.client, rows.map((row) => ({ row, history: history.get(row.id) ?? [] })), now, SUGGEST);
    if (!job.must_haves.length) setJobRequirements(db, jobId, list.job.must_haves, list.job.nice_to_haves);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const matches = list.matches.flatMap((m) => {
      const row = byId.get(m.id);
      if (!row) return []; // ignore any id the model didn't get from us
      const otherJobs = otherPipelinesFor(db, row.id, jobId);
      return [{ ...m, card: toCard(row), flags: flagsFor(row, history.get(row.id) ?? [], job.client, now, otherJobs) }];
    });
    return Response.json({ matches });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
