Helpdesk tracker served at `/new-hire-tracker` (space members only).

Loads data from `/new-hire-list` on mount, shows counts of Requested (always 0 now that new rows start In Progress) / In Progress / Complete, and renders one row per new hire with each requested system's status. Clicking a system status cycles Pending → In Progress → Done via `/new-hire-system-status`, which also recalculates the overall status.

Systems not requested for a hire show as `—`. UI lives in [App.tsx](App.tsx).
