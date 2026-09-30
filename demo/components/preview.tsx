"use client";
import { ArrowRight, ArrowUpRight, Banknote, Briefcase, Check, ChevronDown, Clock, Mail, MapPin, MousePointerClick, Plus, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PipelineRow } from "@/lib/store";
import { REJECT_REASONS, STAGES, type RejectedBy, type Stage } from "@/lib/stages";
import type { CandidateCard, Flag } from "@/lib/view";
import { useSelectCandidate, useSelectedCandidate } from "./preview-link";
import { Avatar, ClientLogo, FlagBadge, STAGE_NAME, StagePill, fitColor } from "./ui";

export type PipelineEntry = { pipeline: PipelineRow; card: CandidateCard; flags: Flag[] };
export type Match = { id: number; fit: number; why: string; evidence: string[]; gaps: string[]; card: CandidateCard; flags: Flag[] };
export type StageOpts = { rejected_by?: RejectedBy; reject_reason?: string };

// What a job page shares with the pane: fit and flags for its candidates, and the actions on them.
export type JobPreview = {
  jobId: number;
  jobTitle: string;
  lookup: (candidateId: number) => { entry?: PipelineEntry; suggestion?: Match };
  changeStage: (pipelineId: number, stage: Stage, opts?: StageOpts) => void;
  add: (m: Match) => void;
};

type Ctx = { slotEl: HTMLElement | null; setSlotEl: (el: HTMLElement | null) => void; job: JobPreview | null; setJob: (j: JobPreview | null) => void };
const PreviewCtx = createContext<Ctx | null>(null);

// The pane hydrates in its own Suspense boundary, so it can mount after the page. Changing ?c=
// before then makes its first render disagree with the server HTML.
export const usePaneMounted = () => useContext(PreviewCtx)?.slotEl != null;

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [job, setJob] = useState<JobPreview | null>(null);
  const value = useMemo(() => ({ slotEl, setSlotEl, job, setJob }), [slotEl, job]);
  return <PreviewCtx.Provider value={value}>{children}</PreviewCtx.Provider>;
}

export function usePreviewJob(job: JobPreview) {
  const setJob = useContext(PreviewCtx)?.setJob;
  useEffect(() => setJob?.(job), [setJob, job]);
  useEffect(() => () => setJob?.(null), [setJob]);
}

// What the pane shows while no candidate is selected (job summary, pool stats, a form).
export function PreviewSlot({ children }: { children: ReactNode }) {
  const el = useContext(PreviewCtx)?.slotEl;
  return el ? createPortal(children, el) : null;
}

type Detail = {
  id: number;
  name: string;
  headline: string;
  current_title: string;
  current_company: string;
  location: string;
  work_pref: string;
  years_exp: number;
  email: string;
  phone: string;
  summary: string;
  education: string;
  desired_comp: string;
  availability: string;
  skills: string[];
  experience: { title: string; company: string; start: string; end: string; highlights: string[] }[];
  notes: string;
  source: string;
  contacted: string;
  pipelines: { id: number; job_id: number; job_title: string; client: string; stage: Stage; next_step: string | null }[];
};

