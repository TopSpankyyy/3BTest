import type { DemoState, OnboardingCase, Task, Blocker } from "./types";
import { diffHours } from "./clock";

export interface Filters {
  cohorts?: string[];
  dateFrom?: string;
  dateTo?: string;
  departments?: string[];
  regions?: string[];
  locations?: string[];
  workerTypes?: string[];
  managers?: string[];
  scenarios?: string[];
  risks?: string[];
  statuses?: string[];
  systems?: string[];
  blockerCategories?: string[];
}

const has = (arr: string[] | undefined, v: string | null) => !arr || arr.length === 0 || (v != null && arr.includes(v));

export function filterCases(state: DemoState, f: Filters): OnboardingCase[] {
  return state.cases.filter((c) => {
    if (!has(f.cohorts, c.cohort)) return false;
    if (f.dateFrom && c.startDate < f.dateFrom) return false;
    if (f.dateTo && c.startDate > f.dateTo) return false;
    if (!has(f.departments, c.department)) return false;
    if (!has(f.regions, c.region)) return false;
    if (!has(f.locations, c.location)) return false;
    if (!has(f.workerTypes, c.employment.workerType)) return false;
    if (!has(f.managers, c.manager)) return false;
    if (!has(f.scenarios, c.scenarioKey)) return false;
    if (!has(f.risks, c.risk)) return false;
    if (!has(f.statuses, c.status)) return false;
    if (f.systems && f.systems.length) {
      const sys = new Set(state.tasks.filter((t) => t.caseId === c.id).map((t) => t.simulatedSystem));
      if (!f.systems.some((s) => sys.has(s as any))) return false;
    }
    if (f.blockerCategories && f.blockerCategories.length) {
      const cats = new Set(state.blockers.filter((b) => b.caseId === c.id).map((b) => b.category));
      if (!f.blockerCategories.some((s) => cats.has(s as any))) return false;
    }
    return true;
  });
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};

const ACTIVE = new Set(["intake", "on_hold", "in_progress", "waiting_approval", "at_risk", "ready", "not_ready"]);

// Overview KPIs for the operations console (active cases only).
export function overviewKpis(state: DemoState) {
  const active = state.cases.filter((c) => ACTIVE.has(c.status));
  return {
    activeCases: active.length,
    dayOneReady: active.filter((c) => c.dayOneReady).length,
    atRisk: active.filter((c) => c.status === "at_risk").length,
    criticalBlockers: state.blockers.filter((b) => b.status === "open" && (b.severity === "critical" || b.severity === "high") && ACTIVE.has(state.cases.find((c) => c.id === b.caseId)?.status ?? "")).length,
    pendingApprovals: state.approvals.filter((a) => a.status === "pending" || a.status === "escalated").length,
    overdueCritical: overdueCriticalCount(state, active),
  };
}

function overdueCriticalCount(state: DemoState, cases: OnboardingCase[]): number {
  const ids = new Set(cases.map((c) => c.id));
  return state.tasks.filter((t) => ids.has(t.caseId) && t.criticality === "critical" && t.dueAt && diffHours(state.clock, t.dueAt) < 0 && !["verified", "employee_confirmed", "skipped", "revoked"].includes(t.status)).length;
}

