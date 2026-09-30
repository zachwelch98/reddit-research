// npm run label -- [--from threads|feeds] [--target 200]
// Interactive labeling of random posts (spread across subreddits) into eval_labels: the answer key.
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../db/index.js";
import { PAIN_POINT_DEFINITION, SCALES } from "../analyze/rubric.js";

const { values: args } = parseArgs({
  options: { from: { type: "string" }, target: { type: "string", default: "200" } },
});
const db = getDb();
const rl = createInterface({ input: process.stdin, output: process.stdout });
const target = Number(args.target);
const onlyThreads = args.from === "threads" ? 1 : args.from === "feeds" ? 0 : null;

type Post = { id: string; subreddit: string; title: string; selftext: string | null; permalink: string };

// Random subreddit first, then a random post in it, so big subreddits don't dominate the sample.
function nextPost(skipped: Set<string>): Post | undefined {
  return db
    .prepare(
      `WITH candidates AS (
         SELECT p.* FROM posts p LEFT JOIN eval_labels l ON l.post_id = p.id
         WHERE l.post_id IS NULL AND p.is_removed = 0
           AND (p.selftext IS NOT NULL OR p.comments_fetched_n > 0)
           AND (@threads IS NULL OR (p.comments_fetched_at IS NOT NULL) = @threads)
           AND p.id NOT IN (SELECT value FROM json_each(@skipped))
       ), sub AS (SELECT subreddit FROM candidates GROUP BY subreddit ORDER BY random() LIMIT 1)
       SELECT id, subreddit, title, selftext, permalink FROM candidates
       WHERE subreddit = (SELECT subreddit FROM sub) ORDER BY random() LIMIT 1`,
    )
    .get({ threads: onlyThreads, skipped: JSON.stringify([...skipped]) }) as Post | undefined;
}

const labeledCount = () => (db.prepare("SELECT count(*) AS n FROM eval_labels").get() as { n: number }).n;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}… [m = show more]` : s);

function show(p: Post, full: boolean) {
  const comments = db
    .prepare("SELECT body FROM comments WHERE post_id = ? ORDER BY position LIMIT ?")
    .all(p.id, full ? 10 : 3) as { body: string }[];
  console.clear();
  console.log(`── ${labeledCount()}/${target} labeled ─────────────  r/${p.subreddit}  ·  https://reddit.com${p.permalink}\n`);
  console.log(`\x1b[1m${p.title}\x1b[0m\n`);
  console.log(p.selftext ? (full ? p.selftext : clip(p.selftext, 1500)) : "(no text)");
  if (comments.length) {
    console.log("\n── top comments ──");
    for (const c of comments) console.log(`• ${full ? c.body : clip(c.body, 300)}\n`);
  }
}

async function askScore(name: keyof typeof SCALES): Promise<number> {
  for (;;) {
    const a = (await rl.question(`  ${name} (0-3, ? for scale): `)).trim();
    if (a === "?") console.log(`    ${SCALES[name]}`);
    else if (/^[0-3]$/.test(a)) return Number(a);
  }
}

const save = db.prepare(
  `INSERT OR REPLACE INTO eval_labels (post_id, is_pain_point, willingness_to_pay, underserved, ai_solvability)
   VALUES (?, ?, ?, ?, ?)`,
);
const skipped = new Set<string>();

try {
  while (labeledCount() < target) {
    const post = nextPost(skipped);
    if (!post) {
      console.log("No more unlabeled posts match. Try another --from, or collect more data.");
      break;
    }
    let full = false;
    for (;;) {
      show(post, full);
      const a = (await rl.question("\nPain point? [y]es [n]o [s]kip [m]ore [h]elp [q]uit: ")).trim().toLowerCase();
      if (a === "q") throw new Error("quit");
      if (a === "m") full = true;
      else if (a === "h") {
        console.log(`\n${PAIN_POINT_DEFINITION}\n`);
        await rl.question("(enter to continue)");
      } else if (a === "s") {
        skipped.add(post.id);
        break;
      } else if (a === "n") {
        save.run(post.id, 0, null, null, null);
        break;
      } else if (a === "y") {
        const wtp = await askScore("willingness_to_pay");
        const under = await askScore("underserved");
        const ai = await askScore("ai_solvability");
        save.run(post.id, 1, wtp, under, ai);
        break;
      }
    }
  }
  if (labeledCount() >= target) console.log(`\nDone: ${labeledCount()} posts labeled. Run \`npm run eval\`.`);
} catch (e) {
  if ((e as Error).message !== "quit") throw e;
  console.log(`\nSaved. ${labeledCount()}/${target} labeled; run \`npm run label\` to continue.`);
} finally {
  rl.close();
  closeDb();
}
