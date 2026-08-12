import type { DemoState, OnboardingCase, CheckIn } from "./types";
import { addHours, addDays, diffHours, cohort } from "./clock";
import { validate } from "./build";
import { buildTasksAndApprovals } from "./build";
import { audit, runCaseWork, recomputeReadiness, setCohort } from "./lifecycle";
import { approve, deny, resolveBlocker, replayTask, injectShipmentDelay, revokeTask, findCase } from "./ops";
import { submitCheckIn, evaluateSlas } from "./checkins";
import { generateFriction } from "./friction";

export interface Command {
  commandId: string;
  commandType: string;
  requestedAt?: string;
  actor?: string;
  caseId?: string;
  expectedVersion?: number;
  payload?: Record<string, any>;
}

export interface CommandResult {
  ok: boolean;
  message?: string;
  error?: string;
  code?: string;
  data?: Record<string, any>;
  version?: number;
}

const COMMANDS = new Set([
  "START_SCENARIO", "INGEST_HRIS_EVENT", "CORRECT_SOURCE_DATA", "APPROVE_REQUEST", "DENY_REQUEST",
  "ADVANCE_DEMO_TIME", "INJECT_TRANSIENT_FAILURE", "INJECT_PERMANENT_FAILURE", "INJECT_SHIPMENT_DELAY",
  "RESOLVE_BLOCKER", "REPLAY_TASK", "SUBMIT_CHECK_IN", "CHANGE_START_DATE", "CANCEL_HIRE",
  "PROCESS_TRANSFER", "EXPIRE_CONTRACTOR",
]);

// Apply a command to the state in place. RESET_DEMO is handled by the store layer.
export function applyCommand(state: DemoState, cmd: Command): CommandResult {
  if (!cmd.commandId || !cmd.commandType) return { ok: false, error: "commandId and commandType are required", code: "BAD_REQUEST" };
  if (!COMMANDS.has(cmd.commandType)) return { ok: false, error: `Unknown command: ${cmd.commandType}`, code: "UNKNOWN_COMMAND" };

  // Idempotency: replay returns the original result without reapplying side effects.
  if (state.processedCommands[cmd.commandId]) {
    return { ...(state.processedCommands[cmd.commandId] as CommandResult), message: "Replayed (idempotent) — original result returned." };
  }
  // Optimistic concurrency.
  if (typeof cmd.expectedVersion === "number" && cmd.expectedVersion !== state.version) {
    return { ok: false, error: `Stale command: expected version ${cmd.expectedVersion}, current is ${state.version}`, code: "STALE_VERSION", version: state.version };
  }

  const now = state.clock;
  const actor = cmd.actor || "IT Ops";
  let result: CommandResult;
  try {
    result = dispatch(state, cmd, now, actor);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "Internal error", code: "INTERNAL" };
  }

  if (result.ok) {
    state.version += 1;
    result.version = state.version;
  }
  state.processedCommands[cmd.commandId] = result;
  return result;
}

