"use client";
import { ArrowRight, Banknote, CalendarDays, Check, ChevronDown, ChevronRight, Circle, LoaderCircle, MapPin, Plus, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobRow } from "@/lib/store";
import { STRONG_FIT, type Stage } from "@/lib/stages";
import { RejectMenu, PreviewSlot, usePreviewJob, type Match, type PipelineEntry, type StageOpts } from "./preview";
import { CandidateLink, SelectDiv, useSelectCandidate, useSelectedCandidate } from "./preview-link";
import { Avatar, BAR_LABEL, ClientLogo, Fit, FlagIcons, PageHeader, STAGE_COLOR, STAGE_NAME, StagePill, daysSince, fitColor } from "./ui";

type Tab = "pipeline" | "applicants" | "suggestions";
const BOARD: Stage[] = ["sourced", "screen", "submitted", "client_interview", "offer"];
const ROW_COLS = { gridTemplateColumns: "20px minmax(0, 1.7fr) minmax(0, 1fr) 90px 56px 150px" };
const UPLOAD_STEPS = ["Reading resume", "Building profile", "Ranking against applicants"];
const SUGGEST_STEPS = ["Searching your pool", "Ranking against the must-haves"];

function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <span key={s} className={`step${i < at ? " done" : i === at ? " now" : ""}`}>
          {i < at ? <Check size={13} strokeWidth={2.5} /> : i === at ? <LoaderCircle size={13} className="spin" /> : <Circle size={11} />}
          {s}
        </span>
      ))}
    </div>
  );
}

