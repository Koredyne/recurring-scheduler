import { addDays, addMonths, todayStr, weekStart } from '../../src/lib/dates.js';

// Seed a demo from a plain description, so each demo is just data:
//   areas:      ['Ring', 'Mat']
//   activities: { Boxing: '#e5484d' }
//   packages:   [{ name, cycle = 1, start = 0 (weeks from this week), weeks (runs this many weeks, then ends), plans }]
//               plans: [[per month (null = unlimited), price, label?, months = 1]]
//   sessions:   [{ packages: [names], activity, coach: 'A' or 'A & B', area, days: [0–6], start, end, label?, week = 1 }]
//               one class time per (area, day, start, end, label); packages listing the same one share it.
//   members:    [[name, [[package, plan index, start (days from today), months]]]]
//   oneOffs:    [{ week (0 = this week), day, area, activity, coach, start, end, label?, note?, members: [names] }]
//   changes:    [{ week, day, start, activity (picks the weekly class), cancelled?, coach?, area?, note? }]
// Week 0 is the current week, which starts on Sunday.
export function seedDemo(db, demo) {
  const ins = (sql, ...params) => Number(db.prepare(sql).run(...params).lastInsertRowid);
  const sunday = weekStart(todayStr());
  const today = todayStr();

  const area = Object.fromEntries(demo.areas.map((name, i) => [name, ins('INSERT INTO areas (name, sort) VALUES (?, ?)', name, i)]));
  const activity = Object.fromEntries(
    Object.entries(demo.activities).map(([name, color]) => [name, ins('INSERT INTO activities (name, color) VALUES (?, ?)', name, color)]),
  );

  const coach = {};
  const cls = {};
  // A class is an activity with its coaches; "A & B" means both teach it, A first.
  const classFor = (act, who) => {
    if (!activity[act]) throw new Error(`Unknown activity ${act}`);
    const names = who.split('&').map((n) => n.trim());
    for (const n of names) coach[n] ??= ins('INSERT INTO coaches (name) VALUES (?)', n);
    const key = `${act}|${names.join('&')}`;
    if (!cls[key]) {
      cls[key] = ins('INSERT INTO classes (activity_id, coach_id) VALUES (?, ?)', activity[act], coach[names[0]]);
      names.slice(1).forEach((n, i) => ins('INSERT INTO class_coaches (class_id, coach_id, sort) VALUES (?, ?, ?)', cls[key], coach[n], i));
    }
    return cls[key];
  };

  const pkg = {};
  const plans = {};
  for (const p of demo.packages) {
    const anchor = addDays(sunday, 7 * (p.start ?? 0));
    const end = p.weeks ? addDays(anchor, 7 * p.weeks) : null;
    pkg[p.name] = ins('INSERT INTO packages (name, anchor_date, end_date, cycle_length) VALUES (?, ?, ?, ?)', p.name, anchor, end, p.cycle ?? 1);
    plans[p.name] = (p.plans ?? []).map(([perMonth, price, label, months = 1]) =>
      ins(
        'INSERT INTO package_plans (package_id, label, classes_per_month, price, months) VALUES (?, ?, ?, ?, ?)',
        pkg[p.name],
        label ?? null,
        perMonth,
        price,
        months,
      ),
    );
  }
  const packageFor = (name) => pkg[name] ?? fail(`Unknown package ${name}`);

  const slots = {};
  const placed = []; // { day, start, activity, slotId, classId } for finding day changes
  for (const s of demo.sessions) {
    const classId = classFor(s.activity, s.coach);
    for (const day of s.days) {
      const key = [s.area, day, s.start, s.end, s.label ?? ''].join('|');
      slots[key] ??= ins(
        `INSERT INTO slots (area_id, day, start_time, end_time, label, type, capacity, buffer_minutes)
         VALUES (?, ?, ?, ?, ?, 'group', ?, 0)`,
        area[s.area] ?? fail(`Unknown area ${s.area}`),
        day,
        s.start,
        s.end,
        s.label ?? null,
        s.capacity ?? 20,
      );
      for (const p of s.packages) {
        ins(
          'INSERT INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, ?)',
          packageFor(p),
          slots[key],
          classId,
          s.week ?? 1,
        );
      }
      placed.push({ day, start: s.start, activity: s.activity, slotId: slots[key], classId });
    }
  }

  const member = {};
  for (const [name, subs] of demo.members) {
    member[name] = ins('INSERT INTO members (name, email) VALUES (?, ?)', name, `${name.split(' ')[0].toLowerCase()}@example.com`);
    for (const [p, planIdx, offset, months] of subs) {
      const start = addDays(today, offset);
      ins(
        'INSERT INTO package_members (package_id, member_id, plan_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        packageFor(p),
        member[name],
        plans[p][planIdx] ?? null,
        start,
        addDays(addMonths(start, months), -1),
      );
    }
  }

  const dateOf = (week, day) => addDays(sunday, 7 * week + day);
  for (const o of demo.oneOffs ?? []) {
    const id = ins(
      'INSERT INTO one_offs (date, area_id, class_id, start_time, end_time, label, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      dateOf(o.week, o.day),
      area[o.area],
      classFor(o.activity, o.coach),
      o.start,
      o.end,
      o.label ?? null,
      o.note ?? null,
    );
    for (const n of o.members ?? [])
      ins('INSERT INTO one_off_members (one_off_id, member_id) VALUES (?, ?)', id, member[n] ?? fail(`Unknown member ${n}`));
  }

  for (const c of demo.changes ?? []) {
    const s =
      placed.find((p) => p.day === c.day && p.start === c.start && p.activity === c.activity) ??
      fail(`No ${c.activity} at ${c.start} on day ${c.day}`);
    const newClass = c.coach ? classFor(c.activity, c.coach) : null;
    ins(
      'INSERT INTO session_changes (date, slot_id, class_id, cancelled, area_id, new_class_id, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      dateOf(c.week, c.day),
      s.slotId,
      s.classId,
      c.cancelled ? 1 : 0,
      c.area ? area[c.area] : null,
      newClass,
      c.note ?? null,
    );
  }
}

function fail(message) {
  throw new Error(message);
}
