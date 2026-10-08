import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

// Make a database as it was before plan lengths and multi-coach classes: plans without `months`,
// classes with UNIQUE (activity_id, coach_id), no class_coaches table. Starts from the Gym demo,
// plus a day change so rows that point at classes are covered.
function oldDatabase(file) {
  const db = openDb(file);
  const e = db.prepare('SELECT slot_id, class_id FROM package_entries LIMIT 1').get();
  db.prepare('INSERT INTO session_changes (date, slot_id, class_id, cancelled) VALUES (?, ?, ?, 1)').run('2026-10-20', e.slot_id, e.class_id);
  db.exec(`PRAGMA foreign_keys = OFF;
    DROP TABLE class_coaches;
    CREATE TABLE classes_old (
      id INTEGER PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES activities(id),
      coach_id INTEGER NOT NULL REFERENCES coaches(id),
      UNIQUE (activity_id, coach_id));
    INSERT INTO classes_old SELECT id, activity_id, coach_id FROM classes;
    DROP TABLE classes;
    ALTER TABLE classes_old RENAME TO classes;
    ALTER TABLE package_plans DROP COLUMN months;`);
  db.close();
}

// The old file opened without running the upgrade.
const openRaw = (file) => new DatabaseSync(file);

// node:sqlite rows have a null prototype; plain copies compare cleanly.
const rows = (db, sql) => db.prepare(sql).all().map((r) => ({ ...r }));
const snapshot = (db) => ({
  classes: rows(db, 'SELECT id, activity_id, coach_id FROM classes ORDER BY id'),
  entries: db.prepare('SELECT count(*) AS n FROM package_entries').get().n,
  changes: rows(db, 'SELECT date, slot_id, class_id, cancelled FROM session_changes'),
  prices: rows(db, 'SELECT id, classes_per_month, price FROM package_plans ORDER BY id'),
});

describe('upgrading an older database', () => {
  let dir, file, beforeUpgrade, db;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-test-'));
    file = path.join(dir, 'old.db');
    oldDatabase(file);
    const raw = openRaw(file);
    beforeUpgrade = snapshot(raw);
    raw.close();
    db = openDb(file);
  });
  after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('gives every existing plan a length of 1 month and keeps its price', () => {
    const plans = rows(db, 'SELECT id, classes_per_month, price, months FROM package_plans ORDER BY id');
    assert.ok(plans.length > 0);
    assert.ok(plans.every((p) => p.months === 1));
    assert.deepEqual(plans.map(({ months, ...p }) => ({ ...p })), beforeUpgrade.prices);
  });

  it('drops the one-coach-per-activity rule without losing classes or what points at them', () => {
    assert.doesNotMatch(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'classes'").get().sql, /UNIQUE/i);
    const now = snapshot(db);
    assert.deepEqual(now.classes, beforeUpgrade.classes);
    assert.equal(now.entries, beforeUpgrade.entries);
    assert.deepEqual(now.changes, beforeUpgrade.changes);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });

  it('adds class_coaches and foreign keys are back on', () => {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'class_coaches'").get());
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  });

  it('opening the database again changes nothing', () => {
    const once = snapshot(db);
    db.close();
    db = openDb(file);
    assert.deepEqual(snapshot(db), once);
  });
});
