Mirrors the tracker table into a Google Sheet.

**Trigger** — linked downstream of [Submit new hire](<../Submit new hire/script.ts>) and [Update system status](<../Update system status/script.ts>), so every change that would appear on the tracker page is relayed to the sheet. Stdin is ignored; the step reads the `newhires` volume (read-only) directly, so the sheet always reflects the full current table rather than a delta.

**Behavior** — reads all rows from `NewHires` ordered by start date, then rewrites the first sheet of spreadsheet `1D3K-Z3O3UUQ2yjpSguPW6ad7gruXZVMMmjz5sUBUx4s` in one `spreadsheets:batchUpdate` call: clears the grid, writes the header plus one row per hire, freezes the header, and autosizes columns. Systems that were not requested show `—`.

Columns: New hire, Email, Department, Job title, Start date, Manager, Status, Active Directory, Microsoft 365, Epic, Badge System, Clinical Apps.

**Highlighting** — the Status and per-system columns get a pale fill by value: Pending/Requested blue, In Progress yellow, Done/Complete green. Non-requested and non-status cells are white.

**External service** — `https://sheets.googleapis.com/v4/spreadsheets/...` via the Google Sheets connector. The connector's account needs edit access to the spreadsheet.
