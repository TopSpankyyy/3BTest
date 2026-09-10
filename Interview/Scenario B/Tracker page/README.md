Helpdesk tracker served at `/new-hire-tracker` (space members only).

Loads data from `/new-hire-list` on mount, shows counts of Requested (always 0 now that new rows start In Progress) / In Progress / Complete, and renders one row per new hire with each requested system's status. Clicking a system status cycles Pending → In Progress → Done via `/new-hire-system-status`, which also recalculates the overall status.

Systems not requested for a hire show as `—`. Hovering a `Pending` system status shows when it is expected to move to In Progress — one week before the hire's start date — plus a relative "in N days" / "N days overdue" note. Start dates that are not `YYYY-MM-DD` (rows predating the form's date picker) fall back to a generic message. UI lives in [App.tsx](App.tsx).
