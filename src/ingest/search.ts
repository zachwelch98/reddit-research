// Web search providers used for thread discovery. Each knows its own query syntax and page size.

export type SearchResult = { url: string; title: string; description: string };

export interface SearchClient {
  readonly name: string;
  readonly pageSize: number;
  queries: number;
  // Query restricted to one subreddit; provider-specific site: syntax.
  subredditQuery(subreddit: string, text: string): string;
  // freshness: "YYYY-MM-DDtoYYYY-MM-DD" date range (both providers accept this form)
  search(q: string, opts?: { offset?: number; freshness?: string }): Promise<SearchResult[]>;
}

// Both stop discovery for this run without failing the other collection steps.
export class SearchQuotaExhausted extends Error {}
export class SearchAuthError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
