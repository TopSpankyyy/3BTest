**Control onboarding demo** is the authoritative state writer for the demo.

**Trigger:** HTTP route `/onboarding-command` (`route_type = "api"`, `route_auth = "space"`). Mounts the `onboarding` state volume **exclusive** (only this step and reset write).

It accepts a single JSON command per POST (`commandId`, `commandType`, optional `caseId`, `expectedVersion`, `payload`), validates it, enforces legal state transitions and idempotency (repeated `commandId` returns the original result), records audit events, recomputes readiness/reporting inputs, and atomically persists. `RESET_DEMO` rebuilds the deterministic seed and atomically replaces the state file; it requires `payload.confirm === "RESET"`. See [`api.json`](api.json) for the contract and [`script.ts`](script.ts) for the router.

The domain engine lives in [`engine/`](engine/), one module per responsibility: `build.ts`, `policy.ts`, `adapters/`, `lifecycle.ts`, `ops.ts`, `checkins.ts`, `friction.ts`, `commands.ts`, `reporting.ts`, `seed.ts`, `store.ts`.
