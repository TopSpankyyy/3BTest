import type { DemoState, OnboardingCase, FrictionReview } from "./types";
import { diffHours } from "./clock";

// Deterministic week-two friction review. Rule-based summary and recommendations
// derived from structured events only — never a model call.
export function generateFriction(state: DemoState, kase: OnboardingCase): FrictionReview {
  const blockers = state.blockers.filter((b) => b.caseId === kase.id);
  const tasks = state.tasks.filter((t) => t.caseId === kase.id);
  const approvals = state.approvals.filter((a) => a.caseId === kase.id);

  const byCategory = new Map<string, { count: number; preventable: boolean }>();
  for (const b of blockers) {
    const cur = byCategory.get(b.category) ?? { count: 0, preventable: false };
    cur.count += 1;
    cur.preventable = cur.preventable || b.preventable;
    byCategory.set(b.category, cur);
  }
  const categories = [...byCategory.entries()].map(([category, v]) => ({ category, count: v.count, preventable: v.preventable }));

  // Lifecycle delays computed from task timestamps.
  const approvalWait = approvals
    .filter((a) => a.decidedAt)
    .map((a) => {
      const t = tasks.find((x) => x.id === a.taskId);
      return t?.requestedAt ? diffHours(t.requestedAt, a.decidedAt!) : 0;
    })
    .reduce((x, y) => x + y, 0);
  const execTime = tasks
    .filter((t) => t.startedAt && t.provisionedAt)
    .map((t) => diffHours(t.startedAt!, t.provisionedAt!))
    .reduce((x, y) => x + y, 0);
  const verifyTime = tasks
    .filter((t) => t.provisionedAt && t.verifiedAt)
    .map((t) => diffHours(t.provisionedAt!, t.verifiedAt!))
    .reduce((x, y) => x + y, 0);

  const lifecycleDelays = [
    { stage: "Approval wait", hours: round(approvalWait) },
    { stage: "Provisioning", hours: round(execTime) },
    { stage: "Verification", hours: round(verifyTime) },
  ];

  const recommendations: string[] = [];
  if (byCategory.has("approval_delay")) recommendations.push("Add a backup approver rotation to reduce approval wait for privileged access.");
  if (byCategory.has("shipping_delay")) recommendations.push("Ship devices earlier or pre-stage a loaner for remote hires in delay-prone regions.");
  if (byCategory.has("device_compliance")) recommendations.push("Pre-apply the compliance baseline image before shipping to avoid first-boot failures.");
  if (byCategory.has("mfa_problem")) recommendations.push("Send an MFA enrollment guide with the welcome email; pre-provision a backup factor.");
  if (byCategory.has("access_issue") || byCategory.has("license_constraint")) recommendations.push("Resolve role-based access group mapping earlier in the plan to prevent day-one access gaps.");
  if (recommendations.length === 0) recommendations.push("No systemic friction detected. Maintain current straight-through path.");

  const preventable = categories.filter((c) => c.preventable).length;
  const summary = blockers.length === 0
    ? `Straight-through onboarding with no recorded friction. Time-to-ready dominated by ${lifecycleDelays.sort((a, b) => b.hours - a.hours)[0].stage.toLowerCase()}.`
    : `${blockers.length} friction event(s) across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}; ${preventable} preventable. Largest delay stage: ${[...lifecycleDelays].sort((a, b) => b.hours - a.hours)[0].stage}.`;

  const review: FrictionReview = {
    id: `FR-${String(state.frictionReviews.length + 1).padStart(4, "0")}`,
    caseId: kase.id, generatedAt: kase.closedAt ?? state.clock,
    deterministicSummary: summary, categories, lifecycleDelays, recommendations,
    evidenceEventIds: state.audit.filter((a) => a.caseId === kase.id).slice(0, 6).map((a) => a.id),
  };
  const existing = state.frictionReviews.findIndex((f) => f.caseId === kase.id);
  if (existing >= 0) state.frictionReviews[existing] = review;
  else state.frictionReviews.push(review);
  return review;
}

function round(n: number): number { return Math.round(n * 10) / 10; }
