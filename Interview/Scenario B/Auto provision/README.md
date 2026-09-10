Runs every minute on a schedule, and also immediately after a new hire is submitted, to provision services without helpdesk clicks.

A hire becomes eligible once its start date is seven days away or nearer — including hires added inside that window. For the first eligible hire it performs a single transition per invocation, working the services left to right in the tracker's column order:

- no service In Progress → the next `Pending` service becomes `In Progress`
- a service is In Progress → wait 7 seconds if it is the hire's first requested service, otherwise 2.5 seconds, then mark it `Done`

It then recomputes the overall status (`Complete` when every requested service is `Done`) and links back to itself so the next transition happens in a fresh invocation — that is what makes each intermediate state visible on the tracker page and in the sheet. When there is nothing to do it writes no output, which stops the loop.

Reads and writes `newhires.sqlite` in the `newhires` volume (`concurrency=exclusive`).

**Simulated failure** — for hires whose full name starts with `A`, the second requested service resolves to `Blocked` instead of `Done`, with a random service-appropriate error (for example `409 - Conflict: email already exists`) recorded in the row's `blocked_notes` JSON map. A blocked service is not retried: the next invocation moves straight on to the remaining services, so they still finish. Because the overall status needs every requested service `Done`, the hire stays `In Progress` until someone resolves the blocked service by hand on the tracker.

When a service is blocked it also links to [Blocked alert](<../Blocked alert/README.md>), which emails the helpdesk with the hire, service, and error.
