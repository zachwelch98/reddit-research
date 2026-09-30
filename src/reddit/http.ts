// Polite fetcher for reddit.com. Unauthenticated RSS allows roughly one request per rate-limit
// window (x-ratelimit-remaining hits 0 after a single request), so we pace strictly by the
// x-ratelimit-* headers and back off on 429/5xx.

export class BudgetExhausted extends Error {
  constructor() {
    super("Request budget for this run is exhausted");
  }
}

export type FetchResult = { status: number; body: string | null };

type Options = {
  userAgent: string;
  maxRequests?: number; // per-process budget; Infinity when omitted
  minIntervalMs?: number;
  log?: (msg: string) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedditHttp {
  requests = 0;
  private nextAllowedAt = 0;
  private readonly opts: Required<Options>;

  constructor(opts: Options) {
    this.opts = { maxRequests: Infinity, minIntervalMs: 2000, log: console.log, ...opts };
  }

  get remainingBudget() {
    return this.opts.maxRequests - this.requests;
  }

  // Returns body for 2xx, null body for 403/404 (private, banned, or deleted). Throws on anything else.
  // The budget counts logical requests; rate-limit retries of the same URL don't use it up.
  async get(url: string): Promise<FetchResult> {
    if (this.requests >= this.opts.maxRequests) throw new BudgetExhausted();
    this.requests++;
    for (let attempt = 1; ; attempt++) {
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) await sleep(wait);

      const res = await fetch(url, {
        headers: { "User-Agent": this.opts.userAgent, Accept: "application/atom+xml, application/json" },
        redirect: "follow",
      });
      this.scheduleNext(res);

      if (res.ok) return { status: res.status, body: await res.text() };
      if (res.status === 403 || res.status === 404) return { status: res.status, body: null };

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) throw new Error(`GET ${url} → HTTP ${res.status}`);

      const backoffMs = res.status === 429 ? this.resetMs(res) ?? 60_000 : 30_000 * attempt;
      this.opts.log(`  HTTP ${res.status}, retrying in ${Math.round(backoffMs / 1000)}s (attempt ${attempt})`);
      this.nextAllowedAt = Math.max(this.nextAllowedAt, Date.now() + backoffMs);
    }
  }

  private scheduleNext(res: Response) {
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const reset = this.resetMs(res);
    const delay = reset != null && Number.isFinite(remaining) && remaining < 1 ? reset : this.opts.minIntervalMs;
    this.nextAllowedAt = Date.now() + delay;
  }

  // x-ratelimit-reset / retry-after are in seconds; add 1s of slack for clock skew.
  private resetMs(res: Response): number | null {
    const raw = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset");
    const secs = raw == null ? NaN : Number(raw);
    return Number.isFinite(secs) ? (secs + 1) * 1000 : null;
  }
}
