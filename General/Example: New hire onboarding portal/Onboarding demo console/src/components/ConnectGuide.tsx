import React from "react";
import { Overlay, Badge, Button } from "./primitives";

type Entry = { system: string; does: string; task: string; effort: string };

const TIERS: { tone: "success" | "warning" | "info"; label: string; title: string; blurb?: string; entries: Entry[] }[] = [
  {
    tone: "success",
    label: "Tier 1",
    title: "Start here",
    blurb: "Minutes to connect, immediately visible.",
    entries: [
      {
        system: "Slack",
        does: "Post the day-one welcome, approval requests, and blocker escalations into a real channel.",
        task: "Slack workspace + channels task; approval and escalation notifications",
        effort: "One connector, no destructive writes. The single best demo of “3B touched my world.”",
      },
      {
        system: "Jira",
        does: "Create a real onboarding ticket per case and mirror task status back onto the case.",
        task: "Jira project access task; case timeline",
        effort: "Most teams have a sandbox project. Proves two-way state, not just notification.",
      },
      {
        system: "GitHub",
        does: "Add the hire to a team or repository, and remove them on transfer or contractor expiry.",
        task: "GitHub org/team task; revoke path on internal transfer",
        effort: "Cheap and reversible — genuine privileged provisioning rather than a message.",
      },
    ],
  },
  {
    tone: "warning",
    label: "Tier 2",
    title: "Needs admin scopes",
    blurb: "Quick if you’re an admin, otherwise an approval first.",
    entries: [
      {
        system: "Okta or Microsoft Entra ID",
        does: "Create the account and assign the groups that policy resolution decided on.",
        task: "Okta account + group assignment tasks (the identity spine every other task depends on)",
        effort: "Needs admin scopes, so plan for an IT approval before the demo.",
      },
      {
        system: "Google Workspace or Microsoft 365",
        does: "Provision the mailbox, drive access, and day-one calendar invitations.",
        task: "Email/mailbox and calendar tasks",
        effort: "Same admin-scope friction as identity; pairs naturally with it.",
      },
      {
        system: "Workday, BambooHR, or HiBob",
        does: "Replace the seeded HRIS record so a case starts from your own employee data.",
        task: "Intake and validation — the front door of the whole flow",
        effort: "Powerful, but HRIS sandbox access is usually the slowest thing to obtain.",
      },
    ],
  },
  {
    tone: "info",
    label: "Tier 3",
    title: "Nice to have",
    blurb: "Optional, sharpens one part of the application.",
    entries: [
      {
        system: "Salesforce",
        does: "Grant the licence that is already modelled as costly and approval-gated.",
        task: "Salesforce licence task on the remote sales hire scenario",
        effort: "Worth it if you are a Salesforce shop and want the approval story to be real.",
      },
      {
        system: "Anthropic or OpenAI",
        does: "Turn the three deterministic AI previews into real generations.",
        task: "Summarize blockers, draft manager update, generate friction narrative",
        effort: "Not a system of record — the fastest way to feel the AI story. The model stays advisory: it never grants or provisions access.",
      },
    ],
  },
];

export function ConnectGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeTier, setActiveTier] = React.useState(TIERS[0].label);
  const tier = TIERS.find((t) => t.label === activeTier) ?? TIERS[0];

  return (
    <Overlay open={open} onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
            Connect your systems to this workflow
          </h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
            Right now each system is faked in one place. To make one real, you point it at the actual service and change
            nothing else — the checks, timings, and audit trail keep working the same way.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      <div
        className="flex flex-wrap gap-1.5 border-b px-5 py-2.5"
        role="tablist"
        aria-label="Integration tiers"
        style={{ borderColor: "var(--border)" }}
      >
        {TIERS.map((t) => {
          const selected = t.label === tier.label;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTier(t.label)}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-soft"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--border)",
                background: selected ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                color: selected ? "var(--accent)" : "var(--text-2)",
              }}
            >
              {t.label} · {t.title}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-5">
          {(() => (
            <section key={tier.label} role="tabpanel">
              {tier.blurb && (
                <p className="text-xs" style={{ color: "var(--text-2)" }}>
                  {tier.blurb}
                </p>
              )}
              <ul className="mt-2.5 flex flex-col gap-2">
                {tier.entries.map((e) => (
                  <li
                    key={e.system}
                    className="rounded-[10px] border px-3 py-2.5"
                    style={{ borderColor: "var(--border)", background: "var(--page)" }}
                  >
                    <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {e.system}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--text)" }}>
                      {e.does}
                    </p>
                    <dl className="mt-1.5 flex flex-col gap-0.5 text-xs" style={{ color: "var(--text-2)" }}>
                      <div className="flex gap-1.5">
                        <dt className="shrink-0 font-medium">Maps to</dt>
                        <dd>{e.task}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="shrink-0 font-medium">Effort</dt>
                        <dd>{e.effort}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ))()}

          <section>
            <div className="flex flex-wrap items-center gap-2">
              <Badge label="How" tone="accent" />
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                What connecting one actually involves
              </span>
            </div>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-xs" style={{ color: "var(--text-2)" }}>
              <li>
                Write the call as a plain request with no secrets in it — no API keys, no Authorization header, nothing
                to paste into code.
              </li>
              <li>
                Attach a connector for that service to the step. Credentials are configured once in the UI and injected
                by the proxy at runtime, so the workflow source never contains them.
              </li>
              <li>
                Keep the same return shape the simulated adapter uses, and the rest of the engine needs no changes.
              </li>
              <li>
                Make each system opt-in, falling back to simulation when its connector is absent — a missing or revoked
                credential then degrades the demo instead of breaking it.
              </li>
            </ol>
          </section>

          <p
            className="rounded-[10px] border px-3 py-2.5 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--page)", color: "var(--text-2)" }}
          >
            As built today, nothing here writes to any external system. There are no connectors, no credentials, and no
            outbound calls — every response you see comes from a simulated adapter.
          </p>
        </div>
      </div>

      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Overlay>
  );
}
