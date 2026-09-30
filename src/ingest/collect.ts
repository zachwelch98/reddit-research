// npm run collect -- [--only discover|threads|feeds] [--sub NAME]... [--order A,B,...] [--max-requests N] [--max-queries N] [--force]
//
// 1. discover  web-search pain phrases → thread_requests         (needs YOU_API_KEY or BRAVE_SEARCH_API_KEY)
// 2. feeds     /r/{sub}/new/.rss: backfill on first run, delta afterwards (bounded: ≤10 requests/sub)
// 3. threads   fetch queued threads (post + top comments) via RSS (1 Reddit request each; the long tail)
//
// When feeds and threads both run, they go subreddit by subreddit (feed, then that subreddit's threads),
// so each subreddit is complete before the next starts. --order puts the listed subreddits first, in that
// order (names may be subreddits or verticals); the rest follow in their usual order. Every step is resumable and incremental, so re-running is always safe.
import { parseArgs } from "node:util";
import { searchEnv, userAgentEnv } from "../config.js";
import { closeDb, getDb } from "../db/index.js";
import { BudgetExhausted, RedditHttp } from "../reddit/http.js";
import { listSources } from "../sources/repo.js";
import { BraveClient } from "./brave.js";
import { SearchAuthError, SearchQuotaExhausted, type SearchClient } from "./search.js";
import { YouClient } from "./you.js";
import { discoveryJobs, runDiscoveryJob } from "./discover.js";
import { collectFeed } from "./feeds.js";
import { fetchThread, pendingThreads } from "./threads.js";

const STEPS = ["discover", "feeds", "threads"] as const;
type Step = (typeof STEPS)[number];

