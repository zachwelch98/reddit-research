import { Banknote, Briefcase, Clock, GraduationCap, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewSlot } from "@/components/preview";
import { Avatar, ClientLogo, PageHeader, StagePill } from "@/components/ui";
import { getDb, today } from "@/lib/db";
import { clientHistory, getCandidate, pipelineForCandidate } from "@/lib/store";
import { contactedLabel } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const c = Number.isInteger(id) ? getCandidate(db, id) : undefined;
  if (!c) notFound();
  const p = c.profile;
  const history = clientHistory(db, [id]).get(id) ?? [];
  const pipelines = pipelineForCandidate(db, id);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Talent pool", href: "/pool" }, { label: p.name }]}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
            <Avatar name={p.name} size={36} />
            {p.name}
          </span>
        }
        meta={
          <>
            <span>{p.headline}</span>
          </>
        }
      />

      <div className="grid2">
        <div>
          <div className="card">
            <div className="section-title">Summary</div>
            <p className="pv-text" style={{ fontSize: 13.5 }}>
              {p.summary}
            </p>
          </div>
          <div className="card">
            <div className="section-title">
              Experience <span className="muted">{p.experience.length} roles</span>
            </div>
            {p.experience.map((e) => (
              <div key={`${e.company}-${e.start}`} className="exp">
                <div className="row">
                  <b style={{ fontWeight: 600 }}>
                    {e.title} · {e.company}
                  </b>
                  <span className="muted small num">
                    {e.start} – {e.end}
                  </span>
                </div>
                <ul>
                  {e.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="card">
            <div className="pv-facts" style={{ marginTop: 0 }}>
              <div>
                <Briefcase size={14} /> {p.current_title} · {p.current_company}
              </div>
              <div>
                <MapPin size={14} /> {p.location} · {p.work_pref}
              </div>
              <div>
                <Clock size={14} /> {contactedLabel(c.last_contacted, today())}
              </div>
              <div>
                <Banknote size={14} /> {p.desired_comp}
              </div>
              <div>
                <GraduationCap size={14} /> <span className="ellipsis">{p.education}</span>
              </div>
              <div>
                <Mail size={14} /> <span className="ellipsis">{p.email}</span>
              </div>
              <div>
                <Phone size={14} /> {p.phone}
              </div>
            </div>
          </div>
          {c.notes && (
            <div className="card">
              <div className="section-title">Your notes</div>
              <div className="notes">{c.notes}</div>
            </div>
          )}
          <div className="card">
            <div className="section-title">Skills</div>
            <div className="tags" style={{ marginTop: 0 }}>
              {p.skills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PreviewSlot>
        <div className="pv">
          <div className="pv-h">
            Pipelines <span className="muted">{pipelines.length}</span>
          </div>
          <div className="stack">
            {pipelines.length ? (
              pipelines.map((pl) => (
                <div key={pl.id} className="mini-row">
                  <Link href={`/jobs/${pl.job_id}`} className="client" style={{ minWidth: 0 }}>
                    <ClientLogo name={pl.client} />
                    <span className="ellipsis">
                      {pl.job_title} <span className="muted">· {pl.client}</span>
                    </span>
                  </Link>
                  <StagePill stage={pl.stage} />
                </div>
              ))
            ) : (
              <span className="muted small">Not in any pipeline yet.</span>
            )}
          </div>
          <div className="pv-sec">
            <div className="pv-h">History</div>
            <div className="stack">
              {history.length ? (
                history.map((h, i) => (
                  <div key={`${h.client}-${h.job_title}-${h.date}-${i}`} className="small">
                    <div className="mini-row">
                      <span className="client">
                        <ClientLogo name={h.client} />
                        <span className="ellipsis">{h.job_title}</span>
                      </span>
                      <span className="muted num">{h.date}</span>
                    </div>
                    <div className="muted" style={{ marginLeft: 25 }}>
                      {h.stage.replace("_", " ")}
                      {h.note ? `: ${h.note}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <span className="muted small">No submissions yet.</span>
              )}
            </div>
          </div>
        </div>
      </PreviewSlot>
    </>
  );
}
