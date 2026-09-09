import { Database } from "bun:sqlite";

const SYSTEM_KEYS = [
  "active_directory",
  "microsoft_365",
  "epic",
  "badge_system",
  "clinical_apps",
];
const SYSTEM_STATUSES = ["Pending", "In Progress", "Done"];

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

if (method !== "POST") {
  respond(405, { error: "Use POST" });
  process.exit(0);
}

const { id, system, status } = JSON.parse(body || "{}");
if (!Number.isInteger(id) || !SYSTEM_KEYS.includes(system) || !SYSTEM_STATUSES.includes(status)) {
  respond(400, { error: "Provide id, a known system, and a valid status" });
  process.exit(0);
}

const db = new Database("/storage/newhires/newhires.sqlite");
db.run("PRAGMA journal_mode = DELETE");

const hire = db.query(`SELECT * FROM NewHires WHERE id = ?`).get(id) as
  | Record<string, string | null>
  | null;
if (!hire) {
  respond(404, { error: `No new hire with id ${id}` });
  process.exit(0);
}
if (hire[system] === null) {
  respond(400, { error: `${system} was not requested for this hire` });
  process.exit(0);
}

db.run(`UPDATE NewHires SET ${system} = ? WHERE id = ?`, [status, id]);

const updated = db.query(`SELECT * FROM NewHires WHERE id = ?`).get(id) as Record<
  string,
  string | null
>;
const requested = SYSTEM_KEYS.filter((k) => updated[k] !== null);
const overall = requested.every((k) => updated[k] === "Done") ? "Complete" : "In Progress";
db.run(`UPDATE NewHires SET status = ? WHERE id = ?`, [overall, id]);

respond(200, { ok: true, id, system, status, overall_status: overall });
