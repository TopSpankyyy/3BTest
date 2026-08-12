import type {
  DemoState, OnboardingCase, Task, Approval, Execution, Blocker, AuditEvent,
  ReadinessCondition, Stage, CaseStatus, TaskStatus,
} from "./types";
import { addHours, addDays, diffHours, cohort } from "./clock";
import { POLICY } from "./policy";
import { provisionOperation, verifyOperation, AdapterResult } from "./adapters/index";

// ---------------------------------------------------------------------------
// Audit + execution helpers (never overwrite history; corrective actions append).
// ---------------------------------------------------------------------------
export function audit(state: DemoState, e: Omit<AuditEvent, "id" | "policyVersion">): AuditEvent {
  const id = `AE-${String(state.audit.length + 1).padStart(5, "0")}`;
  const ev: AuditEvent = { id, policyVersion: POLICY.version, ...e };
  state.audit.push(ev);
  return ev;
}

export function record(state: DemoState, ex: Omit<Execution, "id">): Execution {
  const id = `EX-${String(state.executions.length + 1).padStart(5, "0")}`;
  const e: Execution = { id, ...ex };
  state.executions.push(e);
  return e;
}

// ---------------------------------------------------------------------------
// Task eligibility: prerequisites verified and (if approval-bound) approved.
// ---------------------------------------------------------------------------
export function isEligible(task: Task, tasks: Task[], approvals: Approval[]): boolean {
  // Failed tasks are NOT auto-retried — recovery is an explicit REPLAY_TASK.
  if (!["requested", "approved", "blocked"].includes(task.status)) return false;
  // approval-bound tasks must be approved
  if (task.executionMode === "approval_bound") {
    const ap = approvals.find((a) => a.id === task.approvalId);
    if (!ap || ap.status !== "approved") return false;
  }
  // manual tasks are not auto-run by provisioning
  if (task.executionMode === "manual") return false;
  // prerequisites must be verified
  for (const pid of task.prerequisites) {
    const p = tasks.find((t) => t.id === pid);
    if (!p) continue;
    if (!["verified", "employee_confirmed", "skipped"].includes(p.status)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Provision one task: create execution(s) with deterministic retry handling.
// Returns true if the task advanced.
// ---------------------------------------------------------------------------

// Deterministic simulated duration (in hours) for a latency class.
function latencyHours(latency: AdapterResult["latencyClass"]): number {
  switch (latency) {
    case "slow":
      return 4;
    case "normal":
      return 1;
    default: // "fast" and "instant"
      return 0.1;
  }
}

export function provisionTask(state: DemoState, task: Task, kase: OnboardingCase, now: string): boolean {
  task.attemptCount += 1;
  task.startedAt = task.startedAt ?? now;
  task.status = "running";
  const res: AdapterResult = provisionOperation(task, kase);
  const startedAt = now;
  const completedAt = addHours(now, latencyHours(res.latencyClass));
  const ex = record(state, {
    caseId: kase.id, taskId: task.id, correlationId: kase.correlationId,
    idempotencyKey: task.idempotencyKey, system: task.simulatedSystem,
    operation: res.operation, attempt: task.attemptCount, outcome: res.outcome,
    latencyClass: res.latencyClass, simulatedRequest: res.request, simulatedResponse: res.response,
    errorClass: res.errorClass, startedAt, completedAt,
  });
  task.evidenceIds.push(ex.id);

  if (res.outcome === "success") {
    task.status = "provisioned";
    task.provisionedAt = completedAt;
    task.lastError = null;
    if (task.injectedFailure === "transient") task.injectedFailure = null; // cleared after eventual success
    audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: completedAt, actorType: "workflow", actor: "Simulate provisioning", eventType: "task.provisioned", summary: `${task.title} provisioned on ${task.simulatedSystem}`, rationale: `Policy ${task.policyRule}; ${task.executionMode} execution`, before: { status: "running" }, after: { status: "provisioned" }, evidence: [ex.id], metadata: { taskId: task.id } });
    return true;
  }
  if (res.outcome === "transient_error") {
    task.status = task.attemptCount >= task.maxAttempts ? "failed" : "requested";
    task.failedAt = task.status === "failed" ? completedAt : null;
    task.lastError = String(res.response.message);
    if (task.status === "failed") {
      openBlocker(state, kase, { source: "workflow", category: "other", system: task.simulatedSystem, severity: "high", owner: task.owner, preventable: true, summary: `${task.title} exceeded retry limit after transient errors`, now: completedAt });
      audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: completedAt, actorType: "workflow", actor: "Simulate provisioning", eventType: "task.escalated", summary: `${task.title} exhausted retries (${task.attemptCount}/${task.maxAttempts})`, rationale: "Transient errors exceeded retry limit; escalated to owner", before: {}, after: { status: "failed" }, evidence: [ex.id], metadata: { taskId: task.id } });
    } else {
      audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: completedAt, actorType: "workflow", actor: "Simulate provisioning", eventType: "task.retry", summary: `${task.title} transient error, will retry (attempt ${task.attemptCount})`, rationale: "Transient error class; deterministic backoff", before: {}, after: { status: "requested" }, evidence: [ex.id], metadata: { taskId: task.id } });
    }
    return true;
  }
  // permanent
  task.status = "failed";
  task.failedAt = completedAt;
  task.lastError = String(res.response.message);
  openBlocker(state, kase, { source: "workflow", category: "other", system: task.simulatedSystem, severity: "critical", owner: task.owner, preventable: false, summary: `${task.title} failed permanently: ${res.response.message}`, now: completedAt });
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: completedAt, actorType: "workflow", actor: "Simulate provisioning", eventType: "task.failed", summary: `${task.title} failed permanently`, rationale: "Permanent error class; not retried", before: {}, after: { status: "failed" }, evidence: [ex.id], metadata: { taskId: task.id } });
  return true;
}

