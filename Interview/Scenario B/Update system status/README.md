`POST /new-hire-system-status` — updates one system column for one new hire, then recalculates that hire's overall status.

Body: `{ "id": 1, "system": "epic", "status": "In Progress" }`. System statuses are `Pending`, `In Progress`, `Done`.

Overall status rules: all requested systems `Done` → `Complete`, otherwise `In Progress`. Writes to the `newhires` volume with exclusive scheduling. Called by [the tracker page](<../Tracker page/App.tsx>).

`Blocked` is also a valid status. Setting a system to anything other than `Blocked` drops its entry from the row's `blocked_notes` map, so a resolved failure stops showing an error message.
