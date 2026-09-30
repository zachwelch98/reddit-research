// npm run cluster -- [--full] [--no-label] [--k N]
//
// Incremental (default once clusters exist): new pain points join their nearest current cluster
// if similar enough; everything else is left alone. --full re-clusters from scratch (previous
// clusters are kept with is_current = 0). Then: rescore every current cluster, snapshot today's
// state, and (re)label clusters that are new or have grown a lot.
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { closeDb, getDb, type DB } from "../db/index.js";
import { describeCluster } from "./describe.js";
import { fromBlob, kmeans, nearest, normalize, toBlob } from "./kmeans.js";
import { loadScoringConfig, scoreClusters, type ClusterStats } from "./score.js";

const { values: args } = parseArgs({
  options: {
    full: { type: "boolean", default: false },
    "no-label": { type: "boolean", default: false },
    k: { type: "string" }, // override the number of clusters (useful for small pilots)
  },
});
const cfg = loadScoringConfig();
const db = getDb();
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

type Point = { post_id: string; v: Float32Array };

function loadPoints(): Point[] {
  return (db.prepare("SELECT post_id, embedding FROM vec_pain_points").all() as { post_id: string; embedding: Buffer }[]).map(
    (r) => ({ post_id: r.post_id, v: normalize(fromBlob(r.embedding)) }),
  );
}

function fullRecluster(points: Point[], runId: number) {
  const { target_cluster_size, min_similarity, min_cluster_size } = cfg.clustering;
  const k = args.k ? Number(args.k) : Math.max(2, Math.round(points.length / target_cluster_size));
  log(`full re-cluster: ${points.length} pain points, k = ${k}`);
  const { centroids, assignments, similarities, iterations } = kmeans(points.map((p) => p.v), k, { seed: 42 });
  log(`  converged after ${iterations} iterations`);

  const groups = new Map<number, { post_id: string; sim: number }[]>();
  points.forEach((p, i) => {
    if (similarities[i]! < min_similarity) return; // outlier: stays unassigned
    const g = groups.get(assignments[i]!) ?? [];
    g.push({ post_id: p.post_id, sim: similarities[i]! });
    groups.set(assignments[i]!, g);
  });

  const insCluster = db.prepare("INSERT INTO clusters (run_id, centroid, size) VALUES (?, ?, ?) RETURNING id");
  const insMember = db.prepare("INSERT INTO cluster_members (cluster_id, post_id, distance) VALUES (?, ?, ?)");
  let kept = 0, assigned = 0;
  db.transaction(() => {
    db.prepare("UPDATE clusters SET is_current = 0 WHERE is_current = 1").run();
    for (const [c, members] of groups) {
      if (members.length < min_cluster_size) continue;
      const { id } = insCluster.get(runId, toBlob(centroids[c]!), members.length) as { id: number };
      for (const m of members) insMember.run(id, m.post_id, 1 - m.sim);
      kept++;
      assigned += members.length;
    }
  })();
  log(`  ${kept} clusters kept (≥${min_cluster_size} members); ${assigned}/${points.length} pain points assigned, rest are outliers`);
}

function incremental(points: Point[]) {
  const current = (db.prepare("SELECT id, centroid FROM clusters WHERE is_current = 1").all() as { id: number; centroid: Buffer }[]).map(
    (c) => ({ id: c.id, v: fromBlob(c.centroid) }),
  );
  const members = new Set(
    (db.prepare("SELECT m.post_id FROM cluster_members m JOIN clusters c ON c.id = m.cluster_id WHERE c.is_current = 1").all() as {
      post_id: string;
    }[]).map((r) => r.post_id),
  );
  const fresh = points.filter((p) => !members.has(p.post_id));
  const ins = db.prepare("INSERT INTO cluster_members (cluster_id, post_id, distance) VALUES (?, ?, ?)");
  let joined = 0;
  db.transaction(() => {
    for (const p of fresh) {
      const { index, similarity } = nearest(p.v, current.map((c) => c.v));
      if (similarity < cfg.clustering.min_similarity) continue;
      ins.run(current[index]!.id, p.post_id, 1 - similarity);
      joined++;
    }
  })();
  log(`incremental: ${fresh.length} unassigned pain points, ${joined} joined an existing cluster`);
}

