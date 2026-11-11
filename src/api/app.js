/**
 * Atlas HTTP application (Hono): REST API at /api/v1, MCP at /mcp.
 * Runs on Cloudflare Workers (src/worker.js) and Node (src/node.js).
 */
import { Hono } from 'hono';
import { Atlas, STANDING_RULE, sha256Hex, ENTITY_TYPES, JURISDICTIONS, REGULATED_SECTORS, GENERAL_ENTITY_TYPES } from '../core/atlas.js';
import { handleRpc } from '../mcp/mcp.js';
import { openapi } from './openapi.js';
import { ROUTING_TABLE, solutionSet } from '../core/solution-set.js';

const VERSION = '0.1.0';

/* The keyless tier (development plan task 2.9): anyone may read the published records, through the REST API or
   the MCP server, without a key, within a per-minute limit for each caller. A registered firm gets its own key and
   a higher limit, and can bring in Triodian from a matter brief. */
export const KEYLESS_PER_MINUTE = 60;
const KEYLESS_NOTE = (n) => `The keyless tier allows ${n} requests a minute from each caller. A registered firm gets its own key and a higher limit: register at https://obligations-atlas.triodian.com/#/firm.`;

/** Fixed-window rate limiter per caller (per isolate on Workers). */
function limiter() {
  const hits = new Map();
  return (key, max) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.start > 60000) {
      hits.set(key, { start: now, n: 1 });
      if (hits.size > 10000) hits.clear();
      return { ok: true, remaining: max - 1 };
    }
    h.n += 1;
    return { ok: h.n <= max, remaining: Math.max(0, max - h.n), retryAfter: Math.ceil((h.start + 60000 - now) / 1000) };
  };
}

/**
 * @param {object} opts
 *   snapshot     connector snapshot
 *   preview      show pendingReview records (preview deployments only)
 *   apiKeys      [{ firm, keySha256, perMinute }]  registered firm accounts
 *   requireKey   refuse anonymous API calls (the web app's dataset download stays open)
 *   anonPerMinute
 *   keyProvider  () => [{ firm, keySha256, perMinute }]  firm keys issued through the Fabric (read on each call)
 *   firms        firm registry client (src/firms.js), or null when registration is not configured
 */
