# 02 — Technical spec

## 1. Stack

| Layer | Choice |
|---|---|
| Front end | React 19, Vite 8, Tailwind CSS v4 (incl. container queries), shadcn/ui on Radix, Lucide icons, Sonner toasts |
| Back end | Node 24, plain `node:http`, built-in SQLite (`node:sqlite`). No other server dependencies. |
| Shared | `src/lib/schedule.js`, `src/lib/dates.js` and `src/lib/vocab.js` — plain ES modules used by both browser and server |
| Hosting | Railway: one service. The public link runs in playground mode (in memory); a private install uses a volume for the database file. |
| Code | GitHub, `Koredyne/recurring-scheduler` |

## 2. Architecture

```
Browser ── React app ───────────────────────────────────────────────
  App.jsx            tabs, loads state once, mutate() helper, dialogs,
                     VocabContext provider
  components/        Calendar, WeekGrid, ScheduleViews, PackageBuilder,
                     DayClassDialog, OneOffDialog, PrintSchedule, …
  lib/schedule.js    rotation engine, day changes, clash detection  ◄─ shared
  lib/dates.js       UTC date maths, 12-hour display                 ◄─ shared
  lib/vocab.js       words per kind of business                      ◄─ shared
  lib/demos.js       the demos offered in Settings
  lib/dayChange.js   saving day changes, drag-to-move
          │  JSON over HTTP  /api/*
Node 24 ─▼──────────────────────────────────────────────────────────
  server/index.js    production: serves dist/ + /api, optional BASIC_AUTH,
                     optional PLAYGROUND, clean shutdown on SIGTERM
  vite.config.js     development: the same API mounted inside Vite
  server/api.js      REST routes, input cleaning, guarded() transactions
  server/db.js       schema, migrations, settings, getState, reset, export
  server/demos/      seed.js (generic seeder) + gym.js, clinic.js, office.js
  server/playground.js  one in-memory database per visitor
  node:sqlite ──► data/schedule.db   (or $DB_FILE; :memory: per visitor in playground mode)
```

**Data flow.** The client loads the whole dataset once (`GET /api/state`). Every write returns the **complete updated state**, which replaces the client's copy. There is no cache to invalidate and no partial update to reconcile. One business's data is a few hundred rows, so this is cheap and removes a whole class of sync bugs.

**One process.** In production a single Node process serves the built front end and the API on one URL. In development the same API runs as Vite middleware, so there's one command (`npm run dev`) and no CORS.

## 3. Data model

SQLite, created on startup. Foreign keys on. Dates are `YYYY-MM-DD` text handled in UTC (they sort and compare as text and never shift with time zones); times are `HH:MM` 24-hour text.

The tables and columns keep the gym words (`coaches`, `packages`, `members`); the screens translate them (section 4).

```sql
settings         (key PRIMARY KEY, value)   -- kind, name, currency
areas            (id, name, sort)
coaches          (id, name UNIQUE)
activities       (id, name UNIQUE, color)
classes          (id, activity_id → activities, coach_id → coaches = the main coach)
class_coaches    (class_id → classes CASCADE, coach_id → coaches, sort) -- the other coaches; no two classes share activity + coach set (checked by the API)
slots            (id, area_id → areas, day 0–6 (0 = Sunday), start_time, end_time, label,
                  capacity, type, buffer_minutes DEFAULT 0, active DEFAULT 1, CHECK end_time > start_time)
packages         (id, name, anchor_date, end_date NULL | exclusive, cycle_length ≥ 1,
                  CHECK end_date > anchor_date)
package_plans    (id, package_id → packages CASCADE, label, classes_per_month NULL = Unlimited, months ≥ 1 (default 1), price for all the months)
members          (id, name, email)
package_members  (package_id → packages CASCADE, member_id → members CASCADE,
                  plan_id → package_plans SET NULL, start_date, end_date inclusive)   -- subscriptions
package_entries  (id, package_id → packages CASCADE, slot_id → slots, class_id → classes,
                  week_position ≥ 1, UNIQUE(package_id, slot_id, week_position))
one_offs         (id, date, area_id → areas, class_id → classes, start_time, end_time, label, note)
one_off_members  (one_off_id → one_offs CASCADE, member_id → members CASCADE)
session_changes  (id, date, slot_id → slots CASCADE, class_id → classes CASCADE, cancelled,
                  new_date, area_id, start_time, end_time, new_class_id, note,
                  UNIQUE(date, slot_id, class_id))
```