// Full management report over a filtered set. Everything reconciles to these cases.
export function report(state: DemoState, f: Filters) {
  const cases = filterCases(state, f);
  const ids = new Set(cases.map((c) => c.id));
  const tasks = state.tasks.filter((t) => ids.has(t.caseId));
  const blockers = state.blockers.filter((b) => ids.has(b.caseId));
  const approvals = state.approvals.filter((a) => ids.has(a.caseId));
  const closedOrReady = cases.filter((c) => ["closed", "transferred", "ready"].includes(c.status));

  // Time to verified readiness (hours) for cases that reached ready/closed.
  const timeToReady = closedOrReady.map((c) => {
    const verified = tasks.filter((t) => t.caseId === c.id && t.verifiedAt).map((t) => new Date(t.verifiedAt!).getTime());
    if (verified.length === 0) return 0;
    return diffHours(c.createdAt, new Date(Math.max(...verified)).toISOString());
  }).filter((h) => h > 0);

  const approvalWaits = approvals.filter((a) => a.decidedAt).map((a) => {
    const t = tasks.find((x) => x.id === a.taskId);
    return t?.requestedAt ? diffHours(t.requestedAt, a.decidedAt!) : 0;
  }).filter((h) => h > 0);

  const decided = cases.filter((c) => ["closed", "transferred"].includes(c.status));
  const readyDecided = decided.filter((c) => c.dayOneReady && c.status !== "transferred");
  const straightThrough = decided.filter((c) => c.dayOneReady && blockers.filter((b) => b.caseId === c.id).length === 0 && !approvals.some((a) => a.caseId === c.id && a.status === "denied"));

  const automationTasks = tasks.filter((t) => t.status !== "skipped");
  const autoCount = automationTasks.filter((t) => t.executionMode === "automatic").length;

  const employeeBlockerCases = new Set(blockers.filter((b) => b.source === "employee").map((b) => b.caseId));

  // Completion mode mix.
  const modeMix = countBy(automationTasks, (t) => t.executionMode);
  // Blockers.
  const byCat = countBy(blockers, (b) => b.category);
  const bySys = countBy(blockers.filter((b) => b.system), (b) => b.system as string);

  // Stage time (summed hours across tasks) split approval vs execution vs verify.
  const approvalHours = approvalWaits.reduce((a, b) => a + b, 0);
  const execHours = tasks.filter((t) => t.startedAt && t.provisionedAt).map((t) => diffHours(t.startedAt!, t.provisionedAt!)).reduce((a, b) => a + b, 0);
  const verifyHours = tasks.filter((t) => t.provisionedAt && t.verifiedAt).map((t) => diffHours(t.provisionedAt!, t.verifiedAt!)).reduce((a, b) => a + b, 0);

  // Readiness by cohort.
  const cohorts = [...new Set(cases.map((c) => c.cohort))].sort();
  const readinessByCohort = cohorts.map((co) => {
    const cc = cases.filter((c) => c.cohort === co);
    const ready = cc.filter((c) => c.dayOneReady && c.status !== "canceled").length;
    return { cohort: co, total: cc.length, ready, rate: cc.length ? Math.round((ready / cc.length) * 100) : 0 };
  });

  // Readiness distribution (active cases).
  const activeCases = cases.filter((c) => ACTIVE.has(c.status));
  const readinessDistribution = [
    { band: "0–25", count: activeCases.filter((c) => c.readinessScore <= 25).length },
    { band: "26–50", count: activeCases.filter((c) => c.readinessScore > 25 && c.readinessScore <= 50).length },
    { band: "51–75", count: activeCases.filter((c) => c.readinessScore > 50 && c.readinessScore <= 75).length },
    { band: "76–99", count: activeCases.filter((c) => c.readinessScore > 75 && c.readinessScore < 100).length },
    { band: "100", count: activeCases.filter((c) => c.readinessScore === 100).length },
  ];

  const atRiskTable = activeCases.filter((c) => c.status === "at_risk" || c.status === "not_ready" || overdueForCase(state, c)).map((c) => ({
    id: c.id, caseNumber: c.caseNumber, name: c.person.preferredName, role: c.role, department: c.department,
    region: c.region, startDate: c.startDate, readinessScore: c.readinessScore, risk: c.risk,
    blocker: state.blockers.filter((b) => b.caseId === c.id && b.status === "open").map((b) => b.summary)[0] ?? "SLA risk",
    owner: c.manager ?? c.sponsor ?? "IT Ops",
  }));

  const weekTwoThemes = countBy(state.frictionReviews.filter((fr) => ids.has(fr.caseId)).flatMap((fr) => fr.categories), (c) => c.category);

  return {
    count: cases.length,
    kpis: {
      dayOneReadinessRate: decided.length ? Math.round((readyDecided.length / decided.length) * 100) : 0,
      medianTimeToReadyHours: median(timeToReady),
      activeAtRisk: activeCases.filter((c) => c.status === "at_risk").length,
      overdueCriticalTasks: overdueCriticalCount(state, activeCases),
      automationCoverage: automationTasks.length ? Math.round((autoCount / automationTasks.length) * 100) : 0,
      straightThroughRate: decided.length ? Math.round((straightThrough.length / decided.length) * 100) : 0,
      medianApprovalWaitHours: median(approvalWaits),
      employeeBlockerRate: cases.length ? Math.round((employeeBlockerCases.size / cases.length) * 100) : 0,
    },
    readinessByCohort,
    stageTime: [
      { stage: "Approval wait", hours: Math.max(0, Math.round(approvalHours)) },
      { stage: "Provisioning", hours: Math.max(0, Math.round(execHours)) },
      { stage: "Verification", hours: Math.max(0, Math.round(verifyHours)) },
    ],
    blockersByCategory: toEntries(byCat),
    blockersBySystem: toEntries(bySys),
    readinessDistribution,
    completionModeMix: toEntries(modeMix),
    weekTwoThemes: toEntries(weekTwoThemes),
    atRiskTable,
    cases: cases.map((c) => rowFor(state, c)),
  };
}

