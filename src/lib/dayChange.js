// Changing one weekly class on one date only (from the Schedule), without touching its package.
// A change is stored against the class as the package has it — its original date, slot and class —
// and says what happens instead: cancelled, another date/time/room, or another coach.

// The original class a session came from, before any change.
export const originOf = (s) => ({
  date: s.origin?.date ?? s.date,
  slot: s.origin?.slot ?? s.slot,
  cls: s.origin?.cls ?? s.cls,
});

// Save `patch` on top of the session's current change. Anything that ends up the same as the
// package has it is dropped; if nothing is left the change is removed and the class is back to normal.
export async function saveDayChange(mutate, s, patch) {
  const o = originOf(s);
  const cur = s.change || {};
  const next = {
    cancelled: !!cur.cancelled,
    new_date: cur.new_date,
    area_id: cur.area_id,
    start_time: cur.start_time,
    end_time: cur.end_time,
    new_class_id: cur.new_class_id,
    note: cur.note,
    ...patch,
  };
  if (next.new_date === o.date) next.new_date = null;
  if (next.area_id === o.slot.area_id) next.area_id = null;
  if (next.start_time === o.slot.start_time && next.end_time === o.slot.end_time) next.start_time = next.end_time = null;
  if (next.new_class_id === o.cls.id) next.new_class_id = null;
  const empty = !next.cancelled && !next.new_date && !next.area_id && !next.start_time && !next.new_class_id && !next.note?.trim() && !next.activity;
  if (empty) return s.change ? mutate((api) => api.remove('changes', s.change.id)) : null;
  return mutate((api) => api.create('changes', { date: o.date, slot_id: o.slot.id, class_id: o.cls.id, ...next }));
}

// Move a session to another date / room / start time, keeping its length. One-time classes are
// simply updated; weekly classes get a day change.
export function moveSession(mutate, state, s, { date, areaId, start }) {
  const length = s.end - s.start;
  const t = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const start_time = t(start);
  const end_time = t(Math.min(start + length, 23 * 60 + 59));
  if (s.oneOff) {
    const member_ids = (state.oneOffMembers || []).filter((x) => x.one_off_id === s.oneOff.id).map((x) => x.member_id);
    return mutate((api) => api.update('oneoffs', s.oneOff.id, { ...s.oneOff, date, area_id: areaId, start_time, end_time, member_ids }));
  }
  return saveDayChange(mutate, s, { new_date: date, area_id: areaId, start_time, end_time });
}
