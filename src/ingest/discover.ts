import type { DB } from "../db/index.js";
import { getCrawlState, saveCrawlState } from "../db/crawlState.js";
import { parseThreadUrl } from "../reddit/ids.js";
import { loadSourcesFile } from "../sources/config.js";
import type { Source } from "../sources/repo.js";
import type { SearchClient } from "./search.js";

type Job = { source: Source; listing: string; query: string };

const DAY = 86_400;
const isoDate = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);

// One job per (subreddit × standard phrase) plus one per custom search source. Ordered phrase-major
// so a run that hits its query budget still covers every subreddit with the first phrases.
export function discoveryJobs(sources: Source[], client: Pick<SearchClient, "subredditQuery">): Job[] {
  const { phrases } = loadSourcesFile().discovery;
  const subs = sources.filter((s) => s.type === "subreddit" && s.discover);
  const jobs: Job[] = phrases.flatMap((phrase) =>
    subs.map((source) => ({
      source,
      listing: `search:${phrase}`,
      query: client.subredditQuery(source.subreddit, `"${phrase}"`),
    })),
  );
  for (const source of sources.filter((s) => s.type === "search" && s.query)) {
    jobs.push({ source, listing: `search:${source.query}`, query: client.subredditQuery(source.subreddit, source.query!) });
  }
  return jobs;
}

// Runs a job unless it ran within refresh_days. Re-runs only search the window since the last run.
// Returns the number of new threads queued, or null if skipped.
export async function runDiscoveryJob(db: DB, client: SearchClient, job: Job, force = false): Promise<number | null> {
  const { refresh_days, pages_per_query } = loadSourcesFile().discovery;
  const now = Math.floor(Date.now() / 1000);
  const last = getCrawlState(db, job.source.id, job.listing)?.last_completed_at;
  if (last && !force && now - last < refresh_days * DAY) return null;
  const freshness = last ? `${isoDate(last - DAY)}to${isoDate(now)}` : undefined;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO thread_requests (post_id, subreddit, source_id, reason, rank, snippet)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  let queued = 0;
  for (let page = 0; page < pages_per_query; page++) {
    const results = await client.search(job.query, { offset: page, freshness });
    db.transaction(() => {
      results.forEach((r, i) => {
        const ref = parseThreadUrl(r.url);
        // site: filters aren't exact, so keep only threads from the subreddit we asked about.
        if (!ref || ref.subreddit.toLowerCase() !== job.source.subreddit.toLowerCase()) return;
        queued += insert.run(ref.postId, ref.subreddit, job.source.id, job.listing, page * client.pageSize + i, r.description).changes;
      });
    })();
    if (results.length < client.pageSize) break;
  }
  saveCrawlState(db, job.source.id, job.listing, { last_completed_at: now });
  return queued;
}
