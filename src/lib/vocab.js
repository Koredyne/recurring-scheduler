// The words on screen depend on the kind of business. The engine is the same everywhere: people
// (coaches) run activities in rooms, repeating series (packages) place them on the timetable, and
// clients (members) subscribe to a series. Only the vocabulary changes.
//
// Every kind lists [singular, plural] for the same keys, named after the gym words:
//   v.class / v.classes / v.Class / v.Classes, likewise activity, coach, member, package.
//   v.n(3, 'class') → "3 classes"; v.a('class') → "a class" / "an appointment"; v.money(45) → "45 KD".

export const KINDS = {
  gym: {
    label: 'Gym or studio',
    words: {
      activity: ['activity', 'activities'],
      coach: ['coach', 'coaches'],
      class: ['class', 'classes'],
      member: ['member', 'members'],
      package: ['package', 'packages'],
    },
    printTitle: 'Training Schedule',
    example: { activity: 'Boxing', coach: 'Marco', package: 'Boxing Kids', label: 'Kids', oneOff: 'Private lesson' },
  },
  clinic: {
    label: 'Clinic',
    words: {
      activity: ['service', 'services'],
      coach: ['practitioner', 'practitioners'],
      class: ['session', 'sessions'],
      member: ['patient', 'patients'],
      package: ['programme', 'programmes'],
    },
    printTitle: 'Clinic Timetable',
    example: { activity: 'Physiotherapy', coach: 'Dr Haddad', package: 'Back Care', label: 'Group', oneOff: 'Assessment' },
  },
  office: {
    label: 'Meeting rooms',
    words: {
      activity: ['meeting type', 'meeting types'],
      coach: ['host', 'hosts'],
      class: ['meeting', 'meetings'],
      member: ['client', 'clients'],
      package: ['series', 'series'],
    },
    printTitle: 'Room Bookings',
    example: { activity: 'Workshop', coach: 'Sara', package: 'Weekly planning', label: 'Internal', oneOff: 'Interview' },
  },
};

export const DEFAULT_SETTINGS = { kind: 'gym', name: '', currency: 'KD' };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function vocabFor(settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const kind = KINDS[s.kind] ? s.kind : 'gym';
  const def = KINDS[kind];
  const v = {
    kind,
    kindLabel: def.label,
    name: s.name || '',
    currency: s.currency || 'KD',
    printTitle: def.printTitle,
    example: def.example,
  };
  for (const [key, [one, many]] of Object.entries(def.words)) {
    const plural = KINDS.gym.words[key][1]; // property names follow the gym words: v.classes, v.Coaches…
    v[key] = one;
    v[plural] = many;
    v[cap(key)] = cap(one);
    v[cap(plural)] = cap(many);
  }
  v.oneOff = `one-time ${v.class}`;
  v.OneOff = `One-time ${v.class}`;
  v.n = (count, key) => `${count} ${Number(count) === 1 ? def.words[key][0] : def.words[key][1]}`;
  v.a = (key) => `${/^[aeiou]/i.test(def.words[key][0]) ? 'an' : 'a'} ${def.words[key][0]}`;
  v.money = (n) => `${Number(n) % 1 ? Number(n).toFixed(1) : Number(n)} ${v.currency}`;
  return v;
}

// The vocabulary when nothing is set: a gym priced in KD. Shared helpers default to it.
export const GYM = vocabFor();
