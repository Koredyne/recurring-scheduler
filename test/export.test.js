import { it } from 'node:test';
import assert from 'node:assert/strict';
import { exportData } from '../server/db.js';
import { addDays } from '../src/lib/dates.js';
import { smallGym } from './helpers.js';

it('downloads every table as JSON, including plans and relationship rows', async () => {
  const { db, call, ins, ids, sunday } = smallGym();
  const plan = ins('INSERT INTO package_plans (package_id, label, classes_per_month, months, price) VALUES (?, ?, 12, 3, 150)', ids.pkg, 'Quarterly');
  const member = ins("INSERT INTO members (name, email) VALUES ('Yousef', 'yousef@example.com')");
  ins('INSERT INTO package_members (package_id, member_id, plan_id, start_date) VALUES (?, ?, ?, ?)', ids.pkg, member, plan, sunday);
  ins('INSERT INTO class_coaches (class_id, coach_id, sort) VALUES (?, ?, 1)', ids.boxA, ids.C);

  const result = await call('GET', '/export');
  assert.equal(result.status, 200);
  assert.equal(result.headers['content-type'], 'application/json');
  assert.match(result.headers['content-disposition'], /^attachment; filename="schedule-data-\d{4}-\d{2}-\d{2}\.json"$/);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.format, 'recurring-scheduler-export');
  assert.equal(result.version, 1);
  assert.ok(!Number.isNaN(Date.parse(result.exportedAt)));

  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(Object.keys(result.tables), tableNames);
  for (const name of tableNames) {
    assert.deepEqual(result.tables[name], db.prepare(`SELECT * FROM "${name}"`).all().map((row) => ({ ...row })), name);
  }
  assert.equal(result.tables.package_plans[0].id, plan);
  assert.equal(result.tables.package_members[0].member_id, member);
  assert.equal(result.tables.class_coaches[0].coach_id, ids.C);
});

it('exports every kind of schedule data, including one-time bookings and day changes', () => {
  const { db, ins, ids, sunday } = smallGym();
  const member = ins("INSERT INTO members (name) VALUES ('Yousef')");
  const oneOff = ins(
    'INSERT INTO one_offs (date, area_id, class_id, start_time, end_time, label, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    addDays(sunday, 2), ids.mat, ids.kickB, '13:00', '14:00', 'Private lesson', 'Bring gloves',
  );
  ins('INSERT INTO one_off_members (one_off_id, member_id) VALUES (?, ?)', oneOff, member);
  const change = ins(
    'INSERT INTO session_changes (date, slot_id, class_id, cancelled, new_date, area_id, start_time, end_time, new_class_id, note) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
    sunday, ids.ring10, ids.boxA, addDays(sunday, 1), ids.mat, '15:00', '16:00', ids.kickB, 'Rescheduled',
  );

  const { tables } = JSON.parse(JSON.stringify(exportData(db)));
  assert.deepEqual(tables.package_entries, [{ id: 1, package_id: ids.pkg, slot_id: ids.ring10, class_id: ids.boxA, week_position: 1 }]);
  assert.deepEqual(tables.slots.find((slot) => slot.id === ids.ring10), {
    id: ids.ring10, area_id: ids.ring, day: 0, start_time: '10:00', end_time: '11:00',
    label: null, capacity: null, type: null, buffer_minutes: 0, active: 1,
  });
  assert.deepEqual(tables.one_offs, [{
    id: oneOff, date: addDays(sunday, 2), area_id: ids.mat, class_id: ids.kickB,
    start_time: '13:00', end_time: '14:00', label: 'Private lesson', note: 'Bring gloves',
  }]);
  assert.deepEqual(tables.one_off_members, [{ one_off_id: oneOff, member_id: member }]);
  assert.deepEqual(tables.session_changes, [{
    id: change, date: sunday, slot_id: ids.ring10, class_id: ids.boxA, cancelled: 0,
    new_date: addDays(sunday, 1), area_id: ids.mat, start_time: '15:00', end_time: '16:00',
    new_class_id: ids.kickB, note: 'Rescheduled',
  }]);
});