function overdueForCase(state: DemoState, c: OnboardingCase): boolean {
  return state.tasks.some((t) => t.caseId === c.id && t.criticality === "critical" && t.dueAt && diffHours(state.clock, t.dueAt) < 0 && !["verified", "employee_confirmed", "skipped", "revoked"].includes(t.status));
}

export function rowFor(state: DemoState, c: OnboardingCase) {
  const openBlockers = state.blockers.filter((b) => b.caseId === c.id && b.status === "open");
  return {
    id: c.id, caseNumber: c.caseNumber, name: c.person.preferredName, legalName: c.person.legalName,
    role: c.role, department: c.department, location: c.location, region: c.region,
    workerType: c.employment.workerType, manager: c.manager, sponsor: c.sponsor, scenario: c.scenarioKey,
    startDate: c.startDate, cohort: c.cohort, status: c.status, risk: c.risk, stage: c.currentStage,
    readinessScore: c.readinessScore, dayOneReady: c.dayOneReady,
    criticalBlocker: openBlockers.find((b) => b.severity === "high" || b.severity === "critical")?.summary ?? null,
    pendingApprovals: state.approvals.filter((a) => a.caseId === c.id && (a.status === "pending" || a.status === "escalated")).length,
    nextAction: nextAction(state, c),
    owner: c.manager ?? c.sponsor ?? "IT Ops",
  };
}

function nextAction(state: DemoState, c: OnboardingCase): string {
  if (c.status === "on_hold") return "Correct source data";
  if (c.status === "canceled") return "None (canceled)";
  if (c.status === "transferred" || c.status === "closed") return "None (closed)";
  const pending = state.approvals.filter((a) => a.caseId === c.id && (a.status === "pending" || a.status === "escalated"));
  if (pending.length) return `Approve/deny: ${pending[0].type}`;
  const openB = state.blockers.filter((b) => b.caseId === c.id && b.status === "open");
  if (openB.length) return `Resolve blocker: ${openB[0].category}`;
  const failed = state.tasks.filter((t) => t.caseId === c.id && t.status === "failed");
  if (failed.length) return `Replay failed: ${failed[0].title}`;
  const manual = state.tasks.filter((t) => t.caseId === c.id && t.executionMode === "manual" && !["verified", "revoked"].includes(t.status));
  if (manual.length) return manual[0].title;
  if (c.dayOneReady) return "Ready — monitor day-one check-in";
  return "Awaiting verification";
}

function countBy<T>(arr: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of arr) { const k = key(x); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}
function toEntries(m: Map<string, number>) { return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); }

// CSV export of the filtered case rows.
export function casesToCsv(state: DemoState, f: Filters): string {
  const rows = filterCases(state, f).map((c) => rowFor(state, c));
  const cols = ["caseNumber", "name", "role", "department", "location", "region", "workerType", "manager", "scenario", "startDate", "cohort", "status", "risk", "readinessScore", "dayOneReady", "criticalBlocker", "owner", "nextAction"];
  const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n");
}
