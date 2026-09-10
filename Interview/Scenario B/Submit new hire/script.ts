import { Database } from "bun:sqlite";

const SYSTEMS = [
  { key: "active_directory", label: "Active Directory" },
  { key: "microsoft_365", label: "Microsoft 365" },
  { key: "epic", label: "Epic" },
  { key: "badge_system", label: "Badge System" },
  { key: "clinical_apps", label: "Clinical Apps" },
];

function respond(status: number, body: unknown) {
  const payload = JSON.stringify(body);
  process.stdout.write(
    [
      `HTTP/1.1 ${status} ${status === 200 ? "OK" : "Error"}`,
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(payload)}`,
      "",
      payload,
    ].join("\r\n"),
  );
}

const raw = await Bun.stdin.text();
const separator = raw.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
const head = raw.slice(0, raw.indexOf(separator));
const body = raw.slice(raw.indexOf(separator) + separator.length);
const method = head.split(/\r?\n/)[0]?.split(" ")[0]?.toUpperCase() ?? "";

if (method === "OPTIONS") {
  respond(200, { ok: true });
  process.exit(0);
}
if (method !== "POST") {
  respond(405, { error: "Use POST" });
  process.exit(0);
}

const data = JSON.parse(body || "{}");
const required = [
  "full_name",
  "email",
  "department",
  "job_title",
  "start_date",
  "manager_name",
];
const missing = required.filter((f) => !String(data[f] ?? "").trim());
if (missing.length) {
  respond(400, { error: `Missing fields: ${missing.join(", ")}` });
  process.exit(0);
}

const requested: string[] = Array.isArray(data.systems) ? data.systems : [];
const known = new Set(SYSTEMS.map((s) => s.key));
const invalid = requested.filter((s) => !known.has(s));
if (invalid.length) {
  respond(400, { error: `Unknown systems: ${invalid.join(", ")}` });
  process.exit(0);
}
if (requested.length === 0) {
  respond(400, { error: "Select at least one system" });
  process.exit(0);
}

const db = new Database("/storage/newhires/newhires.sqlite", { create: true });
db.run("PRAGMA journal_mode = DELETE");
db.run(`CREATE TABLE IF NOT EXISTS NewHires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  job_title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'In Progress',
  created_at TEXT NOT NULL,
  blocked_notes TEXT,
  ${SYSTEMS.map((s) => `${s.key} TEXT`).join(",\n  ")}
)`);

// Older databases predate blocked_notes, which holds a JSON map of system key -> failure reason.
const hasBlockedNotes = (
  db.query(`PRAGMA table_info(NewHires)`).all() as { name: string }[]
).some((c) => c.name === "blocked_notes");
if (!hasBlockedNotes) db.run(`ALTER TABLE NewHires ADD COLUMN blocked_notes TEXT`);

const columns = [...required, "status", "created_at", ...SYSTEMS.map((s) => s.key)];
const values = [
  ...required.map((f) => String(data[f]).trim()),
  "In Progress",
  new Date().toISOString(),
  ...SYSTEMS.map((s) => (requested.includes(s.key) ? "Pending" : null)),
];

const result = db
  .query(
    `INSERT INTO NewHires (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) RETURNING id`,
  )
  .get(...values) as { id: number };

console.error(`Saved new hire ${result.id}`);
respond(200, { ok: true, id: result.id });
