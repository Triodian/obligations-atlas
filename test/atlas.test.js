import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Atlas, buildMatterBrief, engagementRoute, ASSESSMENTS, PORTFOLIO_FORMAT, draftFromBrief, normalisePortfolio, saveToPortfolio, removeFromPortfolio, exportPortfolio, importPortfolio, sha256Hex, ENTITY_TYPES, GENERAL_ENTITY_TYPES, REGULATED_SECTORS, sectorByID, reachedEntityTypes } from '../src/core/atlas.js';
import { createApp } from '../src/api/app.js';
import { TOOLS } from '../src/mcp/mcp.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const preview = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.preview.json', 'utf8'));
const published = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.json', 'utf8'));
const atlas = new Atlas(preview, { preview: true });
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
// The matter brief is checked against the published exchange schema (Triodian_Metamodel exchange/, task R.4).
const EXCHANGE_BRIEF = JSON.parse(fs.readFileSync('vendor/triodian-metamodel/exchange/matter-brief-v1.schema.json', 'utf8'));
const validBrief = ajv.compile(EXCHANGE_BRIEF);
const app = createApp({ snapshot: preview, preview: true });
const get = async (p, init) => { const r = await app.request(p, init); return { status: r.status, body: await r.json(), headers: r.headers }; };
const rpc = async (body, headers = {}) => { const r = await app.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };

test('the published build never shows records waiting for review', () => {
  // Holds whatever the reviewer has approved so far: the published snapshot holds no waiting records, and a
  // record waiting for review is hidden unless the build is a preview.
  assert.ok(published.records.every((r) => r.publicationStatus !== 'pendingReview'), 'the published snapshot holds only approved records');
  assert.ok(new Atlas(published, { preview: false }).findObligations({}).every((o) => o.publicationStatus === 'published'));
  const waiting = { ...preview, records: preview.records.map((r) => (r.domainType === 'obligation' ? { ...r, publicationStatus: 'pendingReview' } : r)) };
  assert.equal(new Atlas(waiting, { preview: false }).findObligations({}).length, 0, 'waiting records are hidden unless the build is a preview');
  assert.ok(new Atlas(waiting, { preview: true }).findObligations({}).length > 0, 'a preview build shows them');
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
  // UC10 (AI tools reachable by a deal team) adds the confidentiality assessment to the regulated chain (routing table, task 5.3)
  assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType), ['aiRiskAppetite', 'aiUseAssessment', 'aiBoardDirection', 'aiConfidentialityExposureAssessment'], 'a general insurer is routed as regulated');
  assert.equal(b.engagementsThatFit[3].reason, 'Fits the use cases in scope');
  assert.ok(b.questionsForCounsel.some((q) => q.question.includes('C1 to C5')));
  assert.equal(b.scope.useCases.find((u) => u.useCaseID === 'UC3').consequenceLevel, 'c4');
  assert.deepEqual(atlas.languageIssues(b, 'matterBrief'), []);
  assert.ok(b.notices.some((n) => n.includes('not sent to Triodian')));
  const brief = JSON.parse(fs.readFileSync('schemas/matter-brief.schema.json', 'utf8'));
  assert.equal(brief.properties.briefFormat.const, b.briefFormat);
  // the Atlas's own copy (served at /schemas) says the same as the published one, apart from its id and wording
  const rules = s => JSON.stringify({ ...s, $id: '', title: '', description: '' });
  assert.equal(rules(brief), rules(EXCHANGE_BRIEF), 'schemas/matter-brief.schema.json has drifted from the published exchange schema');
  assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
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

test('regulated sectors: each belongs to a jurisdiction and uses known entity types', () => {
  assert.ok(REGULATED_SECTORS.length >= 20);
  for (const d of REGULATED_SECTORS) {
    assert.match(d.regulatedSectorID, new RegExp(`^${d.jurisdiction}-`));
    for (const k of [...d.entityTypes, ...(d.alsoReaches || [])]) assert.ok(ENTITY_TYPES[k], `${d.regulatedSectorID}: ${k}`);
  }
  assert.ok(sectorByID('AU-SUPERANNUATION').entityTypes.includes('superannuationTrustee'));
  assert.equal(sectorByID('NOPE'), null);
});

