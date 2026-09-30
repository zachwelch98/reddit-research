"use client";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What do property managers complain about most?",
  "Which problems have the highest willingness to pay and AI fit?",
  "What manual paperwork do accountants hate?",
];

// Renders the answer's Markdown (GFM: tables, bare URLs). Links open in a new tab; tables scroll
// horizontally instead of widening the page. react-markdown doesn't render raw HTML, so model
// output can't inject markup.
function Answer({ text }: { text: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          table: ({ node: _, ...props }) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessages([...next, { role: "assistant", content: json.answer }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Ask the data</h1>
      <p className="muted small">Claude (Opus 5.5) answers using read-only SQL and semantic search over the pain points, citing posts. Each question costs roughly $0.08–0.16 in API usage.</p>
      {messages.length === 0 && (
        <p className="small">
          Try: {SUGGESTIONS.map((s) => <a key={s} href="#" onClick={(e) => { e.preventDefault(); send(s); }} style={{ marginRight: 14 }}>{s}</a>)}
        </p>
      )}
      <div>
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === "user" ? <div className="body">{m.content}</div> : <div className="card"><Answer text={m.content} /></div>}
          </div>
        ))}
        {busy && <p className="muted">Querying the dataset…</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the problems in the dataset…" disabled={busy} />
        <button disabled={busy || !input.trim()}>Ask</button>
      </form>
    </>
  );
}
