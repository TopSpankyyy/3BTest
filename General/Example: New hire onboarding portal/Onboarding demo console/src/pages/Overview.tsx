import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { Card, Stat, Badge, Spinner, ErrorState, EmptyState, Button } from "../components/primitives";
import { STATUS, RISK, fmtDate, fmtDateTime, relToClock, titleize, regionLabel } from "../lib/ui";

export function Overview() {
  const { overview, loading, error, refresh, clock } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "urgency", dir: -1 });

  const rows = useMemo(() => {
    let r = [...(overview?.activeCases ?? [])];
    if (q) { const s = q.toLowerCase(); r = r.filter((c: any) => `${c.name} ${c.legalName} ${c.role} ${c.department} ${c.caseNumber} ${c.location}`.toLowerCase().includes(s)); }
    if (statusFilter !== "all") r = r.filter((c: any) => c.status === statusFilter);
    const val = (c: any) => sort.key === "urgency" ? (c.status === "at_risk" ? 3 : c.status === "on_hold" ? 2 : c.pendingApprovals > 0 ? 1 : 0) * 1000 - c.readinessScore : sort.key === "readiness" ? c.readinessScore : sort.key === "start" ? new Date(c.startDate).getTime() : c.name;
    r.sort((a: any, b: any) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    return r;
  }, [overview, q, statusFilter, sort]);

  if (loading && !overview) return <div className="p-8"><Spinner label="Loading operations console" /></div>;
  if (error) return <div className="p-8"><ErrorState message={error} onRetry={refresh} /></div>;
  const k = overview.kpis;

  const kpis = [
    { label: "Active cases", value: k.activeCases },
    { label: "Day-one ready", value: k.dayOneReady, tone: "var(--success)" },
    { label: "At risk", value: k.atRisk, tone: k.atRisk ? "var(--error)" : undefined },
    { label: "Critical blockers", value: k.criticalBlockers, tone: k.criticalBlockers ? "var(--error)" : undefined },
    { label: "Pending approvals", value: k.pendingApprovals, tone: k.pendingApprovals ? "var(--warning)" : undefined },
    { label: "Overdue critical tasks", value: k.overdueCritical, tone: k.overdueCritical ? "var(--warning)" : undefined },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Operations overview</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>Policy-driven onboarding control plane · {overview.activeCases.length} active cases · policy {overview.policyVersion}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kp) => <Stat key={kp.label} label={kp.label} value={kp.value} tone={kp.tone} />)}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Needs attention */}
        <section className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold">Needs attention</h2>
          {overview.needsAttention.length === 0 ? (
            <Card className="p-4"><EmptyState title="Nothing needs attention" hint="All active cases are progressing normally." icon="✓" /></Card>
          ) : (
            <div className="space-y-2">
              {overview.needsAttention.slice(0, 6).map((c: any) => (
                <Card key={c.id} as="button" className="w-full p-3.5 text-left hover:brightness-[0.99]" onClick={() => nav(`/case/${c.id}`)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.name}</span>
                        <Badge label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
                      </div>
                      <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-2)" }}>{c.role} · {c.department} · {c.location}</div>
                      <div className="mt-1 text-xs" style={{ color: "var(--error)" }}>{c.criticalBlocker ?? c.nextAction}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--text-2)" }}>Starts {relToClock(c.startDate, clock)}</div>
                      <div className="text-xs font-medium">Owner: {c.owner}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Active case table */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <h2 className="mr-auto text-sm font-semibold">Active cases</h2>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…" className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ background: "var(--page)", borderColor: "var(--border)", color: "var(--text)" }} aria-label="Search cases" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ background: "var(--page)", borderColor: "var(--border)", color: "var(--text)" }} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs" style={{ color: "var(--text-2)", borderColor: "var(--border)" }}>
                    {[["name", "Person"], ["role", "Role / dept"], ["start", "Start"], ["stage", "Stage"], ["readiness", "Readiness"], ["risk", "Risk"], ["next", "Next action"]].map(([key, label]) => (
                      <th key={key} className="px-3 py-2 font-medium">
                        {["name", "readiness", "start"].includes(key) ? (
                          <button className="hover:underline" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
                        ) : label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => (
                    <tr key={c.id} className="cursor-pointer border-b transition-soft hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" style={{ borderColor: "var(--border)" }} onClick={() => nav(`/case/${c.id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/case/${c.id}`)}>
                      <td className="px-3 py-2.5"><div className="font-medium">{c.name}</div><div className="text-xs" style={{ color: "var(--text-2)" }}>{c.caseNumber}</div></td>
                      <td className="px-3 py-2.5"><div>{c.role}</div><div className="text-xs" style={{ color: "var(--text-2)" }}>{c.department} · {regionLabel(c.region)}</div></td>
                      <td className="px-3 py-2.5 text-xs tnum">{fmtDate(c.startDate)}</td>
                      <td className="px-3 py-2.5 text-xs">{titleize(c.stage)}</td>
                      <td className="px-3 py-2.5"><ReadinessBar score={c.readinessScore} ready={c.dayOneReady} /></td>
                      <td className="px-3 py-2.5"><Badge label={RISK[c.risk].label} tone={RISK[c.risk].tone} /></td>
                      <td className="px-3 py-2.5 text-xs">{c.nextAction}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={7}><EmptyState title="No matching cases" hint="Try clearing the search or status filter." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        {/* Right rail: approvals + activity */}
        <section className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pending approvals</h2>
              <Button variant="ghost" size="sm" onClick={() => nav("/approvals")}>View all</Button>
            </div>
            {overview.pendingApprovals.length === 0 ? (
              <Card className="p-4"><EmptyState title="No pending approvals" icon="✓" /></Card>
            ) : (
              <div className="space-y-2">
                {overview.pendingApprovals.slice(0, 5).map((a: any) => (
                  <Card key={a.id} as="button" className="w-full p-3 text-left" onClick={() => nav(`/approvals?focus=${a.id}`)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{a.type}</div>
                        <div className="text-xs" style={{ color: "var(--text-2)" }}>{a.subject} · {a.caseNumber}</div>
                      </div>
                      <Badge label={RISK[a.risk].label} tone={RISK[a.risk].tone} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent workflow activity</h2>
            <Card className="p-3">
              <ol className="space-y-2.5">
                {overview.recentActivity.slice(0, 12).map((e: any) => (
                  <li key={e.id} className="flex gap-2.5 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: actorColor(e.actorType) }} aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate">{e.summary}</div>
                      <div style={{ color: "var(--text-2)" }}>{e.actor} · {fmtDateTime(e.occurredAt)}{e.caseNumber ? ` · ${e.caseNumber}` : ""}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

function ReadinessBar({ score, ready }: { score: number; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: ready ? "var(--success)" : score >= 60 ? "var(--accent)" : "var(--warning)" }} />
      </span>
      <span className="text-xs font-medium tnum">{score}</span>
      {ready && <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>ready</span>}
    </div>
  );
}
function actorColor(t: string) { return { workflow: "var(--accent)", human: "var(--info)", employee: "var(--c3)", system: "var(--text-2)", policy: "var(--c4)" }[t] ?? "var(--text-2)"; }
