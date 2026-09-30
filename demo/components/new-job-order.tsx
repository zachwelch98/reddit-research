"use client";
import { FileText, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewJobOrder({ clients }: { clients: string[] }) {
  const router = useRouter();
  const [job, setJob] = useState("");
  const [client, setClient] = useState(clients[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick the client automatically when the pasted job order names one.
  function onJob(text: string) {
    setJob(text);
    const named = clients.find((c) => text.toLowerCase().includes(c.toLowerCase()));
    if (named) setClient(named);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: job, client }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push(`/jobs/${json.id}?auto=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="pv">
      <div className="pv-top">
        <span className="logo" style={{ width: 32, height: 32, background: "var(--subtle)", color: "var(--ink-2)" }}>
          <FileText size={16} />
        </span>
        <div>
          <div className="pv-name">New job order</div>
          <div className="pv-headline">Paste the client&apos;s requirements. Matching people from your pool are ranked as soon as it&apos;s created.</div>
        </div>
      </div>
      <div className="pv-sec">
        <label className="field-label" htmlFor="jo-client">
          Client
        </label>
        <select id="jo-client" className="input" value={client} onChange={(e) => setClient(e.target.value)}>
          {clients.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="pv-sec" style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="jo-text">
          Job order or intake notes
        </label>
        <textarea id="jo-text" className="job" value={job} onChange={(e) => onJob(e.target.value)} placeholder={"Senior Data Engineer — Cobalt Pay\nLocation: Miami, FL — hybrid\nComp: $170–190k\n\nMust have:\n- …"} />
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || job.trim().length < 20} onClick={create}>
        {busy ? <LoaderCircle size={14} className="spin" /> : null}
        {busy ? "Creating…" : "Create job and find matches"}
      </button>
    </div>
  );
}
