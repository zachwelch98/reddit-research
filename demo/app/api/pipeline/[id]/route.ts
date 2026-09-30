import { getDb } from "@/lib/db";
import { setStage, STAGES } from "@/lib/store";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  stage: z.enum(STAGES),
  rejected_by: z.enum(["recruiter", "client"]).optional(),
  reject_reason: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const parsed = Body.safeParse(await req.json());
  if (!Number.isInteger(id) || !parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const db = getDb();
  setStage(db, id, parsed.data.stage, { rejected_by: parsed.data.rejected_by, reject_reason: parsed.data.reject_reason });
  return Response.json({ ok: true });
}
