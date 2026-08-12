import type { DemoState, OnboardingCase, Task, Approval, Blocker } from "./types";
import { addHours } from "./clock";
import { audit, record, runCaseWork, verifyTask, openBlocker, recomputeReadiness } from "./lifecycle";

// Reusable domain operations shared by the seed builder and the live command layer.
// Each is deterministic and takes an explicit `now` so seeding can backdate history.

export function findCase(state: DemoState, caseId: string) {
  return state.cases.find((c) => c.id === caseId);
}

export function approve(state: DemoState, ap: Approval, comment: string, actor: string, now: string): { ok: boolean; error?: string } {
  if (ap.status !== "pending" && ap.status !== "escalated") return { ok: false, error: `Approval is ${ap.status}, cannot approve` };
  const kase = findCase(state, ap.caseId)!;
  // Privileged self-approval guard: requester may never approve their own privileged access.
  if (ap.risk === "critical" || ap.risk === "high") {
    if (!comment.trim()) return { ok: false, error: "A decision comment is required for privileged approvals" };
    if (actor === ap.requester || actor === kase.person.legalName) return { ok: false, error: "Requester cannot approve their own privileged access" };
  }
  // Multi-stage: advance stage until all stages cleared.
  if (ap.stage < ap.totalStages) {
    ap.stage += 1;
    audit(state, { caseId: ap.caseId, correlationId: kase.correlationId, occurredAt: now, actorType: "human", actor, eventType: "approval.stage_cleared", summary: `${ap.type}: stage ${ap.stage - 1}/${ap.totalStages} approved`, rationale: comment || "Stage approval", before: { stage: ap.stage - 1 }, after: { stage: ap.stage }, evidence: [], metadata: { approvalId: ap.id } });
    return { ok: true };
  }
  ap.status = "approved";
  ap.decidedAt = now;
  ap.decisionComment = comment;
  const task = state.tasks.find((t) => t.id === ap.taskId);
  if (task) { task.status = "approved"; task.approvedAt = now; }
  audit(state, { caseId: ap.caseId, correlationId: kase.correlationId, occurredAt: now, actorType: "human", actor, eventType: "approval.approved", summary: `Approved: ${ap.type}`, rationale: `${comment || "Approved"} — authorizes provisioning (not proof of success)`, before: { status: "pending" }, after: { status: "approved" }, evidence: [], metadata: { approvalId: ap.id } });
  runCaseWork(state, kase, now);
  return { ok: true };
}

export function deny(state: DemoState, ap: Approval, comment: string, actor: string, now: string): { ok: boolean; error?: string } {
  if (ap.status !== "pending" && ap.status !== "escalated") return { ok: false, error: `Approval is ${ap.status}, cannot deny` };
  if ((ap.risk === "critical" || ap.risk === "high") && !comment.trim()) return { ok: false, error: "A decision comment is required for privileged denials" };
  const kase = findCase(state, ap.caseId)!;
  ap.status = "denied";
  ap.decidedAt = now;
  ap.decisionComment = comment;
  const task = state.tasks.find((t) => t.id === ap.taskId);
  if (task) {
    task.status = "skipped";
    task.lastError = "Access denied by approver";
  }
  openBlocker(state, kase, { source: "workflow", category: "approval_delay", system: task?.simulatedSystem ?? null, severity: task?.criticality === "critical" ? "high" : "medium", owner: kase.manager ?? "IT Ops", preventable: false, summary: `${ap.type} denied — follow-up required`, now });
  audit(state, { caseId: ap.caseId, correlationId: kase.correlationId, occurredAt: now, actorType: "human", actor, eventType: "approval.denied", summary: `Denied: ${ap.type}`, rationale: comment, before: { status: "pending" }, after: { status: "denied" }, evidence: [], metadata: { approvalId: ap.id } });
  // Recalculate plan after denial.
  recomputeReadiness(state, kase);
  return { ok: true };
}

export function confirmDelivery(state: DemoState, kase: OnboardingCase, now: string): { ok: boolean; error?: string } {
  const shipTask = state.tasks.find((t) => t.caseId === kase.id && t.simulatedSystem === "Simulated Shipping");
  if (!shipTask) return { ok: false, error: "No shipment for this case" };
  // Resolve any open shipping blocker.
  for (const b of state.blockers.filter((b) => b.caseId === kase.id && b.category === "shipping_delay" && b.status === "open")) {
    b.status = "resolved"; b.resolvedAt = now; b.resolution = "Carrier delivered device; delivery confirmed.";
  }
  const ex = record(state, { caseId: kase.id, taskId: shipTask.id, correlationId: kase.correlationId, idempotencyKey: `${shipTask.idempotencyKey}:deliver`, system: "Simulated Shipping", operation: "confirm_delivery", attempt: 1, outcome: "verified", latencyClass: "fast", simulatedRequest: { trackingId: `SIMEX-${kase.person.employeeId}` }, simulatedResponse: { ok: true, status: "DELIVERED", signedBy: kase.person.preferredName }, errorClass: "none", startedAt: now, completedAt: addHours(now, 0.1) });
  shipTask.status = "verified"; shipTask.verifiedAt = addHours(now, 0.1); shipTask.evidenceIds.push(ex.id);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: shipTask.verifiedAt, actorType: "workflow", actor: "Verify readiness", eventType: "task.verified", summary: "Device delivery confirmed", rationale: "Carrier confirmed delivery; device now available", before: { status: "provisioned" }, after: { status: "verified" }, evidence: [ex.id], metadata: { taskId: shipTask.id } });
  runCaseWork(state, kase, now);
  return { ok: true };
}

