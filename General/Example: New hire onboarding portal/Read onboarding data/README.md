**Read onboarding data** serves read-only projections for the console.

**Trigger:** HTTP route `/onboarding-read` (`route_type = "api"`, `route_auth = "space"`). Mounts the `onboarding` state volume **read-only**; it never writes.

Select a projection with the `resource` query parameter: `overview` (KPIs, needs-attention, active cases, pending approvals, recent activity), `case` (full case bundle — tasks, approvals, blockers, check-ins, friction, audit, executions; needs `id`), `report` (management aggregates + filtered case rows), `filters` (distinct filter options), `policy` (the versioned policy), and `export` (CSV of the filtered rows). Report/export accept comma-separated multi-value filters. See [`api.json`](api.json) for the contract.

If `state.json` does not yet exist (before the first command), it serves an in-memory copy of the deterministic seed. The engine (types, reporting, seed, policy, …) is mirrored from [`Control onboarding demo`](<../Control onboarding demo/script.ts>).
