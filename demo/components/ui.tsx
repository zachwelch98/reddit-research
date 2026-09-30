import { ChevronRight, CircleAlert, Clock, Layers, RefreshCw, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { STRONG_FIT, type Stage } from "@/lib/stages";
import type { Flag } from "@/lib/view";

// Muted hues so avatars and logos read as identity, not decoration.
const HUES = ["#6b7fb0", "#5f9690", "#a9805f", "#8f78ad", "#6f9a6f", "#b3706f", "#5f86a3", "#9a8a5c", "#7d8296", "#a3789a"];
export function hueFor(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return HUES[Math.abs(h) % HUES.length]!;
}
const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: hueFor(name), fontSize: Math.round(size * 0.4) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function ClientLogo({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, background: hueFor(`client:${name}`), fontSize: Math.round(size * 0.55) }} aria-hidden>
      {name[0]}
    </span>
  );
}

export function Client({ name }: { name: string }) {
  return (
    <span className="client">
      <ClientLogo name={name} />
      <span className="ellipsis">{name}</span>
    </span>
  );
}

export const STAGE_COLOR: Record<Stage, string> = {
  sourced: "#a1a1aa",
  applied: "#a1a1aa",
  screen: "#3b82f6",
  submitted: "#f59e0b",
  client_interview: "#8b5cf6",
  offer: "#10b981",
  placed: "#15803d",
  rejected: "#ef4444",
};
export const STAGE_NAME: Record<Stage, string> = {
  sourced: "Sourced",
  applied: "Applied",
  screen: "Screen",
  submitted: "Submitted",
  client_interview: "Client interview",
  offer: "Offer",
  placed: "Placed",
  rejected: "Rejected",
};

export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className="pill">
      <span className="dot" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_NAME[stage]}
    </span>
  );
}

export const fitColor = (v: number) => (v >= STRONG_FIT ? "#16a34a" : v >= 50 ? "#d97706" : "#a1a1aa");

export function Fit({ value }: { value: number | null }) {
  if (value == null) return <span className="muted small">—</span>;
  return (
    <span className="fit" title={`Fit score. ${STRONG_FIT}+ is a strong fit.`}>
      {value}
      <span className="fit-bar">
        <i style={{ width: `${value}%`, background: fitColor(value) }} />
      </span>
    </span>
  );
}

export const FLAG_ICON: Record<Flag["kind"], LucideIcon> = {
  rejected: CircleAlert,
  active: RefreshCw,
  repeat: Layers,
  new: Sparkles,
  stale: Clock,
  placed: Trophy,
};

export function FlagBadge({ flag }: { flag: Flag }) {
  const Icon = FLAG_ICON[flag.kind];
  return (
    <div className={`flag ${flag.kind}`}>
      <Icon size={13} strokeWidth={2} />
      <span>{flag.text}</span>
    </div>
  );
}

// Icon-only flags for dense rows; the full text is in the tooltip and the preview pane.
export function FlagIcons({ flags }: { flags: Flag[] }) {
  // Always render the cell so grid rows keep their columns aligned.
  if (!flags.length) return <span className="flag-icons" />;
  return (
    <span className="flag-icons">
      {flags.map((f) => {
        const Icon = FLAG_ICON[f.kind];
        return (
          <span key={f.text} className={`fi ${f.kind}`} title={f.text}>
            <Icon size={14} strokeWidth={2} />
          </span>
        );
      })}
    </span>
  );
}

// Order the board and bars use; sourced + applied are shown together as "New".
export const BAR_STAGES: Stage[] = ["sourced", "screen", "submitted", "client_interview", "offer", "placed"];
export const BAR_LABEL: Partial<Record<Stage, string>> = { sourced: "New", screen: "Screen", submitted: "Submitted", client_interview: "Interview", offer: "Offer", placed: "Placed" };
export const barCount = (counts: Record<Stage, number>, s: Stage) => (s === "sourced" ? counts.sourced + counts.applied : counts[s]);

export function StageBar({ counts }: { counts: Record<Stage, number> }) {
  const total = BAR_STAGES.reduce((n, s) => n + barCount(counts, s), 0) || 1;
  return (
    <div className="bar" title={BAR_STAGES.map((s) => `${BAR_LABEL[s]}: ${barCount(counts, s)}`).join(" · ")}>
      {BAR_STAGES.map((s) => {
        const n = barCount(counts, s);
        return n ? <i key={s} style={{ width: `${(n / total) * 100}%`, background: STAGE_COLOR[s] }} /> : null;
      })}
    </div>
  );
}

export function PageHeader({ crumbs, title, meta, actions, children }: { crumbs?: { label: string; href?: string }[]; title: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <ChevronRight size={13} />}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {meta && <div className="meta-row">{meta}</div>}
        {children}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flex: "none" }}>{actions}</div>}
    </div>
  );
}

export const daysSince = (d: string, today: string) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000));
