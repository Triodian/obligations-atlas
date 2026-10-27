/**
 * Node entry: serves the web app (public/) and the API.
 *   ATLAS_SNAPSHOT  path to a connector snapshot (default data/snapshot/ai-obligations-atlas.json)
 *   ATLAS_PREVIEW   "true" to use the preview snapshot and show records pending review
 *   ATLAS_API_KEYS  JSON [{ firm, keySha256, perMinute }]
 *   ATLAS_REQUIRE_KEY "true" to refuse anonymous API calls
 *   PORT            default 8787
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './api/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.env.ATLAS_PREVIEW === 'true';
const file = process.env.ATLAS_SNAPSHOT || path.join(root, 'data/snapshot', preview ? 'ai-obligations-atlas.preview.json' : 'ai-obligations-atlas.json');
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));

const api = createApp({
  snapshot,
  preview,
  apiKeys: process.env.ATLAS_API_KEYS ? JSON.parse(process.env.ATLAS_API_KEYS) : [],
  requireKey: process.env.ATLAS_REQUIRE_KEY === 'true',
});

const app = new Hono();
app.route('/', api);
app.use('/*', serveStatic({ root: path.relative(process.cwd(), path.join(root, 'public')) || '.' }));
app.get('*', serveStatic({ path: path.relative(process.cwd(), path.join(root, 'public/index.html')) }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`AI Obligations Atlas on http://localhost:${port} (${snapshot.records.length} records${preview ? ', preview' : ''})`));
