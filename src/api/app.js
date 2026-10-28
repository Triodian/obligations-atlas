/**
 * Atlas HTTP application (Hono): REST API at /api/v1, MCP at /mcp.
 * Runs on Cloudflare Workers (src/worker.js) and Node (src/node.js).
 */
import { Hono } from 'hono';
import { Atlas, STANDING_RULE, sha256Hex } from '../core/atlas.js';
import { handleRpc } from '../mcp/mcp.js';
import { openapi } from './openapi.js';

const VERSION = '0.1.0';

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
export function createApp({ snapshot, preview = false, apiKeys = [], requireKey = false, anonPerMinute = 60, keyProvider = () => [], firms = null }) {
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
    const openPath = c.req.path === '/api/v1/dataset' || c.req.path === '/api/v1' || c.req.path === '/api/v1/openapi.json' || c.req.path.startsWith('/api/v1/firms/');
    if (requireKey && !who.firm && !openPath) return problem(c, 401, 'auth.keyRequired', 'Register a firm account and send its API key in the x-api-key header');
    const r = limit(who.id, who.perMinute);
    c.header('x-ratelimit-remaining', String(r.remaining));
    if (!r.ok) {
      c.header('retry-after', String(r.retryAfter));
      return problem(c, 429, 'rate.limited', 'Too many requests');
    }
    c.set('firm', who.firm);
    return next();
  });

  // ------------------------------------------------------------ REST
  app.get('/api/v1', (c) => send(c, { ...atlas.info(), api: '/api/v1', mcp: '/mcp', openapi: '/api/v1/openapi.json' }));
  app.get('/api/v1/openapi.json', (c) => c.json(openapi(VERSION)));
  app.get('/api/v1/dataset', (c) => {
    c.header('cache-control', 'public, max-age=300');
    return send(c, atlas.dataset());
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
  app.get('/api/v1/jurisdictions', (c) => send(c, { items: atlas.jurisdictions() }));
  app.get('/api/v1/organizations', (c) => send(c, { items: atlas.organizations() }));
  app.get('/api/v1/policy', (c) => c.json(snapshot.policy));

  // ------------------------------------------------------------ firm registration and Bring in Triodian
  // Passed to the Reasoning Fabric's firm registry; personal details are not kept here.
  // The browser's access secret is hashed before it leaves.
  const postLimit = limiter();
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
    site: new URL(c.req.url).hostname, accessSecretSha256: hash,
  })));
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
    if (!r.ok) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Rate limited' } }, 429);
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
