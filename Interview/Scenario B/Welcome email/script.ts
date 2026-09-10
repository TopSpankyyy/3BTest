import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SYSTEMS = [
  { key: "active_directory", label: "Active Directory" },
  { key: "microsoft_365", label: "Microsoft 365" },
  { key: "epic", label: "Epic" },
  { key: "badge_system", label: "Badge System" },
  { key: "clinical_apps", label: "Clinical Apps" },
];

// Every welcome email is redirected for review instead of going to the hire.
// Resend has no verified domain here, so onboarding@resend.dev can only reach this address.
const REDIRECT_TO = "credtesttines@gmail.com";
const FROM = "IT Helpdesk <onboarding@resend.dev>";

// The schedule fires at 12:00 UTC, which is 8am in the helpdesk's Eastern timezone.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const path = "/storage/newhires/newhires.sqlite";
if (!existsSync(path)) {
  console.error("No database yet; nothing to send.");
  process.exit(0);
}

const db = new Database(path, { readonly: true });
const table = db
  .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='NewHires'`)
  .get();
if (!table) {
  console.error("No NewHires table yet; nothing to send.");
  process.exit(0);
}

type Hire = Record<string, string | null> & {
  id: number;
  full_name: string;
  email: string;
  job_title: string;
  department: string;
  manager_name: string;
};

const hires = db
  .query(`SELECT * FROM NewHires WHERE date(start_date) = date(?) ORDER BY id ASC`)
  .all(today) as Hire[];

if (hires.length === 0) {
  console.error(`No hires starting ${today}.`);
  process.exit(0);
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let failures = 0;

for (const hire of hires) {
  const requested = SYSTEMS.filter((s) => hire[s.key]);
  const ready = requested.filter((s) => hire[s.key] === "Done");
  const pending = requested.filter((s) => hire[s.key] !== "Done");
  const firstName = hire.full_name.trim().split(/\s+/)[0] ?? hire.full_name;

  const list = (items: typeof SYSTEMS) =>
    `<ul>${items.map((s) => `<li>${escape(s.label)}</li>`).join("")}</ul>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>Hi ${escape(firstName)},</p>
<p>Welcome to the team — today is your first day as ${escape(hire.job_title)} in ${escape(hire.department)}. We're glad you're here.</p>
${
  ready.length
    ? `<p>Your accounts are ready, so you can log in to the following right away using the credentials your manager, ${escape(hire.manager_name)}, has shared with you:</p>${list(ready)}`
    : `<p>Your accounts are still being set up, so please don't try to log in just yet.</p>`
}
${
  pending.length
    ? `<p>The following are still being provisioned, and we'll email you as soon as they're ready:</p>${list(pending)}`
    : `<p>That's everything you were set up with — you're all good to go.</p>`
}
<p>If anything doesn't work, just reply to this email and the IT helpdesk will take a look.</p>
<p>Have a great first day,<br>IT Helpdesk</p>
</div>`;

  const text = [
    `Hi ${firstName},`,
    "",
    `Welcome to the team — today is your first day as ${hire.job_title} in ${hire.department}. We're glad you're here.`,
    "",
    ready.length
      ? `Your accounts are ready, so you can log in to the following right away using the credentials your manager, ${hire.manager_name}, has shared with you:\n${ready.map((s) => `- ${s.label}`).join("\n")}`
      : "Your accounts are still being set up, so please don't try to log in just yet.",
    "",
    pending.length
      ? `Still being provisioned (we'll email you as soon as they're ready):\n${pending.map((s) => `- ${s.label}`).join("\n")}`
      : "That's everything you were set up with — you're all good to go.",
    "",
    "If anything doesn't work, just reply to this email and the IT helpdesk will take a look.",
    "",
    "Have a great first day,",
    "IT Helpdesk",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [REDIRECT_TO],
      subject: `Welcome to the team, ${firstName}!`,
      html,
      text,
      headers: { "X-Intended-Recipient": hire.email },
    }),
  });

  if (!response.ok) {
    failures++;
    console.error(
      `Failed to send welcome email for hire ${hire.id}: ${response.status} ${await response.text()}`,
    );
    continue;
  }

  console.error(
    `Sent welcome email for ${hire.full_name} (intended ${hire.email}) to ${REDIRECT_TO}.`,
  );
}

if (failures > 0) process.exit(1);
