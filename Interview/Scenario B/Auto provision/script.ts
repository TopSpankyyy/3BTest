import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SYSTEM_KEYS = [
  "active_directory",
  "microsoft_365",
  "epic",
  "badge_system",
  "clinical_apps",
];

const path = "/storage/newhires/newhires.sqlite";
if (!existsSync(path)) process.exit(0);

const db = new Database(path);
db.run("PRAGMA journal_mode = DELETE");

const table = db
  .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='NewHires'`)
  .get();
if (!table) process.exit(0);

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
  status: "In Progress" | "Done";
  isFirst: boolean;
};
let action: Action | null = null;

for (const hire of hires) {
  const requested = SYSTEM_KEYS.filter((k) => hire[k] !== null);
  const inProgress = requested.find((k) => hire[k] === "In Progress");
  if (inProgress) {
    action = {
      id: Number(hire.id),
      system: inProgress,
      status: "Done",
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
if (action.status === "Done") await Bun.sleep(action.isFirst ? 7000 : 2500);

db.run(`UPDATE NewHires SET ${action.system} = ? WHERE id = ?`, [
  action.status,
  action.id,
]);

const updated = db.query(`SELECT * FROM NewHires WHERE id = ?`).get(action.id) as Record<
  string,
  string | null
>;
const requested = SYSTEM_KEYS.filter((k) => updated[k] !== null);
const overall = requested.every((k) => updated[k] === "Done") ? "Complete" : "In Progress";
db.run(`UPDATE NewHires SET status = ? WHERE id = ?`, [overall, action.id]);

console.error(`${action.system} -> ${action.status} for hire ${action.id}`);
process.stdout.write(JSON.stringify({ ...action, overall_status: overall }));
