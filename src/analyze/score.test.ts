import assert from "node:assert/strict";
import { test } from "node:test";
import { loadScoringConfig, scoreClusters, type ClusterStats } from "./score.js";

const base: Omit<ClusterStats, "id"> = {
  size: 10, n_subreddits: 2, engagement: 5, avg_wtp: 1, avg_underserved: 1, avg_ai_solvability: 1, avg_emotional_intensity: 1,
};
const weights = loadScoringConfig().weights;

test("more frequent, better-paying, more AI-solvable clusters rank higher", () => {
  const scores = scoreClusters(
    [
      { ...base, id: 1 },
      { ...base, id: 2, size: 80, n_subreddits: 9, avg_wtp: 2.5, avg_ai_solvability: 2.8 },
      { ...base, id: 3, size: 5, avg_wtp: 0, avg_ai_solvability: 0 },
    ],
    weights,
  );
  assert.ok(scores.get(2)! > scores.get(1)!);
  assert.ok(scores.get(1)! > scores.get(3)!);
});

test("fixed 0–3 scales aren't stretched: all-zero willingness to pay contributes nothing", () => {
  const onlyWtp = { ...weights, frequency: 0, spread: 0, engagement: 0, underserved: 0, ai_solvability: 0, emotional_intensity: 0 };
  const scores = scoreClusters([{ ...base, id: 1, avg_wtp: 0 }, { ...base, id: 2, avg_wtp: 3 }], onlyWtp);
  assert.equal(scores.get(1), 0);
  assert.equal(scores.get(2), 100);
});

test("scores are bounded 0–100 and handle a single cluster", () => {
  const scores = scoreClusters([{ ...base, id: 1, avg_wtp: 3, avg_underserved: 3, avg_ai_solvability: 3 }], weights);
  const s = scores.get(1)!;
  assert.ok(s >= 0 && s <= 100);
});
