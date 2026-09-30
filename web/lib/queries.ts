import "server-only";
import { getDb } from "./db";

const one = <T,>(sql: string, ...p: unknown[]) => getDb().prepare(sql).get(...p) as T;

export function datasetStats() {
  return one<{
    posts: number; threads: number; classified: number; pain_points: number; embedded: number; clusters: number;
    labels: number; prompt_version: string | null; last_cluster_run: number | null;
  }>(`SELECT
      (SELECT count(*) FROM posts) AS posts,
      (SELECT count(*) FROM posts WHERE comments_fetched_at IS NOT NULL) AS threads,
      (SELECT count(*) FROM classifications) AS classified,
      (SELECT count(*) FROM classifications WHERE is_pain_point = 1) AS pain_points,
      (SELECT count(*) FROM embeddings_meta) AS embedded,
      (SELECT count(*) FROM clusters WHERE is_current = 1) AS clusters,
      (SELECT count(*) FROM eval_labels) AS labels,
      (SELECT prompt_version FROM classifications GROUP BY prompt_version ORDER BY count(*) DESC LIMIT 1) AS prompt_version,
      (SELECT max(finished_at) FROM runs WHERE kind = 'cluster' AND status = 'ok') AS last_cluster_run`);
}

export type ClusterRow = {
  id: number; label: string | null; problem_statement: string | null; score: number | null; size: number;
  n_subreddits: number; avg_wtp: number | null; avg_underserved: number | null; avg_ai_solvability: number | null;
  avg_emotional_intensity: number | null; size_week_ago: number | null; top_subreddits: string | null;
};

export function rankedClusters(minSize: number): ClusterRow[] {
  return getDb()
    .prepare(
      `SELECT k.*,
         (SELECT s.size FROM cluster_snapshots s WHERE s.cluster_id = k.id AND s.snapshot_date <= date('now', '-7 days')
            ORDER BY s.snapshot_date DESC LIMIT 1) AS size_week_ago,
         (SELECT group_concat(subreddit, ', ') FROM (SELECT p.subreddit, count(*) n FROM cluster_members m
            JOIN posts p ON p.id = m.post_id WHERE m.cluster_id = k.id GROUP BY p.subreddit ORDER BY n DESC LIMIT 3)) AS top_subreddits
       FROM clusters k WHERE k.is_current = 1 AND k.size >= ? ORDER BY k.score DESC`,
    )
    .all(minSize) as ClusterRow[];
}