export function injectShipmentDelay(state: DemoState, kase: OnboardingCase, now: string): { ok: boolean; error?: string } {
  const shipTask = state.tasks.find((t) => t.caseId === kase.id && t.simulatedSystem === "Simulated Shipping");
  if (!shipTask) return { ok: false, error: "No shipment to delay" };
  if (state.blockers.some((b) => b.caseId === kase.id && b.category === "shipping_delay" && b.status === "open")) return { ok: false, error: "Shipment already delayed" };
  openBlocker(state, kase, { source: "workflow", category: "shipping_delay", system: "Simulated Shipping", severity: "high", owner: "IT Logistics", preventable: false, summary: "Carrier reported a delivery delay (weather hold)", now });
  const ex = record(state, { caseId: kase.id, taskId: shipTask.id, correlationId: kase.correlationId, idempotencyKey: `${shipTask.idempotencyKey}:delay`, system: "Simulated Shipping", operation: "delay_shipment", attempt: 1, outcome: "transient_error", latencyClass: "slow", simulatedRequest: { trackingId: `SIMEX-${kase.person.employeeId}` }, simulatedResponse: { ok: false, status: "DELAYED", reason: "WEATHER_HOLD", newEta: "3 days" }, errorClass: "transient", startedAt: now, completedAt: now });
  shipTask.evidenceIds.push(ex.id);
  recomputeReadiness(state, kase);
  return { ok: true };
}

export function resolveBlocker(state: DemoState, blockerId: string, resolution: string, now: string): { ok: boolean; error?: string } {
  const b = state.blockers.find((x) => x.id === blockerId);
  if (!b) return { ok: false, error: "Blocker not found" };
  if (b.status === "resolved") return { ok: false, error: "Blocker already resolved" };
  const kase = findCase(state, b.caseId)!;
  b.status = "resolved"; b.resolvedAt = now; b.resolution = resolution;
  audit(state, { caseId: b.caseId, correlationId: kase.correlationId, occurredAt: now, actorType: "human", actor: "IT Ops", eventType: "blocker.resolved", summary: `Blocker resolved: ${b.summary}`, rationale: resolution, before: { status: "open" }, after: { status: "resolved" }, evidence: [], metadata: { blockerId } });
  if (b.category === "shipping_delay") return confirmDelivery(state, kase, now);
  recomputeReadiness(state, kase);
  return { ok: true };
}

// Replay a failed task: preserve original evidence, create a NEW attempt.
export function replayTask(state: DemoState, task: Task, now: string): { ok: boolean; error?: string } {
  if (task.status === "running") return { ok: false, error: "Task is currently running" };
  const kase = findCase(state, task.caseId)!;
  if (["verified", "employee_confirmed"].includes(task.status)) {
    // Idempotent: verify existing result rather than create a duplicate resource.
    audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: now, actorType: "workflow", actor: "Simulate provisioning", eventType: "task.replay_noop", summary: `Replay of ${task.title}: existing result verified, no duplicate created`, rationale: "Idempotency key matched an existing successful resource", before: {}, after: {}, evidence: task.evidenceIds.slice(-1), metadata: { taskId: task.id } });
    return { ok: true };
  }
  // Clear transient injected failure so replay can succeed; permanent stays permanent.
  if (task.injectedFailure === "transient") task.injectedFailure = null;
  task.status = "requested";
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: now, actorType: "human", actor: "IT Ops", eventType: "task.replay", summary: `Replay requested: ${task.title}`, rationale: "Manual replay after failure; original evidence preserved, new attempt created", before: { status: "failed" }, after: { status: "requested" }, evidence: [], metadata: { taskId: task.id } });
  runCaseWork(state, kase, now);
  return { ok: true };
}

// Compensating revocation (transfer / cancellation after partial provisioning).
export function revokeTask(state: DemoState, task: Task, reason: string, now: string): void {
  const kase = findCase(state, task.caseId)!;
  const ex = record(state, { caseId: kase.id, taskId: task.id, correlationId: kase.correlationId, idempotencyKey: `${task.idempotencyKey}:revoke`, system: task.simulatedSystem, operation: "revoke_access", attempt: 1, outcome: "success", latencyClass: "fast", simulatedRequest: { subject: kase.person.email, reason }, simulatedResponse: { ok: true, revoked: true }, errorClass: "none", startedAt: now, completedAt: addHours(now, 0.1) });
  task.status = "revoked"; task.revokedAt = addHours(now, 0.1); task.evidenceIds.push(ex.id);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: task.revokedAt, actorType: "workflow", actor: "Write onboarding state", eventType: "task.revoked", summary: `Compensating revocation: ${task.title}`, rationale: reason, before: { status: task.status }, after: { status: "revoked" }, evidence: [ex.id], metadata: { taskId: task.id } });
}
