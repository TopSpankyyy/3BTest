Emails the helpdesk when a service fails to provision, so someone knows a new hire is stuck.

**Trigger** — linked from [Auto provision](<../Auto provision/script.ts>), which passes its transition JSON on stdin. Any transition other than `status: "Blocked"` exits quietly with no output.

**Behavior** — looks the hire up by id in `newhires.sqlite` (mounted read-only) and sends one email to `credtesttines@gmail.com` naming the new hire, the blocked service, and the error message, plus start date, department/title, manager, and the services still outstanding. The subject is `Onboarding blocked: <name> — <service>`.

**External service** — Resend (`POST https://api.resend.com/emails`) via the `resend` connector, sending from `onboarding@resend.dev`. That test sender can only deliver to the Resend account owner's address, which is why the alert goes to `credtesttines@gmail.com`; change `NOTIFY` once a domain is verified.

Exits nonzero if the hire cannot be found or Resend rejects the send.
