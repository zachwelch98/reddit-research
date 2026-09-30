import type { DB } from "./index.js";

export type CrawlState = {
  source_id: number;
  listing: string;
  newest_id: string | null;
  newest_created_utc: number | null;
  resume_after: string | null;
  last_run_at: number | null;
  last_completed_at: number | null;
};

export function getCrawlState(db: DB, sourceId: number, listing: string): CrawlState | undefined {
  return db.prepare("SELECT * FROM crawl_state WHERE source_id = ? AND listing = ?").get(sourceId, listing) as
    | CrawlState
    | undefined;
}

export function saveCrawlState(
  db: DB,
  sourceId: number,
  listing: string,
  patch: Partial<Omit<CrawlState, "source_id" | "listing">>,
) {
  const cur = getCrawlState(db, sourceId, listing);
  const next = { ...cur, source_id: sourceId, listing, last_run_at: Math.floor(Date.now() / 1000), ...patch };
  db.prepare(
    `INSERT OR REPLACE INTO crawl_state
       (source_id, listing, newest_id, newest_created_utc, resume_after, last_run_at, last_completed_at)
     VALUES (@source_id, @listing, @newest_id, @newest_created_utc, @resume_after, @last_run_at, @last_completed_at)`,
  ).run({ newest_id: null, newest_created_utc: null, resume_after: null, last_completed_at: null, ...next });
}
