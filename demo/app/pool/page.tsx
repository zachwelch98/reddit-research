import { Users } from "lucide-react";
import { Pool } from "@/components/pool";
import { PreviewSlot } from "@/components/preview";
import { getDb, today } from "@/lib/db";
import { recentCandidates } from "@/lib/store";
import { toCard } from "@/lib/view";

export const dynamic = "force-dynamic";

export default function PoolPage() {
  const db = getDb();
  const n = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  const total = n("SELECT count(*) AS n FROM candidates");
  const contactedMonth = n("SELECT count(*) AS n FROM candidates WHERE last_contacted >= date(?, '-30 days')", today());
  const contacted6mo = n("SELECT count(*) AS n FROM candidates WHERE last_contacted >= date(?, '-180 days')", today());
  const inProcess = n("SELECT count(DISTINCT candidate_id) AS n FROM pipeline WHERE stage IN ('screen', 'submitted', 'client_interview', 'offer')");
  const sources = db.prepare("SELECT source, count(*) AS n FROM candidates GROUP BY source ORDER BY n DESC").all() as { source: string; n: number }[];

  return (
    <>
      <Pool total={total} recent={recentCandidates(db).map(toCard)} today={today()} />
      <PreviewSlot>
        <div className="pv">
          <div className="pv-top">
            <span className="logo" style={{ width: 32, height: 32, background: "var(--subtle)", color: "var(--ink-2)" }}>
              <Users size={16} />
            </span>
            <div>
              <div className="pv-name">Your pool</div>
              <div className="pv-headline">Everyone you&apos;ve engaged, searchable in plain English.</div>
            </div>
          </div>
          <div className="pv-sec">
            <div className="stat-grid">
              <div>
                <div className="n">{total}</div>
                <div className="l">Candidates</div>
              </div>
              <div>
                <div className="n">{contactedMonth}</div>
                <div className="l">Contacted in 30 days</div>
              </div>
              <div>
                <div className="n">{contacted6mo}</div>
                <div className="l">Contacted in 6 months</div>
              </div>
              <div>
                <div className="n">{inProcess}</div>
                <div className="l">In process now</div>
              </div>
            </div>
          </div>
          <div className="pv-sec">
            <div className="pv-h">By source</div>
            <div className="stack">
              {sources.map((s) => (
                <div key={s.source} className="mini-row">
                  <span>{s.source}</span>
                  <span className="num muted">{s.n}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 18 }}>
            Select a candidate to see their profile.
          </p>
        </div>
      </PreviewSlot>
    </>
  );
}