Notes:

- `settings` holds three keys: `kind` (`gym`, `clinic` or `office`), `name` and `currency`. `getSettings` merges the rows over the defaults (`gym`, empty name, `KD`). Loading a demo writes its settings; clearing the data keeps them.
- Prices are plain numbers in the business's currency. The currency is a setting, not stored per price.
- `UNIQUE(package_id, slot_id, week_position)`: one class per class time per week in a package. Different packages may share a class time — that is how shared classes work.
- `package_members.end_date` is the **inclusive** expiry (as a membership "expires" date reads); `packages.end_date` is **exclusive** (the first Sunday it no longer runs) so an old package's end and its successor's start can be the same date.
- A `session_changes` row identifies a weekly class by **(original date, slot, class)** — the class as the package puts it. Its other columns say what happens instead; `NULL` means "unchanged". Because it's keyed by slot + class rather than by package entry, every package sharing that class gets the same change.
- Deleting anything still referenced fails with "Still in use — remove it where it is used first". Nothing is silently orphaned (except day changes, which cascade with their slot or class).
- **Migrations** run in `openDb`: new tables (such as `settings`) are created with `CREATE TABLE IF NOT EXISTS`; added columns use `ALTER TABLE` when missing; an older `classes` table with a one-coach `UNIQUE` rule is rebuilt without it. A brand-new database is seeded with the Gym demo and its settings.

## 4. Vocabulary (`src/lib/vocab.js`)

One engine, different words. `KINDS` lists, for each kind of business, a `[singular, plural]` pair for the same five keys, plus a print title and placeholder examples:

| Key | `gym` | `clinic` | `office` |
|---|---|---|---|
| class | class | session | meeting |
| coach | coach | practitioner | host |
| activity | activity | service | meeting type |
| member | member | patient | client |
| package | package | programme | series |
| `printTitle` | Training Schedule | Clinic Timetable | Room Bookings |
| `example` | Boxing, Marco, Boxing Kids, Private lesson | Physiotherapy, Dr Haddad, Back Care, Assessment | Workshop, Sara, Weekly planning, Interview |

`vocabFor(settings)` returns `v`:

- `v.class`, `v.classes`, `v.Class`, `v.Classes`, and likewise for each key. Property names are always the gym words, so `v.Coaches` is "Hosts" for meeting rooms. Code stays readable and every kind has the same keys (a test checks this).
- `v.n(3, 'class')` → "3 meetings"; `v.a('activity')` → "an activity" / "a service"; `v.money(45)` → "45 KD"; `v.oneOff` → "one-time session".
- `v.name`, `v.currency`, `v.kind`, `v.kindLabel`, `v.printTitle`, `v.example`.
- An unknown kind falls back to the gym words. `GYM = vocabFor()` is the default.

**In the browser**, `App.jsx` builds `v` from `state.settings` and provides it through `VocabContext` (`src/components/VocabContext.jsx`); components call `useVocab()`. Pure helpers take `v` as their last argument and default to `GYM`: `planLabel(p, v)` and the other plan labels in `src/lib/plans.js`, and `describeConflict(c, withDate, v)` in `src/lib/schedule.js`.

**On the server**, `api.js` builds `v` from the stored settings for every error message: "Session not found", "Pick a service", and clash messages like "Blocked — would create a conflict: Practitioner Ana Ruiz double-booked: …".

Fixed words that are the same for every kind: **Schedule**, **Rooms & times**, **Settings**, **room**, **Unlimited**, and "*class* time" built from the current word ("session time", "meeting time").

## 5. The rotation engine (`src/lib/schedule.js`)

```text
status(pkg, date)   = upcoming  if date < anchor
                      ended     if end_date and date ≥ end_date
                      active    otherwise

position(pkg, date) = (floor((date − anchor) / 7) mod cycle_length) + 1      -- only when active
```

`resolveDate(state, date)` produces every session on a real date in three steps:

