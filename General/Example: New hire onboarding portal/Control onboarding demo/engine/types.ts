// Domain model for the New Hire Readiness demo.
// Every entity here is synthetic. No value maps to a real person or system.

export type WorkerType = "full_time" | "contractor";
export type WorkArrangement = "office" | "hybrid" | "remote";
export type Region = "north_america" | "europe" | "asia_pacific";

export type CaseType =
  | "new_hire"
  | "contractor"
  | "transfer"
  | "cancellation";

// Authoritative lifecycle stages, in order.
export type Stage =
  | "intake"
  | "validation"
  | "policy_planning"
  | "risk_check"
  | "approval"
  | "provisioning"
  | "verification"
  | "readiness"
  | "day_one_support"
  | "week_two_review"
  | "closed";

export type CaseStatus =
  | "intake"
  | "on_hold" // safe hold: unsafe/incomplete data
  | "in_progress"
  | "waiting_approval"
  | "at_risk"
  | "ready" // day-one ready
  | "not_ready" // start day reached but a critical condition unmet
  | "canceled"
  | "transferred"
  | "closed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type TaskType =
  | "identity"
  | "device"
  | "baseline_app"
  | "role_access"
  | "security"
  | "training"
  | "physical_access"
  | "verification"
  | "followup";

export type ExecutionMode =
  | "automatic" // deterministic, preapproved, low risk
  | "approval_bound" // requires human approval before it can run
  | "exception" // nonstandard / manual exception handling
  | "manual"; // needs a person to perform

export type Criticality = "critical" | "standard" | "optional";

export type TaskStatus =
  | "requested"
  | "approved"
  | "provisioned"
  | "verified"
  | "employee_confirmed"
  | "failed"
  | "revoked"
  | "skipped"
  | "blocked" // policy block or waiting on prerequisite/approval
  | "running";

export type SimulatedSystem =
  | "Simulated Workday"
  | "Simulated Okta"
  | "Simulated Microsoft 365"
  | "Simulated Slack"
  | "Simulated Jira"
  | "Simulated GitHub"
  | "Simulated Salesforce"
  | "Simulated CrowdStrike"
  | "Simulated MDM"
  | "Simulated Shipping"
  | "Simulated Physical Access"
  | "Policy Engine"
  | "Workflow";

export interface Person {
  legalName: string;
  preferredName: string;
  email: string;
  recoveryContact: string;
  employeeId: string;
}

export interface Employment {
  workerType: WorkerType;
  arrangement: WorkArrangement;
  status: "active" | "pending" | "terminated";
  costCenter: string | null;
}

