import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const ScoringFile = z.object({
  weights: z.object({
    frequency: z.number().nonnegative(),
    spread: z.number().nonnegative(),
    engagement: z.number().nonnegative(),
    willingness_to_pay: z.number().nonnegative(),
    underserved: z.number().nonnegative(),
    ai_solvability: z.number().nonnegative(),
    emotional_intensity: z.number().nonnegative(),
  }),
  clustering: z.object({
    target_cluster_size: z.number().int().positive(),
    min_similarity: z.number().min(-1).max(1),
    min_cluster_size: z.number().int().positive(),
    relabel_growth: z.number().nonnegative(),
  }),
});
export type ScoringConfig = z.infer<typeof ScoringFile>;
export type Weights = ScoringConfig["weights"];

export function loadScoringConfig(path = "config/scoring.yaml"): ScoringConfig {
  return ScoringFile.parse(parse(readFileSync(path, "utf8")));
}

export type ClusterStats = {
  id: number;
  size: number;
  n_subreddits: number;
  engagement: number;
  avg_wtp: number | null;
  avg_underserved: number | null;
  avg_ai_solvability: number | null;
  avg_emotional_intensity: number | null;
};

// Min-max across clusters; a component that's constant across all clusters contributes 0.
function minmax(values: number[]): number[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  return values.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
}

// 0–3 averages are already on a fixed scale, so they're divided by 3 rather than min-maxed:
// a cluster where nobody would pay shouldn't score high just because it's the best of a bad set.
const scale3 = (v: number | null) => (v ?? 0) / 3;

export function scoreClusters(stats: ClusterStats[], w: Weights): Map<number, number> {
  if (!stats.length) return new Map();
  const freq = minmax(stats.map((s) => Math.log(s.size)));
  const spread = minmax(stats.map((s) => s.n_subreddits));
  const engagement = minmax(stats.map((s) => s.engagement));
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return new Map(
    stats.map((s, i) => {
      const raw =
        w.frequency * freq[i]! +
        w.spread * spread[i]! +
        w.engagement * engagement[i]! +
        w.willingness_to_pay * scale3(s.avg_wtp) +
        w.underserved * scale3(s.avg_underserved) +
        w.ai_solvability * scale3(s.avg_ai_solvability) +
        w.emotional_intensity * scale3(s.avg_emotional_intensity);
      return [s.id, Math.round((1000 * raw) / total) / 10];
    }),
  );
}
