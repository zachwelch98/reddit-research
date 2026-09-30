import { notFound } from "next/navigation";
import { JobDetail } from "@/components/job-detail";
import { getDb, today } from "@/lib/db";
import { clientHistory, getCandidates, getJob, otherPipelinesFor, pipelineFor } from "@/lib/store";
import { flagsFor, toCard } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const id = Number((await params).id);
  const auto = (await searchParams).auto === "1";
  const db = getDb();
  const job = Number.isInteger(id) ? getJob(db, id) : undefined;
  if (!job) notFound();
  const now = today();
  const pipeline = pipelineFor(db, id);
  const candIds = pipeline.map((p) => p.candidate_id);
  const rows = getCandidates(db, candIds);
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const history = clientHistory(db, candIds, id);
  const entries = pipeline.flatMap((p) => {
    const row = rowsById.get(p.candidate_id);
    if (!row) return [];
    const otherJobs = otherPipelinesFor(db, p.candidate_id, id);
    return [{ pipeline: p, card: toCard(row), flags: flagsFor(row, history.get(p.candidate_id) ?? [], job.client, now, otherJobs) }];
  });
  return <JobDetail job={job} entries={entries} today={now} auto={auto} />;
}
