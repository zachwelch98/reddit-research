import "server-only";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { resolve } from "node:path";

// Read-only connection: the dashboard, SQL console, and chat can never modify the dataset.
// Safe to use while the collector writes (WAL mode).
let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    const file = resolve(/* turbopackIgnore: true */ process.cwd(), "..", process.env.DB_PATH ?? "data/reddit.db");
    db = new Database(file, { readonly: true, fileMustExist: true });
    db.pragma("query_only = ON");
    sqliteVec.load(db);
  }
  return db;
}

export type Row = Record<string, unknown>;

// Runs one read-only statement (better-sqlite3 rejects multiple statements) with a row cap.
export function runReadOnlySql(sql: string, maxRows = 500): { columns: string[]; rows: Row[]; truncated: boolean } {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with|pragma|explain)\b/i.test(trimmed)) {
    throw new Error("Only SELECT / WITH / PRAGMA / EXPLAIN statements are allowed.");
  }
  const stmt = getDb().prepare(trimmed);
  if (!stmt.reader) throw new Error("Statement returns no rows.");
  const rows: Row[] = [];
  let truncated = false;
  for (const r of stmt.iterate() as IterableIterator<Row>) {
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    rows.push(r);
  }
  return { columns: stmt.columns().map((c) => c.name), rows, truncated };
}

export const redditUrl = (permalink: string) => `https://www.reddit.com${permalink}`;
