import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const SourcesFile = z.object({
  rss: z.object({ backfill_pages: z.number().int().min(1).max(10) }),
  discovery: z.object({
    refresh_days: z.number().positive(),
    pages_per_query: z.number().int().min(1).max(10),
    phrases: z.array(z.string().min(1)),
  }),
  subreddits: z.record(z.string(), z.array(z.string())),
  threads: z.array(z.string()).default([]),
  searches: z
    .array(z.object({ subreddit: z.string(), query: z.string(), vertical: z.string().optional() }))
    .default([]),
});
export type SourcesFile = z.infer<typeof SourcesFile>;

export const SOURCES_PATH = "config/sources.yaml";

let cached: SourcesFile | undefined;
export function loadSourcesFile(path = SOURCES_PATH): SourcesFile {
  return (cached ??= SourcesFile.parse(parse(readFileSync(path, "utf8"))));
}