const { values: args } = parseArgs({
  options: {
    only: { type: "string", multiple: true },
    sub: { type: "string", multiple: true },
    order: { type: "string" },
    "max-requests": { type: "string" },
    "max-queries": { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const steps = new Set<Step>((args.only as Step[] | undefined) ?? STEPS);
for (const s of steps) if (!STEPS.includes(s)) throw new Error(`--only must be one of ${STEPS.join(", ")}`);
const normSub = (s: string) => s.trim().replace(/^r\//i, "").toLowerCase();
const subFilter = args.sub?.map(normSub);
const order = args.order?.split(",").map(normSub).filter(Boolean) ?? [];
const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

const db = getDb();
const http = new RedditHttp({
  userAgent: userAgentEnv().REDDIT_USER_AGENT,
  maxRequests: args["max-requests"] ? Number(args["max-requests"]) : Infinity,
  log,
});
// --order entries may name a subreddit or a vertical; a subreddit's own entry wins over its vertical's.
const allSources = listSources(db, { enabledOnly: true });
const verticalOf = new Map(allSources.map((s) => [s.subreddit.toLowerCase(), s.vertical?.toLowerCase()]));
const orderRank = (sub: string) => {
  const key = sub.toLowerCase();
  const vertical = verticalOf.get(key);
  const i = order.indexOf(key);
  const j = vertical ? order.indexOf(vertical) : -1;
  return i >= 0 ? i : j >= 0 ? j : order.length;
};
const unknown = order.filter((o) => !verticalOf.has(o) && ![...verticalOf.values()].includes(o));
if (unknown.length) throw new Error(`--order: unknown subreddit or vertical: ${unknown.join(", ")}`);
const sources = allSources
  .filter((s) => !subFilter || subFilter.includes(s.subreddit.toLowerCase()))
  .sort((a, b) => orderRank(a.subreddit) - orderRank(b.subreddit));
const stats = { discover: { queries: 0, queued: 0 }, threads: { fetched: 0, failed: 0 }, newPosts: 0 };
const countPosts = () => (db.prepare("SELECT count(*) AS n FROM posts").get() as { n: number }).n;
const postsBefore = countPosts();
const { id: runId } = db.prepare("INSERT INTO runs (kind) VALUES ('collect') RETURNING id").get() as { id: number };

let status: "ok" | "failed" = "ok";
let interrupted = false;
process.on("SIGINT", () => {
  if (interrupted) process.exit(130);
  interrupted = true;
  log("Stopping after the current request (Ctrl-C again to force)…");
});

try {
  if (steps.has("discover")) await discover();
  if (steps.has("feeds") && steps.has("threads")) await perSubreddit();
  else if (steps.has("feeds")) await feeds();
  else if (steps.has("threads")) await fetchThreads(threadQueue(), "all");
} catch (e) {
  if (e instanceof BudgetExhausted) log(`Reddit request budget reached (${http.requests}); run again to continue.`);
  else {
    status = "failed";
    throw e;
  }
} finally {
  stats.newPosts = countPosts() - postsBefore;
  db.prepare("UPDATE runs SET finished_at = unixepoch(), status = ?, stats = ? WHERE id = ?").run(
    status, JSON.stringify({ ...stats, redditRequests: http.requests }), runId,
  );
  log(`Done. ${JSON.stringify(stats)}; ${http.requests} Reddit requests.`);
  closeDb();
}

async function discover() {
  const { YOU_API_KEY, BRAVE_SEARCH_API_KEY } = searchEnv();
  const max = args["max-queries"] ? Number(args["max-queries"]) : Infinity;
  const client: SearchClient | null = YOU_API_KEY
    ? new YouClient(YOU_API_KEY, max)
    : BRAVE_SEARCH_API_KEY
      ? new BraveClient(BRAVE_SEARCH_API_KEY, max)
      : null;
  if (!client) return log("discover: no YOU_API_KEY or BRAVE_SEARCH_API_KEY set, skipping.");
  const jobs = discoveryJobs(sources, client);
  log(`discover: ${jobs.length} queries eligible (${client.name})`);
  try {
    for (const job of jobs) {
      if (interrupted) return;
      const queued = await runDiscoveryJob(db, client, job, args.force);
      if (queued == null) continue;
      stats.discover.queued += queued;
      log(`  ${job.query} → +${queued} threads`);
    }
  } catch (e) {
    if (e instanceof SearchAuthError) return log(`discover: ${e.message}. Skipping discovery.`);
    if (!(e instanceof SearchQuotaExhausted)) throw e;
    log(`discover: ${e.message}; remaining queries resume next run.`);
  } finally {
    stats.discover.queries = client.queries;
  }
}

type Pending = ReturnType<typeof pendingThreads>[number];

function threadQueue(): Pending[] {
  const subs = subFilter && new Set(subFilter);
  return pendingThreads(db)
    .filter((t) => !subs || subs.has(t.subreddit.toLowerCase()))
    .sort((a, b) => orderRank(a.subreddit) - orderRank(b.subreddit));
}

async function fetchThreads(queue: Pending[], label: string) {
  log(`threads (${label}): ${queue.length} queued (~${queue.length} min at Reddit's RSS rate limit)`);
  for (const t of queue) {
    if (interrupted) return;
    const r = await fetchThread(db, http, t);
    r.ok ? stats.threads.fetched++ : stats.threads.failed++;
    log(`  r/${t.subreddit}/${t.post_id}: ${r.ok ? `${r.comments} comments` : "failed"}`);
  }
}

async function feeds() {
  const subs = sources.filter((s) => s.type === "subreddit");
  log(`feeds: ${subs.length} subreddits`);
  for (const s of subs) {
    if (interrupted) return;
    await collectFeed(db, http, s, log);
  }
}

async function perSubreddit() {
  const queue = threadQueue();
  const subs = sources.filter((s) => s.type === "subreddit");
  log(`feeds + threads by subreddit: ${subs.length} subreddits, ${queue.length} threads queued`);
  log(`  order: ${subs.map((s) => s.subreddit).join(", ")}`);
  const done = new Set<string>();
  for (const s of subs) {
    if (interrupted) return;
    const key = s.subreddit.toLowerCase();
    await collectFeed(db, http, s, log);
    if (interrupted) return;
    await fetchThreads(queue.filter((t) => t.subreddit.toLowerCase() === key), `r/${s.subreddit}`);
    done.add(key);
  }
  // Threads queued for subreddits that aren't enabled sources (e.g. manual thread URLs).
  const rest = queue.filter((t) => !done.has(t.subreddit.toLowerCase()));
  if (rest.length && !interrupted) await fetchThreads(rest, "other subreddits");
}
