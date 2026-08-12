import React from "react";
import { CHART_COLORS } from "../lib/ui";
import { Card } from "./primitives";

export function ChartCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: "var(--text-2)" }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3 flex-1">{children}</div>
    </Card>
  );
}

interface Datum { label: string; value: number; }

// Horizontal bar list — clickable marks for cross-filtering. Dims unselected.
export function BarList({ data, selected, onSelect, colorByIndex = false, unit = "" }: { data: Datum[]; selected?: string | null; onSelect?: (label: string) => void; colorByIndex?: boolean; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <Empty />;
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const active = !selected || selected === d.label;
        const color = colorByIndex ? CHART_COLORS[i % CHART_COLORS.length] : "var(--accent)";
        return (
          <button key={d.label} onClick={() => onSelect?.(d.label)} disabled={!onSelect}
            className="group flex w-full items-center gap-3 text-left transition-soft"
            style={{ opacity: active ? 1 : 0.35, cursor: onSelect ? "pointer" : "default" }}
            aria-pressed={selected === d.label}>
            <span className="w-28 shrink-0 truncate text-xs" title={humanize(d.label)}>{humanize(d.label)}</span>
            <span className="relative h-5 flex-1 overflow-hidden rounded" style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}>
              <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${(d.value / max) * 100}%`, background: color, transition: "width .5s ease" }} />
            </span>
            <span className="w-12 shrink-0 text-right text-xs font-medium tnum">{d.value}{unit}</span>
          </button>
        );
      })}
    </div>
  );
}

// Donut with legend + clickable segments.
export function Donut({ data, selected, onSelect }: { data: Datum[]; selected?: string | null; onSelect?: (label: string) => void }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <Empty />;
  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg width={132} height={132} viewBox="0 0 132 132" className="shrink-0" role="img" aria-label="Donut chart">
        <g transform="translate(66,66) rotate(-90)">
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * C;
            const el = (
              <circle key={d.label} r={R} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={16}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc}
                style={{ opacity: !selected || selected === d.label ? 1 : 0.3, cursor: onSelect ? "pointer" : "default", transition: "opacity .2s" }}
                onClick={() => onSelect?.(d.label)} />
            );
            acc += dash;
            return el;
          })}
        </g>
        <text x={66} y={62} textAnchor="middle" className="tnum" style={{ fontSize: 20, fontWeight: 600, fill: "var(--text)" }}>{total}</text>
        <text x={66} y={78} textAnchor="middle" style={{ fontSize: 9, fill: "var(--text-2)" }}>total</text>
      </svg>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.label}>
            <button onClick={() => onSelect?.(d.label)} disabled={!onSelect} className="flex w-full items-center gap-2 text-left transition-soft" style={{ opacity: !selected || selected === d.label ? 1 : 0.4, cursor: onSelect ? "pointer" : "default" }} aria-pressed={selected === d.label}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="flex-1 truncate">{humanize(d.label)}</span>
              <span className="font-medium tnum">{Math.round((d.value / total) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Trend line for readiness rate by cohort.
export function Trend({ points }: { points: { cohort: string; rate: number; total: number }[] }) {
  if (points.length === 0) return <Empty />;
  const W = 520, H = 150, pad = 24;
  const xs = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const ys = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.rate)}`).join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 420 }} role="img" aria-label="Readiness rate by cohort">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad} x2={W - pad} y1={ys(g)} y2={ys(g)} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={4} y={ys(g) + 3} style={{ fontSize: 9, fill: "var(--text-2)" }}>{g}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.cohort}>
            <circle cx={xs(i)} cy={ys(p.rate)} r={3.5} fill="var(--accent)" />
            <text x={xs(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 8, fill: "var(--text-2)" }}>{p.cohort.replace("2024-", "")}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function humanize(s: string) { return s.replace(/_/g, " ").replace(/\bSimulated\b/, "Sim."); }
function Empty() { return <div className="py-6 text-center text-xs" style={{ color: "var(--text-2)" }}>No data for this view</div>; }
