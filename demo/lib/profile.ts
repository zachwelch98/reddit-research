import { z } from "zod";

// One candidate as the recruiter sees it. Used for seed generation, resume parsing and display.
export const Profile = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  headline: z.string().describe("One line, e.g. 'Senior data engineer · payments & streaming'"),
  current_title: z.string(),
  current_company: z.string(),
  location: z.string().describe("City, state/region"),
  work_pref: z.enum(["remote", "hybrid", "onsite", "flexible"]),
  years_exp: z.number().int(),
  skills: z.array(z.string()),
  summary: z.string().describe("2-3 sentences"),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      start: z.string().describe("YYYY-MM"),
      end: z.string().describe("YYYY-MM or 'present'"),
      highlights: z.array(z.string()),
    }),
  ),
  education: z.string(),
  desired_comp: z.string().describe("e.g. '$170-185k base' or '$95/hr contract'"),
  availability: z.string().describe("e.g. 'Open to offers, 2 weeks notice'"),
});
export type Profile = z.infer<typeof Profile>;

// Text that gets embedded for search and matching.
export function embedText(p: Profile, notes = ""): string {
  const exp = p.experience.map((e) => `${e.title} at ${e.company} (${e.start}–${e.end}): ${e.highlights.join("; ")}`).join("\n");
  return [
    `${p.name} — ${p.headline}`,
    `${p.current_title} at ${p.current_company}. ${p.location}. Prefers ${p.work_pref}. ${p.years_exp} years experience.`,
    `Skills: ${p.skills.join(", ")}`,
    p.summary,
    exp,
    p.education,
    notes,
  ].join("\n");
}
