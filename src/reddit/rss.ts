import { XMLParser } from "fast-xml-parser";
import { convert } from "html-to-text";
import { stripPrefix } from "./ids.js";

// Reddit Atom feeds: /r/{sub}/new/.rss (posts) and /r/{sub}/comments/{id}/.rss (post + comments).
// RSS carries text, author and timestamps only: no scores, comment counts, or reply structure.

export type RssPost = {
  id: string;
  subreddit: string;
  author: string | null;
  title: string;
  selftext: string | null;
  url: string | null; // external link for link posts; null for self posts
  permalink: string;
  created_utc: number;
  is_removed: boolean;
};

export type RssComment = {
  id: string;
  author: string | null;
  body: string;
  created_utc: number;
  position: number;
};

export type ParsedFeed = { posts: RssPost[]; comments: RssComment[]; lastFullname: string | null };

type AtomEntry = {
  id: string;
  title?: string;
  author?: { name?: string };
  category?: { "@_term"?: string };
  link?: { "@_href"?: string };
  content?: { "#text"?: string } | string;
  published?: string;
  updated?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "entry",
  parseTagValue: false,
  htmlEntities: true,
});

const REMOVED = new Set(["[removed]", "[deleted]", "[deleted by user]"]);

export function parseFeed(xml: string): ParsedFeed {
  const entries: AtomEntry[] = parser.parse(xml)?.feed?.entry ?? [];
  const posts: RssPost[] = [];
  const comments: RssComment[] = [];

  for (const e of entries) {
    const html = typeof e.content === "string" ? e.content : e.content?.["#text"] ?? "";
    const author = e.author?.name?.replace(/^\/u\//, "") ?? null;
    const permalink = e.link?.["@_href"] ?? "";

    if (e.id.startsWith("t3_")) {
      const selftext = bodyText(html);
      const title = e.title ?? "";
      const linkHref = html.match(/<a href="([^"]+)">\[link\]<\/a>/)?.[1] ?? null;
      posts.push({
        id: stripPrefix(e.id),
        subreddit: e.category?.["@_term"] ?? "",
        author: author === "[deleted]" ? null : author,
        title,
        selftext: selftext || null,
        url: linkHref && linkHref !== permalink ? linkHref : null,
        permalink: new URL(permalink).pathname,
        created_utc: toEpoch(e.published ?? e.updated),
        is_removed: REMOVED.has(selftext) || REMOVED.has(title),
      });
    } else if (e.id.startsWith("t1_")) {
      const body = bodyText(html);
      if (author === "AutoModerator" || REMOVED.has(body)) continue;
      comments.push({
        id: stripPrefix(e.id),
        author: author === "[deleted]" ? null : author,
        body,
        created_utc: toEpoch(e.published ?? e.updated),
        position: comments.length,
      });
    }
  }
  return { posts, comments, lastFullname: entries.at(-1)?.id ?? null };
}

// The markdown body sits between <!-- SC_OFF --> and <!-- SC_ON -->; everything after is the
// "submitted by /u/x [link] [comments]" footer. Link posts have no body.
function bodyText(html: string): string {
  const body = html.match(/<!-- SC_OFF -->([\s\S]*?)<!-- SC_ON -->/)?.[1];
  if (!body) return "";
  return convert(body, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

function toEpoch(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) throw new Error(`Bad timestamp in feed: ${iso}`);
  return Math.floor(t / 1000);
}