function dispatch(state: DemoState, cmd: Command, now: string, actor: string): CommandResult {
  const p = cmd.payload ?? {};
  const kase = () => (cmd.caseId ? findCase(state, cmd.caseId) : undefined);

  switch (cmd.commandType) {
    case "START_SCENARIO": {
      const k = state.cases.find((c) => c.scenarioKey === p.scenarioKey);
      if (!k) return { ok: false, error: `No seeded case for scenario ${p.scenarioKey}`, code: "NOT_FOUND" };
      return { ok: true, message: `Scenario ready: ${k.person.preferredName}`, data: { caseId: k.id } };
    }

    case "APPROVE_REQUEST": {
      const ap = state.approvals.find((a) => a.id === p.approvalId);
      if (!ap) return { ok: false, error: "Approval not found", code: "NOT_FOUND" };
      const r = approve(state, ap, p.comment ?? "", actor, now);
      return r.ok ? { ok: true, message: "Approval recorded.", data: { caseId: ap.caseId } } : { ok: false, error: r.error, code: "INVALID_TRANSITION", data: { caseId: ap.caseId } };
    }
    case "DENY_REQUEST": {
      const ap = state.approvals.find((a) => a.id === p.approvalId);
      if (!ap) return { ok: false, error: "Approval not found", code: "NOT_FOUND" };
      const r = deny(state, ap, p.comment ?? "", actor, now);
      return r.ok ? { ok: true, message: "Denial recorded.", data: { caseId: ap.caseId } } : { ok: false, error: r.error, code: "INVALID_TRANSITION", data: { caseId: ap.caseId } };
    }

    case "CORRECT_SOURCE_DATA": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      if (k.status !== "on_hold") return { ok: false, error: "Case is not on hold; nothing to correct", code: "INVALID_TRANSITION" };
      const before = { manager: k.manager, costCenter: k.employment.costCenter };
      if (p.manager) k.manager = p.manager;
      if (p.costCenter) k.employment.costCenter = p.costCenter;
      const spec = specFromCase(k);
      const v = validate(spec);
      if (!v.ok) return { ok: false, error: `Still incomplete: ${v.problems.join("; ")}`, code: "VALIDATION_FAILED" };
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "human", actor, eventType: "case.source_corrected", summary: "Source data corrected; revalidated", rationale: "HRIS record completed by People Ops", before, after: { manager: k.manager, costCenter: k.employment.costCenter }, evidence: [], metadata: {} });
      // Resume the SAME case (no duplication) — build tasks only if not already built.
      if (state.tasks.filter((t) => t.caseId === k.id).length === 0) buildTasksAndApprovals(state, k, spec, now);
      k.status = "in_progress"; k.currentStage = "provisioning";
      runCaseWork(state, k, now);
      return { ok: true, message: "Source corrected; case resumed.", data: { caseId: k.id } };
    }

    case "INJECT_TRANSIENT_FAILURE":
    case "INJECT_PERMANENT_FAILURE": {
      const t = state.tasks.find((x) => x.id === p.taskId);
      if (!t) return { ok: false, error: "Task not found", code: "NOT_FOUND" };
      if (t.status === "running") return { ok: false, error: "Task is currently running", code: "INVALID_TRANSITION" };
      if (t.status === "revoked") return { ok: false, error: "Cannot inject failure into revoked access", code: "INVALID_TRANSITION" };
      t.injectedFailure = cmd.commandType === "INJECT_TRANSIENT_FAILURE" ? "transient" : "permanent";
      // Re-run the operation from a clean attempt — clears prior success markers.
      t.status = "requested"; t.attemptCount = 0; t.failedAt = null; t.provisionedAt = null; t.verifiedAt = null;
      const k = findCase(state, t.caseId)!;
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "human", actor, eventType: "demo.inject_failure", summary: `Injected ${t.injectedFailure} failure into ${t.title}`, rationale: "Demo control", before: {}, after: {}, evidence: [], metadata: { taskId: t.id } });
      runCaseWork(state, k, now);
      return { ok: true, message: `${t.injectedFailure} failure injected.`, data: { caseId: k.id } };
    }

    case "INJECT_SHIPMENT_DELAY": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      const r = injectShipmentDelay(state, k, now);
      return r.ok ? { ok: true, message: "Shipment delayed.", data: { caseId: k.id } } : { ok: false, error: r.error, code: "INVALID_TRANSITION", data: { caseId: k.id } };
    }

    case "RESOLVE_BLOCKER": {
      const r = resolveBlocker(state, p.blockerId, p.resolution ?? "Resolved by IT Ops", now);
      return r.ok ? { ok: true, message: "Blocker resolved." } : { ok: false, error: r.error, code: "INVALID_TRANSITION" };
    }

    case "REPLAY_TASK": {
      const t = state.tasks.find((x) => x.id === p.taskId);
      if (!t) return { ok: false, error: "Task not found", code: "NOT_FOUND" };
      const r = replayTask(state, t, now);
      return r.ok ? { ok: true, message: "Task replayed.", data: { caseId: t.caseId } } : { ok: false, error: r.error, code: "INVALID_TRANSITION", data: { caseId: t.caseId } };
    }

    case "SUBMIT_CHECK_IN": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      const chk = submitCheckIn(state, k, p.category, p.text ?? "", now);
      return { ok: true, message: "Check-in recorded.", data: { caseId: k.id, checkInId: chk.id } };
    }

    case "CHANGE_START_DATE": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      if (["closed", "canceled", "transferred"].includes(k.status)) return { ok: false, error: "Cannot change start date of a closed case", code: "INVALID_TRANSITION" };
      const before = { startDate: k.startDate };
      k.startDate = p.startDate;
      setCohort(k);
      for (const t of state.tasks.filter((t) => t.caseId === k.id && !["verified", "revoked"].includes(t.status))) t.dueAt = addDays(k.startDate, -1);
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "human", actor, eventType: "case.start_date_changed", summary: `Start date changed to ${p.startDate.slice(0, 10)}`, rationale: p.reason ?? "Start date adjusted", before, after: { startDate: k.startDate }, evidence: [], metadata: {} });
      recomputeReadiness(state, k);
      return { ok: true, message: "Start date updated.", data: { caseId: k.id } };
    }

    case "CANCEL_HIRE": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      if (p.confirm !== k.caseNumber) return { ok: false, error: `Confirmation required: provide the case number (${k.caseNumber}) to cancel`, code: "CONFIRMATION_REQUIRED" };
      if (["closed", "canceled", "transferred"].includes(k.status)) return { ok: false, error: "Case is already terminal", code: "INVALID_TRANSITION" };
      // Compensating revocation for anything already provisioned/verified.
      let revoked = 0;
      for (const t of state.tasks.filter((t) => t.caseId === k.id && ["provisioned", "verified", "employee_confirmed"].includes(t.status))) {
        revokeTask(state, t, "Hire canceled — compensating revocation", now); revoked++;
      }
      k.status = "canceled"; k.closedAt = now; k.currentStage = "closed";
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "human", actor, eventType: "case.canceled", summary: `Hire canceled${revoked ? ` — ${revoked} access revocation(s) issued` : ""}`, rationale: p.reason ?? "Cancellation requested", before: {}, after: { status: "canceled", revoked }, evidence: [], metadata: {} });
      return { ok: true, message: `Case canceled${revoked ? `; ${revoked} revocation(s) issued.` : "."}`, data: { caseId: k.id } };
    }

    case "PROCESS_TRANSFER": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      const revokeTaskObj = state.tasks.find((t) => t.caseId === k.id && t.title.includes("Revoke incompatible"));
      const verifyTaskObj = state.tasks.find((t) => t.caseId === k.id && t.title.includes("Verify finance access revoked"));
      if (!revokeTaskObj) return { ok: false, error: "Not a transfer case", code: "INVALID_TRANSITION" };
      if (revokeTaskObj.status !== "revoked" && revokeTaskObj.status !== "verified") {
        revokeTask(state, revokeTaskObj, "Incompatible finance-operations access removed (XFR-001)", now);
      }
      if (verifyTaskObj) { verifyTaskObj.status = "verified"; verifyTaskObj.verifiedAt = addHours(now, 0.2); }
      for (const b of state.blockers.filter((b) => b.caseId === k.id && b.category === "segregation_of_duties" && b.status === "open")) { b.status = "resolved"; b.resolvedAt = now; b.resolution = "Incompatible access revoked and verified."; }
      recomputeReadiness(state, k);
      if (k.dayOneReady) { k.status = "transferred"; k.closedAt = now; k.currentStage = "closed"; }
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "workflow", actor: "Write onboarding state", eventType: "case.transfer_processed", summary: "Transfer processed — legacy finance access verified revoked", rationale: "XFR-001: transfer cannot close until incompatible access verified removed", before: {}, after: { status: k.status }, evidence: [], metadata: {} });
      return { ok: true, message: "Transfer processed; incompatible access revoked and verified.", data: { caseId: k.id } };
    }

    case "EXPIRE_CONTRACTOR": {
      const k = kase();
      if (!k) return { ok: false, error: "Case not found", code: "NOT_FOUND" };
      if (k.employment.workerType !== "contractor") return { ok: false, error: "Not a contractor case", code: "INVALID_TRANSITION" };
      let revoked = 0;
      for (const t of state.tasks.filter((t) => t.caseId === k.id && ["provisioned", "verified", "employee_confirmed", "approved"].includes(t.status))) { revokeTask(state, t, "Contractor access expired (CTR-001)", now); revoked++; }
      k.status = "closed"; k.closedAt = now; k.currentStage = "closed";
      audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: now, actorType: "workflow", actor: "Write onboarding state", eventType: "case.contractor_expired", summary: `Contractor access expired — ${revoked} revocation(s) verified`, rationale: "Contract end date reached (CTR-001)", before: {}, after: { status: "closed", revoked }, evidence: [], metadata: {} });
      return { ok: true, message: `Contractor expired; ${revoked} access revocation(s) issued.`, data: { caseId: k.id } };
    }

    case "ADVANCE_DEMO_TIME": {
      const hours = resolveAdvance(state, cmd);
      if (hours <= 0) return { ok: false, error: "Nothing to advance to", code: "NOOP" };
      state.clock = addHours(state.clock, hours);
      const escalations = evaluateSlas(state, state.clock);
      // Auto-run any newly-eligible work and contractor expiry.
      for (const k of state.cases) {
        if (["closed", "canceled", "transferred", "on_hold"].includes(k.status)) continue;
        if (k.employment.workerType === "contractor" && k.endDate && diffHours(state.clock, k.endDate) <= 0) {
          for (const t of state.tasks.filter((t) => t.caseId === k.id && ["provisioned", "verified", "approved"].includes(t.status))) revokeTask(state, t, "Contractor access expired (CTR-001)", state.clock);
          k.status = "closed"; k.closedAt = state.clock; k.currentStage = "closed";
          audit(state, { caseId: k.id, correlationId: k.correlationId, occurredAt: state.clock, actorType: "workflow", actor: "Monitor SLAs", eventType: "case.contractor_expired", summary: "Contractor access auto-expired at contract end", rationale: "CTR-001", before: {}, after: { status: "closed" }, evidence: [], metadata: {} });
          continue;
        }
        runCaseWork(state, k, state.clock);
        // Week-two review once past start + 14 days.
        if (k.startDate && diffHours(k.startDate, state.clock) >= 14 * 24 && !state.frictionReviews.some((f) => f.caseId === k.id)) {
          generateFriction(state, k);
        }
      }
      audit(state, { caseId: cmd.caseId ?? "", correlationId: "clock", occurredAt: state.clock, actorType: "system", actor: "Simulated clock", eventType: "clock.advanced", summary: `Advanced ${hours}h to ${state.clock.slice(0, 16).replace("T", " ")} UTC`, rationale: cmd.payload?.to ?? "manual", before: {}, after: { clock: state.clock, escalations }, evidence: [], metadata: {} });
      return { ok: true, message: `Advanced ${hours}h. ${escalations} escalation(s).`, data: { clock: state.clock } };
    }
    default:
      return { ok: false, error: "Unhandled command", code: "UNKNOWN_COMMAND" };
  }
}

function resolveAdvance(state: DemoState, cmd: Command): number {
  const p = cmd.payload ?? {};
  if (typeof p.hours === "number") return p.hours;
  const k = cmd.caseId ? findCase(state, cmd.caseId) : undefined;
  switch (p.to) {
    case "one_day": return 24;
    case "start_day": return k ? Math.max(0.5, diffHours(state.clock, k.startDate)) : 24;
    case "week_two": return k ? Math.max(24, diffHours(state.clock, addDays(k.startDate, 14))) : 14 * 24;
    case "next_event": return 8;
    default: return 24;
  }
}

function specFromCase(k: OnboardingCase) {
  return {
    scenarioKey: k.scenarioKey, caseType: k.caseType, person: k.person, employment: k.employment,
    manager: k.manager, sponsor: k.sponsor, department: k.department, role: k.role,
    location: k.location, region: k.region, startDate: k.startDate, endDate: k.endDate,
  };
}
