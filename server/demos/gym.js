// "Gym demo": a made-up combat-sports gym (Saturday–Thursday, Friday off). The gym, coaches, members
// and prices are all invented. Every class is an hour long and every package is a 1-week cycle,
// since the timetable repeats weekly.

const SAT = 6, SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4;
const ALL = [SAT, SUN, MON, TUE, WED, THU];
const SMW = [SAT, MON, WED];
const STT = [SUN, TUE, THU];

// The gym has three areas. Each row below names the area a class prefers; when that one is taken
// at the same time, the class moves to a free one (the timetable never runs more than 3 at once).
const AREAS = ['Ring', 'Mat', 'Studio'];

const ACTIVITIES = {
  Boxing: '#66a3f2',
  BJJ: '#5b7cfa',
  MMA: '#4cc38a',
  Kickboxing: '#f2994a',
  'Muay Thai': '#e879a6',
  Sambo: '#38bdb3',
  Judo: '#5fa8e8',
  Taekwondo: '#d4b53c',
  Wrestling: '#b8977a',
  Kyokushin: '#8f86e0',
};

// Packages: what members can attend, and the plans each is sold on as
// [classes per month (null = all classes), price in KD, optional plan name, months (default 1)].
const PACKAGES = [
  ['Boxing', [[12, 45], [null, 70]]],
  ['Boxing Kids', [[8, 35], [12, 45]]],
  ['MMA', [[12, 50], [null, 75]]],
  ['MMA Kids', [[8, 35], [12, 45]]],
  ['BJJ Gi', [[12, 50]]],
  ['BJJ Unlimited', [[null, 70]]],
  ['BJJ Kids', [[8, 35], [12, 45]]],
  ['Kickboxing', [[12, 45], [null, 65]]],
  ['Kickboxing Kids', [[8, 35]]],
  ['Muay Thai', [[12, 45], [null, 65]]],
  ['Kyokushin', [[8, 35]]],
  ['Sambo', [[12, 40]]],
  ['Wrestling', [[12, 40]]],
  ['Judo', [[12, 40]]],
  ['Taekwondo', [[8, 35]]],
  // All-access: every adult session / every kids session (added automatically below).
  ['All Access', [[null, 110], [null, 300, null, 3]]],
  ['All Access Kids', [[null, 80]]],
];

// [package(s), activity, coach, preferred area, days, start, label]
// A session listed under several packages is shared by them (e.g. Gi classes are in both adult BJJ packages).
const SCHEDULE = [
  ['Boxing', 'Boxing', 'Marco Reyes', 'Ring', STT, '09:00', 'Adults'],
  ['Boxing', 'Boxing', 'Marco Reyes', 'Ring', SMW, '10:00', 'Women'],
  ['Boxing', 'Boxing', 'Marco Reyes', 'Ring', ALL, '11:00', 'Adults'],
  ['Boxing Kids', 'Boxing', 'Sam Ortiz', 'Ring', STT, '16:00', 'Kids'],
  ['Boxing Kids', 'Boxing', 'Leo Park', 'Ring', SMW, '16:00', 'Kids'],
  ['Boxing Kids', 'Boxing', 'Sam Ortiz', 'Ring', ALL, '17:00', 'Kids (10–14)'],
  ['Boxing', 'Boxing', 'Marco Reyes', 'Ring', ALL, '18:00', 'Adults'],
  ['Boxing', 'Boxing', 'Sam Ortiz', 'Ring', ALL, '19:00', 'Adults'],
  ['Boxing', 'Boxing', 'Leo Park', 'Ring', ALL, '20:00', 'Adults'],

  ['BJJ Kids', 'BJJ', 'Nadia Haddad', 'Mat', STT, '16:30', 'Kids — Gi'],
  ['BJJ Kids', 'BJJ', 'Nadia Haddad', 'Mat', SMW, '16:00', 'Kids — No Gi'],
  [['BJJ Gi', 'BJJ Unlimited'], 'BJJ', 'Nadia Haddad', 'Mat', SMW, '18:00', 'Adults — Gi'],
  ['BJJ Unlimited', 'BJJ', 'Nadia Haddad', 'Mat', STT, '18:00', 'Adults — No Gi'],
  ['BJJ Unlimited', 'BJJ', 'Nadia Haddad', 'Mat', [SAT], '12:00', 'Open Mat'],

  ['MMA', 'MMA', 'Dan Mercer', 'Mat', STT, '12:00', 'Fundamentals'],
  ['MMA Kids', 'MMA', 'Dan Mercer', 'Mat', SMW, '15:00', 'Kids (6–9)'],
  ['MMA Kids', 'MMA', 'Dan Mercer', 'Mat', SMW, '17:00', 'Kids (10–14)'],
  ['MMA', 'MMA', 'Dan Mercer', 'Mat', ALL, '20:00', 'Adults'],

  ['Kickboxing Kids', 'Kickboxing', 'Tariq Nasser', 'Studio', STT, '17:00', 'Kids'],
  ['Kickboxing', 'Kickboxing', 'Dan Mercer', 'Studio', STT, '19:00', 'Adults'],
  ['Kickboxing', 'Kickboxing', 'Tariq Nasser', 'Studio', SMW, '19:00', 'Adults'],

  ['Muay Thai', 'Muay Thai', 'Mai Tran', 'Studio', STT, '10:00', 'Adults'],
  ['Muay Thai', 'Muay Thai', 'Mai Tran', 'Studio', STT, '20:00', 'Adults'],
  ['Muay Thai', 'Muay Thai', 'Mai Tran', 'Studio', SMW, '21:00', 'Advanced'],

  ['Sambo', 'Sambo', 'Ivan Petrov', 'Mat', STT, '15:00', 'Kids'],
  ['Sambo', 'Sambo', 'Ivan Petrov', 'Mat', STT, '19:00', 'Adults'],

  ['Judo', 'Judo', 'Kenji Mori', 'Studio', STT, '15:30', 'Kids'],
  ['Judo', 'Judo', 'Kenji Mori', 'Studio', SMW, '18:00', 'Adults'],

  ['Taekwondo', 'Taekwondo', 'Min-jun Lee', 'Studio', SMW, '17:00', 'Kids & Adults'],

  ['Wrestling', 'Wrestling', 'Ivan Petrov', 'Mat', SMW, '21:00', 'Adults'],

  ['Kyokushin', 'Kyokushin', 'Yuki Sato', 'Studio', STT, '18:00', 'Kids & Adults'],
];

