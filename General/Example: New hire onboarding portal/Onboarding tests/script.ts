// Deterministic logic + integration tests for the onboarding engine.
// Runs against in-memory state (buildSeed + applyCommand) — no volume needed.
import { buildSeed } from "./engine/seed";
import { applyCommand } from "./engine/commands";
import { report, filterCases, casesToCsv } from "./engine/reporting";
import type { DemoState } from "./engine/types";

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; } else { fail++; fails.push(`${name}${detail ? ` — ${detail}` : ""}`); }
}
function findCase(s: DemoState, key: string) { return s.cases.find((c) => c.scenarioKey === key)!; }
function tasksOf(s: DemoState, id: string) { return s.tasks.filter((t) => t.caseId === id); }
let cmdN = 0;
const cmd = (s: DemoState, commandType: string, o: any = {}) => applyCommand(s, { commandId: `t${cmdN++}`, commandType, actor: o.actor ?? "Tester", caseId: o.caseId, payload: o.payload ?? {} });

// --- Seed + reset determinism ---
{
  const a = buildSeed(), b = buildSeed();
  ok("seed determinism: case count", a.cases.length === b.cases.length && a.cases.length === 32, `${a.cases.length}`);
  ok("seed determinism: identical audit count", a.audit.length === b.audit.length);
  ok("seed determinism: same first case number", a.cases[0].caseNumber === b.cases[0].caseNumber);
  ok("seed has 6 showcase", a.cases.filter((c) => c.scenarioKey).length === 6);
  ok("seed clock fixed", a.clock === "2024-06-03T08:00:00.000Z");
}

// --- Duplicate event / idempotency ---
{
  const s = buildSeed();
  const before = s.cases.length;
  ok("duplicate event detection", s.seenSourceEvents.includes(s.cases[0].sourceEventId));
  const r1 = cmd(s, "APPROVE_REQUEST", { payload: { approvalId: s.approvals.find((a) => a.status === "pending" && a.risk === "medium")!.id, comment: "ok" } });
  const v = s.version;
  const dup = applyCommand(s, { commandId: "dup-1", commandType: "ADVANCE_DEMO_TIME", payload: { hours: 1 } });
  const dup2 = applyCommand(s, { commandId: "dup-1", commandType: "ADVANCE_DEMO_TIME", payload: { hours: 1 } });
  ok("idempotent command: version unchanged on replay", dup.version === dup2.version);
  ok("idempotent command: no new case", s.cases.length === before);
}

// --- Illegal transition ---
{
  const s = buildSeed();
  const ap = s.approvals.find((a) => a.status === "pending" && a.risk === "medium")!;
  cmd(s, "APPROVE_REQUEST", { payload: { approvalId: ap.id, comment: "ok" } });
  const again = cmd(s, "APPROVE_REQUEST", { payload: { approvalId: ap.id, comment: "again" } });
  ok("illegal transition: cannot re-approve", !again.ok && again.code === "INVALID_TRANSITION", again.error);
}

// --- Privileged approval rules ---
{
  const s = buildSeed();
  const sec = findCase(s, "privileged_security");
  const ap = s.approvals.find((a) => a.caseId === sec.id && a.status === "pending")!;
  const noComment = cmd(s, "APPROVE_REQUEST", { payload: { approvalId: ap.id, comment: "" } });
  ok("privileged: comment required", !noComment.ok, noComment.error);
  const self = cmd(s, "APPROVE_REQUEST", { actor: sec.person.legalName, payload: { approvalId: ap.id, comment: "self approve" } });
  ok("privileged: self-approval rejected", !self.ok, self.error);
  // two-stage: first approve clears stage 1, still pending
  const s1 = cmd(s, "APPROVE_REQUEST", { actor: "Oliver Grant", payload: { approvalId: ap.id, comment: "stage1" } });
  ok("privileged: stage 1 clears, not yet approved", s1.ok && s.approvals.find((a) => a.id === ap.id)!.status === "pending");
  const s2 = cmd(s, "APPROVE_REQUEST", { actor: "Security Owner", payload: { approvalId: ap.id, comment: "stage2" } });
  ok("privileged: stage 2 approves", s2.ok && s.approvals.find((a) => a.id === ap.id)!.status === "approved");
  ok("privileged: never auto-approved in seed", buildSeed().approvals.filter((a) => a.risk === "critical").every((a) => a.status !== "approved"));
}

