// "Read onboarding data" — read-only projections for the console, case detail,
// reporting, filters, and CSV export. Read-only state mount.
import { parseRequest, json, text } from "./http";
import type { DemoState, OnboardingCase } from "./engine/types";
import { buildSeed } from "./engine/seed";
import { overviewKpis, report, filterCases, rowFor, casesToCsv, Filters } from "./engine/reporting";
import { POLICY } from "./engine/policy";

const STATE = "/storage/onboarding/state.json";

async function load(): Promise<DemoState> {
  const f = Bun.file(STATE);
  if (await f.exists()) {
    try { return JSON.parse(await f.text()) as DemoState; } catch { /* fall through */ }
  }
  // Read-only mount cannot persist; serve a deterministic in-memory seed until the
  // first command writes state. Identical bytes to what the writer bootstraps.
  return buildSeed();
}

const req = await parseRequest();
const q = req.query;
const resource = q.get("resource") ?? "overview";

function parseFilters(): Filters {
  const arr = (k: string) => { const v = q.get(k); return v ? v.split(",").filter(Boolean) : undefined; };
  return {
    cohorts: arr("cohorts"), departments: arr("departments"), regions: arr("regions"),
    locations: arr("locations"), workerTypes: arr("workerTypes"), managers: arr("managers"),
    scenarios: arr("scenarios"), risks: arr("risks"), statuses: arr("statuses"),
    systems: arr("systems"), blockerCategories: arr("blockerCategories"),
    dateFrom: q.get("dateFrom") ?? undefined, dateTo: q.get("dateTo") ?? undefined,
  };
}

try {
  const state = await load();
  const ACTIVE = new Set(["intake", "on_hold", "in_progress", "waiting_approval", "at_risk", "ready", "not_ready"]);

  switch (resource) {
    case "overview": {
      const active = state.cases.filter((c) => ACTIVE.has(c.status)).map((c) => rowFor(state, c));
      const needsAttention = [...active]
        .filter((r) => r.status === "at_risk" || r.status === "on_hold" || r.pendingApprovals > 0 || r.criticalBlocker || r.status === "not_ready")
        .sort((a, b) => urgency(b) - urgency(a));
      const pendingApprovals = state.approvals
        .filter((a) => a.status === "pending" || a.status === "escalated")
        .map((a) => ({ ...a, subject: state.cases.find((c) => c.id === a.caseId)?.person.preferredName, caseNumber: state.cases.find((c) => c.id === a.caseId)?.caseNumber }));
      const recentActivity = [...state.audit].slice(-25).reverse().map((e) => ({
        id: e.id, occurredAt: e.occurredAt, actor: e.actor, actorType: e.actorType,
        eventType: e.eventType, summary: e.summary, caseId: e.caseId,
        caseNumber: state.cases.find((c) => c.id === e.caseId)?.caseNumber ?? null,
      }));
      out(json(200, {
        clock: state.clock, clockStart: state.clockStart, version: state.version, seedVersion: state.seedVersion,
        policyVersion: state.policyVersion,
        kpis: overviewKpis(state), needsAttention, activeCases: active, pendingApprovals, recentActivity,
      }));
      break;
    }
    case "case": {
      const c = state.cases.find((x) => x.id === q.get("id") || x.caseNumber === q.get("id"));
      if (!c) { out(json(404, { error: "Case not found" })); break; }
      out(json(200, {
        clock: state.clock, version: state.version,
        case: c,
        tasks: state.tasks.filter((t) => t.caseId === c.id),
        approvals: state.approvals.filter((a) => a.caseId === c.id),
        blockers: state.blockers.filter((b) => b.caseId === c.id),
        checkIns: state.checkIns.filter((ch) => ch.caseId === c.id),
        friction: state.frictionReviews.find((f) => f.caseId === c.id) ?? null,
        audit: state.audit.filter((a) => a.caseId === c.id),
        executions: state.executions.filter((e) => e.caseId === c.id),
      }));
      break;
    }
    case "report": {
      out(json(200, { clock: state.clock, version: state.version, ...report(state, parseFilters()) }));
      break;
    }
    case "filters": {
      out(json(200, {
        cohorts: uniq(state.cases.map((c) => c.cohort)).sort(),
        departments: uniq(state.cases.map((c) => c.department)).sort(),
        regions: uniq(state.cases.map((c) => c.region)),
        locations: uniq(state.cases.map((c) => c.location)).sort(),
        workerTypes: ["full_time", "contractor"],
        managers: uniq(state.cases.map((c) => c.manager).filter(Boolean) as string[]).sort(),
        scenarios: uniq(state.cases.map((c) => c.scenarioKey).filter(Boolean) as string[]),
        risks: ["low", "medium", "high", "critical"],
        statuses: uniq(state.cases.map((c) => c.status)),
        systems: uniq(state.tasks.map((t) => t.simulatedSystem)),
        blockerCategories: uniq(state.blockers.map((b) => b.category)),
      }));
      break;
    }
    case "policy": {
      out(json(200, { policy: POLICY }));
      break;
    }
    case "export": {
      const csv = "# All data is synthetic — Globex Corporation demo environment. No external systems connected.\n" + casesToCsv(state, parseFilters());
      out(text(200, csv, "text/csv; charset=utf-8", { "Content-Disposition": 'attachment; filename="onboarding-cases.csv"' }));
      break;
    }
    default:
      out(json(400, { error: `Unknown resource: ${resource}` }));
  }
} catch (e) {
  console.error("Read failure:", e);
  out(json(500, { error: "Internal error reading data" }));
}

function urgency(r: any): number {
  let s = 0;
  if (r.status === "at_risk") s += 100;
  if (r.status === "not_ready") s += 90;
  if (r.status === "on_hold") s += 70;
  if (r.criticalBlocker) s += 60;
  s += r.pendingApprovals * 20;
  s += Math.max(0, 40 - r.readinessScore / 2);
  return s;
}
function uniq<T>(a: T[]): T[] { return [...new Set(a)]; }
function out(s: string) { process.stdout.write(s); }
