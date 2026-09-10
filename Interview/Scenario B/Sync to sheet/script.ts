import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const SPREADSHEET_ID = "1D3K-Z3O3UUQ2yjpSguPW6ad7gruXZVMMmjz5sUBUx4s";
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

const SYSTEMS = [
  { key: "active_directory", label: "Active Directory" },
  { key: "microsoft_365", label: "Microsoft 365" },
  { key: "epic", label: "Epic" },
  { key: "badge_system", label: "Badge System" },
  { key: "clinical_apps", label: "Clinical Apps" },
];

const HEADERS = [
  "New hire",
  "Email",
  "Department",
  "Job title",
  "Start date",
  "Manager",
  "Status",
  ...SYSTEMS.map((s) => s.label),
];

// Pale fills mirroring the tracker page's status colours.
const FILLS: Record<string, { red: number; green: number; blue: number }> = {
  Pending: { red: 0.82, green: 0.89, blue: 0.98 },
  Requested: { red: 0.82, green: 0.89, blue: 0.98 },
  "In Progress": { red: 1, green: 0.95, blue: 0.75 },
  Done: { red: 0.83, green: 0.93, blue: 0.84 },
  Complete: { red: 0.83, green: 0.93, blue: 0.84 },
};

type Hire = Record<string, string | number | null>;

const path = "/storage/newhires/newhires.sqlite";
let hires: Hire[] = [];
if (existsSync(path)) {
  const db = new Database(path, { readonly: true });
  const table = db
    .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='NewHires'`)
    .get();
  if (table) {
    hires = db
      .query(`SELECT * FROM NewHires ORDER BY date(start_date) ASC, id ASC`)
      .all() as Hire[];
  }
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const meta = await api(`${API}?fields=sheets(properties(sheetId,title,gridProperties))`);
const sheet = meta.sheets?.[0]?.properties;
if (!sheet) throw new Error("Spreadsheet has no sheets");
const sheetId: number = sheet.sheetId;

const rowCount = hires.length + 1;
const columnCount = HEADERS.length;
const grid = sheet.gridProperties ?? {};
const requests: unknown[] = [];

if ((grid.rowCount ?? 0) < rowCount || (grid.columnCount ?? 0) < columnCount) {
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {
          rowCount: Math.max(grid.rowCount ?? 0, rowCount, 100),
          columnCount: Math.max(grid.columnCount ?? 0, columnCount),
        },
      },
      fields: "gridProperties.rowCount,gridProperties.columnCount",
    },
  });
}

const statusColumns = new Set([6, ...SYSTEMS.map((_, i) => 7 + i)]);

function cell(value: string | null, columnIndex: number, isHeader: boolean) {
  const fill =
    !isHeader && statusColumns.has(columnIndex) && value ? FILLS[value] : undefined;
  return {
    userEnteredValue: { stringValue: value ?? "" },
    userEnteredFormat: {
      backgroundColor: fill ?? { red: 1, green: 1, blue: 1 },
      textFormat: { bold: isHeader },
      horizontalAlignment: statusColumns.has(columnIndex) && !isHeader ? "CENTER" : "LEFT",
      verticalAlignment: "MIDDLE",
    },
  };
}

const rows = [
  { values: HEADERS.map((h, i) => cell(h, i, true)) },
  ...hires.map((hire) => {
    const values = [
      String(hire.full_name ?? ""),
      String(hire.email ?? ""),
      String(hire.department ?? ""),
      String(hire.job_title ?? ""),
      String(hire.start_date ?? ""),
      String(hire.manager_name ?? ""),
      String(hire.status ?? ""),
      ...SYSTEMS.map((s) => (hire[s.key] === null ? "—" : String(hire[s.key]))),
    ];
    return { values: values.map((v, i) => cell(v, i, false)) };
  }),
];

// Wipe the previous contents so removed rows do not linger, then write the current table.
requests.push({
  updateCells: {
    range: { sheetId },
    fields: "userEnteredValue,userEnteredFormat",
  },
});
requests.push({
  updateCells: {
    rows,
    fields: "userEnteredValue,userEnteredFormat",
    start: { sheetId, rowIndex: 0, columnIndex: 0 },
  },
});
requests.push({
  updateSheetProperties: {
    properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
    fields: "gridProperties.frozenRowCount",
  },
});
requests.push({
  autoResizeDimensions: {
    dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
  },
});

await api(`${API}:batchUpdate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ requests }),
});

console.error(`Synced ${hires.length} new hire(s) to the spreadsheet`);
