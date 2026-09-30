import Link from "next/link";
import { NewJobOrder } from "@/components/new-job-order";
import { PreviewSlot } from "@/components/preview";
import { LinkTr } from "@/components/preview-link";
import { ClientLogo, StageBar, daysSince } from "@/components/ui";
import { getDb, today } from "@/lib/db";
import { applicantStats, getJobs, pipelineByJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  const db = getDb();
  const now = today();
  const jobs = getJobs(db);
  const stats = applicantStats(db);
  const counts = new Map(pipelineByJob(db).map((c) => [c.job_id, c.counts]));
  const clients = (db.prepare("SELECT name FROM clients ORDER BY name").all() as { name: string }[]).map((c) => c.name);
  const clientCount = new Set(jobs.map((j) => j.client)).size;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Open jobs</h1>
          <div className="meta-row">
            <span>
              {jobs.length} roles across {clientCount} clients
            </span>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Location</th>
              <th className="ta-r">Open</th>
              <th style={{ width: "24%" }}>Pipeline</th>
              <th className="ta-r">In process</th>
              <th className="ta-r">Applicants</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const s = stats.get(j.id) ?? { total: 0, strong: 0 };
              const c = counts.get(j.id);
              const inProcess = c ? c.screen + c.submitted + c.client_interview + c.offer : 0;
              return (
                <LinkTr key={j.id} href={`/jobs/${j.id}`}>
                  <td>
                    <div className="person">
                      <ClientLogo name={j.client} size={24} />
                      <div>
                        <Link href={`/jobs/${j.id}`} className="nm">
                          {j.title}
                        </Link>
                        <div className="sub">{j.client}</div>
                      </div>
                    </div>
                  </td>
                  <td className="muted ellipsis" style={{ maxWidth: 200 }}>
                    {j.location || "—"}
                  </td>
                  <td className="ta-r muted num">{daysSince(j.opened_at, now)}d</td>
                  <td>{c ? <StageBar counts={c} /> : <span className="muted small">No one yet</span>}</td>
                  <td className="ta-r num">{inProcess}</td>
                  <td className="ta-r num">
                    {s.total}
                    {s.strong > 0 && <span className="muted"> · {s.strong} strong</span>}
                  </td>
                </LinkTr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PreviewSlot>
        <NewJobOrder clients={clients} />
      </PreviewSlot>
    </>
  );
}
