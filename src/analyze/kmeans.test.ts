import assert from "node:assert/strict";
import { test } from "node:test";
import { dot, fromBlob, kmeans, nearest, normalize, rng, toBlob } from "./kmeans.js";

// Synthetic "topics": random unit directions in 64-D, with members = direction + small noise.
function topics(nTopics: number, perTopic: number, noise: number, seed = 1) {
  const r = rng(seed);
  const vec = () => Float32Array.from({ length: 64 }, () => r() * 2 - 1);
  const dirs = Array.from({ length: nTopics }, () => normalize(vec()));
  const points: Float32Array[] = [];
  const truth: number[] = [];
  dirs.forEach((d, t) => {
    for (let i = 0; i < perTopic; i++) {
      points.push(Float32Array.from(d, (x) => x + (r() * 2 - 1) * noise));
      truth.push(t);
    }
  });
  return { dirs, points, truth };
}

test("recovers well-separated topics exactly", () => {
  const { points, truth } = topics(5, 20, 0.05);
  const { assignments, similarities } = kmeans(points, 5, { seed: 7 });
  // Every topic maps to exactly one cluster and every cluster to one topic.
  const pairs = new Set(truth.map((t, i) => `${t}->${assignments[i]}`));
  assert.equal(pairs.size, 5);
  assert.equal(new Set(assignments).size, 5);
  assert.ok(Math.min(...similarities) > 0.9);
});

test("is deterministic for a given seed", () => {
  const { points } = topics(4, 15, 0.3);
  assert.deepEqual(kmeans(points, 4, { seed: 3 }).assignments, kmeans(points, 4, { seed: 3 }).assignments);
});

test("nearest() assigns a new point to its topic's centroid", () => {
  const { dirs, points } = topics(3, 10, 0.05);
  const { centroids } = kmeans(points, 3, { seed: 1 });
  for (const d of dirs) assert.ok(nearest(d, centroids).similarity > 0.95);
});

test("blob round-trip preserves vectors", () => {
  const v = normalize(Float32Array.from([1, 2, 3, 4]));
  assert.ok(Math.abs(dot(fromBlob(toBlob(v)), v) - 1) < 1e-6);
});
