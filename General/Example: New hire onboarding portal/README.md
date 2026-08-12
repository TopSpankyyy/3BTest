| Field | Value |
|-------|-------|
| **Owner** | Tines (default template) |
| **Description** | A self-contained demonstration of policy-driven new hire onboarding, including approvals, simulated provisioning, readiness verification, operational reporting, and audit evidence. |
| **Trigger** | Interactive space-authenticated application and manual demo controls |
| **Integrations / dependencies** | None. All enterprise systems and data are simulated. |
| **Cron Schedules** | None |
| **AI Models** | None — see the “Enabling optional AI later” section at the end of this README |

## What this is

Welcome to Tines 3B, a single, secure environment for every team’s most important agents, apps, and automation. To help you get started, we have preloaded an example workflow.

The **New hire onboarding portal** shows what an IT-operations onboarding control plane looks like when built in 3B, using the fictional global SaaS company **Globex Corporation**. Every person, event, and system response is synthetic demo data — nothing is connected to a real HR, identity, or security system, and no credentials are required to explore it.

It combines deterministic policy resolution, automated low-risk provisioning, human approval for privileged or costly access, parallel execution with dependencies, post-provisioning verification, SLA tracking, day-one support, week-two friction review, and a complete audit trail — without any AI model making access decisions.

## Getting started

Open the console at the `/onboarding` route. You’ll land on an operations dashboard showing active onboarding cases, pending approvals, and blockers across the fictional company.

To see the workflow in motion:

1. Use **Run demo** in the console header.
2. Pick one of the six seeded scenarios (for example, the privileged security engineer or the incomplete HRIS record).
3. Advance the simulated clock, approve or deny requests, and inject issues to see how the case reacts.
4. Use **Reset** when you’re done — it always restores the same original seeded data, and nothing you do here affects anything outside this workflow.

## Workflow topology

The workflow is split into four steps by responsibility:

- [`Onboarding demo console`](<Onboarding demo console/App.tsx>) — the React operations console. Route `/onboarding` (`webpage`). Has no credentials and makes no external calls; it talks only to the two API routes below.
- [`Read onboarding data`](<Read onboarding data/script.ts>) — read-only projections: overview, case detail, report, filters, policy, and CSV export. Route `/onboarding-read` (`api`). Mounts the state volume **read-only**.
- [`Control onboarding demo`](<Control onboarding demo/script.ts>) — the authoritative writer. Applies validated commands, enforces legal transitions and idempotency, records audit events, and performs reset. Route `/onboarding-command` (`api`). Mounts the state volume **exclusive** (it’s the only step allowed to write).
- [`Onboarding tests`](<Onboarding tests/script.ts>) — the deterministic logic and integration test suite.

Inside `Control onboarding demo`, the domain logic is one internal module per lifecycle responsibility (mirrored into the read and test steps so they can reuse it read-only).

## Simulated clock

State carries a deterministic `clock` starting at **2024-06-03T08:00:00Z**. All business timestamps derive from it, so a reset always reproduces byte-identical data. `ADVANCE_DEMO_TIME` moves the clock forward (next event / one day / start day / week two), which re-evaluates SLAs, runs newly-eligible work, expires contractors, and generates week-two reviews — deterministically, with no real waiting. The header shows the simulated time distinctly from your real local time.

## Seeded scenarios

Six showcase cases plus 26 historical cases (32 total) are seeded deterministically. Showcase cases: standard engineer (parallel baseline provisioning plus two pending approvals), remote sales hire (Salesforce approval and a shipment delay that puts the case at risk), privileged security engineer (two-stage approval, never auto-approved), contractor (restricted access, a named sponsor, and an expiry date), incomplete HRIS record (a safe hold pending correction), and internal transfer (access is added and removed, with the old access revoked before the case can close). Historical cases span eight ISO weeks across departments, regions, worker types, and outcomes (on-time, late, canceled, transferred), so every report figure reconciles to the underlying cases, tasks, approvals, and blockers behind it.

## Reset

