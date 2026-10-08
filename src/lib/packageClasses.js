// The package form's view of the timetable: classes grouped across days, and which are picked in each week.

// Week order for the package form: Saturday first, Friday last.
export const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

// Every class that's already on the timetable, grouped across days:
// "Boxing · Marco Reyes · Adults · 4–5 PM" with the days it runs.
// Switched-off class times are left out, except those package `pkgId` already uses (marked `gap`),
// so viewing or editing a package never silently drops them.
export function timetableGroups(state, pkgId) {
  const own = new Set(state.entries.filter((e) => e.package_id === pkgId).map(keyOf));
  const slotById = new Map(state.slots.map((s) => [s.id, s]));
  const classById = new Map(state.classes.map((c) => [c.id, c]));
  const seen = new Set();
  const groups = new Map();
  for (const e of state.entries) {
    const key = `${e.slot_id}:${e.class_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const slot = slotById.get(e.slot_id);
    const cls = classById.get(e.class_id);
    if (!slot || !cls || (!slot.active && !own.has(key))) continue;
    const gap = !slot.active;
    const gk = [cls.id, slot.start_time, slot.end_time, slot.label || '', gap ? 'off' : ''].join('|');
    if (!groups.has(gk)) groups.set(gk, { key: gk, cls, slot, gap, items: [] });
    groups.get(gk).items.push({ day: slot.day, slot_id: slot.id, class_id: cls.id });
  }
  for (const g of groups.values()) g.items.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  return [...groups.values()].sort((a, b) => a.cls.activity.localeCompare(b.cls.activity) || a.slot.start_time.localeCompare(b.slot.start_time));
}

export const keyOf = (it) => `${it.slot_id}:${it.class_id}`;
export const isKids = (g) => /kid/i.test(g.slot.label || '');
export const isAdults = (g) => !isKids(g) || /adult/i.test(g.slot.label || '');

// One Set of picked `${slot_id}:${class_id}` keys per week of the package's cycle.
export const weeksOf = (state, pkg) =>
  Array.from(
    { length: pkg.cycle_length },
    (_, i) => new Set(state.entries.filter((e) => e.package_id === pkg.id && e.week_position === i + 1).map(keyOf)),
  );
