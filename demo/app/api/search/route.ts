import { planSearch } from "@/lib/claude";
import { getDb, today } from "@/lib/db";
import { getCandidates, nearest } from "@/lib/store";
import { toCard } from "@/lib/view";
import { embedOne } from "@/lib/voyage";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ q: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const now = today();
    const plan = await planSearch(parsed.data.q, now);
    const db = getDb();
    const hits = nearest(db, await embedOne(plan.semantic, "query"), 100);
    const sim = new Map(hits.map((h) => [h.id, h.similarity]));
    const loc = plan.location?.toLowerCase().trim();
    // A two-letter state code only matches the state part ("Miami, FL"), not any city containing "fl".
    const inLocation = (l: string) => (!loc ? true : loc.length === 2 ? l.toLowerCase().endsWith(`, ${loc}`) : l.toLowerCase().includes(loc));
    const minContact = plan.contacted_within_days != null ? Date.parse(now) - plan.contacted_within_days * 86_400_000 : null;
    const results = getCandidates(db, hits.map((h) => h.id))
      .filter((r) => inLocation(r.profile.location))
      .filter((r) => plan.min_years == null || r.profile.years_exp >= plan.min_years)
      .filter((r) => minContact == null || (r.last_contacted != null && Date.parse(r.last_contacted) >= minContact))
      .slice(0, 12)
      .map((r) => ({ ...toCard(r), similarity: sim.get(r.id) ?? 0 }));
    return Response.json({ plan, results, scanned: hits.length });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
