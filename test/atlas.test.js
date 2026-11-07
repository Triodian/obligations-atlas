import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Atlas, buildMatterBrief, sha256Hex, ENTITY_TYPES, GENERAL_ENTITY_TYPES } from '../src/core/atlas.js';
import { createApp } from '../src/api/app.js';
import { TOOLS } from '../src/mcp/mcp.js';

const preview = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.preview.json', 'utf8'));
const published = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.json', 'utf8'));
const atlas = new Atlas(preview, { preview: true });
const app = createApp({ snapshot: preview, preview: true });
const get = async (p, init) => { const r = await app.request(p, init); return { status: r.status, body: await r.json(), headers: r.headers }; };
const rpc = async (body, headers = {}) => { const r = await app.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };

test('the published build never shows records waiting for review', () => {
  const a = new Atlas(published, { preview: false });
  assert.equal(a.findObligations({}).length, 0);
  const b = new Atlas(preview, { preview: false });
  assert.equal(b.findObligations({}).length, 0, 'preview data is hidden unless the build is a preview');
  assert.ok(atlas.findObligations({}).every((o) => ['published', 'pendingReview'].includes(o.publicationStatus)));
});

test('records that could not be verified against official text are leads, not obligations', () => {
  const ids = atlas.findObligations({}).map((o) => o.obligationID);
  assert.ok(!ids.includes('OBL-SG-MAS-N658'));
  assert.ok(!ids.includes('OBL-SG-MAS-TRM'));
  assert.ok(atlas.changes('2026-01-01').some((c) => c.kind === 'lead'));
});

test('filters: jurisdiction includes international standards, tier, use case, entity', () => {
  const au = atlas.findObligations({ jurisdiction: 'AU' });
  assert.ok(au.some((o) => o.jurisdiction === 'INT'));
  assert.ok(au.every((o) => ['AU', 'INT'].includes(o.jurisdiction)));
  assert.ok(!atlas.findObligations({ jurisdiction: 'AU', includeInternational: false }).some((o) => o.jurisdiction === 'INT'));
  const sg = atlas.findObligations({ jurisdiction: 'SG', tier: 'anticipated', useCase: 'UC5' });
  assert.ok(sg.length > 0 && sg.every((o) => o.sourceTier === 'anticipated' && o.useCaseIDs.includes('UC5')));
  const listed = atlas.findObligations({ entityType: 'listedEntity' });
  assert.ok(listed.some((o) => o.obligationID === 'OBL-AU-ASX-LR3-1A'));
});

