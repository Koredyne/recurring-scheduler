import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coachNames, describeConflict, findConflicts } from '../src/lib/schedule.js';

// A resolved session as findConflicts sees it. Times in minutes; Sunday 4 Oct 2026.
let seq = 0;
const session = ({ area = 1, slot = ++seq, start = 600, end = 660, buffer = 0, cls, ...rest }) => ({
  key: `k${++seq}`,
  date: '2026-10-04',
  entry: { id: seq },
  slot: { id: slot, area_id: area, start_time: '10:00', end_time: '11:00', buffer_minutes: buffer },
  area: { name: `Room ${area}` },
  pkg: null,
  start,
  end,
  cls,
  ...rest,
});
const cls = (id, activity, ...coaches) => ({ id, activity, coach: coaches.join(' & '), coaches });

describe('coachNames', () => {
  it('lists every coach of a class with several', () => {
    assert.deepEqual(coachNames(cls(1, 'Boxing', 'Marco Reyes', 'Yuki')), ['Marco Reyes', 'Yuki']);
  });
  it('splits a typed "A & B" from a form draft (no coaches list yet)', () => {
    assert.deepEqual(coachNames({ coach: 'Marco Reyes &  Yuki ' }), ['Marco Reyes', 'Yuki']);
  });
  it('regression: a single typed coach is one name', () => {
    assert.deepEqual(coachNames({ coach: 'Marco Reyes' }), ['Marco Reyes']);
  });
});

describe('findConflicts with several coaches', () => {
  it('flags a coach clash when any coach of a multi-coach class is busy, naming that coach', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco', 'Yuki') });
    const b = session({ area: 2, cls: cls(2, 'Kickboxing', 'Yuki') });
    const [c, ...more] = findConflicts([a, b]);
    assert.equal(more.length, 0);
    assert.equal(c.type, 'coach');
    assert.equal(c.coach, 'Yuki');
    assert.match(describeConflict(c), /Coach Yuki double-booked/);
  });
  it('matches coaches case-insensitively', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco', 'yuki') });
    const b = session({ area: 2, cls: cls(2, 'Kickboxing', 'YUKI') });
    assert.equal(findConflicts([a, b]).length, 1);
  });
  it('catches a typed "A & B" draft against a busy coach', () => {
    const draft = session({ area: 1, cls: { id: -2, activity: 'Boxing', coach: 'Marco & Sara' } });
    const busy = session({ area: 2, cls: cls(2, 'MMA', 'Sara') });
    assert.equal(findConflicts([draft, busy])[0]?.coach, 'Sara');
  });
  it('no clash when the two classes share no coach', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco', 'Yuki') });
    const b = session({ area: 2, cls: cls(2, 'Kickboxing', 'Sara', 'Omar') });
    assert.deepEqual(findConflicts([a, b]), []);
  });
});

describe('findConflicts regressions', () => {
  it('single coach in two rooms at once is a coach clash', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco') });
    const b = session({ area: 2, cls: cls(2, 'Kickboxing', 'Marco') });
    const list = findConflicts([a, b]);
    assert.deepEqual(list.map((c) => c.type), ['coach']);
    assert.match(describeConflict(list[0]), /Coach Marco double-booked/);
  });
  it('two classes in one room at once is a room clash', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco') });
    const b = session({ area: 1, cls: cls(2, 'Kickboxing', 'Sara') });
    assert.deepEqual(findConflicts([a, b]).map((c) => c.type), ['area']);
  });
  it('back-to-back classes are fine', () => {
    const a = session({ area: 1, start: 600, end: 660, cls: cls(1, 'Boxing', 'Marco') });
    const b = session({ area: 1, start: 660, end: 720, cls: cls(2, 'Boxing', 'Marco') });
    assert.deepEqual(findConflicts([a, b]), []);
  });
  it("the room's cleaning buffer counts against the next class", () => {
    const a = session({ area: 1, start: 600, end: 660, buffer: 10, cls: cls(1, 'Boxing', 'Marco') });
    const b = session({ area: 1, start: 665, end: 720, cls: cls(2, 'MMA', 'Sara') });
    assert.deepEqual(findConflicts([a, b]).map((c) => c.type), ['area']);
  });
  it('the same class in the same class time from two packages is one shared class', () => {
    const shared = cls(1, 'Wrestling', 'Khalid', 'Omar');
    const a = session({ slot: 50, cls: shared });
    const b = session({ slot: 50, cls: shared });
    assert.deepEqual(findConflicts([a, b]), []);
  });
  it('cancelled classes and switched-off class times never clash', () => {
    const a = session({ area: 1, cls: cls(1, 'Boxing', 'Marco') });
    assert.deepEqual(findConflicts([a, session({ area: 1, cancelled: true, cls: cls(2, 'MMA', 'Marco') })]), []);
    assert.deepEqual(findConflicts([a, session({ area: 1, gap: true, cls: cls(2, 'MMA', 'Marco') })]), []);
  });
});
