import type { DemoState, OnboardingCase, CheckIn, FrictionReview } from "./types";
import { SEED_CLOCK, SEED_VERSION, POLICY_VERSION, addDays, addHours, makeRng, pick, diffHours } from "./clock";
import { CaseSpec, instantiateCase, resetCaseSeq } from "./build";
import { runCaseWork, audit, openBlocker, recomputeReadiness } from "./lifecycle";
import { approve, confirmDelivery, injectShipmentDelay, findCase } from "./ops";
import { generateFriction } from "./friction";

function emptyState(): DemoState {
  return {
    version: 1, seedVersion: SEED_VERSION, clock: SEED_CLOCK, clockStart: SEED_CLOCK,
    cases: [], tasks: [], approvals: [], executions: [], blockers: [], audit: [],
    checkIns: [], frictionReviews: [], processedCommands: {}, seenSourceEvents: [],
    policyVersion: POLICY_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Build the full deterministic seed. Called by reset and first-run bootstrap.
// ---------------------------------------------------------------------------
export function buildSeed(): DemoState {
  const s = emptyState();
  resetCaseSeq();
  buildShowcase(s);
  buildHistorical(s);
  return s;
}

// ------------------------- Six showcase cases ------------------------------
function buildShowcase(s: DemoState) {
  const created = addDays(SEED_CLOCK, -3); // 2024-05-31

  // 1. Standard software engineer (Dublin) — baseline done, two approvals pending.
  {
    const spec: CaseSpec = {
      scenarioKey: "standard_engineer", caseType: "new_hire",
      person: { legalName: "Aoife Nolan", preferredName: "Aoife", email: "aoife.nolan@globex.example", recoveryContact: "aoife.personal@example.com", employeeId: "E10231" },
      employment: { workerType: "full_time", arrangement: "hybrid", status: "active", costCenter: "ENG-DUB-01" },
      manager: "Cian Murphy", sponsor: null, department: "Engineering", role: "Software Engineer",
      location: "Dublin, IE", region: "europe", startDate: addDays(SEED_CLOCK, 2), endDate: null,
    };
    const k = instantiateCase(s, spec, created);
    runCaseWork(s, k, addHours(created, 2)); // baseline provisions & verifies; GitHub + prod cloud stay pending
  }

  // 2. Remote sales hire (US) — Salesforce approval pending + shipment delayed => at risk.
  {
    const spec: CaseSpec = {
      scenarioKey: "remote_sales", caseType: "new_hire",
      person: { legalName: "Marcus Bell", preferredName: "Marcus", email: "marcus.bell@globex.example", recoveryContact: "mbell.personal@example.com", employeeId: "E10232" },
      employment: { workerType: "full_time", arrangement: "remote", status: "active", costCenter: "SAL-US-04" },
      manager: "Dana Ruiz", sponsor: null, department: "Sales", role: "Account Executive",
      location: "Austin, US", region: "north_america", startDate: addDays(SEED_CLOCK, 1), endDate: null,
    };
    const k = instantiateCase(s, spec, created);
    runCaseWork(s, k, addHours(created, 2));
    injectShipmentDelay(s, k, addHours(created, 6)); // laptop delayed -> at risk
  }

  // 3. Privileged security engineer (London) — 2-stage approval, never auto-approved.
  {
    const spec: CaseSpec = {
      scenarioKey: "privileged_security", caseType: "new_hire",
      person: { legalName: "Priya Anand", preferredName: "Priya", email: "priya.anand@globex.example", recoveryContact: "priya.personal@example.com", employeeId: "E10233" },
      employment: { workerType: "full_time", arrangement: "office", status: "active", costCenter: "SEC-LON-02" },
      manager: "Oliver Grant", sponsor: null, department: "Security", role: "Security Engineer",
      location: "London, UK", region: "europe", startDate: addDays(SEED_CLOCK, 3), endDate: null,
    };
    const k = instantiateCase(s, spec, created);
    runCaseWork(s, k, addHours(created, 2)); // baseline done; privileged access blocked pending 2-stage approval
  }

  // 4. Contractor (Germany) — restricted baseline, sponsor, expiring access.
  {
    const spec: CaseSpec = {
      scenarioKey: "contractor", caseType: "contractor",
      person: { legalName: "Lena Fischer", preferredName: "Lena", email: "lena.fischer@globex.example", recoveryContact: "lena.personal@example.com", employeeId: "C20044" },
      employment: { workerType: "contractor", arrangement: "remote", status: "active", costCenter: "CTR-DE-01" },
      manager: null, sponsor: "Nils Weber (Sponsor)", department: "Support", role: "Support Contractor",
      location: "Berlin, DE", region: "europe", startDate: SEED_CLOCK, endDate: addDays(SEED_CLOCK, 60),
    };
    const k = instantiateCase(s, spec, created);
    runCaseWork(s, k, addHours(created, 2));
    confirmDelivery(s, k, addHours(created, 8)); // laptop delivered -> ready
  }

  // 5. Incomplete HRIS record (New York) — safe hold, no provisioning.
  {
    const spec: CaseSpec = {
      scenarioKey: "incomplete_hris", caseType: "new_hire",
      person: { legalName: "Hank Scorpio", preferredName: "Hank", email: "hank.scorpio@globex.example", recoveryContact: "hank.personal@example.com", employeeId: "E10234" },
      employment: { workerType: "full_time", arrangement: "hybrid", status: "active", costCenter: null },
      manager: null, sponsor: null, department: "Marketing", role: "Marketing Manager",
      location: "New York, US", region: "north_america", startDate: addDays(SEED_CLOCK, 4), endDate: null,
    };
    const k = instantiateCase(s, spec, created); // enters on_hold (missing manager + cost center)

    // The HRIS record arrived with the legal name misspelled ("Hank Scorpion").
    // The employee reported it, HR Ops corrected the record, and validation re-ran —
    // so this blocker is already closed and the case now holds the corrected values.
    const reportedAt = addHours(created, 1.5);
    const correctedAt = addHours(created, 4);
    const nameBlocker = openBlocker(s, k, {
      source: "employee", category: "identity_conflict", system: "Simulated Workday",
      severity: "medium", owner: "HR Ops", preventable: true,
      summary: 'HRIS legal name misspelled — record arrived as "Hank Scorpion", reported by the employee',
      now: reportedAt,
    });
    audit(s, {
      caseId: k.id, correlationId: k.correlationId, occurredAt: reportedAt,
      actorType: "employee", actor: "Hank Scorpio", eventType: "data.correction_reported",
      summary: 'Employee reported their legal name was spelled "Hank Scorpion" in the HRIS record',
      rationale: "Identity data must match the employee’s legal name before any account is created (IDN-001).",
      before: { legalName: "Hank Scorpion", email: "hank.scorpion@globex.example" },
      after: { legalName: "Hank Scorpio", email: "hank.scorpio@globex.example" },
      evidence: [], metadata: { blockerId: nameBlocker.id, field: "person.legalName" },
    });
    nameBlocker.status = "resolved";
    nameBlocker.resolvedAt = correctedAt;
    nameBlocker.resolution = "HR Ops corrected the legal name and derived email in the HRIS record; intake validation re-ran against the corrected data.";
    audit(s, {
      caseId: k.id, correlationId: k.correlationId, occurredAt: correctedAt,
      actorType: "human", actor: "HR Ops", eventType: "data.corrected",
      summary: 'Legal name and email corrected in the HRIS record — "Hank Scorpion" → "Hank Scorpio"',
      rationale: "Correction made on the employee’s report and re-validated; no account had been created yet, so no downstream identity had to be renamed.",
      before: { legalName: "Hank Scorpion", email: "hank.scorpion@globex.example" },
      after: { legalName: "Hank Scorpio", email: "hank.scorpio@globex.example" },
      evidence: [], metadata: { blockerId: nameBlocker.id, fields: ["person.legalName", "person.email"] },
    });
    recomputeReadiness(s, k); // name issue closed; case stays on hold for manager + cost center
  }

  // 6. Internal transfer (Finance Ops -> Product Ops) — add & remove, revoke before close.
  {
    const spec: CaseSpec = {
      scenarioKey: "internal_transfer", caseType: "transfer",
      person: { legalName: "Sofia Romano", preferredName: "Sofia", email: "sofia.romano@globex.example", recoveryContact: "sofia.personal@example.com", employeeId: "E10098" },
      employment: { workerType: "full_time", arrangement: "hybrid", status: "active", costCenter: "PRD-IT-03" },
      manager: "Elena Costa", sponsor: null, department: "Product", role: "Product Operations Analyst",
      location: "Milan, IT", region: "europe", startDate: addDays(SEED_CLOCK, 2), endDate: null,
    };
    const k = instantiateCase(s, spec, created);
    openBlocker(s, k, { source: "policy", category: "segregation_of_duties", system: "Simulated Okta", severity: "high", owner: "Elena Costa", preventable: false, summary: "Incompatible finance-operations access detected (SOD-002) — must be revoked before transfer closes", now: addHours(created, 0.2) });
    runCaseWork(s, k, addHours(created, 2)); // grants provision; manual revocation + verify remain
  }
}

// ------------------------- 24+ historical cases ----------------------------
const FIRST = ["Ava", "Liam", "Noah", "Emma", "Zoe", "Kai", "Mia", "Leo", "Ivy", "Owen", "Nora", "Ethan", "Ruby", "Finn", "Isla", "Jack", "Maya", "Ben", "Tara", "Sam", "Yuki", "Hana", "Diego", "Amara", "Wei", "Sana", "Tom", "Nia"];
const LAST = ["Chen", "Kim", "Patel", "Silva", "Nowak", "Haas", "Osei", "Reyes", "Bauer", "Ito", "Park", "Volkov", "Meyer", "Dubois", "Rossi", "Khan", "Lund", "Ferreira", "Ncube", "Tran", "Berg", "Yamada", "Costa", "Adeyemi"];
const DEPTS = ["Engineering", "Sales", "Security", "Marketing", "Finance", "Product", "Support", "People"];
const ROLES: Record<string, string> = { Engineering: "Software Engineer", Sales: "Account Executive", Security: "Security Analyst", Marketing: "Marketing Specialist", Finance: "Financial Analyst", Product: "Product Manager", Support: "Support Specialist", People: "People Partner" };
const LOCS: [string, OnboardingCase["region"]][] = [["Dublin, IE", "europe"], ["London, UK", "europe"], ["Berlin, DE", "europe"], ["Austin, US", "north_america"], ["New York, US", "north_america"], ["Toronto, CA", "north_america"], ["Singapore, SG", "asia_pacific"], ["Sydney, AU", "asia_pacific"], ["Tokyo, JP", "asia_pacific"]];
const ARR: OnboardingCase["employment"]["arrangement"][] = ["office", "hybrid", "remote"];
const MANAGERS = ["Cian Murphy", "Dana Ruiz", "Oliver Grant", "Elena Costa", "Priya Anand", "Marcus Bell", "Nils Weber", "Grace Lin"];

// Outcome mix over 8 weeks (26 cases). Fixed distribution => deterministic reporting.
type Outc = "on_time" | "late" | "canceled" | "transferred";
const OUTCOMES: Outc[] = [
  "on_time", "on_time", "on_time", "late", "on_time", "canceled",
  "on_time", "late", "on_time", "on_time", "transferred", "on_time",
  "late", "on_time", "on_time", "on_time", "late", "on_time",
  "canceled", "on_time", "on_time", "late", "on_time", "transferred",
  "on_time", "late",
];

function buildHistorical(s: DemoState) {
  const rng = makeRng("arcadia-hist-v1");
  for (let i = 0; i < OUTCOMES.length; i++) {
    const weeksAgo = 8 - Math.floor(i / 3.3); // spread across ~8 weeks
    const created = addDays(SEED_CLOCK, -(weeksAgo * 7 + (i % 4)));
    const startDate = addDays(created, 4);
    const dept = DEPTS[i % DEPTS.length];
    const isContractor = i % 7 === 3;
    const [loc, region] = LOCS[i % LOCS.length];
    const arrangement = isContractor ? "remote" : ARR[i % ARR.length];
    const first = FIRST[i % FIRST.length];
    const last = LAST[i % LAST.length];
    const outcome = OUTCOMES[i];

    const spec: CaseSpec = {
      scenarioKey: null, caseType: isContractor ? "contractor" : "new_hire",
      person: { legalName: `${first} ${last}`, preferredName: first, email: `${first.toLowerCase()}.${last.toLowerCase()}@globex.example`, recoveryContact: `${first.toLowerCase()}@example.com`, employeeId: `E9${String(100 + i).padStart(3, "0")}` },
      employment: { workerType: isContractor ? "contractor" : "full_time", arrangement, status: "active", costCenter: `${dept.slice(0, 3).toUpperCase()}-0${(i % 5) + 1}` },
      manager: isContractor ? null : MANAGERS[i % MANAGERS.length],
      sponsor: isContractor ? `${MANAGERS[i % MANAGERS.length]} (Sponsor)` : null,
      department: dept, role: ROLES[dept], location: loc, region,
      startDate, endDate: isContractor ? addDays(startDate, 90) : null,
    };
    const k = instantiateCase(s, spec, created);

    // Approve any pending approvals deterministically (historical cases are decided).
    for (const ap of s.approvals.filter((a) => a.caseId === k.id && a.status === "pending")) {
      // one historical case per few sees an approval delay blocker
      approve(s, ap, "Approved per policy (historical).", ap.approver, addHours(created, 20 + (i % 30)));
    }
    // Confirm shipments for remote workers.
    if (s.tasks.some((t) => t.caseId === k.id && t.simulatedSystem === "Simulated Shipping")) {
      confirmDelivery(s, k, addHours(created, 30));
    }
    // Manual/transfer tasks: mark verified via a light-touch for historical closure.
    for (const t of s.tasks.filter((t) => t.caseId === k.id && (t.executionMode === "manual" || t.status === "blocked"))) {
      t.status = "verified"; t.verifiedAt = addHours(created, 24); t.approvedAt = t.approvedAt ?? addHours(created, 20);
    }
    runCaseWork(s, k, addHours(created, 36));

    // Inject deterministic historical friction.
    const frictionKind = i % 6;
    if (frictionKind === 0) {
      const b = openBlocker(s, k, { source: "employee", category: "access_issue", system: "Simulated Salesforce", severity: "medium", owner: k.manager ?? "IT Ops", preventable: true, summary: "Employee reported missing application access on day one", now: addHours(startDate, 4) });
      b.status = "resolved"; b.resolvedAt = addHours(startDate, 8); b.resolution = "Access group corrected.";
      addCheckIn(s, k, "day_one", "cannot_access_app", "I can’t get into Salesforce yet.", b.id, startDate);
    } else if (frictionKind === 1) {
      const b = openBlocker(s, k, { source: "employee", category: "mfa_problem", system: "Simulated Okta", severity: "medium", owner: "IT Ops", preventable: true, summary: "MFA enrollment issue reported", now: addHours(startDate, 3) });
      b.status = "resolved"; b.resolvedAt = addHours(startDate, 5); b.resolution = "Re-issued MFA factor.";
      addCheckIn(s, k, "day_one", "mfa_problem", "MFA setup failed on first login.", b.id, startDate);
    } else if (frictionKind === 2) {
      const b = openBlocker(s, k, { source: "workflow", category: "device_compliance", system: "Simulated CrowdStrike", severity: "high", owner: "Endpoint Team", preventable: true, summary: "Endpoint sensor reported non-compliant on first boot", now: addHours(startDate, -6) });
      b.status = "resolved"; b.resolvedAt = addHours(startDate, 2); b.resolution = "Compliance policy re-applied.";
    } else if (frictionKind === 3) {
      addCheckIn(s, k, "day_one", "everything_works", "All set, thanks!", null, startDate);
    }

    // Finalize outcome + timestamps.
    finalizeHistorical(s, k, outcome, created, startDate, i);
    generateFriction(s, k); // week-two review for closed cases
  }
}

function addCheckIn(s: DemoState, k: OnboardingCase, type: "day_one" | "week_two", cat: CheckIn["responseCategory"], text: string, blockerId: string | null, base: string) {
  const id = `CHK-${String(s.checkIns.length + 1).padStart(4, "0")}`;
  s.checkIns.push({ id, caseId: k.id, type, sentAt: addHours(base, 1), respondedAt: addHours(base, 2), responseCategory: cat, responseText: text, resultingBlockerId: blockerId });
}

function finalizeHistorical(s: DemoState, k: OnboardingCase, outcome: Outc, created: string, startDate: string, i: number) {
  recomputeReadiness(s, k);
  const readyAt = addHours(startDate, outcome === "late" ? 30 : -12);
  if (outcome === "canceled") {
    // Cancel after partial provisioning: revoke provisioned access.
    for (const t of s.tasks.filter((t) => t.caseId === k.id && ["provisioned", "verified"].includes(t.status))) {
      t.status = "revoked"; t.revokedAt = addHours(created, 40);
    }
    k.status = "canceled"; k.closedAt = addHours(created, 40); k.currentStage = "closed"; k.dayOneReady = false;
    audit(s, { caseId: k.id, correlationId: k.correlationId, occurredAt: k.closedAt, actorType: "human", actor: "IT Ops", eventType: "case.canceled", summary: "Hire canceled — compensating revocations issued", rationale: "Offer withdrawn (historical)", before: {}, after: { status: "canceled" }, evidence: [], metadata: {} });
  } else if (outcome === "transferred") {
    k.status = "transferred"; k.closedAt = readyAt; k.currentStage = "closed"; k.caseType = "transfer";
    audit(s, { caseId: k.id, correlationId: k.correlationId, occurredAt: k.closedAt, actorType: "workflow", actor: "Write onboarding state", eventType: "case.transferred", summary: "Internal transfer completed", rationale: "Legacy access verified revoked (historical)", before: {}, after: { status: "transferred" }, evidence: [], metadata: {} });
  } else {
    k.status = "closed"; k.dayOneReady = true; k.closedAt = readyAt; k.currentStage = "closed";
    audit(s, { caseId: k.id, correlationId: k.correlationId, occurredAt: k.closedAt, actorType: "workflow", actor: "Write onboarding state", eventType: "case.closed", summary: outcome === "late" ? "Case closed — ready after start date" : "Case closed — ready on time", rationale: "All critical tasks verified (historical)", before: {}, after: { status: "closed", onTime: outcome === "on_time" } , evidence: [], metadata: { onTime: outcome === "on_time" } });
  }
}