Use **Run demo → Reset** in the UI, or send `POST /onboarding-command` with `{ "commandType": "RESET_DEMO", "payload": { "confirm": "RESET" } }`. Reset builds a fresh seed and atomically replaces the live state file (written to a temp file, then renamed into place), so a failed reset never leaves the data half-written.

## Persistence design

A single durable named volume (`onboarding`) holds `state.json`. The exclusive-writer step and reset are the only writers; the read API mounts the volume read-only. Writes are transactional at the whole-document level: each write goes to a temp file and is only swapped into place once complete, so a reader never sees a half-written file. Each successful command also bumps a `version` counter that is checked before the next write is applied — “optimistic concurrency”: each write confirms it isn’t silently overwriting a newer change before it commits. A JSON document is used instead of SQLite because one authoritative writer and ~32 cases need only transactional replace and deterministic reset; filtering and indexing happen in memory in `reporting.ts`.

## Reliability and security

All routes use `route_auth = "space"` — no public routes, no connectors, no credentials anywhere in this workflow.

- Every command carries a `commandId`; sending the same id twice returns the original result instead of repeating its side effects (“idempotency” — doing the same thing twice has no extra effect).
- Task provisioning uses the same pattern with per-task idempotency keys.
- Transient errors retry with deterministic backoff up to `maxAttempts`; exceeding it creates a blocker and an escalation. Permanent errors never retry.
- Replaying an already-verified task re-verifies the existing result instead of creating a duplicate.
- Every attempt, successful or not, appears in the execution inspector.

## Running tests

Open the `Onboarding tests` step and run it. It executes 50+ deterministic assertions covering seed and reset determinism, duplicate event ingestion, idempotency, legal and illegal state transitions, policy resolution, privileged-approval rules, segregation of duties (SoD — one person can’t both request and approve the same access), contractor expiry, dependency ordering, transient retry, permanent escalation, replay, safe-hold correction, start-date changes, cancellation, transfer revocation, readiness scoring against the day-one gate, check-in blockers, friction-review determinism, dashboard reconciliation, CSV export, and projection-rebuild stability. It exits non-zero on any failure.

## Connecting your own systems

Each simulated system is a pure function in [`engine/adapters/index.ts`](<Control onboarding demo/engine/adapters/index.ts>) that returns a structured request/response. To connect a real system, attach a connector to the step and swap that function for a real call, keeping the same return shape — the verification and readiness logic in `lifecycle.ts` then needs no changes.

The console footer has a **How to connect your systems to this workflow** button ([`ConnectGuide.tsx`](<Onboarding demo console/src/components/ConnectGuide.tsx>)) with the same guidance in-app, ranked by how quickly you can get a real system working:

| Tier | Systems | Why |
|------|---------|-----|
| **1 — start here** | Slack (welcome message, approval requests, blocker escalations), Jira (real ticket per case, mirrored task status), GitHub (add/remove hire on a team or repo) | Minutes to connect, low risk, immediately visible. Jira and GitHub also prove two-way state and reversible provisioning, not just notification. |
| **2 — high credibility, admin scopes** | Okta or Entra ID (account + groups — the identity spine), Google Workspace or M365 (mailbox, drive, day-one calendar), Workday/BambooHR/HiBob (real employee lookup replacing the seeded HRIS record) | Most convincing for an IT-ops audience, but each needs admin consent; HRIS sandbox access is usually the slowest to obtain. |
| **3 — nice to have** | Salesforce (the costly, approval-gated licence already modelled), Anthropic/OpenAI (see below) | Sharpens one part of the story rather than the backbone. |

The recommended pattern is one connector per system, called with plain credential-free requests, keeping the simulated adapter as the fallback when a connector is absent — so a missing or revoked credential degrades the demo instead of breaking it.

### Enabling optional AI later

The three AI actions (summarize blockers, draft manager update, generate friction narrative) currently render deterministic previews built from case data, alongside the inputs a model would receive and the safeguards that would apply. To enable them, connect a supported model and swap the preview generator for a model call. The model receives grounded case data, has **no authority** to grant or provision access, requires human review before any message is sent, and is audit-logged. The workflow and reports work fully without AI.

## Interested in more examples?

For more examples like this one, visit our [Examples Gallery](http://tines.com/3b/examples/) at tines.com.
