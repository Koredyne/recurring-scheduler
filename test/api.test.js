import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/lib/dates.js';
import { smallGym } from './helpers.js';

const pkgOf = (state, id) => state.packages.find((p) => p.id === id);
const plansOf = (state, id) => state.plans.filter((p) => p.package_id === id);
const entriesOf = (state, id) => state.entries.filter((e) => e.package_id === id);
const classOf = (state, id) => state.classes.find((c) => c.id === id);

// Package with a plan (12 classes, 1 month, 55 KD) and a member on it.
function withSubscriber() {
  const t = smallGym();
  const plan = t.ins('INSERT INTO package_plans (package_id, classes_per_month, months, price) VALUES (?, 12, 1, 55)', t.ids.pkg);
  const member = t.ins("INSERT INTO members (name) VALUES ('Yousef')");
  t.ins('INSERT INTO package_members (package_id, member_id, plan_id) VALUES (?, ?, ?)', t.ids.pkg, member, plan);
  return { ...t, plan, member };
}

describe('PUT /bundles/:id — editing a whole package', () => {
  it('saves name, dates, rotation, classes and plans in one go', async () => {
    const { call, ids, sunday, plan } = withSubscriber();
    const r = await call('PUT', `/bundles/${ids.pkg}`, {
      name: 'Boxing Plus',
      anchor_date: sunday,
      end_date: addDays(sunday, 28),
      cycle_length: 2,
      sessions: [
        { slot_id: ids.ring10, class_id: ids.boxA, week: 1 },
        { slot_id: ids.ring11, class_id: ids.boxA, week: 2 },
      ],
      plans: [{ id: plan, classes_per_month: 16, months: 6, price: 280 }, { classes_per_month: null, months: 1, price: 80 }],
    });
    assert.equal(r.status, 200, r.error);
    assert.deepEqual(pkgOf(r.state, ids.pkg), { id: ids.pkg, name: 'Boxing Plus', anchor_date: sunday, end_date: addDays(sunday, 28), cycle_length: 2 });
    assert.deepEqual(entriesOf(r.state, ids.pkg).map((e) => [e.slot_id, e.week_position]), [[ids.ring10, 1], [ids.ring11, 2]]);
    const plans = plansOf(r.state, ids.pkg);
    assert.equal(plans.length, 2);
    assert.deepEqual(plans.find((p) => p.id === plan), { id: plan, package_id: ids.pkg, label: null, classes_per_month: 16, months: 6, price: 280 });
  });

  it('keeps subscribers on a plan that was edited', async () => {
    const { call, ids, plan } = withSubscriber();
    const r = await call('PUT', `/bundles/${ids.pkg}`, { plans: [{ id: plan, classes_per_month: 24, months: 1, price: 70 }] });
    assert.equal(r.state.packageMembers[0].plan_id, plan);
  });

  it('a removed plan leaves its subscribers on the package with no plan', async () => {
    const { call, ids } = withSubscriber();
    const r = await call('PUT', `/bundles/${ids.pkg}`, { plans: [{ classes_per_month: 8, months: 1, price: 40 }] });
    assert.equal(r.status, 200, r.error);
    assert.equal(r.state.packageMembers.length, 1);
    assert.equal(r.state.packageMembers[0].plan_id, null);
  });

  it('shrinking the rotation drops classes in weeks that no longer exist', async () => {
    const { call, ids } = smallGym();
    await call('PUT', `/bundles/${ids.pkg}`, {
      cycle_length: 2,
      sessions: [{ slot_id: ids.ring10, class_id: ids.boxA, week: 1 }, { slot_id: ids.ring11, class_id: ids.boxA, week: 2 }],
    });
    const r = await call('PUT', `/bundles/${ids.pkg}`, { cycle_length: 1 });
    assert.deepEqual(entriesOf(r.state, ids.pkg).map((e) => e.week_position), [1]);
  });

  it('refuses an end before the start, a non-Sunday start and an empty name', async () => {
    const { call, ids, sunday } = smallGym();
    assert.equal((await call('PUT', `/bundles/${ids.pkg}`, { end_date: sunday })).status, 400);
    assert.match((await call('PUT', `/bundles/${ids.pkg}`, { anchor_date: addDays(sunday, 1) })).error, /Sunday/);
    assert.match((await call('PUT', `/bundles/${ids.pkg}`, { name: '  ' })).error, /Name is required/);
  });

  it('is all-or-nothing: a clash blocks the save and nothing changes', async () => {
    const { call, ids } = smallGym();
    const r = await call('PUT', `/bundles/${ids.pkg}`, {
      name: 'Renamed',
      // Boxing with Coach A in the Ring and on the Mat at 10 — Coach A can't be in both.
      sessions: [{ slot_id: ids.ring10, class_id: ids.boxA, week: 1 }, { slot_id: ids.mat10, class_id: ids.boxA, week: 1 }],
    });
    assert.equal(r.status, 409);
    assert.match(r.error, /Coach Coach A double-booked/);
    const after = await call('GET', '/state');
    assert.equal(pkgOf(after.state, ids.pkg).name, 'Boxing');
    assert.equal(entriesOf(after.state, ids.pkg).length, 1);
  });

  it('editing only the name, dates or plans keeps the classes', async () => {
    const { call, ids } = smallGym();
    const r = await call('PUT', `/bundles/${ids.pkg}`, { name: 'Renamed', plans: [] });
    assert.equal(pkgOf(r.state, ids.pkg).name, 'Renamed');
    assert.deepEqual(entriesOf(r.state, ids.pkg).map((e) => e.slot_id), [ids.ring10]);
  });

  it('regression: { sessions } alone only replaces the classes', async () => {
    const { call, ids, sunday, plan } = withSubscriber();
    const r = await call('PUT', `/bundles/${ids.pkg}`, { sessions: [{ slot_id: ids.ring11, class_id: ids.boxA, week: 1 }] });
    assert.deepEqual(pkgOf(r.state, ids.pkg), { id: ids.pkg, name: 'Boxing', anchor_date: sunday, end_date: null, cycle_length: 1 });
    assert.deepEqual(plansOf(r.state, ids.pkg).map((p) => p.id), [plan]);
    assert.deepEqual(entriesOf(r.state, ids.pkg).map((e) => e.slot_id), [ids.ring11]);
  });

  it('regression: { week, sessions } replaces just that week', async () => {
    const { call, ids } = smallGym();
    await call('PUT', `/bundles/${ids.pkg}`, {
      cycle_length: 2,
      sessions: [{ slot_id: ids.ring10, class_id: ids.boxA, week: 1 }, { slot_id: ids.ring10, class_id: ids.boxA, week: 2 }],
    });
    const r = await call('PUT', `/bundles/${ids.pkg}`, { week: 2, sessions: [{ slot_id: ids.ring11, class_id: ids.boxA }] });
    assert.deepEqual(entriesOf(r.state, ids.pkg).map((e) => [e.slot_id, e.week_position]), [[ids.ring10, 1], [ids.ring11, 2]]);
  });
});