1. **Package sessions.** Each package entry whose package is active, whose `week_position` equals the package's position for that date, and whose slot falls on that weekday. Each session carries date, entry, slot, class, package, position, room, start/end minutes, and `gap: true` if the slot is switched off.
2. **Day changes.** For each package session, look up a change keyed `date:slot:class`:
   - none → unchanged;
   - moved to another date → dropped here;
   - otherwise → the change is applied: the slot is copied with the new room/times (keeping its id so shared packages still group), the class is swapped if a new person was set, and the session gets `change`, `origin` (what it was) and `cancelled`.
   Then changes whose `new_date` is this date pull their session in from the original date (by resolving that date's package sessions and matching slot + class).
3. **One-time classes** on the date are added as sessions with a stand-in slot (`id: 'o<id>'`), `pkg: null` and `oneOff` set, so the grid and clash check treat them like any other session.

Lookups for step 2 are built once per state in `indexState` (`changes` by key, `movedIn` by new date), so scanning hundreds of dates stays fast.

**Example.** A 4-week package anchored Sunday 4 Oct, Tuesday 27 Oct: `floor(23 / 7) = 3`, `3 mod 4 = 3`, position **week 4**.

Nothing is generated or stored per week. Any date — next week or in three years — resolves with the same arithmetic.

## 6. Clash detection

**Rules (`findConflicts`)**, for every pair of sessions on the same date:

| Type | Clash when |
|---|---|
| Room | same room and the times overlap, including each slot's cleaning `buffer_minutes` after it |
| Person | any person (coach) in both classes (case-insensitive; a class can have several) and the times overlap |

Never clashes: sessions on switched-off slots (gaps), **cancelled** sessions, the same class in the same slot from different packages (shared), and back-to-back classes.

**Horizon (`conflictHorizon`).** Rotations repeat, so the set of combinations is finite. The scan runs from the current week until every package start/end, one-time class and day change has passed, then one more full **LCM of all cycle lengths** (capped at 104 weeks; 208 weeks in total). After that point the pattern only repeats.

**Where it runs:**

1. **In the browser, as a preview.** The day dialog and the one-time class form build a *draft state* containing the proposed change and check just that date (`scanConflicts(draft, date, 1, involves)`). Package forms check the whole horizon. Clashes are listed before saving, and Save is disabled. Shared packages can report the same clash several times; the day dialog shows each one once.
2. **On the server, as the final word.** Every write (except reset, clear and settings) runs inside `guarded()`:

```text
before = all clashes from this week on
BEGIN; apply the change
after  = all clashes from this week on
if after has anything not in before → ROLLBACK, 409 "Blocked — would create a conflict: …, first <date>"
else COMMIT
```

Comparing before and after means existing clashes (e.g. from imported data) don't block unrelated edits — only **new** ones are refused. Conflict identity uses the two sessions' entry ids (stringified, since one-time ids are strings like `o12`) plus date and type. The message is written by `describeConflict` with the stored vocabulary.

## 7. Day changes (`src/lib/dayChange.js`)

- `originOf(s)` returns the class as the package has it (`s.origin` when the session was already changed).
- `saveDayChange(mutate, s, patch)` merges the patch onto the existing change, then **drops anything equal to the original** (same date, room, times or class). If nothing is left — not cancelled, not moved, same person, no note — the change is deleted and the class is simply back to normal. Otherwise it `POST`s `/api/changes`, which upserts on (date, slot, class).
- `moveSession(mutate, state, s, {date, areaId, start})` keeps the length. For one-time classes it updates the one-time class itself (keeping its members); for weekly classes it saves a day change with the new date, room and times.

**Drag-and-drop** (`WeekGrid`): pressing on a block records the grab offset; after 5 px of movement it becomes a drag. Each move finds the lane under the pointer with `document.elementsFromPoint` (lanes carry `data-lane`, `data-date`, `data-area`), snaps the start to 15 minutes, and the target lane draws a preview with the activity, new time and room. On release, if anything changed, `onMove` is called; a click that ends a drag is swallowed so it doesn't also open the dialog. Dragging is only enabled on the Schedule (the package calendar doesn't pass `onMove`), and not for cancelled classes.

## 8. API

Base path `/api`. JSON in and out. **Every successful response includes `state`** (the full dataset, with `settings` and `playground: true|false`). Errors are `{ "error": "message" }` with 400, 404, 405 or 409, worded in the business's vocabulary.

