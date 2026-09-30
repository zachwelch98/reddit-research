import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dbEnv } from "../config.js";

export type DB = Database.Database;

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

let instance: DB | undefined;

export function getDb(path = dbEnv().DB_PATH): DB {
  if (instance) return instance;
  const file = path === ":memory:" ? path : resolve(path);
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  sqliteVec.load(db);

  db.exec(SCHEMA);
  migrate(db);
  ensureVectorTable(db, dbEnv().EMBEDDING_DIM);

  instance = db;
  return db;
}

// Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS won't add them to an
// existing database, so add any that are missing.
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ["classifications", "emotional_intensity", "INTEGER"],
  ["classifications", "rationale", "TEXT"],
  ["clusters", "who", "TEXT"],
  ["clusters", "avg_emotional_intensity", "REAL"],
  ["clusters", "labeled_size", "INTEGER"],
];

function migrate(db: DB) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// sqlite-vec virtual table; the dimension is fixed at creation, so refuse a mismatch loudly.
function ensureVectorTable(db: DB, dim: number) {
  const existing = db
    .prepare("SELECT sql FROM sqlite_master WHERE name = 'vec_pain_points'")
    .get() as { sql: string } | undefined;
  if (!existing) {
    db.exec(
      `CREATE VIRTUAL TABLE vec_pain_points USING vec0(post_id TEXT PRIMARY KEY, embedding float[${dim}] distance_metric=cosine)`,
    );
    return;
  }
  if (!existing.sql.includes(`float[${dim}]`)) {
    throw new Error(
      `vec_pain_points was created with a different dimension than EMBEDDING_DIM=${dim}. Drop it and re-embed.`,
    );
  }
}

export function closeDb() {
  instance?.close();
  instance = undefined;
}
