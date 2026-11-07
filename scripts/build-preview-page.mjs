#!/usr/bin/env node
// Build a single-file preview of the web app (dist/atlas-preview.html): the same
// core, app script and styles, with the preview snapshot embedded so the page
// runs without the API. Routes are plain #names in this build.
import fs from 'node:fs';
const snap = fs.readFileSync('data/snapshot/ai-obligations-atlas.preview.json', 'utf8');
// Self-hosted fonts and the logo are not reachable from a single file: fonts come from Google Fonts, the logo is inlined.
const css = fs.readFileSync('public/styles.css', 'utf8').replace(/^@font-face\{[^\n]*\}\n/gm, '');
const logo = `data:image/svg+xml;base64,${fs.readFileSync('public/triodian-logo.svg').toString('base64')}`;
// The core imports the generated domain list; a single file inlines it instead.
const domains = fs.readFileSync('src/core/domains.js', 'utf8').replace(/^export const /m, 'const ');
const core = fs.readFileSync('src/core/atlas.js', 'utf8').replace(/^import \{ REGULATED_DOMAINS \} from '\.\/domains\.js';$/m, domains).replace(/^export \{[^}]*\};?$/m, '');
const app = fs.readFileSync('public/app.js', 'utf8').replace(/^import .* from '\/core\/atlas\.js';$/m, '');
const body = fs.readFileSync('public/index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module" src="\/app\.js"><\/script>/, '').replaceAll('/triodian-logo.svg', logo);
const html = `<title>AI Obligations Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="AI governance obligations by jurisdiction, mapped to standardised AI use cases and tagged by source tier.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet">
<style>
${css}
.hdr-in, main, footer.ft .wrap { padding-left: max(var(--pad), env(safe-area-inset-left, 0px)); padding-right: max(var(--pad), env(safe-area-inset-right, 0px)); }
</style>
${body}
<script type="application/json" id="atlas-snapshot">${snap.replace(/</g, '\\u003c')}</script>
<script type="module">
${core}
const __snapshot = JSON.parse(document.getElementById('atlas-snapshot').textContent);
const __atlas = new Atlas(__snapshot, { preview: true });
window.ATLAS_EMBED = { dataset: () => ({ ...__atlas.dataset(), defaults: { jurisdiction: 'AU', domain: '' } }), provenance: (id) => __atlas.provenance(id) };
${app}
</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/atlas-preview.html', html);
console.log(`dist/atlas-preview.html ${(html.length / 1024).toFixed(0)} KB`);
