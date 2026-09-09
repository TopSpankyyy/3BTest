import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SYSTEMS = [
  { key: "active_directory", label: "Active Directory" },
  { key: "microsoft_365", label: "Microsoft 365" },
  { key: "epic", label: "Epic" },
  { key: "badge_system", label: "Badge System" },
  { key: "clinical_apps", label: "Clinical Apps" },
];

const path = "/storage/newhires/newhires.sqlite";
let hires: unknown[] = [];

if (existsSync(path)) {
  const db = new Database(path, { readonly: true });
  const table = db
    .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='NewHires'`)
    .get();
  if (table) {
    hires = db
      .query(`SELECT * FROM NewHires ORDER BY date(start_date) ASC, id ASC`)
      .all();
  }
}

const payload = JSON.stringify({ systems: SYSTEMS, hires });
process.stdout.write(
  [
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Cache-Control: no-store",
    `Content-Length: ${Buffer.byteLength(payload)}`,
    "",
    payload,
  ].join("\r\n"),
);
