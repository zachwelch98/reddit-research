import { getDb } from "@/lib/db";
import { addToPipeline } from "@/lib/store";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  candidateId: z.number().int(),
  fit: z.number().int().nullable().optional(),
  why: z.string().nullable().optional(),
  evidence: z.array(z.string()).nullable().optional(),
  gaps: z.array(z.string()).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const jobId = Number((await params).id);
  const parsed = Body.safeParse(await req.json());
  if (!Number.isInteger(jobId) || !parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const db = getDb();
  const id = addToPipeline(db, {
    job_id: jobId,
    candidate_id: parsed.data.candidateId,
    stage: "sourced",
    origin: "sourced",
    fit: parsed.data.fit ?? null,
    why: parsed.data.why ?? null,
    evidence: parsed.data.evidence ?? null,
    gaps: parsed.data.gaps ?? null,
  });
  return Response.json({ id });
}
