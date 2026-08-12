// Formatting, labels, and status semantics. Color is never the only signal —
// every status also carries a text label and (where relevant) an icon glyph.

export const CHART_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
}
export function relToClock(iso: string, clock: string): string {
  const h = (new Date(iso).getTime() - new Date(clock).getTime()) / 3600_000;
  if (Math.abs(h) < 1) return "now";
  const days = h / 24;
  if (Math.abs(days) >= 1) return `${days > 0 ? "in " : ""}${Math.abs(Math.round(days))} day${Math.abs(Math.round(days)) === 1 ? "" : "s"}${days < 0 ? " ago" : ""}`;
  return `${h > 0 ? "in " : ""}${Math.abs(Math.round(h))}h${h < 0 ? " ago" : ""}`;
}
export function fmtHours(h: number): string {
  if (h < 24) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

export const titleize = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Status -> {label, tone}. Tone maps to a semantic color var + text label.
type Tone = "success" | "warning" | "error" | "info" | "neutral" | "accent";
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  intake: { label: "Intake", tone: "neutral" },
  on_hold: { label: "Safe hold", tone: "warning" },
  in_progress: { label: "In progress", tone: "info" },
  waiting_approval: { label: "Waiting approval", tone: "accent" },
  at_risk: { label: "At risk", tone: "error" },
  ready: { label: "Day-one ready", tone: "success" },
  not_ready: { label: "Not ready", tone: "error" },
  canceled: { label: "Canceled", tone: "neutral" },
  transferred: { label: "Transferred", tone: "neutral" },
  closed: { label: "Closed", tone: "success" },
};
export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "neutral" },
  approved: { label: "Approved", tone: "info" },
  provisioned: { label: "Provisioned", tone: "info" },
  verified: { label: "Verified", tone: "success" },
  employee_confirmed: { label: "Employee confirmed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  revoked: { label: "Revoked", tone: "neutral" },
  skipped: { label: "Skipped", tone: "neutral" },
  blocked: { label: "Blocked", tone: "warning" },
  running: { label: "Running", tone: "accent" },
};
export const RISK: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  high: { label: "High", tone: "error" },
  critical: { label: "Critical", tone: "error" },
};
export const APPROVAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "warning" },
  escalated: { label: "Escalated", tone: "error" },
  approved: { label: "Approved", tone: "success" },
  denied: { label: "Denied", tone: "error" },
  expired: { label: "Expired", tone: "neutral" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export function toneVar(tone: Tone): string {
  return { success: "var(--success)", warning: "var(--warning)", error: "var(--error)", info: "var(--info)", accent: "var(--accent)", neutral: "var(--text-2)" }[tone];
}

export const STAGES = ["intake", "validation", "policy_planning", "risk_check", "approval", "provisioning", "verification", "readiness", "day_one_support", "week_two_review", "closed"];

export const SCENARIOS: Record<string, { title: string; blurb: string }> = {
  standard_engineer: { title: "Standard software engineer", blurb: "Parallel baseline provisioning, manager approval for GitHub, security approval for production cloud, then verified day-one readiness." },
  remote_sales: { title: "Remote sales hire", blurb: "Salesforce paid-seat approval and a shipped laptop. A carrier delay makes the case at risk even when application access is ready." },
  privileged_security: { title: "Privileged security engineer", blurb: "Two-stage approval, enforced MFA, time-bounded access, and segregation-of-duties. Privileged access is never auto-approved." },
  contractor: { title: "Contractor", blurb: "Restricted baseline, named sponsor, and explicitly expiring access with a scheduled revocation date." },
  incomplete_hris: { title: "Incomplete HRIS record", blurb: "Missing manager and cost center force a safe hold. Correcting the source data resumes the same case without duplication." },
  internal_transfer: { title: "Internal transfer", blurb: "Add-and-remove access plan. Incompatible finance access must be revoked and verified before the transfer can close." },
};

export function regionLabel(r: string): string {
  return { north_america: "North America", europe: "Europe", asia_pacific: "Asia-Pacific" }[r] ?? r;
}