test('regulated sectors: Singapore financial sectors reach MAS financial-institution obligations', () => {
  assert.ok(reachedEntityTypes(['bank'], ['SG']).includes('financialInstitution'));
  assert.ok(!reachedEntityTypes(['bank'], ['AU']).includes('financialInstitution'));
});

test('regulated sectors: the sector filter narrows to its jurisdiction and entity types', () => {
  const ins = atlas.findObligations({ sector: 'AU-INSURANCE' });
  assert.ok(ins.length > 0);
  assert.ok(ins.every((o) => ['AU', 'INT'].includes(o.jurisdiction)));
  assert.ok(ins.length <= atlas.findObligations({ jurisdiction: 'AU' }).length);
  const data = atlas.dataset();
  assert.ok(data.sectors.some((d) => d.regulatedSectorID === 'AU-BANKING'));
});

test('regulated sectors: a matter brief records the sectors in scope', () => {
  const b = buildMatterBrief(atlas.dataset(), { jurisdictions: ['AU'], sectors: ['AU-SUPERANNUATION'], useCaseIDs: ['UC3'] });
  assert.deepEqual(b.scope.sectors.map((d) => d.regulatedSectorID), ['AU-SUPERANNUATION']);
  assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
});

test('deployment defaults: the dataset carries the jurisdiction and sector set at install', async () => {
  const a = createApp({ snapshot: preview, preview: true, defaults: { jurisdiction: 'SG', sector: 'SG-INSURANCE' } });
  const body = await (await a.request('/api/v1/dataset')).json();
  assert.deepEqual(body.defaults, { jurisdiction: 'SG', sector: 'SG-INSURANCE' });
  const plain = await get('/api/v1/dataset');
  assert.equal(plain.body.defaults.jurisdiction, 'AU');
});

test('engagement routing (2.4): regulated scopes get Risk Appetite, Use Assessment and Board Direction connected', () => {
  const data = atlas.dataset();
  const b = buildMatterBrief(data, { jurisdictions: ['AU'], entityTypes: ['authorisedDepositTakingInstitution'], useCaseIDs: ['UC3'] });
  assert.equal(b.profile, 'regulated');
  assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType), ['aiRiskAppetite', 'aiUseAssessment', 'aiBoardDirection']);
  const bd = b.engagementsThatFit.find((e) => e.assessmentType === 'aiBoardDirection');
  assert.equal(bd.mode, 'connected');
  assert.deepEqual(bd.useCaseIDs, ['UC3']);
  assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
  assert.deepEqual(atlas.languageIssues(b, 'matterBrief'), []);
  // A sector alone routes the same way; so does a Singapore bank, through the MAS financial-institution type.
  assert.equal(buildMatterBrief(data, { sectors: ['AU-SUPERANNUATION'] }).profile, 'regulated');
  assert.equal(engagementRoute(['bank']).profile, 'regulated');
});

test('engagement routing (2.4): other scopes get Board Direction standalone and Confidentiality Exposure', () => {
  const data = atlas.dataset();
  for (const input of [{ jurisdictions: ['AU'], entityTypes: ['privateCompany'], useCaseIDs: ['UC3'] }, { sectors: ['AU-CRITICAL-INFRASTRUCTURE'] }, { jurisdictions: ['SG'], entityTypes: ['listedEntity'] }]) {
    const b = buildMatterBrief(data, input);
    assert.equal(b.profile, 'general', JSON.stringify(input));
    assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType), ['aiBoardDirection', 'aiConfidentialityExposureAssessment']);
    assert.equal(b.engagementsThatFit[0].mode, 'standalone');
    assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
  }
  // Regulated wins when a scope mixes both.
  assert.equal(engagementRoute(['privateCompany', 'lifeInsurer']).profile, 'regulated');
});