test('every obligation carries source link, tier, last-verified date and a provenance reference', () => {
  for (const o of atlas.findObligations({})) {
    assert.match(o.sourceURL, /^https:\/\//, o.obligationID);
    assert.ok(['binding', 'expected', 'anticipated'].includes(o.sourceTier));
    assert.match(o.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(o.provenanceRef && o.citeAs.includes(o.governedRecordID));
  }
});

test('a regulator expectation shows the binding standards it rests on', () => {
  const o = atlas.getObligation('OBL-AU-APRA-AI-02');
  assert.equal(o.sourceTier, 'expected');
  assert.ok(o.tierBasis.some((b) => b.obligationID === 'OBL-AU-CPS220-9' && b.sourceTier === 'binding'));
});

test('provenance hashes verify, and a tampered entry is caught', async () => {
  const p = await atlas.provenance('OBL-AU-CPS230-47');
  assert.ok(p.entries.length >= 4 && p.allHashesVerified);
  const tampered = structuredClone(preview);
  tampered.provenance.find((e) => e.provenanceRecordID === p.entries[1].provenanceRecordID).decision = 'altered';
  const t = await new Atlas(tampered, { preview: true }).provenance('OBL-AU-CPS230-47');
  assert.equal(t.allHashesVerified, false);
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('matter brief: obligations by tier, counsel questions, engagements that fit, and the language rules', () => {
  const data = atlas.dataset();
  const b = buildMatterBrief(data, { matterLabel: 'Test matter', jurisdictions: ['AU'], entityTypes: ['generalInsurer'], useCaseIDs: ['UC3', 'UC7', 'UC10'], consequence: { UC3: 'c4' } });
  assert.equal(b.briefFormat, 'triodian.matterBrief/1');
  assert.ok(b.counts.binding > 0 && b.counts.expected > 0);
  assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType).sort(), ['aiConfidentialityExposureAssessment', 'aiRiskAppetite', 'aiUseAssessment']);
  assert.ok(b.questionsForCounsel.some((q) => q.question.includes('C1 to C5')));
  assert.equal(b.scope.useCases.find((u) => u.useCaseID === 'UC3').consequenceLevel, 'c4');
  assert.deepEqual(atlas.languageIssues(b, 'matterBrief'), []);
  assert.ok(b.notices.some((n) => n.includes('not sent to Triodian')));
  const brief = JSON.parse(fs.readFileSync('schemas/matter-brief.schema.json', 'utf8'));
  assert.equal(brief.properties.briefFormat.const, b.briefFormat);
});

test('REST API responses pass the language rules and carry the standing rule', async () => {
  for (const p of ['/api/v1', '/api/v1/obligations?jurisdiction=AU', '/api/v1/obligations/OBL-AU-CPS230-47', '/api/v1/instruments', '/api/v1/changes?since=2020-01-01', '/api/v1/provenance/OBL-AU-CPS230-47', '/api/v1/use-cases', '/api/v1/jurisdictions', '/api/v1/organizations', '/api/v1/dataset']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
  }
  const r = await get('/api/v1/obligations?jurisdiction=SG&tier=anticipated');
  assert.ok(r.body.total > 0 && r.body.notice.includes('not legal advice'));
  assert.equal((await get('/api/v1/obligations/NOPE')).status, 404);
  assert.equal((await get('/api/v1/changes?since=yesterday')).status, 400);
});

test('the language guard withholds a response that states a verdict', async () => {
  const bad = structuredClone(preview);
  bad.records.find((r) => r.entityID === 'OBL-AU-CPS230-47').record.statement = 'Most insurers are non-compliant with this paragraph.';
  const a = createApp({ snapshot: bad, preview: true });
  const r = await a.request('/api/v1/obligations/OBL-AU-CPS230-47');
  assert.equal(r.status, 500);
  assert.equal((await r.json()).code, 'language.violation');
});

test('API keys: registered firms are identified, unknown keys refused, keys required when configured', async () => {
  const keySha256 = await sha256Hex('firm-key-1');
  const keyed = createApp({ snapshot: preview, preview: true, apiKeys: [{ firm: 'Example Firm', keySha256, perMinute: 1000 }], requireKey: true });
  assert.equal((await keyed.request('/api/v1/obligations')).status, 401);
  assert.equal((await keyed.request('/api/v1/dataset')).status, 200, 'the web app dataset stays open');
  assert.equal((await keyed.request('/api/v1/obligations', { headers: { 'x-api-key': 'wrong' } })).status, 401);
  assert.equal((await keyed.request('/api/v1/obligations', { headers: { 'x-api-key': 'firm-key-1' } })).status, 200);
});

test('anonymous callers are rate limited', async () => {
  const a = createApp({ snapshot: preview, preview: true, anonPerMinute: 3 });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await a.request('/api/v1/use-cases')).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('MCP: initialize, list tools, call each tool', async () => {
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.match(init.body.result.instructions, /not legal conclusions/);
  assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.body.result.tools.map((t) => t.name), ['find_obligations', 'get_obligation', 'list_changes', 'explain_provenance']);
  for (const t of TOOLS.slice(0, 3)) assert.match(t.description, /not legal conclusions/);
  const find = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'find_obligations', arguments: { jurisdiction: ['AU'], useCase: ['UC10'] } } });
  assert.ok(find.body.result.structuredContent.obligations.some((o) => o.obligationID === 'OBL-AU-ASX-LR3-1A'));
  const one = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_obligation', arguments: { obligationID: 'OBL-SG-MAS-AIRM-3' } } });
  assert.equal(one.body.result.structuredContent.obligation.sourceTier, 'anticipated');
  const ch = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_changes', arguments: { since: '2026-10-01', jurisdiction: 'SG' } } });
  assert.ok(ch.body.result.structuredContent.changes.some((c) => c.triggerID === 'TRG-SG-MAS-AIRM-2026-10-07'));
  const pv = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'explain_provenance', arguments: { ref: 'OBL-AU-CPS230-47' } } });
  assert.equal(pv.body.result.structuredContent.allHashesVerified, true);
  const missing = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_obligation', arguments: { obligationID: 'NOPE' } } });
  assert.equal(missing.body.result.isError, true);
  const unknown = await rpc({ jsonrpc: '2.0', id: 8, method: 'nope' });
  assert.equal(unknown.body.error.code, -32601);
});

test('matter brief asks about consequence only for use cases still without a level', () => {
  const data = atlas.dataset();
  const b = buildMatterBrief(data, { jurisdictions: ['AU'], useCaseIDs: ['UC3', 'UC5'], consequence: { UC3: 'c5' } });
  const about = b.questionsForCounsel.map((q) => q.about);
  assert.ok(!about.includes('UC3'), 'UC3 has C5 set, so no consequence question');
  assert.ok(about.includes('UC5'), 'UC5 has no level, so counsel is asked');
});

