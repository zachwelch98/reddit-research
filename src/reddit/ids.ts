export type ThreadRef = { subreddit: string; postId: string };

// Matches reddit.com/r/<sub>/comments/<id>/... on any reddit host (www, old, new, np).
const THREAD_URL = /^https?:\/\/(?:[a-z]+\.)?reddit\.com\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)/i;

export function parseThreadUrl(url: string): ThreadRef | null {
  const m = url.match(THREAD_URL);
  return m?.[1] && m[2] ? { subreddit: m[1], postId: m[2].toLowerCase() } : null;
}

export const stripPrefix = (fullname: string) => fullname.replace(/^t[1-6]_/, "");
