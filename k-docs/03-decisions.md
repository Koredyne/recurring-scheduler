# 03 — Decisions

Each significant decision, why it was made, and what was considered instead.

## Product scope

**One engine, vocabulary per kind of business.**
*Why:* a gym's classes, a clinic's sessions and a business centre's meetings have the same shape: people run activities in rooms at set times, in repeating series that clients subscribe to. Only the words differ. A small table of words per kind (`src/lib/vocab.js`), chosen in **Settings → Business**, makes each one read naturally — "Patients", "Programmes", "Practitioner Ana Ruiz double-booked" — while the rotation engine, clash checks, screens and API stay the same.
*Instead:* neutral words everywhere ("resource", "session", "client") — rejected, because they read as system terms and the users aren't technical; the app should sound like their business. Separate apps per kind — rejected, because every fix and feature would have to be made several times for the same logic.

**Internal names keep the original words.**
*Why:* the tables, API routes and code say `coaches`, `classes`, `packages`, `members`, from the first kind of business the app supported. Renaming them to neutral terms would touch every file, every API client and every existing database, and change nothing a user can see. The vocabulary layer maps them to screen words, and its property names follow the same words (`v.Coaches`), so there's one naming scheme in the code.
*Instead:* a full rename with a database migration — rejected as risk without benefit. Neutral names in new code only — rejected, two naming schemes would be worse than one.

**Three kinds, fixed for now.**
*Why:* gym, clinic and meeting rooms cover clearly different word sets and prove the layer works. Each kind has the same keys (a test checks this), so adding another is a data change.
*Instead:* fully custom words per install — deferred to the roadmap; it needs plural and "a/an" handling typed in by users.

## Data model

**Separate class, class time and package.**
*Why:* "Studio, Sunday 5 PM" and "Physiotherapy with Dr Haddad" would otherwise be retyped in every week of every package. Defined once, they can be reused anywhere, and moving a class time moves everything that uses it.
*Instead:* one flat "session" table with all fields repeated — rejected, it drifts out of sync immediately.

**The week number lives on the package entry.**
*Why:* classes are shared between packages; a class stored as "week 1" could never be week 3 elsewhere. Day and time stay on the class time for the same reason.

**Rotations by anchor + modulo, never generated.**
*Why:* any date resolves with arithmetic, so there are no cron jobs, no pre-generated calendars to keep in sync, and viewing next year is free. A standup every week, a sprint cycle every 2 weeks and a board meeting every 4 weeks are all the same rule.
*Instead:* materialising sessions week by week — rejected, it needs background jobs and goes stale when anything changes.

**Package starts and ends are always Sundays; the end is exclusive.**
*Why:* the week starts on Sunday, whole weeks keep the maths and manual checks simple, and an exclusive end lets one package hand over to the next on the same date with no gap or overlap (Post-natal Stage 1 to Stage 2; a first-aid course to fire safety). The UI asks for the "last week" so nobody has to think about exclusive dates.

**Plans and subscription length are separate from the package.**
*Why:* price lists typically mix three things ("12 classes a month, 3 months, 180 KD"). Split into package (which classes), plan (12 a month for 3 months, 180 KD) and subscription dates, a 3- or 12-month deal is just another plan on the same package, not another package.

**Prices are plain numbers; the currency is a setting.**
*Why:* one business uses one currency. Storing it once keeps prices simple and lets every label show it (`v.money`). KD is the default.
*Instead:* a currency per price — rejected as unneeded.

**Labels on class times, not separate packages.**
*Why:* "Adults — Gi" and "Adults — No Gi", or "Knee" and "Shoulder", tell people what a session is. A client of the package can attend all of them; splitting them into packages would fragment what's sold.

**Day changes keyed by (date, class time, class), not by package entry.**
*Why:* a shared class (e.g. in both "Boxing" and "All Access") is one real class in one room. Cancelling or moving it must affect every package that includes it, which keying by slot + class gives for free.

**Settings as key/value rows.**
*Why:* three values (kind, name, currency) don't need their own columns, and adding one later needs no migration. Clearing the data keeps them, since they describe the business, not the timetable.

## Behaviour

**Clashes are refused, not warned about.**
*Why:* the biggest risk is two sessions in one room or one person double-booked. The server re-checks every future date inside a transaction and rolls back any change that introduces a new clash. The browser previews the same rules so users see the problem before pressing Save.

**Only *new* clashes block a change.**
*Why:* if data ever arrives with a clash in it, unrelated edits shouldn't become impossible. The guard compares clashes before and after.

**The same class in the same class time from two packages is one shared class.**
*Why:* a "Kids & Adults" class belongs to both a kids and an adults package. That's one class two groups attend, not a double booking.

**Rotation stays (even though it adds complexity).**
*Why:* when the package form grew a week grid, the question came up whether rotations were making things too complicated. Rotating series are a real requirement (a programme alternating studio and pool, a sprint cycle, a monthly board meeting). The complexity was contained instead: "Same every week" is the default, and the grid only appears for "Different each week".

