// Plain constants (no DB imports) so client components can use them without pulling in better-sqlite3.
export const STAGES = ["sourced", "applied", "screen", "submitted", "client_interview", "offer", "placed", "rejected"] as const;
export type Stage = (typeof STAGES)[number];
export type Origin = "applied" | "sourced";
export type RejectedBy = "recruiter" | "client";
export const STRONG_FIT = 75;

export const STAGE_LABEL: Record<Stage, string> = {
  sourced: "New",
  applied: "New",
  screen: "Screen",
  submitted: "Submitted",
  client_interview: "Client interview",
  offer: "Offer",
  placed: "Placed",
  rejected: "Rejected",
};

export const REJECT_REASONS = ["Experience", "Location", "Comp", "Not responsive", "Other"] as const;