// --- Standard engineer: dependency ordering + readiness gate ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const gh = tasksOf(s, eng.id).find((t) => t.title.includes("GitHub"))!;
  ok("dependency: GitHub blocked pending approval", gh.status === "blocked");
  ok("readiness gate: high score but not day-one ready", eng.readinessScore >= 75 && !eng.dayOneReady, `${eng.readinessScore}`);
  const baseline = tasksOf(s, eng.id).filter((t) => t.executionMode === "automatic" && t.taskType !== "followup");
  ok("parallel: baseline auto tasks verified", baseline.every((t) => ["verified"].includes(t.status)));
}

// --- Transient retry then success ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const slack = tasksOf(s, eng.id).find((t) => t.simulatedSystem === "Simulated Slack")!;
  // slack already verified; pick a fresh requested-like path: inject transient on a re-runnable task via inject then it should recover
  const r = cmd(s, "INJECT_TRANSIENT_FAILURE", { caseId: eng.id, payload: { taskId: slack.id } });
  const after = tasksOf(s, eng.id).find((t) => t.id === slack.id)!;
  ok("transient: recovers to verified after retries", after.status === "verified", after.status);
  ok("transient: multiple attempts recorded", s.executions.filter((e) => e.taskId === slack.id && e.errorClass === "transient").length >= 1);
}

// --- Permanent failure escalation ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const jira = tasksOf(s, eng.id).find((t) => t.simulatedSystem === "Simulated Jira")!;
  cmd(s, "INJECT_PERMANENT_FAILURE", { caseId: eng.id, payload: { taskId: jira.id } });
  const after = tasksOf(s, eng.id).find((t) => t.id === jira.id)!;
  ok("permanent: task failed", after.status === "failed", after.status);
  ok("permanent: not retried past 1 attempt", after.attemptCount === 1, `${after.attemptCount}`);
  ok("permanent: blocker created", s.blockers.some((b) => b.caseId === eng.id && b.status === "open"));
}

// --- Replay after success = no-op (no duplicate) ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const id = tasksOf(s, eng.id).find((t) => t.taskType === "identity")!;
  const before = s.executions.filter((e) => e.taskId === id.id && e.operation === "create_identity").length;
  cmd(s, "REPLAY_TASK", { caseId: eng.id, payload: { taskId: id.id } });
  const after = s.executions.filter((e) => e.taskId === id.id && e.operation === "create_identity").length;
  ok("replay: verified task not re-provisioned", after === before, `${before}->${after}`);
  ok("replay: no-op audit recorded", s.audit.some((a) => a.eventType === "task.replay_noop"));
}

// --- Missing HRIS safe hold + correction resumes same case ---
{
  const s = buildSeed();
  const inc = findCase(s, "incomplete_hris");
  ok("safe hold: on hold", inc.status === "on_hold");
  ok("safe hold: no tasks provisioned", tasksOf(s, inc.id).length === 0);
  const caseCountBefore = s.cases.length;
  const r = cmd(s, "CORRECT_SOURCE_DATA", { caseId: inc.id, payload: { manager: "Grace Lin", costCenter: "MKT-01" } });
  ok("correction: resumes same case", r.ok && s.cases.length === caseCountBefore, r.error);
  ok("correction: tasks now created", tasksOf(s, inc.id).length > 0);
  ok("correction: no duplicate case", s.cases.filter((c) => c.scenarioKey === "incomplete_hris").length === 1);
}

// --- Start date change ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const r = cmd(s, "CHANGE_START_DATE", { caseId: eng.id, payload: { startDate: "2024-06-20T08:00:00.000Z" } });
  ok("start date change", r.ok && findCase(s, "standard_engineer").startDate.startsWith("2024-06-20"));
}

// --- Cancellation after partial provisioning creates revocations ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const r = cmd(s, "CANCEL_HIRE", { caseId: eng.id, payload: { confirm: eng.caseNumber } });
  ok("cancel: requires confirmation", !cmd(buildSeed(), "CANCEL_HIRE", { caseId: eng.id, payload: { confirm: "wrong" } }).ok);
  ok("cancel: case canceled", r.ok && findCase(s, "standard_engineer").status === "canceled", r.error);
  ok("cancel: revocations issued", tasksOf(s, eng.id).some((t) => t.status === "revoked"));
  ok("cancel: original evidence preserved", s.executions.some((e) => e.caseId === eng.id && e.operation === "create_identity"));
}

