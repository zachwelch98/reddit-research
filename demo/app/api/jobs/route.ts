import { getDb, today } from "@/lib/db";
import { insertJob } from "@/lib/store";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ description: z.string().min(20).max(8000), client: z.string().min(1) });

// The pasted job order follows the recruiter's usual header shape:
// "Title — Client (...)", then "Location: ..." and "Comp: ..." lines.
function parseHeader(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "New role").split("—")[0]!.trim();
  const location = lines.find((l) => /^location:/i.test(l))?.replace(/^location:\s*/i, "") ?? "";
  const comp = lines.find((l) => /^comp:/i.test(l))?.replace(/^comp:\s*/i, "") ?? "";
  return { title, location, comp };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Paste a job order first." }, { status: 400 });
  const { description, client } = parsed.data;
  const db = getDb();
  const row = db.prepare("SELECT id FROM clients WHERE name = ?").get(client) as { id: number } | undefined;
  if (!row) return Response.json({ error: "Unknown client." }, { status: 400 });
  const { title, location, comp } = parseHeader(description);
  const id = insertJob(db, { client_id: row.id, title, description, location, comp, opened_at: today() });
  return Response.json({ id });
}
