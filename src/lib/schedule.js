import { addDays, clockRange, daysBetween, fmtDate, maxDate, toMin, weekday, weekStart } from './dates.js';
import { GYM } from './vocab.js';

export function indexState(state) {
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  return {
    areas: byId(state.areas),
    slots: byId(state.slots),
    classes: byId(state.classes),
    packages: byId(state.packages),
    // Day changes by the class they change ("date:slot:class"), and those moved onto another date by that date.
    changes: new Map((state.changes || []).map((c) => [changeKey(c.date, c.slot_id, c.class_id), c])),
    movedIn: (state.changes || []).reduce((m, c) => (c.new_date ? m.set(c.new_date, [...(m.get(c.new_date) || []), c]) : m), new Map()),
  };
}

const changeKey = (date, slotId, classId) => `${date}:${slotId}:${classId}`;

// end_date is exclusive: the first day the package no longer runs.
// That lets an old end date and a new anchor be the same date (back-to-back handover).
export function packageStatus(pkg, date) {
  if (date < pkg.anchor_date) return 'upcoming';
  if (pkg.end_date && date >= pkg.end_date) return 'ended';
  return 'active';
}

// weeks_since_anchor = floor((date - anchor) / 7); position = weeks mod cycle (1-based here)
export function cyclePosition(pkg, date) {
  if (packageStatus(pkg, date) !== 'active') return null;
  const weeks = Math.floor(daysBetween(pkg.anchor_date, date) / 7);
  return (weeks % Number(pkg.cycle_length)) + 1;
}

// Every package entry that lands on a date, as the packages have it (no day changes).
function packageSessions(state, date, idx) {
  const wd = weekday(date);
  const out = [];
  for (const entry of state.entries) {
    const pkg = idx.packages.get(entry.package_id);
    const pos = pkg && cyclePosition(pkg, date);
    if (!pos || entry.week_position !== pos) continue;
    const slot = idx.slots.get(entry.slot_id);
    if (!slot || slot.day !== wd) continue;
    out.push({
      key: `${date}:${entry.id}`,
      date,
      entry,
      slot,
      cls: idx.classes.get(entry.class_id),
      pkg,
      pos,
      area: idx.areas.get(slot.area_id),
      start: toMin(slot.start_time),
      end: toMin(slot.end_time),
      gap: !slot.active,
    });
  }
  return out;
}

// A weekly class with its day change applied: another time, room or coach, or cancelled.
// `slot` keeps its id (so packages sharing it still group) but takes the new room and times;
// `origin` is the class as the package has it, `change` the change itself.
function applyChange(s, c, date, idx) {
  const slot = {
    ...s.slot,
    area_id: c.area_id ?? s.slot.area_id,
    start_time: c.start_time ?? s.slot.start_time,
    end_time: c.end_time ?? s.slot.end_time,
  };
  return {
    ...s,
    key: `${date}:${s.entry.id}`,
    date,
    slot,
    cls: (c.new_class_id && idx.classes.get(c.new_class_id)) || s.cls,
    area: idx.areas.get(slot.area_id),
    start: toMin(slot.start_time),
    end: toMin(slot.end_time),
    change: c,
    origin: { date: s.date, slot: s.slot, cls: s.cls },
    cancelled: !!c.cancelled,
  };
}

// Resolve every class on a real date: the packages' weekly classes with any day changes applied
// (moved away → gone from here, moved here from another date → added), plus one-time classes.
export function resolveDate(state, date, idx = indexState(state)) {
  const wd = weekday(date);
  const out = [];
  for (const s of packageSessions(state, date, idx)) {
    const c = idx.changes.get(changeKey(date, s.slot.id, s.cls.id));
    if (!c) out.push(s);
    else if (!c.new_date || c.new_date === date) out.push(applyChange(s, c, date, idx));
  }
  for (const c of idx.movedIn.get(date) || []) {
    for (const s of packageSessions(state, c.date, idx)) {
      if (s.slot.id === c.slot_id && s.cls.id === c.class_id) out.push(applyChange(s, c, date, idx));
    }
  }
  // One-time classes on this date. They look like any other session (with a stand-in slot) so the
  // calendar and the clash check treat them the same; `oneOff` marks them and `pkg` is null.
  for (const o of state.oneOffs || []) {
    if (o.date !== date) continue;
    const id = `o${o.id}`;
    out.push({
      key: `${date}:${id}`,
      date,
      entry: { id },
      oneOff: o,
      slot: { id, area_id: o.area_id, day: wd, start_time: o.start_time, end_time: o.end_time, label: o.label, buffer_minutes: 0, active: 1 },
      cls: idx.classes.get(o.class_id),
      pkg: null,
      pos: null,
      area: idx.areas.get(o.area_id),
      start: toMin(o.start_time),
      end: toMin(o.end_time),
      gap: false,
    });
  }
  return out;
}

// Members booked into a one-time class.
export const oneOffMembers = (state, oneOffId) => {
  const ids = new Set((state.oneOffMembers || []).filter((x) => x.one_off_id === oneOffId).map((x) => x.member_id));
  return state.members.filter((m) => ids.has(m.id));
};

// Every coach of a class, by name. A class can have several (cls.coaches); a draft class from a form
// may only have a typed name, where "Marco Reyes & Sara" means both.
export const coachNames = (cls) => cls.coaches ?? cls.coach.split('&').map((n) => n.trim()).filter(Boolean);
// The first coach two sessions have in common, or undefined.
const sharedCoach = (a, b) => {
  const theirs = new Set(coachNames(b.cls).map((n) => n.toLowerCase()));
  return coachNames(a.cls).find((n) => theirs.has(n.toLowerCase()));
};

