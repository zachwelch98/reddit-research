import { runReadOnlySql } from "@/lib/db";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "SELECT k.label, k.score, k.size FROM clusters k WHERE is_current = 1 ORDER BY score DESC LIMIT 20",
  "SELECT workflow_category, count(*) n, round(avg(willingness_to_pay),2) wtp FROM classifications WHERE is_pain_point = 1 GROUP BY 1 ORDER BY n DESC",
  "SELECT p.subreddit, count(*) posts, sum(c.is_pain_point) pain FROM posts p JOIN classifications c ON c.post_id = p.id GROUP BY 1 ORDER BY pain DESC",
];

const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? "[blob]" : String(v).slice(0, 400));

export default async function SqlPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? EXAMPLES[0]!;
  let result: ReturnType<typeof runReadOnlySql> | null = null;
  let error: string | null = null;
  try {
    result = runReadOnlySql(q);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <>
      <h1>SQL console</h1>
      <p className="muted small">Read-only connection to <code>data/reddit.db</code>. Tables: posts, comments, classifications, clusters, cluster_members, cluster_snapshots, post_sources, thread_requests, sources, eval_labels.</p>
      <form>
        <textarea name="q" rows={6} defaultValue={q} />
        <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
          <button>Run</button>
          <span className="small muted">Examples: {EXAMPLES.map((e, i) => <a key={i} href={`/sql?q=${encodeURIComponent(e)}`} style={{ marginRight: 10 }}>#{i + 1}</a>)}</span>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <p className="small muted">{result.rows.length} rows{result.truncated ? " (truncated at 500)" : ""}</p>
          <div className="table-wrap">
            <table>
              <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{result.rows.map((r, i) => <tr key={i}>{result!.columns.map((c) => <td key={c}>{show(r[c])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
