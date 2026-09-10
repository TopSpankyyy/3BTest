`POST /new-hire-submit` — inserts a row into the `NewHires` table in the `newhires` volume (`/storage/newhires/newhires.sqlite`), creating the table on first use.

Body: `full_name`, `email`, `department`, `job_title`, `start_date`, `manager_name`, and `systems` (array of keys: `active_directory`, `microsoft_365`, `epic`, `badge_system`, `clinical_apps`).

Overall `status` starts as `In Progress`. `start_date` is stored as free text with no date validation. Each requested system column is set to `Pending`; systems not requested stay `NULL`. The volume is mounted exclusively so concurrent submissions serialize. Called by [the intake form](<../New hire form/App.tsx>).