// Area: same area + overlapping time (incl. cleaning buffer). Coach: any coach in both + overlapping time
// (`coach` on the conflict names them).
// Sessions on inactive slots are gaps, not bookings, so they never conflict.
// The same class in the same slot from two packages is one shared session (e.g. a Kids and an
// Adults package both booking a mixed class), so that never conflicts either.
export function findConflicts(sessions) {
  const live = sessions.filter((s) => !s.gap && !s.cancelled);
  const list = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.date !== b.date) continue;
      if (a.slot.id === b.slot.id && a.cls.id === b.cls.id) continue;
      const overlap = a.start < b.end && b.start < a.end;
      const bufA = Number(a.slot.buffer_minutes) || 0;
      const bufB = Number(b.slot.buffer_minutes) || 0;
      if (a.slot.area_id === b.slot.area_id && a.start < b.end + bufB && b.start < a.end + bufA) {
        list.push({ type: 'area', a, b });
      }
      const coach = overlap && sharedCoach(a, b);
      if (coach) list.push({ type: 'coach', a, b, coach });
    }
  }
  return list;
}

export function conflictsByKey(list) {
  const map = new Map();
  const add = (k, v) => map.set(k, [...(map.get(k) || []), v]);
  for (const c of list) {
    add(c.a.key, { type: c.type, other: c.b });
    add(c.b.key, { type: c.type, other: c.a });
  }
  return map;
}

// Scan forward week by week and collect conflicts, optionally only those involving `involves(session)`.
export function scanConflicts(state, fromDate, weeks, involves) {
  const idx = indexState(state);
  const start = weekStart(fromDate);
  const found = [];
  for (let d = 0; d < weeks * 7; d++) {
    const sessions = resolveDate(state, addDays(start, d), idx);
    if (sessions.length < 2) continue;
    for (const c of findConflicts(sessions)) {
      if (!involves || involves(c.a) || involves(c.b)) found.push(c);
    }
  }
  return found;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Rotations are periodic, so checking until every anchor/end date has passed plus one
// full LCM of all cycle lengths covers every combination that will ever occur.
export function conflictHorizon(state, fromDate) {
  const start = weekStart(fromDate);
  let last = start;
  let lcm = 1;
  for (const p of state.packages) {
    if (p.end_date && p.end_date <= start) continue;
    last = maxDate(last, p.anchor_date);
    if (p.end_date) last = maxDate(last, p.end_date);
    const c = Math.max(1, Number(p.cycle_length) || 1);
    lcm = (lcm * c) / gcd(lcm, c);
  }
  for (const o of state.oneOffs || []) last = maxDate(last, o.date);
  for (const c of state.changes || []) last = maxDate(last, maxDate(c.date, c.new_date || c.date));
  const weeks = Math.ceil(daysBetween(start, last) / 7) + Math.min(lcm, 104);
  return { start, weeks: Math.min(weeks, 208) };
}

export function checkConflicts(state, fromDate, involves) {
  const { start, weeks } = conflictHorizon(state, fromDate);
  return scanConflicts(state, start, weeks, involves);
}

export const conflictKey = (c) => `${c.type}:${c.a.date}:${[String(c.a.entry.id), String(c.b.entry.id)].sort().join('-')}`;

// Conflicts in `after` that weren't already present in `before`.
export function newConflicts(before, after) {
  const seen = new Set(before.map(conflictKey));
  return after.filter((c) => !seen.has(conflictKey(c)));
}

// Group repeated conflicts (same pair of entries) into one line with all their dates.
export function summarizeConflicts(list) {
  const groups = new Map();
  for (const c of list) {
    const k = `${c.type}:${[String(c.a.entry.id), String(c.b.entry.id)].sort().join('-')}`;
    if (!groups.has(k)) groups.set(k, { ...c, dates: [] });
    groups.get(k).dates.push(c.a.date);
  }
  return [...groups.values()];
}

const sessionLabel = (s, v) =>
  `${s.cls.activity} (${s.area?.name ?? 'new room'}, ${clockRange(s.slot.start_time, s.slot.end_time)}, ${s.pkg ? `${s.pkg.name} W${s.pos}` : v.oneOff})`;

// `v` is the vocabulary (lib/vocab.js): "Coach Marco double-booked" or "Host Sara double-booked".
export function describeConflict(c, withDate = true, v = GYM) {
  const what = c.type === 'area' ? `${c.a.area?.name ?? 'Room'} double-booked` : `${v.Coach} ${c.coach ?? c.a.cls.coach} double-booked`;
  return `${withDate ? fmtDate(c.a.date) + ' · ' : ''}${what}: ${sessionLabel(c.a, v)} & ${sessionLabel(c.b, v)}`;
}

const PALETTE = ['#e5484d', '#6e8efb', '#4cc38a', '#f2994a', '#a78bfa', '#38bdb3', '#e879a6', '#d4b53c', '#5fa8e8', '#b8977a', '#93c25b', '#8f86e0'];

// Colour by activity: the colour set in Config, else a stable palette pick by first appearance.
export function activityColors(classes) {
  const map = new Map();
  for (const c of [...classes].sort((a, b) => a.id - b.id)) {
    const key = c.activity.trim().toLowerCase();
    if (!map.has(key)) map.set(key, c.color || PALETTE[map.size % PALETTE.length]);
  }
  return (activity) => map.get(activity?.trim().toLowerCase()) ?? '#888';
}
