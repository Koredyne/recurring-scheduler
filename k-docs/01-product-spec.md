# 01 — Product spec

## 1. The problem

Many businesses run on a weekly timetable of sessions in a few rooms: a gym or studio with classes, a clinic with group sessions and treatments, a business centre that rents meeting rooms to client companies. They share the same shape: people run activities, in rooms, at set times, for clients who pay for a series of them. The timetable usually lives on a poster or a shared calendar and the subscriptions in a separate list. That causes four problems:

1. **The timetable and what clients buy are disconnected.** A member buys "Boxing Kids, 12 classes a month", a patient a "Back Care" programme, a company a weekly room booking, but nothing links that product to the actual Tuesday 5 PM session.
2. **Clashes are invisible.** Nothing stops two sessions being put in the same room at the same time, or one person being in two places at once.
3. **Some series rotate.** A programme might run a studio class one week and a pool session the next; a board meeting happens every 4 weeks. A poster can't show that, and people lose track of which week it is.
4. **Real life changes single days.** Someone is away on Thursday, a session moves room, a one-off assessment or interview is booked. Editing the whole timetable for that is wrong and risky.

## 2. Who uses it

The front desk and management of the business: people who know it well but aren't technical. The app is an internal tool, used on a laptop or desktop. Everything on screen uses plain words in the business's own language (rooms, "session times" or "meeting times", "Starts again after 3 weeks"), never system terms (areas, slots, cycle length).

## 3. Goals

- One place for the timetable, the series clients subscribe to, and who is subscribed to what.
- Rotating series that work for any date, past or future, without anyone counting weeks.
- **It must be impossible to save a clash.** A room or a person can never be double-booked.
- Day-to-day changes (cancel, move, swap person, one-off bookings) without touching the weekly plan.
- A printable timetable as good as a printed poster, text-only so it can be used anywhere.
- Fast to read at a glance: colour by activity, rooms side by side, the week fits on one screen.
- The same app for different kinds of business, each seeing its own words.

Non-goals for now: client logins, online booking, attendance, payments. See [04](04-limits-and-roadmap.md).

## 4. The ideas the app is built on

The data uses one set of names (from the first kind it supported, a gym). The screens use the business's words (4.1). Examples come from the three demos.

