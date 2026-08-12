import React from "react";
import { Overlay, Button, Card } from "./primitives";
import { fmtDate } from "../lib/ui";

type Kind = "summarize_blockers" | "draft_update" | "friction_narrative";
const TITLES: Record<Kind, string> = {
  summarize_blockers: "Summarize blockers",
  draft_update: "Draft manager update",
  friction_narrative: "Generate friction narrative",
};

// The sample output is composed deterministically from the case’s own structured
// data. No model is called — this previews the capability’s shape and safeguards.
function sample(kind: Kind, bundle: any): string {
  const c = bundle.case;
  const open = (bundle.blockers ?? []).filter((b: any) => b.status === "open");
  const pending = (bundle.approvals ?? []).filter((a: any) => a.status === "pending" || a.status === "escalated");
  const unmet = (c.readinessConditions ?? []).filter((r: any) => !r.met);
  if (kind === "summarize_blockers") {
    if (open.length === 0) return `${c.person.preferredName} (${c.caseNumber}) has no open blockers. Readiness score ${c.readinessScore}/100. ${unmet.length ? `Outstanding: ${unmet.map((u: any) => u.label).join(", ")}.` : "All readiness conditions met."}`;
    return `${c.person.preferredName} (${c.caseNumber}) has ${open.length} open blocker${open.length > 1 ? "s" : ""}:\n` + open.map((b: any, i: number) => `${i + 1}. [${b.severity.toUpperCase()}] ${b.summary} — owner: ${b.owner}${b.system ? ` (${b.system})` : ""}.`).join("\n") + `\nThese prevent day-one readiness. Suggested next action: address the highest-severity item first.`;
  }
  if (kind === "draft_update") {
    return `Subject: Onboarding update — ${c.person.legalName} (${c.role})\n\nHi ${c.manager ?? c.sponsor ?? "team"},\n\nHere is where ${c.person.preferredName}'s onboarding stands ahead of a ${fmtDate(c.startDate)} start:\n\n• Readiness: ${c.readinessScore}/100 (${c.dayOneReady ? "day-one ready" : "not yet day-one ready"}).\n${unmet.length ? `• Outstanding: ${unmet.map((u: any) => u.label).join("; ")}.\n` : ""}${pending.length ? `• Awaiting your decision: ${pending.map((a: any) => a.type).join("; ")}.\n` : ""}${open.length ? `• Open blockers: ${open.map((b: any) => b.summary).join("; ")}.\n` : ""}\nNo action is taken automatically on privileged access — please review and approve where needed.\n\nThanks,\nIT Onboarding`;
  }
  const fr = bundle.friction;
  if (fr) return `${c.person.preferredName}'s onboarding (week two): ${fr.deterministicSummary}\n\nRecommendations:\n` + fr.recommendations.map((r: string) => `• ${r}`).join("\n");
  return `Week-two review not yet generated for ${c.person.preferredName}. Advance the clock past the start date + 14 days to produce a deterministic friction review, then a narrative can be drafted from it.`;
}

function inputsFor(kind: Kind, bundle: any) {
  const c = bundle.case;
  const base = { caseNumber: c.caseNumber, subject: c.person.legalName, role: c.role, startDate: c.startDate, readinessScore: c.readinessScore, dayOneReady: c.dayOneReady };
  if (kind === "summarize_blockers") return { ...base, openBlockers: (bundle.blockers ?? []).filter((b: any) => b.status === "open").map((b: any) => ({ category: b.category, severity: b.severity, owner: b.owner, summary: b.summary })) };
  if (kind === "draft_update") return { ...base, recipient: c.manager ?? c.sponsor, unmetConditions: (c.readinessConditions ?? []).filter((r: any) => !r.met), pendingApprovals: (bundle.approvals ?? []).filter((a: any) => a.status === "pending").map((a: any) => a.type) };
  return { ...base, frictionReview: bundle.friction ?? "(not yet generated)" };
}

export function AiPreview({ kind, bundle, onClose }: { kind: Kind | null; bundle: any; onClose: () => void }) {
  if (!kind) return null;
  return (
    <Overlay open onClose={onClose} side="center">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }}>AI capability preview</span>
            <h2 className="text-base font-semibold">{TITLES[kind]}</h2>
          </div>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>{bundle.case.person.legalName} · {bundle.case.caseNumber}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Sample result (from fixed demo content)</h3>
          <Card className="p-3.5">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ fontFamily: "inherit" }}>{sample(kind, bundle)}</pre>
          </Card>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Structured inputs a model would receive</h3>
            <Card className="p-3 overflow-x-auto">
              <pre className="text-xs" style={{ color: "var(--text-2)", fontFamily: "ui-monospace, monospace" }}>{JSON.stringify(inputsFor(kind, bundle), null, 2)}</pre>
            </Card>
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Expected output format</h3>
              <Card className="p-3 text-xs" style={{ color: "var(--text-2)" }}>
                {kind === "summarize_blockers" && "Ranked, plain-language list of open blockers with severity, owner, and a recommended next action."}
                {kind === "draft_update" && "A short manager email: status, outstanding items, pending approvals, and blockers — ready for human review before sending."}
                {kind === "friction_narrative" && "A narrative paragraph plus bullet recommendations, grounded in the deterministic week-two review."}
              </Card>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Safeguards</h3>
              <Card className="p-3">
                <ul className="space-y-1 text-xs" style={{ color: "var(--text-2)" }}>
                  <li>✓ Grounded strictly in this case’s structured data</li>
                  <li>✓ No authority to grant, provision, or approve access</li>
                  <li>✓ Human review required before any message is sent</li>
                  <li>✓ Generation is logged to the audit trail</li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
        <Card className="p-3" style={{ background: "color-mix(in srgb, var(--info) 8%, var(--card))", borderColor: "color-mix(in srgb, var(--info) 30%, var(--border))" }}>
          <p className="text-xs leading-relaxed">
            <strong>No AI model is connected to this template.</strong> Connect a supported model to enable this capability in a production version. The onboarding workflow and reports continue to work without AI.
          </p>
        </Card>
      </div>
    </Overlay>
  );
}
