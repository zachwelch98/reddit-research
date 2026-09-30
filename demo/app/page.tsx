import { Briefcase, CalendarClock, CircleAlert, Handshake, Hourglass, Inbox, PhoneMissed, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AutoSelect, CandidateLink, LinkTr, SelectTr } from "@/components/preview-link";
import { Avatar, BAR_LABEL, BAR_STAGES, ClientLogo, StageBar, barCount } from "@/components/ui";
import { getDb, today } from "@/lib/db";
import { applicantStats, needsAttention, pipelineByJob, todayTiles, type AttentionKind } from "@/lib/store";

export const dynamic = "force-dynamic";

const REASON: Record<AttentionKind, { Icon: LucideIcon; tone: string }> = {
  overdue: { Icon: CircleAlert, tone: "red" },
  interview_today: { Icon: CalendarClock, tone: "blue" },
  interview_tomorrow: { Icon: CalendarClock, tone: "gray" },
  stale_submission: { Icon: Hourglass, tone: "amber" },
  offer_waiting: { Icon: Handshake, tone: "amber" },
  no_contact: { Icon: PhoneMissed, tone: "amber" },
};

export default function TodayPage() {
  const db = getDb();
  const now = today();
  const tiles = todayTiles(db, now);
  const attention = needsAttention(db, now);
  const byJob = pipelineByJob(db);
  const stats = applicantStats(db);
  const dateLabel = new Date(`${now}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <AutoSelect id={attention[0]?.candidate_id ?? null} />
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="meta-row">
            <span>{dateLabel}</span>
            <span>{attention.length} things need you</span>
          </div>
        </div>
      </div>

      <div className="kpis">
        <Link href="/jobs" className="kpi">
          <div className="kpi-label">
            <Briefcase size={13} /> Open jobs
          </div>
          <div className="kpi-n">{tiles.openJobs}</div>
        </Link>
        <div className="kpi">
          <div className="kpi-label">
            <Users size={13} /> In client interviews
          </div>
          <div className="kpi-n">{tiles.clientInterviews}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Hourglass size={13} /> Awaiting client feedback
          </div>
          <div className="kpi-n">{tiles.waitingOnFeedback}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            <Inbox size={13} /> New applicants this week
          </div>
          <div className="kpi-n">{tiles.newApplicants}</div>
          {tiles.strongApplicants > 0 && (
            <div className="kpi-sub">
              <b>{tiles.strongApplicants}</b> strong fits
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <span>
            Needs your attention <span className="muted num">{attention.length}</span>
          </span>
        </div>
        <div className="table-wrap">
          <table className="table fixed">
            <thead>
              <tr>
                <th style={{ width: 156 }}>Reason</th>
                <th style={{ width: "30%" }}>Candidate</th>
                <th>Role</th>
                <th className="ta-r" style={{ width: 150 }}>When</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((a) => {
                const { Icon, tone } = REASON[a.kind];
                return (
                  <SelectTr key={`${a.job_id}-${a.candidate_id}`} id={a.candidate_id}>
                    <td>
                      <span className={`reason ${tone}`}>
                        <Icon size={14} /> {a.reason}
                      </span>
                    </td>
                    <td>
                      <span className="person">
                        <Avatar name={a.candidate} />
                        <CandidateLink id={a.candidate_id} className="nm">
                          {a.candidate}
                        </CandidateLink>
                      </span>
                    </td>
                    <td>
                      <Link href={`/jobs/${a.job_id}`} className="client" style={{ maxWidth: "100%" }}>
                        <ClientLogo name={a.client} />
                        <span className="ellipsis">
                          {a.job_title} <span className="muted">· {a.client}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="ta-r muted num" title={a.next_step ?? undefined}>
                      {a.due}
                    </td>
                  </SelectTr>
                );
              })}
              {!attention.length && (
                <tr>
                  <td colSpan={4} className="empty-row">
                    Nothing needs you right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Pipeline by job</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th style={{ width: "22%" }}>Pipeline</th>
                {BAR_STAGES.slice(0, 5).map((s) => (
                  <th key={s} className="ta-r">
                    {BAR_LABEL[s]}
                  </th>
                ))}
                <th className="ta-r">Applicants</th>
              </tr>
            </thead>
            <tbody>
              {byJob.map((j) => {
                const s = stats.get(j.job_id) ?? { total: 0, strong: 0 };
                return (
                  <LinkTr key={j.job_id} href={`/jobs/${j.job_id}`}>
                    <td>
                      <div className="person">
                        <ClientLogo name={j.client} size={24} />
                        <div>
                          <Link href={`/jobs/${j.job_id}`} className="nm">
                            {j.job_title}
                          </Link>
                          <div className="sub">{j.client}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StageBar counts={j.counts} />
                    </td>
                    {BAR_STAGES.slice(0, 5).map((st) => (
                      <td key={st} className={`ta-r num${barCount(j.counts, st) ? "" : " muted"}`}>
                        {barCount(j.counts, st) || "–"}
                      </td>
                    ))}
                    <td className="ta-r num" style={{ whiteSpace: "nowrap" }}>
                      {s.total}
                      {s.strong > 0 && <span className="muted"> · {s.strong} strong</span>}
                    </td>
                  </LinkTr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
