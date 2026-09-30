// npm run classify -- estimate [filters]   token count on a sample (free) → projected batch cost
// npm run classify -- submit   [filters]   send unclassified posts as Message Batches (50% off)
// npm run classify -- collect             import results of finished batches
// npm run classify -- run      [filters]   submit, wait for completion, collect
//
// filters: --sub NAME (repeatable)  --only threads|feeds  --limit N  --random (sample across the dataset)
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../db/index.js";
import { buildParams, unclassifiedPosts } from "./input.js";
import { CLASSIFIER_MODEL, PROMPT_VERSION } from "./prompt.js";
import { parseClassification, saveClassification } from "./store.js";

const BATCH_CHUNK = 2000; // requests per batch; keeps each batch well under the 256 MB limit
// Haiku 4.5 batch pricing (half of $1 / $5 per MTok).
const BATCH_INPUT_PER_MTOK = 0.5;
const BATCH_OUTPUT_PER_MTOK = 2.5;
const EST_OUTPUT_TOKENS = 220; // measured average once real results exist; see `estimate`

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sub: { type: "string", multiple: true },
    only: { type: "string" },
    limit: { type: "string" },
    random: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});
const cmd = positionals[0];
const db = getDb();
const client = new Anthropic();
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

function selectPosts() {
  if (args.only && args.only !== "threads" && args.only !== "feeds") throw new Error("--only must be threads or feeds");
  return unclassifiedPosts(db, {
    promptVersion: PROMPT_VERSION,
    subreddits: args.sub,
    only: args.only as "threads" | "feeds" | undefined,
    limit: args.limit ? Number(args.limit) : undefined,
    random: args.random,
  });
}

async function estimate() {
  const posts = selectPosts();
  if (!posts.length) return log("Nothing to classify.");
  const sample = [...posts].sort(() => Math.random() - 0.5).slice(0, 25);
  let total = 0;
  for (const p of sample) {
    // Include output_config: the structured-output schema adds ~1k input tokens per request.
    const { system, messages, model, output_config } = buildParams(db, p);
    total += (await client.messages.countTokens({ model, system, messages, output_config })).input_tokens;
  }
  const avgIn = total / sample.length;
  const measuredOut = db
    .prepare("SELECT avg(output_tokens) AS o FROM eval_predictions WHERE prompt_version = ?")
    .get(PROMPT_VERSION) as { o: number | null };
  const avgOut = measuredOut.o ?? EST_OUTPUT_TOKENS;
  const cost = (posts.length * (avgIn * BATCH_INPUT_PER_MTOK + avgOut * BATCH_OUTPUT_PER_MTOK)) / 1e6;
  log(
    `${posts.length} posts · avg ${Math.round(avgIn)} input tokens (sample of ${sample.length}) · ` +
      `${Math.round(avgOut)} output tokens (${measuredOut.o ? "measured" : "assumed"}) → ≈ $${cost.toFixed(2)} at batch prices`,
  );
}

async function submit(): Promise<string[]> {
  const pending = db.prepare("SELECT id FROM classification_batches WHERE imported_at IS NULL").all() as { id: string }[];
  if (pending.length && !args.force) {
    throw new Error(`${pending.length} batch(es) not yet collected; run \`classify collect\` first (or pass --force).`);
  }
  const posts = selectPosts();
  if (!posts.length) {
    log("Nothing to classify.");
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < posts.length; i += BATCH_CHUNK) {
    const chunk = posts.slice(i, i + BATCH_CHUNK);
    const batch = await client.messages.batches.create({
      requests: chunk.map((p) => ({ custom_id: p.id, params: buildParams(db, p) })),
    });
    db.prepare(
      "INSERT INTO classification_batches (id, model, prompt_version, status, request_count) VALUES (?, ?, ?, ?, ?)",
    ).run(batch.id, CLASSIFIER_MODEL, PROMPT_VERSION, batch.processing_status, chunk.length);
    ids.push(batch.id);
    log(`Submitted ${batch.id} with ${chunk.length} posts`);
  }
  return ids;
}

async function collect() {
  const batches = db
    .prepare("SELECT id, model, prompt_version FROM classification_batches WHERE imported_at IS NULL")
    .all() as { id: string; model: string; prompt_version: string }[];
  if (!batches.length) return log("No batches waiting to be collected.");
  for (const b of batches) {
    const batch = await client.messages.batches.retrieve(b.id);
    db.prepare("UPDATE classification_batches SET status = ? WHERE id = ?").run(batch.processing_status, b.id);
    if (batch.processing_status !== "ended") {
      const c = batch.request_counts;
      log(`${b.id}: ${batch.processing_status} (${c.succeeded + c.errored}/${c.processing + c.succeeded + c.errored} done)`);
      continue;
    }
    const counts = { saved: 0, pain: 0, failed: 0 };
    const failures: Record<string, number> = {};
    const save = db.transaction((postId: string, message: Anthropic.Message) => {
      const c = parseClassification(message);
      if (typeof c === "string") {
        counts.failed++;
        failures[c] = (failures[c] ?? 0) + 1;
        return;
      }
      saveClassification(db, postId, c, { model: b.model, promptVersion: b.prompt_version, batchId: b.id });
      counts.saved++;
      if (c.is_pain_point) counts.pain++;
    });
    for await (const r of await client.messages.batches.results(b.id)) {
      if (r.result.type === "succeeded") save(r.custom_id, r.result.message);
      else {
        counts.failed++;
        failures[r.result.type] = (failures[r.result.type] ?? 0) + 1;
      }
    }
    db.prepare("UPDATE classification_batches SET ended_at = unixepoch(), imported_at = unixepoch() WHERE id = ?").run(b.id);
    log(
      `${b.id}: saved ${counts.saved} (${counts.pain} pain points), failed ${counts.failed}` +
        (counts.failed ? ` ${JSON.stringify(failures)}; failed posts are resubmitted on the next submit` : ""),
    );
  }
}

async function waitForBatches(ids: string[]) {
  for (;;) {
    const states = await Promise.all(ids.map((id) => client.messages.batches.retrieve(id)));
    const done = states.filter((s) => s.processing_status === "ended").length;
    if (done === ids.length) return;
    const processing = states.reduce((n, s) => n + s.request_counts.processing, 0);
    log(`${done}/${ids.length} batches ended; ${processing} requests processing`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

try {
  switch (cmd) {
    case "estimate":
      await estimate();
      break;
    case "submit":
      await submit();
      break;
    case "collect":
      await collect();
      break;
    case "run": {
      const ids = await submit();
      if (ids.length) {
        await waitForBatches(ids);
        await collect();
      }
      break;
    }
    default:
      console.error("usage: classify estimate|submit|collect|run [--sub NAME] [--only threads|feeds] [--limit N]");
      process.exitCode = 1;
  }
} finally {
  closeDb();
}