// Verify a provisioned task.
export function verifyTask(state: DemoState, task: Task, kase: OnboardingCase, now: string): void {
  if (task.status !== "provisioned") return;
  const res = verifyOperation(task, kase);
  const ex = record(state, {
    caseId: kase.id, taskId: task.id, correlationId: kase.correlationId,
    idempotencyKey: `${task.idempotencyKey}:verify`, system: task.simulatedSystem,
    operation: res.operation, attempt: 1, outcome: "verified", latencyClass: res.latencyClass,
    simulatedRequest: res.request, simulatedResponse: res.response, errorClass: "none",
    startedAt: now, completedAt: addHours(now, 0.1),
  });
  task.status = "verified";
  task.verifiedAt = addHours(now, 0.1);
  task.evidenceIds.push(ex.id);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: task.verifiedAt, actorType: "workflow", actor: "Verify readiness", eventType: "task.verified", summary: `Verified: ${task.title}`, rationale: "Post-provisioning verification — provision response alone is not proof", before: { status: "provisioned" }, after: { status: "verified" }, evidence: [ex.id], metadata: { taskId: task.id } });
}

// Run all currently-eligible provisioning + verification for a case (one wave).
// Loops until no further progress — deterministic parallel simulation.
export function runCaseWork(state: DemoState, kase: OnboardingCase, now: string): void {
  const tasks = () => state.tasks.filter((t) => t.caseId === kase.id);
  const approvals = () => state.approvals.filter((a) => a.caseId === kase.id);
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 50) {
    progressed = false;
    for (const t of tasks()) {
      if (isEligible(t, tasks(), approvals())) {
        if (provisionTask(state, t, kase, now)) progressed = true;
      }
    }
    for (const t of tasks()) {
      // Shipping (device delivery) is verified only by explicit delivery confirmation,
      // not automatically — a created shipment is not proof the laptop arrived.
      if (t.status === "provisioned" && t.simulatedSystem !== "Simulated Shipping") {
        verifyTask(state, t, kase, now); progressed = true;
      }
    }
  }
  recomputeReadiness(state, kase);
}

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------
export function openBlocker(state: DemoState, kase: OnboardingCase, b: {
  source: Blocker["source"]; category: Blocker["category"]; system: Blocker["system"];
  severity: Blocker["severity"]; owner: string; preventable: boolean; summary: string; now: string;
}): Blocker {
  const id = `BLK-${String(state.blockers.length + 1).padStart(4, "0")}`;
  const blk: Blocker = {
    id, caseId: kase.id, source: b.source, category: b.category, system: b.system,
    severity: b.severity, owner: b.owner, status: "open", preventable: b.preventable,
    openedAt: b.now, resolvedAt: null, resolution: null, summary: b.summary,
  };
  state.blockers.push(blk);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: b.now, actorType: b.source === "employee" ? "employee" : "workflow", actor: b.source === "employee" ? "Employee check-in" : "Workflow", eventType: "blocker.opened", summary: `Blocker opened: ${b.summary}`, rationale: `Category ${b.category}, severity ${b.severity}`, before: {}, after: { blockerId: id }, evidence: [], metadata: { category: b.category } });
  return blk;
}

