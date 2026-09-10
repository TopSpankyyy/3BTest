import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SYSTEM_KEYS = [
  "active_directory",
  "microsoft_365",
  "epic",
  "badge_system",
  "clinical_apps",
];

// Plausible provisioning failures, so a blocked service can explain itself on the tracker.
const BLOCKED_ERRORS: Record<string, string[]> = {
  active_directory: [
    "409 - Conflict: sAMAccountName already exists",
    "401 - Unauthorized: bind credentials rejected",
    "500 - Internal Server Error: domain controller unreachable",
    "403 - Forbidden: insufficient rights on target OU",
  ],
  microsoft_365: [
    "409 - Conflict: email already exists",
    "402 - Payment Required: no E3 licences available",
    "401 - Unauthorized: Graph token expired",
    "500 - Internal Server Error: mailbox provisioning failed",
  ],
  epic: [
    "409 - Conflict: duplicate provider record",
    "422 - Unprocessable Entity: template requires a department override",
    "401 - Unauthorized: interconnect session rejected",
    "503 - Service Unavailable: Epic environment in maintenance",
  ],
  badge_system: [
    "404 - Not Found: no badge photo on file",
    "409 - Conflict: card number already assigned",
    "500 - Internal Server Error: reader sync failed",
    "403 - Forbidden: access group requires security approval",
  ],
  clinical_apps: [
    "409 - Conflict: user already exists in app directory",
    "401 - Unauthorized: SSO assertion rejected",
    "500 - Internal Server Error: licence server timeout",
    "424 - Failed Dependency: Active Directory group not yet replicated",
  ],
};

const path = "/storage/newhires/newhires.sqlite";
if (!existsSync(path)) process.exit(0);

const db = new Database(path);
db.run("PRAGMA journal_mode = DELETE");

const table = db
  .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='NewHires'`)
  .get();
if (!table) process.exit(0);

// Older databases predate blocked_notes, which holds a JSON map of system key -> failure reason.
const hasBlockedNotes = (
  db.query(`PRAGMA table_info(NewHires)`).all() as { name: string }[]
).some((c) => c.name === "blocked_notes");
if (!hasBlockedNotes) db.run(`ALTER TABLE NewHires ADD COLUMN blocked_notes TEXT`);

// Eligible once the start date is a week or less away (including hires added late).
const hires = db
  .query(
    `SELECT * FROM NewHires
     WHERE date(start_date) <= date('now', '+7 days')
     ORDER BY date(start_date) ASC, id ASC`,
  )
  .all() as Record<string, string | number | null>[];

type Action = {
  id: number;
  system: string;
  status: "In Progress" | "Done" | "Blocked";
  isFirst: boolean;
};
let action: Action | null = null;

for (const hire of hires) {
  const requested = SYSTEM_KEYS.filter((k) => hire[k] !== null);
  const inProgress = requested.find((k) => hire[k] === "In Progress");
  if (inProgress) {
    // Demo behaviour: for hires whose name starts with A, the second service fails.
    const blocks =
      requested[1] === inProgress &&
      String(hire.full_name ?? "").trim().toUpperCase().startsWith("A");
    action = {
      id: Number(hire.id),
      system: inProgress,
      status: blocks ? "Blocked" : "Done",
      isFirst: requested[0] === inProgress,
    };
    break;
  }
  const next = requested.find((k) => hire[k] === "Pending");
  if (next) {
    action = {
      id: Number(hire.id),
      system: next,
      status: "In Progress",
      isFirst: requested[0] === next,
    };
    break;
  }
}

if (!action) process.exit(0);

// The hire's first service sits on In Progress for 7 seconds; each later one for 2.5.
if (action.status !== "In Progress") await Bun.sleep(action.isFirst ? 7000 : 2500);

db.run(`UPDATE NewHires SET ${action.system} = ? WHERE id = ?`, [
  action.status,
  action.id,
]);

const current = db.query(`SELECT * FROM NewHires WHERE id = ?`).get(action.id) as Record<
  string,
  string | null
>;

let notes: Record<string, string> = {};
try {
  const parsed = JSON.parse(current.blocked_notes ?? "{}");
  if (parsed && typeof parsed === "object") notes = parsed as Record<string, string>;
} catch {
  notes = {};
}

let error: string | null = null;
if (action.status === "Blocked") {
  const pool = BLOCKED_ERRORS[action.system] ?? ["500 - Internal Server Error"];
  error = pool[Math.floor(Math.random() * pool.length)]!;
  notes[action.system] = error;
} else {
  delete notes[action.system];
}
db.run(`UPDATE NewHires SET blocked_notes = ? WHERE id = ?`, [
  Object.keys(notes).length ? JSON.stringify(notes) : null,
  action.id,
]);

const requested = SYSTEM_KEYS.filter((k) => current[k] !== null);
const overall = requested.every((k) => current[k] === "Done") ? "Complete" : "In Progress";
db.run(`UPDATE NewHires SET status = ? WHERE id = ?`, [overall, action.id]);

console.error(
  `${action.system} -> ${action.status} for hire ${action.id}${error ? ` (${error})` : ""}`,
);
process.stdout.write(
  JSON.stringify({ ...action, error, overall_status: overall }),
);
