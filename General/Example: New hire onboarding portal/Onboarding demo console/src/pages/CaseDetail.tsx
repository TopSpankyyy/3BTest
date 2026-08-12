import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp, useRead } from "../lib/store";
import { Card, Badge, Button, Ring, Spinner, ErrorState, EmptyState, Field, inputStyle, useToast } from "../components/primitives";
import { AuditTimeline, ExecutionList } from "../components/ExecutionInspector";
import { AiPreview } from "../components/AiPreview";
import { STATUS, RISK, TASK_STATUS, fmtDate, fmtDateTime, relToClock, titleize, regionLabel } from "../lib/ui";

const GROUPS: [string, string][] = [
  ["identity", "Identity"], ["device", "Device"], ["baseline_app", "Baseline applications"],
  ["role_access", "Role-specific access"], ["security", "Security"], ["training", "Training"],
  ["physical_access", "Physical access"], ["verification", "Verification"], ["followup", "Follow-up"],
];

export function CaseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { clock, run } = useApp();
  const { data, loading, error, reload } = useRead<any>("case", { id });
  const [tab, setTab] = useState<"work" | "audit" | "exec">("work");
  const [ai, setAi] = useState<any>(null);

  if (loading && !data) return <div className="p-8"><Spinner label="Loading case" /></div>;
  if (error) return <div className="p-8"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data?.case) return <div className="p-8"><EmptyState title="Case not found" /></div>;

  const c = data.case;
  const tasksById = new Map(data.tasks.map((t: any) => [t.id, t]));
  const unmet = c.readinessConditions.filter((r: any) => !r.met);

  return (
    <div className="space-y-5">
      <button onClick={() => nav(-1)} className="text-xs" style={{ color: "var(--text-2)" }}>← Back</button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{c.person.legalName}</h1>
            <Badge label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
            <Badge label={`Risk: ${RISK[c.risk].label}`} tone={RISK[c.risk].tone} />
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            {c.role} · {c.department} · {c.location} ({regionLabel(c.region)}) · {c.caseNumber}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>
            {titleize(c.caseType)} · {c.employment.workerType === "contractor" ? `Contractor · sponsor ${c.sponsor}` : `Manager ${c.manager}`} · source {c.sourceEventId} · policy {c.policyVersion}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">Starts {fmtDate(c.startDate)}</div>
          <div className="text-xs" style={{ color: "var(--text-2)" }}>{relToClock(c.startDate, clock)}{c.endDate ? ` · ends ${fmtDate(c.endDate)}` : ""}</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Readiness + actions rail */}
        <div className="space-y-4 lg:order-2">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Ring value={c.readinessScore} size={60} label="Readiness score" />
              <div>
                <div className="text-xs" style={{ color: "var(--text-2)" }}>Authoritative status</div>
                <div className="text-base font-semibold" style={{ color: c.dayOneReady ? "var(--success)" : "var(--error)" }}>{c.dayOneReady ? "Day-one ready" : "Not day-one ready"}</div>
              </div>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>Readiness requires every critical condition to be met — a high score never overrides a missing critical requirement.</p>
            <ul className="mt-3 space-y-1.5">
              {c.readinessConditions.map((r: any) => (
                <li key={r.key} className="flex items-start gap-2 text-xs">
                  <span aria-hidden style={{ color: r.met ? "var(--success)" : "var(--error)" }}>{r.met ? "✓" : "✕"}</span>
                  <span><span className="font-medium">{r.label}</span> — <span style={{ color: "var(--text-2)" }}>{r.detail}</span></span>
                </li>
              ))}
            </ul>
            {unmet.length > 0 && <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>Blocking readiness: {unmet.map((u: any) => u.label).join(", ")}</div>}
          </Card>

          <CaseActions c={c} tasks={data.tasks} run={run} nav={nav} />

          <Card className="p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>AI capability previews</h3>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAi("summarize_blockers")}>Summarize blockers</Button>
              <Button variant="secondary" size="sm" onClick={() => setAi("draft_update")}>Draft manager update</Button>
              <Button variant="secondary" size="sm" onClick={() => setAi("friction_narrative")}>Generate friction narrative</Button>
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-2)" }}>Previews only — no model is connected.</p>
          </Card>
        </div>

        {/* Main column */}
        <div className="space-y-4 lg:col-span-2 lg:order-1">
          <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
            {([["work", "Tasks & progress"], ["audit", "Audit trail"], ["exec", "Executions"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm font-medium transition-soft" style={{ color: tab === k ? "var(--accent)" : "var(--text-2)", borderBottom: `2px solid ${tab === k ? "var(--accent)" : "transparent"}` }}>{l}</button>
            ))}
          </div>

          {tab === "work" && (
            <div className="space-y-4">
              {c.status === "on_hold" && (
                <Card className="p-3 text-sm" style={{ background: "color-mix(in srgb, var(--warning) 8%, var(--card))", borderColor: "color-mix(in srgb, var(--warning) 30%, var(--border))" }}>
                  This case is on a safe hold — no accounts or licenses are provisioned while required source data is missing. Use “Correct source data” to resume.
                </Card>
              )}

              <TasksSection tasks={data.tasks} tasksById={tasksById} criticalPath={c.criticalPath} run={run} />

              {data.approvals.length > 0 && (
                <Section title="Approvals">
                  {data.approvals.map((a: any) => (
                    <Card key={a.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{a.type}</div>
                        <Badge label={a.status} tone={a.status === "approved" ? "success" : a.status === "denied" ? "error" : a.status === "escalated" ? "error" : "warning"} />
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{a.approver} · {a.policyRationale}</div>
                      {a.decisionComment && <div className="mt-1 text-xs">“{a.decisionComment}”</div>}
                      {(a.status === "pending" || a.status === "escalated") && <Button variant="primary" size="sm" className="mt-2" onClick={() => nav(`/approvals?focus=${a.id}`)}>Review decision</Button>}
                    </Card>
                  ))}
                </Section>
              )}

              <Section title="Blockers">
                {data.blockers.length === 0 ? <EmptyState title="No blockers" icon="✓" /> : data.blockers.map((b: any) => (
                  <Card key={b.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm"><Badge label={titleize(b.category)} tone={b.status === "resolved" ? "neutral" : b.severity === "high" || b.severity === "critical" ? "error" : "warning"} /><span className="font-medium">{b.summary}</span></div>
                      <span className="text-xs" style={{ color: "var(--text-2)" }}>{b.status}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>Owner {b.owner} · {b.preventable ? "preventable" : "not preventable"} · opened {fmtDateTime(b.openedAt)}{b.resolution ? ` · ${b.resolution}` : ""}</div>
                    {b.status === "open" && <Button variant="secondary" size="sm" className="mt-2" onClick={() => run("RESOLVE_BLOCKER", { caseId: c.id, payload: { blockerId: b.id, resolution: "Resolved by IT Ops" } }, "Blocker resolved")}>Resolve</Button>}
                  </Card>
                ))}
              </Section>

              {data.checkIns.length > 0 && (
                <Section title="Employee check-ins">
                  {data.checkIns.map((ch: any) => (
                    <Card key={ch.id} className="p-3 text-sm">
                      <div className="flex items-center gap-2"><Badge label={titleize(ch.type)} tone="info" /><span className="font-medium">{titleize(ch.responseCategory ?? "pending")}</span></div>
                      <div className="mt-1 text-xs">“{ch.responseText}”</div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{fmtDateTime(ch.respondedAt)}{ch.resultingBlockerId ? ` · created blocker ${ch.resultingBlockerId}` : ""}</div>
                    </Card>
                  ))}
                </Section>
              )}

              {data.friction && (
                <Section title="Week-two friction review">
                  <Card className="p-3 text-sm">
                    <p>{data.friction.deterministicSummary}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {data.friction.lifecycleDelays.map((d: any) => <div key={d.stage} className="rounded-lg p-2" style={{ background: "color-mix(in srgb,var(--text) 4%,transparent)" }}><div style={{ color: "var(--text-2)" }}>{d.stage}</div><div className="font-medium tnum">{d.hours}h</div></div>)}
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: "var(--text-2)" }}>{data.friction.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                  </Card>
                </Section>
              )}
            </div>
          )}

          {tab === "audit" && <AuditTimeline audit={data.audit} executions={data.executions} />}
          {tab === "exec" && <ExecutionList executions={data.executions} />}
        </div>
      </div>

      {ai && <AiPreview kind={ai} bundle={data} onClose={() => setAi(null)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 text-sm font-semibold">{title}</h3><div className="space-y-2">{children}</div></section>;
}

function TasksSection({ tasks, tasksById, criticalPath, run }: any) {
  return (
    <Section title="Tasks & dependencies">
      {GROUPS.map(([type, label]) => {
        const group = tasks.filter((t: any) => t.taskType === type);
        if (group.length === 0) return null;
        return (
          <div key={type}>
            <div className="mb-1 mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{label}</div>
            <div className="space-y-1.5">
              {group.map((t: any) => <TaskCard key={t.id} t={t} tasksById={tasksById} onCriticalPath={criticalPath.includes(t.id)} run={run} />)}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

function TaskCard({ t, tasksById, onCriticalPath, run }: any) {
  const prereqs = t.prerequisites.map((p: string) => tasksById.get(p)?.title).filter(Boolean);
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{t.title}</span>
            <Badge label={TASK_STATUS[t.status]?.label ?? t.status} tone={TASK_STATUS[t.status]?.tone ?? "neutral"} />
            {onCriticalPath && <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>critical path</span>}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{t.simulatedSystem} · {titleize(t.executionMode)} · policy {t.policyRule} · owner {t.owner}</div>
          {prereqs.length > 0 && <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Depends on: {prereqs.join(", ")}</div>}
          {t.expiresAt && <div className="mt-0.5 text-xs" style={{ color: "var(--warning)" }}>Expires {fmtDate(t.expiresAt)}</div>}
          {t.lastError && <div className="mt-0.5 text-xs" style={{ color: "var(--error)" }}>{t.lastError} (attempt {t.attemptCount}/{t.maxAttempts})</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {t.status === "failed" && <Button variant="secondary" size="sm" onClick={() => run("REPLAY_TASK", { caseId: t.caseId, payload: { taskId: t.id } }, "Task replayed")}>Replay</Button>}
          {["requested", "approved", "blocked"].includes(t.status) && t.executionMode !== "approval_bound" && (
            <details className="text-right">
              <summary className="cursor-pointer text-[11px]" style={{ color: "var(--text-2)" }}>Inject failure</summary>
              <div className="mt-1 flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => run("INJECT_TRANSIENT_FAILURE", { caseId: t.caseId, payload: { taskId: t.id } }, "Transient failure injected")}>Transient</Button>
                <Button variant="ghost" size="sm" onClick={() => run("INJECT_PERMANENT_FAILURE", { caseId: t.caseId, payload: { taskId: t.id } }, "Permanent failure injected")}>Permanent</Button>
              </div>
            </details>
          )}
          {t.evidenceIds.length > 0 && <span className="text-[10px]" style={{ color: "var(--text-2)" }}>{t.evidenceIds.length} evidence</span>}
        </div>
      </div>
    </Card>
  );
}

// Contextual demo actions for the case.
function CaseActions({ c, tasks, run, nav }: any) {
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [manager, setManager] = useState("Grace Lin");
  const [cc, setCc] = useState("MKT-NY-02");
  const [checkin, setCheckin] = useState("");
  const hasShip = tasks.some((t: any) => t.simulatedSystem === "Simulated Shipping");
  const terminal = ["closed", "canceled", "transferred"].includes(c.status);

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Case actions</h3>

      {c.status === "on_hold" && (
        <div className="space-y-2 rounded-lg p-2" style={{ background: "color-mix(in srgb,var(--text) 3%,transparent)" }}>
          <div className="text-xs font-medium">Correct source data</div>
          <Field label="Manager"><input value={manager} onChange={(e) => setManager(e.target.value)} className="w-full rounded-lg border px-2 py-1.5 text-sm" style={inputStyle} /></Field>
          <Field label="Cost center"><input value={cc} onChange={(e) => setCc(e.target.value)} className="w-full rounded-lg border px-2 py-1.5 text-sm" style={inputStyle} /></Field>
          <Button variant="primary" size="sm" onClick={() => run("CORRECT_SOURCE_DATA", { caseId: c.id, payload: { manager, costCenter: cc } }, "Source corrected; case resumed")}>Apply & revalidate</Button>
        </div>
      )}

      {!terminal && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => run("ADVANCE_DEMO_TIME", { caseId: c.id, payload: { to: "one_day" } }, "Advanced one day")}>Advance one day</Button>
          <Button variant="secondary" size="sm" onClick={() => run("ADVANCE_DEMO_TIME", { caseId: c.id, payload: { to: "start_day" } }, "Advanced to start day")}>To start day</Button>
          {hasShip && <Button variant="secondary" size="sm" onClick={() => run("INJECT_SHIPMENT_DELAY", { caseId: c.id, payload: {} }, "Shipment delayed")}>Delay shipment</Button>}
          {c.scenarioKey === "internal_transfer" && <Button variant="secondary" size="sm" onClick={() => run("PROCESS_TRANSFER", { caseId: c.id, payload: {} }, "Transfer processed")}>Process transfer</Button>}
          {c.employment.workerType === "contractor" && <Button variant="secondary" size="sm" onClick={() => run("EXPIRE_CONTRACTOR", { caseId: c.id, payload: {} }, "Contractor expired")}>Expire contractor</Button>}
        </div>
      )}

      {!terminal && (
        <div className="space-y-1.5 rounded-lg p-2" style={{ background: "color-mix(in srgb,var(--text) 3%,transparent)" }}>
          <div className="text-xs font-medium">Employee day-one check-in</div>
          <div className="flex flex-wrap gap-1">
            {[["everything_works", "Everything works"], ["device_problem", "Device problem"], ["cannot_access_app", "Can’t access app"], ["mfa_problem", "MFA problem"], ["waiting_for_approval", "Waiting approval"]].map(([cat, lbl]) => (
              <Button key={cat} variant="ghost" size="sm" onClick={() => run("SUBMIT_CHECK_IN", { caseId: c.id, payload: { category: cat, text: lbl } }, "Check-in recorded")}>{lbl}</Button>
            ))}
          </div>
        </div>
      )}

      {!terminal && (
        <details>
          <summary className="cursor-pointer text-xs" style={{ color: "var(--error)" }}>Cancel hire…</summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs" style={{ color: "var(--text-2)" }}>This cancels the case and issues compensating revocations for any provisioned access. Type <strong>{c.caseNumber}</strong> to confirm.</p>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={c.caseNumber} className="w-full rounded-lg border px-2 py-1.5 text-sm" style={inputStyle} />
            <Button variant="danger" size="sm" disabled={confirm !== c.caseNumber} onClick={() => run("CANCEL_HIRE", { caseId: c.id, payload: { confirm } }, "Case canceled")}>Confirm cancellation</Button>
          </div>
        </details>
      )}
      {terminal && <p className="text-xs" style={{ color: "var(--text-2)" }}>This case is {STATUS[c.status].label.toLowerCase()}. Historical evidence is preserved and read-only.</p>}
    </Card>
  );
}
