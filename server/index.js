// Production server: serves the built app from dist/ and the SQLite API at /api.
// (In development, `npm run dev` runs the same API inside the Vite dev server instead.)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { apiMiddleware } from './api.js';
import { playground } from './playground.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 3000;
// PLAYGROUND=1 gives every visitor their own in-memory copy of the demo (for a public link); otherwise
// everyone shares the database file.
const sandboxes = process.env.PLAYGROUND === '1' ? playground() : null;
const db = sandboxes ? null : openDb(process.env.DB_FILE || path.join(root, 'data/schedule.db'));
const api = sandboxes ? sandboxes.handle : apiMiddleware(db);

// Optional password: set BASIC_AUTH="user:password" to require a login.
const auth = process.env.BASIC_AUTH ? `Basic ${Buffer.from(process.env.BASIC_AUTH).toString('base64')}` : null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  let file = path.join(dist, path.normalize(pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http
  .createServer((req, res) => {
    if (auth && req.headers.authorization !== auth) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Timetable"' });
      return res.end('Login required');
    }
    if (req.url === '/api' || req.url.startsWith('/api/')) {
      req.url = req.url.slice(4) || '/';
      return api(req, res);
    }
    serveStatic(req, res);
  })
  .listen(port, () => console.log(`Running on http://localhost:${port}${sandboxes ? ' (playground: a private copy per visitor)' : ''}`));

// Railway sends SIGTERM when replacing a deployment: finish in-flight requests, close the DB, exit cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      db?.close();
      sandboxes?.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
