import type { DB } from "../db/index.js";
import { parseThreadUrl } from "../reddit/ids.js";
import { loadSourcesFile } from "./config.js";
import { addSource, type NewSource } from "./repo.js";

export function seedSources(db: DB) {
  const file = loadSourcesFile();

  const rows: NewSource[] = [
    ...Object.entries(file.subreddits).flatMap(([vertical, subs]) =>
      subs.map((subreddit): NewSource => ({ type: "subreddit", subreddit, vertical })),
    ),
    ...file.threads.map((url): NewSource => {
      const ref = parseThreadUrl(url);
      if (!ref) throw new Error(`threads: "${url}" is not a reddit.com/r/<sub>/comments/<id> URL`);
      return { type: "thread", subreddit: ref.subreddit, post_id: ref.postId };
    }),
    ...file.searches.map((s): NewSource => ({ type: "search", ...s })),
  ];

  db.transaction(() => rows.forEach((r) => addSource(db, r)))();
  return rows.length;
}