| Method & path | Body | Effect |
|---|---|---|
| `GET /state` | — | The full dataset. |
| `GET /export` | — | Every table as `{ format: "recurring-scheduler-export", version: 1, exportedAt, tables }`, downloaded as `schedule-data-YYYY-MM-DD.json`. |
| `POST/PUT/DELETE /:resource[/:id]` | fields | Generic CRUD for `areas, coaches, activities, classes, slots, packages, entries, members, plans`. Strings trimmed, empty → NULL, booleans → 0/1. Package dates must be Sundays. |
| `POST /packages/:id/handover` | `{ date, name, copy }` | End the package on `date` and start a successor from the same date, optionally copying its classes. |
| `POST /packages/:id/members` | `{ member_id, plan_id, start_date, end_date }` | Subscribe or update a subscription. |
| `DELETE /packages/:id/members/:memberId` | — | Unsubscribe. |
| `POST /bundles` | `{ name, anchor_date, cycle_length, sessions, plans }` | Create a whole package in one request. A session is `{slot_id, class_id, week}` or `{new: {activity, coach, label, day, start_time, end_time, area_id?}, week}`; new ones create any missing activity, coach, class and class time (first free room if none given). |
| `PUT /bundles/:id` | `{ sessions }` or `{ week, sessions }`, optionally with `name, anchor_date, end_date, cycle_length, plans` | Replace a package's classes for all weeks, or one week. With the extra fields, edits the whole package in one all-or-nothing save: plans with an `id` are updated, new ones added, missing ones deleted (their subscribers keep the package with no plan). |
| `POST /oneoffs`, `PUT /oneoffs/:id` | `{ date, area_id, start_time, end_time, class_id \| activity + coach, label, note, member_ids }` | Create or replace a one-time class and its members. |
| `DELETE /oneoffs/:id` | — | Cancel a one-time class. |
| `POST /changes` | `{ date, slot_id, class_id, cancelled?, new_date?, area_id?, start_time?, end_time?, new_class_id \| activity + coach?, note? }` | Create or replace the day change for that class on that date. |
| `DELETE /changes/:id` | — | Undo a day change. |
| `PUT /settings` | `{ kind?, name?, currency? }` | Save the business settings. Unknown kind or empty currency → 400. |
| `POST /reset` | `{ demo: "gym" \| "clinic" \| "office" }` | Replace all data with that demo and its settings. Any other value loads the gym demo. |
| `POST /clear` | — | Delete all data; keep the settings. |

All writes except reset, clear and settings go through the clash guard.

## 9. Front end

**State.** `App.jsx` holds the state. Actions call `mutate(api => api.x(...))`, which runs the request, swaps in the returned state and shows errors as toasts. No global store; only the vocabulary comes through a React context.

**Header.** The business name (or "Recurring Scheduler"), the tabs (three of them named from the vocabulary), and a **Playground** badge when `state.playground` is true. The browser tab title is "*Name* · Recurring Scheduler".

**Two contexts, two sets of handlers.** `App.jsx` routes clicks by where they happen:

| | Schedule | Package calendar |
|---|---|---|
| Click empty space | `OneOffDialog` | `EntryDialog` (adds a weekly class to the package) |
| Click a weekly class | `DayClassDialog` (that date only) | `SessionDialog` (the package, every week) |
| Drag a class | `moveSession` (that date only) | — |

**WeekGrid.**

- Visible hours = earliest to latest class shown, ±1 hour. A `ResizeObserver` sets pixels per minute so the hours fill the screen (minimum 0.45 px/min).
- Days with no sessions (and no shown empty slots) collapse to a 36 px strip until clicked.
- Sessions sharing slot + class merge into one block; the most specific package (fewest entries) leads, `+N` for the rest.
- Overlapping items in a lane sit side by side in columns.
- Blocks are `@container`s: initials below 6.5 rem wide, full name above. Tint is `color-mix(in oklab, var(--tint) 15%, #161616)`.
- Lines appear by height: `fits(n) = height ≥ 10 + n × 13.5 px`.
- Hover guide and click-drag creation on empty space snap to 15 minutes.

**Time input.** `TimeInput` is hour (12, 1…11) · minutes (5-minute steps, keeping any odd value already stored) · AM/PM, storing `HH:MM`. The browser's own time input follows the computer's 24-hour setting, so it couldn't guarantee AM/PM. `TimeRange` keeps the class length when the start changes.