function rescore(db: DB) {
  const rows = db
    .prepare(
      `SELECT m.cluster_id AS id, p.subreddit, p.comments_fetched_n AS n_comments,
              c.willingness_to_pay AS wtp, c.underserved, c.ai_solvability, c.emotional_intensity
       FROM cluster_members m JOIN clusters k ON k.id = m.cluster_id AND k.is_current = 1
       JOIN posts p ON p.id = m.post_id JOIN classifications c ON c.post_id = m.post_id`,
    )
    .all() as { id: number; subreddit: string; n_comments: number | null; wtp: number | null; underserved: number | null; ai_solvability: number | null; emotional_intensity: number | null }[];

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const byCluster = Map.groupBy(rows, (r) => r.id);
  const stats: ClusterStats[] = [...byCluster].map(([id, rs]) => ({
    id,
    size: rs.length,
    n_subreddits: new Set(rs.map((r) => r.subreddit.toLowerCase())).size,
    engagement: rs.reduce((a, r) => a + Math.log1p(r.n_comments ?? 0), 0),
    avg_wtp: avg(rs.map((r) => r.wtp)),
    avg_underserved: avg(rs.map((r) => r.underserved)),
    avg_ai_solvability: avg(rs.map((r) => r.ai_solvability)),
    avg_emotional_intensity: avg(rs.map((r) => r.emotional_intensity)),
  }));
  const scores = scoreClusters(stats, cfg.weights);
  const today = new Date().toISOString().slice(0, 10);
  const upd = db.prepare(
    `UPDATE clusters SET size = @size, n_subreddits = @n_subreddits, engagement = @engagement, avg_wtp = @avg_wtp,
       avg_underserved = @avg_underserved, avg_ai_solvability = @avg_ai_solvability,
       avg_emotional_intensity = @avg_emotional_intensity, score = @score, updated_at = unixepoch() WHERE id = @id`,
  );
  const snap = db.prepare(
    "INSERT OR REPLACE INTO cluster_snapshots (snapshot_date, cluster_id, size, engagement, score) VALUES (?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const s of stats) {
      const score = scores.get(s.id) ?? 0;
      upd.run({ ...s, score });
      snap.run(today, s.id, s.size, s.engagement, score);
    }
  })();
  log(`scored ${stats.length} clusters; snapshot ${today}`);
}

async function relabel() {
  const todo = db
    .prepare(
      `SELECT id FROM clusters WHERE is_current = 1
         AND (label IS NULL OR size >= labeled_size * (1 + ?)) ORDER BY score DESC`,
    )
    .all(cfg.clustering.relabel_growth) as { id: number }[];
  if (!todo.length) return;
  log(`labeling ${todo.length} clusters with Sonnet 5…`);
  const client = new Anthropic();
  const upd = db.prepare(
    "UPDATE clusters SET label = ?, problem_statement = ?, who = ?, representative_quotes = ?, labeled_size = size WHERE id = ?",
  );
  const queue = [...todo];
  let failed = 0;
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const d = await describeCluster(db, client, c.id);
        upd.run(d.label, d.problem_statement, d.who, JSON.stringify(d.quotes), c.id);
      } catch (e) {
        failed++;
        log(`  cluster ${c.id}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  log(`  labeled ${todo.length - failed}${failed ? `, ${failed} failed (retried next run)` : ""}`);
}

const { id: runId } = db.prepare("INSERT INTO runs (kind) VALUES ('cluster') RETURNING id").get() as { id: number };
let status: "ok" | "failed" = "failed";
try {
  const points = loadPoints();
  if (!points.length) {
    log("No embedded pain points yet. Run `npm run classify` and `npm run embed` first.");
  } else {
    const hasClusters = db.prepare("SELECT 1 FROM clusters WHERE is_current = 1 LIMIT 1").get() != null;
    if (args.full || !hasClusters) fullRecluster(points, runId);
    else incremental(points);
    rescore(db);
    if (!args["no-label"]) await relabel();

    const top = db
      .prepare("SELECT id, score, size, n_subreddits AS subs, label FROM clusters WHERE is_current = 1 ORDER BY score DESC LIMIT 15")
      .all();
    console.table(top);
  }
  status = "ok";
} finally {
  db.prepare("UPDATE runs SET finished_at = unixepoch(), status = ? WHERE id = ?").run(status, runId);
  closeDb();
}
