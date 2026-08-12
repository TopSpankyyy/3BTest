import type { SimulatedSystem, Outcome, LatencyClass, ErrorClass, Task, OnboardingCase } from "./types";

// Deterministic simulated system adapters. No real network calls, no vendor
// contracts copied. Payloads are plausible but explicitly synthetic.

export interface AdapterResult {
  operation: string;
  outcome: Outcome;
  latencyClass: LatencyClass;
  errorClass: ErrorClass;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  evidence: string; // human-readable summary
}

const LATENCY: Record<TaskLatency, LatencyClass> = {
  identity: "fast",
  baseline_app: "normal",
  role_access: "normal",
  security: "normal",
  training: "instant",
  device: "slow",
  physical_access: "fast",
  verification: "fast",
  followup: "normal",
};
type TaskLatency = Task["taskType"];

// Map a task to its provisioning operation on the simulated system.
export function provisionOperation(task: Task, kase: OnboardingCase): AdapterResult {
  const idem = task.idempotencyKey;
  const sys = task.simulatedSystem;
  const base = { idempotencyKey: idem, correlationId: kase.correlationId, subject: kase.person.email };
  const latency = LATENCY[task.taskType] ?? "normal";

  // Injected failures take precedence and are handled deterministically.
  if (task.injectedFailure === "permanent") {
    return {
      operation: opName(sys, task),
      outcome: "permanent_error",
      latencyClass: latency,
      errorClass: "permanent",
      request: { ...base, action: opName(sys, task) },
      response: { ok: false, code: "INVALID_CONFIGURATION", message: "Simulated permanent failure: unsupported configuration for subject." },
      evidence: `${sys} rejected the request permanently (INVALID_CONFIGURATION).`,
    };
  }
  if (task.injectedFailure === "transient" && task.attemptCount < task.maxAttempts) {
    return {
      operation: opName(sys, task),
      outcome: "transient_error",
      latencyClass: latency,
      errorClass: "transient",
      request: { ...base, action: opName(sys, task), attempt: task.attemptCount + 1 },
      response: { ok: false, code: "RATE_LIMITED", message: "Simulated transient failure: upstream rate limit, retry advised." },
      evidence: `${sys} returned a transient error (RATE_LIMITED) on attempt ${task.attemptCount + 1}.`,
    };
  }

  switch (sys) {
    case "Simulated Okta":
      return ok(opName(sys, task), latency, { ...base, groups: oktaGroups(kase) }, { oktaUserId: `okta_${kase.person.employeeId}`, status: "ACTIVE", mfaEnrolled: true }, `Identity active in Simulated Okta (okta_${kase.person.employeeId}).`);
    case "Simulated Microsoft 365":
      return ok(opName(sys, task), latency, { ...base, licenseSku: "M365-E3-SIM" }, { mailbox: kase.person.email, licenseAssigned: "M365-E3-SIM" }, `Mailbox and M365 license provisioned for ${kase.person.email}.`);
    case "Simulated Slack":
      return ok(opName(sys, task), latency, { ...base, channels: ["#general", "#" + kase.department.toLowerCase()] }, { slackId: `U_${kase.person.employeeId}`, channels: 2 }, `Slack account created and added to 2 channels.`);
    case "Simulated Jira":
      return ok(opName(sys, task), latency, { ...base, projectRoles: [kase.department] }, { jiraAccountId: `jira_${kase.person.employeeId}`, roles: 1 }, `Jira account created with project role.`);
    case "Simulated GitHub":
      return ok(opName(sys, task), latency, { ...base, org: "globex-sim" }, { inviteId: `gh_inv_${kase.person.employeeId}`, state: "invited" }, `GitHub org invitation sent (pending accept, verified separately).`);
    case "Simulated Salesforce":
      return ok(opName(sys, task), latency, { ...base, licenseType: "Sales Cloud (paid seat)" }, { sfUserId: `sf_${kase.person.employeeId}`, license: "Sales Cloud" }, `Salesforce paid seat assigned.`);
    case "Simulated CrowdStrike":
      return ok(opName(sys, task), latency, { ...base, action: task.taskType === "security" && task.title.includes("privileged") ? "grant_privileged" : "verify_sensor" }, { sensorState: "HEALTHY", privileged: task.title.includes("privileged") }, `CrowdStrike endpoint sensor HEALTHY.`);
    case "Simulated MDM":
      return ok(opName(sys, task), latency, { ...base, deviceModel: "Globex-Book Pro (sim)" }, { deviceId: `mdm_${kase.person.employeeId}`, enrollment: "COMPLETE", compliant: true }, `Device reserved and enrolled; compliant.`);
    case "Simulated Shipping": {
      // Shipment created; delivery confirmed later. Delay injection handled by command layer.
      return ok(opName(sys, task), latency, { ...base, carrier: "SimEx", destination: kase.location }, { trackingId: `SIMEX-${kase.person.employeeId}`, status: "IN_TRANSIT", eta: "2 days" }, `Shipment created (SimEx, in transit).`);
    }
    case "Simulated Physical Access":
      return ok(opName(sys, task), latency, { ...base, site: kase.location }, { badgeId: `badge_${kase.person.employeeId}`, active: true }, `Badge access created for ${kase.location}.`);
    case "Simulated Workday":
      return ok(opName(sys, task), latency, { ...base, course: "SEC-ONBOARD-101" }, { assignmentId: `wd_train_${kase.person.employeeId}`, dueInDays: 5 }, `Security training assigned in Simulated Workday.`);
    default:
      return ok(opName(sys, task), latency, base, { ok: true }, `${sys} operation completed.`);
  }
}

