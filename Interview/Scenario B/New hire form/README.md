HR-facing intake form for a new starter, served at `/new-hire-form` (space members only).

Collects full name, email, department, job title, start date, manager, and the systems the person needs, then POSTs JSON to `/new-hire-submit` (see [the Submit new hire step](<../Submit new hire/script.ts>)). Links across to the tracker at `/new-hire-tracker`.

UI lives in [App.tsx](App.tsx).

Field labels differ from column names on purpose: "Team" writes to `department`, "Role" writes to `job_title`. Start date is a free-text input — whatever HR types is stored verbatim. The Clinical Apps checkbox label spells out its contents ("Med Dispensing, Revenue Cycle").