test('records mapped to every use case apply to any AI use and follow use-case-specific records', () => {
  const rows = atlas.findObligations({ jurisdiction: 'AU', useCase: 'UC3' });
  const firstAny = rows.findIndex((o) => o.appliesToAnyAIUse);
  assert.ok(firstAny > 0, 'specific records come first');
  assert.ok(rows.slice(firstAny).every((o) => o.appliesToAnyAIUse));
  const specificOnly = atlas.findObligations({ jurisdiction: 'AU', useCase: 'UC3', includeAnyUse: false });
  assert.equal(specificOnly.length, firstAny);
  assert.ok(atlas.getObligation('OBL-AU-CPS220-9').appliesToAnyAIUse);
  const b = buildMatterBrief(atlas.dataset(), { jurisdictions: ['AU'], useCaseIDs: ['UC3'] });
  assert.equal(b.counts.specificToUseCases + b.counts.anyAIUse, b.counts.binding + b.counts.expected + b.counts.anticipated);
});

test('jurisdictions without records say "not yet covered" in the API and MCP', async () => {
  const r = await get('/api/v1/obligations?jurisdiction=EU');
  assert.equal(r.body.coverage[0].coverage, 'notYetCovered');
  assert.match(r.body.coverage[0].note, /does not yet cover the European Union/);
  const au = await get('/api/v1/obligations?jurisdiction=AU');
  assert.equal(au.body.coverage, undefined);
  const m = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_obligations', arguments: { jurisdiction: ['US'], includeInternational: false } } });
  assert.equal(m.body.result.structuredContent.total, 0);
  assert.equal(m.body.result.structuredContent.coverage[0].jurisdiction, 'US');
  assert.ok(atlas.jurisdictions().find((j) => j.code === 'NZ').coverage === 'notYetCovered');
});

test('entity types are grouped by the jurisdiction whose records address them', () => {
  const g = atlas.entityTypesByJurisdiction();
  assert.ok(g.AU.includes('generalInsurer') && !g.AU.includes('bank'));
  assert.ok(g.SG.includes('bank') && !g.SG.includes('generalInsurer'));
  assert.ok(!g.INT);
});

test('organisations outside financial regulation: offered everywhere, and reached by sources of general application (task 2.2)', () => {
  const g = atlas.entityTypesByJurisdiction();
  for (const j of ['AU', 'SG']) for (const e of GENERAL_ENTITY_TYPES) assert.ok(g[j].includes(e), `${j} offers ${e}`);
  for (const e of GENERAL_ENTITY_TYPES) assert.ok(ENTITY_TYPES[e], `${e} has a label`);
  const vendored = JSON.parse(fs.readFileSync('vendor/triodian-metamodel/schemas/semantic-library/obligation.schema.json', 'utf8'));
  for (const e of GENERAL_ENTITY_TYPES) assert.ok(vendored.definitions.regulatedEntityType.enum.includes(e), `${e} is in the Metamodel`);
  for (const e of GENERAL_ENTITY_TYPES) {
    const list = atlas.findObligations({ entityType: e, jurisdiction: ['AU'] });
    assert.ok(list.length > 0, `${e} reaches some AU records`);
    assert.ok(list.every((o) => (o.entityTypes || []).some((t) => t === e || t === 'anyOrganization')), `${e} reaches only records addressed to it or to any organisation`);
  }
  const b = buildMatterBrief(atlas.dataset(), { matterLabel: 'NFP', jurisdictions: ['AU'], entityTypes: ['notForProfit'], useCaseIDs: [] });
  const ids = JSON.stringify(b);
  assert.match(ids, /OBL-AU-PRIVACY-APP1-7/);
  assert.doesNotMatch(ids, /OBL-AU-CPS230/);
});

test('change log: commencements dated when they take effect, upcoming marked, leads carry no research notes', () => {
  const items = atlas.changes('1970-01-01', { now: '2026-10-28' });
  const adm = items.find((i) => /Automated decision transparency/.test(i.title));
  assert.equal(adm.date, '2026-12-10');
  assert.equal(adm.upcoming, true);
  for (const lead of items.filter((i) => i.kind === 'lead')) {
    assert.doesNotMatch(lead.summary, /UNVERIFIED|Research note|before publication/i);
    assert.match(lead.summary, /not yet been checked against the official text/);
  }
});
