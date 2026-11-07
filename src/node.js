/**
 * Node entry: serves the web app (public/) and the API.
 *   ATLAS_SNAPSHOT  path to a connector snapshot (default data/snapshot/ai-obligations-atlas.json)
 *   ATLAS_PREVIEW   "true" to use the preview snapshot and show records pending review
 *   ATLAS_API_KEYS  JSON [{ firm, keySha256, perMinute }]
 *   ATLAS_REQUIRE_KEY "true" to refuse anonymous API calls
 *   FABRIC_URL, FABRIC_READ_TOKEN  optional: firm registration and firm keys from the Fabric's firm registry
 *   PORT            default 8787
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './api/app.js';
import { fabricFirmsClient, firmsBaseFrom } from './firms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.env.ATLAS_PREVIEW === 'true';
const file = process.env.ATLAS_SNAPSHOT || path.join(root, 'data/snapshot', preview ? 'ai-obligations-atlas.preview.json' : 'ai-obligations-atlas.json');
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));

// Firm registration and keys, when a Fabric is configured.
const firms = process.env.FABRIC_URL && process.env.FABRIC_READ_TOKEN
  ? fabricFirmsClient({ baseUrl: firmsBaseFrom(process.env.FABRIC_URL), token: process.env.FABRIC_READ_TOKEN })
  : null;
let firmKeys = [];
const loadKeys = () => firms && firms.keys().then((k) => { firmKeys = k; }).catch((e) => console.error('firm keys:', e.message));
if (firms) { loadKeys(); setInterval(loadKeys, 30000).unref(); }

const api = createApp({
  firms,
  keyProvider: () => firmKeys,
  snapshot,
  preview,
  apiKeys: process.env.ATLAS_API_KEYS ? JSON.parse(process.env.ATLAS_API_KEYS) : [],
  requireKey: process.env.ATLAS_REQUIRE_KEY === 'true',
  defaults: { jurisdiction: (process.env.DEFAULT_JURISDICTION || 'AU').toUpperCase(), domain: process.env.DEFAULT_DOMAIN || '' },
});

// Apply the "/*" block of public/_headers locally, as Cloudflare does in production.
const staticHeaders = (() => {
  const out = [];
  let inAll = false;
  for (const line of fs.readFileSync(path.join(root, 'public/_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) { inAll = line.trim() === '/*'; continue; }
    const m = /^\s+([^:]+):\s*(.+)$/.exec(line);
    if (inAll && m) out.push([m[1].trim(), m[2].trim()]);
  }
  return out;
})();

const app = new Hono();
app.use('*', async (c, next) => {
  await next();
  if (!c.req.path.startsWith('/api') && c.req.path !== '/mcp') for (const [k, v] of staticHeaders) c.header(k, v);
});
app.route('/', api);
app.use('/*', serveStatic({ root: path.relative(process.cwd(), path.join(root, 'public')) || '.' }));
app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(root, 'public/index.html')) }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`AI Obligations Atlas on http://localhost:${port} (${snapshot.records.length} records${preview ? ', preview' : ''})`));
