import { getDb, closeDb } from "./index.js";
import { seedSources } from "../sources/seed.js";

const db = getDb();
const seeded = seedSources(db);
const { n } = db.prepare("SELECT count(*) AS n FROM sources").get() as { n: number };
const { v } = db.prepare("SELECT vec_version() AS v").get() as { v: string };
console.log(`DB ready (sqlite-vec ${v}). Seeded ${seeded} sources from config; ${n} total in DB.`);
closeDb();
