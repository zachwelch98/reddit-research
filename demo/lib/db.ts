import "server-only";
import { resolve } from "node:path";
import { openDb, type DB } from "./store";

let db: DB | undefined;

export function getDb(): DB {
  return (db ??= openDb(resolve(/* turbopackIgnore: true */ process.cwd(), "data/demo.db")));
}

export const today = () => new Date().toISOString().slice(0, 10);
