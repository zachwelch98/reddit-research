// npm run sources -- list
// npm run sources -- add r/Dentistry [--vertical healthcare] [--no-discover]
// npm run sources -- add https://www.reddit.com/r/x/comments/abc123/...
// npm run sources -- add-search r/LawFirm "client intake" [--vertical legal]
// npm run sources -- disable|enable <id | r/name>
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../db/index.js";
import { parseThreadUrl } from "../reddit/ids.js";
import { addSource, listSources, setSourceEnabled } from "./repo.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { vertical: { type: "string" }, "no-discover": { type: "boolean", default: false } },
});
const [cmd, ...rest] = positionals;
const db = getDb();
const subName = (s: string) => s.replace(/^\/?r\//i, "");

try {
  switch (cmd) {
    case "list": {
      const rows = listSources(db);
      console.table(
        rows.map((s) => ({
          id: s.id, type: s.type, subreddit: s.subreddit, query: s.query ?? s.post_id ?? "", vertical: s.vertical ?? "",
          enabled: !!s.enabled, backfilled: s.backfilled_at ? new Date(s.backfilled_at * 1000).toISOString().slice(0, 10) : "",
        })),
      );
      break;
    }
    case "add": {
      const target = rest[0] ?? usage();
      const ref = parseThreadUrl(target);
      const id = ref
        ? addSource(db, { type: "thread", subreddit: ref.subreddit, post_id: ref.postId, vertical: values.vertical })
        : addSource(db, { type: "subreddit", subreddit: subName(target), vertical: values.vertical });
      if (!ref && values["no-discover"]) db.prepare("UPDATE sources SET discover = 0 WHERE id = ?").run(id);
      console.log(`Source #${id} added. ${ref ? "The thread is fetched" : "It is backfilled"} on the next \`npm run collect\`.`);
      break;
    }
    case "add-search": {
      const [sub, query] = rest;
      if (!sub || !query) usage();
      const id = addSource(db, { type: "search", subreddit: subName(sub), query, vertical: values.vertical });
      console.log(`Search source #${id} added.`);
      break;
    }
    case "enable":
    case "disable": {
      const target = rest[0] ?? usage();
      const ids = /^\d+$/.test(target)
        ? [Number(target)]
        : listSources(db).filter((s) => s.subreddit.toLowerCase() === subName(target).toLowerCase()).map((s) => s.id);
      const n = ids.reduce((acc, id) => acc + setSourceEnabled(db, id, cmd === "enable"), 0);
      console.log(`${cmd}d ${n} source(s).`);
      break;
    }
    default:
      usage();
  }
} finally {
  closeDb();
}

function usage(): never {
  console.error(
    "usage: sources list | add <r/name | thread URL> [--vertical v] [--no-discover] | add-search <r/name> <query> | enable|disable <id | r/name>",
  );
  process.exit(1);
}
