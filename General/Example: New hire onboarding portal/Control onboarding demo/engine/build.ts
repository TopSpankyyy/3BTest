import type {
  DemoState, OnboardingCase, Task, Approval, CaseType, ReadinessCondition,
} from "./types";
import { POLICY, resolvePlan, PlanContext } from "./policy";
import { addHours, addDays } from "./clock";
import { audit, setCohort, recomputeReadiness } from "./lifecycle";

export interface CaseSpec {
  scenarioKey: string | null;
  caseType: CaseType;
  person: OnboardingCase["person"];
  employment: OnboardingCase["employment"];
  manager: string | null;
  sponsor: string | null;
  department: string;
  role: string;
  location: string;
  region: OnboardingCase["region"];
  startDate: string;
  endDate: string | null;
  sourceSystem?: OnboardingCase["sourceSystem"];
}

export interface ValidationResult {
  ok: boolean;
  problems: string[];
  safeHold: boolean;
}

// Deterministic HRIS validation.
export function validate(spec: CaseSpec): ValidationResult {
  const problems: string[] = [];
  if (!spec.person.legalName) problems.push("Missing legal name");
  if (!spec.person.employeeId) problems.push("Missing employee ID");
  if (!spec.department) problems.push("Missing department");
  if (!spec.role) problems.push("Missing role");
  // Contractors are governed by a sponsor instead of a line manager.
  if (spec.employment.workerType === "contractor") {
    if (!spec.sponsor) problems.push("Contractor missing internal sponsor");
  } else if (spec.caseType !== "cancellation" && !spec.manager) {
    problems.push("Missing manager");
  }
  if (spec.employment.workerType === "full_time" && spec.employment.costCenter === null) problems.push("Missing cost center");
  if (isNaN(Date.parse(spec.startDate))) problems.push("Invalid start date");
  if (spec.employment.status === "terminated") problems.push("Contradictory employment status: terminated");
  const safeHold = problems.length > 0;
  return { ok: !safeHold, problems, safeHold };
}

let CASE_SEQ = 0;
export function resetCaseSeq() { CASE_SEQ = 1200; }

// Create a case + its planned tasks + approvals. If validation fails, the case
// enters a safe hold and NO tasks are created (no provisioning from bad data).
export function instantiateCase(state: DemoState, spec: CaseSpec, now: string): OnboardingCase {
  CASE_SEQ += 1;
  const seq = CASE_SEQ;
  const id = `case_${seq}`;
  const correlationId = `corr_${seq}`;
  const sourceEventId = `wd_evt_${seq}`;
  const idempotencyKey = `idem_case_${seq}`;

  const kase: OnboardingCase = {
    id, caseNumber: `ARC-${seq}`, scenarioKey: spec.scenarioKey, sourceEventId,
    sourceSystem: spec.sourceSystem ?? "Simulated Workday", idempotencyKey, correlationId,
    person: spec.person, employment: spec.employment, manager: spec.manager, sponsor: spec.sponsor,
    department: spec.department, role: spec.role, location: spec.location, region: spec.region,
    startDate: spec.startDate, endDate: spec.endDate, caseType: spec.caseType,
    status: "intake", risk: "low", readinessScore: 0, dayOneReady: false, readinessConditions: [],
    policyVersion: POLICY.version, currentStage: "intake", criticalPath: [], cohort: "",
    createdAt: now, updatedAt: now, closedAt: null,
  };
  setCohort(kase);
  state.cases.push(kase);
  state.seenSourceEvents.push(sourceEventId);

  audit(state, { caseId: id, correlationId, occurredAt: now, actorType: "workflow", actor: "Process onboarding event", eventType: "case.intake", summary: `Intake: ${spec.person.preferredName} — ${spec.role}, ${spec.department}`, rationale: `Canonical ${spec.caseType} event from ${kase.sourceSystem}`, before: {}, after: { caseId: id, sourceEventId }, evidence: [], metadata: { idempotencyKey } });

  const v = validate(spec);
  if (v.safeHold) {
    kase.status = "on_hold";
    kase.currentStage = "validation";
    kase.risk = "medium";
    audit(state, { caseId: id, correlationId, occurredAt: addHours(now, 0.1), actorType: "workflow", actor: "Validate hire data", eventType: "case.on_hold", summary: `Safe hold: ${v.problems.join("; ")}`, rationale: "Incomplete/contradictory source data — provisioning blocked until corrected", before: { status: "intake" }, after: { status: "on_hold", problems: v.problems }, evidence: [], metadata: { problems: v.problems } });
    recomputeReadiness(state, kase);
    return kase;
  }

  kase.currentStage = "policy_planning";
  audit(state, { caseId: id, correlationId, occurredAt: addHours(now, 0.1), actorType: "workflow", actor: "Validate hire data", eventType: "case.validated", summary: "Validation passed", rationale: "All required HRIS fields present and consistent", before: { status: "intake" }, after: { status: "in_progress" }, evidence: [], metadata: {} });

  buildTasksAndApprovals(state, kase, spec, now);
  kase.status = "in_progress";
  kase.currentStage = "provisioning";
  recomputeReadiness(state, kase);
  return kase;
}