// Verification operations — never trust the provision response alone.
export function verifyOperation(task: Task, kase: OnboardingCase): AdapterResult {
  const sys = task.simulatedSystem;
  const base = { idempotencyKey: task.idempotencyKey, correlationId: kase.correlationId, subject: kase.person.email };
  switch (sys) {
    case "Simulated Okta":
      return ok("verify_identity", "fast", base, { exists: true, groupsResolved: true, mfaEnrolled: true }, `Verified identity exists with resolved groups.`);
    case "Simulated Microsoft 365":
      return ok("verify_mailbox", "fast", base, { mailboxReachable: true, licenseActive: true }, `Verified mailbox reachable and license active.`);
    case "Simulated GitHub":
      return ok("verify_org_membership", "fast", base, { member: true, org: "globex-sim" }, `Verified GitHub org membership active.`);
    case "Simulated CrowdStrike":
      return ok("verify_sensor", "fast", base, { sensorState: "HEALTHY", lastSeenMins: 3 }, `Verified endpoint sensor reporting HEALTHY.`);
    case "Simulated MDM":
      return ok("check_compliance", "fast", base, { compliant: true, encrypted: true }, `Verified device compliant and encrypted.`);
    case "Simulated Salesforce":
      return ok("verify_license", "fast", base, { licenseActive: true, roleAssigned: true }, `Verified Salesforce license and role.`);
    default:
      return ok("verify", "fast", base, { verified: true }, `Verified ${sys} state.`);
  }
}

export function revokeOperation(task: Task, kase: OnboardingCase): AdapterResult {
  const sys = task.simulatedSystem;
  const base = { idempotencyKey: `${task.idempotencyKey}:revoke`, correlationId: kase.correlationId, subject: kase.person.email };
  return ok("revoke_access", "fast", base, { revoked: true, previouslyGranted: true }, `${sys} access revoked (compensating action).`);
}

function ok(operation: string, latencyClass: LatencyClass, request: Record<string, unknown>, response: Record<string, unknown>, evidence: string): AdapterResult {
  return { operation, outcome: "success", latencyClass, errorClass: "none", request, response: { ok: true, ...response }, evidence };
}

function opName(sys: SimulatedSystem, task: Task): string {
  const privileged = task.title.includes("privileged");
  // Systems whose operation name never varies with the task.
  const staticNames: Partial<Record<SimulatedSystem, string>> = {
    "Simulated Microsoft 365": "create_mailbox_assign_license",
    "Simulated Slack": "create_account_add_channels",
    "Simulated Jira": "create_account_add_roles",
    "Simulated GitHub": "invite_user",
    "Simulated Salesforce": "assign_license_role",
    "Simulated MDM": "reserve_enroll_device",
    "Simulated Shipping": "create_shipment",
    "Simulated Physical Access": "create_badge_access",
    "Simulated Workday": "assign_training",
  };
  switch (sys) {
    case "Simulated Okta":
      if (privileged) return "grant_privileged_access";
      return task.taskType === "identity" ? "create_identity" : "assign_groups";
    case "Simulated CrowdStrike":
      return privileged ? "grant_privileged" : "verify_sensor";
    default:
      return staticNames[sys] ?? "execute";
  }
}

function oktaGroups(kase: OnboardingCase): string[] {
  const g = [`region-${kase.region}`, `dept-${kase.department.toLowerCase()}`];
  if (kase.employment.workerType === "contractor") g.push("contractor-restricted");
  return g;
}