test('engagement routing (2.4): with no entity type or sector, the use cases decide and Board Direction has no mode', () => {
  const b = buildMatterBrief(atlas.dataset(), { jurisdictions: ['AU'], useCaseIDs: ['UC3', 'UC7', 'UC10'] });
  assert.equal(b.profile, undefined);
  assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType).sort(), ['aiBoardDirection', 'aiConfidentialityExposureAssessment', 'aiRiskAppetite', 'aiUseAssessment']);
  assert.equal(b.engagementsThatFit.find((e) => e.assessmentType === 'aiBoardDirection').mode, undefined);
  assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
  assert.ok(ASSESSMENTS.aiBoardDirection.name === 'AI Board Direction');
});

test('client portfolio (2.5): one brief per client, matched by label', () => {
  const d = { matterLabel: 'Acme Insurance', jurisdictions: ['AU'], entityTypes: ['generalInsurer'], sectors: ['AU-INSURANCE'], useCaseIDs: ['UC3'], consequence: { UC3: 'c3' } };
  const b = buildMatterBrief(atlas.dataset(), d);
  let r = saveToPortfolio([], d, b, '2026-11-08T01:00:00.000Z');
  assert.equal(r.portfolio.length, 1); assert.equal(r.replaced, false);
  r = saveToPortfolio(r.portfolio, { ...d, matterLabel: '  acme   INSURANCE ', useCaseIDs: ['UC3', 'UC7'] }, b, '2026-11-08T02:00:00.000Z');
  assert.equal(r.portfolio.length, 1, 'the same client, however it is spaced or capitalised');
  assert.equal(r.replaced, true);
  assert.deepEqual(r.portfolio[0].draft.useCaseIDs, ['UC3', 'UC7']);
  assert.match(saveToPortfolio(r.portfolio, { ...d, matterLabel: ' ' }, b, '2026-11-08T03:00:00.000Z').error, /label/);
  r = saveToPortfolio(r.portfolio, { ...d, matterLabel: 'Beta Super', sectors: ['AU-SUPERANNUATION'] }, b, '2026-11-08T03:00:00.000Z');
  assert.deepEqual(r.portfolio.map((x) => x.label), ['Beta Super', 'acme INSURANCE'], 'newest first; spaces tidied');
  assert.deepEqual(removeFromPortfolio(r.portfolio, 'beta super').map((x) => x.label), ['acme INSURANCE']);
});

test('client portfolio (2.5): export, then import merges by label and keeps the newer copy', () => {
  const mk = (label, at, ucs = ['UC1']) => ({ draft: { matterLabel: label, jurisdictions: ['AU'], entityTypes: [], sectors: [], useCaseIDs: ucs, consequence: {} }, savedAt: at });
  const here = normalisePortfolio([mk('Acme', '2026-11-08T05:00:00.000Z'), mk('Beta', '2026-11-01T00:00:00.000Z')]);
  const file = exportPortfolio([mk('Acme', '2026-11-07T00:00:00.000Z', ['UC9']), mk('Beta', '2026-11-05T00:00:00.000Z', ['UC2']), mk('Gamma', '2026-11-06T00:00:00.000Z'), { draft: { matterLabel: '' } }], '2026-11-08T06:00:00.000Z');
  assert.equal(file.format, PORTFOLIO_FORMAT);
  file.clients.push({ draft: { matterLabel: '' }, savedAt: '2026-11-08T00:00:00.000Z' });
  const r = importPortfolio(here, JSON.stringify(file));
  assert.deepEqual(r.counts, { added: 1, updated: 1, keptNewer: 1, skipped: 1 });
  const by = Object.fromEntries(r.portfolio.map((x) => [x.label, x.draft.useCaseIDs.join()]));
  assert.deepEqual(by, { Acme: 'UC1', Beta: 'UC2', Gamma: 'UC1' });
  assert.match(importPortfolio(here, 'nope').error, /not valid JSON/);
  assert.match(importPortfolio(here, JSON.stringify(buildMatterBrief(atlas.dataset(), {}))).error, /single matter brief/);
  assert.match(importPortfolio(here, '{"format":"other"}').error, /not a portfolio/);
});

