import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp, useRead } from "../lib/store";
import { exportUrl } from "../lib/api";
import { Card, Stat, Badge, Spinner, ErrorState, EmptyState, Button } from "../components/primitives";
import { ChartCard, BarList, Donut, Trend } from "../components/charts";
import { RISK, titleize, fmtDate, regionLabel } from "../lib/ui";

// Filter keys that live in the URL as comma-separated arrays.
const ARRAY_KEYS = ["departments", "regions", "workerTypes", "statuses", "scenarios", "blockerCategories", "systems", "cohorts"] as const;

export function Report() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const k of ARRAY_KEYS) { const v = sp.get(k); if (v) f[k] = v; }
    const df = sp.get("dateFrom"); if (df) f.dateFrom = df;
    const dt = sp.get("dateTo"); if (dt) f.dateTo = dt;
    return f;
  }, [sp]);

  const { data: opts } = useRead<any>("filters");
  const { data, loading, error, reload } = useRead<any>("report", filters, [JSON.stringify(filters)]);

  const activeCount = ARRAY_KEYS.reduce((n, k) => n + (sp.get(k) ? sp.get(k)!.split(",").length : 0), 0) + (sp.get("dateFrom") ? 1 : 0) + (sp.get("dateTo") ? 1 : 0);

  function toggle(key: string, value: string) {
    const cur = (sp.get(key)?.split(",").filter(Boolean)) ?? [];
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    const nsp = new URLSearchParams(sp);
    if (next.length) nsp.set(key, next.join(",")); else nsp.delete(key);
    setSp(nsp, { replace: false });
  }
  function clearAll() { setSp(new URLSearchParams(), { replace: false }); }

  if (loading && !data) return <div className="p-8"><Spinner label="Loading report" /></div>;
  if (error) return <div className="p-8"><ErrorState message={error} onRetry={reload} /></div>;
  const k = data.kpis;
  const sel = (key: string) => sp.get(key)?.split(",")[0] ?? null;

  const kpis = [
    { label: "Day-one readiness rate", value: `${k.dayOneReadinessRate}%`, sub: "of decided cases" },
    { label: "Median time to ready", value: `${Math.round(k.medianTimeToReadyHours / 24 * 10) / 10}d`, sub: `${k.medianTimeToReadyHours}h` },
    { label: "Active cases at risk", value: k.activeAtRisk, tone: k.activeAtRisk ? "var(--error)" : undefined },
    { label: "Overdue critical tasks", value: k.overdueCriticalTasks, tone: k.overdueCriticalTasks ? "var(--warning)" : undefined },
    { label: "Automation coverage", value: `${k.automationCoverage}%` },
    { label: "Straight-through rate", value: `${k.straightThroughRate}%` },
    { label: "Median approval wait", value: `${k.medianApprovalWaitHours}h` },
    { label: "Employee blocker rate", value: `${k.employeeBlockerRate}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Management report</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {data.count} case{data.count === 1 ? "" : "s"} in view · all data synthetic · every total reconciles to the cases behind it
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && <Button variant="ghost" size="sm" onClick={clearAll}>Clear filters ({activeCount})</Button>}
          <a href={exportUrl(filters)} download><Button variant="secondary" size="sm">Export filtered CSV</Button></a>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-3 space-y-2.5">
        <FilterRow label="Department" values={opts?.departments ?? []} active={sp.get("departments")} onToggle={(v) => toggle("departments", v)} />
        <FilterRow label="Region" values={opts?.regions ?? []} render={regionLabel} active={sp.get("regions")} onToggle={(v) => toggle("regions", v)} />
        <FilterRow label="Worker type" values={opts?.workerTypes ?? []} render={titleize} active={sp.get("workerTypes")} onToggle={(v) => toggle("workerTypes", v)} />
        <FilterRow label="Status" values={opts?.statuses ?? []} render={titleize} active={sp.get("statuses")} onToggle={(v) => toggle("statuses", v)} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="w-24 shrink-0 font-medium" style={{ color: "var(--text-2)" }}>Start range</span>
          <input type="date" value={sp.get("dateFrom") ?? ""} onChange={(e) => { const n = new URLSearchParams(sp); e.target.value ? n.set("dateFrom", e.target.value) : n.delete("dateFrom"); setSp(n); }} className="rounded-lg border px-2 py-1" style={{ background: "var(--page)", borderColor: "var(--border)", color: "var(--text)" }} />
          <span style={{ color: "var(--text-2)" }}>to</span>
          <input type="date" value={sp.get("dateTo") ?? ""} onChange={(e) => { const n = new URLSearchParams(sp); e.target.value ? n.set("dateTo", e.target.value) : n.delete("dateTo"); setSp(n); }} className="rounded-lg border px-2 py-1" style={{ background: "var(--page)", borderColor: "var(--border)", color: "var(--text)" }} />
        </div>
      </Card>

      {data.count === 0 ? (
        <Card className="p-8"><EmptyState title="No cases match these filters" hint="Adjust or clear the filters to see data." icon="∅" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((kp) => <Stat key={kp.label} label={kp.label} value={kp.value} sub={kp.sub} tone={kp.tone} />)}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Readiness by start-date cohort" subtitle="Percent day-one ready per ISO week">
              <Trend points={data.readinessByCohort} />
            </ChartCard>
            <ChartCard title="Time spent by lifecycle stage" subtitle="Approval wait separated from simulated execution (total hours)">
              <BarList data={data.stageTime.map((s: any) => ({ label: s.stage, value: s.hours }))} colorByIndex unit="h" />
            </ChartCard>
            <ChartCard title="Blockers by root cause" subtitle="Click a bar to cross-filter every view">
              <BarList data={data.blockersByCategory} selected={sel("blockerCategories")} onSelect={(l) => toggle("blockerCategories", l)} colorByIndex />
            </ChartCard>
            <ChartCard title="Blockers by simulated system" subtitle="Click to cross-filter">
              <BarList data={data.blockersBySystem} selected={sel("systems")} onSelect={(l) => toggle("systems", l)} colorByIndex />
            </ChartCard>
            <ChartCard title="Completion mode mix" subtitle="Automatic vs approval-bound vs manual (tasks)">
              <Donut data={data.completionModeMix} />
            </ChartCard>
            <ChartCard title="Readiness distribution (active cases)" subtitle="Score bands">
              <BarList data={data.readinessDistribution.map((d: any) => ({ label: d.band, value: d.count }))} colorByIndex />
            </ChartCard>
          </div>

          {data.weekTwoThemes.length > 0 && (
            <ChartCard title="Week-two friction themes" subtitle="Categories across generated reviews">
              <BarList data={data.weekTwoThemes} colorByIndex />
            </ChartCard>
          )}

          {/* At-risk drill-down */}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Active cases at SLA risk</h2>
            <Card className="overflow-hidden">
              {data.atRiskTable.length === 0 ? <EmptyState title="No at-risk cases in view" icon="✓" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs" style={{ color: "var(--text-2)", borderColor: "var(--border)" }}>
                      {["Person", "Role / dept", "Region", "Start", "Readiness", "Risk", "Blocker", "Owner"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {data.atRiskTable.map((r: any) => (
                        <tr key={r.id} className="cursor-pointer border-b transition-soft hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" style={{ borderColor: "var(--border)" }} onClick={() => nav(`/case/${r.id}`)}>
                          <td className="px-3 py-2.5"><div className="font-medium">{r.name}</div><div className="text-xs" style={{ color: "var(--text-2)" }}>{r.caseNumber}</div></td>
                          <td className="px-3 py-2.5 text-xs">{r.role}<div style={{ color: "var(--text-2)" }}>{r.department}</div></td>
                          <td className="px-3 py-2.5 text-xs">{regionLabel(r.region)}</td>
                          <td className="px-3 py-2.5 text-xs tnum">{fmtDate(r.startDate)}</td>
                          <td className="px-3 py-2.5 text-xs tnum">{r.readinessScore}</td>
                          <td className="px-3 py-2.5"><Badge label={RISK[r.risk].label} tone={RISK[r.risk].tone} /></td>
                          <td className="px-3 py-2.5 text-xs">{r.blocker}</td>
                          <td className="px-3 py-2.5 text-xs">{r.owner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function FilterRow({ label, values, active, onToggle, render = (x: string) => x }: { label: string; values: string[]; active: string | null; onToggle: (v: string) => void; render?: (x: string) => string }) {
  const set = new Set(active?.split(",").filter(Boolean));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-24 shrink-0 font-medium" style={{ color: "var(--text-2)" }}>{label}</span>
      {values.map((v) => {
        const on = set.has(v);
        return (
          <button key={v} onClick={() => onToggle(v)} className="rounded-full border px-2.5 py-1 transition-soft" aria-pressed={on}
            style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent", color: on ? "var(--accent)" : "var(--text-2)" }}>
            {render(v)}
          </button>
        );
      })}
    </div>
  );
}