export function PreviewPane() {
  const ctx = useContext(PreviewCtx)!;
  const id = useSelectedCandidate();
  const select = useSelectCandidate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const hit = id != null && ctx.job ? ctx.job.lookup(id) : {};
  const refreshKey = hit.entry ? `${hit.entry.pipeline.id}:${hit.entry.pipeline.stage}` : "";

  useEffect(() => {
    if (id == null) return;
    let alive = true;
    fetch(`/api/candidates/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Detail | null) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);

  useEffect(() => {
    if (id == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, select]);

  return (
    <aside className={`pane${id != null ? " open" : ""}`}>
      {id == null ? (
        <>
          <div className="pv-slot" ref={ctx.setSlotEl} />
          <div className="pv-empty">
            <MousePointerClick size={22} />
            Select a candidate to see their profile here.
          </div>
        </>
      ) : (
        <CandidateView key={id} id={id} detail={detail?.id === id ? detail : null} hit={hit} job={ctx.job} onClose={() => select(null)} />
      )}
    </aside>
  );
}

function CandidateView({ id, detail, hit, job, onClose }: { id: number; detail: Detail | null; hit: { entry?: PipelineEntry; suggestion?: Match }; job: JobPreview | null; onClose: () => void }) {
  const card = hit.entry?.card ?? hit.suggestion?.card;
  const name = detail?.name ?? card?.name ?? "";
  const p = hit.entry?.pipeline;
  const fit = p?.fit != null ? { fit: p.fit, why: p.why ?? "", evidence: p.evidence ?? [], gaps: p.gaps ?? [] } : hit.suggestion;
  const flags = hit.entry?.flags ?? hit.suggestion?.flags ?? [];

  return (
    <div className="pv">
      <div className="pv-top">
        {name ? <Avatar name={name} size={40} /> : <span className="avatar" style={{ width: 40, height: 40, background: "#e4e4e7" }} />}
        <div style={{ minWidth: 0 }}>
          <div className="pv-name">{name || <span className="skeleton" style={{ display: "block", width: 140, height: 16 }} />}</div>
          <div className="pv-headline">{detail?.headline ?? card?.headline}</div>
        </div>
        <button className="btn ghost icon pv-close" onClick={onClose} title="Close (Esc)" aria-label="Close preview">
          <X size={15} />
        </button>
      </div>

      <div className="pv-facts">
        <div>
          <Briefcase size={14} />
          <span className="ellipsis">{detail ? `${detail.current_title} · ${detail.current_company} · ${detail.years_exp} yrs` : card?.title}</span>
        </div>
        <div>
          <MapPin size={14} />
          <span>
            {detail?.location ?? card?.location} · {detail?.work_pref ?? card?.work_pref}
          </span>
        </div>
        {detail && (
          <>
            <div>
              <Clock size={14} />
              <span>
                {detail.contacted} · {detail.source}
              </span>
            </div>
            <div>
              <Banknote size={14} />
              <span className="ellipsis">{detail.desired_comp}</span>
            </div>
            <div>
              <Mail size={14} />
              <span className="ellipsis">{detail.email}</span>
            </div>
          </>
        )}
      </div>

      {job && (p || hit.suggestion) && (
        <div className="pv-actions">
          {p ? (
            <>
              <select className="input" style={{ width: "auto", height: 30 }} value={p.stage} onChange={(e) => job.changeStage(p.id, e.target.value as Stage)} aria-label="Stage">
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_NAME[s]}
                  </option>
                ))}
              </select>
              {(p.stage === "applied" || p.stage === "sourced") && (
                <button className="btn primary" onClick={() => job.changeStage(p.id, "screen")}>
                  <ArrowRight size={14} /> Move to screen
                </button>
              )}
              {p.stage !== "rejected" && <RejectMenu onPick={(r) => job.changeStage(p.id, "rejected", { rejected_by: "recruiter", reject_reason: r })} />}
            </>
          ) : (
            <button className="btn primary" onClick={() => hit.suggestion && job.add(hit.suggestion)}>
              <Plus size={14} /> Add to pipeline
            </button>
          )}
        </div>
      )}

      {job && fit && (
        <div className="pv-sec">
          <div className="pv-h">
            Fit for {job.jobTitle}
          </div>
          <div className="fitbox">
            <div className="fitbox-head">
              <span className="fitbox-n" style={{ color: fitColor(fit.fit) }}>
                {fit.fit}
              </span>
              <span className="muted small">/ 100</span>
            </div>
            {fit.why && <p className="why">{fit.why}</p>}
            {fit.evidence.map((e) => (
              <div key={e} className="li ok">
                <Check size={13} strokeWidth={2.5} />
                <span>{e}</span>
              </div>
            ))}
            {fit.gaps.map((g) => (
              <div key={g} className="li gap">
                <TriangleAlert size={13} />
                <span>{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flags.length > 0 && (
        <div className="pv-sec stack">
          {flags.map((f) => (
            <FlagBadge key={f.text} flag={f} />
          ))}
        </div>
      )}

      {!detail ? (
        <div className="pv-sec stack">
          <div className="skeleton" style={{ width: "40%" }} />
          <div className="skeleton" />
          <div className="skeleton" style={{ width: "85%" }} />
        </div>
      ) : (
        <>
          {detail.pipelines.length > 0 && (
            <div className="pv-sec">
              <div className="pv-h">
                Pipelines <span className="muted">{detail.pipelines.length}</span>
              </div>
              <div className="stack">
                {detail.pipelines.map((pl) => (
                  <div key={pl.id} className="mini-row">
                    <Link href={`/jobs/${pl.job_id}`} className="client" style={{ minWidth: 0 }}>
                      <ClientLogo name={pl.client} />
                      <span className="ellipsis">
                        {pl.job_title} <span className="muted">· {pl.client}</span>
                      </span>
                    </Link>
                    <StagePill stage={pl.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.notes && (
            <div className="pv-sec">
              <div className="pv-h">Your notes</div>
              <div className="notes">{detail.notes}</div>
            </div>
          )}

          <div className="pv-sec">
            <div className="pv-h">Summary</div>
            <p className="pv-text">{detail.summary}</p>
          </div>

          <div className="pv-sec">
            <div className="pv-h">
              Experience <span className="muted">{detail.experience.length} roles</span>
            </div>
            {detail.experience.slice(0, 3).map((e) => (
              <div key={`${e.company}-${e.start}`} className="exp-item">
                <div className="t">
                  {e.title} · {e.company}
                </div>
                <div className="d">
                  {e.start} – {e.end}
                </div>
                <ul>
                  {e.highlights.slice(0, 2).map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pv-sec">
            <div className="pv-h">Skills</div>
            <div className="tags" style={{ marginTop: 0 }}>
              {detail.skills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="pv-foot">
            <Link href={`/candidates/${id}`}>
              Open full profile <ArrowUpRight size={14} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function RejectMenu({ onPick, compact }: { onPick: (reason: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="menu-wrap" ref={ref}>
      <button className={compact ? "btn sm" : "btn"} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        Reject <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">Reason</div>
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
