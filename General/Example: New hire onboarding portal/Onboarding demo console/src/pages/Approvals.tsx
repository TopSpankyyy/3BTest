import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store";
import { Card, Badge, Button, Overlay, EmptyState, Spinner, Field, inputStyle } from "../components/primitives";
import { RISK, APPROVAL_STATUS, fmtDateTime, fmtDate } from "../lib/ui";

export function Approvals() {
  const { overview, loading, run } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const focusId = params.get("focus");
  const list = overview?.pendingApprovals ?? [];
  const focus = list.find((a: any) => a.id === focusId) ?? null;

  if (loading && !overview) return <div className="p-8"><Spinner label="Loading approvals" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Approval workspace</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>Privileged, costly, and exceptional access require a human decision. Approval authorizes provisioning — it does not prove successful provisioning or verification.</p>
      </div>

      {list.length === 0 ? (
        <Card className="p-6"><EmptyState title="No pending approvals" hint="Approvals appear here when a case requires a privileged, costly, or exceptional access decision." icon="✓" /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a: any) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{a.type}</span>
                    {a.costIndicator && <Badge label="Cost" tone="warning" />}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{a.subject} · {a.caseNumber}</div>
                </div>
                <Badge label={RISK[a.risk].label} tone={RISK[a.risk].tone} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Row label="Approver" value={a.approver} />
                <Row label="Backup" value={a.backupApprover} />
                <Row label="Requested duration" value={a.requestedDuration ?? "—"} />
                <Row label="SLA due" value={fmtDateTime(a.dueAt)} />
                {a.costIndicator && <Row label="Cost" value={a.costIndicator} />}
                {a.totalStages > 1 && <Row label="Stage" value={`${a.stage} of ${a.totalStages}`} />}
              </dl>
              <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>{a.policyRationale}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => setParams({ focus: a.id })}>Review decision</Button>
                <Button variant="ghost" size="sm" onClick={() => nav(`/case/${a.caseId}`)}>Open case</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {focus && <DecisionDrawer approval={focus} onClose={() => setParams({})} run={run} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (<><dt style={{ color: "var(--text-2)" }}>{label}</dt><dd className="text-right font-medium">{value}</dd></>);
}

function DecisionDrawer({ approval, onClose, run }: { approval: any; onClose: () => void; run: any }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const privileged = approval.risk === "high" || approval.risk === "critical";
  const needComment = privileged && !comment.trim();

  async function decide(type: "APPROVE_REQUEST" | "DENY_REQUEST") {
    setBusy(true);
    const res = await run(type, { caseId: approval.caseId, actor: "IT Ops (demo user)", payload: { approvalId: approval.id, comment } }, type === "APPROVE_REQUEST" ? "Approval recorded" : "Denial recorded");
    setBusy(false);
    if (res.ok) onClose();
  }

  return (
    <Overlay open onClose={onClose} side="center">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-base font-semibold">{approval.type}</h2>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>{approval.subject} · {approval.caseNumber}</p>
        </div>
        <Badge label={RISK[approval.risk].label} tone={RISK[approval.risk].tone} />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Requester" value={approval.requester} />
          <Row label="Approver" value={approval.approver} />
          <Row label="Backup approver" value={approval.backupApprover} />
          <Row label="Requested duration" value={approval.requestedDuration ?? "—"} />
          {approval.costIndicator && <Row label="Cost indicator" value={approval.costIndicator} />}
          <Row label="SLA due" value={fmtDateTime(approval.dueAt)} />
          {approval.totalStages > 1 && <Row label="Approval stage" value={`${approval.stage} of ${approval.totalStages}`} />}
        </dl>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Policy rationale</div>
          <Card className="p-3 text-sm">{approval.policyRationale}</Card>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Segregation of duties</div>
          <Card className="p-3 text-sm">{approval.segregationOfDutiesResult}</Card>
        </div>
        {privileged && (
          <Card className="p-3 text-xs" style={{ background: "color-mix(in srgb, var(--warning) 8%, var(--card))", borderColor: "color-mix(in srgb, var(--warning) 30%, var(--border))" }}>
            This is privileged access. A decision comment is required, the requester cannot approve their own request, and all approval stages must clear before provisioning begins.
          </Card>
        )}
        <Field label={`Decision comment${privileged ? " (required)" : " (optional)"}`}>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} placeholder="Add context for the audit trail…" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" size="md" onClick={() => decide("DENY_REQUEST")} disabled={busy || needComment}>Deny</Button>
        <Button variant="primary" size="md" onClick={() => decide("APPROVE_REQUEST")} disabled={busy || needComment}>Approve</Button>
      </div>
    </Overlay>
  );
}
