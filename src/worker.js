/**
 * Cloudflare Workers entry. Static files in public/ are served by Workers
 * assets; /api/* and /mcp run here (see wrangler.jsonc run_worker_first).
 *
 * Vars / secrets: ATLAS_PREVIEW ("true" uses the preview snapshot),
 * ATLAS_API_KEYS (JSON), ATLAS_REQUIRE_KEY ("true").
 */
import published from '../data/snapshot/ai-obligations-atlas.json';
import previewSnapshot from '../data/snapshot/ai-obligations-atlas.preview.json';
import { createApp } from './api/app.js';

let app;
let key;

export default {
  async fetch(request, env, ctx) {
    const cfg = `${env.ATLAS_PREVIEW}|${env.ATLAS_REQUIRE_KEY}|${env.ATLAS_API_KEYS || ''}`;
    if (!app || key !== cfg) {
      const preview = env.ATLAS_PREVIEW === 'true';
      app = createApp({
        snapshot: preview ? previewSnapshot : published,
        preview,
        apiKeys: env.ATLAS_API_KEYS ? JSON.parse(env.ATLAS_API_KEYS) : [],
        requireKey: env.ATLAS_REQUIRE_KEY === 'true',
      });
      key = cfg;
    }
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/api' || url.pathname === '/mcp' || url.pathname === '/healthz') {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
