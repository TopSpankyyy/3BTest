The **Onboarding demo console** is the React operations console for Globex Corporation' New Hire Readiness demo. It is the first screen users see.

**Trigger:** HTTP route `/onboarding` (`route_type = "webpage"`, `route_auth = "space"`). It contains no credentials and makes no external calls.

It renders entirely client-side and fetches two sibling space-authenticated routes: [`/onboarding-read`](<../Read onboarding data/script.ts>) for projections and [`/onboarding-command`](<../Control onboarding demo/script.ts>) for commands. On a draft branch it appends `?branch=<id>` (injected by [`render.ts`](render.ts)) so preview fetches resolve to the same draft.

Structure: [`App.tsx`](App.tsx) wires the router and shell; `src/pages/` holds Overview, CaseDetail, Approvals, and Report; `src/components/` holds primitives, charts, header, demo controls, execution inspector, and AI previews; `src/lib/` holds the API client, formatting/label helpers, and the app store/hooks. Styling uses the Tines visual system (tokens in [`globals.css`](globals.css)) with light/dark themes.
