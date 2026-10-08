import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, timetableGroups, weeksOf } from '../src/lib/packageClasses.js';

// Boxing/Marco 4–5 PM on Sun, Tue and Sat (one class time each), plus a switched-off Thu 4–5 PM.
// Package 1 uses Sun, Tue and the switched-off Thu; package 2 uses Sat.
const state = {
  classes: [{ id: 1, activity: 'Boxing', coach: 'Marco' }],
  slots: [
    { id: 10, day: 0, start_time: '16:00', end_time: '17:00', label: 'Adults', active: 1 },
    { id: 11, day: 2, start_time: '16:00', end_time: '17:00', label: 'Adults', active: 1 },
    { id: 12, day: 6, start_time: '16:00', end_time: '17:00', label: 'Adults', active: 1 },
    { id: 13, day: 4, start_time: '16:00', end_time: '17:00', label: 'Adults', active: 0 },
  ],
  entries: [
    { package_id: 1, slot_id: 10, class_id: 1, week_position: 1 },
    { package_id: 1, slot_id: 11, class_id: 1, week_position: 2 },
    { package_id: 1, slot_id: 13, class_id: 1, week_position: 1 },
    { package_id: 2, slot_id: 12, class_id: 1, week_position: 1 },
  ],
};

describe('timetableGroups', () => {
  it("keeps a package's own classes on switched-off class times, marked as a gap", () => {
    const groups = timetableGroups(state, 1);
    const gap = groups.find((g) => g.gap);
    assert.ok(gap, 'the switched-off Thursday is listed');
    assert.deepEqual(gap.items.map(keyOf), ['13:1']);
  });
  it('regression: switched-off class times stay hidden for a new package or another package', () => {
    for (const pkgId of [undefined, 2]) assert.ok(!timetableGroups(state, pkgId).some((g) => g.gap));
  });
  it("regression: groups one class's days together, Saturday first, apart from the switched-off one", () => {
    const groups = timetableGroups(state, 1);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.find((g) => !g.gap).items.map((it) => it.day), [6, 0, 2]);
  });
});

describe('weeksOf', () => {
  it('lists what a package has in each week of its cycle', () => {
    const weeks = weeksOf(state, { id: 1, cycle_length: 3 });
    assert.deepEqual(weeks.map((w) => [...w].sort()), [['10:1', '13:1'], ['11:1'], []]);
  });
});