// Made-up members. Each subscription: [package, plan index, start (days from today), length in months]
const MEMBERS = [
  ['Adam Clarke', [['Boxing', 0, -20, 1]]],
  ['Bilal Hassan', [['Boxing', 0, -27, 1]]],
  ['Chris Novak', [['Boxing', 1, -12, 1]]],
  ['Daniel Kim', [['Boxing Kids', 0, -10, 1]]],
  ['Elias Kim', [['Boxing Kids', 0, -10, 1]]],
  ['Felix Moreau', [['Boxing Kids', 1, -3, 1]]],
  ['Grace Lin', [['BJJ Gi', 0, -29, 1]]],
  ['Hugo Silva', [['BJJ Unlimited', 0, -5, 1], ['Wrestling', 0, -5, 1]]],
  ['Isla Morgan', [['BJJ Unlimited', 0, -14, 1]]],
  ['Jonas Weber', [['Kickboxing', 0, -12, 1]]],
  ['Kara Singh', [['Kickboxing', 1, -2, 1]]],
  ['Liam Doyle', [['Kickboxing Kids', 0, -15, 1]]],
  ['Maya Patel', [['Muay Thai', 0, -8, 1]]],
  ['Nico Rossi', [['Muay Thai', 1, -24, 1]]],
  ['Owen Brooks', [['MMA', 0, -25, 1]]],
  ['Priya Nair', [['MMA', 1, -4, 1]]],
  ['Quinn Taylor', [['MMA Kids', 0, -18, 1]]],
  ['Rami Aziz', [['Kyokushin', 0, -6, 1]]],
  ['Sofia Costa', [['Kyokushin', 0, 5, 1]]],
  ['Tom Becker', [['Sambo', 0, -14, 1]]],
  ['Uma Rao', [['Wrestling', 0, -26, 1]]],
  ['Vera Ivanova', [['Judo', 0, -9, 1]]],
  ['Will Turner', [['Taekwondo', 0, -11, 1]]],
  ['Xavier Dubois', [['All Access', 0, -16, 1]]],
  ['Yara Haddad', [['All Access', 1, -35, 3]]],
  ['Zoe Martin', [['All Access Kids', 0, -7, 1]]],
];

const addHour = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// All-access packages cover everything: kids sessions go to All Access Kids, adult sessions to All Access.
const allAccess = (label) => [!/kids/i.test(label) || /adults/i.test(label) ? 'All Access' : null, /kids/i.test(label) ? 'All Access Kids' : null].filter(Boolean);

// Expand every row into one session per day, then give each a free area, earliest start first.
function placeSessions() {
  const sessions = SCHEDULE.flatMap(([pkgs, act, who, prefer, days, start, label]) =>
    days.map((day) => ({ packages: [...[pkgs].flat(), ...allAccess(label)], activity: act, coach: who, prefer, days: [day], start, end: addHour(start), label })),
  ).sort((a, b) => a.days[0] - b.days[0] || a.start.localeCompare(b.start));
  const busyUntil = {}; // `${day}:${area}` -> end time of the last class placed there
  return sessions.map(({ prefer, ...s }) => {
    const free = (a) => (busyUntil[`${s.days[0]}:${a}`] ?? '') <= s.start;
    const where = free(prefer) ? prefer : AREAS.find(free);
    if (!where) throw new Error(`No free area for ${s.label} on day ${s.days[0]} at ${s.start}`);
    busyUntil[`${s.days[0]}:${where}`] = s.end;
    return { ...s, area: where };
  });
}

export const gym = {
  settings: { kind: 'gym', name: 'Harbor Combat Club', currency: 'KD' },
  areas: AREAS,
  activities: ACTIVITIES,
  packages: PACKAGES.map(([name, plans]) => ({ name, plans })),
  sessions: placeSessions(),
  members: MEMBERS,
  oneOffs: [
    { week: 0, day: THU, area: 'Ring', activity: 'Boxing', coach: 'Marco Reyes', start: '14:00', end: '15:00', label: 'Private lesson', members: ['Adam Clarke'] },
  ],
  changes: [{ week: 1, day: TUE, start: '10:00', activity: 'Muay Thai', cancelled: true, note: 'Coach away' }],
};
