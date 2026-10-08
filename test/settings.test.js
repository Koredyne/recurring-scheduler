import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { playground } from '../server/playground.js';
import { setup, smallGym } from './helpers.js';

describe('PUT /settings', () => {
  it('saves the kind, name and currency, and messages use the new words', async () => {
    const { call } = smallGym();
    const r = await call('PUT', '/settings', { kind: 'office', name: 'Northgate', currency: 'USD' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.state.settings, { kind: 'office', name: 'Northgate', currency: 'USD' });
    const bad = await call('POST', '/classes', { activity_id: 999999, coach_ids: [] });
    assert.equal(bad.status, 400);
    assert.match(bad.error, /meeting type/);
  });
  it('refuses an unknown kind and an empty currency', async () => {
    const { call } = setup();
    assert.equal((await call('PUT', '/settings', { kind: 'spaceship' })).status, 400);
    assert.equal((await call('PUT', '/settings', { currency: ' ' })).status, 400);
  });
  it('loads any demo by key', async () => {
    const { call } = setup();
    const r = await call('POST', '/reset', { demo: 'clinic' });
    assert.equal(r.state.settings.kind, 'clinic');
    assert.ok(r.state.packages.length > 0);
  });
});

// Calls the playground handler directly, as a visitor with the given cookie.
async function visit(pg, method, url, cookie, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, { method, url, headers: cookie ? { cookie } : {} });
  let out = '';
  const headers = {};
  await pg.handle(req, { statusCode: 200, setHeader: (k, v) => (headers[k] = v), end: (s) => (out = s) });
  return { cookie: headers['set-cookie']?.split(';')[0] ?? cookie, ...JSON.parse(out) };
}

describe('playground', () => {
  it('gives each visitor their own copy of the demo', async () => {
    const pg = playground();
    const a = await visit(pg, 'GET', '/state');
    const b = await visit(pg, 'GET', '/state');
    assert.ok(a.cookie && b.cookie && a.cookie !== b.cookie);
    assert.equal(a.state.playground, true);

    await visit(pg, 'POST', '/clear', a.cookie);
    assert.equal((await visit(pg, 'GET', '/state', a.cookie)).state.packages.length, 0);
    assert.ok((await visit(pg, 'GET', '/state', b.cookie)).state.packages.length > 0);
    pg.close();
  });
  it('drops the least recently used copy when full', async () => {
    const pg = playground({ max: 2 });
    const a = await visit(pg, 'POST', '/clear');
    await visit(pg, 'GET', '/state');
    await visit(pg, 'GET', '/state');
    const again = await visit(pg, 'GET', '/state', a.cookie);
    assert.notEqual(again.cookie, a.cookie, 'a new copy, since the old one was dropped');
    assert.ok(again.state.packages.length > 0);
    pg.close();
  });
});
