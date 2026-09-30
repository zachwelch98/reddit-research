import { closeDb, getDb } from "./db/index.js";
import { pendingThreads } from "./ingest/threads.js";

const db = getDb();
const one = (sql: string) => Object.values(db.prepare(sql).get() as object)[0];

console.table({
  sources: { count: one("SELECT count(*) FROM sources WHERE enabled = 1") },
  "subreddits backfilled": {
    count: `${one("SELECT count(*) FROM sources WHERE type = 'subreddit' AND enabled = 1 AND backfilled_at IS NOT NULL")} / ${one("SELECT count(*) FROM sources WHERE type = 'subreddit' AND enabled = 1")}`,
  },
  posts: { count: one("SELECT count(*) FROM posts") },
  "posts with comments": { count: one("SELECT count(*) FROM posts WHERE comments_fetched_at IS NOT NULL") },
  comments: { count: one("SELECT count(*) FROM comments") },
  "threads queued": { count: pendingThreads(db).length },
  "discovery queries run": { count: one("SELECT count(*) FROM crawl_state WHERE listing LIKE 'search:%'") },
});
const last = db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 3").all();
if (last.length) console.table(last);
closeDb();
