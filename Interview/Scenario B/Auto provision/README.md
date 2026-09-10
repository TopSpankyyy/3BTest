Runs every minute on a schedule, and also immediately after a new hire is submitted, to provision services without helpdesk clicks.

A hire becomes eligible once its start date is seven days away or nearer — including hires added inside that window. For the first eligible hire it performs a single transition per invocation, working the services left to right in the tracker's column order:

- no service In Progress → the next `Pending` service becomes `In Progress`
- a service is In Progress → wait 7 seconds if it is the hire's first requested service, otherwise 2.5 seconds, then mark it `Done`

It then recomputes the overall status (`Complete` when every requested service is `Done`) and links back to itself so the next transition happens in a fresh invocation — that is what makes each intermediate state visible on the tracker page and in the sheet. When there is nothing to do it writes no output, which stops the loop.

Reads and writes `newhires.sqlite` in the `newhires` volume (`concurrency=exclusive`).
