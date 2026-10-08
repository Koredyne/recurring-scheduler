import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../src/lib/vocab.js';
import { DEMO_DATA } from './demos/index.js';
import { seedDemo } from './demos/seed.js';

const SCHEMA = `
-- The business: what kind it is (which words the screens use), its name and currency. Key/value rows.
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

CREATE TABLE IF NOT EXISTS areas (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

-- Config lists, so classes pick from them instead of free text
CREATE TABLE IF NOT EXISTS coaches (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS activities (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE,
  color  TEXT
);

-- Class = what & who. coach_id is the main coach; class_coaches holds any others who teach it with them.
-- The same activity can be several classes (Boxing with Marco; Boxing with Marco + an assistant);
-- the API refuses two classes with the same activity and the same coaches.
CREATE TABLE IF NOT EXISTS classes (
  id           INTEGER PRIMARY KEY,
  activity_id  INTEGER NOT NULL REFERENCES activities(id),
  coach_id     INTEGER NOT NULL REFERENCES coaches(id)
);
CREATE TABLE IF NOT EXISTS class_coaches (
  class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  coach_id  INTEGER NOT NULL REFERENCES coaches(id),
  sort      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (class_id, coach_id)
);

-- Slot = when & where (day: 0 = Sunday)
CREATE TABLE IF NOT EXISTS slots (
  id              INTEGER PRIMARY KEY,
  area_id         INTEGER NOT NULL REFERENCES areas(id),
  day             INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  label           TEXT,
  capacity        INTEGER,
  type            TEXT,
  buffer_minutes  INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  CHECK (end_time > start_time)
);

-- Package = the rotation. end_date is exclusive (first day it no longer runs).
CREATE TABLE IF NOT EXISTS packages (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  anchor_date   TEXT NOT NULL,
  end_date      TEXT,
  cycle_length  INTEGER NOT NULL CHECK (cycle_length >= 1),
  CHECK (end_date IS NULL OR end_date > anchor_date)
);

-- Plans = how a package is sold: classes per month (NULL = all classes), for how many months,
-- and the price (KD) for all of those months together.
-- The same package (which sessions you can attend) can be sold as e.g. 12 classes for 1 month or 24 for 6.
CREATE TABLE IF NOT EXISTS package_plans (
  id                 INTEGER PRIMARY KEY,
  package_id         INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  label              TEXT,
  classes_per_month  INTEGER,
  months             INTEGER NOT NULL DEFAULT 1 CHECK (months >= 1),
  price              REAL
);

-- Members and their subscriptions: which package, on which plan, from start to expiry (inclusive).
CREATE TABLE IF NOT EXISTS members (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT
);
CREATE TABLE IF NOT EXISTS package_members (
  package_id  INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id     INTEGER REFERENCES package_plans(id) ON DELETE SET NULL,
  start_date  TEXT,
  end_date    TEXT,
  PRIMARY KEY (package_id, member_id)
);

-- "This class, in this slot, on this week of the cycle."
CREATE TABLE IF NOT EXISTS package_entries (
  id             INTEGER PRIMARY KEY,
  package_id     INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  slot_id        INTEGER NOT NULL REFERENCES slots(id),
  class_id       INTEGER NOT NULL REFERENCES classes(id),
  week_position  INTEGER NOT NULL CHECK (week_position >= 1),
  UNIQUE (package_id, slot_id, week_position)
);

-- One-time class: a single dated session outside any package (a private lesson, a trial…),
-- with the members booked into it. It never repeats.
CREATE TABLE IF NOT EXISTS one_offs (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  area_id     INTEGER NOT NULL REFERENCES areas(id),
  class_id    INTEGER NOT NULL REFERENCES classes(id),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  label       TEXT,
  note        TEXT,
  CHECK (end_time > start_time)
);
-- A change to one weekly class on one date only, made from the Schedule: cancelled, or moved
-- (another date, time or room) or taught by someone else. The package itself is untouched.
-- (date, slot_id, class_id) is the class as the package puts it; the rest is what happens instead.
CREATE TABLE IF NOT EXISTS session_changes (
  id            INTEGER PRIMARY KEY,
  date          TEXT NOT NULL,
  slot_id       INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  cancelled     INTEGER NOT NULL DEFAULT 0,
  new_date      TEXT,
  area_id       INTEGER REFERENCES areas(id),
  start_time    TEXT,
  end_time      TEXT,
  new_class_id  INTEGER REFERENCES classes(id),
  note          TEXT,
  UNIQUE (date, slot_id, class_id)
);
CREATE TABLE IF NOT EXISTS one_off_members (
  one_off_id  INTEGER NOT NULL REFERENCES one_offs(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (one_off_id, member_id)
);
`;

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // Databases from before coaches/activities existed: start over with the new schema.
  const old = db.prepare("SELECT 1 FROM pragma_table_info('classes') WHERE name = 'activity'").get();
  if (old) db.exec('DROP TABLE IF EXISTS package_entries; DROP TABLE IF EXISTS packages; DROP TABLE IF EXISTS slots; DROP TABLE IF EXISTS classes; DROP TABLE IF EXISTS areas;');
  // Databases from before classes could have several coaches: drop UNIQUE (activity_id, coach_id) by rebuilding
  // the table. Foreign keys are off meanwhile so the rows that point at classes are left alone.
  if (/UNIQUE/i.test(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'classes'").get()?.sql ?? '')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    transaction(db, () =>
      db.exec(`CREATE TABLE classes_new (
                 id           INTEGER PRIMARY KEY,
                 activity_id  INTEGER NOT NULL REFERENCES activities(id),
                 coach_id     INTEGER NOT NULL REFERENCES coaches(id));
               INSERT INTO classes_new (id, activity_id, coach_id) SELECT id, activity_id, coach_id FROM classes;
               DROP TABLE classes;
               ALTER TABLE classes_new RENAME TO classes;`),
    );
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Databases from before plans existed: add the subscription columns.
  const cols = new Set(db.prepare("SELECT name FROM pragma_table_info('package_members')").all().map((c) => c.name));
  if (!cols.has('plan_id')) {
    db.exec(`ALTER TABLE package_members ADD COLUMN plan_id INTEGER REFERENCES package_plans(id) ON DELETE SET NULL;
             ALTER TABLE package_members ADD COLUMN start_date TEXT;
             ALTER TABLE package_members ADD COLUMN end_date TEXT;`);
  }
  // Databases from before plan lengths existed: every plan was one month (so its price stays the same).
  if (!db.prepare("SELECT 1 FROM pragma_table_info('package_plans') WHERE name = 'months'").get()) {
    db.exec('ALTER TABLE package_plans ADD COLUMN months INTEGER NOT NULL DEFAULT 1 CHECK (months >= 1);');
  }
  // A brand-new database starts with the Gym demo.
  if (!db.prepare('SELECT COUNT(*) AS n FROM areas').get().n) transaction(db, () => loadDemo(db, 'gym'));
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export function saveSettings(db, values) {
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (key in values) put.run(key, values[key] == null ? null : String(values[key]).trim());
}

function loadDemo(db, key) {
  const demo = DEMO_DATA[key];
  seedDemo(db, demo);
  saveSettings(db, demo.settings);
}

// demo: a key of DEMO_DATA ('gym', 'clinic', 'office'), or 'empty' to clear the data and keep the settings.
export function resetDb(db, demo = 'gym') {
  transaction(db, () => {
    db.exec('DELETE FROM session_changes; DELETE FROM one_off_members; DELETE FROM one_offs; DELETE FROM package_members; DELETE FROM package_plans; DELETE FROM members; DELETE FROM package_entries; DELETE FROM packages; DELETE FROM slots; DELETE FROM class_coaches; DELETE FROM classes; DELETE FROM coaches; DELETE FROM activities; DELETE FROM areas;');
    if (DEMO_DATA[demo]) loadDemo(db, demo);
  });
}

export function getState(db) {
  // Every coach of a class, main coach first: { class_id: [{ id, name }] } for the extra ones.
  const extra = new Map();
  for (const r of db
    .prepare('SELECT cc.class_id, co.id, co.name FROM class_coaches cc JOIN coaches co ON co.id = cc.coach_id ORDER BY cc.class_id, cc.sort, co.name')
    .all()) {
    extra.set(r.class_id, [...(extra.get(r.class_id) || []), r]);
  }
  return {
    settings: getSettings(db),
    areas: db.prepare('SELECT * FROM areas ORDER BY sort, id').all(),
    coaches: db.prepare('SELECT * FROM coaches ORDER BY name').all(),
    activities: db.prepare('SELECT * FROM activities ORDER BY name').all(),
    // Names are joined in so the rest of the app can keep using cls.activity / cls.coach.
    // coach_ids / coaches list every coach (main first); coach is them all as one name, "Marco Reyes & Sara".
    classes: db
      .prepare(
        `SELECT c.id, c.activity_id, c.coach_id, a.name AS activity, a.color AS color, co.name AS coach
         FROM classes c JOIN activities a ON a.id = c.activity_id JOIN coaches co ON co.id = c.coach_id
         ORDER BY a.name, co.name`,
      )
      .all()
      .map((c) => {
        const all = [{ id: c.coach_id, name: c.coach }, ...(extra.get(c.id) || [])];
        return { ...c, coach_ids: all.map((x) => x.id), coaches: all.map((x) => x.name), coach: all.map((x) => x.name).join(' & ') };
      }),
    slots: db.prepare('SELECT * FROM slots ORDER BY area_id, day, start_time').all(),
    packages: db.prepare('SELECT * FROM packages ORDER BY anchor_date, id').all(),
    plans: db.prepare('SELECT * FROM package_plans ORDER BY package_id, classes_per_month IS NULL, classes_per_month, price').all(),
    members: db.prepare('SELECT * FROM members ORDER BY name').all(),
    packageMembers: db.prepare('SELECT * FROM package_members').all(),
    entries: db.prepare('SELECT * FROM package_entries ORDER BY package_id, slot_id, week_position').all(),
    oneOffs: db.prepare('SELECT * FROM one_offs ORDER BY date, start_time').all(),
    oneOffMembers: db.prepare('SELECT * FROM one_off_members').all(),
    changes: db.prepare('SELECT * FROM session_changes ORDER BY date').all(),
  };
}

// Export the stored rows, including join tables that the UI state reshapes or omits.
// Discover tables from SQLite so new tables are included without updating this list.
export function exportData(db) {
  const tables = {};
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all();
  for (const { name } of names) {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    tables[name] = db.prepare(`SELECT * FROM ${quoted}`).all();
  }
  return { format: 'recurring-scheduler-export', version: 1, exportedAt: new Date().toISOString(), tables };
}

export const COLORS = ['#e5484d', '#6e8efb', '#4cc38a', '#f2994a', '#a78bfa', '#38bdb3', '#e879a6', '#d4b53c', '#5fa8e8', '#b8977a', '#93c25b', '#8f86e0'];