export function JobDetail({ job, entries: initial, today, auto }: { job: JobRow; entries: PipelineEntry[]; today: string; auto: boolean }) {
  const [tab, setTab] = useState<Tab>(auto ? "suggestions" : "pipeline");
  const [entries, setEntries] = useState(initial);
  const [suggestions, setSuggestions] = useState<Match[] | null>(null);
  const [suggBusy, setSuggBusy] = useState(false);
  const [suggPhase, setSuggPhase] = useState(0);
  const [suggError, setSuggError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [uploadStep, setUploadStep] = useState(-1);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ranOnce = useRef(false);
  const selected = useSelectedCandidate();
  const select = useSelectCandidate();

  const applicants = useMemo(
    () => entries.filter((e) => e.pipeline.origin === "applied").sort((a, b) => (b.pipeline.fit ?? -1) - (a.pipeline.fit ?? -1)),
    [entries],
  );
  const strong = applicants.filter((e) => (e.pipeline.fit ?? 0) >= STRONG_FIT);
  const others = applicants.filter((e) => (e.pipeline.fit ?? 0) < STRONG_FIT);
  const inProcess = entries.filter((e) => ["screen", "submitted", "client_interview", "offer"].includes(e.pipeline.stage)).length;

  const changeStage = useCallback(
    async (pipelineId: number, stage: Stage, opts: StageOpts = {}) => {
      const res = await fetch(`/api/pipeline/${pipelineId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage, ...opts }) });
      if (!res.ok) return;
      setEntries((es) =>
        es.map((e) =>
          e.pipeline.id === pipelineId
            ? { ...e, pipeline: { ...e.pipeline, stage, stage_updated: today, rejected_by: opts.rejected_by ?? null, reject_reason: opts.reject_reason ?? null } }
            : e,
        ),
      );
    },
    [today],
  );

  const add = useCallback(
    async (m: Match) => {
      const res = await fetch(`/api/jobs/${job.id}/pipeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: m.id, fit: m.fit, why: m.why, evidence: m.evidence, gaps: m.gaps }),
      });
      if (!res.ok) return;
      const { id } = await res.json();
      setEntries((es) => [
        ...es,
        {
          pipeline: {
            id,
            job_id: job.id,
            candidate_id: m.id,
            stage: "sourced",
            origin: "sourced",
            fit: m.fit,
            why: m.why,
            evidence: m.evidence,
            gaps: m.gaps,
            next_step: null,
            next_step_date: null,
            stage_updated: today,
            rejected_by: null,
            reject_reason: null,
          },
          card: m.card,
          flags: m.flags,
        },
      ]);
    },
    [job.id, today],
  );

  const lookup = useCallback(
    (candidateId: number) => ({ entry: entries.find((e) => e.pipeline.candidate_id === candidateId), suggestion: suggestions?.find((s) => s.id === candidateId) }),
    [entries, suggestions],
  );
  const preview = useMemo(() => ({ jobId: job.id, jobTitle: job.title, lookup, changeStage, add }), [job.id, job.title, lookup, changeStage, add]);
  usePreviewJob(preview);

  async function findSuggestions() {
    setSuggBusy(true);
    setSuggError(null);
    setSuggPhase(0);
    const t = setTimeout(() => setSuggPhase(1), 1500);
    try {
      const res = await fetch(`/api/jobs/${job.id}/suggest`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSuggestions(json.matches);
      select(json.matches[0]?.id ?? null, "replace");
    } catch (e) {
      setSuggError((e as Error).message);
    } finally {
      clearTimeout(t);
      setSuggBusy(false);
    }
  }

  useEffect(() => {
    if (!auto || ranOnce.current) return;
    ranOnce.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("auto");
    window.history.replaceState(null, "", url.toString());
    findSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  function openTab(t: Tab) {
    setTab(t);
    if (t === "pipeline") select(null, "replace");
    if (t === "applicants" && !applicants.some((a) => a.pipeline.candidate_id === selected)) select(applicants[0]?.pipeline.candidate_id ?? null, "replace");
    if (t === "suggestions" && !suggestions?.some((s) => s.id === selected)) select(suggestions?.[0]?.id ?? null, "replace");
  }

  async function uploadResume(file: File) {
    setUploadError(null);
    setUploadNote(null);
    setUploadStep(0);
    const timers = [setTimeout(() => setUploadStep(1), 3000), setTimeout(() => setUploadStep(2), 11000)];
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("jobId", String(job.id));
      const res = await fetch("/api/resume", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      timers.forEach(clearTimeout);
      if (json.duplicate) {
        setUploadStep(-1);
        setUploadNote(`${json.card.name} is already in your pool, so no duplicate was created.`);
        select(json.card.id);
        return;
      }
      const entry: PipelineEntry = {
        pipeline: {
          id: json.pipelineId,
          job_id: job.id,
          candidate_id: json.card.id,
          stage: "applied",
          origin: "applied",
          fit: json.ranked?.fit ?? null,
          why: json.ranked?.why ?? null,
          evidence: json.ranked?.evidence ?? null,
          gaps: json.ranked?.gaps ?? null,
          next_step: null,
          next_step_date: null,
          stage_updated: today,
          rejected_by: null,
          reject_reason: null,
        },
        card: json.card,
        flags: [{ kind: "new", text: "Added today" }],
      };
      const rank = [...applicants, entry].sort((a, b) => (b.pipeline.fit ?? -1) - (a.pipeline.fit ?? -1)).indexOf(entry) + 1;
      setEntries((es) => [...es, entry]);
      if ((entry.pipeline.fit ?? 0) < STRONG_FIT) setShowOthers(true);
      setFresh(json.card.id);
      setUploadStep(-1);
      setUploadNote(`Added ${json.card.name}: ranked #${rank} of ${applicants.length + 1} applicants.`);
      select(json.card.id);
    } catch (e) {
      timers.forEach(clearTimeout);
      setUploadStep(-1);
      setUploadError((e as Error).message);
    }
  }

  const byStage = (s: Stage) =>
    entries
      .filter((e) => (s === "sourced" ? e.pipeline.stage === "sourced" || e.pipeline.stage === "applied" : e.pipeline.stage === s))
      .sort((a, b) => b.pipeline.stage_updated.localeCompare(a.pipeline.stage_updated) || (b.pipeline.fit ?? -1) - (a.pipeline.fit ?? -1));
  const rejectedCount = entries.filter((e) => e.pipeline.stage === "rejected").length;
  const placed = entries.filter((e) => e.pipeline.stage === "placed");

  function applicantRow(e: PipelineEntry, rank: number) {
    const p = e.pipeline;
    return (
      <SelectDiv key={p.id} id={p.candidate_id} className={`r${fresh === p.candidate_id ? " fresh" : ""}`} style={ROW_COLS}>
        <span className="rank">{rank}</span>
        <div className="person">
          <Avatar name={e.card.name} size={28} />
          <div>
            <CandidateLink id={p.candidate_id} className="nm">
              {e.card.name}
            </CandidateLink>
            <div className="sub">{e.card.title}</div>
          </div>
        </div>
        <span className="muted ellipsis small">{e.card.location}</span>
        <Fit value={p.fit} />
        <FlagIcons flags={e.flags} />
        {p.stage === "applied" ? (
          <div className="hover-actions">
            <button className="btn sm" onClick={() => changeStage(p.id, "screen")} title="Move to screen">
              Screen <ArrowRight size={13} />
            </button>
            <RejectMenu compact onPick={(r) => changeStage(p.id, "rejected", { rejected_by: "recruiter", reject_reason: r })} />
          </div>
        ) : (
          <span style={{ justifySelf: "end" }}>
            <StagePill stage={p.stage} />
          </span>
        )}
      </SelectDiv>
    );
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Open jobs", href: "/jobs" }, { label: job.client }]}
        title={job.title}
        meta={
          <>
            <span>
              <ClientLogo name={job.client} size={16} /> {job.client}
            </span>
            {job.location && (
              <span>
                <MapPin size={13} /> {job.location}
              </span>
            )}
            {job.comp && (
              <span>
                <Banknote size={13} /> {job.comp}
              </span>
            )}
            <span>
              <CalendarDays size={13} /> Opened {daysSince(job.opened_at, today)}d ago
            </span>
          </>
        }
      >
        {(job.must_haves.length > 0 || job.nice_to_haves.length > 0) && (
          <div className="tags">
            {job.must_haves.map((m) => (
              <span key={m} className="tag">
                {m}
              </span>
            ))}
            {job.nice_to_haves.map((m) => (
              <span key={m} className="tag outline">
                {m}
              </span>
            ))}
          </div>
        )}
      </PageHeader>

      <div className="tabs" role="tablist">
        {(
          [
            ["pipeline", "Pipeline", inProcess],
            ["applicants", "Applicants", applicants.length],
            ["suggestions", "Suggested from your pool", suggestions?.length],
          ] as const
        ).map(([t, label, n]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? " on" : ""}`} onClick={() => openTab(t)}>
            {label}
            {n != null && <span className="count">{n}</span>}
          </button>
        ))}
      </div>

      {tab === "pipeline" && (
        <div className="board">
          {BOARD.map((s) => (
            <div key={s} className="col">
              <div className="col-head">
                <span className="dot" style={{ background: STAGE_COLOR[s] }} />
                {BAR_LABEL[s]}
                <span className="n">{byStage(s).length}</span>
              </div>
              {byStage(s).map((e) => (
                <SelectDiv key={e.pipeline.id} id={e.pipeline.candidate_id} className="bcard">
                  <div className="top">
                    <Avatar name={e.card.name} size={20} />
                    <span className="nm ellipsis">{e.card.name}</span>
                  </div>
                  {e.pipeline.next_step && <div className="ns">{e.pipeline.next_step}</div>}
                  {(e.pipeline.fit != null || e.flags.length > 0) && (
                    <div className="foot">
                      {e.pipeline.fit != null ? (
                        <span className="num" style={{ fontWeight: 600, fontSize: 12.5, color: fitColor(e.pipeline.fit) }} title="Fit score">
                          {e.pipeline.fit}
                        </span>
                      ) : (
                        <span />
                      )}
                      <FlagIcons flags={e.flags} />
                    </div>
                  )}
                </SelectDiv>
              ))}
            </div>
          ))}
        </div>
      )}
      {tab === "pipeline" && (
        <div className="board-foot">
          <span>
            <span className="dot" style={{ background: STAGE_COLOR.placed }} />
            {placed.length} placed
          </span>
          <span>
            <span className="dot" style={{ background: STAGE_COLOR.rejected }} />
            {rejectedCount} rejected
          </span>
          <span>Select a card to move it to another stage.</span>
        </div>
      )}

      {tab === "applicants" && (
        <>
          <div
            className={`drop${over ? " over" : ""}`}
            onDragOver={(ev) => {
              ev.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(ev) => {
              ev.preventDefault();
              setOver(false);
              const f = ev.dataTransfer.files[0];
              if (f) uploadResume(f);
            }}
          >
            {uploadStep >= 0 ? (
              <Steps steps={UPLOAD_STEPS} at={uploadStep} />
            ) : uploadNote ? (
              <span style={{ color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={14} color="var(--green)" strokeWidth={2.5} /> {uploadNote}
              </span>
            ) : (
              <>
                <Upload size={14} /> Drop a resume PDF to add an applicant, or
                <button className="linkbtn" onClick={() => fileInput.current?.click()}>
                  browse
                </button>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) uploadResume(f);
                ev.target.value = "";
              }}
            />
          </div>
          {uploadError && <div className="error">{uploadError}</div>}

          <div className="rows">
            <div className="group-head">
              Strong fits <span className="n">{strong.length}</span>
            </div>
            {strong.map((e, i) => applicantRow(e, i + 1))}
            {!strong.length && <div className="empty-row">No applicants score {STRONG_FIT}+ yet.</div>}
            <button className="group-head" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers} style={{ borderTop: "1px solid var(--line-soft)" }}>
              {showOthers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Other applicants <span className="n">{others.length}</span>
            </button>
            {showOthers && others.map((e, i) => applicantRow(e, strong.length + i + 1))}
          </div>
        </>
      )}

      {tab === "suggestions" && (
        <>
          <div className="toolbar">
            <span className="muted">People in your pool who haven&apos;t applied, ranked against this job.</span>
            <button className="btn primary" disabled={suggBusy} onClick={findSuggestions}>
              {suggBusy ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />}
              {suggestions ? "Search again" : "Find suggestions"}
            </button>
          </div>
          {suggError && <div className="error">{suggError}</div>}
          <div className="rows">
            {suggBusy ? (
              <div className="progress">
                <Steps steps={SUGGEST_STEPS} at={suggPhase} />
              </div>
            ) : suggestions ? (
              suggestions.map((m, i) => {
                const entry = entries.find((e) => e.pipeline.candidate_id === m.id);
                return (
                  <SelectDiv key={m.id} id={m.id} className="r" style={ROW_COLS}>
                    <span className="rank">{i + 1}</span>
                    <div className="person">
                      <Avatar name={m.card.name} size={28} />
                      <div>
                        <CandidateLink id={m.id} className="nm">
                          {m.card.name}
                        </CandidateLink>
                        <div className="sub">{m.card.title}</div>
                      </div>
                    </div>
                    <span className="muted ellipsis small">{m.card.location}</span>
                    <Fit value={m.fit} />
                    <FlagIcons flags={m.flags} />
                    <span style={{ justifySelf: "end" }}>
                      {entry ? (
                        <span className="pill">
                          <Check size={13} color="var(--green)" strokeWidth={2.5} /> In pipeline
                        </span>
                      ) : (
                        <button className="btn sm" onClick={() => add(m)}>
                          <Plus size={13} /> Add
                        </button>
                      )}
                    </span>
                  </SelectDiv>
                );
              })
            ) : (
              <div className="empty-row">Search everyone you&apos;ve engaged for people who fit this role but haven&apos;t applied.</div>
            )}
          </div>
        </>
      )}

      <PreviewSlot>
        <JobSummary job={job} entries={entries} today={today} />
      </PreviewSlot>
    </>
  );
}

function JobSummary({ job, entries, today }: { job: JobRow; entries: PipelineEntry[]; today: string }) {
  const count = (s: Stage) => entries.filter((e) => (s === "sourced" ? e.pipeline.stage === "sourced" || e.pipeline.stage === "applied" : e.pipeline.stage === s)).length;
  return (
    <div className="pv">
      <div className="pv-top">
        <ClientLogo name={job.client} size={36} />
        <div>
          <div className="pv-name">{job.title}</div>
          <div className="pv-headline">{job.client}</div>
        </div>
      </div>
      <div className="pv-facts">
        {job.location && (
          <div>
            <MapPin size={14} /> {job.location}
          </div>
        )}
        {job.comp && (
          <div>
            <Banknote size={14} /> {job.comp}
          </div>
        )}
        <div>
          <CalendarDays size={14} /> Opened {daysSince(job.opened_at, today)} days ago
        </div>
      </div>

      <div className="pv-sec">
        <div className="pv-h">Pipeline</div>
        <div className="stack">
          {[...BOARD, "placed" as Stage, "rejected" as Stage].map((s) => (
            <div key={s} className="mini-row">
              <span className="pill">
                <span className="dot" style={{ background: STAGE_COLOR[s] }} />
                {BAR_LABEL[s] ?? STAGE_NAME[s]}
              </span>
              <span className="num muted">{count(s)}</span>
            </div>
          ))}
        </div>
      </div>

      {job.must_haves.length > 0 && (
        <div className="pv-sec">
          <div className="pv-h">Must-haves</div>
          {job.must_haves.map((m) => (
            <div key={m} className="li ok">
              <Check size={13} strokeWidth={2.5} />
              <span>{m}</span>
            </div>
          ))}
        </div>
      )}
      {job.nice_to_haves.length > 0 && (
        <div className="pv-sec">
          <div className="pv-h">Nice to have</div>
          {job.nice_to_haves.map((m) => (
            <div key={m} className="li">
              <Circle size={11} style={{ marginTop: 3, color: "var(--faint)" }} />
              <span>{m}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pv-sec">
        <div className="pv-h">Job order</div>
        <p className="pv-text" style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>
          {job.description}
        </p>
      </div>
      <p className="muted small" style={{ marginTop: 18 }}>
        Select a candidate to see their fit for this role.
      </p>
    </div>
  );
}