export function buildTasksAndApprovals(state: DemoState, kase: OnboardingCase, spec: CaseSpec, now: string) {
  const ctx: PlanContext = {
    role: spec.role, department: spec.department, region: spec.region,
    workerType: spec.employment.workerType, arrangement: spec.employment.arrangement,
    scenarioKey: spec.scenarioKey, contractEnd: spec.endDate,
  };
  const specs = resolvePlan(ctx);
  const seq = kase.caseNumber.split("-")[1];
  const created: Task[] = [];
  let ti = 0;
  for (const s of specs) {
    ti += 1;
    const tid = `${kase.id}_t${ti}`;
    const task: Task = {
      id: tid, caseId: kase.id, taskType: s.taskType, title: s.title, description: s.title,
      simulatedSystem: s.system, executionMode: s.executionMode, risk: s.risk, criticality: s.criticality,
      status: s.requiresApproval ? "blocked" : "requested", prerequisites: [], policyRule: s.policyRule,
      owner: ownerFor(s, kase), dueAt: addDays(now, 2),
      attemptCount: 0, maxAttempts: 3, idempotencyKey: `idem_${tid}`,
      requestedAt: now, approvedAt: null, startedAt: null, provisionedAt: null, verifiedAt: null,
      employeeConfirmedAt: null, failedAt: null, revokedAt: null,
      expiresAt: s.duration && s.duration.includes("day") ? addDays(now, parseInt(s.duration) || 90) : (spec.employment.workerType === "contractor" && spec.endDate ? spec.endDate : null),
      lastError: null, evidenceIds: [], approvalId: null,
      onCriticalPath: s.criticality === "critical", injectedFailure: null,
    };
    created.push(task);
    state.tasks.push(task);

    if (s.requiresApproval) {
      const ap = makeApproval(state, kase, task, s, now);
      task.approvalId = ap.id;
    }
  }
  // Resolve prerequisites (task types or literal titles -> ids)
  for (let i = 0; i < specs.length; i++) {
    const prereqs = specs[i].prerequisites ?? [];
    for (const p of prereqs) {
      const match = created.find((t) => t.taskType === p) ?? created.find((t) => t.title === p);
      if (match && match.id !== created[i].id) created[i].prerequisites.push(match.id);
    }
  }
  kase.criticalPath = created.filter((t) => t.onCriticalPath).map((t) => t.id);
}

function ownerFor(s: any, kase: OnboardingCase): string {
  if (s.executionMode === "automatic") return "Automation";
  if (s.approvalType === "salesforce_seat") return "Sales Ops (cost owner)";
  if (s.approvalType === "prod_cloud" || s.approvalType === "privileged_security") return "Security Owner";
  if (s.approvalType === "github_org") return kase.manager ?? "Manager";
  if (s.taskType === "followup") return kase.manager ?? "IT Ops";
  return "IT Ops";
}

function makeApproval(state: DemoState, kase: OnboardingCase, task: Task, s: any, now: string): Approval {
  const id = `AP-${String(state.approvals.length + 1).padStart(4, "0")}`;
  const privileged = !!s.privileged;
  const twoStage = s.approvalType === "privileged_security";
  const ap: Approval = {
    id, caseId: kase.id, taskId: task.id, type: task.title, risk: task.risk,
    requester: "IT Onboarding Automation", approver: task.owner,
    backupApprover: task.owner === (kase.manager ?? "") ? "IT Ops Lead" : "Security Owner (backup)",
    requestedDuration: s.duration ?? null,
    costIndicator: s.cost ?? null,
    policyRationale: `${POLICY.approvalRequirements[s.approvalType] ?? "Approval required"} (${s.policyRule})`,
    segregationOfDutiesResult: privileged ? "SoD check: no conflict detected (SOD-001 clear)" : "Not applicable",
    status: "pending", dueAt: addHours(now, privileged ? 8 : 24), decidedAt: null, decisionComment: null,
    escalationLevel: 0, stage: 1, totalStages: twoStage ? 2 : 1,
  };
  state.approvals.push(ap);
  audit(state, { caseId: kase.id, correlationId: kase.correlationId, occurredAt: now, actorType: "workflow", actor: "Coordinate approvals", eventType: "approval.requested", summary: `Approval requested: ${task.title}`, rationale: ap.policyRationale, before: {}, after: { approvalId: id, approver: ap.approver }, evidence: [], metadata: { privileged, twoStage } });
  return ap;
}
