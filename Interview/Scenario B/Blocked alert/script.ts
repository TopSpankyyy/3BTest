import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SYSTEM_LABELS: Record<string, string> = {
  active_directory: "Active Directory",
  microsoft_365: "Microsoft 365",
  epic: "Epic",
  badge_system: "Badge System",
  clinical_apps: "Clinical Apps",
};

const NOTIFY = "credtesttines@gmail.com";
const FROM = "IT Helpdesk <onboarding@resend.dev>";

const raw = (await Bun.stdin.text()).trim();
if (!raw) process.exit(0);

const event = JSON.parse(raw) as {
  id?: number;
  system?: string;
  status?: string;
  error?: string | null;
};

if (event.status !== "Blocked" || !event.id || !event.system) process.exit(0);

const path = "/storage/newhires/newhires.sqlite";
if (!existsSync(path)) {
  console.error("No database; cannot describe the blocked hire.");
  process.exit(1);
}

const db = new Database(path, { readonly: true });
const hire = db.query(`SELECT * FROM NewHires WHERE id = ?`).get(event.id) as
  | Record<string, string | null>
  | null;
if (!hire) {
  console.error(`No new hire with id ${event.id}`);
  process.exit(1);
}

let notes: Record<string, string> = {};
try {
  const parsed = JSON.parse(hire.blocked_notes ?? "{}");
  if (parsed && typeof parsed === "object") notes = parsed as Record<string, string>;
} catch {
  notes = {};
}

const label = SYSTEM_LABELS[event.system] ?? event.system;
const error = event.error ?? notes[event.system] ?? "No error detail recorded";
const name = hire.full_name ?? `Hire ${event.id}`;
const outstanding = Object.keys(SYSTEM_LABELS)
  .filter((k) => hire[k] !== null && hire[k] !== "Done")
  .map((k) => `${SYSTEM_LABELS[k]} (${hire[k]})`);

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111">
<p><strong>${escape(name)}</strong> is blocked from completing onboarding: provisioning for <strong>${escape(label)}</strong> failed, so the hire cannot be marked Complete until it is resolved.</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr><td style="border:1px solid #ddd"><strong>New hire</strong></td><td style="border:1px solid #ddd">${escape(name)}</td></tr>
<tr><td style="border:1px solid #ddd"><strong>Blocked service</strong></td><td style="border:1px solid #ddd">${escape(label)}</td></tr>
<tr><td style="border:1px solid #ddd"><strong>Error</strong></td><td style="border:1px solid #ddd"><code>${escape(error)}</code></td></tr>
<tr><td style="border:1px solid #ddd"><strong>Start date</strong></td><td style="border:1px solid #ddd">${escape(hire.start_date ?? "—")}</td></tr>
<tr><td style="border:1px solid #ddd"><strong>Department / title</strong></td><td style="border:1px solid #ddd">${escape(hire.department ?? "—")} — ${escape(hire.job_title ?? "—")}</td></tr>
<tr><td style="border:1px solid #ddd"><strong>Manager</strong></td><td style="border:1px solid #ddd">${escape(hire.manager_name ?? "—")}</td></tr>
</table>
<p>Still outstanding: ${outstanding.length ? escape(outstanding.join(", ")) : "nothing else"}.</p>
<p>Fix the failure in ${escape(label)}, then mark it Done on the New Hire Tracker to let onboarding complete.</p>
</div>`;

const text = [
  `${name} is blocked from completing onboarding: provisioning for ${label} failed.`,
  "",
  `New hire: ${name}`,
  `Blocked service: ${label}`,
  `Error: ${error}`,
  `Start date: ${hire.start_date ?? "—"}`,
  `Department / title: ${hire.department ?? "—"} — ${hire.job_title ?? "—"}`,
  `Manager: ${hire.manager_name ?? "—"}`,
  "",
  `Still outstanding: ${outstanding.length ? outstanding.join(", ") : "nothing else"}.`,
  "",
  `Fix the failure in ${label}, then mark it Done on the New Hire Tracker to let onboarding complete.`,
].join("\n");

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    from: FROM,
    to: [NOTIFY],
    subject: `Onboarding blocked: ${name} — ${label}`,
    html,
    text,
  }),
});

if (!response.ok) {
  console.error(`Resend rejected the alert: ${response.status} ${await response.text()}`);
  process.exit(1);
}

console.error(`Alerted ${NOTIFY}: ${name} blocked on ${label} (${error})`);
