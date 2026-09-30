import { getDb, today } from "@/lib/db";
import { getCandidate, pipelineForCandidate } from "@/lib/store";
import { contactedLabel } from "@/lib/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Invalid candidate." }, { status: 400 });
  const db = getDb();
  const c = getCandidate(db, id);
  if (!c) return Response.json({ error: "Candidate not found." }, { status: 404 });
  const p = c.profile;
  return Response.json({
    id,
    name: p.name,
    headline: p.headline,
    current_title: p.current_title,
    current_company: p.current_company,
    location: p.location,
    work_pref: p.work_pref,
    years_exp: p.years_exp,
    email: p.email,
    phone: p.phone,
    summary: p.summary,
    education: p.education,
    desired_comp: p.desired_comp,
    availability: p.availability,
    skills: p.skills,
    experience: p.experience,
    notes: c.notes,
    source: c.source,
    contacted: contactedLabel(c.last_contacted, today()),
    pipelines: pipelineForCandidate(db, id).map((pl) => ({ id: pl.id, job_id: pl.job_id, job_title: pl.job_title, client: pl.client, stage: pl.stage, next_step: pl.next_step })),
  });
}
