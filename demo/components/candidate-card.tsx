"use client";
import { contactedLabel, type CandidateCard } from "@/lib/view";
import { CandidateLink, SelectDiv } from "./preview-link";
import { Avatar } from "./ui";

export const POOL_COLS = { gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.5fr) 118px" };
const LIST_COLS = { gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.5fr) 118px 84px" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Formatted by hand so server and browser render the same text.
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${day}, ${y}`;
};

// One candidate as a dense row; clicking it opens the preview pane.
export function CandidateRowItem({ c, today, highlight = [], fresh, showAdded }: { c: CandidateCard; today: string; highlight?: string[]; fresh?: boolean; showAdded?: boolean }) {
  const hl = highlight.map((h) => h.toLowerCase());
  const isHit = (s: string) => hl.some((h) => s.toLowerCase().includes(h) || h.includes(s.toLowerCase()));
  const skills = [...c.skills].sort((a, b) => Number(isHit(b)) - Number(isHit(a))).slice(0, 4);
  return (
    <SelectDiv id={c.id} className={`r${fresh ? " fresh" : ""}`} style={showAdded ? LIST_COLS : POOL_COLS}>
      <div className="person">
        <Avatar name={c.name} size={28} />
        <div>
          <CandidateLink id={c.id} className="nm">
            {c.name}
          </CandidateLink>
          <div className="sub">{c.title}</div>
        </div>
      </div>
      <div className="small" style={{ minWidth: 0 }}>
        <div className="ellipsis">{c.location}</div>
        <div className="muted ellipsis">
          {c.work_pref} · {c.years_exp} yrs
        </div>
      </div>
      <div className="tags fade" style={{ marginTop: 0, flexWrap: "nowrap", overflow: "hidden" }}>
        {skills.map((s) => (
          <span key={s} className={`tag${isHit(s) ? " hit" : ""}`}>
            {s}
          </span>
        ))}
      </div>
      <div className="small" style={{ textAlign: "right" }}>
        <div>{contactedLabel(c.last_contacted, today)}</div>
        <div className="muted">{c.source}</div>
      </div>
      {showAdded && (
        <div className="small" style={{ textAlign: "right" }}>
          <div className="muted">Added</div>
          <div className="num">{fmtDate(c.created_at)}</div>
        </div>
      )}
    </SelectDiv>
  );
}