describe('plan lengths', () => {
  it('a new package saves each plan with its months and total price', async () => {
    const { call, sunday } = smallGym();
    const r = await call('POST', '/bundles', {
      name: 'New',
      anchor_date: sunday,
      cycle_length: 1,
      sessions: [],
      plans: [{ classes_per_month: 16, months: 6, price: 280 }, { classes_per_month: null, price: 80 }],
    });
    assert.equal(r.status, 200, r.error);
    assert.deepEqual(plansOf(r.state, r.id).map((p) => [p.classes_per_month, p.months, p.price]), [[16, 6, 280], [null, 1, 80]]);
  });

  it('refuses a length or class count below 1', async () => {
    const { call, sunday } = smallGym();
    const bundle = (plan) => ({ name: 'X', anchor_date: sunday, cycle_length: 1, sessions: [], plans: [plan] });
    assert.match((await call('POST', '/bundles', bundle({ classes_per_month: 12, months: 0 }))).error, /Months/);
    assert.match((await call('POST', '/bundles', bundle({ classes_per_month: 0, months: 1 }))).error, /Classes a month/);
  });

  it('the plan editor (POST/PUT /plans) saves months', async () => {
    const { call, ids } = smallGym();
    const made = await call('POST', '/plans', { package_id: ids.pkg, classes_per_month: 12, months: 3, price: 150 });
    const r = await call('PUT', `/plans/${made.id}`, { months: 12 });
    assert.equal(r.state.plans.find((p) => p.id === made.id).months, 12);
  });
});