export function createApp({ snapshot, preview = false, apiKeys = [], requireKey = false, anonPerMinute = KEYLESS_PER_MINUTE, keyProvider = () => [], firms = null, defaults = {} }) {
  const atlas = new Atlas(snapshot, { preview });
  const app = new Hono();
  const limit = limiter();
  const staticKeys = apiKeys;
  const keyFor = (hash) => staticKeys.find((k) => k.keySha256 === hash) || (keyProvider() || []).find((k) => k.keySha256 === hash);
  const serverInfo = { name: 'ai-obligations-atlas', title: 'AI Obligations Atlas', version: VERSION };

  const problem = (c, status, code, title, extra = {}) => c.json({ type: `https://atlas.triodian.com/problems/${code}`, title, status, code, ...extra }, status, { 'content-type': 'application/problem+json' });

  /** Identify the caller: a registered firm by API key, or anonymous. */
  const caller = async (c) => {
    const h = c.req.header('authorization') || '';
    const key = c.req.header('x-api-key') || (/^Bearer\s+(.+)$/i.exec(h) || [])[1];
    if (!key) return { firm: null, perMinute: anonPerMinute, id: `ip:${c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local'}` };
    const k = keyFor(await sha256Hex(key.trim()));
    return k ? { firm: k.firm, perMinute: k.perMinute || 600, id: `firm:${k.firm}` } : { invalid: true };
  };

  /** Every JSON response is checked against the dataset's language rules before it leaves. */
  const send = (c, body, status = 200) => {
    const issues = atlas.languageIssues(body, 'response');
    if (issues.length) {
      console.error('language rule violation', JSON.stringify(issues.slice(0, 5)));
      return problem(c, 500, 'language.violation', 'The response did not pass the Atlas language rules and was withheld');
    }
    return c.json(body, status);
  };

  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'strict-origin-when-cross-origin');
  });

  app.use('/api/*', async (c, next) => {
    c.header('access-control-allow-origin', '*');
    c.header('access-control-allow-headers', 'authorization, x-api-key, content-type');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    const who = await caller(c);
    if (who.invalid) return problem(c, 401, 'auth.invalidKey', 'The API key is not recognised');
    const openPath = c.req.path === '/api/v1/dataset' || c.req.path === '/api/v1' || c.req.path === '/api/v1/openapi.json' || c.req.path.startsWith('/api/v1/firms/') || c.req.path.startsWith('/api/v1/solution-set');
    if (requireKey && !who.firm && !openPath) return problem(c, 401, 'auth.keyRequired', 'Register a firm account and send its API key in the x-api-key header');
    const r = limit(who.id, who.perMinute);
    c.header('x-ratelimit-remaining', String(r.remaining));
    if (!r.ok) {
      c.header('retry-after', String(r.retryAfter));
      return problem(c, 429, 'rate.limited', 'Too many requests', { detail: who.firm ? `Your firm's limit is ${who.perMinute} requests a minute.` : KEYLESS_NOTE(who.perMinute), retryAfter: r.retryAfter });
    }
    c.set('firm', who.firm);
    return next();
  });

  // ------------------------------------------------------------ REST
  app.get('/api/v1', (c) => send(c, { ...atlas.info(), api: '/api/v1', mcp: '/mcp', openapi: '/api/v1/openapi.json' }));
  app.get('/api/v1/openapi.json', (c) => c.json(openapi(VERSION)));
  app.get('/api/v1/dataset', (c) => {
    c.header('cache-control', 'public, max-age=300');
    // defaults: the jurisdiction and regulated sector this deployment starts in (DEFAULT_JURISDICTION, DEFAULT_SECTOR).
    // keylessPerMinute: the keyless tier's limit, shown on the API and MCP page (task 2.9).
    return send(c, { ...atlas.dataset(), defaults: { jurisdiction: defaults.jurisdiction || 'AU', sector: defaults.sector || '' }, keylessPerMinute: anonPerMinute });
  });

  app.get('/api/v1/obligations', (c) => {
    const q = c.req.query();
    const all = atlas.findObligations(q);
    const lim = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const coverage = atlas.coverage(q.jurisdiction);
    return send(c, { total: all.length, offset, limit: lim, items: all.slice(offset, offset + lim), ...(coverage.length ? { coverage } : {}), notice: STANDING_RULE });
  });
  app.get('/api/v1/obligations/:id', (c) => {
    const o = atlas.getObligation(c.req.param('id'));
    return o ? send(c, { ...o, notice: STANDING_RULE }) : problem(c, 404, 'reference.notFound', `No obligation ${c.req.param('id')}`);
  });
  app.get('/api/v1/instruments', (c) => {
    const coverage = atlas.coverage(c.req.query('jurisdiction'));
    return send(c, { items: atlas.instruments(c.req.query()), ...(coverage.length ? { coverage } : {}), notice: STANDING_RULE });
  });
  app.get('/api/v1/changes', (c) => {
    const since = c.req.query('since') || '1970-01-01';
    if (!/^\d{4}-\d{2}-\d{2}/.test(since)) return problem(c, 400, 'query.since', 'since must be a date, YYYY-MM-DD');
    const jur = (c.req.query('jurisdiction') || '').toUpperCase();
    const items = atlas.changes(since).filter((i) => !jur || !i.jurisdiction || i.jurisdiction === jur);
    const coverage = atlas.coverage(jur);
    return send(c, { since, items, ...(coverage.length ? { coverage } : {}) });
  });
  app.get('/api/v1/provenance/:ref', async (c) => {
    const p = await atlas.provenance(c.req.param('ref'));
    return p ? send(c, p) : problem(c, 404, 'reference.notFound', `No record or provenance entry ${c.req.param('ref')}`);
  });
  app.get('/api/v1/use-cases', (c) => send(c, { items: atlas.useCases() }));
  // The solution set (task 5.3): the routing table the front door asks its questions from, and the engagements that
  // fit one person and organisation. The matter brief routes from the same table.
  app.get('/api/v1/solution-set/table', (c) => {
    c.header('cache-control', 'public, max-age=300');
    // With the choices the front door offers for organisation type: jurisdictions, regulated sectors and the general types.
    return send(c, { ...ROUTING_TABLE,
      jurisdictions: Object.entries(JURISDICTIONS).filter(([k]) => k !== 'INT').map(([code, j]) => ({ code, name: j.name, covered: j.depth === 'full' })),
      sectors: REGULATED_SECTORS.map((d) => ({ regulatedSectorID: d.regulatedSectorID, jurisdiction: d.jurisdiction, name: d.name, financiallyRegulated: !!d.financiallyRegulated, entityTypes: d.entityTypes })),
      generalEntityTypes: GENERAL_ENTITY_TYPES.map((id) => ({ id, name: ENTITY_TYPES[id] })),
      entityTypeNames: ENTITY_TYPES });
  });
  app.get('/api/v1/solution-set', (c) => {
    const q = c.req.query(), list = (k) => (q[k] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const unknown = list('entityType').filter((e) => !(e in ENTITY_TYPES));
    if (unknown.length) return problem(c, 400, 'query.entityType', `Unknown entity type ${unknown.join(', ')}`);
    const jur = (q.jurisdiction || '').toUpperCase();
    if (jur && !(jur in JURISDICTIONS)) return problem(c, 400, 'query.jurisdiction', `Unknown jurisdiction ${jur}`);
    const atlasUrl = new URL(c.req.url).origin;
    const r = solutionSet({ role: q.role, entityTypes: list('entityType'), sectors: list('sector'), jurisdiction: jur || undefined, size: q.size, prompt: q.prompt }, { atlasUrl });
    return r.error ? problem(c, 400, 'query.solutionSet', r.error) : send(c, r);
  });
  app.get('/api/v1/jurisdictions', (c) => send(c, { items: atlas.jurisdictions() }));
  app.get('/api/v1/organizations', (c) => send(c, { items: atlas.organizations() }));
  // Indented, so it reads cleanly when opened in a browser; the web app's Dataset policy page explains it.
  app.get('/api/v1/policy', (c) => c.body(JSON.stringify(snapshot.policy, null, 2), 200, { 'content-type': 'application/json; charset=utf-8' }));

  // ------------------------------------------------------------ firm registration and Bring in Triodian
  // Passed to the Reasoning Fabric's firm registry; personal details are not kept here.
  // The browser's access secret is hashed before it leaves.
  const postLimit = limiter();
  const DIRECTORY_TTL_MS = 5 * 60 * 1000;
  const directory = { items: [], at: 0, ok: false };
  const firmCall = (handler) => async (c) => {
    if (!firms) return problem(c, 503, 'firms.unavailable', 'Firm registration is not available on this server yet');
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local';
    const r = postLimit(`firms:${ip}`, 10);
    if (!r.ok) { c.header('retry-after', String(r.retryAfter)); return problem(c, 429, 'rate.limited', 'Too many requests'); }
    let body;
    try { body = await c.req.json(); } catch { return problem(c, 400, 'body.invalid', 'Send a JSON body'); }
    const secret = typeof body.accessSecret === 'string' ? body.accessSecret : '';
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return problem(c, 400, 'validation.secret', 'accessSecret must be 32 to 128 URL-safe characters');
    try {
      const out = await handler(body, await sha256Hex(secret), c);
      c.header('cache-control', 'no-store');
      return c.json(out.body ?? {}, out.status);
    } catch (e) {
      console.error('firm registry', e.message);
      return problem(c, 502, 'firms.unreachable', 'The firm registry could not be reached. Try again shortly.');
    }
  };
  app.post('/api/v1/firms/register', firmCall((b, hash, c) => firms.register({
    name: b.name, email: b.email, firm: b.firm, role: b.role, jurisdictions: b.jurisdictions,
    site: new URL(c.req.url).hostname, accessSecretSha256: hash, ...(b.listed === true ? { listed: true } : {}),
  })));
  app.post('/api/v1/firms/listing', firmCall((b, hash) => {
    directory.at = 0; // the next read of the directory shows the change
    return firms.listing(String(b.registrationID || ''), hash, b.listed);
  }));

  // The practitioner directory (development plan task 5.4): approved firms that asked to be listed, for Triodian
  // Start's "who runs it" choice. Open, like the solution set: it holds firm names, roles and jurisdictions only.
  // `available` is false when the registry is not configured or cannot be reached; the list is then the last good one.
  app.get('/api/v1/firms/directory', async (c) => {
    c.header('cache-control', 'public, max-age=60');
    if (!firms) return c.json({ format: 'triodian.practitionerDirectory/1', available: false, items: [] });
    if (Date.now() - directory.at > DIRECTORY_TTL_MS) {
      try { directory.items = await firms.directory(); directory.ok = true; } catch (e) { console.error('firm directory', e.message); directory.ok = false; }
      directory.at = Date.now();
    }
    return c.json({ format: 'triodian.practitionerDirectory/1', available: directory.ok, items: directory.items });
  });
  app.post('/api/v1/firms/status', firmCall((b, hash) => firms.status(String(b.registrationID || ''), hash)));
  app.post('/api/v1/firms/contact', firmCall((b, hash) => firms.contact({
    registrationID: b.registrationID, accessSecretSha256: hash, message: b.message, preferredContact: b.preferredContact, scope: b.scope,
  })));
  app.all('/api/*', (c) => problem(c, 404, 'reference.notFound', 'No such endpoint; see /api/v1/openapi.json'));

  // ------------------------------------------------------------ MCP (Streamable HTTP, stateless)
  app.get('/mcp', (c) => c.json({ ...serverInfo, transport: 'streamable-http', note: 'POST JSON-RPC 2.0 messages to this URL' }, 405, { allow: 'POST' }));
  app.post('/mcp', async (c) => {
    const who = await caller(c);
    if (who.invalid) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'API key not recognised' } }, 401);
    if (requireKey && !who.firm) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Firm API key required' } }, 401);
    const r = limit(`mcp:${who.id}`, who.perMinute);
    c.header('x-ratelimit-limit', String(who.perMinute));
    c.header('x-ratelimit-remaining', String(r.remaining));
    if (!r.ok) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Rate limited', data: { retryAfter: r.retryAfter, detail: who.firm ? `Your firm's limit is ${who.perMinute} requests a minute.` : KEYLESS_NOTE(who.perMinute) } } }, 429, { 'retry-after': String(r.retryAfter) });
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    const batch = Array.isArray(body);
    const out = [];
    for (const m of batch ? body : [body]) {
      const res = await handleRpc(atlas, m, serverInfo);
      if (res) out.push(res);
    }
    if (!out.length) return c.body(null, 202);
    const issues = atlas.languageIssues(out.map((o) => o.result && o.result.structuredContent), 'response');
    if (issues.length) return c.json({ jsonrpc: '2.0', id: out[0].id, error: { code: -32003, message: 'Response withheld: it did not pass the Atlas language rules' } }, 500);
    return c.json(batch ? out : out[0]);
  });

  app.get('/healthz', (c) => c.json({ ok: true, records: snapshot.records.length, generatedAt: snapshot.generatedAt }));
  return app;
}