// ---------------------------------------------------------------------------
// Readiness: authoritative day-one status + explainable numeric score.
// ---------------------------------------------------------------------------
export function recomputeReadiness(state: DemoState, kase: OnboardingCase): void {
  const tasks = state.tasks.filter((t) => t.caseId === kase.id);
  const blockers = state.blockers.filter((b) => b.caseId === kase.id && b.status === "open");
  const critical = tasks.filter((t) => t.criticality === "critical" && t.status !== "skipped" && t.status !== "revoked");

  const criticalVerified = critical.filter((t) => ["verified", "employee_confirmed"].includes(t.status));
  const deviceTask = tasks.find((t) => t.taskType === "device");
  const securityOk = tasks.filter((t) => t.taskType === "security" && t.criticality === "critical").every((t) => ["verified", "employee_confirmed"].includes(t.status));
  const criticalBlocker = blockers.some((b) => b.severity === "critical" || b.severity === "high");

  const conditions: ReadinessCondition[] = [
    { key: "critical_tasks", label: "All critical tasks verified", met: critical.length > 0 && criticalVerified.length === critical.length, detail: `${criticalVerified.length}/${critical.length} critical tasks verified` },
    { key: "device", label: "Device available or delivered", met: !deviceTask || ["verified", "provisioned", "employee_confirmed"].includes(deviceTask.status), detail: deviceTask ? `Device task: ${deviceTask.status}` : "No device required" },
    { key: "security", label: "Required security controls active", met: securityOk, detail: securityOk ? "Endpoint / MFA controls verified" : "Security controls not yet verified" },
    { key: "no_critical_blocker", label: "No open critical blocker", met: !criticalBlocker, detail: criticalBlocker ? "Open high/critical blocker present" : "No critical blockers open" },
  ];

  // Numeric score: verified critical + standard progress (never overrides the gate).
  const scorable = tasks.filter((t) => t.status !== "skipped");
  const done = scorable.filter((t) => ["verified", "employee_confirmed"].includes(t.status));
  const score = scorable.length === 0 ? 0 : Math.round((done.length / scorable.length) * 100);

  const dayOneReady = conditions.every((c) => c.met);
  kase.readinessConditions = conditions;
  kase.readinessScore = score;
  kase.dayOneReady = dayOneReady;

  // Case status: do not override terminal/hold states.
  if (["on_hold", "canceled", "transferred", "closed"].includes(kase.status)) return;
  const pendingApproval = state.approvals.some((a) => a.caseId === kase.id && a.status === "pending");
  const startReached = diffHours(state.clock, kase.startDate) <= 0;
  if (dayOneReady) kase.status = "ready";
  else if (criticalBlocker) kase.status = "at_risk";
  else if (pendingApproval) kase.status = "waiting_approval";
  else if (startReached) kase.status = "not_ready";
  else kase.status = "in_progress";
  // Escalate risk to match the case’s current blocking condition. If neither a
  // critical blocker nor a pending approval applies, the existing risk stands.
  if (criticalBlocker) kase.risk = "high";
  else if (pendingApproval) kase.risk = "medium";
}

// Cohort maintenance
export function setCohort(kase: OnboardingCase): void {
  kase.cohort = cohort(kase.startDate);
}
