import type Anthropic from "@anthropic-ai/sdk";
import type { DB } from "../db/index.js";
import { CLASSIFIER_MODEL, OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompt.js";

// Bounded context per post: enough to judge the problem, capped so a handful of very long
// threads can't dominate cost. Truncation is marked in the text the model sees.
const MAX_BODY_CHARS = 6000;
const MAX_COMMENTS = 10;
const MAX_COMMENT_CHARS = 800;

export type PostRow = { id: string; subreddit: string; title: string; selftext: string | null };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} […truncated]` : s);

export function renderPost(db: DB, post: PostRow): string {
  const comments = db
    .prepare("SELECT body FROM comments WHERE post_id = ? AND body <> '' ORDER BY position LIMIT ?")
    .all(post.id, MAX_COMMENTS) as { body: string }[];
  const parts = [
    `Subreddit: r/${post.subreddit}`,
    `Title: ${post.title}`,
    `Post:\n${post.selftext ? clip(post.selftext, MAX_BODY_CHARS) : "(no text; link or image post)"}`,
  ];
  if (comments.length) {
    parts.push(`Top comments:\n${comments.map((c, i) => `[${i + 1}] ${clip(c.body, MAX_COMMENT_CHARS)}`).join("\n\n")}`);
  }
  return parts.join("\n\n");
}

export function buildParams(db: DB, post: PostRow): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: CLASSIFIER_MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: renderPost(db, post) }],
  };
}

// Posts not yet classified under the current prompt version. Removed posts and posts with
// neither body nor comments (bare link/image posts) are skipped: there's nothing to judge.
export function unclassifiedPosts(
  db: DB,
  opts: { promptVersion: string; subreddits?: string[]; only?: "threads" | "feeds"; limit?: number; random?: boolean },
): PostRow[] {
  const subs = opts.subreddits?.map((s) => s.toLowerCase());
  return db
    .prepare(
      `SELECT p.id, p.subreddit, p.title, p.selftext FROM posts p
       LEFT JOIN classifications c ON c.post_id = p.id AND c.prompt_version = @pv
       WHERE c.post_id IS NULL AND p.is_removed = 0
         AND (p.selftext IS NOT NULL OR p.comments_fetched_n > 0)
         AND (@subs IS NULL OR lower(p.subreddit) IN (SELECT value FROM json_each(@subs)))
         AND (@only IS NULL OR (@only = 'threads') = (p.comments_fetched_at IS NOT NULL))
       ORDER BY CASE WHEN @random THEN random() END, p.comments_fetched_at IS NULL, p.created_utc DESC
       LIMIT @limit`,
    )
    .all({
      pv: opts.promptVersion,
      subs: subs ? JSON.stringify(subs) : null,
      only: opts.only ?? null,
      limit: opts.limit ?? -1,
      random: opts.random ? 1 : 0,
    }) as PostRow[];
}
