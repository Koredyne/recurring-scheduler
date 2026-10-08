# Koredyne Schedule

Plan who runs what, in which room, on which day, when the timetable repeats every week or rotates over several weeks. One engine, three kinds of business out of the box: a **gym**, a **clinic** and **meeting rooms**. The words on screen follow the business (Class / Session / Meeting, Coach / Practitioner / Host, Member / Patient / Client), and every change is checked so a room or a person is never double-booked.

- **Try it:** https://recurring-scheduler-production.up.railway.app. It's a playground: you get your own copy of the demo, so change anything. Switch demos in Settings.
- **Specs:** [`k-docs/`](k-docs/README.md): product spec, technical spec, decisions, limits and roadmap.
- **Developer reference:** [`docs/TECHNICAL.md`](docs/TECHNICAL.md): usage, architecture, schema, API, deployment.

## What it does

- **Repeating series.** A series (a gym package, a clinic programme, a client's room booking) places classes into class times (a room, a weekday and a time). It can repeat every week or rotate: planning in week 1, a retrospective in week 2; a board meeting once every 4 weeks. Any date is worked out with arithmetic, so nothing is generated in advance.
- **Handovers.** A series can end on a date and hand over to the next one: a first-aid course becomes a fire-safety course, Post-natal becomes Stage 2.
- **One-day changes.** On the Schedule, drag a class to move it, cancel it, or swap who runs it. That date changes and the series doesn't. One-off bookings sit alongside.
- **No clashes.** The server re-checks every future date on each save and refuses any change that would double-book a room or a person. The browser previews the same rules before you press Save.
- **Clients and plans.** Clients subscribe to a series on a plan (8 sessions a month for 60 KD, unlimited for 3 months…), with expiry tracking.
- **Print.** A one-page A4, text-only timetable of the week, or save it as a PDF.

## Run it

```sh
npm install
npm run dev                  # http://localhost:5173 (UI + API, hot reload)
npm run build && npm start   # production server on $PORT or 3000
npm test                     # unit, regression and API tests (in-memory databases, no setup)
npm run reset-db             # delete data/schedule.db; the gym demo is seeded on next start
```

Requires Node 24+ (built-in `node:sqlite`). No other services.

| Variable | Default | |
|---|---|---|
| `DB_FILE` | `data/schedule.db` | SQLite database file. |
| `PLAYGROUND` | unset | `1` gives every visitor a private in-memory copy of the demo (for a public link). |
| `BASIC_AUTH` | unset | `user:password` to require a login. |
| `PORT` | `3000` | |

## Deploy

Railway deploys `main` automatically. The public link runs with `PLAYGROUND=1`. For a private install with real data, leave `PLAYGROUND` unset, put `DB_FILE` on a volume and set `BASIC_AUTH`. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

## Stack

React 19, Vite, Tailwind v4 and shadcn/ui in the browser; a small Node HTTP server with `node:sqlite`. The scheduling rules live in one module (`src/lib/schedule.js`) shared by the browser and the server, so previews and the server's checks can't disagree.
