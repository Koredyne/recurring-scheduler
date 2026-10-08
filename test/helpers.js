import { Readable } from 'node:stream';
import { openDb, resetDb } from '../server/db.js';
import { apiMiddleware } from '../server/api.js';
import { todayStr, weekStart } from '../src/lib/dates.js';

// An empty in-memory database and a client that calls the API handler directly (no HTTP server).
// `call('PUT', '/bundles/1', body)` → { status, ...json } where json is { id?, state } or { error }.
export function setup() {
  const db = openDb(':memory:');
  resetDb(db, 'empty');
  const handler = apiMiddleware(db);
  const call = async (method, url, body) => {
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = method;
    req.url = url;
    let out = '';
    const headers = {};
    const res = { statusCode: 200, setHeader: (name, value) => (headers[name] = value), end: (s) => (out = s) };
    await handler(req, res);
    return { status: res.statusCode, headers, ...JSON.parse(out) };
  };
  const ins = (sql, ...p) => Number(db.prepare(sql).run(...p).lastInsertRowid);
  return { db, call, ins };
}

// A small gym: two rooms, three coaches, Boxing with A, Kickboxing with B, and three Sunday class times.
// Package "Boxing" (weekly, from this week's Sunday) has Boxing/A in Ring 10–11.
export function smallGym() {
  const t = setup();
  const { ins } = t;
  const ring = ins("INSERT INTO areas (name, sort) VALUES ('Ring', 0)");
  const mat = ins("INSERT INTO areas (name, sort) VALUES ('Mat', 1)");
  const A = ins("INSERT INTO coaches (name) VALUES ('Coach A')");
  const B = ins("INSERT INTO coaches (name) VALUES ('Coach B')");
  const C = ins("INSERT INTO coaches (name) VALUES ('Coach C')");
  const boxing = ins("INSERT INTO activities (name) VALUES ('Boxing')");
  const kick = ins("INSERT INTO activities (name) VALUES ('Kickboxing')");
  const boxA = ins('INSERT INTO classes (activity_id, coach_id) VALUES (?, ?)', boxing, A);
  const kickB = ins('INSERT INTO classes (activity_id, coach_id) VALUES (?, ?)', kick, B);
  const slot = (area, start, end) => ins('INSERT INTO slots (area_id, day, start_time, end_time) VALUES (?, 0, ?, ?)', area, start, end);
  const ring10 = slot(ring, '10:00', '11:00');
  const mat10 = slot(mat, '10:00', '11:00');
  const ring11 = slot(ring, '11:00', '12:00');
  const sunday = weekStart(todayStr());
  const pkg = ins("INSERT INTO packages (name, anchor_date, cycle_length) VALUES ('Boxing', ?, 1)", sunday);
  ins('INSERT INTO package_entries (package_id, slot_id, class_id, week_position) VALUES (?, ?, ?, 1)', pkg, ring10, boxA);
  return { ...t, ids: { ring, mat, A, B, C, boxing, kick, boxA, kickB, ring10, mat10, ring11, pkg }, sunday };
}
