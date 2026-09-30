import { SearchAuthError, SearchQuotaExhausted, sleep, type SearchClient, type SearchResult } from "./search.js";

// You.com Search API (https://ydc-index.io/v1/search). Up to 100 results per call.
// Path-scoped `site:reddit.com/r/x` returns nothing here, so scope with `site:reddit.com r/x`.
const ENDPOINT = "https://ydc-index.io/v1/search";
const MIN_INTERVAL_MS = 1100;

export class YouClient implements SearchClient {
  readonly name = "you.com";
  readonly pageSize = 100;
  queries = 0;
  private nextAllowedAt = 0;

  constructor(
    private apiKey: string,
    private maxQueries = Infinity,
  ) {}

  subredditQuery(subreddit: string, text: string) {
    return `site:reddit.com r/${subreddit} ${text}`;
  }

  async search(q: string, opts: { offset?: number; freshness?: string } = {}): Promise<SearchResult[]> {
    for (let attempt = 1; ; attempt++) {
      if (this.queries >= this.maxQueries) throw new SearchQuotaExhausted("search query budget for this run is used up");
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) await sleep(wait);

      const params = new URLSearchParams({ query: q, count: String(this.pageSize), offset: String(opts.offset ?? 0) });
      if (opts.freshness) params.set("freshness", opts.freshness);
      this.queries++;
      const res = await fetch(`${ENDPOINT}?${params}`, { headers: { "X-API-Key": this.apiKey } });
      this.nextAllowedAt = Date.now() + MIN_INTERVAL_MS;

      if (res.ok) {
        const json = (await res.json()) as { results?: { web?: SearchResult[] } };
        return json.results?.web ?? [];
      }
      if (res.status === 401 || res.status === 403) {
        throw new SearchAuthError(`You.com rejected YOU_API_KEY (HTTP ${res.status})`);
      }
      if (res.status === 429 && attempt < 3) {
        this.nextAllowedAt = Date.now() + 5000 * attempt;
        continue;
      }
      if (res.status === 402 || res.status === 429) throw new SearchQuotaExhausted(`You.com HTTP ${res.status}: out of credits or rate limited`);
      throw new Error(`You.com search failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
}