// --- Internal transfer: revocation before close ---
{
  const s = buildSeed();
  const xfer = findCase(s, "internal_transfer");
  ok("transfer: plan has grant and remove", tasksOf(s, xfer.id).some((t) => t.title.includes("Grant")) && tasksOf(s, xfer.id).some((t) => t.title.includes("Revoke")));
  ok("transfer: cannot be ready before revocation verified", !xfer.dayOneReady);
  const r = cmd(s, "PROCESS_TRANSFER", { caseId: xfer.id, payload: {} });
  const after = findCase(s, "internal_transfer");
  ok("transfer: revoke task revoked", tasksOf(s, xfer.id).find((t) => t.title.includes("Revoke incompatible"))!.status === "revoked");
  ok("transfer: closes as transferred", after.status === "transferred", after.status);
}

// --- Contractor expiration ---
{
  const s = buildSeed();
  const ctr = findCase(s, "contractor");
  ok("contractor: all access has expiry", tasksOf(s, ctr.id).filter((t) => ["provisioned", "verified", "approved"].includes(t.status)).every((t) => t.expiresAt != null || t.taskType === "training"));
  ok("contractor: sponsor set", !!ctr.sponsor);
  const r = cmd(s, "EXPIRE_CONTRACTOR", { caseId: ctr.id, payload: {} });
  ok("contractor: expiry revokes access", r.ok && tasksOf(s, ctr.id).some((t) => t.status === "revoked"), r.error);
  ok("contractor: closed", findCase(s, "contractor").status === "closed");
}

// --- Shipment delay + resolution restores readiness ---
{
  const s = buildSeed();
  const sales = findCase(s, "remote_sales");
  ok("shipment: sales at risk from delay", sales.status === "at_risk");
  const ap = s.approvals.find((a) => a.caseId === sales.id && a.status === "pending")!;
  cmd(s, "APPROVE_REQUEST", { payload: { approvalId: ap.id, comment: "seat approved" } });
  const blk = s.blockers.find((b) => b.caseId === sales.id && b.category === "shipping_delay" && b.status === "open")!;
  cmd(s, "RESOLVE_BLOCKER", { caseId: sales.id, payload: { blockerId: blk.id, resolution: "delivered" } });
  const after = findCase(s, "remote_sales");
  ok("shipment: readiness restored after delivery", after.dayOneReady, `score ${after.readinessScore}, status ${after.status}`);
}

// --- Employee check-in creates blocker ---
{
  const s = buildSeed();
  const eng = findCase(s, "standard_engineer");
  const before = s.blockers.filter((b) => b.caseId === eng.id).length;
  cmd(s, "SUBMIT_CHECK_IN", { caseId: eng.id, payload: { category: "mfa_problem", text: "cannot enroll" } });
  ok("check-in: blocker created", s.blockers.filter((b) => b.caseId === eng.id && b.source === "employee").length === 1);
  ok("check-in: everything_works creates none", (() => { const s2 = buildSeed(); const e2 = findCase(s2, "standard_engineer"); const b0 = s2.blockers.filter((b) => b.caseId === e2.id).length; cmd(s2, "SUBMIT_CHECK_IN", { caseId: e2.id, payload: { category: "everything_works", text: "ok" } }); return s2.blockers.filter((b) => b.caseId === e2.id).length === b0; })());
}

// --- Friction determinism ---
{
  const a = buildSeed(), b = buildSeed();
  const fa = a.frictionReviews[0], fb = b.frictionReviews[0];
  ok("friction: deterministic summary", fa && fb && fa.deterministicSummary === fb.deterministicSummary);
  ok("friction: has recommendations", fa.recommendations.length > 0);
}

// --- Dashboard reconciliation + projection rebuild ---
{
  const s = buildSeed();
  const full = report(s, {});
  ok("report: count == total cases", full.count === s.cases.length, `${full.count} vs ${s.cases.length}`);
  const eng = report(s, { departments: ["Engineering"] });
  ok("report: filter reconciles to filtered rows", eng.count === filterCases(s, { departments: ["Engineering"] }).length);
  ok("report: blocker totals reconcile", full.blockersByCategory.reduce((a, b) => a + b.value, 0) === s.blockers.length);
  const r2 = report(s, {});
  ok("projection rebuild: stable KPIs", JSON.stringify(full.kpis) === JSON.stringify(r2.kpis));
}

// --- CSV export matches filter ---
{
  const s = buildSeed();
  const csv = casesToCsv(s, { regions: ["europe"] });
  const rows = csv.trim().split("\n").length - 1; // minus header
  ok("csv: rows match filtered cases", rows === filterCases(s, { regions: ["europe"] }).length, `${rows}`);
}

// --- Report summary ---
console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) { console.log("FAILURES:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("All tests passed.");
