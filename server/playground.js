import crypto from 'node:crypto';
import { openDb } from './db.js';
import { apiMiddleware } from './api.js';

// Public demo mode (PLAYGROUND=1): every visitor gets a private in-memory copy of the demo data, keyed
// by a cookie, so people can drag, cancel and delete freely without changing what anyone else sees.
// A copy is dropped after `idleMinutes` without a request; past `max` copies the least recently used goes.
export function playground({ max = 200, idleMinutes = 60 } = {}) {
  const boxes = new Map(); // id -> { db, api, seen }; Map order doubles as least-recently-used order

  const drop = (id) => {
    boxes.get(id)?.db.close();
    boxes.delete(id);
  };
  const sweep = () => {
    const cutoff = Date.now() - idleMinutes * 60_000;
    for (const [id, box] of boxes) if (box.seen < cutoff) drop(id);
  };
  setInterval(sweep, 5 * 60_000).unref();

  return {
    handle(req, res) {
      let id = /(?:^|;\s*)sandbox=([\w-]{36})/.exec(req.headers.cookie ?? '')?.[1];
      let box = id && boxes.get(id);
      if (!box) {
        id = crypto.randomUUID();
        if (boxes.size >= max) drop(boxes.keys().next().value);
        const db = openDb(':memory:'); // a new database starts with the Gym demo
        box = { db, api: apiMiddleware(db, { playground: true }) };
        res.setHeader('set-cookie', `sandbox=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      }
      boxes.delete(id); // re-insert so this copy becomes the most recently used
      boxes.set(id, box);
      box.seen = Date.now();
      return box.api(req, res);
    },
    close() {
      for (const id of [...boxes.keys()]) drop(id);
    },
  };
}
