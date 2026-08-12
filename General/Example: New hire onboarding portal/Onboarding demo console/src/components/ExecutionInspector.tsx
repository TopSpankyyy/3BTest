import React, { useState } from "react";
import { Card, Badge } from "./primitives";
import { fmtDateTime } from "../lib/ui";

const ACTOR_META: Record<string, { label: string; color: string }> = {
  workflow: { label: "Automated", color: "var(--accent)" },
  human: { label: "Human decision", color: "var(--info)" },
  employee: { label: "Employee", color: "var(--c3)" },
  system: { label: "System", color: "var(--text-2)" },
  policy: { label: "Policy", color: "var(--c4)" },
};
const OUTCOME_TONE: Record<string, any> = { success: "success", verified: "success", transient_error: "warning", permanent_error: "error", policy_block: "warning", skipped: "neutral" };

// Audit timeline — explainable by default, technical on demand.
export function AuditTimeline({ audit, executions }: { audit: any[]; executions: any[] }) {
  const exById = new Map(executions.map((e) => [e.id, e]));
  const sorted = [...audit].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return (
    <ol className="space-y-2">
      {sorted.map((e) => (
        <AuditRow key={e.id} e={e} evidence={e.evidence?.map((id: string) => exById.get(id)).filter(Boolean) ?? []} />
      ))}
    </ol>
  );
}

function AuditRow({ e, evidence }: { e: any; evidence: any[] }) {
  const [open, setOpen] = useState(false);
  const meta = ACTOR_META[e.actorType] ?? ACTOR_META.system;
  return (
    <li>
      <Card className="p-3">
        <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{e.summary}</span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>{meta.label}</span>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{e.actor} · {fmtDateTime(e.occurredAt)} · {e.eventType}</div>
            {e.rationale && <div className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{e.rationale}</div>}
          </div>
          <span className="text-xs" style={{ color: "var(--text-2)" }}>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div className="mt-3 space-y-2 border-t pt-3 text-xs" style={{ borderColor: "var(--border)" }}>
            <Kv k="Event ID" v={e.id} />
            <Kv k="Correlation ID" v={e.correlationId} />
            <Kv k="Policy version" v={e.policyVersion} />
            {e.before != null && Object.keys(e.before).length > 0 && <KvBlock k="Before" v={e.before} />}
            {e.after != null && Object.keys(e.after).length > 0 && <KvBlock k="After" v={e.after} />}
            {evidence.map((ex: any) => <ExecutionDetail key={ex.id} ex={ex} />)}
          </div>
        )}
      </Card>
    </li>
  );
}

// Raw executions view.
export function ExecutionList({ executions }: { executions: any[] }) {
  const sorted = [...executions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  if (sorted.length === 0) return <div className="py-6 text-center text-xs" style={{ color: "var(--text-2)" }}>No simulated executions yet.</div>;
  return <div className="space-y-2">{sorted.map((ex) => <Card key={ex.id} className="p-3"><ExecutionDetail ex={ex} defaultOpen={false} showHeader /></Card>)}</div>;
}

function ExecutionDetail({ ex, defaultOpen = true, showHeader = false }: { ex: any; defaultOpen?: boolean; showHeader?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--text) 3%, transparent)" }}>
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{ex.system}</span>
          <span style={{ color: "var(--text-2)" }}>{ex.operation}</span>
          <Badge label={ex.outcome.replace(/_/g, " ")} tone={OUTCOME_TONE[ex.outcome] ?? "neutral"} />
          <span style={{ color: "var(--text-2)" }}>attempt {ex.attempt} · {ex.latencyClass}</span>
        </span>
        <span className="text-xs" style={{ color: "var(--text-2)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Kv k="Idempotency key" v={ex.idempotencyKey} />
          <Kv k="Error class" v={ex.errorClass} />
          <KvBlock k="Simulated request" v={ex.simulatedRequest} />
          <KvBlock k="Simulated response" v={ex.simulatedResponse} />
        </div>
      )}
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span style={{ color: "var(--text-2)" }}>{k}</span><span className="font-mono" style={{ fontFamily: "ui-monospace, monospace" }}>{v}</span></div>;
}
function KvBlock({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <div className="mb-1" style={{ color: "var(--text-2)" }}>{k}</div>
      <pre className="overflow-x-auto rounded bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 text-[11px]" style={{ fontFamily: "ui-monospace, monospace" }}>{JSON.stringify(v, null, 2)}</pre>
    </div>
  );
}
