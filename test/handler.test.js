import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHandler } from '../src/handler.js';
import { Atlas, sha256Hex as sha256 } from '../src/core/atlas.js';

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
  assert.equal(t.body.counts.obligations, new Atlas(preview, { preview: true }).findObligations({}).length);
  const l = await get(h, 'obligations-atlas.triodian.com', '/api/v1', env());
  assert.equal(l.body.preview, false);
  assert.equal(l.body.counts.obligations, new Atlas(published, { preview: false }).findObligations({}).length);
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/healthz', env())).body.data, 'bundled');
  assert.equal((await get(h, 'obligations-atlas.triodian.com', '/', env())).body, 'asset');
});

test('with FABRIC_READ_TOKEN the live domain reads published records from the Fabric, with caching', async () => {
  let calls = 0; let auth;
  let clock = 1_000_000;
  const h = createHandler({ published, preview, now: () => clock, fetchImpl: async (url, init) => {
    if (/\/firms\/v1\//.test(url)) return Response.json({ items: [] });
    calls++; auth = init.headers.authorization; assert.match(url, /\/governance\/v1\/snapshot\/ai-obligations-atlas$/); return Response.json(liveSnap);
  } });
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

test('firm registration, status and Bring in Triodian go to the Fabric firm registry; firm keys from the Fabric work', async () => {
  const seen = [];
  let directoryDown = false;
  const key = 'oa_test_key_123';
  const keyHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fetchImpl = async (url, init) => {
    seen.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization });
    if (url.endsWith('/firms/v1/ai-obligations-atlas/keys')) return Response.json({ items: [{ firm: 'Firm & Co', keySha256: keyHash, perMinute: 600 }] });
    if (url.endsWith('/firms/v1/ai-obligations-atlas/registrations')) return Response.json({ registrationID: 'FIRMREG-20261028000000-abcdef0123', status: 'pending' });
    if (/\/registrations\/FIRMREG-20261028000000-abcdef0123\/status$/.test(url)) return Response.json({ status: 'approved', apiKey: key });
    if (url.endsWith('/firms/v1/ai-obligations-atlas/contacts')) return Response.json({ contactID: 'CONTACT-1', status: 'new' });
    if (/\/registrations\/FIRMREG-20261028000000-abcdef0123\/listing$/.test(url)) return Response.json({ status: 'approved', listed: JSON.parse(init.body).listed });
    if (url.endsWith('/firms/v1/ai-obligations-atlas/directory')) return directoryDown ? new Response('no', { status: 502 }) : Response.json({ items: [{ firmID: 'firm-0123456789abcdef', firm: 'Firm & Co', roles: ['Fractional GC'], jurisdictions: ['AU'] }] });
    return Response.json(liveSnap);
  };
  const h = createHandler({ published, preview, fetchImpl });
  const e = env({ FABRIC_READ_TOKEN: 'tok', FABRIC_URL: 'https://fabric.example/governance/v1' });
  const post = async (path, body) => { const r = await h(new Request(`https://obligations-atlas.triodian.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), e, { waitUntil: () => {} }); return { status: r.status, body: await r.json() }; };
  const secret = 'a'.repeat(43);

  assert.equal((await post('/api/v1/firms/register', { name: 'Ada', email: 'ada@firm.example', firm: 'Firm', accessSecret: 'short' })).status, 400);
  const reg = await post('/api/v1/firms/register', { name: 'Ada', email: 'ada@firm.example', firm: 'Firm', accessSecret: secret });
  assert.equal(reg.body.status, 'pending');
  const sent = seen.find((x) => x.url.endsWith('/registrations'));
  assert.equal(sent.auth, 'Bearer tok');
  assert.equal(sent.body.site, 'obligations-atlas.triodian.com');
  assert.match(sent.body.accessSecretSha256, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(sent.body).includes(secret), 'the access secret itself never leaves the Atlas');

  const st = await post('/api/v1/firms/status', { registrationID: 'FIRMREG-20261028000000-abcdef0123', accessSecret: secret });
  assert.equal(st.body.apiKey, key);
  const ct = await post('/api/v1/firms/contact', { registrationID: 'FIRMREG-20261028000000-abcdef0123', accessSecret: secret, message: 'Help', scope: { jurisdictions: ['AU'] } });
  assert.equal(ct.body.status, 'new');

  const withKey = await h(new Request('https://obligations-atlas.triodian.com/api/v1/obligations', { headers: { 'x-api-key': key } }), e, { waitUntil: () => {} });
  assert.equal(withKey.status, 200, 'a key issued through the Fabric is accepted');
  const bad = await h(new Request('https://obligations-atlas.triodian.com/api/v1/obligations', { headers: { 'x-api-key': 'oa_unknown' } }), e, { waitUntil: () => {} });
  assert.equal(bad.status, 401);

  // The practitioner directory (task 5.4): the firm's own choice goes to the Fabric; the list is open and holds no person.
  const withList = await post('/api/v1/firms/register', { name: 'Ada', email: 'ada@firm.example', firm: 'Firm', accessSecret: secret, listed: true });
  assert.equal(withList.status, 200);
  assert.equal(seen.filter((x) => x.url.endsWith('/registrations')).pop().body.listed, true);
  assert.equal(sent.body.listed, undefined, 'not listed unless the firm asks');
  const ls = await post('/api/v1/firms/listing', { registrationID: 'FIRMREG-20261028000000-abcdef0123', accessSecret: secret, listed: true });
  assert.equal(ls.body.listed, true);
  const lsSent = seen.find((x) => /\/listing$/.test(x.url));
  assert.deepEqual(Object.keys(lsSent.body).sort(), ['accessSecretSha256', 'listed']);
  const getDir = async () => { const r = await h(new Request('https://obligations-atlas.triodian.com/api/v1/firms/directory'), e, { waitUntil: () => {} }); return { status: r.status, body: await r.json() }; };
  const dir = await getDir();
  assert.equal(dir.status, 200, 'open without a key');
  assert.deepEqual(dir.body, { format: 'triodian.practitionerDirectory/1', available: true, items: [{ firmID: 'firm-0123456789abcdef', firm: 'Firm & Co', roles: ['Fractional GC'], jurisdictions: ['AU'] }] });
  // The registry cannot be reached: the last good list is served, marked unavailable.
  directoryDown = true;
  await post('/api/v1/firms/listing', { registrationID: 'FIRMREG-20261028000000-abcdef0123', accessSecret: secret, listed: false }); // clears the cache
  const down = await getDir();
  assert.equal(down.body.available, false);
  assert.equal(down.body.items.length, 1);

  const noFabric = createHandler({ published, preview });
  const none = await noFabric(new Request('https://obligations-atlas.triodian.com/api/v1/firms/directory'), env(), { waitUntil: () => {} });
  assert.deepEqual(await none.json(), { format: 'triodian.practitionerDirectory/1', available: false, items: [] });
  const r = await noFabric(new Request('https://obligations-atlas.triodian.com/api/v1/firms/register', { method: 'POST', body: JSON.stringify({ accessSecret: secret }) }), env(), {});
  assert.equal(r.status, 503);
});

test('keyless tier (2.9): an MCP client without a key reads published Australian and Singapore records within the limit', async () => {
  const h = createHandler({ published, preview, fetchImpl: async (url) => (/\/firms\/v1\//.test(url) ? Response.json({ items: [] }) : Response.json(liveSnap)) });
  const e = env({ FABRIC_READ_TOKEN: 'tok', FABRIC_URL: 'https://fabric.example/governance/v1', ATLAS_KEYLESS_PER_MINUTE: '4',
    ATLAS_API_KEYS: JSON.stringify([{ firm: 'Firm A', keySha256: await sha256('firm-key'), perMinute: 100 }]) });
  const rpc = async (body, ip = '203.0.113.7', headers = {}) => {
    const r = await h(new Request('https://obligations-atlas.triodian.com/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers }, body: JSON.stringify(body) }), e, { waitUntil: () => {} });
    return { status: r.status, headers: r.headers, body: await r.json() };
  };
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.status, 200);
  assert.match(init.body.result.instructions, /No key is needed/);
  assert.equal(init.headers.get('x-ratelimit-limit'), '4');
  for (const j of ['AU', 'SG']) {
    const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'find_obligations', arguments: { jurisdiction: j } } });
    assert.equal(r.status, 200, j);
    const items = r.body.result.structuredContent.obligations;
    assert.ok(items.length > 0, `${j} records`);
    assert.ok(items.every((o) => o.publicationStatus === 'published'), 'published records only');
  }
  await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  // the fifth call in the minute is refused, with when to retry and how to get a higher limit
  const over = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
  assert.equal(over.status, 429);
  assert.equal(over.body.error.code, -32002);
  assert.ok(Number(over.headers.get('retry-after')) > 0);
  assert.match(over.body.error.data.detail, /keyless tier allows 4 requests a minute.*register/);
  // another caller has its own allowance; a firm key has its own, higher limit
  assert.equal((await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, '198.51.100.9')).status, 200);
  const firm = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/list' }, '203.0.113.7', { 'x-api-key': 'firm-key' });
  assert.equal(firm.status, 200);
  assert.equal(firm.headers.get('x-ratelimit-limit'), '100');
  // the REST API shares the keyless tier and says the same
  for (let i = 0; i < 4; i++) await get(h, 'obligations-atlas.triodian.com', '/api/v1/obligations?jurisdiction=AU', e);
  const rest = await h(new Request('https://obligations-atlas.triodian.com/api/v1/obligations?jurisdiction=SG', { headers: { 'cf-connecting-ip': 'local' } }), e, { waitUntil: () => {} });
  assert.equal(rest.status, 429);
  assert.match((await rest.json()).detail, /keyless tier/);
});
