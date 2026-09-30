import type { DB } from "../db/index.js";
import { linkPostSource, replaceComments, upsertRssPost } from "../db/posts.js";
import type { RedditHttp } from "../reddit/http.js";
import { parseFeed } from "../reddit/rss.js";

const MAX_ATTEMPTS = 3;

type Pending = { post_id: string; subreddit: string };

// Queue order: discovery batch (hour it was queued), then best search rank, then newest thread
// (base36 ids grow over time). Without this, the oldest threads would be fetched first.

export function pendingThreads(db: DB, limit = -1): Pending[] {
  return db
    .prepare(
      `SELECT r.post_id, min(r.subreddit) AS subreddit
       FROM thread_requests r LEFT JOIN thread_fetches f ON f.post_id = r.post_id
       WHERE f.fetched_at IS NULL AND COALESCE(f.attempts, 0) < ${MAX_ATTEMPTS}
       GROUP BY r.post_id ORDER BY min(r.requested_at / 3600), min(r.rank), r.post_id DESC LIMIT ?`,
    )
    .all(limit) as Pending[];
}

// Fetches post + top comments for each requested thread via /comments/{id}/.rss (1 request each).
export async function fetchThread(db: DB, http: RedditHttp, t: Pending) {
  const res = await http.get(
    `https://www.reddit.com/r/${t.subreddit}/comments/${t.post_id}/.rss?limit=100&sort=top`,
  );
  const feed = res.body ? parseFeed(res.body) : null;
  const post = feed?.posts.find((p) => p.id === t.post_id);

  db.transaction(() => {
    if (feed && post) {
      upsertRssPost(db, post);
      replaceComments(db, post.id, feed.comments);
      const reqs = db
        .prepare("SELECT source_id, reason FROM thread_requests WHERE post_id = ? AND source_id IS NOT NULL")
        .all(post.id) as { source_id: number; reason: string }[];
      for (const r of reqs) linkPostSource(db, post.id, r.source_id, r.reason);
    }
    db.prepare(
      `INSERT INTO thread_fetches (post_id, attempts, last_status, last_error, fetched_at)
       VALUES (@id, 1, @status, @error, @fetched)
       ON CONFLICT (post_id) DO UPDATE SET attempts = attempts + 1, last_status = excluded.last_status,
         last_error = excluded.last_error, fetched_at = excluded.fetched_at`,
    ).run({
      id: t.post_id,
      status: res.status,
      error: post ? null : res.body ? "post missing from feed" : `HTTP ${res.status}`,
      fetched: post ? Math.floor(Date.now() / 1000) : null,
    });
  })();
  return { ok: !!post, comments: feed?.comments.length ?? 0 };
}
