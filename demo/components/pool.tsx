"use client";
import { Check, Circle, LoaderCircle, Search, SearchX, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CandidateCard } from "@/lib/view";
import { CandidateRowItem } from "./candidate-card";
import { useSelectCandidate } from "./preview-link";

type Plan = { chips: string[] };
type Hit = CandidateCard & { similarity: number };

const EXAMPLES = ["senior backend engineers in Austin who know Go", "data engineers in Florida with Spark and payments experience", "product managers with healthtech background, remote"];
const UPLOAD_STEPS = ["Reading resume", "Building profile", "Adding to your pool"];

export function Pool({ total, recent, today }: { total: number; recent: CandidateCard[]; today: string }) {
  const [count, setCount] = useState(total);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [step, setStep] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [recentList, setRecentList] = useState(recent);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const select = useSelectCandidate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function search(text: string) {
    if (!text.trim() || busy) return;
    setQ(text);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setPlan(json.plan);
      setHits(json.results);
      select(json.results[0]?.id ?? null, "replace");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setError(null);
    setNote(null);
    setStep(0);
    const timer = setTimeout(() => setStep(1), 3000);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      clearTimeout(timer);
      setStep(2);
      await new Promise((r) => setTimeout(r, 500));
      if (json.duplicate) {
        setNote(`${json.card.name} is already in your pool, so no duplicate was created.`);
      } else {
        setCount((n) => n + 1);
        setRecentList((l) => [json.card, ...l]);
        setFresh(json.card.id);
        setHits(null);
        setPlan(null);
        setNote(`Created a profile for ${json.card.name} from their resume.`);
      }
      setStep(-1);
      select(json.card.id);
    } catch (e) {
      clearTimeout(timer);
      setStep(-1);
      setError((e as Error).message);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) upload(f);
      }}
    >
      <div className="page-head">
        <div>
          <h1>Talent pool</h1>
          <div className="meta-row">
            <span>{count.toLocaleString()} candidates you&apos;ve engaged</span>
          </div>
        </div>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          <Upload size={14} /> Add resume
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <Search size={16} />
        <input ref={searchInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe who you're looking for, in plain English" />
        <span className="kbd">⌘K</span>
        <button className="btn primary" disabled={busy || !q.trim()}>
          {busy ? <LoaderCircle size={14} className="spin" /> : null}
          Search
        </button>
      </form>

      {plan && !busy ? (
        <div className="chips">
          <span className="muted">Searching for</span>
          {plan.chips.map((c) => (
            <span key={c} className="tag">
              {c}
            </span>
          ))}
        </div>
      ) : (
        <div className="chips">
          <span className="muted">Try</span>
          {EXAMPLES.map((x) => (
            <button key={x} className="linkbtn" style={{ fontWeight: 400, color: "var(--ink-2)" }} onClick={() => search(x)}>
              {x}
            </button>
          ))}
        </div>
      )}

      <div className={`drop${over ? " over" : ""}`}>
        {step >= 0 ? (
          <div className="steps">
            {UPLOAD_STEPS.map((s, i) => (
              <span key={s} className={`step${i < step ? " done" : i === step ? " now" : ""}`}>
                {i < step ? <Check size={13} strokeWidth={2.5} /> : i === step ? <LoaderCircle size={13} className="spin" /> : <Circle size={11} />}
                {s}
              </span>
            ))}
          </div>
        ) : note ? (
          <span style={{ color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Check size={14} color="var(--green)" strokeWidth={2.5} /> {note}
          </span>
        ) : (
          <>
            <Upload size={14} /> Drop a resume PDF anywhere to add a candidate
          </>
        )}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="section-title" style={{ marginTop: 18 }}>
        {busy ? (
          <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <LoaderCircle size={13} className="spin" /> Searching {count.toLocaleString()} candidates…
          </span>
        ) : hits ? (
          <span>
            Results <span className="muted num">{hits.length}</span>
          </span>
        ) : (
          <span>
            All candidates <span className="muted num">{recentList.length}</span>
            <span className="muted" style={{ fontWeight: 400 }}> · newest first</span>
          </span>
        )}
      </div>
      {!busy && (
        <div className="rows">
          {hits
            ? hits.map((h) => <CandidateRowItem key={h.id} c={h} today={today} highlight={plan?.chips ?? []} />)
            : recentList.map((c) => <CandidateRowItem key={c.id} c={c} today={today} fresh={fresh === c.id} showAdded />)}
          {hits && !hits.length && (
            <div className="empty-row" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <SearchX size={18} />
              No one in your pool matches all of that. Try loosening a filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
