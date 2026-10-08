import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getState, openDb, resetDb } from '../server/db.js';
import { DEMO_DATA } from '../server/demos/index.js';
import { DEMOS } from '../src/lib/demos.js';
import { resolveDate, scanConflicts } from '../src/lib/schedule.js';
import { addDays, todayStr, weekStart } from '../src/lib/dates.js';

describe('demos', () => {
  it('every demo offered in the app has data, and the other way round', () => {
    assert.deepEqual(DEMOS.map((d) => d.key).sort(), Object.keys(DEMO_DATA).sort());
  });

  for (const key of Object.keys(DEMO_DATA)) {
    describe(key, () => {
      const db = openDb(':memory:');
      resetDb(db, key);
      const state = getState(db);

      it('sets the kind of business and its name', () => {
        assert.equal(state.settings.kind, DEMO_DATA[key].settings.kind);
        assert.ok(state.settings.name);
      });
      it('has no room or coach clashes over the next 12 weeks', () => {
        assert.deepEqual(scanConflicts(state, todayStr(), 12), []);
      });
      it('fills this week and next week, including its day changes and one-off bookings', () => {
        const sunday = weekStart(todayStr());
        const sessions = Array.from({ length: 14 }, (_, i) => resolveDate(state, addDays(sunday, i))).flat();
        assert.ok(sessions.length > 20);
        assert.equal(sessions.filter((s) => s.oneOff).length, DEMO_DATA[key].oneOffs.length);
        assert.ok(
          sessions.some((s) => s.change),
          'a day change shows up',
        );
      });
      it('gives every subscription a plan of its package', () => {
        for (const pm of state.packageMembers) {
          assert.equal(state.plans.find((p) => p.id === pm.plan_id)?.package_id, pm.package_id);
        }
      });
    });
  }

  it('clearing the data keeps the business settings', () => {
    const db = openDb(':memory:');
    resetDb(db, 'clinic');
    resetDb(db, 'empty');
    const state = getState(db);
    assert.equal(state.settings.kind, 'clinic');
    assert.equal(state.packages.length, 0);
  });
});
