Helpdesk tracker served at `/new-hire-tracker` (space members only).

Loads data from `/new-hire-list` on mount and re-polls every 2 seconds (paused while a manual click is in flight), so the automatic progression driven by [Auto provision](<../Auto provision/script.ts>) appears without a refresh. Shows counts of Requested (always 0 now that new rows start In Progress) / In Progress / Complete, and renders one row per new hire with each requested system's status. Clicking a system status cycles Pending → In Progress → Done via `/new-hire-system-status`, which also recalculates the overall status.

Systems not requested for a hire show as `—`. Hovering a `Pending` system status shows when it is expected to move to In Progress — one week before the hire's start date — plus a relative "in N days" / "N days overdue" note. Start dates that are not `YYYY-MM-DD` (rows predating the form's date picker) fall back to a generic message. UI lives in [App.tsx](App.tsx).

A `Blocked` system (set by Auto provision's simulated failure) is red; hovering it shows the recorded error message from `blocked_notes`. Clicking it goes straight to `Done` rather than continuing the cycle, which is how a blocked hire finally reaches `Complete`.

Both hover notes render in a single `position: fixed` layer outside the table rather than inside the cell, because the table's horizontal scroll container would otherwise clip a tooltip on the top row. Its coordinates come from the hovered button's bounding rect: it sits above the button, flips below when there is less than 150px of headroom, and is clamped horizontally so the rightmost columns stay on screen. Scrolling or resizing dismisses it.