**The Schedule changes single days; Packages change every week.**
*Why:* an earlier version let a click on the Schedule edit the package ("Remove from week 1", "Change this week"). In a 1-week package, "week 1" means *every* week, so those buttons quietly rewrote the whole timetable. Now there's one clear rule: anything done on the Schedule affects that date only (drag, cancel, swap person, one-time class); weekly changes are made in Packages, whose dialog says exactly what it affects and asks before removing.

**Cancelled classes stay on the calendar, crossed out.**
*Why:* a class that silently disappears makes people think it was never there or that something broke. Crossed out with **Bring it back** is honest and reversible.

**Day changes that end up identical to the original are removed.**
*Why:* dragging a class away and back again shouldn't leave an invisible "change" behind. Normalising against the original keeps the data clean and the *Changed today* marker truthful.

**New classes inside the package form are created only on save.**
*Why:* cancelling a half-built package must leave nothing behind.

## Interface

**Plain words on screen, in the business's language.** Rooms (not areas), class times (not slots), "Starts again after N weeks" (not cycle length), **Unlimited** (not "every class"), and the kind's own words for classes, people, activities, clients and series. The users aren't technical.

**Rooms side by side, colour by activity.** The room is the hard constraint, so it gets its own lane and collisions are visible at a glance. Colour is for fast scanning. People and activities cut across rooms, so they're filters.

**Room filter placement.** With 5 rooms or fewer, pills in the header (full names fit); with more, a section in the left rail.

**12-hour AM/PM everywhere, with a custom picker.** Front desks read and say times in AM/PM. The browser's built-in time field follows the computer's 24-hour setting, so it couldn't guarantee AM/PM.

**Decluttered week view.** Only the hours in use; closed days collapse to a strip; initials when narrow; the class time's label written out ("Adults", "Knee") rather than an abbreviated badge; member count with one small icon.
*Tried and dropped:* extra rows with icons for person, time, members and rotation (too busy — the time is already on the axis), and a **Comfortable** density option (it only repeated the label, so it was removed).

**Hover guide and drag.** A line snapped to :00/:15/:30/:45 shows exactly where a click will land; dragging on empty space picks a longer time; dragging a class moves it. Its label sits above the line so it never covers it.

**Day / Week / Month.** Week for planning, Day for detail (wide blocks plus a list), Month for jumping around and spotting busy or clashing days.

**Print is type-only, one page.** Posters are often image-heavy; a text-first version can go on a noticeboard, in a messaging app or on a website. It auto-fits one A4 page so browser differences (Safari's headers and footers) don't push the last activity onto page 2. The default title follows the kind (Training Schedule, Clinic Timetable, Room Bookings).

**Koredyne theme.** Near-black greys with Koredyne blue as the accent (selection, today, the current-time line, active tab). Red is kept for warnings only: clashes, cancellations and errors, so problems still stand out. The header carries the Koredyne Schedule name and a "Powered by Koredyne" footer.
*Instead:* a red accent, which made warnings and normal highlights look the same.

## Platform

**SQLite via `node:sqlite`, one process for UI + API.** One file, zero setup, no extra dependency, one deploy and one URL. Right-sized for one business.

**Whole state on every response.** A few hundred rows; simpler and less bug-prone than partial updates.

**Shared rules module.** The browser and server import the same `schedule.js` and `vocab.js`, so previews and the server guard can never disagree, and messages use the same words on both sides.

**Railway, Node started directly.** Starting with `node` rather than `npm start` lets the stop signal reach the app so redeploys close cleanly instead of logging a crash. A private install keeps its database on a `/data` volume so it survives redeploys.

## Demos and the public link

**Demos as data through one seeder.**
*Why:* each demo is a plain description (rooms, activities, packages, sessions, members, one-offs, changes) in `server/demos/<key>.js`, and one function, `seedDemo`, turns any of them into rows. Adding a demo is writing data, not code, and every demo goes through the same path, so one test can check them all: no clashes over 12 weeks, day changes and one-offs visible, plans belong to their package. Dates are relative to the current week, so a demo always looks current.
*Instead:* a hand-written seeding function per demo — rejected, it duplicates insert logic and each one drifts. A SQL dump per demo — rejected, its dates go stale and it breaks on schema changes.

**Playground: a private in-memory copy per visitor.**
*Why:* the public link exists so anyone can try the app properly — drag, cancel, delete, switch the kind of business. With `PLAYGROUND=1`, each visitor gets their own in-memory database keyed by an `HttpOnly` cookie. Nobody sees anyone else's changes, nobody can wreck the demo for others, and nothing is stored. Copies are dropped after an hour idle, and the least recently used goes past 200 copies, so memory stays bounded.
*Instead:* one shared database — rejected, the first visitor to press **Clear all data** empties it for everyone, and visitors see each other's edits. A shared database reset on a timer — rejected, it still lets visitors collide and wipes someone's changes mid-session. Read-only demo — rejected, it can't show the clash checks, drag and day changes that matter most.

**A new database starts with the Gym demo.**
*Why:* an empty screen explains nothing. A full demo shows what the app does at once; **Restore demo** switches to the clinic or meeting rooms, and **Clear all data** starts from scratch while keeping the business settings.

## Privacy

**Made-up demo data only.** Every demo business, person, client and price is invented; members use `@example.com` emails. The public link is a playground, so visitors' edits stay private and in memory. A private install holding real client data should turn on the login (`BASIC_AUTH`).
