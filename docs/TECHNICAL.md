# Koredyne Schedule — Technical Documentation

A scheduler for recurring sessions in rooms, for any business that runs a weekly timetable: a gym or studio, a clinic, a business centre with meeting rooms. People run activities in rooms; repeating series (weekly or rotating over several weeks) place them on a week calendar that refuses to let two sessions clash in the same room or with the same person. Clients subscribe to a series on a plan. The words on screen follow the kind of business.

- **Live (playground):** https://recurring-scheduler-production.up.railway.app — every visitor gets a private copy of the demo, so you can change anything.
- **Code:** https://github.com/Koredyne/recurring-scheduler
- **Full specs:** [`k-docs/`](../k-docs/README.md) — product spec, technical spec, decisions, limits and roadmap.
- **Stack:** React 19 + Vite 8 + Tailwind CSS v4 + shadcn/ui on the front end; Node 24 with its built-in SQLite (`node:sqlite`) on the back end. No other server dependencies.

---

## Contents

1. [How the schedule is modelled](#1-how-the-schedule-is-modelled)
2. [Why it is built this way](#2-why-it-is-built-this-way)
3. [Using the app](#3-using-the-app)
4. [Architecture](#4-architecture)
5. [Database schema](#5-database-schema)
6. [The rotation engine](#6-the-rotation-engine)
7. [Conflict detection](#7-conflict-detection)
8. [REST API](#8-rest-api)
9. [Front end](#9-front-end)
10. [Demo data](#10-demo-data)
11. [Running locally](#11-running-locally)
12. [Deployment (Railway)](#12-deployment-railway)
13. [Limitations and open questions](#13-limitations-and-open-questions)

---

## 1. How the schedule is modelled

The code, tables and API use one set of names, taken from the first kind of business it supported (a gym): **coaches**, **activities**, **classes**, **packages**, **members**. The screens use the words of the business (see [Vocabulary](#vocabulary) below). This document uses the internal names, with examples from all three demos.

Everything rests on three building blocks plus the link between them:

| Concept | Answers | Example |
|---|---|---|
| **Class** | *What & who* — an activity with one or more people (coaches) running it together | Boxing with Marco Reyes; Board meeting with Laura Becker & Ahmed Rahim |
| **Slot** (class time) | *When & where* — an area (room), a weekday and a start–end time, with a label | Studio, Sunday 5:00–6:00 PM, "Group" |
| **Package** (series) | *The repetition* — a start week (anchor), optional last week, and a cycle length in weeks | "Back Care", 2-week cycle, from 4 Oct |
| **Package entry** | *"This class, in this slot, on week N of this package's cycle"* | Back Care/Omar Farouk in Studio Sun 5 PM, week 1; Hydrotherapy/Ana Ruiz in Pool Sun 5 PM, week 2 |
| **Plan** | *How a package is sold*: classes per month (or all of them), for how many months, and one price for all of them | Clinical Pilates: 8 sessions a month · 1 month · 50 KD, or 12 sessions a month · 3 months · 180 KD |
| **Subscription** | *A member (client) on a plan of a package*, from a start date to an expiry date (inclusive) | Bluefin Legal — Client reviews, 12 meetings a month, 3 months |
| **One-time class** | *A class on one date only*, outside any package, with the members booked into it | Assessment: Physiotherapy/Dr Leila Haddad, Treatment 2, Thu 1–2 PM, Faris Khoury |
| **Day change** | *One weekly class changed on one date only*, made from the Schedule: cancelled, moved, or another person. The package is untouched. | Tuesday's 4 PM Sports Massage cancelled (on leave); Sunday's standup moved to Room B |

Supporting lists, managed once in **Settings** and picked everywhere else:

- **Coaches** (people): names.
- **Activities**: names and a colour, used to colour blocks in the calendar.
- **Areas** (rooms): the physical spaces (Ring, Mat, Studio; Treatment 1, Pool; Boardroom, Room A).
- **Members** (clients): people or companies, who subscribe to packages on a plan, with a start and expiry date.

A weekly **session** is never stored. It is calculated: for any real date, the app works out which week of each package's cycle that date falls in and pulls the matching entries. That calculated session is what the calendar draws. One-time classes are stored with their date and simply added to that date's sessions, so the calendar and the clash check treat them exactly like weekly ones.

### Key rule: the week number lives on the package entry

Classes are shared between packages. If "week 1" were stored on the class, that class could only ever be week 1. Putting the week position on the *entry* lets the same class be week 1 in one package and week 3 in another. Day and time stay off the class too (they belong to the slot), so a class can be reused at any time, in any area.

### Vocabulary

One engine serves every kind of business; only the words change. The `settings` table holds the **kind**, the business **name** and the **currency**. `vocabFor(settings)` in `src/lib/vocab.js` turns them into the words the screens use:

| Internal name | Gym (`gym`) | Clinic (`clinic`) | Meeting rooms (`office`) |
|---|---|---|---|
| class | class | session | meeting |
| coach | coach | practitioner | host |
| activity | activity | service | meeting type |
| member | member | patient | client |
| package | package | programme | series |
| Print title | Training Schedule | Clinic Timetable | Room Bookings |

Rooms are called **rooms** in every kind, and a slot is "*class* time" in the current words (a *session time*, a *meeting time*).

The vocabulary object `v`:

- `v.class`, `v.classes`, `v.Class`, `v.Classes`, and the same for `activity`, `coach`, `member`, `package`. The property names are always the gym words, so code reads `v.Coaches` and gets "Practitioners" for a clinic.
- `v.n(3, 'class')` → "3 sessions"; `v.a('activity')` → "a service" / "an activity"; `v.money(45)` → "45 KD".
- `v.oneOff` / `v.OneOff` ("one-time meeting"), `v.name`, `v.currency`, `v.kindLabel`, `v.printTitle`, and `v.example` (placeholder examples such as "e.g. Physiotherapy").

An unknown kind falls back to the gym words. The default settings are `{ kind: 'gym', name: '', currency: 'KD' }`.

---

## 2. Why it is built this way

| Decision | Reason |
|---|---|
| **Separate Class / Slot / Package** | Without slots, "Studio, Sunday 5 PM" would be retyped in every week of every package. A slot defines it once; move the slot and everything using it moves. Without classes, "Physiotherapy with Dr Haddad" would be retyped everywhere. |
| **Anchor + modulo for rotations** | Any date, however far in the future, can be resolved with simple arithmetic (§6). Nothing has to be "generated" week by week, and there are no cron jobs or materialised calendars to keep in sync. |
| **Anchors and end dates are always Sundays** | The week starts on Sunday. Pinning anchors to the start of a week keeps week counts whole and easy to check by hand. The server rejects non-Sunday dates, and the UI uses a week picker so a wrong date can't be picked in the first place. |
| **`end_date` is exclusive** | It is the first Sunday the package *stops* running. That lets an old package's end and its successor's start be the same date, a clean back-to-back **handover** with no gap or overlap (a first-aid course handing over to fire safety). The UI hides this by asking for the "last week" instead. |
| **Conflicts are checked on packages, not slots** | Two empty slots can overlap; they are just containers. A clash only exists once a package puts classes into them on real dates. |
| **Conflict check runs on the server, inside a transaction** | Each change is applied, the whole future is re-checked, and anything that *introduces* a new clash is rolled back with a clear message. The client also previews clashes so the user sees them before saving, but the server is the final word. |
| **Same class + same slot from two packages = one shared session** | A "Kids & Adults" class can belong to both a kids and an adults package. That isn't a double booking; it's one class that two groups attend. |
| **Labels on slots, not separate packages** | "Adults — Gi" and "Adults — No Gi", or "Knee" and "Shoulder", are labels on class times. A member of the package can attend all of them; the label says what each one is. |
| **One engine, vocabulary per kind of business** | Gyms, clinics and meeting rooms share the same structure. A small word table (§1) makes each feel native without forking the app. |
| **Internal names keep the gym words** | Tables, API routes and code say `coaches`, `packages`, `members`. Renaming them would have touched every file and every existing database for no change in behaviour. The vocabulary layer maps them to screen words. |
| **SQLite via `node:sqlite`** | One file, zero setup, no extra dependency. Right-sized for one business. |
| **One server for UI + API** | In development the API runs inside the Vite dev server. In production a small Node server serves the built app and the API from one process. One deploy, one URL. |
| **Playground: a private in-memory copy per visitor** | The public link should let anyone drag, cancel and delete without changing what others see, and without a shared database that someone can wipe. |
| **Schedule changes one day; Packages change every week** | Editing a package from the Schedule ("Remove from week 1") quietly rewrote every week of a 1-week package. Now anything done on the Schedule (drag, cancel, swap person, one-time class) is stored as a day change or one-time class, and weekly edits only happen in Packages. |
| **Day changes keyed by date + slot + class** | A shared class is one real class; cancelling or moving it must affect every package that includes it. |
| **Lanes by area, colour by activity, filter by coach/activity** | Area is the hard constraint, so it gets its own column: collisions are visible at a glance. Colour is for fast scanning. People and activities cut across areas, so they are filters rather than layout. |

The full list, with the alternatives that were rejected, is in [`k-docs/03-decisions.md`](../k-docs/03-decisions.md).

---

## 3. Using the app

The top bar shows the Koredyne icon and **Koredyne Schedule**, then the business name and six tabs, ordered by how often they're used: **Schedule**, ***Members***, ***Packages***, ***Classes***, **Rooms & times**, **Settings**. The three in italics follow the vocabulary: a clinic sees **Patients, Programmes, Sessions**; meeting rooms see **Clients, Series, Meetings**. In playground mode a **Playground** badge sits on the right of the bar.

The app avoids system words: on screen, *areas* are **rooms**, *slots* are **class times** (session times, meeting times), and a package's *cycle* is **Repeats**. The descriptions below use the gym words.

### Schedule

- **Day / Week / Month** (header, remembered between visits):
  - **Week**: the main view, described below.
  - **Day**: one day with the rooms side by side and wide blocks (person, time and package on one line), plus a list on the right with every class in time order: room, person, packages and member count, or the members of a one-time class. Click any of them to open it.
  - **Month**: every day of the month with its class count, a colour bar of the activity mix, the top activities, any clashes (⚠ N) and one-time classes by name. Click a day to open it in Day view.
- **Navigation**: *Today*, the ◀ ▶ arrows (a day, a week or a month at a time), or click any day in the month picker on the left.
- **Layout**: one column per day (Sunday → Saturday), split into one lane per **room**. The time axis only covers the hours in use (an hour before the first class to an hour after the last) and scales to fit the screen; a red line marks *now*. A day with nothing on shrinks to a thin striped **No classes** strip — click it to open the day up, e.g. to add a class.
- **The Schedule only ever changes single days.** Weekly changes (adding, removing or swapping a package's classes) are made from **Packages**. Anything done here affects that one date and leaves the package as it is.
- **Blocks** are tinted with the activity colour and show the activity, the person (initials like **KS** when narrow, the full name when there's room) with the member count on the right, then the class time's **label** (*Adults*, *Knee*, *Acme*; *One time* for one-offs) and the rotation week (*W2/6*). Lines drop off on short blocks. Day view puts person · label · package · members · week on one line. **Display** in the header holds **Show empty class times**.
- **Hover a block** for the full details: date and time, room, every package using it, member count vs. capacity, and any clashes.
- **Drag a block** to another time, room or day to move it **for that date only** (it snaps to 15 minutes and keeps its length; a clash is blocked with a message). Moved and changed classes say **Changed today** in amber; the following weeks are untouched.
- **Click a block** to open that day's class: **Cancel this day** (asks first; the class stays on the calendar crossed out as **Cancelled**, with **Bring it back**), or change its date, time, room or person and add a note, then **Save for this day**. It shows what the class normally is and **Undo changes** puts it back. **Open package** goes to the package for weekly changes. Cancelled classes don't count in clashes or the Month view.
- **Hover empty space** and a guide line shows exactly where a click would start a class, snapped to :00 / :15 / :30 / :45, with the time and room ("4:15 PM · Studio").
- **Click empty space** (or an empty class time) to add a **one-time class** starting there (1 hour by default), or **click and drag** down to pick the start and end together: date, time and room come from the click, then what, who, an optional name ("Private lesson", "Assessment", "Interview") and note, and the members (search, or type a new name to add someone new). It's clash-checked like everything else. On the calendar it has a dashed border and says *One time*; click it to edit or cancel it, or drag it to move it.
- **Print** (header) prints a type-only timetable of the week on screen, following the room and activity filters: one coloured table per activity, rows by start time, a column per open day (Saturday first), and who it's for in each cell (*ADULTS*, *KNEE*, *ACME*, or —). Set the title (default from the kind: *Training Schedule*, *Clinic Timetable*, *Room Bookings*) and the line under it, and optionally show people. Cancelled classes are left out and changed ones print as changed. It fits an A4 page; choose **Save as PDF** in the print window for a file.
- **Left rail**: the month picker, then folding sections, each showing its current selection even when closed:
  - **Packages**: click one to highlight its sessions; everything else fades.
  - **Rooms** (only when there are more than 5 rooms; with 5 or fewer the room pills sit in the header instead): pick one or more rooms to show only those columns, so each gets more width.
  - **Coach**: highlight one person.
  - **Activities**: tick activities to show only those.
  - When any filter is on, a "N filters on · Clear all" bar appears, plus **Clear filters** in the header.

### Packages

A package is what members buy: which classes they can come to, and how it's sold.

- **New package** opens a four-step form:
  1. **What's it called?** It suggests a name from what you tick.
  2. **Which classes can members come to?** Every class on the timetable, grouped across days. Tick a row for every day it runs, or tap single days. Filter by activity. When some class times are labelled for kids, **+ All kids …** / **+ All adult …** add a whole group at once. Switch to **Different each week** to make a rotation: use − and + to set "Starts again after N weeks" and a grid appears, with classes down the side and W1…WN across the top. Tick a cell to put a class in that week, click a class name to tick or clear its whole row, or click a week to tick or clear its column (e.g. a studio class in week 1 and a pool session in week 2). **+ Add a new class** at the bottom of the list makes a class that isn't on the timetable yet: what, who, who it's for, days, time and room ("Any free room" picks the first room with nothing on). **Different time on some days?** gives each day its own start and end; days with different times become separate rows. A search box above the list filters by activity, label, person, time or day, and the numbers under W1…WN are how many classes that week has. A new class is ticked in every week straight away, and it's only created when the package is saved, so cancelling leaves nothing behind.
  3. **How is it sold?** Classes a month (8, 12, 24, Unlimited or a custom number), for how many months, and the price in the business's currency. Add more than one way if needed.
  4. **When does it start?** This week by default; for a rotation, this week becomes week 1.

  It's created all at once (one request), so it's never left half-made.
- **Package page**:
  - **Add or remove classes**: the same tick-list, to change what the package includes at any time.
  - **Name / Starts / Ends (optional) / Repeats** (*Same every week* or *Every N weeks*). Save is blocked if a change would create a clash.
  - **Plans**: click to edit or delete. Each shows how many members are on it.
  - **Members**: each subscription shows the plan and status: *Until 15 Oct*, *2 days left* (red), *Expired*, *Starts 11 Oct*. Click to change plan or dates or remove. **Subscribe member** adds someone: pick how long (the package's plan lengths), then a plan of that length; the expiry follows the start and length.
  - **Calendar** of the package's week(s); **Other packages** shows what else is booked around it.
  - **Replace from a date**: when the timetable changes, ends this package the week before and starts a new version from the week you pick (optionally with the same classes). Members and history stay on the old one.
  - **Delete**.

### Rooms & times

- Room tabs across the top, with rename and **+ Room**.
- A time grid of that room's class times for the week.
  - **Click** empty space to add a 1-hour class time there.
  - **Drag** to set an exact length (snaps to 15 minutes, with a red preview).
  - **Click a class time** to edit it: times, label, capacity, type, cleaning buffer, on/off, or delete.
- Solid blocks are used by a package; dashed ones are unused; faded ones are switched off.
- Switching off a class time that packages use shows a warning. Those packages then show a **gap** instead of silently losing it.

### Classes

A class is an activity with its people (e.g. Boxing with Marco; Board meeting with Laura Becker & Ahmed Rahim), picked from Settings. The table shows where each class is used. A class in use can't be deleted.

### Members

Search, add, rename and delete members. Each package chip shows the member's plan and expiry status (red when expiring within a week or expired). Upcoming one-time classes show as dashed **1×** chips; click one to open it. **+ Add** subscribes them to another package on its first plan, starting today for as many months as that plan lasts; open the package to change the plan or dates.

### Settings

- **Business**: the name (shown in the top bar and the browser tab), the **kind** (Gym or studio, Clinic, Meeting rooms; the words it uses are listed underneath) and the **currency** (KD by default). Changing the kind switches every word on screen at once.
- Cards for **Coaches**, **Activities** (click the dot to change colour), **Rooms** and **Members**, titled in the current words. Rename inline. Anything in use can't be deleted (members are the exception; deleting one removes their subscriptions).
- **Data**: kept here, away from the top bar, so it can't be clicked by accident.
  - **Download all data** saves every table as JSON (`schedule-data-YYYY-MM-DD.json`).
  - **Restore demo** replaces all data with one of three made-up demos (§10): **Gym**, **Clinic** or **Meeting rooms**. Its business settings come with it, so the words switch to match.
  - **Clear all data** starts from scratch. The business settings are kept.
  - Restore and clear both ask for confirmation.

---

## 4. Architecture

```
┌──────────────────────── Browser ─────────────────────────┐
│ React app (src/)                                          │
│  App.jsx ─ tabs, data loading, mutate(), VocabContext     │
│  components/ ─ Calendar, WeekGrid, Packages, Slots, …     │
│  lib/schedule.js ─ rotation + conflicts (shared w/ server)│
│  lib/vocab.js ─ words per kind of business (shared)       │
│  lib/api.js ─ fetch wrapper                               │
└───────────────┬───────────────────────────────────────────┘
                │  JSON over HTTP  /api/*
┌───────────────▼───────────────────────────────────────────┐
│ Node 24                                                   │
│  server/index.js ─ prod: static files + /api (+ optional  │
│                    basic auth, optional playground)       │
│  vite.config.js ─ dev: same API as Vite middleware        │
│  server/api.js   ─ REST handler, conflict guard           │
│  server/db.js    ─ schema, migrations, settings, reset    │
│  server/demos/   ─ seeder + gym, clinic, office demos     │
│  server/playground.js ─ one in-memory DB per visitor      │
│  node:sqlite ──► data/schedule.db  (or $DB_FILE)          │
└───────────────────────────────────────────────────────────┘
```

**Data flow.** The client loads the whole state once (`GET /api/state`). Every write (`POST/PUT/DELETE`) returns the **full updated state**, which replaces the client's copy. There is no client cache to invalidate and no partial updates to reconcile. One business's data is a few hundred rows, so this is cheap.

**Shared logic.** `src/lib/schedule.js`, `src/lib/dates.js` and `src/lib/vocab.js` are plain ES modules used by **both** the browser (live previews, greying out clashing choices) and the server (the authoritative guard, error messages in the business's words). Both sides apply the same rules.

### Playground mode

With `PLAYGROUND=1`, `server/index.js` doesn't open a database file. Instead `server/playground.js` gives every visitor a private **in-memory** database:

- The first request without a valid `sandbox` cookie creates a new `:memory:` database (seeded with the Gym demo, like any new database) and sets an `HttpOnly`, `SameSite=Lax` cookie `sandbox=<uuid>` (1 day).
- Later requests with that cookie go to the same copy. The visitor can restore any demo, clear it, or change the business settings; nobody else sees it.
- A copy idle for **60 minutes** is dropped (a sweep runs every 5 minutes). Past **200** copies, the least recently used is dropped to make room.
- The state carries `playground: true`, and the header shows a **Playground** badge whose tooltip explains that the copy is private and resets after an hour away.

Nothing is written to disk, so a redeploy or restart also resets every copy. Playground mode applies only to the production server (`npm start` / `node server/index.js`); `npm run dev` always uses the database file.

### File map

| Path | Purpose |
|---|---|
| `server/index.js` | Production HTTP server. Serves `dist/`, mounts the API at `/api`, falls back to `index.html` for deep links, optional `BASIC_AUTH`, optional `PLAYGROUND`. Shuts down cleanly on SIGTERM. |
| `server/api.js` | REST routes, input cleaning, friendly errors in the business's words, Sunday checks, conflict-guarded transactions, settings, export. |
| `server/db.js` | Schema, opening/migrating the DB, `getState`, `getSettings` / `saveSettings`, `resetDb(db, 'gym' \| 'clinic' \| 'office' \| 'empty')`, `exportData`. |
| `server/demos/seed.js` | `seedDemo(db, spec)`: the generic seeder that turns a plain demo description into rows. |
| `server/demos/gym.js`, `clinic.js`, `office.js` | The three made-up demos as data (§10). |
| `server/demos/index.js` | `DEMO_DATA`: the demos by key. |
| `server/playground.js` | Playground mode: one in-memory database per visitor, keyed by cookie, with idle and LRU eviction. |
| `vite.config.js` | React + Tailwind plugins, `@` alias, and a plugin that mounts the API in the dev server (`DB_FILE` selects the DB file). |
| `src/App.jsx` | Top bar (business name, tabs, Playground badge), tab routing, global dialogs (session, new entry, clear/restore demo), `VocabContext` provider, `mutate()` helper that turns API errors into toasts. |
| `src/lib/vocab.js` | `KINDS` (the words per kind of business), `DEFAULT_SETTINGS`, `vocabFor(settings)`, `GYM` (the default vocabulary). |
| `src/components/VocabContext.jsx` | React context for the current vocabulary; components call `useVocab()`. |
| `src/lib/demos.js` | `DEMOS`: the demos offered in **Restore demo**, with title and description. Keys match `DEMO_DATA`. |
| `src/lib/dates.js` | UTC `YYYY-MM-DD` date maths, minutes ↔ `HH:MM`, 12-hour display (`clock`, `clockRange`). |
| `src/lib/schedule.js` | Rotation engine, session resolution, conflict detection and horizon, `describeConflict(c, withDate, v)`, colour mapping. |
| `src/lib/plans.js` | Plan labels (`planLabel(p, v)`, `offerLabel`, `money`), presets and `expiryFor`. |
| `src/lib/packageClasses.js` | The package form's class list: grouping timetable classes across days, kids/adults detection, `weeksOf`. |
| `src/lib/dayChange.js` | Saving day changes (`saveDayChange`) and drag-to-move (`moveSession`) for weekly and one-time classes. |
| `src/lib/api.js` | Thin `fetch` wrapper for every endpoint. |
| `src/components/WeekGrid.jsx` | The shared week/time grid used by Schedule and Package calendars: lanes, blocks, hover cards, shared-session merging, filters. |
| `src/components/Calendar.jsx` | Schedule page: header, month picker, package progress, person and activity filters, conflict banner. |
| `src/components/EntryDialog.jsx` | Package calendar: add or change a weekly class in a package (slot → class → package & weeks), with live conflict preview. |
| `src/components/OneOffDialog.jsx` | Create, edit or cancel a one-time class and its members (what a click on the Schedule opens). |
| `src/components/DayClassDialog.jsx` | Schedule: a weekly class on one date — cancel it, move it, change the person, add a note, or undo, for that date only. |
| `src/components/PrintSchedule.jsx` | The **Print** button and the printed timetable (print styles live in `styles.css`). |
| `src/components/ScheduleViews.jsx` | Day view's list (`DayAgenda`), the **Month** view, and `passes()` (the schedule filters as a plain test). |
| `src/components/TimeInput.jsx` | 12-hour time picker (hour · minutes · AM/PM) and `TimeRange` (start–end that keeps the length when the start moves). |
| `src/components/SessionDialog.jsx` | Package calendar: a weekly class in its package — remove it or edit it for every week (or that rotation week), subscribe members. |
| `src/components/PackagesView.jsx` | Package list, settings, handover, package calendar. |
| `src/components/SlotsView.jsx` | Slot time grid with click/drag creation, slot editor. |
| `src/components/PackageBuilder.jsx` | The 4-step **New package** form and the **Add or remove classes** dialog; `ClassPicker` is the shared tick-list of timetable classes grouped across days. |
| `src/components/Subscriptions.jsx` | Plans editor, subscription chips and form (plan + start/expiry), expiry status (`subStatus`), shared by the package page, session dialog and Members page. |
| `src/components/WeekPicker.jsx` | Popover calendar that selects whole weeks (always returns the Sunday). |
| `src/components/ClassesView.jsx`, `MembersView.jsx`, `ConfigView.jsx` | The list/management screens. `ConfigView` is Settings, including the **Business** card. |
| `src/components/ui/*` | shadcn/ui components (Radix-based). |
| `src/styles.css` | Tailwind + theme: pure black / grey surfaces, red accent, Space Grotesk headings, Inter body. |
| `test/*.test.js` | The test suite (§11). |

---

## 5. Database schema

SQLite, created on startup if missing (`server/db.js`). Foreign keys are on.

```sql
settings         (key PRIMARY KEY, value)  -- 'kind' (gym | clinic | office), 'name', 'currency'
areas            (id, name, sort)
coaches          (id, name UNIQUE)
activities       (id, name UNIQUE, color)
classes          (id, activity_id → activities, coach_id → coaches = the main coach)
class_coaches    (class_id → classes ON DELETE CASCADE, coach_id → coaches, sort) -- the other coaches
slots            (id, area_id → areas, day 0–6 (0 = Sunday), start_time 'HH:MM', end_time 'HH:MM',
                  label, capacity, type, buffer_minutes DEFAULT 0, active DEFAULT 1,
                  CHECK end_time > start_time)
packages         (id, name, anchor_date 'YYYY-MM-DD', end_date NULL|'YYYY-MM-DD' (exclusive),
                  cycle_length ≥ 1, CHECK end_date > anchor_date)
package_plans    (id, package_id → packages ON DELETE CASCADE, label, classes_per_month NULL = all classes,
                  months  -- how long it's sold for, ≥ 1 (default 1),
                  price   -- in the business's currency, for all the months together)
members          (id, name, email)
package_members  (package_id → packages ON DELETE CASCADE, member_id → members ON DELETE CASCADE,
                  plan_id → package_plans ON DELETE SET NULL, start_date, end_date  -- the subscription;
                  end_date is the inclusive expiry, like a membership "expires" date)
package_entries  (id, package_id → packages ON DELETE CASCADE, slot_id → slots, class_id → classes,
                  week_position ≥ 1, UNIQUE(package_id, slot_id, week_position))
one_offs         (id, date 'YYYY-MM-DD', area_id → areas, class_id → classes, start_time, end_time,
                  label, note, CHECK end_time > start_time)  -- a class on one date only
one_off_members  (one_off_id → one_offs ON DELETE CASCADE, member_id → members ON DELETE CASCADE)
session_changes  (id, date, slot_id → slots ON DELETE CASCADE, class_id → classes ON DELETE CASCADE,
                  cancelled, new_date, area_id → areas, start_time, end_time, new_class_id → classes, note,
                  UNIQUE(date, slot_id, class_id))  -- one weekly class changed on one date only;
                  (date, slot_id, class_id) is the class as the package has it, NULL fields = unchanged
```

Notes:

- **Settings** are key/value rows. `getSettings` merges them over the defaults (`kind: 'gym'`, `name: ''`, `currency: 'KD'`); `saveSettings` only writes those three keys. Loading a demo writes its settings; clearing the data keeps them.
- **Dates** are stored as `YYYY-MM-DD` strings and handled in UTC so they compare correctly as text and never shift with time zones.
- **`UNIQUE(package_id, slot_id, week_position)`**: a package can put only one class in a given slot in a given week. Two *different* packages can use the same slot (that's how shared sessions work).
- **Deleting** a class, slot, area, coach or activity that is still referenced fails with *"Still in use — remove it where it is used first"*. Nothing is silently orphaned.
- **Migrations** run in `openDb`: new tables (including `settings`) are created with `CREATE TABLE IF NOT EXISTS`, missing columns are added with `ALTER TABLE`, and an older `classes` table with a one-coach `UNIQUE` rule is rebuilt without it. A very old database that still has the original `classes.activity` text column has its scheduling tables dropped and recreated.
- **Seeding**: a brand-new (empty) database is seeded with the **Gym demo** and its settings.

---

## 6. The rotation engine

`src/lib/schedule.js`

```text
status(pkg, date)  = upcoming if date < anchor
                     ended    if end_date and date ≥ end_date
                     active   otherwise

position(pkg, date) = (floor((date − anchor) / 7) mod cycle_length) + 1     -- 1-based, only when active
```

`resolveDate(state, date)` returns every session on a real date. It takes each package entry and keeps it when:

1. its package is **active** on that date,
2. its `week_position` equals the package's **position** for that date, and
3. its slot's weekday matches the date.

Each session carries the date, entry, slot, class, package, position, area, start/end minutes, and `gap: true` if the slot is inactive.

**Example.** A 4-week package (the office demo's board meeting) anchored Sunday 4 Oct. For Tuesday 27 Oct: `floor(23/7) = 3`, then `3 mod 4 = 3`, so the position is **week 4**. Only the entries with `week_position = 4` on Tuesday slots appear; the board meeting is in week 1, so it next runs on Tuesday 3 Nov.

**Day changes** are then applied. A session with a `session_changes` row for its date, slot and class takes the change's room, times and class (`change` and `origin` say what changed and what it was), or is marked `cancelled: true`. If the change moves it to another date it's dropped here and added on that date instead. Cancelled sessions are kept so the calendar can show them crossed out, but they never count in clashes. One-time classes on the date are added last.

The calendar never stores generated sessions; it calls `resolveDate` for each visible day. A schedule can therefore be viewed for any week in the past or future instantly.

---

## 7. Conflict detection

### Rules (`findConflicts`)

For every pair of sessions on the **same date**:

| Type | Clash when |
|---|---|
| **Area** | same area **and** the times overlap, counting each slot's `buffer_minutes` (cleaning time) after it |
| **Coach** | any person in both classes (case-insensitive; a class can have several) **and** the times overlap |

The following are **never** clashes:

- sessions on **inactive** slots (they're gaps, not bookings);
- **cancelled** sessions;
- the **same class in the same slot** coming from two packages (a shared session);
- back-to-back sessions (one ends at 5:00, the next starts at 5:00).

`describeConflict(c, withDate, v)` writes a clash in the business's words: "Studio double-booked: …" or "Host Sara Khan double-booked: …".

### How far ahead it checks (`conflictHorizon`)

Rotations repeat, so the set of combinations is finite. The check scans from the current week until every anchor, end date, one-time class and day change has passed, then one further full **LCM of all cycle lengths** (capped at 104 weeks, and 208 weeks in total). With a 4-week and a 2-week package, the combined pattern repeats every 4 weeks. Checking one full LCM past the last date change covers every combination that will ever occur.

### Where it runs

1. **Client preview.** The new-session dialog greys out classes that would clash and lists conflicts. The day dialog and one-time class form check the date they change. The package settings form blocks *Save* while a change would clash.
2. **Server guard (authoritative).** Every write except reset, clear and settings goes through `guarded()`:
   ```text
   before = all conflicts from this week on
   BEGIN; apply the change
   after  = all conflicts from this week on
   if after contains anything not in before → ROLLBACK, HTTP 409 "Blocked — would create a conflict: …"
   else COMMIT
   ```
   Comparing *before* and *after* means pre-existing conflicts (say from imported data) don't block unrelated edits; only **new** ones do. The message uses the stored settings, so a clinic reads "Practitioner … double-booked".

---

## 8. REST API

Base path `/api`. Request and response bodies are JSON. **Every successful response includes `state`**, the full dataset after the change, plus `playground: true|false`. Errors return `{ "error": "human readable message" }` with status 400, 404, 405 or 409. Messages use the business's words ("Session not found", "Pick a service").

### Read

| Method & path | Returns |
|---|---|
| `GET /api/state` | `{ state }` — `settings, areas, coaches, activities, classes (with activity/coach names and colour), slots, packages, plans, members, packageMembers, entries, oneOffs, oneOffMembers, changes, playground` |
| `GET /api/export` | Every table as JSON: `{ format: "recurring-scheduler-export", version: 1, exportedAt, tables: { <table>: [rows] } }`, downloaded as `schedule-data-YYYY-MM-DD.json`. Tables are discovered from SQLite, so new ones are included automatically. |

### Generic CRUD

`POST /api/:resource`, `PUT /api/:resource/:id`, `DELETE /api/:resource/:id`

| Resource | Writable fields |
|---|---|
| `areas` | `name, sort` |
| `coaches` | `name` |
| `activities` | `name, color` |
| `classes` | `activity_id, coach_ids: [main, …others]` (or `coach_id` for one). Refused if another class has the same activity and coaches. State gives each class `coach_ids`, `coaches` (names) and `coach` ("A & B"). |
| `slots` | `area_id, day, start_time, end_time, label, capacity, type, buffer_minutes, active` |
| `packages` | `name, anchor_date, end_date, cycle_length` — dates must be Sundays |
| `entries` | `package_id, slot_id, class_id, week_position` — `POST` upserts on (package, slot, week) |
| `members` | `name, email` |
| `plans` | `package_id, label, classes_per_month` (`null` = all classes), `months` (≥ 1), `price` (for all the months) |

Strings are trimmed, empty strings become `NULL`, and booleans become `0/1`.

### Special routes

| Method & path | Body | Effect |
|---|---|---|
| `POST /api/packages/:id/handover` | `{ date, name, copy }` | Ends package `:id` on `date` (a Sunday) and creates a successor anchored on the same date, optionally copying all entries. |
| `POST /api/packages/:id/members` | `{ member_id, plan_id, start_date, end_date }` | Subscribe a member, or update their subscription (plan and dates). Expiry before start is rejected. |
| `DELETE /api/packages/:id/members/:memberId` | — | Unassign a member. |
| `POST /api/bundles` | `{ name, anchor_date, cycle_length, sessions: [{slot_id, class_id, week} or {new: {activity, coach, label, day, start_time, end_time, area_id?}, week}], plans: [{classes_per_month, months, price, label}] }` | Create a whole package (classes + plans) in one go, all-or-nothing. `new` sessions create any missing activity, coach, class and time first. |
| `PUT /api/bundles/:id` | `{ sessions: [{slot_id, class_id, week}] }` or `{ week, sessions }`, optionally with `name, anchor_date, end_date, cycle_length, plans: [{id?, classes_per_month, months, price, label}]` | Replace a package's classes for every week, or just one week. With the extra fields, edits the whole package in one all-or-nothing save: plans with an `id` are updated, new ones added, missing ones deleted (subscribers keep the package with no plan). |
| `POST /api/oneoffs`, `PUT /api/oneoffs/:id` | `{ date, area_id, start_time, end_time, class_id or activity + coach, label, note, member_ids }` | Create or replace a one-time class and its members (missing activity/coach/class are created). Conflict-guarded. |
| `DELETE /api/oneoffs/:id` | — | Cancel a one-time class. |
| `POST /api/changes` | `{ date, slot_id, class_id, cancelled?, new_date?, area_id?, start_time?, end_time?, new_class_id or activity + coach?, note? }` | Change one weekly class on one date (cancel, move, other person). Creates or replaces the change for that class and date. Conflict-guarded. |
| `DELETE /api/changes/:id` | — | Undo a day change: the class is back as the package has it. |
| `PUT /api/settings` | `{ kind?, name?, currency? }` | Save the business settings. `kind` must be `gym`, `clinic` or `office`; `currency` can't be empty. |
| `POST /api/reset` | `{ demo: "gym" \| "clinic" \| "office" }` | Replace all data with a demo and its settings. An unknown or missing key loads the gym demo. |
| `POST /api/clear` | — | Delete all data. The settings are kept. |

Example:

```sh
curl -X POST http://localhost:3000/api/reset \
     -H 'content-type: application/json' -d '{"demo":"clinic"}'
```

---

## 9. Front end

- **State**: `App.jsx` holds `state` from the API. Each action calls `mutate(api => api.something(...))`, which runs the request, swaps in the returned state, and shows any error as a toast. Components receive `state` and `mutate` as props; there is no global store.
- **Vocabulary**: `App.jsx` builds `v = vocabFor(state.settings)` and provides it through `VocabContext`. Components call `useVocab()` and write `v.Classes`, `v.n(n, 'member')`, `v.money(price)` instead of fixed words. Pure helpers take `v` as an argument (`planLabel(p, v)`, `describeConflict(c, withDate, v)`) and default to the gym words (`GYM`). The browser tab title is "*Name* · Koredyne Schedule".
- **WeekGrid**:
  - Measures its own height with a `ResizeObserver` and sets *pixels per minute* so the visible hours always fill the screen (minimum 0.45 px/min).
  - Within a lane, overlapping items are laid out side by side in columns.
  - Sessions sharing a slot and class are merged into one block, with the viewed package taking the lead.
  - Sessions hidden by the activity filter still mark their slot as filled, so it doesn't show up as a fake "+ empty slot".
- **Slot grid** (`SlotsView`): pointer events handle click-to-create and drag-to-size with 15-minute snapping. Blocks show 3, 2 or 1 lines depending on their height, so text is never squashed.
- **Week picker**: a popover month calendar that highlights and returns a whole week (its Sunday), with *This week* / *Next week* shortcuts.
- **Design system**: shadcn/ui ("nova" preset, Radix primitives) on a custom dark theme:
  - Pure black background and grey surfaces.
  - Red (`oklch(0.62 0.22 25)`) used sparingly as an accent: active tab, *now* line, conflicts, focus. Primary buttons are white on black.
  - Space Grotesk for headings, Inter for body text.
  - Lucide icons.
- **Times** are stored as 24-hour `HH:MM` but entered and displayed in 12-hour AM/PM everywhere (`TimeInput`: hour · minutes · AM/PM; the browser's own time field follows the computer's 24-hour setting, so it can't guarantee AM/PM).
- **Two click contexts** (`App.jsx`): on the **Schedule**, empty space opens a one-time class, a weekly class opens `DayClassDialog`, and dragging calls `moveSession` — all for that date only. On a **package calendar**, empty space opens `EntryDialog` and a class opens `SessionDialog`, both changing the package.
- **Drag to move** (`WeekGrid`): after 5 px of movement a press on a block becomes a drag; the lane under the pointer (`data-lane`, `data-date`, `data-area`) draws a preview snapped to 15 minutes, and release calls `onMove`. The click that ends a drag is swallowed.
- **Print** (`PrintSchedule`): the sheet is rendered off-screen at the printed width so it can be measured, then scaled with CSS `zoom` to fit 250 mm of an A4 page before `window.print()` (and on `beforeprint`). Table styles apply on screen too so the measurement matches paper.
- **Persisted preferences** (localStorage): `scheduler.view` (day/week/month) and `scheduler.rail.<section>` (left-rail sections open/closed).

---

## 10. Demo data

Each demo is plain data in `server/demos/<key>.js`, loaded by one generic seeder. Everything in them (businesses, people, clients, prices) is made up; members get `@example.com` emails. Prices are in KD.

### The seeder (`server/demos/seed.js`)

`seedDemo(db, spec)` takes a plain description:

| Key | Shape |
|---|---|
| `settings` | `{ kind, name, currency }` (written by `resetDb`, not the seeder) |
| `areas` | `['Ring', 'Mat']` |
| `activities` | `{ Boxing: '#e5484d' }` |
| `packages` | `[{ name, cycle = 1, start = 0, weeks?, plans }]` — `start` is weeks from this week; `weeks` makes it end after that many weeks. Plans are `[per month (null = unlimited), price, label?, months = 1]`. |
| `sessions` | `[{ packages: [names], activity, coach: 'A' or 'A & B', area, days: [0–6], start, end, label?, week = 1, capacity = 20 }]` — one class time per (area, day, start, end, label); packages listing the same one share it. |
| `members` | `[[name, [[package, plan index, start (days from today), months]]]]` |
| `oneOffs` | `[{ week (0 = this week), day, area, activity, coach, start, end, label?, note?, members: [names] }]` |
| `changes` | `[{ week, day, start, activity, cancelled?, coach?, area?, note? }]` — finds the weekly class by day, start and activity. |

Week 0 is the current week (from its Sunday), so a demo always starts "now". Coaches and classes are created as they're first mentioned; an unknown activity, area, package or member throws. `test/demos.test.js` checks that every demo seeds with no clashes over 12 weeks, shows its day changes and one-time classes, and gives every subscription a plan of its own package.

To add a demo: write `server/demos/<key>.js`, add it to `DEMO_DATA` in `server/demos/index.js`, and to `DEMOS` in `src/lib/demos.js` (the test checks the two lists match).

### Gym demo (`gym.js`) — "Harbor Combat Club"

A made-up combat-sports gym, kind `gym`.

- **Week**: Saturday–Thursday; Friday is closed.
- **Class length**: every class is **1 hour**.
- **Packages**: every package is a **1-week cycle** anchored on the current week, since the timetable repeats identically.
- **Plans** are separate from packages: e.g. *Boxing* is sold as 12 classes a month for 45 KD or unlimited for 70 KD. A longer deal is a plan with more months (*All Access*: unlimited · 3 months · 300 KD), not another package.

| Package | Sessions | Plans (per month) | Coach(es) |
|---|---|---|---|
| Boxing | Adult boxing incl. Women | 12 · 45 KD, Unlimited · 70 KD | Marco Reyes, Sam Ortiz, Leo Park |
| Boxing Kids | Kids boxing | 8 · 35 KD, 12 · 45 KD | Sam Ortiz, Leo Park |
| MMA | Fundamentals and Adults | 12 · 50 KD, Unlimited · 75 KD | Dan Mercer |
| MMA Kids | Kids 6–9 and 10–14 | 8 · 35 KD, 12 · 45 KD | Dan Mercer |
| BJJ Gi | Adult Gi classes only | 12 · 50 KD | Nadia Haddad |
| BJJ Unlimited | All adult BJJ (Gi, No Gi, Open Mat) | Unlimited · 70 KD | Nadia Haddad |
| BJJ Kids | Kids Gi and No Gi | 8 · 35 KD, 12 · 45 KD | Nadia Haddad |
| Kickboxing | Adult kickboxing | 12 · 45 KD, Unlimited · 65 KD | Dan Mercer, Tariq Nasser |
| Kickboxing Kids | Kids kickboxing | 8 · 35 KD | Tariq Nasser |
| Muay Thai | Adults and Advanced | 12 · 45 KD, Unlimited · 65 KD | Mai Tran |
| Kyokushin | Kids & adults class | 8 · 35 KD | Yuki Sato |
| Sambo | Kids and adult Sambo | 12 · 40 KD | Ivan Petrov |
| Wrestling | Adults | 12 · 40 KD | Ivan Petrov |
| Judo | Kids and adult Judo | 12 · 40 KD | Kenji Mori |
| Taekwondo | Kids & adults class | 8 · 35 KD | Min-jun Lee |
| All Access | **Every** adult session | Unlimited · 110 KD, Unlimited · 3 months · 300 KD | — |
| All Access Kids | **Every** kids session | Unlimited · 80 KD | — |

A session can belong to several packages: e.g. a Monday "Adults — Gi" BJJ class is in *BJJ Gi*, *BJJ Unlimited* and *All Access*. These are **shared sessions**, not clashes. The calendar shows the most specific package and `+N` for the rest; hovering lists them all.

It also has a private lesson (a one-time Boxing class this Thursday) and a day change (next Tuesday's 10 AM Muay Thai cancelled, "Coach away").

Totals: 3 areas, 10 activities, 11 coaches, 13 classes, 109 slots, 17 packages, 25 plans, 227 package entries, 26 members with 27 subscriptions (some expiring soon, one starting later), 1 one-time class and 1 day change.

**Area placement.** The gym has three areas: **Ring**, **Mat** and **Studio**. Each timetable row names a *preferred* area: Ring for Boxing, Mat for grappling and MMA, Studio for the striking arts. Sessions are then placed earliest-first. A session takes its preferred area if it's free, otherwise any free area. The timetable never runs more than three classes at once, so this always succeeds, and it guarantees no area clashes. To change the area names or preferences, edit `AREAS` and the preferred-area column in `SCHEDULE`. Seeding throws an error if a timetable change ever needs a fourth area.

### Clinic demo (`clinic.js`) — "Cedar Physio Clinic"

A made-up physio clinic, kind `clinic`, open Sunday–Thursday plus Saturday morning. Rooms: **Treatment 1**, **Treatment 2**, **Studio**, **Pool**.

- **A 2-week rotation.** *Back Care* runs Sunday and Tuesday at 5 PM: a studio group class (Omar Farouk) in week 1, a 45-minute pool session (Ana Ruiz) in week 2.
- **A handover.** *Post-natal Recovery* runs for 6 weeks (Stage 1, Monday and Wednesday 11 AM in the Studio). *Post-natal Recovery — Stage 2* starts the week it ends, takes over the same times and adds a Thursday pool session.
- **Multi-month plans**: e.g. *Clinical Pilates* is 8 sessions a month · 50 KD, 12 · 65 KD, or 12 a month for 3 months · 180 KD.
- **Small capacities**: 1 for a massage, 4 for rehab, 6–10 for most groups.
- **One-time assessments**: this Thursday (Dr Leila Haddad) and next Sunday (Omar Farouk), each with one patient.
- **Day changes**: next Tuesday's 4 PM Sports Massage cancelled ("Ken on leave"), and next Monday's 6 PM Clinical Pilates covered by Priya Menon ("Cover for Hannah").

Packages: Back Care, Clinical Pilates, Sports Injury Rehab, Post-natal Recovery, Post-natal Recovery — Stage 2, Sports Massage, Hydrotherapy.

Totals: 4 areas, 6 activities, 6 practitioners, 8 classes (one is the cover), 37 slots, 7 packages, 12 plans, 37 package entries, 14 patients with 15 subscriptions, 2 one-time sessions and 2 day changes.

### Meeting rooms demo (`office.js`) — "Northgate Business Centre"

A made-up business centre renting rooms to client companies, kind `office`, open Sunday–Thursday. Rooms: **Boardroom**, **Room A**, **Room B**, **Training Suite**.

- **Daily**: *Acme — Daily standup*, 9:00–9:15 every weekday in Room A.
- **Fortnightly**: *Acme — Sprint cycle*, a 2-week cycle with planning on Sunday in week 1 and a retrospective on Wednesday in week 2.
- **Every 4 weeks, co-hosted**: *Northgate — Board meeting*, Tuesday 1–4 PM in the Boardroom, hosted by Laura Becker & Ahmed Rahim (a class with two people).
- **A handover**: *First-aid course* runs 4 weeks (Monday and Thursday afternoons in the Training Suite), then *Fire-safety course* takes over the same times for 4 weeks.
- **Room-hire plans**: e.g. 20 meetings a month · 150 KD for the standup; *Bluefin Legal — Client reviews* at 12 a month · 240 KD or 3 months · 650 KD; the board meeting on a "Quarterly" plan.
- **One-time bookings**: an Orbit final-round interview this Wednesday, and a pitch in the Boardroom next Monday.
- **Day changes**: next Sunday's standup moved to Room B ("Room A being redecorated"), and next Wednesday's 10 AM client review cancelled ("Public holiday").

Totals: 4 areas, 7 activities (meeting types), 6 hosts, 7 classes, 17 slots, 7 packages (series), 8 plans, 17 package entries, 8 clients with 10 subscriptions, 2 one-time meetings and 2 day changes.

---

## 11. Running locally

Requirements: **Node 24+** (for the stable `node:sqlite`).

```sh
npm install
npm run dev          # http://localhost:5173 — UI + API with hot reload
npm run build        # production bundle → dist/
npm start            # production server (serves dist/ + /api) on $PORT or 3000
npm run reset-db     # delete data/schedule.db; a fresh Gym demo is seeded on next start
npm test             # the test suite
```

To try playground mode locally: `npm run build && PLAYGROUND=1 npm start`.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DB_FILE` | `data/schedule.db` | SQLite file path (dev and prod). Handy for testing against a throwaway DB: `DB_FILE=/tmp/test.db npm run dev`. Ignored in playground mode. |
| `PLAYGROUND` | *(unset)* | `1` gives every visitor a private in-memory copy of the demo (§4). Production server only. |
| `BASIC_AUTH` | *(unset)* | `user:password`. When set, the whole app (UI and API) requires that login. |
| `PORT` | `3000` | Production server port (Railway sets this). |

### Tests

`npm test` runs `node --test` over `test/` (84 tests, well under a second, no extra packages). The API tests use in-memory databases.

| File | What it covers |
|---|---|
| `test/schedule.test.js` | Clash rules: multi-person classes, room clashes, cleaning buffer, back-to-back, shared classes, cancelled and switched-off. |
| `test/plans.test.js` | Plan labels with lengths, `expiryFor` (incl. month-end clamping), presets. |
| `test/packageClasses.test.js` | The package form's class list (switched-off class times kept), `weeksOf`. |
| `test/api.test.js` | The API: whole-package edits (all-or-nothing, plans keep subscribers, clash blocks the save), plan lengths, multi-person classes, older request shapes. |
| `test/migrations.test.js` | Upgrading older databases without losing data. |
| `test/export.test.js` | `GET /export` includes every table, plans, join rows, one-time classes and day changes. |
| `test/demos.test.js` | Every demo: settings set, no clashes over 12 weeks, day changes and one-time classes show up, every subscription's plan belongs to its package; clearing keeps the settings; the demo lists in `src/lib/demos.js` and `server/demos/index.js` match. |
| `test/vocab.test.js` | Words per kind, `a`/`an`, fallback to the gym words, same keys for every kind, plan labels in the business's words and currency. |
| `test/settings.test.js` | `PUT /settings` (saves, refuses an unknown kind or empty currency, messages use the new words), loading any demo by key, playground isolation between visitors and least-recently-used eviction. |

---

## 12. Deployment (Railway)

The public link runs as a single Railway service that deploys from **`Koredyne/recurring-scheduler`**, branch `main`, in **playground mode**.

| Setting | Value |
|---|---|
| Source | GitHub `Koredyne/recurring-scheduler`, branch `main`: every push to `main` deploys. |
| Builder | Railpack (auto-detected Node). `engines.node >= 24` in `package.json` selects Node 24. |
| Build | `npm install` → `npm run build` |
| Start | `node server/index.js` (e.g. via the service variable `RAILPACK_START_CMD`). Running Node directly (not via `npm start`) means a redeploy's stop signal reaches the app, which closes cleanly instead of logging `npm error signal SIGTERM`. |
| Variables | `PLAYGROUND=1` |
| Volume | None needed: playground copies live in memory. |
| Domain | https://recurring-scheduler-production.up.railway.app |

In playground mode every visitor gets their own copy of the Gym demo (and can load the clinic or meeting-rooms demo in Settings). Copies vanish after an hour idle and on every redeploy, so nothing a visitor does is kept or seen by anyone else.

`.railwayignore` excludes `node_modules`, `dist` and `data`. Railway builds from source, and a local database is **not** uploaded. `railway up` from a linked folder still works for a manual deploy; `railway logs` should show `Running on http://localhost:<port> (playground: a private copy per visitor)`.

### A private install

For a real business, run without `PLAYGROUND` so everyone shares one database file, and keep that file on a volume:

| Setting | Value |
|---|---|
| Volume | mounted at `/data` |
| Variables | `DB_FILE=/data/schedule.db` (the database survives redeploys), `BASIC_AUTH=user:password` (require a login) |
| Start | `node server/index.js`, as above |

A new database starts with the Gym demo. Set the business name, kind and currency in **Settings → Business**, then **Clear all data** (it keeps the settings) or load the matching demo to start from. New tables and columns are added automatically on startup, so upgrades need no manual step.

---

## 13. Limitations and open questions

- **No user accounts or roles.** There is at most a single shared password (`BASIC_AUTH`). There is no audit log of who changed what.
- **Skipped weeks.** A closed week still advances the rotation count. Pausing the rotation would need an anchor-shift or skip list per package.
- **Day changes are one class at a time.** Closing for a day means cancelling each class; a "close this date range" action would help.
- **Capacity isn't enforced.** Slot capacity is shown against package member counts, but members aren't booked into individual sessions, and "classes a month" isn't counted.
- **Fixed week shape.** The week starts on Sunday, package dates must be Sundays, and the print puts Saturday first. These aren't settings yet.
- **Three kinds of business.** The vocabulary is a fixed table of three kinds; there is no custom vocabulary.
- **Browser tests.** `npm test` covers the logic and API; the main screens are not covered by automated browser tests.
- **Single process, single file DB.** Fine for one business. Multiple locations or heavy concurrent use would call for Postgres and a proper API layer. Playground copies are held in memory by that one process.
- **Bundle size.** The JS bundle is ~680 kB (~195 kB gzipped). Acceptable for an internal tool; code-splitting per tab would reduce it.

See [`k-docs/04-limits-and-roadmap.md`](../k-docs/04-limits-and-roadmap.md) for the suggested roadmap.
