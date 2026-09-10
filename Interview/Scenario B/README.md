New Hire Tracker for the IT helpdesk: HR submits an intake form for each new starter, and the helpdesk tracks provisioning of each system until onboarding is complete.

**Entry points**

- [`/new-hire-form`](<New hire form/App.tsx>) — HR intake form (webpage).
- [`/new-hire-tracker`](<Tracker page/App.tsx>) — helpdesk tracker (webpage).
- `/new-hire-submit`, `/new-hire-list`, `/new-hire-system-status` — JSON APIs the pages call.

All routes require space membership.

**Flow**

HR submits the form → [Submit new hire](<Submit new hire/script.ts>) inserts a row into the `NewHires` SQLite table with overall status `In Progress` and each requested system set to `Pending`. The tracker reads rows via [List new hires](<List new hires/script.ts>) and shows counts plus a per-system grid. Clicking a system status calls [Update system status](<Update system status/script.ts>), which advances that system and recomputes overall status — `Complete` once every requested system is `Done`.

[Auto provision](<Auto provision/script.ts>) removes most of the clicking: it runs every minute (and immediately after a submission) and, for any hire whose start date is a week or less away, advances services left to right — one to `In Progress`, then `Done` after 7 seconds for the hire's first service and 2.5 seconds for each service after it — looping through itself so each intermediate state shows on the tracker and in the sheet.

To demonstrate failure handling, hires whose name starts with `A` get their second service `Blocked` with a random service-specific error (recorded in the row's `blocked_notes` JSON). Provisioning carries on through the remaining services, the tracker shows the error on hover, and the hire cannot reach `Complete` until a helpdesk user clicks the blocked service to `Done`. Each block also fires [Blocked alert](<Blocked alert/script.ts>), which emails the helpdesk the hire's name, the blocked service, and the error message.

All writers also link to [Sync to sheet](<Sync to sheet/script.ts>), which rewrites a Google Sheet with the same table — including pale status highlighting — so the sheet stays in step with the tracker page.

[Welcome email](<Welcome email/script.ts>) runs on its own schedule at 8am Eastern and emails every hire starting that day, telling them which services they can already log into and which are still being provisioned. It is written to the hire but redirected to a review inbox — see [its README](<Welcome email/README.md>).

**Storage**

The `newhires` named volume holds `newhires.sqlite`. Writers mount it with `concurrency=exclusive`; the list endpoint mounts it read-only. Draft branches have their own copy of the data, discarded on publish.

**Common changes**

To add or rename a system, update the `SYSTEMS` list in [Submit new hire](<Submit new hire/script.ts>), [List new hires](<List new hires/script.ts>), [Update system status](<Update system status/script.ts>), and [the form](<New hire form/App.tsx>), and [Auto provision](<Auto provision/script.ts>), plus the `SYSTEMS` list in [Sync to sheet](<Sync to sheet/script.ts>) — new systems need a matching column added to the table.
