import assert from "node:assert/strict";
import { test } from "node:test";
import { getDb } from "../db/index.js";
import { addSource, listSources } from "../sources/repo.js";
import { discoveryJobs, runDiscoveryJob } from "./discover.js";
import type { SearchClient, SearchResult } from "./search.js";

function fakeSearch(results: SearchResult[]) {
  const calls: { q: string; freshness?: string }[] = [];
  const client = {
    name: "fake",
    pageSize: 20,
    queries: 0,
    subredditQuery: (sub: string, text: string) => `site:reddit.com r/${sub} ${text}`,
    search: async (q: string, opts: { freshness?: string } = {}) => (calls.push({ q, ...opts }), results),
  } satisfies SearchClient;
  return { client, calls };
}

test("discovery queues threads from the queried subreddit only, then refreshes incrementally", async () => {
  const db = getDb(":memory:");
  addSource(db, { type: "subreddit", subreddit: "Accounting", vertical: "accounting" });
  const { client, calls } = fakeSearch([
    { url: "https://www.reddit.com/r/Accounting/comments/aaa111/month_end/", title: "", description: "so tedious" },
    { url: "https://www.reddit.com/r/Bookkeeping/comments/bbb222/other_sub/", title: "", description: "" },
    { url: "https://www.reddit.com/r/Accounting/", title: "", description: "" },
  ]);
  const job = discoveryJobs(listSources(db), client)[0]!;
  assert.match(job.query, /^site:reddit\.com r\/Accounting "/);
  assert.match(job.listing, /^search:/);

  assert.equal(await runDiscoveryJob(db, client, job), 1);
  assert.deepEqual(db.prepare("SELECT post_id, subreddit, rank, snippet FROM thread_requests").all(), [
    { post_id: "aaa111", subreddit: "Accounting", rank: 0, snippet: "so tedious" },
  ]);
  assert.equal(calls[0]!.freshness, undefined);

  // Within refresh_days: skipped without a query.
  assert.equal(await runDiscoveryJob(db, client, job), null);
  assert.equal(calls.length, 1);

  // Forced re-run searches only since the last run and doesn't duplicate queued threads.
  assert.equal(await runDiscoveryJob(db, client, job, true), 0);
  assert.match(calls[1]!.freshness ?? "", /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/);
});
