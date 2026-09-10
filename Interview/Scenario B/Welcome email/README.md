Sends the first-day welcome email to new hires.

**Trigger** — schedule, `0 12 * * *` (12:00 UTC = 8am Eastern). Only runs on the published workflow.

**Behavior** — reads `newhires.sqlite` (mounted read-only) and selects every hire whose `start_date` is today in `America/New_York`. For each one it composes a welcome email addressed to the hire: systems recorded as `Done` are listed as ready to log into, and any system still `Pending` or `In Progress` is listed as still being provisioned. Hires with no systems requested are skipped by the query only if they have no row for today; a hire whose systems are all incomplete still gets an email saying accounts aren't ready yet.

**Redirect** — the email is written as if it is going to the hire, but every message is sent to `credtesttines@gmail.com` for review. The hire's real address is carried in the `X-Intended-Recipient` header. The intended review inbox is `sclapes@tines.io`, but Resend has no verified domain in this space, so `onboarding@resend.dev` can only deliver to the account owner's address. Once a domain is verified, set `FROM` to an address on it and point `REDIRECT_TO` at `sclapes@tines.io` — or at `hire.email` to send for real.

**External service** — Resend (`POST https://api.resend.com/emails`) via the `resend` connector. Sends from `onboarding@resend.dev`, Resend's test sender; swap `FROM` for a verified domain address when one exists.

Exits nonzero if any send fails, so the run is marked failed.
