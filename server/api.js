import { COLORS, exportData, getSettings, getState, resetDb, saveSettings } from './db.js';
import { DEMO_DATA } from './demos/index.js';
import { KINDS, vocabFor } from '../src/lib/vocab.js';
import { fmtShort, todayStr, weekday } from '../src/lib/dates.js';
import { checkConflicts, describeConflict, newConflicts, summarizeConflicts } from '../src/lib/schedule.js';

const TABLES = {
  areas: { table: 'areas', cols: ['name', 'sort'] },
  coaches: { table: 'coaches', cols: ['name'] },
  members: { table: 'members', cols: ['name', 'email'] },
  activities: { table: 'activities', cols: ['name', 'color'] },
  classes: { table: 'classes', cols: ['activity_id', 'coach_id'] },
  slots: {
    table: 'slots',
    cols: ['area_id', 'day', 'start_time', 'end_time', 'label', 'capacity', 'type', 'buffer_minutes', 'active'],
  },
  packages: { table: 'packages', cols: ['name', 'anchor_date', 'end_date', 'cycle_length'] },
  plans: { table: 'package_plans', cols: ['package_id', 'label', 'classes_per_month', 'months', 'price'] },
  entries: { table: 'package_entries', cols: ['package_id', 'slot_id', 'class_id', 'week_position'] },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function clean(cols, body) {
  const row = {};
  for (const c of cols) {
    if (!(c in body)) continue;
    let v = body[c];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (typeof v === 'string') v = v.trim();
    row[c] = v === '' || v === undefined ? null : v;
  }
  return row;
}

function friendly(e) {
  const msg = String(e.message);
  let m;
  if ((m = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/))) return `${m[1].replace('_', ' ')} is required`;
  if (msg.includes('FOREIGN KEY')) return 'Still in use — remove it where it is used first';
  if (msg.includes('UNIQUE constraint failed')) return 'That name already exists';
  if (msg.includes('CHECK constraint')) return 'Invalid value (end must be after start)';
  return msg;
}

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
  });

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

function requireSunday(date, what) {
  if (weekday(date) !== 0) throw new HttpError(400, `${what} must be a Sunday (start of the week)`);
}

