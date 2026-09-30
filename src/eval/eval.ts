// npm run eval -- [--concurrency 5]
// Classifies every hand-labeled post with the current prompt (synchronously, so iterations are fast),
// caches predictions per prompt version, and scores them against eval_labels.
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../db/index.js";
import { buildParams, type PostRow } from "../analyze/input.js";
import { CLASSIFIER_MODEL, Classification, PROMPT_VERSION } from "../analyze/prompt.js";
import { parseClassification } from "../analyze/store.js";

const { values: args } = parseArgs({ options: { concurrency: { type: "string", default: "5" } } });
const db = getDb();
const client = new Anthropic();

type Label = { post_id: string; is_pain_point: number; willingness_to_pay: number | null; underserved: number | null; ai_solvability: number | null };

const labels = db.prepare("SELECT * FROM eval_labels").all() as Label[];
if (!labels.length) {
  console.log("No labels yet. Run `npm run label` first.");
  process.exit(0);
}

// 1. Predict (only posts without a cached prediction for this prompt version).
const missing = db
  .prepare(
    `SELECT p.id, p.subreddit, p.title, p.selftext FROM eval_labels l JOIN posts p ON p.id = l.post_id
     LEFT JOIN eval_predictions e ON e.post_id = l.post_id AND e.prompt_version = ? AND e.model = ?
     WHERE e.post_id IS NULL`,
  )
  .all(PROMPT_VERSION, CLASSIFIER_MODEL) as PostRow[];

let failed = 0;
const queue = [...missing];
async function worker() {
  for (let p = queue.shift(); p; p = queue.shift()) {
    const message = await client.messages.create(buildParams(db, p));
    const c = parseClassification(message);
    if (typeof c === "string") {
      failed++;
      console.warn(`  ${p.id}: ${c}`);
      continue;
    }
    db.prepare(
      "INSERT OR REPLACE INTO eval_predictions (post_id, prompt_version, model, output, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(p.id, PROMPT_VERSION, CLASSIFIER_MODEL, JSON.stringify(c), message.usage.input_tokens, message.usage.output_tokens);
  }
}
if (missing.length) {
  console.log(`Classifying ${missing.length} labeled posts with ${CLASSIFIER_MODEL} (prompt ${PROMPT_VERSION})…`);
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
}

// 2. Score.
const preds = new Map(
  (db.prepare("SELECT post_id, output FROM eval_predictions WHERE prompt_version = ? AND model = ?").all(PROMPT_VERSION, CLASSIFIER_MODEL) as {
    post_id: string;
    output: string;
  }[]).map((r) => [r.post_id, Classification.parse(JSON.parse(r.output))]),
);
const titles = new Map(
  (db.prepare("SELECT id, title FROM posts WHERE id IN (SELECT post_id FROM eval_labels)").all() as { id: string; title: string }[]).map((r) => [r.id, r.title]),
);

let tp = 0, fp = 0, fn = 0, tn = 0;
const misses: string[] = [];
const scales = ["willingness_to_pay", "underserved", "ai_solvability"] as const;
const agree = Object.fromEntries(scales.map((s) => [s, { n: 0, exact: 0, within1: 0, absErr: 0 }]));

for (const l of labels) {
  const p = preds.get(l.post_id);
  if (!p) continue;
  const human = l.is_pain_point === 1;
  if (human && p.is_pain_point) tp++;
  else if (!human && p.is_pain_point) fp++;
  else if (human && !p.is_pain_point) fn++;
  else tn++;
  if (human !== p.is_pain_point) {
    misses.push(`  ${human ? "FN" : "FP"} ${l.post_id} "${titles.get(l.post_id)?.slice(0, 70)}"\n       model: ${p.rationale}`);
  }
  if (human && p.is_pain_point) {
    for (const s of scales) {
      const h = l[s], m = p[s];
      if (h == null || m == null) continue;
      const a = agree[s]!;
      a.n++;
      a.exact += h === m ? 1 : 0;
      a.within1 += Math.abs(h - m) <= 1 ? 1 : 0;
      a.absErr += Math.abs(h - m);
    }
  }
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
const usage = db
  .prepare("SELECT sum(input_tokens) AS i, sum(output_tokens) AS o, avg(output_tokens) AS ao FROM eval_predictions WHERE prompt_version = ? AND model = ?")
  .get(PROMPT_VERSION, CLASSIFIER_MODEL) as { i: number; o: number; ao: number };

console.log(`\nEval: prompt ${PROMPT_VERSION} · ${CLASSIFIER_MODEL} · ${preds.size}/${labels.length} labeled posts scored${failed ? ` · ${failed} failed` : ""}\n`);
console.log(`is_pain_point   precision ${pct(precision)}   recall ${pct(recall)}   F1 ${pct((2 * precision * recall) / (precision + recall || 1))}   accuracy ${pct((tp + tn) / (tp + fp + fn + tn || 1))}`);
console.log(`                TP ${tp}  FP ${fp}  FN ${fn}  TN ${tn}\n`);
console.log("scores (posts both marked as pain points):");
for (const s of scales) {
  const a = agree[s]!;
  console.log(`  ${s.padEnd(20)} n=${a.n}  exact ${pct(a.exact / (a.n || 1))}  within ±1 ${pct(a.within1 / (a.n || 1))}  MAE ${(a.absErr / (a.n || 1)).toFixed(2)}`);
}
console.log(`\ntokens: ${usage.i} in / ${usage.o} out (avg ${Math.round(usage.ao)} out per post)`);
if (misses.length) console.log(`\nDisagreements on is_pain_point (${misses.length}):\n${misses.join("\n")}`);
closeDb();
