// "Meeting rooms demo": a made-up business centre that rents rooms to client companies, Sunday–Thursday.
// Everything is invented. Shows daily, fortnightly and every-4-weeks series, co-hosted meetings,
// a course that hands over to the next one, room-hire plans, one-off bookings and day changes.

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4;
const WEEKDAYS = [SUN, MON, TUE, WED, THU];

export const office = {
  settings: { kind: 'office', name: 'Northgate Business Centre', currency: 'KD' },
  areas: ['Boardroom', 'Room A', 'Room B', 'Training Suite'],
  activities: {
    Standup: '#4cc38a',
    Planning: '#5b7cfa',
    Retrospective: '#8f86e0',
    'Client review': '#f2994a',
    'Board meeting': '#e5484d',
    Training: '#38bdb3',
    Interview: '#d4b53c',
  },
  packages: [
    { name: 'Acme — Daily standup', plans: [[20, 150]] },
    { name: 'Acme — Sprint cycle', cycle: 2, plans: [[null, 300]] },
    { name: 'Bluefin Legal — Client reviews', plans: [[12, 240], [12, 650, null, 3]] },
    { name: 'Northgate — Board meeting', cycle: 4, plans: [[null, 400, 'Quarterly', 3]] },
    { name: 'First-aid course', weeks: 4, plans: [[8, 120]] },
    { name: 'Fire-safety course', start: 4, weeks: 4, plans: [[8, 120]] },
    { name: 'Orbit Analytics — Hiring', plans: [[8, 200]] },
  ],
  sessions: [
    { packages: ['Acme — Daily standup'], activity: 'Standup', coach: 'Sara Khan', area: 'Room A', days: WEEKDAYS, start: '09:00', end: '09:15', label: 'Acme', capacity: 8 },

    // Every other week: planning on Sunday in week 1, a retrospective on Wednesday in week 2.
    { packages: ['Acme — Sprint cycle'], activity: 'Planning', coach: 'Sara Khan', area: 'Training Suite', days: [SUN], start: '10:00', end: '12:00', label: 'Acme', week: 1, capacity: 12 },
    { packages: ['Acme — Sprint cycle'], activity: 'Retrospective', coach: 'Sara Khan', area: 'Room A', days: [WED], start: '14:00', end: '15:30', label: 'Acme', week: 2, capacity: 12 },

    { packages: ['Bluefin Legal — Client reviews'], activity: 'Client review', coach: 'James Holt', area: 'Room B', days: [MON, WED], start: '10:00', end: '11:00', label: 'Bluefin', capacity: 6 },
    { packages: ['Bluefin Legal — Client reviews'], activity: 'Client review', coach: 'James Holt', area: 'Room B', days: [THU], start: '15:00', end: '16:00', label: 'Bluefin', capacity: 6 },

    // Once every 4 weeks, co-hosted.
    { packages: ['Northgate — Board meeting'], activity: 'Board meeting', coach: 'Laura Becker & Ahmed Rahim', area: 'Boardroom', days: [TUE], start: '13:00', end: '16:00', label: 'Board', week: 1, capacity: 14 },

    // The first-aid course runs 4 weeks, then fire safety takes over the same times.
    { packages: ['First-aid course'], activity: 'Training', coach: 'Tom Price', area: 'Training Suite', days: [MON, THU], start: '14:00', end: '17:00', label: 'First aid', capacity: 16 },
    { packages: ['Fire-safety course'], activity: 'Training', coach: 'Tom Price', area: 'Training Suite', days: [MON, THU], start: '14:00', end: '17:00', label: 'Fire safety', capacity: 16 },

    { packages: ['Orbit Analytics — Hiring'], activity: 'Interview', coach: 'Mei Chen', area: 'Room B', days: [TUE], start: '09:00', end: '12:00', label: 'Orbit', capacity: 4 },
    { packages: ['Orbit Analytics — Hiring'], activity: 'Interview', coach: 'Mei Chen', area: 'Room B', days: [SUN], start: '13:00', end: '15:00', label: 'Orbit', capacity: 4 },
  ],
  members: [
    ['Acme Ltd', [['Acme — Daily standup', 0, -14, 1], ['Acme — Sprint cycle', 0, -14, 1]]],
    ['Bluefin Legal', [['Bluefin Legal — Client reviews', 1, -30, 3]]],
    ['Orbit Analytics', [['Orbit Analytics — Hiring', 0, -6, 1]]],
    ['Northgate Board', [['Northgate — Board meeting', 0, -45, 3]]],
    ['Cobalt Design', [['First-aid course', 0, -2, 1]]],
    ['Delta Logistics', [['First-aid course', 0, -2, 1], ['Fire-safety course', 0, 26, 1]]],
    ['Nina Ford', [['First-aid course', 0, -1, 1]]],
    ['Sam Lee', [['Fire-safety course', 0, 26, 1]]],
  ],
  oneOffs: [
    { week: 0, day: WED, area: 'Room A', activity: 'Interview', coach: 'Mei Chen', start: '11:00', end: '12:00', label: 'Orbit — final round', members: ['Orbit Analytics'] },
    { week: 1, day: MON, area: 'Boardroom', activity: 'Client review', coach: 'James Holt', start: '13:00', end: '14:00', label: 'Pitch', members: ['Cobalt Design'] },
  ],
  changes: [
    { week: 1, day: SUN, start: '09:00', activity: 'Standup', area: 'Room B', note: 'Room A being redecorated' },
    { week: 1, day: WED, start: '10:00', activity: 'Client review', cancelled: true, note: 'Public holiday' },
  ],
};
