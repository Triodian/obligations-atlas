#!/usr/bin/env node
// Fetch fresh snapshots from the Reasoning Fabric into data/snapshot/, for the bundled copies the sites fall back to:
//   ai-obligations-atlas.json          published records only (the live site's fallback)
//   ai-obligations-atlas.preview.json  adds records waiting for review, marked pendingReview (the test site)
//
// The token needs the Fabric's `read` and `preview` scopes (reasoning_fabric src/connector/auth.js). With `read`
// alone the Fabric leaves out the records waiting for review, so this refuses to write a preview without them.
// The Fabric's address is FABRIC_URL in wrangler.jsonc, or the FABRIC_URL environment variable.
//
//   FABRIC_PREVIEW_TOKEN=... node scripts/refresh-snapshots.mjs
//
// A file is written only when its records, provenance or policy changed (generatedAt alone does not count).
// Prints `changed=true|false` for the GitHub Actions job that runs it.
import fs from 'node:fs';

const DATASET = 'ai-obligations-atlas';
const token = process.env.FABRIC_PREVIEW_TOKEN;
if (!token) { console.error('Set FABRIC_PREVIEW_TOKEN (a Fabric token with the read and preview scopes).'); process.exit(1); }
const strip = (t) => t.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s || '').replace(/,(\s*[}\]])/g, '$1');
const base = (process.env.FABRIC_URL || JSON.parse(strip(fs.readFileSync('wrangler.jsonc', 'utf8'))).vars.FABRIC_URL).replace(/\/+$/, '');

async function snapshot(includePending) {
  const url = `${base}/snapshot/${DATASET}${includePending ? '?includePending=true' : ''}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  const snap = await r.json();
  if (snap.dataset !== DATASET || !Array.isArray(snap.records) || !Array.isArray(snap.provenance)) throw new Error(`${url}: not a ${DATASET} snapshot`);
  if (includePending && snap.includesPending !== true) throw new Error('The Fabric left out the records waiting for review: the token needs the preview scope as well as read.');
  return snap;
}
const same = (a, b) => JSON.stringify({ ...a, generatedAt: '' }) === JSON.stringify({ ...b, generatedAt: '' });

// Fetch both before writing either, so a refused or failed request leaves the files as they were.
const files = [[`data/snapshot/${DATASET}.json`, await snapshot(false)], [`data/snapshot/${DATASET}.preview.json`, await snapshot(true)]];
let changed = false;
for (const [file, snap] of files) {
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const waiting = snap.records.filter((x) => x.publicationStatus === 'pendingReview').length;
  const summary = `${snap.records.length} records (${snap.records.length - waiting} published, ${waiting} waiting for review), ${snap.provenance.length} provenance entries`;
  if (old && same(old, snap)) { console.log(`${file}: unchanged, ${summary}`); continue; }
  fs.writeFileSync(file, JSON.stringify(snap, null, 2) + '\n');
  console.log(`${file}: updated, ${summary}${old ? ` (was ${old.records.length} records)` : ''}`);
  changed = true;
}
console.log(`changed=${changed}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
