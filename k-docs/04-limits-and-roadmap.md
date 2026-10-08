# 04 — Limits and roadmap

## Current limits

| Area | Limit | Impact |
|---|---|---|
| Access | No user accounts or roles; at most one shared password (`BASIC_AUTH`). No record of who changed what. | Fine for a small team behind one login; not for many staff with different rights. |
| Attendance & capacity | Clients subscribe to series but aren't booked into individual sessions. Capacity is shown, not enforced. | Can't see who actually came, or stop a session overfilling. |
| Sessions per month | Plans record "12 a month" but usage isn't counted. | The limit is informational. |
| Skipped weeks | A closed week (a holiday) still advances a rotation. | A rotating series can't "pause"; cancel the days instead, accepting that the rotation moves on. |
| Bulk day changes | Day changes are one session at a time. | Closing for a day means cancelling each session. |
| Recurring exceptions | A day change applies to one date. | "Every Thursday this month at a different time" needs a temporary series or individual changes. |
| Week shape | The week starts on Sunday, series start and end on Sundays, and the print puts Saturday first. | Not configurable yet. |
| Vocabulary | Three kinds of business (gym, clinic, meeting rooms) with fixed words. | Other businesses must pick the closest kind. |
| Import | No import; data is entered on screen or comes from a demo. Export (JSON) exists. | Moving an existing client list in means typing it. |
| Tests | `npm test` (84 tests) covers the scheduling rules, API, migrations, export, demos, vocabulary, settings and playground. The screens have no automated browser tests. | UI regressions rely on manual checking. |
| Scale | One process, one SQLite file; playground copies are held in that process's memory. | Right for one business; several sites or heavy concurrent use would want Postgres. |
| Bundle | ~680 kB JS (~195 kB gzipped). | Acceptable for an internal tool; could be split per tab. |

## Roadmap (suggested order)

1. **Accounts and roles.** Proper logins with roles (front desk, manager, staff) instead of one shared password.
2. **Close for a day / date range.** One action that cancels every session in a range (holidays), shown as a banner on the Schedule and on the print.
3. **Pause a rotation.** A per-series skip list so closed weeks don't advance the cycle.
4. **Attendance.** Check clients in per session; count against "sessions a month"; show capacity as booked/available.
5. **Change history.** Who changed what and when, especially for cancellations and moves.
6. **Import.** Load clients and subscriptions from a CSV or the JSON export, with a dry run first.
7. **Public read-only timetable.** A shareable link to the week (no client data), for a website or noticeboard.
8. **More kinds of business and custom vocabulary.** Add kinds (e.g. a school, a music studio) and let an install type its own words; make the first day of the week and the print's day order settings too.
9. **Browser tests.** Automated tests for the main flows (drag, day dialog, package builder, print), run before each deploy.
