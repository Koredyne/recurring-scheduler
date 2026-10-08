# Koredyne Schedule — Specs

The complete specification of Koredyne Schedule: what it does, how it works, and why it was built this way.

- **Live (playground):** https://recurring-scheduler-production.up.railway.app
- **Code:** https://github.com/Koredyne/recurring-scheduler
- **Written:** 8 Oct 2026, describing the app as it is that day.

| Document | What's in it |
|---|---|
| [01 — Product spec](01-product-spec.md) | The problem, who it's for, the ideas the app is built on, the words per kind of business, and every screen and behaviour in detail. |
| [02 — Technical spec](02-technical-spec.md) | Architecture, data model, the vocabulary layer, the rotation engine, day changes, clash detection, API, front end, printing, demos, playground mode, deployment and testing. |
| [03 — Decisions](03-decisions.md) | Every significant design decision, with the reason and the alternatives that were rejected. |
| [04 — Limits and roadmap](04-limits-and-roadmap.md) | What the app deliberately doesn't do yet, known gaps, and sensible next steps. |

`docs/TECHNICAL.md` in the repo is the running developer reference; these documents are the full write-up of the product as a whole.

## In one paragraph

Koredyne Schedule runs the weekly timetable of any business that books sessions into rooms: a gym or studio, a clinic, a business centre with meeting rooms. People run activities (a class is an activity with its people), and each class is placed into class times (a room, a weekday and a time) through **repeating series**: the things clients subscribe to, such as "Boxing Kids", a "Back Care" programme or a client's "Daily standup". A series can repeat the same classes every week or **rotate** over several weeks (a studio class in week 1 and a pool session in week 2; a board meeting every 4 weeks). The **Schedule** shows any day, week or month, and only ever changes single days: drag a class to move it, cancel it for one date, swap the person, or add a one-time booking with its clients. Weekly changes happen in the series itself. Every change is checked so a room or a person is never double-booked, and the week can be printed as a clean A4 timetable. The words on screen follow the kind of business (class / session / meeting, coach / practitioner / host), and three made-up demos show each kind. The public link is a playground: every visitor gets a private copy to try.
