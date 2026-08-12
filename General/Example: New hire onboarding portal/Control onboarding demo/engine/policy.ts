import type { Policy, PlannedTaskSpec, OnboardingCase } from "./types";
import { POLICY_VERSION } from "./clock";

// The versioned onboarding policy. Every planned task cites a clause here.
export const POLICY: Policy = {
  version: POLICY_VERSION,
  effectiveAt: "2024-04-01T00:00:00.000Z",
  rules: [
    { clause: "IDN-001", description: "Every worker receives a managed identity (Simulated Okta) with least-privilege defaults." },
    { clause: "IDN-002", description: "Privileged roles require enhanced identity verification and enforced MFA." },
    { clause: "APP-010", description: "Baseline productivity suite (Simulated Microsoft 365, Slack) is preapproved for all full-time workers." },
    { clause: "APP-020", description: "Engineering baseline includes Simulated Jira; source-control (Simulated GitHub) requires manager approval." },
    { clause: "APP-030", description: "Sales roles receive Simulated Salesforce; paid seats require cost-owner approval." },
    { clause: "SEC-001", description: "All workers complete security training before day one." },
    { clause: "SEC-010", description: "Managed endpoints must report a healthy Simulated CrowdStrike sensor before readiness." },
    { clause: "SEC-020", description: "Privileged security-platform access requires manager and security-owner approval and is time-bounded." },
    { clause: "DEV-001", description: "Office and hybrid workers reserve a device via Simulated MDM; remote workers receive a shipped device." },
    { clause: "PHY-001", description: "Office and hybrid workers receive badge access (Simulated Physical Access)." },
    { clause: "CTR-001", description: "Contractors receive a restricted baseline, no sensitive default groups, and explicitly expiring access." },
    { clause: "XFR-001", description: "Internal transfers add new role entitlements and revoke incompatible legacy access before closure." },
    { clause: "SOD-001", description: "Segregation-of-duties: production security tooling and finance approval authority cannot be held together." },
  ],
  regionalConstraints: {
    europe: "EU data-residency defaults; recovery contact required for GDPR-compliant account recovery.",
    north_america: "Standard US/CA provisioning.",
    asia_pacific: "APAC region groups; localized working-hours SLA.",
  },
  workerTypeConstraints: {
    full_time: "Full baseline eligibility subject to role bundle.",
    contractor: "Restricted baseline; sponsor required; all access expires at contract end (CTR-001).",
  },
  approvalRequirements: {
    github_org: "Manager approval (APP-020).",
    salesforce_seat: "Cost-owner approval for paid seat (APP-030).",
    prod_cloud: "Security-owner approval for production cloud access (SEC-020).",
    privileged_security: "Manager + security-owner approval, time-bounded (SEC-020).",
  },
  segregationOfDutiesRules: [
    { id: "SOD-001", description: "Production security tooling conflicts with active finance approval authority." },
    { id: "SOD-002", description: "Finance-operations legacy access conflicts with product-operations release authority." },
  ],
  expirationRules: {
    contractor: "Contractor access expires on contract end date (CTR-001).",
    temporary_privileged: "Privileged security access is granted for a bounded window (SEC-020).",
  },
};

// Role bundles map a role to its planned task specs. These are resolved together
// with region / worker-type / arrangement constraints in resolvePlan().
const BASELINE_FULL_TIME: PlannedTaskSpec[] = [
  { taskType: "identity", title: "Create managed identity", system: "Simulated Okta", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "IDN-001" },
  { taskType: "baseline_app", title: "Provision Microsoft 365 mailbox & license", system: "Simulated Microsoft 365", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "APP-010", prerequisites: ["identity"] },
  { taskType: "baseline_app", title: "Create Slack account & core channels", system: "Simulated Slack", executionMode: "automatic", risk: "low", criticality: "standard", policyRule: "APP-010", prerequisites: ["identity"] },
  { taskType: "training", title: "Assign security training", system: "Simulated Workday", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "SEC-001" },
];

export interface PlanContext {
  role: string;
  department: string;
  region: string;
  workerType: string;
  arrangement: string;
  scenarioKey: string | null;
  contractEnd: string | null;
}