| On screen (gym words) | In the data | Meaning | Example |
|---|---|---|---|
| **Class** | class | An activity run by one or more people together. *What and who.* | Boxing with Marco Reyes; Board meeting with Laura Becker & Ahmed Rahim |
| **Class time** | slot | A room, a weekday and a start–end time, with a label (who or what it's for), capacity, type and cleaning buffer. *When and where.* | Studio, Sunday 5–6 PM, "Group" |
| **Room** | area | A physical space. | Ring, Mat, Studio; Treatment 1, Pool; Boardroom, Room A |
| **Package** | package | The repeating series clients subscribe to: which classes, on which weeks. Has a start week, an optional end week, and how many weeks before it starts again. | "Back Care", every 2 weeks, from 4 Oct |
| **Package entry** | package_entry | "This class, in this class time, in week N of this package". | Back Care/Omar Farouk, Studio Sun 5 PM, week 1 |
| **Plan** | package_plan | How a package is sold: classes a month (8, 12, 24, Unlimited or any number), for how many months (1, 2, 3, 6, 12 or any number), and one price for all of those months, in the business's currency. | 12 sessions a month · 3 months · 180 KD |
| **Subscription** | package_member | A client on a plan of a package, from a start date to an expiry date (inclusive). | Bluefin Legal, Client reviews, 3 months |
| **One-time class** | one_off | A class on a single date, outside any package, with the clients booked into it. | Assessment, Thu 1–2 PM, Treatment 2, Faris Khoury |
| **Day change** | session_change | One weekly class changed on one date only: cancelled, moved, or another person. | Tuesday's 4 PM Sports Massage cancelled — on leave |

Two rules hold everything together:

- **A weekly session is never stored.** For any date the app works out which week of each package's cycle it is and shows the matching entries. Viewing next year costs the same as viewing today.
- **The week number lives on the package entry, not the class.** The same class can be week 1 in one package and week 3 in another, and can run at any time in any room.

### 4.1 Words per kind of business

**Settings → Business** sets the business's name, its **kind** and its **currency** (KD by default). The kind decides the words on every screen, in every message and on the print:

| Gym or studio | Clinic | Meeting rooms |
|---|---|---|
| class | session | meeting |
| coach | practitioner | host |
| activity | service | meeting type |
| member | patient | client |
| package | programme | series |
| Print title: *Training Schedule* | *Clinic Timetable* | *Room Bookings* |

So a clinic's tabs read **Schedule, Patients, Programmes, Sessions, Rooms & times, Settings**, a plan reads "12 sessions a month · 3 months · 180 KD", and a clash reads "Practitioner Ana Ruiz double-booked". Rooms are called rooms in every kind. Changing the kind switches the words at once; the data is untouched.

The rest of this document uses the gym words.

## 5. Screens and behaviour

The top bar shows the Koredyne icon and **Koredyne Schedule**, then the business name and six tabs, ordered by how often they're used: **Schedule, Members, Packages, Classes, Rooms & times, Settings**. On the public playground a **Playground** badge sits on the right (5.9).

### 5.1 Schedule

The main screen. **It only ever changes single days.** Changing what happens every week is done in Packages; this rule exists so nobody accidentally rewrites the weekly timetable while dealing with a Tuesday.

**Views** (header, remembered between visits):

- **Week** — one column per day, Sunday → Saturday, each split into one lane per room. Time runs down the side.
- **Day** — one day with the rooms side by side and wide blocks, plus a list on the right: every class in time order with room, person, packages and member count (or the members of a one-time class).
- **Month** — every day of the month with its class count, a colour bar of the activity mix, the top activities, a clash count (⚠ N) and one-time classes by name. Click a day to open it in Day view.

**Navigation:** Today, ◀ ▶ (a day, week or month at a time) and a month picker on the left that highlights the range on screen.

**The grid:**

- Only the hours in use are shown (an hour before the first class to an hour after the last) and scaled to fit the screen, so the whole day is visible without scrolling. A red line marks *now*.
- A day with nothing on (Friday in the gym demo) shrinks to a thin striped **No classes** strip. Click it to open the day, e.g. to add a class there.
- **Class blocks** are tinted with the activity's colour and show:
  1. the activity;
  2. the person — initials (KS) when the block is narrow, the full name when there's room — and the member count with a small people icon;
  3. the label from the class time (*Adults*, *Kids (5–7)*, *Knee*, *Acme*), or *One time*, *Changed today* (amber) or *Cancelled* (red), and the rotation week (*W2/6*) for rotating packages.
  Lines drop off on short blocks. In Day view everything goes on one line: person · label · package · members · week.
- **Hover a block** for full details: date and time, room, every package sharing it, members vs. capacity, the rotation, and any clashes.
- **Hover empty space**: a guide line snaps to :00 / :15 / :30 / :45 and shows the time and room ("4:15 PM · Studio") so you know exactly where a click will land.

**Actions:**

| Action | Result |
|---|---|
| Click empty space | Add a **one-time class** starting there, 1 hour long. |
| Click and drag down on empty space | Same, with the start and end picked by the drag (15-minute snaps, live "10 AM – 12:45 PM · Room B" label). |
| Click an empty class time (when shown) | One-time class with that class time's start and end. |
| **Drag a class** | Moves it to another time, room or day **for that date only**. Snaps to 15 minutes, keeps its length, shows a preview with the new time and room. A clash is refused with a message. |
| Click a weekly class | Opens the **day dialog** (below). |
| Click a one-time class | Opens it to edit or cancel. |

**Day dialog** (a weekly class on one date):

- Says plainly that changes here are for that date only, and that weekly changes are made in the package.
- Shows the date, time, room, the packages sharing it and the member count. If it has been changed, it shows what it normally is ("Normally: Sun 11 Oct · 9–9:15 AM · Room A · Sara Khan").
- **Change it for this day:** date, room, time (12-hour picker), person (suggestions from the list, new names allowed), note. A live check says either that the room and person are free then, or lists each clash once. **Save for this day** is disabled while there's a clash or nothing has changed.
- **Cancel this day** asks for confirmation. The class stays on the calendar crossed out and marked *Cancelled*, so nobody wonders where it went; **Bring it back** restores it.
- **Undo changes** returns the class to what the package says.
- **Open package** goes to the package for weekly changes.

**One-time class form:** date, room, time, what (activity), who, optional name ("Private lesson", "Assessment", "Interview") and note, and members: search existing members or type a name to add a new member on the spot. It is clash-checked like everything else. On the calendar it has a dashed border and says *One time*. Members see their upcoming one-time classes on the Members page.

**Filters:**

- **Rooms** — with 5 or fewer rooms, pills in the header ("All rooms · Ring · Mat · Studio"); with more, a section in the left rail. Showing fewer rooms gives each column more width.
- **Packages** (left rail) — click one to highlight its classes; the rest fade.
- **Coach** — highlight one person.
- **Activities** — show only the ticked ones.
- A "N filters on · Clear all" bar and **Clear filters** in the header whenever a filter is active.
- **Display** menu: **Show empty class times** (class times no package uses that week).

**Clash banner:** if the week on screen contains any clash (for example from imported data), a banner lists them.

**+ New package** in the header opens the package builder (5.3) and jumps to the new package's first week afterwards.

**Print** (header): see 5.8.

### 5.2 Members

Search, add, rename and delete members. Each member shows a chip per package with the plan and status:

| Status | Shown as |
|---|---|
| Expiry more than 7 days away | *Until 15 Oct* |
| 1–7 days left | *3 days left* (red) |
| Expires today | *Expires today* (red) |
| Past expiry | *Expired 2 Oct* (struck through) |
| Starts in the future | *Starts 11 Oct* |
| No dates set | *No dates* |

Upcoming one-time classes show as dashed **1×** chips; click to open. **+ Add** subscribes the member to another package on its first plan, from today for as many months as the plan lasts.

### 5.3 Packages

**New package** — a four-step form, created in a single request so a package is never left half-made:

1. **Name.** Suggested from what you tick.
2. **Classes.** Every class on the timetable, grouped across days ("Clinical Pilates · Beginners · Hannah · 9 AM · Mon Wed"). Tick a whole row or single days; filter by activity; search by activity, label, person, time or day. When some class times are labelled for kids, quick buttons add every kids or every adult class at once.
   - **Same every week** or **Different each week**. For a rotation, "Starts again after [−] N [+] weeks" (2–12) and a grid appears: classes down the side, W1…WN across the top. Tick cells, click a class name to toggle its row, click a week to toggle its column. The numbers under each week are how many classes it has.
   - **+ Add a new class** creates a class that isn't on the timetable yet, right here: what, who, who it's for, days, time and room ("Any free room" picks the first room with nothing on). **Different time on some days?** gives each day its own times. New classes are marked *New* and only created when the package is saved, so cancelling leaves nothing behind.
3. **Plans.** Classes a month (dropdown: 8, 12, 24, **Unlimited**, or **Custom…** to type any number), for how many months (dropdown: 1, 2, 3, 6, 12 or **Custom…**), and the price in the business's currency for the whole length. The pencil / list button next to each dropdown toggles between the list and typing a number. More than one plan allowed.
4. **Start.** This week by default; for a rotation, the start week is week 1.

**Viewing a package:** **View** in the package page header opens it in a window laid out like the builder's four steps, read-only: name, the classes it includes with their days (or the classes × weeks grid for a rotation, with this week highlighted), plans with how many members are on each, and the weeks it runs. **Edit** turns the same window into the builder, filled in, plus an optional last week; **Save changes** saves it all at once and is refused if it would create a clash. Plans keep their subscribers when edited; removing a plan leaves its members subscribed with no plan.

**Package page:**

- Name, starts, ends (optional, "last week"), repeats (same every week / every N weeks). Saving is blocked if the change would create a clash anywhere in the future.
- **Add or remove classes** (the same picker, all weeks at once).
- **Plans** with how many members are on each.
- **Members** with plan and status; subscribe, change plan or dates, remove. Subscribing picks **how long** first (only the lengths the package is sold for, e.g. 1 month · 3 months), then a **plan** of that length from a dropdown ("12 sessions a month · 65 KD"). The expiry follows the start date and length, and can still be changed by hand.
- **Calendar** of the package's weeks, with other packages shown faded around it. Clicking here edits **the package** (every week, or that rotation week): the dialog says exactly what it affects, and **Remove from package** asks first.
- **Replace from a date** (handover): when the timetable changes, ends this package the week before and starts a new version from the chosen week, optionally with the same classes. Members and history stay on the old one.
- **Delete.**

### 5.4 Classes

Every class — an activity and its people — and where it's used. Each person has their own dropdown; **+ Add coach** (+ Add practitioner, + Add host) under them adds another person who runs the class with them, **×** removes one (a class keeps at least one). The first is the main person. Two classes can't have the same activity and the same people. Adding someone who is busy elsewhere at one of the class's times is refused, like any clash. A class in use can't be deleted. A class with several people shows them all ("Laura Becker & Ahmed Rahim", initials "LB+AR" on narrow blocks), the person filter finds it under each of them, and typing "Laura Becker & Ahmed Rahim" in a person field (one-time class, day change, new class) means both.

### 5.5 Rooms & times

Room tabs with rename and **+ Room**. A week grid of that room's class times: click to add a 1-hour class time, drag to set an exact length (15-minute snaps). Click one to edit times, label, capacity, type (group, private, trial), cleaning buffer, on/off, or delete. Solid = used by a package, dashed = unused, faded = switched off. Switching off a used class time shows packages a visible **gap** rather than silently dropping the class.

### 5.6 Settings

- **Business:** name, kind (Gym or studio, Clinic, Meeting rooms, with the words it uses listed underneath) and currency.
- People, activities (with colour), rooms and members, renamed inline. Anything in use can't be deleted (deleting a member removes their subscriptions).
- **Data**, kept here so it can't be clicked by accident:
  - **Download all data** as one JSON file.
  - **Restore demo**: replace everything with the Gym, Clinic or Meeting rooms demo (section 7). The demo's business settings come with it, so the words switch to match. Confirmed first.
  - **Clear all data**: start from scratch. The business settings are kept. Confirmed first.

### 5.7 Times and dates

- All times are shown and entered in **12-hour AM/PM**: an hour, minutes (5-minute steps) and an AM/PM toggle. Changing a start time keeps the class length.
- The week starts on **Sunday**. Package starts and ends are always Sundays (a week picker makes any other date impossible to choose).

### 5.8 Printed timetable

**Print** in the Schedule header opens a small panel: title (default from the kind: "Training Schedule", "Clinic Timetable" or "Room Bookings"), the line under it (default "Week of 4 Oct – 10 Oct"), a **Show coaches** switch (in the business's word), and **Print or save PDF**.

The print is text-only, in the spirit of a poster but without imagery, so it works for a noticeboard, a messaging app or a website:

- A heavy title and the week on the right.
- One table per activity with a band in the activity's colour: the activity name, then the days.
- Rows are start times; columns are the days that have classes, **Saturday first**; days with nothing on are left out.
- Each cell says who it's for in capitals — ADULTS, KIDS (5–7), KNEE, ACME — or "—". With the people switch on, the person is printed small underneath.
- It follows the week on screen and the room and activity filters. Cancelled classes are left out; changed classes print where they actually happen.
- It always fits **one A4 page**: before printing, the sheet measures itself and scales down just enough, leaving room for browser headers and footers.

### 5.9 Playground

The public link runs in **playground mode**: every visitor gets their own private copy of the demo, so they can drag, cancel, delete, switch the kind of business or load another demo without anyone else seeing it. The header shows a **Playground** badge; its tooltip explains that the copy is private and resets after an hour away. Copies are kept in memory only.

A private install runs without playground mode: everyone shares one database, optionally behind a login.

## 6. Rules the app guarantees

1. No room is ever double-booked, counting each class time's cleaning buffer.
2. No person is ever in two places at once — including each person of a class with several.
3. These are checked on every save, on the server, across every future date the current packages can produce. A change that would introduce a clash is refused with a message naming it, in the business's words.
4. The same class in the same class time from several packages (e.g. a "Kids & Adults" class in both a kids and an adults package) is one shared class, not a clash.
5. Back-to-back classes (one ends at 5:00, the next starts at 5:00) are fine.
6. Cancelled classes and switched-off class times never count as clashes.
7. Changes made from the Schedule affect one date only. Weekly changes are only made from Packages.

## 7. Demo data and privacy

Three made-up demos show the three kinds of business. Each sets its own name, kind and currency (KD). A new database starts with the Gym demo; **Settings → Restore demo** loads any of them.

| Demo | Business | What it shows |
|---|---|---|
| **Gym** | Harbor Combat Club | A combat-sports gym open Saturday–Thursday: 10 disciplines, kids and adults classes, 17 packages including all-access ones, 25 plans (monthly and a 3-month deal), 3 rooms, 109 class times, 26 members, a private lesson and a cancelled class. |
| **Clinic** | Cedar Physio Clinic | A physio clinic with treatment rooms, a studio and a pool: a Back Care programme that rotates studio and pool every 2 weeks, a Post-natal programme that hands over to Stage 2 after 6 weeks, multi-month plans, one-off assessments, a cancellation and a cover by another practitioner. |
| **Meeting rooms** | Northgate Business Centre | A business centre renting rooms to client companies: a daily standup, a fortnightly sprint cycle, a board meeting every 4 weeks with two hosts, a first-aid course handing over to fire safety, room-hire plans, one-off bookings, a room move and a cancellation. |

The businesses, people, clients and prices are all invented, and members use `@example.com` emails. The public playground keeps each visitor's changes private and in memory. A private install with real client data should set a login (`BASIC_AUTH`).
