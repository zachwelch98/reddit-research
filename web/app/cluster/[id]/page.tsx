import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, redditUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

type Cluster = {
  id: number; label: string | null; problem_statement: string | null; who: string | null; representative_quotes: string | null;
  score: number | null; size: number; n_subreddits: number; avg_wtp: number | null; avg_underserved: number | null;
  avg_ai_solvability: number | null; avg_emotional_intensity: number | null; is_current: number;
};
type Member = {
  post_id: string; title: string; subreddit: string; permalink: string; problem_summary: string; persona: string | null;
  willingness_to_pay: number | null; wtp_evidence: string | null; ai_solvability: number | null; ai_capability: string | null;
  existing_tools: string; similarity: number;
};

const fmt = (v: number | null) => (v == null ? "–" : v.toFixed(1));

export default async function ClusterPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const c = db.prepare("SELECT * FROM clusters WHERE id = ?").get(id) as Cluster | undefined;
  if (!c) notFound();

  const members = db
    .prepare(
      `SELECT m.post_id, p.title, p.subreddit, p.permalink, 1 - m.distance AS similarity, cl.problem_summary, cl.persona,
              cl.willingness_to_pay, cl.wtp_evidence, cl.ai_solvability, cl.ai_capability, cl.existing_tools
       FROM cluster_members m JOIN posts p ON p.id = m.post_id JOIN classifications cl ON cl.post_id = m.post_id
       WHERE m.cluster_id = ? ORDER BY m.distance`,
    )
    .all(id) as Member[];

  const count = (xs: string[]) =>
    [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const subs = count(members.map((m) => m.subreddit));
  const tools = count(members.flatMap((m) => JSON.parse(m.existing_tools) as string[]));
  const capabilities = count(members.map((m) => m.ai_capability).filter((x): x is string => !!x));
  const quotes = (c.representative_quotes ? JSON.parse(c.representative_quotes) : []) as { post_id: string; quote: string }[];
  const byId = new Map(members.map((m) => [m.post_id, m]));

  return (
    <>
      <p className="small"><Link href="/">← All problems</Link>{!c.is_current && " · (superseded by a newer clustering run)"}</p>
      <h1>{c.label ?? `Cluster ${c.id}`}</h1>
      <p className="muted">{c.who}</p>
      {c.problem_statement && <p style={{ fontSize: 16 }}>{c.problem_statement}</p>}

      <div className="stats">
        <div className="stat"><b>{fmt(c.score)}</b><span className="muted small">score</span></div>
        <div className="stat"><b>{c.size}</b><span className="muted small">posts</span></div>
        <div className="stat"><b>{c.n_subreddits}</b><span className="muted small">subreddits</span></div>
        <div className="stat"><b>{fmt(c.avg_wtp)}</b><span className="muted small">willingness to pay</span></div>
        <div className="stat"><b>{fmt(c.avg_underserved)}</b><span className="muted small">underserved</span></div>
        <div className="stat"><b>{fmt(c.avg_ai_solvability)}</b><span className="muted small">AI fit</span></div>
        <div className="stat"><b>{fmt(c.avg_emotional_intensity)}</b><span className="muted small">emotion</span></div>
      </div>

      {quotes.length > 0 && (
        <>
          <h2>In their words</h2>
          {quotes.map((q) => {
            const m = byId.get(q.post_id);
            return (
              <blockquote key={q.post_id + q.quote}>
                “{q.quote}” {m && <a className="small" href={redditUrl(m.permalink)} target="_blank">r/{m.subreddit}</a>}
              </blockquote>
            );
          })}
        </>
      )}

      <div className="grid2">
        <div className="card"><b>Subreddits</b><div>{subs.map(([s, n]) => <span key={s} className="pill">r/{s} · {n}</span>)}</div></div>
        <div className="card"><b>Tools mentioned</b><div>{tools.length ? tools.slice(0, 15).map(([t, n]) => <span key={t} className="pill">{t} · {n}</span>) : <span className="muted small">none</span>}</div></div>
        <div className="card"><b>AI capability</b><div>{capabilities.map(([t, n]) => <span key={t} className="pill">{t} · {n}</span>)}</div></div>
      </div>

      <h2>Posts ({members.length})</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Post</th><th>Problem summary</th><th className="num">WTP</th><th className="num">AI</th><th className="num">Sim.</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.post_id}>
                <td style={{ minWidth: 220 }}>
                  <a href={redditUrl(m.permalink)} target="_blank">{m.title}</a>
                  <div className="muted small">r/{m.subreddit}{m.persona ? ` · ${m.persona}` : ""}</div>
                </td>
                <td>{m.problem_summary}{m.wtp_evidence && <div className="muted small">“{m.wtp_evidence}”</div>}</td>
                <td className="num">{m.willingness_to_pay ?? "–"}</td>
                <td className="num">{m.ai_solvability ?? "–"}</td>
                <td className="num muted">{m.similarity.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
