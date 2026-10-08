// "Clinic demo": a made-up physio clinic, Sunday–Thursday plus Saturday mornings. Everything is invented.
// Shows a 2-week rotation (Back Care alternates studio and pool), a programme that hands over to its
// second stage after 6 weeks, multi-length plans, one-off assessments and day changes.

const SAT = 6, SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4;
const WEEKDAYS = [SUN, MON, TUE, WED, THU];

export const clinic = {
  settings: { kind: 'clinic', name: 'Cedar Physio Clinic', currency: 'KD' },
  areas: ['Treatment 1', 'Treatment 2', 'Studio', 'Pool'],
  activities: {
    Physiotherapy: '#5b7cfa',
    'Sports Massage': '#e879a6',
    'Clinical Pilates': '#4cc38a',
    Hydrotherapy: '#38bdb3',
    'Back Care': '#f2994a',
    'Post-natal': '#d4b53c',
  },
  packages: [
    { name: 'Back Care', cycle: 2, plans: [[8, 60], [null, 90]] },
    { name: 'Clinical Pilates', plans: [[8, 50], [12, 65], [12, 180, null, 3]] },
    { name: 'Sports Injury Rehab', plans: [[8, 80], [12, 110]] },
    { name: 'Post-natal Recovery', weeks: 6, plans: [[8, 55]] },
    { name: 'Post-natal Recovery — Stage 2', start: 6, plans: [[8, 55]] },
    { name: 'Sports Massage', plans: [[4, 60], [8, 110]] },
    { name: 'Hydrotherapy', plans: [[8, 70]] },
  ],
  sessions: [
    // Back Care rotates: week 1 is a studio class, week 2 the same time in the pool.
    { packages: ['Back Care'], activity: 'Back Care', coach: 'Omar Farouk', area: 'Studio', days: [SUN, TUE], start: '17:00', end: '18:00', label: 'Group', week: 1 },
    { packages: ['Back Care'], activity: 'Hydrotherapy', coach: 'Ana Ruiz', area: 'Pool', days: [SUN, TUE], start: '17:00', end: '17:45', label: 'Back Care', week: 2 },

    { packages: ['Clinical Pilates'], activity: 'Clinical Pilates', coach: 'Hannah Weiss', area: 'Studio', days: [MON, WED], start: '09:00', end: '10:00', label: 'Beginners', capacity: 8 },
    { packages: ['Clinical Pilates'], activity: 'Clinical Pilates', coach: 'Hannah Weiss', area: 'Studio', days: [MON, WED], start: '18:00', end: '19:00', label: 'Intermediate', capacity: 8 },
    { packages: ['Clinical Pilates'], activity: 'Clinical Pilates', coach: 'Hannah Weiss', area: 'Studio', days: [SAT], start: '10:00', end: '11:00', label: 'Mixed', capacity: 8 },

    { packages: ['Sports Injury Rehab'], activity: 'Physiotherapy', coach: 'Dr Leila Haddad', area: 'Treatment 1', days: [SUN, TUE, THU], start: '10:00', end: '11:00', label: 'Knee', capacity: 4 },
    { packages: ['Sports Injury Rehab'], activity: 'Physiotherapy', coach: 'Dr Leila Haddad', area: 'Treatment 1', days: [SUN, TUE, THU], start: '11:00', end: '12:00', label: 'Shoulder', capacity: 4 },
    { packages: ['Sports Injury Rehab'], activity: 'Physiotherapy', coach: 'Omar Farouk', area: 'Treatment 1', days: [MON, WED], start: '15:00', end: '16:00', label: 'Return to sport', capacity: 4 },

    // Post-natal runs 6 weeks, then Stage 2 takes over the same studio times and adds a pool session.
    { packages: ['Post-natal Recovery'], activity: 'Post-natal', coach: 'Priya Menon', area: 'Studio', days: [MON, WED], start: '11:00', end: '12:00', label: 'Stage 1', capacity: 10 },
    { packages: ['Post-natal Recovery — Stage 2'], activity: 'Post-natal', coach: 'Priya Menon', area: 'Studio', days: [MON, WED], start: '11:00', end: '12:00', label: 'Stage 2', capacity: 10 },
    { packages: ['Post-natal Recovery — Stage 2'], activity: 'Hydrotherapy', coach: 'Ana Ruiz', area: 'Pool', days: [THU], start: '11:00', end: '11:45', label: 'Post-natal', capacity: 10 },

    { packages: ['Sports Massage'], activity: 'Sports Massage', coach: 'Ken Ito', area: 'Treatment 2', days: WEEKDAYS, start: '16:00', end: '17:00', label: 'Recovery', capacity: 1 },
    { packages: ['Sports Massage'], activity: 'Sports Massage', coach: 'Ken Ito', area: 'Treatment 2', days: WEEKDAYS, start: '19:00', end: '20:00', label: 'Recovery', capacity: 1 },

    { packages: ['Hydrotherapy'], activity: 'Hydrotherapy', coach: 'Ana Ruiz', area: 'Pool', days: [SUN, TUE, THU], start: '09:00', end: '09:45', label: 'Morning', capacity: 6 },
    { packages: ['Hydrotherapy'], activity: 'Hydrotherapy', coach: 'Ana Ruiz', area: 'Pool', days: [MON, WED], start: '16:00', end: '16:45', label: 'Afternoon', capacity: 6 },
  ],
  members: [
    ['Alia Mansour', [['Back Care', 0, -12, 1]]],
    ['Ben Carter', [['Back Care', 1, -20, 1]]],
    ['Chloe Dupont', [['Clinical Pilates', 0, -8, 1]]],
    ['David Osei', [['Clinical Pilates', 2, -40, 3]]],
    ['Elena Petrova', [['Clinical Pilates', 1, -3, 1]]],
    ['Faris Khoury', [['Sports Injury Rehab', 0, -15, 1]]],
    ['Gina Moretti', [['Sports Injury Rehab', 1, -26, 1]]],
    ['Hassan Ali', [['Sports Injury Rehab', 0, -5, 1], ['Sports Massage', 0, -5, 1]]],
    ['Ines Ferreira', [['Post-natal Recovery', 0, -10, 2]]],
    ['Julia Novak', [['Post-natal Recovery', 0, -4, 2]]],
    ['Kemal Aydin', [['Sports Massage', 1, -18, 1]]],
    ['Lina Sato', [['Hydrotherapy', 0, -22, 1]]],
    ['Marta Lopez', [['Hydrotherapy', 0, 4, 1]]],
    ['Noah Fischer', [['Back Care', 0, -28, 1]]],
  ],
  oneOffs: [
    { week: 0, day: THU, area: 'Treatment 2', activity: 'Physiotherapy', coach: 'Dr Leila Haddad', start: '13:00', end: '14:00', label: 'Assessment', members: ['Faris Khoury'] },
    { week: 1, day: SUN, area: 'Treatment 2', activity: 'Physiotherapy', coach: 'Omar Farouk', start: '13:30', end: '14:15', label: 'Assessment', members: ['Noah Fischer'] },
  ],
  changes: [
    { week: 1, day: TUE, start: '16:00', activity: 'Sports Massage', cancelled: true, note: 'Ken on leave' },
    { week: 1, day: MON, start: '18:00', activity: 'Clinical Pilates', coach: 'Priya Menon', note: 'Cover for Hannah' },
  ],
};
