// npm run embed
// Embeds problem_summary for every pain point that has no embedding yet (or whose summary changed
// after reclassification). Vectors go into the sqlite-vec table vec_pain_points.
import { voyageEnv } from "../config.js";
import { closeDb, getDb } from "../db/index.js";
import { EMBED_BATCH, embed } from "./voyage.js";

const db = getDb();
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

const todo = db
  .prepare(
    `SELECT c.post_id, c.problem_summary FROM classifications c
     LEFT JOIN embeddings_meta e ON e.post_id = c.post_id
     WHERE c.is_pain_point = 1 AND c.problem_summary IS NOT NULL
       AND (e.post_id IS NULL OR e.source_text <> c.problem_summary)`,
  )
  .all() as { post_id: string; problem_summary: string }[];
log(`${todo.length} pain points to embed`);

const delVec = db.prepare("DELETE FROM vec_pain_points WHERE post_id = ?");
const insVec = db.prepare("INSERT INTO vec_pain_points (post_id, embedding) VALUES (?, ?)");
const insMeta = db.prepare(
  "INSERT OR REPLACE INTO embeddings_meta (post_id, model, source_text, embedded_at) VALUES (?, ?, ?, unixepoch())",
);

try {
  for (let i = 0; i < todo.length; i += EMBED_BATCH) {
    const chunk = todo.slice(i, i + EMBED_BATCH);
    const vectors = await embed(chunk.map((t) => t.problem_summary), "document");
    db.transaction(() => {
      chunk.forEach((t, j) => {
        delVec.run(t.post_id); // vec0 has no upsert
        insVec.run(t.post_id, vectors[j]!);
        insMeta.run(t.post_id, voyageEnv().VOYAGE_MODEL, t.problem_summary);
      });
    })();
    log(`  embedded ${Math.min(i + EMBED_BATCH, todo.length)}/${todo.length}`);
  }
} finally {
  closeDb();
}
