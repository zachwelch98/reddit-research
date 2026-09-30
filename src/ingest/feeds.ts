import type { DB } from "../db/index.js";
import { getCrawlState, saveCrawlState } from "../db/crawlState.js";
import { linkPostSource, upsertRssPost } from "../db/posts.js";
import type { RedditHttp } from "../reddit/http.js";
import { parseFeed } from "../reddit/rss.js";
import { loadSourcesFile } from "../sources/config.js";
import type { Source } from "../sources/repo.js";

const LISTING = "rss:new";

// Pulls /r/{sub}/new/.rss. First run backfills up to `backfill_pages` pages (resumable);
// later runs page only until they reach a post already seen (the delta).
export async function collectFeed(db: DB, http: RedditHttp, source: Source, log: (m: string) => void) {
  const { backfill_pages } = loadSourcesFile().rss;
  const state = getCrawlState(db, source.id, LISTING);
  const backfill = source.backfilled_at == null;
  const seenUpTo = backfill ? null : state?.newest_created_utc ?? null;
  let after = backfill ? state?.resume_after ?? null : null;
  let newest = state?.newest_created_utc ?? 0;
  let newestId = state?.newest_id ?? null;
  let added = 0;
  let reachedSeen = false;

  for (let page = 0; page < backfill_pages; page++) {
    const url = `https://www.reddit.com/r/${source.subreddit}/new/.rss?limit=100${after ? `&after=${after}` : ""}`;
    const res = await http.get(url);
    if (!res.body) {
      log(`  r/${source.subreddit}: HTTP ${res.status} (private, banned or missing), skipping`);
      return { added, skipped: true };
    }
    const feed = parseFeed(res.body);
    if (feed.posts.length === 0) break;

    db.transaction(() => {
      for (const p of feed.posts) {
        if (upsertRssPost(db, p)) added++;
        linkPostSource(db, p.id, source.id, LISTING);
        if (p.created_utc > newest) [newest, newestId] = [p.created_utc, p.id];
        if (seenUpTo != null && p.created_utc <= seenUpTo) reachedSeen = true;
      }
      after = feed.lastFullname;
      saveCrawlState(db, source.id, LISTING, {
        newest_created_utc: newest || null,
        newest_id: newestId,
        resume_after: backfill ? after : null,
      });
    })();

    if (reachedSeen || feed.posts.length < 100) break;
    if (!backfill && page === backfill_pages - 1) {
      log(`  r/${source.subreddit}: ${backfill_pages} pages of new posts without reaching the last run; refresh more often`);
    }
  }

  db.transaction(() => {
    saveCrawlState(db, source.id, LISTING, { resume_after: null, last_completed_at: Math.floor(Date.now() / 1000) });
    if (backfill) db.prepare("UPDATE sources SET backfilled_at = unixepoch() WHERE id = ?").run(source.id);
  })();
  log(`  r/${source.subreddit}: +${added} new posts${backfill ? " (backfill)" : reachedSeen ? " (stopped at seen post)" : ""}`);
  return { added, skipped: false };
}
