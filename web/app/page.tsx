import Link from "next/link";
import { datasetStats, rankedClusters } from "@/lib/queries";

export const dynamic = "force-dynamic";

const fmt = (v: number | null, d = 1) => (v == null ? "–" : v.toFixed(d));

export default async function Home({ searchParams }: { searchParams: Promise<{ min?: string }> }) {
  const minSize = Number((await searchParams).min ?? 3) || 1;
  const s = datasetStats();
  const clusters = rankedClusters(minSize);
  const maxScore = Math.max(1, ...clusters.map((c) => c.score ?? 0));

  return (
    <>
      <h1>Ranked problems</h1>
      <p className="muted">Clusters of similar pain points, ranked by frequency, spread, willingness to pay, how underserved they are, and AI fit.</p>

      <div className="stats">
        <div className="stat"><b>{s.posts.toLocaleString()}</b><span className="muted small">posts ({s.threads.toLocaleString()} with comments)</span></div>
        <div className="stat"><b>{s.classified.toLocaleString()}</b><span className="muted small">classified</span></div>
        <div className="stat"><b>{s.pain_points.toLocaleString()}</b><span className="muted small">pain points</span></div>
        <div className="stat"><b>{s.clusters}</b><span className="muted small">clusters</span></div>
      </div>

      {s.labels < 150 && (
        <div className="banner">
          Pilot data: the classifier (prompt {s.prompt_version ?? "–"}) hasn&apos;t been validated yet ({s.labels} hand labels so far).
          Treat rankings as a pipeline test, not findings.
        </div>
      )}

      <form className="small muted" style={{ marginBottom: 10 }}>
        Minimum cluster size <input type="number" name="min" defaultValue={minSize} min={1} style={{ width: 60 }} /> <button>Apply</button>
      </form>

      {clusters.length === 0 ? (
        <div className="card">No clusters yet. Run <code>npm run classify</code>, <code>npm run embed</code>, then <code>npm run cluster</code>.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th><th>Problem</th><th className="num">Score</th><th className="num">Posts</th>
                <th className="num">7d Δ</th><th className="num">Subs</th><th className="num">WTP</th><th className="num">Underserved</th>
                <th className="num">AI fit</th><th className="num">Emotion</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((c, i) => (
                <tr key={c.id}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    <Link href={`/cluster/${c.id}`}>{c.label ?? `Cluster ${c.id} (unlabeled)`}</Link>
                    <div className="muted small">{c.top_subreddits}</div>
                  </td>
                  <td className="num"><span className="bar" style={{ width: `${(48 * (c.score ?? 0)) / maxScore}px` }} />{fmt(c.score)}</td>
                  <td className="num">{c.size}</td>
                  <td className="num">{c.size_week_ago == null ? "–" : `+${c.size - c.size_week_ago}`}</td>
                  <td className="num">{c.n_subreddits}</td>
                  <td className="num">{fmt(c.avg_wtp)}</td>
                  <td className="num">{fmt(c.avg_underserved)}</td>
                  <td className="num">{fmt(c.avg_ai_solvability)}</td>
                  <td className="num">{fmt(c.avg_emotional_intensity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">WTP, underserved, AI fit and emotion are 0–3 averages over the cluster&apos;s posts. Weights: <code>config/scoring.yaml</code>.</p>
    </>
  );
}