export interface OnboardingCase {
  id: string;
  caseNumber: string;
  scenarioKey: string | null;
  sourceEventId: string;
  sourceSystem: SimulatedSystem;
  idempotencyKey: string;
  correlationId: string;
  person: Person;
  employment: Employment;
  manager: string | null;
  sponsor: string | null;
  department: string;
  role: string;
  location: string;
  region: Region;
  startDate: string; // ISO date
  endDate: string | null; // contractor / transfer
  caseType: CaseType;
  status: CaseStatus;
  risk: RiskLevel;
  readinessScore: number; // 0..100
  dayOneReady: boolean;
  readinessConditions: ReadinessCondition[];
  policyVersion: string;
  currentStage: Stage;
  criticalPath: string[]; // task ids on the critical path
  cohort: string; // start-date cohort label, e.g. "2024-W22"
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ReadinessCondition {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface Task {
  id: string;
  caseId: string;
  taskType: TaskType;
  title: string;
  description: string;
  simulatedSystem: SimulatedSystem;
  executionMode: ExecutionMode;
  risk: RiskLevel;
  criticality: Criticality;
  status: TaskStatus;
  prerequisites: string[]; // task ids
  policyRule: string;
  owner: string;
  dueAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  requestedAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  provisionedAt: string | null;
  verifiedAt: string | null;
  employeeConfirmedAt: string | null;
  failedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null; // temporary / contractor access
  lastError: string | null;
  evidenceIds: string[];
  approvalId: string | null;
  onCriticalPath: boolean;
  injectedFailure: "transient" | "permanent" | null;
}

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "canceled"
  | "escalated";

export interface Approval {
  id: string;
  caseId: string;
  taskId: string;
  type: string; // e.g. "GitHub org access"
  risk: RiskLevel;
  requester: string;
  approver: string;
  backupApprover: string;
  requestedDuration: string | null; // e.g. "90 days"
  costIndicator: string | null;
  policyRationale: string;
  segregationOfDutiesResult: string;
  status: ApprovalStatus;
  dueAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  escalationLevel: number;
  stage: number; // multi-stage approvals (1..n)
  totalStages: number;
}

export type Outcome = "success" | "transient_error" | "permanent_error" | "policy_block" | "verified" | "skipped";
export type LatencyClass = "instant" | "fast" | "normal" | "slow";
export type ErrorClass = "none" | "transient" | "permanent" | "policy";

export interface Execution {
  id: string;
  caseId: string;
  taskId: string | null;
  correlationId: string;
  idempotencyKey: string;
  system: SimulatedSystem;
  operation: string;
  attempt: number;
  outcome: Outcome;
  latencyClass: LatencyClass;
  simulatedRequest: Record<string, unknown>;
  simulatedResponse: Record<string, unknown>;
  errorClass: ErrorClass;
  startedAt: string;
  completedAt: string;
}

export type BlockerCategory =
  | "approval_delay"
  | "shipping_delay"
  | "missing_source_data"
  | "license_constraint"
  | "identity_conflict"
  | "device_compliance"
  | "access_issue"
  | "mfa_problem"
  | "segregation_of_duties"
  | "other";

export interface Blocker {
  id: string;
  caseId: string;
  source: "workflow" | "employee" | "sla" | "policy";
  category: BlockerCategory;
  system: SimulatedSystem | null;
  severity: RiskLevel;
  owner: string;
  status: "open" | "resolved";
  preventable: boolean;
  openedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  summary: string;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  correlationId: string;
  occurredAt: string;
  actorType: "workflow" | "human" | "system" | "employee" | "policy";
  actor: string;
  eventType: string;
  summary: string;
  rationale: string;
  policyVersion: string;
  before: unknown;
  after: unknown;
  evidence: string[];
  metadata: Record<string, unknown>;
}

export interface CheckIn {
  id: string;
  caseId: string;
  type: "day_one" | "week_two";
  sentAt: string;
  respondedAt: string | null;
  responseCategory:
    | "everything_works"
    | "device_problem"
    | "cannot_access_app"
    | "mfa_problem"
    | "waiting_for_approval"
    | "other"
    | null;
  responseText: string | null;
  resultingBlockerId: string | null;
}

export interface FrictionReview {
  id: string;
  caseId: string;
  generatedAt: string;
  deterministicSummary: string;
  categories: { category: string; count: number; preventable: boolean }[];
  lifecycleDelays: { stage: string; hours: number }[];
  recommendations: string[];
  evidenceEventIds: string[];
}

// ---- Policy ----
export interface PolicyRule {
  clause: string; // e.g. "IDN-001"
  description: string;
}
export interface RoleBundle {
  role: string;
  tasks: PlannedTaskSpec[];
}
export interface PlannedTaskSpec {
  taskType: TaskType;
  title: string;
  system: SimulatedSystem;
  executionMode: ExecutionMode;
  risk: RiskLevel;
  criticality: Criticality;
  policyRule: string;
  prerequisites?: TaskType[] | string[];
  requiresApproval?: boolean;
  approvalType?: string;
  cost?: string;
  duration?: string;
  privileged?: boolean;
}
export interface Policy {
  version: string;
  effectiveAt: string;
  rules: PolicyRule[];
  regionalConstraints: Record<string, string>;
  workerTypeConstraints: Record<string, string>;
  approvalRequirements: Record<string, string>;
  segregationOfDutiesRules: { id: string; description: string }[];
  expirationRules: Record<string, string>;
}

export interface DemoState {
  version: number; // optimistic-concurrency counter for the whole store
  seedVersion: string;
  clock: string; // simulated "now" ISO
  clockStart: string;
  cases: OnboardingCase[];
  tasks: Task[];
  approvals: Approval[];
  executions: Execution[];
  blockers: Blocker[];
  audit: AuditEvent[];
  checkIns: CheckIn[];
  frictionReviews: FrictionReview[];
  processedCommands: Record<string, unknown>; // commandId -> result (idempotency)
  seenSourceEvents: string[]; // duplicate-delivery detection
  policyVersion: string;
}
