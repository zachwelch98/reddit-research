import type { DB } from "../db/index.js";

export type SourceType = "subreddit" | "thread" | "search";

export type NewSource = {
  type: SourceType;
  subreddit: string;
  query?: string | null;
  post_id?: string | null;
  vertical?: string | null;
};

export type Source = Required<NewSource> & {
  id: number;
  discover: number;
  enabled: number;
  added_at: number;
  backfilled_at: number | null;
};

// Upsert on the identity index. Leaves enabled/backfilled_at alone, so re-adding never resets
// crawl progress. A thread source also queues its thread for fetching.
export function addSource(db: DB, s: NewSource): number {
  const { id } = db
    .prepare(
      `INSERT INTO sources (type, subreddit, query, post_id, vertical)
       VALUES (@type, @subreddit, @query, @post_id, @vertical)
       ON CONFLICT (type, COALESCE(lower(subreddit), ''), COALESCE(query, ''), COALESCE(post_id, ''))
       DO UPDATE SET vertical = COALESCE(excluded.vertical, sources.vertical)
       RETURNING id`,
    )
    .get({ query: null, post_id: null, vertical: null, ...s }) as { id: number };

  if (s.type === "thread" && s.post_id) {
    db.prepare(
      `INSERT OR IGNORE INTO thread_requests (post_id, subreddit, source_id, reason) VALUES (?, ?, ?, 'manual')`,
    ).run(s.post_id, s.subreddit, id);
  }
  return id;
}

export function listSources(db: DB, opts: { type?: SourceType; enabledOnly?: boolean } = {}): Source[] {
  return db
    .prepare(
      `SELECT * FROM sources
       WHERE (@type IS NULL OR type = @type) AND (@enabledOnly = 0 OR enabled = 1)
       ORDER BY type, vertical, lower(subreddit)`,
    )
    .all({ type: opts.type ?? null, enabledOnly: opts.enabledOnly ? 1 : 0 }) as Source[];
}

export function setSourceEnabled(db: DB, id: number, enabled: boolean) {
  return db.prepare("UPDATE sources SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id).changes;
}
