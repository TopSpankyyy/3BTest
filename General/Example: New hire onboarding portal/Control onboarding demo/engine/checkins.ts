import type { DemoState, OnboardingCase, CheckIn, Blocker } from "./types";
import { addHours, diffHours } from "./clock";
import { audit, openBlocker, recomputeReadiness } from "./lifecycle";
import { findCase } from "./ops";

const CATEGORY_MAP: Record<string, { category: Blocker["category"]; severity: Blocker["severity"]; owner: string; system: Blocker["system"] }> = {
  device_problem: { category: "device_compliance", severity: "high", owner: "Endpoint Team", system: "Simulated MDM" },
  cannot_access_app: { category: "access_issue", severity: "medium", owner: "IT Ops", system: null },
  mfa_problem: { category: "mfa_problem", severity: "medium", owner: "IT Ops", system: "Simulated Okta" },
  waiting_for_approval: { category: "approval_delay", severity: "medium", owner: "IT Ops", system: null },
  other: { category: "other", severity: "low", owner: "IT Ops", system: null },
};

// Convert a deterministic employee check-in response into a structured blocker + follow-up.
export function submitCheckIn(state: DemoState, kase: OnboardingCase, category: CheckIn["responseCategory"], text: string, now: string): CheckIn {
  const id = `CHK-${String(state.checkIns.length + 1).padStart(4, "0")}`;
  let blockerId: string | null = null;
  if (category && category !== "everything_works") {
    const m = CATEGORY_MAP[category] ?? CATEGORY_MAP.other;
    const b = openBlocker(state, kase, { source: "employee", category: m.category, system: m.system, severity: m.severity, owner: m.owner, preventable: true, summary: `Employee-reported: ${text || category}`, now });
    blockerId = b.id;
    recomputeReadiness(state, kase);
  }
  const chk: CheckIn = {
    id, caseId: kase.id, type: "day_one", sentAt: addHours(now, -1), respondedAt: now,
    responseCategory: category, responseText: text, resultingBlockerId: blockerId,
  };
  state.checkIns.push(chk);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: now, actorType: "employee", actor: kase.person.preferredName, eventType: "checkin.submitted", summary: `Day-one check-in: ${category}`, rationale: text || "Employee response", before: {}, after: { checkInId: id, blockerId }, evidence: [], metadata: { category } });
  return chk;
}

// Evaluate SLAs against the simulated clock; mark overdue tasks and escalate.
export function evaluateSlas(state: DemoState, now: string): number {
  let escalations = 0;
  for (const kase of state.cases) {
    if (["closed", "canceled", "transferred", "on_hold"].includes(kase.status)) continue;
    for (const t of state.tasks.filter((t) => t.caseId === kase.id)) {
      if (["verified", "employee_confirmed", "skipped", "revoked"].includes(t.status)) continue;
      if (t.dueAt && diffHours(now, t.dueAt) < 0 && t.criticality === "critical") {
        const exists = state.blockers.some((b) => b.caseId === kase.id && b.category === "other" && b.status === "open" && b.summary.includes(t.title));
        if (!exists) {
          openBlocker(state, kase, { source: "sla", category: "other", system: t.simulatedSystem, severity: "high", owner: t.owner, preventable: true, summary: `SLA breach: ${t.title} overdue`, now });
          escalations++;
        }
      }
    }
    for (const ap of state.approvals.filter((a) => a.caseId === kase.id && a.status === "pending")) {
      if (diffHours(now, ap.dueAt) < 0 && ap.escalationLevel === 0) {
        ap.escalationLevel = 1; ap.status = "escalated"; ap.approver = ap.backupApprover;
        audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: now, actorType: "workflow", actor: "Monitor SLAs", eventType: "approval.escalated", summary: `Approval SLA breached: ${ap.type} escalated to backup approver`, rationale: "Approval past due; escalated per SLA policy", before: { approver: ap.backupApprover }, after: { escalationLevel: 1 }, evidence: [], metadata: { approvalId: ap.id } });
        escalations++;
      }
    }
    recomputeReadiness(state, kase);
  }
  return escalations;
}
