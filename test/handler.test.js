import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHandler } from '../src/handler.js';

const published = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.json', 'utf8'));
const preview = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.preview.json', 'utf8'));
// A "live" snapshot: the preview records, as if all had been approved.
const liveSnap = { ...preview, includesPending: false, records: preview.records.map((r) => ({ ...r, publicationStatus: r.publicationStatus === 'pendingReview' ? 'published' : r.publicationStatus })) };
const assets = { fetch: async () => new Response('asset') };
const env = (extra = {}) => ({ ASSETS: assets, ATLAS_PREVIEW_HOSTS: 'obligations-atlas-test.triodian.com', ...extra });
const get = async (h, host, path, e) => { const r = await h(new Request(`https://${host}${path}`), e, { waitUntil: () => {} }); return { status: r.status, body: path === '/' ? await r.text() : await r.json() }; };

test('the test domain serves the preview data; the live domain serves published records', async () => {
  const h = createHandler({ published, preview, fetchImpl: async () => { throw new Error('no network'); } });
  const t = await get(h, 'obligations-atlas-test.triodian.com', '/api/v1', env());
  assert.equal(t.body.preview, true);
  assert.equal(t.body.counts.obligations, 48);
  const l = await get(h, 'obligations-atlas.triodian.com', '/api/v1', env());
  assert.equal(l.body.preview, false);
  assert.equal(l.body.counts.obligations, 0);
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/healthz', env())).body.data, 'bundled');
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/', env())).body, 'asset');
});

test('with FABRIC_READ_TOKEN the live domain reads published records from the Fabric, with caching', async () => {
  let calls = 0; let auth;
  let clock = 1_000_000;
  const h = createHandler({ published, preview, now: () => clock, fetchImpl: async (url, init) => { calls++; auth = init.headers.authorization; assert.match(url, /\/governance\/v1\/snapshot\/ai-obligations-atlas$/); return Response.json(liveSnap); } });
  const e = env({ FABRIC_READ_TOKEN: 'tok', FABRIC_URL: 'https://fabric.example/governance/v1' });
  const r = await get(h, 'obligations-atlas.triodian.com', '/api/v1/obligations?jurisdiction=AU', e);
  assert.ok(r.body.total > 20);
  assert.equal(auth, 'Bearer tok');
  await get(h, 'obligations-atlas.triodian.com', '/api/v1', e);
  assert.equal(calls, 1, 'cached within ATLAS_CACHE_SECONDS');
  clock += 301_000;
  await get(h, 'obligations-atlas.triodian.com', '/api/v1', e);
  assert.equal(calls, 2, 'refreshed after the cache expires');
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/healthz', e)).body.data, 'fabric');
  // the test domain is unaffected by live data
  assert.equal((await get(h, 'obligations-atlas-test.triodian.com', '/api/v1', e)).body.preview, true);
});

test('if the Fabric cannot be reached, the live domain falls back and reports the error', async () => {
  const h = createHandler({ published, preview, fetchImpl: async () => new Response('nope', { status: 503 }) });
  const e = env({ FABRIC_READ_TOKEN: 'tok' });
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/api/v1', e)).status, 200);
  const hz = await get(h, 'obligations-atlas.triodian.com', '/healthz', e);
  assert.equal(hz.body.data, 'bundled');
  assert.match(hz.body.liveError, /503/);
});

test('a malformed Fabric response is not served', async () => {
  const h = createHandler({ published, preview, fetchImpl: async () => Response.json({ records: 'x' }) });
  const hz = await get(h, 'obligations-atlas.triodian.com', '/healthz', env({ FABRIC_READ_TOKEN: 'tok' }));
  assert.equal(hz.body.data, 'bundled');
  assert.match(hz.body.liveError, /unexpected shape/);
});
