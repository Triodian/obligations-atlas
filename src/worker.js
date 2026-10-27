/**
 * Cloudflare Workers entry. Static files in public/ are served by Workers
 * assets; /api/*, /mcp and /healthz run in src/handler.js.
 *
 * Vars: ATLAS_PREVIEW_HOSTS (hosts that show records still waiting for review),
 * ATLAS_PREVIEW ("true" = every host), FABRIC_URL, ATLAS_CACHE_SECONDS,
 * ATLAS_REQUIRE_KEY.
 * Secrets: FABRIC_READ_TOKEN (read-only governance token; turns on live data),
 * ATLAS_API_KEYS (JSON [{ firm, keySha256, perMinute }]).
 */
import published from '../data/snapshot/ai-obligations-atlas.json';
import preview from '../data/snapshot/ai-obligations-atlas.preview.json';
import { createHandler } from './handler.js';

const handle = createHandler({ published, preview });

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
};
