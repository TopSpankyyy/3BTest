import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { Overlay, Button, Card, useToast } from "./primitives";
import { SCENARIOS, fmtDateTime } from "../lib/ui";

export function DemoControls({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { overview, clock, run } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const scenarioCase = (key: string) => overview?.activeCases?.find((c: any) => c.scenario === key) ?? overview?.needsAttention?.find((c: any) => c.scenario === key);

  async function start(key: string) {
    setBusy(true);
    const res = await run("START_SCENARIO", { payload: { scenarioKey: key } }, `Opened ${SCENARIOS[key].title}`);
    setBusy(false);
    if (res.ok && res.data?.caseId) { onClose(); nav(`/case/${res.data.caseId}`); }
  }

  async function advance(to: string, label: string) {
    setBusy(true);
    const focus = overview?.needsAttention?.[0]?.id;
    await run("ADVANCE_DEMO_TIME", { caseId: focus, payload: { to } }, `Clock advanced (${label})`);
    setBusy(false);
  }

  async function doReset() {
    setBusy(true);
    const res = await run("RESET_DEMO", { payload: { confirm: "RESET" } }, "Demo reset to seed");
    setBusy(false);
    setConfirmReset(false);
    if (res.ok) { onClose(); nav("/"); }
  }

  return (
    <Overlay open={open} onClose={onClose} side="right">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h2 className="text-base font-semibold">Run demo</h2>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            A simulated IT onboarding control plane for a fictional company — every person, system, and response here is synthetic data, and no real systems are contacted.
            <br />
            Open a scenario, then move the simulated clock forward to watch it progress.
          </p>
          <p className="mt-1.5 text-xs" style={{ color: "var(--text-2)" }}>
            Simulated clock (nothing waits in real time): <span className="font-medium tnum" style={{ color: "var(--accent)" }}>{fmtDateTime(clock)}</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Start here</h3>
          <Card className="p-3">
            <ol className="space-y-2 text-xs leading-relaxed">
              <li className="flex gap-2">
                <span className="font-semibold" style={{ color: "var(--accent)" }}>1.</span>
                <span>Open a scenario below — <span className="font-medium">Standard software engineer</span> is the best starting point.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold" style={{ color: "var(--accent)" }}>2.</span>
                <span>On the case page, approve the requests that are waiting — or handle them all together on the <span className="font-medium">Approvals</span> tab.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold" style={{ color: "var(--accent)" }}>3.</span>
                <span>Come back here and advance the clock <span className="font-medium">to start day</span> to see access verified, readiness scored, and SLAs re-evaluated.</span>
              </li>
            </ol>
            <div className="mt-3">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => start("standard_engineer")}>Open standard engineer</Button>
            </div>
          </Card>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Showcase scenarios</h3>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>Each one opens a new onboarding case that demonstrates a different policy path. You can run several.</p>
          <div className="space-y-2">
            {Object.entries(SCENARIOS).map(([key, s]) => {
              const c = scenarioCase(key);
              return (
                <Card key={key} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>{s.blurb}</p>
                    </div>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => start(key)}>Open</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Advance the simulated clock</h3>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>Time only moves when you move it. Advancing re-evaluates SLAs, runs eligible work, expires contractor access, and generates week-two reviews — deterministically, with no real waiting.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance("next_event", "next event")}>Next event (+8h)</Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance("one_day", "one day")}>Advance one day</Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance("start_day", "start day")}>To start day</Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance("week_two", "week two")}>To week two</Button>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Reset</h3>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>Puts the demo back to its exact starting state — safe to use any time.</p>
          {!confirmReset ? (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmReset(true)}>Reset all demo data…</Button>
          ) : (
            <Card className="p-3" style={{ borderColor: "color-mix(in srgb, var(--error) 40%, var(--border))" }}>
              <p className="text-xs">This restores the exact deterministic seed: 6 showcase cases and 24 historical cases, clock back to {fmtDateTime("2024-06-03T08:00:00.000Z")}. All demo changes are discarded.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" disabled={busy} onClick={doReset}>Confirm reset</Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            </Card>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>Terms you’ll see</h3>
          <dl className="space-y-1.5 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
            <div>
              <dt className="inline font-medium" style={{ color: "var(--success)" }}>Day-one ready</dt>
              <dd className="inline"> — every required access and device for this hire has been provisioned and verified before their start date.</dd>
            </div>
            <div>
              <dt className="inline font-medium" style={{ color: "var(--warning)" }}>Safe hold</dt>
              <dd className="inline"> — the source HR record is incomplete, so nothing is provisioned until someone corrects it. Deliberately paused, not broken.</dd>
            </div>
            <div>
              <dt className="inline font-medium" style={{ color: "var(--error)" }}>At risk</dt>
              <dd className="inline"> — something is late or blocked and the hire is unlikely to be ready on their start date without action.</dd>
            </div>
          </dl>
        </section>
      </div>
    </Overlay>
  );
}
