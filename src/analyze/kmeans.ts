// Spherical k-means (cosine similarity) with k-means++ seeding and a seeded RNG, so runs are
// reproducible. Vectors are L2-normalized first; similarity is then a plain dot product.

export type KMeansResult = {
  centroids: Float32Array[];
  assignments: Int32Array; // cluster index per vector
  similarities: Float32Array; // cosine similarity of each vector to its centroid
  iterations: number;
};

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  const inv = n > 0 ? 1 / Math.sqrt(n) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! * inv;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

// mulberry32
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nearest(v: Float32Array, centroids: Float32Array[]): { index: number; similarity: number } {
  let index = -1;
  let similarity = -Infinity;
  centroids.forEach((c, i) => {
    const s = dot(v, c);
    if (s > similarity) [index, similarity] = [i, s];
  });
  return { index, similarity };
}

export function kmeans(
  vectors: Float32Array[],
  k: number,
  opts: { seed?: number; maxIterations?: number } = {},
): KMeansResult {
  const n = vectors.length;
  if (n === 0) throw new Error("kmeans: no vectors");
  k = Math.max(1, Math.min(k, n));
  const random = rng(opts.seed ?? 42);
  const X = vectors.map(normalize);

  // k-means++: each next seed is picked with probability proportional to its distance² from the
  // nearest seed so far (distance = 1 - cosine similarity).
  const centroids: Float32Array[] = [X[Math.floor(random() * n)]!];
  const d2 = new Float64Array(n).fill(Infinity);
  while (centroids.length < k) {
    const last = centroids.at(-1)!;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = 1 - dot(X[i]!, last);
      d2[i] = Math.min(d2[i]!, d * d);
      total += d2[i]!;
    }
    let r = random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(X[pick]!);
  }

  const assignments = new Int32Array(n).fill(-1);
  const similarities = new Float32Array(n);
  const dim = X[0]!.length;
  let iterations = 0;
  for (; iterations < (opts.maxIterations ?? 50); iterations++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const { index, similarity } = nearest(X[i]!, centroids);
      if (assignments[i] !== index) changed++;
      assignments[i] = index;
      similarities[i] = similarity;
    }
    if (changed === 0 && iterations > 0) break;

    const sums = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignments[i]!;
      counts[c]!++;
      const s = sums[c]!, x = X[i]!;
      for (let j = 0; j < dim; j++) s[j]! += x[j]!;
    }
    for (let c = 0; c < k; c++) {
      // An empty cluster keeps its previous centroid.
      if (counts[c]! > 0) centroids[c] = normalize(sums[c]!);
    }
  }
  return { centroids, assignments, similarities, iterations };
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Buffer) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
