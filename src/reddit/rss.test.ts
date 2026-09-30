import assert from "node:assert/strict";
import { test } from "node:test";
import { parseThreadUrl } from "./ids.js";
import { parseFeed } from "./rss.js";

// Synthetic entries mirroring Reddit's Atom format (HTML content is entity-escaped).
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const footer = (id: string) =>
  ` &#32; submitted by &#32; <a href="https://www.reddit.com/user/alice"> /u/alice </a> <br/> <span><a href="${id}">[link]</a></span> &#32; <span><a href="https://www.reddit.com/r/smallbusiness/comments/abc123/t/">[comments]</a></span>`;
const entry = (id: string, html: string, extra = "") =>
  `<entry><author><name>/u/alice</name></author><category term="smallbusiness" label="r/smallbusiness"/>` +
  `<content type="html">${esc(html)}</content><id>${id}</id>` +
  `<link href="https://www.reddit.com/r/smallbusiness/comments/abc123/t/" />` +
  `<updated>2026-09-25T12:45:28+00:00</updated>${extra}<title>Invoices take forever</title></entry>`;
const feed = (...entries: string[]) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries.join("")}</feed>`;

test("parses a self post body and strips the footer", () => {
  const html = `<!-- SC_OFF --><div class="md"><p>I spend &amp; hours on invoices.</p> <p>Any tool?</p></div><!-- SC_ON -->` +
    footer("https://www.reddit.com/r/smallbusiness/comments/abc123/t/");
  const { posts, lastFullname } = parseFeed(feed(entry("t3_abc123", html, "<published>2026-09-25T12:45:28+00:00</published>")));
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.id, "abc123");
  assert.equal(posts[0]!.subreddit, "smallbusiness");
  assert.equal(posts[0]!.author, "alice");
  assert.equal(posts[0]!.selftext, "I spend & hours on invoices.\n\nAny tool?");
  assert.equal(posts[0]!.url, null);
  assert.equal(posts[0]!.permalink, "/r/smallbusiness/comments/abc123/t/");
  assert.equal(posts[0]!.created_utc, 1790340328);
  assert.equal(lastFullname, "t3_abc123");
});

test("detects link posts and removed posts", () => {
  const link = parseFeed(feed(entry("t3_abc123", footer("https://example.com/article")))).posts[0]!;
  assert.equal(link.selftext, null);
  assert.equal(link.url, "https://example.com/article");

  const removed = `<!-- SC_OFF --><div class="md"><p>[removed]</p></div><!-- SC_ON -->`;
  assert.equal(parseFeed(feed(entry("t3_abc123", removed))).posts[0]!.is_removed, true);
});

test("parses comments in order, skipping AutoModerator and deleted ones", () => {
  const c = (body: string) => `<!-- SC_OFF --><div class="md"><p>${body}</p></div><!-- SC_ON -->`;
  const xml = feed(
    entry("t3_abc123", c("post")),
    entry("t1_c1", c("Rules reminder")).replace("/u/alice", "/u/AutoModerator"),
    entry("t1_c2", c("Use QuickBooks")),
    entry("t1_c3", c("[deleted]")),
    entry("t1_c4", c("Hire a bookkeeper")),
  );
  const { comments } = parseFeed(xml);
  assert.deepEqual(comments.map((x) => [x.id, x.body, x.position]), [
    ["c2", "Use QuickBooks", 0],
    ["c4", "Hire a bookkeeper", 1],
  ]);
});

test("parseThreadUrl handles reddit hosts and rejects non-threads", () => {
  assert.deepEqual(parseThreadUrl("https://old.reddit.com/r/Accounting/comments/1AbC9z/some_title/"), {
    subreddit: "Accounting",
    postId: "1abc9z",
  });
  assert.equal(parseThreadUrl("https://www.reddit.com/r/Accounting/"), null);
  assert.equal(parseThreadUrl("https://example.com/r/x/comments/abc"), null);
});