// Resolve the explainable plan. Returns ordered specs with prerequisites expressed
// as task types (resolved to ids by the planner).
export function resolvePlan(ctx: PlanContext): PlannedTaskSpec[] {
  const specs: PlannedTaskSpec[] = [];
  const isContractor = ctx.workerType === "contractor";

  // Identity — enhanced for privileged security role.
  const privilegedSecurity = ctx.scenarioKey === "privileged_security" || ctx.role === "Security Engineer";
  specs.push({
    taskType: "identity",
    title: privilegedSecurity ? "Create identity with enhanced verification" : "Create managed identity",
    system: "Simulated Okta",
    executionMode: "automatic",
    risk: privilegedSecurity ? "medium" : "low",
    criticality: "critical",
    policyRule: privilegedSecurity ? "IDN-002" : "IDN-001",
  });

  // Baseline apps
  specs.push({ taskType: "baseline_app", title: "Provision Microsoft 365 mailbox & license", system: "Simulated Microsoft 365", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "APP-010", prerequisites: ["identity"] });
  specs.push({ taskType: "baseline_app", title: "Create Slack account & core channels", system: "Simulated Slack", executionMode: "automatic", risk: "low", criticality: isContractor ? "standard" : "standard", policyRule: "APP-010", prerequisites: ["identity"] });

  // Security training (all)
  specs.push({ taskType: "training", title: "Assign security training", system: "Simulated Workday", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "SEC-001" });

  // Role-specific
  if (ctx.department === "Engineering" || ctx.role.includes("Engineer") || ctx.role.includes("Developer")) {
    specs.push({ taskType: "baseline_app", title: "Create Jira account & project roles", system: "Simulated Jira", executionMode: "automatic", risk: "low", criticality: "standard", policyRule: "APP-020", prerequisites: ["identity"] });
    if (!isContractor && !privilegedSecurity) {
      specs.push({ taskType: "role_access", title: "Invite to GitHub organization", system: "Simulated GitHub", executionMode: "approval_bound", risk: "medium", criticality: "critical", policyRule: "APP-020", prerequisites: ["identity"], requiresApproval: true, approvalType: "github_org", duration: "Permanent" });
    }
  }

  if (ctx.scenarioKey === "standard_engineer") {
    specs.push({ taskType: "role_access", title: "Grant production cloud access", system: "Simulated Okta", executionMode: "approval_bound", risk: "high", criticality: "standard", policyRule: "SEC-020", prerequisites: ["identity"], requiresApproval: true, approvalType: "prod_cloud", privileged: true, duration: "90 days" });
  }

  if (ctx.department === "Sales" || ctx.role.includes("Account Executive") || ctx.role.includes("Sales")) {
    specs.push({ taskType: "role_access", title: "Assign Salesforce license & role", system: "Simulated Salesforce", executionMode: "approval_bound", risk: "medium", criticality: "critical", policyRule: "APP-030", prerequisites: ["identity"], requiresApproval: true, approvalType: "salesforce_seat", cost: "Paid seat ($1,500/yr)", duration: "Permanent" });
    specs.push({ taskType: "role_access", title: "Add regional sales groups", system: "Simulated Okta", executionMode: "automatic", risk: "low", criticality: "standard", policyRule: "APP-010", prerequisites: ["identity"] });
  }

  if (privilegedSecurity) {
    specs.push({ taskType: "security", title: "Grant privileged security-platform access", system: "Simulated CrowdStrike", executionMode: "approval_bound", risk: "critical", criticality: "critical", policyRule: "SEC-020", prerequisites: ["identity"], requiresApproval: true, approvalType: "privileged_security", privileged: true, duration: "180 days (time-bounded)" });
    specs.push({ taskType: "security", title: "Enforce hardware MFA", system: "Simulated Okta", executionMode: "automatic", risk: "medium", criticality: "critical", policyRule: "IDN-002", prerequisites: ["identity"] });
  }

  // Device
  if (ctx.arrangement === "remote" || ctx.scenarioKey === "remote_sales") {
    specs.push({ taskType: "device", title: "Ship laptop to home address", system: "Simulated Shipping", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "DEV-001" });
  } else if (!isContractor) {
    specs.push({ taskType: "device", title: "Reserve & enroll device", system: "Simulated MDM", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "DEV-001", prerequisites: ["identity"] });
  } else {
    specs.push({ taskType: "device", title: "Ship contractor laptop", system: "Simulated Shipping", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "CTR-001" });
  }

  // Endpoint security verification (device dependent)
  specs.push({ taskType: "security", title: "Verify endpoint sensor health", system: "Simulated CrowdStrike", executionMode: "automatic", risk: "low", criticality: "critical", policyRule: "SEC-010", prerequisites: ["device"] });

  // Physical access — office/hybrid only
  if ((ctx.arrangement === "office" || ctx.arrangement === "hybrid") && !isContractor) {
    specs.push({ taskType: "physical_access", title: "Create badge access", system: "Simulated Physical Access", executionMode: "automatic", risk: "low", criticality: "standard", policyRule: "PHY-001" });
  }

  // Transfer: add-and-remove
  if (ctx.scenarioKey === "internal_transfer") {
    specs.push({ taskType: "role_access", title: "Grant product-operations release role", system: "Simulated Jira", executionMode: "automatic", risk: "medium", criticality: "critical", policyRule: "XFR-001", prerequisites: ["identity"] });
    specs.push({ taskType: "followup", title: "Revoke incompatible finance-operations access", system: "Simulated Okta", executionMode: "manual", risk: "high", criticality: "critical", policyRule: "XFR-001" });
    specs.push({ taskType: "verification", title: "Verify finance access revoked", system: "Simulated Okta", executionMode: "automatic", risk: "medium", criticality: "critical", policyRule: "XFR-001", prerequisites: ["Revoke incompatible finance-operations access"] });
  }

  // Contractor expiry follow-up
  if (isContractor && ctx.contractEnd) {
    specs.push({ taskType: "followup", title: "Scheduled contractor access revocation", system: "Simulated Okta", executionMode: "automatic", risk: "medium", criticality: "standard", policyRule: "CTR-001" });
  }

  return specs;
}
