import { parseResume, rankForJob } from "@/lib/claude";
import { getDb, today } from "@/lib/db";
import { embedText } from "@/lib/profile";
import { addToPipeline, clientHistory, findByEmailOrName, getCandidate, getCandidates, getJob, insertCandidate, pipelineFor } from "@/lib/store";
import { toCard } from "@/lib/view";
import { embedOne } from "@/lib/voyage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const jobIdRaw = form.get("jobId");
  const jobId = typeof jobIdRaw === "string" && jobIdRaw ? Number(jobIdRaw) : null;
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return Response.json({ error: "Upload a PDF resume." }, { status: 400 });
  }
  try {
    const profile = await parseResume(Buffer.from(await file.arrayBuffer()));
    const db = getDb();
    const existing = findByEmailOrName(db, profile.email, profile.name);
    if (existing) {
      return Response.json({ duplicate: true, card: toCard(getCandidate(db, existing.id)!), profile });
    }
    const now = today();
    const id = insertCandidate(
      db,
      { profile, notes: "", source: "Resume upload", last_contacted: now, created_at: now },
      await embedOne(embedText(profile), "document"),
    );

    let ranked: { fit: number; why: string; evidence: string[]; gaps: string[] } | null = null;
    let pipelineId: number | null = null;
    if (jobId != null && Number.isInteger(jobId)) {
      const job = getJob(db, jobId);
      if (job) {
        // Rank the new resume together with the job's current top 5 applicants for reference,
        // but store only the new candidate's score.
        const top5 = pipelineFor(db, jobId).filter((p) => p.origin === "applied").slice(0, 5);
        const refRows = getCandidates(db, top5.map((p) => p.candidate_id));
        const newRow = getCandidate(db, id)!;
        const rows = [...refRows, newRow];
        const history = clientHistory(db, rows.map((r) => r.id));
        const list = await rankForJob(job.description, job.client, rows.map((row) => ({ row, history: history.get(row.id) ?? [] })), now, rows.length);
        const mine = list.matches.find((m) => m.id === id);
        ranked = mine ? { fit: mine.fit, why: mine.why, evidence: mine.evidence, gaps: mine.gaps } : null;
        pipelineId = addToPipeline(db, {
          job_id: jobId,
          candidate_id: id,
          stage: "applied",
          origin: "applied",
          fit: ranked?.fit ?? null,
          why: ranked?.why ?? null,
          evidence: ranked?.evidence ?? null,
          gaps: ranked?.gaps ?? null,
        });
      }
    }

    return Response.json({ duplicate: false, card: toCard(getCandidate(db, id)!), profile, ranked, pipelineId });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
