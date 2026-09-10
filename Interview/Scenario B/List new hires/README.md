`GET /new-hire-list` — returns `{ systems, hires }` as JSON, read-only from the `newhires` volume.

`hires` is every row of the `NewHires` table ordered by start date. Returns an empty list before the first submission. Consumed by [the tracker page](<../Tracker page/App.tsx>).
