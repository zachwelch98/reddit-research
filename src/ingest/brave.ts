// Brave Search web API. Free tier: 1 query/sec and a monthly quota, both reported in
// X-RateLimit-Remaining as "<per-second>, <per-month>".

import { SearchAuthError, SearchQuotaExhausted, sleep, type SearchClient, type SearchResult } from "./search.js";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const MIN_INTERVAL_MS = 1100;
export class BraveClient implements SearchClient {
  readonly name = "brave";
  readonly pageSize = 20;
  queries = 0;
  monthlyRemaining: number | null = null;
  private nextAllowedAt = 0;

  constructor(
    private apiKey: string,
    private maxQueries = Infinity,
  ) {}

  subredditQuery(subreddit: string, text: string) {
    return `site:reddit.com/r/${subreddit} ${text}`;
  }

  async search(q: string, opts: { offset?: number; freshness?: string } = {}): Promise<SearchResult[]> {
    for (let attempt = 1; ; attempt++) {
      if (this.queries >= this.maxQueries) throw new SearchQuotaExhausted("Brave query budget for this run is used up");
      if (this.monthlyRemaining != null && this.monthlyRemaining < 1) {
        throw new SearchQuotaExhausted("Brave monthly quota is used up");
      }
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) await sleep(wait);

      const params = new URLSearchParams({ q, count: "20", offset: String(opts.offset ?? 0) });
      if (opts.freshness) params.set("freshness", opts.freshness);
      this.queries++;
      const res = await fetch(`${ENDPOINT}?${params}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      });
      this.nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
      const monthly = Number(res.headers.get("x-ratelimit-remaining")?.split(",")[1]);
      if (Number.isFinite(monthly)) this.monthlyRemaining = monthly;

      if (res.ok) {
        const json = (await res.json()) as { web?: { results?: SearchResult[] } };
        return json.web?.results ?? [];
      }
      if (res.status === 429 && attempt < 3) {
        const reset = Number(res.headers.get("x-ratelimit-reset")?.split(",")[0]);
        this.nextAllowedAt = Date.now() + (Number.isFinite(reset) ? reset + 1 : 2) * 1000;
        continue;
      }
      if ([401, 403, 422].includes(res.status)) {
        throw new SearchAuthError(`Brave rejected BRAVE_SEARCH_API_KEY (HTTP ${res.status}); check the key at api.search.brave.com`);
      }
      if (res.status === 429 || res.status === 402) throw new SearchQuotaExhausted(`Brave HTTP ${res.status}: quota exhausted`);
      throw new Error(`Brave search failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
}
