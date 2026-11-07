/**
 * Request handling for the Cloudflare Worker, kept apart from the JSON
 * imports in worker.js so it can be tested in Node.
 *
 * Which data a request sees:
 * - Hosts listed in ATLAS_PREVIEW_HOSTS (or every host when ATLAS_PREVIEW is
 *   "true") get the bundled preview snapshot: records still waiting for review,
 *   shown with a preview banner.
 * - Every other host gets published records only. When FABRIC_READ_TOKEN is
 *   set, they are read live from the Reasoning Fabric's governance interface
 *   (FABRIC_URL) and cached for ATLAS_CACHE_SECONDS; if the Fabric cannot be
 *   reached, the last good copy, then the bundled published snapshot, is used.
 *
 * Firm registration and "Bring in Triodian" requests go to the Fabric's firm
 * registry with the same token (it needs the firms.submit scope). Firm API keys
 * issued there are read with the snapshot and cached the same way.
 */
import { createApp } from './api/app.js';
import { fabricFirmsClient, firmsBaseFrom } from './firms.js';

const DEFAULT_FABRIC = 'https://uat.api.orthogramic.com/governance/v1';
const DATASET = 'ai-obligations-atlas';

const isSnapshot = (s) => s && Array.isArray(s.records) && Array.isArray(s.provenance) && s.policy && Array.isArray(s.policy.languageRules);

export function createHandler({ published, preview, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  const apps = new Map(); // key -> { app, snapshot }
  const live = { snapshot: null, fetchedAt: 0, error: null, inflight: null };
  const firmKeys = { items: [], fetchedAt: 0, inflight: null, error: null };
  let firmsClient = null;
  const firmsFor = (env) => {
    if (!env.FABRIC_READ_TOKEN) return null;
    if (!firmsClient) firmsClient = fabricFirmsClient({ baseUrl: firmsBaseFrom(env.FABRIC_URL || DEFAULT_FABRIC), token: env.FABRIC_READ_TOKEN, fetchImpl });
    return firmsClient;
  };
  // Firm keys are refreshed in the background; a caller is checked against the last good list.
  const refreshKeys = (env, ctx) => {
    const client = firmsFor(env);
    const ttl = Number(env.ATLAS_CACHE_SECONDS || 300) * 1000;
    if (!client || firmKeys.inflight || now() - firmKeys.fetchedAt < ttl) return;
    firmKeys.inflight = client.keys()
      .then((items) => { firmKeys.items = items; firmKeys.fetchedAt = now(); firmKeys.error = null; })
      .catch((e) => { firmKeys.error = e.message; firmKeys.fetchedAt = now(); })
      .finally(() => { firmKeys.inflight = null; });
    if (ctx && ctx.waitUntil) ctx.waitUntil(firmKeys.inflight);
    return firmKeys.inflight;
  };

  const appFor = (key, snapshot, env, isPreview) => {
    const cached = apps.get(key);
    if (cached && cached.snapshot === snapshot) return cached.app;
    const app = createApp({
      snapshot,
      preview: isPreview,
      apiKeys: env.ATLAS_API_KEYS ? JSON.parse(env.ATLAS_API_KEYS) : [],
      requireKey: env.ATLAS_REQUIRE_KEY === 'true',
      keyProvider: () => firmKeys.items,
      firms: firmsFor(env),
      defaults: { jurisdiction: (env.DEFAULT_JURISDICTION || 'AU').toUpperCase(), sector: env.DEFAULT_SECTOR || '' },
    });
    apps.set(key, { app, snapshot });
    return app;
  };

  async function refreshLive(env) {
    const base = (env.FABRIC_URL || DEFAULT_FABRIC).replace(/\/+$/, '');
    const res = await fetchImpl(`${base}/snapshot/${DATASET}`, {
      headers: { authorization: `Bearer ${env.FABRIC_READ_TOKEN}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Fabric returned ${res.status}`);
    const snap = await res.json();
    if (!isSnapshot(snap)) throw new Error('Fabric snapshot has an unexpected shape');
    live.snapshot = snap;
    live.fetchedAt = now();
    live.error = null;
  }

  async function publishedSnapshot(env, ctx) {
    if (!env.FABRIC_READ_TOKEN) return { snapshot: published, source: 'bundled' };
    const ttl = Number(env.ATLAS_CACHE_SECONDS || 300) * 1000;
    const fresh = live.snapshot && now() - live.fetchedAt < ttl;
    if (!fresh) {
      if (!live.inflight) {
        live.inflight = refreshLive(env)
          .catch((e) => { live.error = e.message; console.error('Atlas live data:', e.message); })
          .finally(() => { live.inflight = null; });
      }
      // First request in an isolate waits; later ones serve the last copy while it refreshes.
      if (!live.snapshot) await live.inflight;
      else if (ctx && ctx.waitUntil) ctx.waitUntil(live.inflight);
    }
    return live.snapshot ? { snapshot: live.snapshot, source: 'fabric' } : { snapshot: published, source: 'bundled' };
  }

  return async function handle(request, env, ctx) {
    const url = new URL(request.url);
    const previewHosts = (env.ATLAS_PREVIEW_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const isPreview = env.ATLAS_PREVIEW === 'true' || previewHosts.includes(url.hostname.toLowerCase());
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname === '/healthz';
    if (!api) return env.ASSETS.fetch(request);

    const { snapshot, source } = isPreview ? { snapshot: preview, source: 'bundled-preview' } : await publishedSnapshot(env, ctx);
    if (url.pathname === '/healthz') {
      return Response.json({
        ok: true,
        data: source,
        preview: isPreview,
        records: snapshot.records.length,
        generatedAt: snapshot.generatedAt,
        ...(source !== 'bundled-preview' && env.FABRIC_READ_TOKEN ? { liveError: live.error || undefined, fetchedAt: live.fetchedAt ? new Date(live.fetchedAt).toISOString() : undefined } : {}),
        firms: env.FABRIC_READ_TOKEN ? { registration: 'fabric', keys: firmKeys.items.length, keysError: firmKeys.error || undefined } : { registration: 'unavailable' },
      });
    }
    const keysReady = refreshKeys(env, ctx);
    // A request carrying a key waits for the first key list, so a new firm's key works at once.
    if (keysReady && !firmKeys.items.length && (request.headers.get('x-api-key') || request.headers.get('authorization'))) await keysReady;
    const app = appFor(isPreview ? 'preview' : 'published', snapshot, env, isPreview);
    return app.fetch(request, env, ctx);
  };
}