test('client portfolio (2.5): a brief saved before the portfolio reopens with its choices', () => {
  const d = { matterLabel: 'Old matter', jurisdictions: ['SG'], entityTypes: ['bank'], sectors: ['SG-BANKING'], useCaseIDs: ['UC3', 'UC4'], consequence: { UC4: 'c2' } };
  const back = draftFromBrief(buildMatterBrief(atlas.dataset(), d));
  assert.deepEqual(back, { ...d, consequence: { UC4: 'c2' } });
  assert.equal(normalisePortfolio([{ draft: back, brief: buildMatterBrief(atlas.dataset(), d), savedAt: '2026-10-30T00:00:00.000Z' }])[0].brief.briefFormat, 'triodian.matterBrief/1');
});

// Task 2.3b: the super trustee sources. Each proposal in the submission is checked against the obligation schema, and,
// treated as approved beside the published snapshot, a matter brief for a superannuation trustee lists them with the
// 20 records already published for super trustees.
test('super trustee sources: valid proposals, and once approved a super trustee brief lists them', () => {
  const sub = JSON.parse(fs.readFileSync('data/seed/submission-2026-11-09-super-trustee.json', 'utf8'));
  const OBLIGATION = JSON.parse(fs.readFileSync('vendor/triodian-metamodel/schemas/semantic-library/obligation.schema.json', 'utf8'));
  const v = new Ajv({ strict: false, allErrors: true }); addFormats(v);
  v.addSchema(JSON.parse(fs.readFileSync('vendor/triodian-metamodel/schemas/common.schema.json', 'utf8')));
  const valid = v.compile(OBLIGATION);
  const obs = sub.proposals.filter((p) => p.target.domainType === 'obligation');
  assert.equal(obs.length, 10);
  for (const p of obs) assert.ok(valid(p.record), `${p.target.entityID}: ${JSON.stringify(valid.errors)}`);
  for (const p of obs) assert.ok(p.evidence.length && p.evidence.every((e) => /^https:\/\//.test(e.url)), `${p.target.entityID} carries its evidence`);
  // outside the quoted source text: a quote opens after a space or bracket and closes before one, so apostrophes stay
  const words = obs.map((p) => p.record.statement.replace(/(^|[\s(])'[\s\S]*?'(?=[\s).,;:]|$)/g, '$1')).join(' ');
  assert.ok(!/\b(must|required to)\b/i.test(words), 'statements say what sources provide, not what a trustee must do');

  const before = published.records.filter((r) => r.domainType === 'obligation' && r.record.entityTypes.includes('superannuationTrustee')).map((r) => r.entityID);
  assert.equal(before.length, 20, 'the 20 super trustee records are in the published snapshot');
  const approved = obs.map((p) => ({ publicationStatus: 'published', publishedAt: '2026-11-10T00:00:00.000Z', domainType: 'obligation', entityID: p.target.entityID, governedRecordID: `${p.target.entityID}@1`, version: 1, record: p.record, provenanceRecordIDs: [], changeProposalIDs: [p.changeProposalID], dataset: 'ai-obligations-atlas' }));
  const after = new Atlas({ ...published, records: [...published.records, ...approved] }, { preview: false });
  const b = buildMatterBrief(after.dataset(), { matterLabel: 'Super trustee', sectors: ['AU-SUPERANNUATION'] });
  const listed = new Set(Object.values(b.obligationsByTier).flat().map((o) => o.obligationID));
  for (const id of [...before, ...obs.map((p) => p.target.entityID)]) assert.ok(listed.has(id), `${id} is in the brief`);
  assert.ok(b.obligationsByTier.binding.some((o) => o.obligationID === 'OBL-AU-SPS220') && b.obligationsByTier.expected.some((o) => o.obligationID === 'OBL-AU-ASIC-REP844'));
  assert.ok(validBrief(b), JSON.stringify(validBrief.errors));
  const claims = buildMatterBrief(after.dataset(), { sectors: ['AU-SUPERANNUATION'], useCaseIDs: ['UC3'] });
  assert.ok(claims.obligationsByTier.binding.some((o) => o.obligationID === 'OBL-AU-SIS-52-7'), 'claims triage (UC3) brings in the insurance covenant');
  assert.ok(!Object.values(claims.obligationsByTier).flat().some((o) => o.obligationID === 'OBL-AU-SIS-52-8A'), 'and not the retirement income covenant');
});
