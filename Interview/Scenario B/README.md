New Hire Tracker for the IT helpdesk: HR submits an intake form for each new starter, and the helpdesk tracks provisioning of each system until onboarding is complete.

**Entry points**

- [`/new-hire-form`](<New hire form/App.tsx>) — HR intake form (webpage).
- [`/new-hire-tracker`](<Tracker page/App.tsx>) — helpdesk tracker (webpage).
- `/new-hire-submit`, `/new-hire-list`, `/new-hire-system-status` — JSON APIs the pages call.

All routes require space membership.

**Flow**

HR submits the form → [Submit new hire](<Submit new hire/script.ts>) inserts a row into the `NewHires` SQLite table with overall status `In Progress` and each requested system set to `Pending`. The tracker reads rows via [List new hires](<List new hires/script.ts>) and shows counts plus a per-system grid. Clicking a system status calls [Update system status](<Update system status/script.ts>), which advances that system and recomputes overall status — `Complete` once every requested system is `Done`.

Both writers also link to [Sync to sheet](<Sync to sheet/script.ts>), which rewrites a Google Sheet with the same table — including pale status highlighting — so the sheet stays in step with the tracker page.

**Storage**

The `newhires` named volume holds `newhires.sqlite`. Writers mount it with `concurrency=exclusive`; the list endpoint mounts it read-only. Draft branches have their own copy of the data, discarded on publish.

**Common changes**

To add or rename a system, update the `SYSTEMS` list in [Submit new hire](<Submit new hire/script.ts>), [List new hires](<List new hires/script.ts>), [Update system status](<Update system status/script.ts>), and [the form](<New hire form/App.tsx>), plus the `SYSTEMS` list in [Sync to sheet](<Sync to sheet/script.ts>) — new systems need a matching column added to the table.