**Persisted preferences** (localStorage): `scheduler.view` (day/week/month), `scheduler.rail.<section>` (left-rail sections open/closed).

**Design.** Dark theme: pure black background, grey surfaces, red accent used sparingly (active tab, now line, clashes, cancelled), amber for day changes. Space Grotesk headings, Inter body.

## 10. Printing (`PrintSchedule.jsx`, `styles.css`)

- The printable sheet is rendered through a portal into `<body>`. On screen it sits off-screen, invisible, at the printed width (192 mm = A4 minus margins), so it can be **measured**. In print, everything except the sheet is hidden and `@page` is A4 portrait with 9 mm margins.
- Table styles apply on screen too, so the measurement matches paper exactly.
- `fit()` sets CSS `zoom` to `min(1, 250 mm / sheet height)` — 250 mm of the 297 mm page, leaving room for browser headers and footers (Safari adds them by default). It runs before the Print button calls `window.print()` and on `beforeprint`, so ⌘P works too.
- `print-color-adjust: exact` keeps the coloured bands (some browsers still need "Print backgrounds" ticked).
- The default title is `v.printTitle` for the kind of business.
- Data: the shown week, Saturday-first columns of days that have classes, rows by start time, cells = the slot label (or the one-time class's name), deduplicated across shared packages; cancelled and switched-off classes excluded.

## 11. Demos (`server/demos/`)

Each demo is a plain object; one generic seeder turns it into rows.

- **`seed.js`** — `seedDemo(db, spec)`. The spec lists `areas`, `activities` (name → colour), `packages` (`name`, `cycle`, `start` in weeks from this week, optional `weeks` after which it ends, and `plans` as `[per month or null, price, label?, months]`), `sessions` (packages, activity, `coach` as `'A'` or `'A & B'`, area, days, start, end, label, `week`, capacity), `members` (name and subscriptions as `[package, plan index, start in days from today, months]`), `oneOffs` and `changes` (by week, day, start and activity). Week 0 is the current week, so every demo starts "now" whenever it's loaded. Coaches and classes are created on first mention; one class time is made per (area, day, start, end, label), so packages listing the same one share it. Unknown names throw.
- **`gym.js`** — *Harbor Combat Club*, kind `gym`: 3 rooms, 10 activities, 11 coaches, 109 class times, 17 one-week packages (including All Access and All Access Kids, which collect every adult or kids session), 25 plans, 26 members, a private lesson and a cancelled class. It computes the rooms itself: each timetable row names a preferred room, and sessions are placed earliest-first into the preferred room or any free one.
- **`clinic.js`** — *Cedar Physio Clinic*, kind `clinic`: 4 rooms (two treatment rooms, a studio, a pool), 6 practitioners, 7 programmes with 12 plans and 14 patients. A 2-week Back Care rotation (studio in week 1, pool in week 2), Post-natal Recovery for 6 weeks handing over to Stage 2, multi-month plans, two assessments as one-time sessions, a cancellation and a cover.
- **`office.js`** — *Northgate Business Centre*, kind `office`: 4 rooms, 6 hosts, 7 series with 8 plans and 8 clients. A daily standup, a 2-week sprint cycle, a board meeting every 4 weeks with two hosts, a first-aid course handing over to fire safety, room-hire plans, two one-time bookings, a room move and a cancellation.
- **`index.js`** — `DEMO_DATA = { gym, clinic, office }`. `src/lib/demos.js` lists the same keys with a title and description for the **Restore demo** dialog.

`resetDb(db, key)` deletes every row except the settings, seeds the demo and writes its settings, all in one transaction. `resetDb(db, 'empty')` (behind `POST /clear`) only deletes.

## 12. Playground mode (`server/playground.js`)

With `PLAYGROUND=1`, `server/index.js` opens no database file. `playground()` returns a handler that keeps a `Map` of sandboxes, each `{ db, api, seen }`:

- A request without a known `sandbox` cookie gets a new `openDb(':memory:')` database (so it is seeded with the Gym demo) and its own `apiMiddleware(db, { playground: true })`. The response sets `sandbox=<uuid>; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`.
- Each request moves its sandbox to the end of the `Map`, so the `Map` order is least-recently-used order, and updates `seen`.
- A sweep every 5 minutes drops sandboxes idle for more than **60 minutes**. When there are already **200**, the least recently used is dropped before a new one is created.
- `apiMiddleware` adds `playground: true` to every state, and the front end shows the **Playground** badge.
- On shutdown every sandbox database is closed. Nothing is persisted.

The dev server (`npm run dev`) doesn't use playground mode.

## 13. Running and deploying

```sh
npm install
npm run dev                  # http://localhost:5173 — UI + API, hot reload
npm run build && npm start   # production server on $PORT or 3000
npm run reset-db             # delete data/schedule.db; re-seeded on next start
npm test                     # the test suite
```

| Variable | Default | Purpose |
|---|---|---|
| `DB_FILE` | `data/schedule.db` | Database file. Use a throwaway path for testing. Not used in playground mode. |
| `PLAYGROUND` | unset | `1` = a private in-memory copy of the demo per visitor (production server only). |
| `BASIC_AUTH` | unset | `user:password` to require a login for the whole app. |
| `PORT` | 3000 | Server port (Railway sets it). |

**Railway (public playground):** one service deploying from `Koredyne/recurring-scheduler`, branch `main`, so every push to `main` deploys. Railpack build (`npm install`, `npm run build`; `engines.node >= 24` selects Node 24), start `node server/index.js` (e.g. via `RAILPACK_START_CMD`; direct Node so SIGTERM reaches the app and it shuts down cleanly), with `PLAYGROUND=1`. No volume is needed. Public URL: https://recurring-scheduler-production.up.railway.app. `.railwayignore` keeps `node_modules`, `dist` and the local database out of a manual `railway up`.

**Private install:** the same build and start, without `PLAYGROUND`, with a volume mounted at `/data`, `DB_FILE=/data/schedule.db` so the data survives redeploys, and `BASIC_AUTH` set. New tables and columns are created automatically on startup, so upgrades need no manual step.

**Repository:** `Koredyne/recurring-scheduler` on GitHub (public), branch `main`. `.gitignore` excludes `node_modules`, `dist` and `data`.

## 14. Testing approach

`npm test` runs the 84 tests in `test/` with Node's built-in runner (`node --test`, no extra packages, well under a second). Database tests use `:memory:` databases.

| File | What it covers |
|---|---|
| `test/schedule.test.js` | Clash rules: multi-person classes (any shared person clashes, case-insensitive, typed "A & B"), single-person and room clashes, cleaning buffer, back-to-back, shared classes, cancelled and switched-off. |
| `test/plans.test.js` | Plan labels with lengths, `expiryFor` (incl. month-end clamping), presets; plans from before lengths existed. |
| `test/packageClasses.test.js` | The package form's class list: a package's switched-off class times are kept, others stay hidden; `weeksOf`. |
| `test/api.test.js` | The API: whole-package edits (all-or-nothing, plans keep subscribers, clash blocks the save), plan lengths, multi-person classes, older request shapes. |
| `test/migrations.test.js` | Upgrading an older database: plans get 1 month with prices unchanged, the classes table loses its one-coach rule without losing classes, entries or day changes, and reopening changes nothing. |
| `test/export.test.js` | `GET /export` returns every table, including plans, join rows, one-time classes and day changes. |
| `test/demos.test.js` | For every demo: the kind and name are set, no room or person clashes over the next 12 weeks, this week and next show its day changes and one-time classes, and every subscription's plan belongs to its package. Also: clearing keeps the settings, and the demo lists in the app and the server match. |
| `test/vocab.test.js` | The words switch with the kind, `a`/`an`, fallback to the gym words for an unknown kind, every kind has the same keys, plan labels use the business's words and currency. |
| `test/settings.test.js` | `PUT /settings` saves and messages use the new words; an unknown kind and an empty currency are refused; any demo loads by key. Playground: each visitor gets their own copy, and the least recently used copy is dropped when full. |

The pure helpers they test live in `src/lib/` (`schedule.js`, `plans.js`, `packageClasses.js`, `vocab.js`) so Node can load them without the bundler.

The screens themselves have no automated browser tests. Changes to the UI are checked by hand (or with headless browser scripts) against a **throwaway database** (`DB_FILE=/tmp/test.db`) or a local playground (`PLAYGROUND=1`), never real data. Adding browser tests for the main flows is on the roadmap.