// playground: this database is one visitor's private copy (see playground.js); the app says so.
export function apiMiddleware(db, { playground = false } = {}) {
  // The words for this business ("Coach" or "Host"…), for messages.
  const vocab = () => vocabFor(getSettings(db));

  // Apply a change in a transaction and roll it back if it creates any new area/coach clash
  // anywhere from this week onwards.
  function guarded(fn) {
    const today = todayStr();
    const before = checkConflicts(getState(db), today);
    db.exec('BEGIN');
    try {
      const result = fn();
      const fresh = newConflicts(before, checkConflicts(getState(db), today));
      if (fresh.length) {
        const groups = summarizeConflicts(fresh);
        const [c] = groups;
        const more = groups.length > 1 ? ` (+${groups.length - 1} more)` : '';
        throw new HttpError(409, `Blocked — would create a conflict: ${describeConflict(c, false, vocab())}, first ${fmtShort(c.dates[0])}${more}`);
      }
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const get = (sql, ...p) => db.prepare(sql).get(...p);
  const idOf = (sql, ...p) => Number(run(sql, ...p).lastInsertRowid);

  // Every coach of a class, main coach first.
  const coachesOf = (classId) => {
    const main = get('SELECT coach_id FROM classes WHERE id = ?', classId)?.coach_id;
    const rest = db
      .prepare('SELECT coach_id FROM class_coaches WHERE class_id = ? ORDER BY sort')
      .all(classId)
      .map((r) => r.coach_id);
    return main == null ? [] : [main, ...rest];
  };
  // The class with exactly these coaches (in any order) for an activity, if there is one.
  const sameCoaches = (a, b) => a.length === b.length && a.every((id) => b.includes(id));
  const findClass = (activityId, coachIds, except = null) =>
    db
      .prepare('SELECT id FROM classes WHERE activity_id = ? AND id IS NOT ?')
      .all(activityId, except)
      .find((c) => sameCoaches(coachesOf(c.id), coachIds))?.id;
  // Give a class its coaches: the first is the main coach, the rest teach with them.
  function setCoaches(classId, coachIds) {
    run('UPDATE classes SET coach_id = ? WHERE id = ?', coachIds[0], classId);
    run('DELETE FROM class_coaches WHERE class_id = ?', classId);
    coachIds.slice(1).forEach((c, i) => run('INSERT INTO class_coaches (class_id, coach_id, sort) VALUES (?, ?, ?)', classId, c, i));
  }

  // The class for an activity + coach (by name), creating the activity, coach(es) and class if they're new.
  // Several coaches can be named together: "Marco Reyes & Sam Ortiz".
  function classFor(activity, coach) {
    const activityId =
      get('SELECT id FROM activities WHERE lower(name) = lower(?)', activity)?.id ??
      idOf('INSERT INTO activities (name, color) VALUES (?, ?)', activity, COLORS[get('SELECT count(*) AS n FROM activities').n % COLORS.length]);
    const names = [
      ...new Set(
        coach
          .split('&')
          .map((n) => n.trim())
          .filter(Boolean),
      ),
    ];
    const coachIds = names.map(
      (n) => get('SELECT id FROM coaches WHERE lower(name) = lower(?)', n)?.id ?? idOf('INSERT INTO coaches (name) VALUES (?)', n),
    );
    const found = findClass(activityId, coachIds);
    if (found) return found;
    const id = idOf('INSERT INTO classes (activity_id, coach_id) VALUES (?, ?)', activityId, coachIds[0]);
    setCoaches(id, coachIds);
    return id;
  }

  // Classes: POST /classes and PUT /classes/:id { activity_id, coach_ids: [main, …others] } (or coach_id for one coach).
  function saveClass(id, b) {
    const current = id ? get('SELECT * FROM classes WHERE id = ?', id) : null;
    if (id && !current) throw new HttpError(404, `${vocab().Class} not found`);
    const activityId = Number(b.activity_id ?? current?.activity_id);
    const coachIds = [...new Set((b.coach_ids ?? (b.coach_id != null ? [b.coach_id] : id ? coachesOf(id) : [])).map(Number))];
    if (!get('SELECT id FROM activities WHERE id = ?', activityId)) throw new HttpError(400, `Pick ${vocab().a('activity')}`);
    if (!coachIds.length) throw new HttpError(400, `Every ${vocab().class} needs at least one ${vocab().coach}`);
    for (const c of coachIds) if (!get('SELECT id FROM coaches WHERE id = ?', c)) throw new HttpError(400, `${vocab().Coach} not found`);
    if (findClass(activityId, coachIds, id))
      throw new HttpError(400, `That ${vocab().class} (${vocab().activity} + ${vocab().coaches}) already exists`);
    if (id) run('UPDATE classes SET activity_id = ? WHERE id = ?', activityId, id);
    else id = idOf('INSERT INTO classes (activity_id, coach_id) VALUES (?, ?)', activityId, coachIds[0]);
    setCoaches(id, coachIds);
    return { id };
  }

  // One-time class: POST /oneoffs creates, PUT /oneoffs/:id replaces, DELETE /oneoffs/:id removes.
  // Body: { date, area_id, start_time, end_time, class_id | (activity + coach), label, note, member_ids: [] }
  function saveOneOff(id, b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new HttpError(400, 'Pick a date');
    if (!(b.start_time < b.end_time)) throw new HttpError(400, 'The end time must be after the start time');
    if (!get('SELECT id FROM areas WHERE id = ?', b.area_id)) throw new HttpError(400, 'Pick a room');
    let classId = b.class_id ? Number(b.class_id) : null;
    if (!classId) {
      if (!b.activity?.trim() || !b.coach?.trim()) throw new HttpError(400, `Pick the ${vocab().activity} and the ${vocab().coach}`);
      classId = classFor(b.activity.trim(), b.coach.trim());
    }
    const vals = [b.date, Number(b.area_id), classId, b.start_time, b.end_time, b.label?.trim() || null, b.note?.trim() || null];
    if (id) {
      if (!get('SELECT id FROM one_offs WHERE id = ?', id)) throw new HttpError(404, `${vocab().OneOff} not found`);
      run('UPDATE one_offs SET date = ?, area_id = ?, class_id = ?, start_time = ?, end_time = ?, label = ?, note = ? WHERE id = ?', ...vals, id);
      run('DELETE FROM one_off_members WHERE one_off_id = ?', id);
    } else {
      id = idOf('INSERT INTO one_offs (date, area_id, class_id, start_time, end_time, label, note) VALUES (?, ?, ?, ?, ?, ?, ?)', ...vals);
    }
    for (const m of new Set((b.member_ids || []).map(Number))) run('INSERT INTO one_off_members (one_off_id, member_id) VALUES (?, ?)', id, m);
    return { id };
  }

  // Change one weekly class on one date only: POST /changes creates or replaces it, DELETE /changes/:id undoes it.
  // Body: { date, slot_id, class_id, cancelled?, new_date?, area_id?, start_time?, end_time?, new_class_id | (activity + coach)?, note? }
  // Leaving a field out keeps it as the package has it.
  function saveChange(b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new HttpError(400, 'Which date?');
    if (!get('SELECT id FROM slots WHERE id = ?', b.slot_id) || !get('SELECT id FROM classes WHERE id = ?', b.class_id))
      throw new HttpError(400, `${vocab().Class} not found`);
    if (b.new_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.new_date)) throw new HttpError(400, 'Pick a date');
    if (b.area_id && !get('SELECT id FROM areas WHERE id = ?', b.area_id)) throw new HttpError(400, 'Pick a room');
    if ((b.start_time || b.end_time) && !(b.start_time < b.end_time)) throw new HttpError(400, 'The end time must be after the start time');
    let newClass = b.new_class_id ? Number(b.new_class_id) : null;
    if (!newClass && b.activity?.trim() && b.coach?.trim()) newClass = classFor(b.activity.trim(), b.coach.trim());
    if (newClass === Number(b.class_id)) newClass = null;
    const vals = [
      b.cancelled ? 1 : 0,
      b.new_date && b.new_date !== b.date ? b.new_date : null,
      b.area_id ? Number(b.area_id) : null,
      b.start_time || null,
      b.end_time || null,
      newClass,
      b.note?.trim() || null,
    ];
    run(
      `INSERT INTO session_changes (date, slot_id, class_id, cancelled, new_date, area_id, start_time, end_time, new_class_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (date, slot_id, class_id) DO UPDATE SET cancelled = excluded.cancelled, new_date = excluded.new_date, area_id = excluded.area_id,
         start_time = excluded.start_time, end_time = excluded.end_time, new_class_id = excluded.new_class_id, note = excluded.note`,
      b.date,
      Number(b.slot_id),
      Number(b.class_id),
      ...vals,
    );
    return { id: get('SELECT id FROM session_changes WHERE date = ? AND slot_id = ? AND class_id = ?', b.date, b.slot_id, b.class_id).id };
  }

  // Turn a bundle session into { slot_id, class_id }. A session is either an existing pair, or
  // { new: { key, activity, coach, label, day, start_time, end_time, area_id? } } — a class made
  // right in the package form. Missing activities/coaches/classes/slots are created; with no
  // area_id, the first room with nothing on at that time is used. `made` caches per request so
  // the same new class in several weeks maps to the same slot.
  function resolveSession(s, made) {
    if (!s.new) return s;
    const n = s.new;
    const cacheKey = `${n.key}:${n.day}`;
    if (made.has(cacheKey)) return made.get(cacheKey);
    const activity = n.activity?.trim();
    const coach = n.coach?.trim();
    if (!activity || !coach) throw new HttpError(400, `A new ${vocab().class} needs ${vocab().a('activity')} and ${vocab().a('coach')}`);
    if (!(n.start_time < n.end_time)) throw new HttpError(400, `${activity}: the end time must be after the start time`);
    const day = Number(n.day);
    if (!(day >= 0 && day <= 6)) throw new HttpError(400, 'Bad day');

    const classId = classFor(activity, coach);

    let areaId = n.area_id ? Number(n.area_id) : null;
    if (!areaId) {
      const free = get(
        `SELECT a.id FROM areas a WHERE NOT EXISTS (
           SELECT 1 FROM slots s WHERE s.area_id = a.id AND s.day = ? AND s.active = 1
             AND s.start_time < ? AND s.end_time > ?
             AND EXISTS (SELECT 1 FROM package_entries e WHERE e.slot_id = s.id))
         ORDER BY a.sort, a.id LIMIT 1`,
        day,
        n.end_time,
        n.start_time,
      );
      areaId = free?.id ?? get('SELECT id FROM areas ORDER BY sort, id LIMIT 1')?.id;
      if (!areaId) throw new HttpError(400, 'Add a room first (Rooms & times)');
    }
    const label = n.label?.trim() || null;
    const slotId =
      get(
        `SELECT id FROM slots WHERE area_id = ? AND day = ? AND start_time = ? AND end_time = ? AND coalesce(label, '') = ? AND active = 1`,
        areaId,
        day,
        n.start_time,
        n.end_time,
        label ?? '',
      )?.id ??
      idOf('INSERT INTO slots (area_id, day, start_time, end_time, label) VALUES (?, ?, ?, ?, ?)', areaId, day, n.start_time, n.end_time, label);

    const out = { slot_id: slotId, class_id: classId };
    made.set(cacheKey, out);
    return out;
  }

  // A plan from a bundle as [label, classes_per_month, months, price]; price is for all the months together.
  function planValues(p) {
    const classes = p.classes_per_month == null || p.classes_per_month === '' ? null : Number(p.classes_per_month);
    if (classes != null && !(Number.isInteger(classes) && classes >= 1))
      throw new HttpError(400, `${vocab().Classes} a month must be a whole number of 1 or more`);
    const months = p.months == null || p.months === '' ? 1 : Number(p.months);
    if (!(Number.isInteger(months) && months >= 1)) throw new HttpError(400, 'Months must be a whole number of 1 or more');
    return [p.label?.trim() || null, classes, months, p.price === '' || p.price == null ? null : Number(p.price)];
  }

  function handle(method, resource, id, action, body, extra) {
    // Subscriptions: POST /packages/:id/members {member_id, plan_id, start_date, end_date} creates or updates,
    // DELETE /packages/:id/members/:memberId removes.
    if (resource === 'packages' && action === 'members') {
      if (method === 'POST') {
        if (body.start_date && body.end_date && body.end_date < body.start_date)
          throw new HttpError(400, 'Expiry must be on or after the start date');
        run(
          `INSERT INTO package_members (package_id, member_id, plan_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (package_id, member_id) DO UPDATE SET plan_id = excluded.plan_id, start_date = excluded.start_date, end_date = excluded.end_date`,
          id,
          body.member_id,
          body.plan_id ?? null,
          body.start_date || null,
          body.end_date || null,
        );
        return { id };
      }
      if (method === 'DELETE') {
        run('DELETE FROM package_members WHERE package_id = ? AND member_id = ?', id, extra);
        return { id };
      }
    }

    if (method === 'GET' && resource === 'state') return {};

    // Create a whole package in one go: POST /bundles
    // { name, anchor_date, cycle_length, sessions: [{ slot_id, class_id, week? } | { new: {…}, week? }], plans: [{ classes_per_month, months, price, label }] }
    // A session's `week` (default 1) is its week of the cycle. Runs inside the conflict guard, so it's all-or-nothing.
    if (method === 'POST' && resource === 'bundles') {
      if (!body.name?.trim()) throw new HttpError(400, 'Name is required');
      requireSunday(body.anchor_date, 'Start');
      const pkgId = Number(
        run(
          'INSERT INTO packages (name, anchor_date, cycle_length) VALUES (?, ?, ?)',
          body.name.trim(),
          body.anchor_date,
          Math.max(1, Number(body.cycle_length) || 1),
        ).lastInsertRowid,
      );
      const made = new Map();
      for (const s of body.sessions || []) {
        const { slot_id, class_id } = resolveSession(s, made);
        run(
          'INSERT OR IGNORE INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, ?)',
          pkgId,
          slot_id,
          class_id,
          Math.max(1, Number(s.week) || 1),
        );
      }
      for (const p of body.plans || []) {
        run('INSERT INTO package_plans (package_id, label, classes_per_month, months, price) VALUES (?, ?, ?, ?, ?)', pkgId, ...planValues(p));
      }
      return { id: pkgId };
    }

    // Replace a package's classes: PUT /bundles/:id { sessions: [{ slot_id, class_id, week }] } replaces every week,
    // or { week, sessions } replaces just that week. Optionally also { name, anchor_date, end_date, cycle_length, plans },
    // so the whole package can be edited in one all-or-nothing save. Plans with an id are updated, plans without one
    // are added, and the package's other plans are deleted (their subscribers keep their subscription, with no plan).
    if (method === 'PUT' && resource === 'bundles' && id) {
      const pkg = get('SELECT * FROM packages WHERE id = ?', id);
      if (!pkg) throw new HttpError(404, `${vocab().Package} not found`);
      if ('name' in body && !body.name?.trim()) throw new HttpError(400, 'Name is required');
      if ('anchor_date' in body) requireSunday(body.anchor_date, 'Start');
      if (body.end_date) requireSunday(body.end_date, 'End date');
      const next = {
        name: 'name' in body ? body.name.trim() : pkg.name,
        anchor_date: body.anchor_date ?? pkg.anchor_date,
        end_date: 'end_date' in body ? body.end_date || null : pkg.end_date,
        cycle_length: 'cycle_length' in body ? Math.max(1, Number(body.cycle_length) || 1) : pkg.cycle_length,
      };
      if (next.end_date && next.end_date <= next.anchor_date) throw new HttpError(400, 'The end can’t be before the start');
      run(
        'UPDATE packages SET name = ?, anchor_date = ?, end_date = ?, cycle_length = ? WHERE id = ?',
        next.name,
        next.anchor_date,
        next.end_date,
        next.cycle_length,
        id,
      );
      run('DELETE FROM package_entries WHERE package_id = ? AND week_position > ?', id, next.cycle_length);
      if (Array.isArray(body.plans)) {
        const keep = new Set(body.plans.filter((p) => p.id).map((p) => Number(p.id)));
        for (const { id: planId } of db.prepare('SELECT id FROM package_plans WHERE package_id = ?').all(id)) {
          if (!keep.has(planId)) run('DELETE FROM package_plans WHERE id = ?', planId);
        }
        for (const p of body.plans) {
          const vals = planValues(p);
          if (p.id && keep.has(Number(p.id)))
            run(
              'UPDATE package_plans SET label = ?, classes_per_month = ?, months = ?, price = ? WHERE id = ? AND package_id = ?',
              ...vals,
              Number(p.id),
              id,
            );
          else run('INSERT INTO package_plans (package_id, label, classes_per_month, months, price) VALUES (?, ?, ?, ?, ?)', id, ...vals);
        }
      }
      // Classes are only replaced when the request lists them; an edit of just the name, dates or plans keeps them.
      if (!Array.isArray(body.sessions)) return { id };
      const only = body.week ? Math.max(1, Number(body.week) || 1) : null;
      if (only) run('DELETE FROM package_entries WHERE package_id = ? AND week_position = ?', id, only);
      else run('DELETE FROM package_entries WHERE package_id = ?', id);
      const made = new Map();
      for (const s of body.sessions) {
        const { slot_id, class_id } = resolveSession(s, made);
        run(
          'INSERT OR IGNORE INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, ?)',
          id,
          slot_id,
          class_id,
          only ?? Math.max(1, Number(s.week) || 1),
        );
      }
      return { id };
    }
    if (resource === 'classes' && method === 'POST') return saveClass(null, body);
    if (resource === 'classes' && method === 'PUT' && id) return saveClass(id, body);
    if (resource === 'oneoffs') {
      if (method === 'POST') return saveOneOff(null, body);
      if (method === 'PUT' && id) return saveOneOff(id, body);
      if (method === 'DELETE' && id) return (run('DELETE FROM one_offs WHERE id = ?', id), { id });
    }
    if (resource === 'changes') {
      if (method === 'POST') return saveChange(body);
      if (method === 'DELETE' && id) return (run('DELETE FROM session_changes WHERE id = ?', id), { id });
    }
    if (method === 'POST' && resource === 'reset') {
      if (!DEMO_DATA[body.demo]) throw new HttpError(400, `Unknown demo: pick ${Object.keys(DEMO_DATA).join(', ')}`);
      return (resetDb(db, body.demo), {});
    }
    // The business: PUT /settings { kind, name, currency }
    if (method === 'PUT' && resource === 'settings') {
      if ('kind' in body && !KINDS[body.kind]) throw new HttpError(400, 'Unknown kind of business');
      if ('currency' in body && !String(body.currency ?? '').trim()) throw new HttpError(400, 'Currency is required');
      return (saveSettings(db, body), {});
    }
    if (method === 'POST' && resource === 'clear') return (resetDb(db, 'empty'), {});

    // Close a package on `date` and start a successor anchored on the same date.
    if (method === 'POST' && resource === 'packages' && action === 'handover') {
      const old = get('SELECT * FROM packages WHERE id = ?', id);
      if (!old) throw new HttpError(404, `${vocab().Package} not found`);
      if (!body.date || body.date <= old.anchor_date) throw new HttpError(400, 'Handover date must be after the anchor date');
      requireSunday(body.date, 'Handover date');
      {
        run('UPDATE packages SET end_date = ? WHERE id = ?', body.date, id);
        const newId = Number(
          run(
            'INSERT INTO packages (name, anchor_date, end_date, cycle_length) VALUES (?, ?, NULL, ?)',
            body.name || `${old.name} (next)`,
            body.date,
            old.cycle_length,
          ).lastInsertRowid,
        );
        if (body.copy) {
          run(
            `INSERT INTO package_entries (package_id, slot_id, class_id, week_position)
             SELECT ?, slot_id, class_id, week_position FROM package_entries WHERE package_id = ?`,
            newId,
            id,
          );
        }
        return { id: newId };
      }
    }

    const def = TABLES[resource];
    if (!def) throw new HttpError(404, 'Not found');
    const row = clean(def.cols, body);
    if (resource === 'packages') {
      if (row.anchor_date) requireSunday(row.anchor_date, 'Anchor date');
      if (row.end_date) requireSunday(row.end_date, 'End date');
    }

    if (method === 'POST' && resource === 'entries') {
      const p = get('SELECT cycle_length FROM packages WHERE id = ?', row.package_id);
      if (!p) throw new HttpError(400, `${vocab().Package} not found`);
      if (row.week_position > p.cycle_length) throw new HttpError(400, `Week ${row.week_position} is outside a ${p.cycle_length}-week cycle`);
      run(
        `INSERT INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, ?)
         ON CONFLICT (package_id, slot_id, week_position) DO UPDATE SET class_id = excluded.class_id`,
        row.package_id,
        row.slot_id,
        row.class_id,
        row.week_position,
      );
      const { id: entryId } = get(
        'SELECT id FROM package_entries WHERE package_id = ? AND slot_id = ? AND week_position = ?',
        row.package_id,
        row.slot_id,
        row.week_position,
      );
      return { id: entryId };
    }

    if (method === 'POST') {
      const cols = Object.keys(row);
      const info = run(`INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(row));
      return { id: Number(info.lastInsertRowid) };
    }

    if (method === 'PUT' && id) {
      const cols = Object.keys(row);
      if (!cols.length) return { id };
      run(`UPDATE ${def.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...Object.values(row), id);
      // Shrinking a cycle drops entries for weeks that no longer exist.
      if (resource === 'packages' && row.cycle_length) {
        run('DELETE FROM package_entries WHERE package_id = ? AND week_position > ?', id, row.cycle_length);
      }
      return { id };
    }

    if (method === 'DELETE' && id) {
      run(`DELETE FROM ${def.table} WHERE id = ?`, id);
      return { id };
    }

    throw new HttpError(405, 'Method not allowed');
  }

  return async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://local');
      if (req.method === 'GET' && pathname === '/export') {
        const data = exportData(db);
        res.setHeader('content-disposition', `attachment; filename="schedule-data-${data.exportedAt.slice(0, 10)}.json"`);
        res.setHeader('cache-control', 'no-store');
        send(res, 200, data);
        return;
      }
      const [resource, rawId, action, rawExtra] = pathname.split('/').filter(Boolean);
      const body = req.method === 'POST' || req.method === 'PUT' ? await readJson(req) : {};
      const args = [req.method, resource, rawId ? Number(rawId) : null, action, body, rawExtra ? Number(rawExtra) : null];
      const result = req.method === 'GET' || ['reset', 'clear', 'settings'].includes(resource) ? handle(...args) : guarded(() => handle(...args));
      send(res, 200, { ...result, state: { ...getState(db), playground } });
    } catch (e) {
      send(res, e.status || 400, { error: friendly(e) });
    }
  };
}
