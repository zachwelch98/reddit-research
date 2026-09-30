import type { DB } from "./index.js";
import type { RssComment, RssPost } from "../reddit/rss.js";

// Upserts a post; returns true when it's new. Removed/deleted posts have their content scrubbed.
export function upsertRssPost(db: DB, p: RssPost): boolean {
  const exists = db.prepare("SELECT 1 FROM posts WHERE id = ?").get(p.id) != null;
  db.prepare(
    `INSERT INTO posts (id, subreddit, author, title, selftext, url, permalink, is_self, created_utc, ingest_method, is_removed)
     VALUES (@id, @subreddit, @author, @title, @selftext, @url, @permalink, @is_self, @created_utc, 'rss', @is_removed)
     ON CONFLICT (id) DO UPDATE SET
       title = excluded.title, selftext = excluded.selftext, author = excluded.author,
       is_removed = excluded.is_removed, last_seen_at = unixepoch()`,
  ).run(scrub(p));
  return !exists;
}

function scrub(p: RssPost) {
  const base = { ...p, is_self: p.url ? 0 : 1, is_removed: p.is_removed ? 1 : 0 };
  return p.is_removed ? { ...base, author: null, title: "[removed]", selftext: null, url: null } : base;
}

export function linkPostSource(db: DB, postId: string, sourceId: number, listing: string) {
  db.prepare("INSERT OR IGNORE INTO post_sources (post_id, source_id, listing) VALUES (?, ?, ?)").run(
    postId, sourceId, listing,
  );
}

// Replaces the thread's comment set with the latest fetch (drops comments deleted since last time).
export function replaceComments(db: DB, postId: string, comments: RssComment[]) {
  const ids = comments.map((c) => c.id);
  db.prepare(
    `DELETE FROM comments WHERE post_id = ? AND id NOT IN (SELECT value FROM json_each(?))`,
  ).run(postId, JSON.stringify(ids));
  const upsert = db.prepare(
    `INSERT INTO comments (id, post_id, author, body, position, created_utc)
     VALUES (@id, @post_id, @author, @body, @position, @created_utc)
     ON CONFLICT (id) DO UPDATE SET body = excluded.body, position = excluded.position, last_seen_at = unixepoch()`,
  );
  for (const c of comments) upsert.run({ ...c, post_id: postId });
  db.prepare("UPDATE posts SET comments_fetched_at = unixepoch(), comments_fetched_n = ? WHERE id = ?").run(
    comments.length, postId,
  );
}