describe('classes with several coaches', () => {
  it('creates a class with several coaches, main coach first', async () => {
    const { call, ids } = smallGym();
    const r = await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.C, ids.B] });
    assert.equal(r.status, 200, r.error);
    const c = classOf(r.state, r.id);
    assert.deepEqual(c.coach_ids, [ids.C, ids.B]);
    assert.deepEqual(c.coaches, ['Coach C', 'Coach B']);
    assert.equal(c.coach, 'Coach C & Coach B');
    assert.equal(c.coach_id, ids.C);
  });

  it('refuses a duplicate (same activity and coaches, in any order) and a class with no coach', async () => {
    const { call, ids } = smallGym();
    await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.B, ids.C] });
    assert.match((await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.C, ids.B] })).error, /already exists/);
    assert.match((await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.A] })).error, /already exists/);
    assert.match((await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [] })).error, /at least one coach/);
  });

  it('allows the same main coach alone and with an assistant as two classes', async () => {
    const { call, ids } = smallGym();
    const r = await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.A, ids.C] });
    assert.equal(r.status, 200, r.error);
  });

  it('adding a coach who is busy at one of the class times is blocked; a free one is saved', async () => {
    const { call, ids, ins } = smallGym();
    ins('INSERT INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, 1)', ids.pkg, ids.mat10, ids.kickB);
    const busy = await call('PUT', `/classes/${ids.boxA}`, { coach_ids: [ids.A, ids.B] });
    assert.equal(busy.status, 409);
    assert.match(busy.error, /Coach Coach B double-booked/);
    assert.deepEqual(classOf((await call('GET', '/state')).state, ids.boxA).coach_ids, [ids.A]);
    const free = await call('PUT', `/classes/${ids.boxA}`, { coach_ids: [ids.A, ids.C] });
    assert.equal(classOf(free.state, ids.boxA).coach, 'Coach A & Coach C');
  });

  it('removing a coach, and deleting a coach still on a class is refused', async () => {
    const { call, ids } = smallGym();
    await call('PUT', `/classes/${ids.boxA}`, { coach_ids: [ids.A, ids.C] });
    assert.match((await call('DELETE', `/coaches/${ids.C}`)).error, /Still in use/);
    const r = await call('PUT', `/classes/${ids.boxA}`, { coach_ids: [ids.A] });
    assert.deepEqual(classOf(r.state, ids.boxA).coach_ids, [ids.A]);
    assert.equal((await call('DELETE', `/coaches/${ids.C}`)).status, 200);
  });

  it('a one-time class typed as "A & C" reuses that class, or creates it', async () => {
    const { call, ids, sunday } = smallGym();
    // On two different days, so they don't clash with each other.
    const oneOff = (day, coach) =>
      call('POST', '/oneoffs', { date: addDays(sunday, day), area_id: ids.ring, start_time: '15:00', end_time: '16:00', activity: 'Boxing', coach });
    const made = await oneOff(3, 'Coach A & New Coach');
    const cls = classOf(made.state, made.state.oneOffs[0].class_id);
    assert.deepEqual(cls.coaches, ['Coach A', 'New Coach']);
    const again = await oneOff(4, 'new coach&coach a');
    assert.equal(again.status, 200, again.error);
    assert.equal(again.state.oneOffs[1].class_id, cls.id);
  });

  it('regression: a single typed coach still means the one-coach class', async () => {
    const { call, ids, sunday } = smallGym();
    await call('POST', '/classes', { activity_id: ids.boxing, coach_ids: [ids.A, ids.C] });
    const r = await call('POST', '/oneoffs', { date: addDays(sunday, 3), area_id: ids.ring, start_time: '15:00', end_time: '16:00', activity: 'Boxing', coach: 'Coach A' });
    assert.equal(r.state.oneOffs[0].class_id, ids.boxA);
  });

  it('regression: the old { activity_id, coach_id } shape still works', async () => {
    const { call, ids } = smallGym();
    const r = await call('POST', '/classes', { activity_id: ids.kick, coach_id: ids.C });
    assert.deepEqual(classOf(r.state, r.id).coach_ids, [ids.C]);
    const moved = await call('PUT', `/classes/${r.id}`, { activity_id: ids.boxing });
    assert.equal(classOf(moved.state, r.id).activity, 'Boxing');
    assert.deepEqual(classOf(moved.state, r.id).coach_ids, [ids.C]);
  });

  it('regression: a day change can swap to another single coach', async () => {
    const { call, ids, sunday } = smallGym();
    const r = await call('POST', '/changes', { date: addDays(sunday, 7), slot_id: ids.ring10, class_id: ids.boxA, activity: 'Boxing', coach: 'Coach C' });
    assert.equal(r.status, 200, r.error);
    assert.deepEqual(classOf(r.state, r.state.changes[0].new_class_id).coaches, ['Coach C']);
  });

  it('deleting a class removes its extra coaches too', async () => {
    const { call, ids, db } = smallGym();
    const r = await call('POST', '/classes', { activity_id: ids.kick, coach_ids: [ids.A, ids.C] });
    await call('DELETE', `/classes/${r.id}`);
    assert.equal(db.prepare('SELECT count(*) AS n FROM class_coaches').get().n, 0);
  });
});
