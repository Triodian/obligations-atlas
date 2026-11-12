/**
 * The solution set and its routing table (development plan task 5.3). The routing test covers every combination of
 * role, entity type and jurisdiction, with and without each prompt, and checks the front door's solution set and the
 * matter brief agree on the engagements and the mode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Atlas, buildMatterBrief, ENTITY_TYPES, JURISDICTIONS } from '../src/core/atlas.js';
import { ROUTING_TABLE, solutionSet, scopeFromLink, routeFor } from '../src/core/solution-set.js';
import { createApp } from '../src/api/app.js';

const snapshot = JSON.parse(fs.readFileSync('data/snapshot/ai-obligations-atlas.json', 'utf8'));
const atlas = new Atlas(snapshot);
const data = atlas.dataset();
// The role ids each app defines (public/shared/rules.js or lib/core/roles.js in each app repo), so `yourPart` names a real role.
const APP_ROLES = {
  aiBoardDirection: ['methodOwner', 'recorder', 'advisor', 'gc', 'chair', 'director', 'ceo', 'cro', 'areaOwner', 'technologyOwner', 'aiGovernance'],
  aiRiskAppetite: ['counsel', 'gc', 'triodian', 'cro', 'risk', 'independent', 'board'],
  aiUseAssessment: ['methodOwner', 'assessor', 'peer', 'validation', 'delivery', 'counsel', 'gc', 'owner', 'ir', 'cro', 'executive', 'technologyOwner', 'aiGovernance'],
  aiConfidentialityExposureAssessment: ['methodOwner', 'assessor', 'peer', 'validation', 'delivery', 'counsel', 'gc', 'dealLead', 'tenantOwner', 'checker', 'executive'],
};

test('every role in the table names real roles in each app', () => {
  for (const r of ROUTING_TABLE.roles) for (const [app, part] of Object.entries(r.parts)) assert.ok(APP_ROLES[app].includes(part), `${r.id} → ${app}.${part}`);
  for (const p of ROUTING_TABLE.prompts) assert.ok(p.startWith === null || p.startWith in ROUTING_TABLE.engagements, p.id);
});

test('routing: every combination of role, entity type and jurisdiction, with each prompt, gives a sound solution set that agrees with the matter brief', () => {
  const roles = [undefined, ...ROUTING_TABLE.roles.map((r) => r.id)];
  const prompts = [undefined, ...ROUTING_TABLE.prompts.map((p) => p.id)];
  let n = 0;
  for (const role of roles) for (const entityType of Object.keys(ENTITY_TYPES)) for (const jurisdiction of Object.keys(JURISDICTIONS)) for (const prompt of prompts) {
    const at = `${role}/${entityType}/${jurisdiction}/${prompt}`;
    const s = solutionSet({ role, entityTypes: [entityType], jurisdiction, prompt, size: 'medium' });
    assert.equal(s.error, undefined, at);
    assert.ok(s.profile === 'regulated' || s.profile === 'general', at);
    const ids = s.engagements.map((e) => e.assessmentType);
    assert.deepEqual(s.engagements.map((e) => e.step), ids.map((_, i) => i + 1), at);
    assert.equal(s.engagements.filter((e) => e.startHere).length, 1, at);
    for (const e of s.engagements) {
      assert.ok(e.why && e.needs.people.length && e.needs.documents.length && e.needs.sessions, `${at} ${e.assessmentType}`);
      if (role) assert.ok(e.yourPart === null ? !!e.yourPartNote : APP_ROLES[e.assessmentType].includes(e.yourPart), `${at} ${e.assessmentType}`);
    }
    // The board directs first in both routes.
    assert.equal(ids[0], 'aiBoardDirection', at);
    if (s.profile === 'regulated') assert.deepEqual(ids.slice(0, 3), ['aiBoardDirection', 'aiRiskAppetite', 'aiUseAssessment'], at);
    // The same scope in the matter brief gives the same engagements and the same mode.
    const b = buildMatterBrief(data, { jurisdictions: [jurisdiction], entityTypes: [entityType], useCaseIDs: s.matterBrief.scope.useCaseIDs });
    assert.equal(b.profile, s.profile, at);
    assert.deepEqual(b.engagementsThatFit.map((e) => e.assessmentType).sort(), ids.slice().sort(), at);
    assert.equal(b.engagementsThatFit.find((e) => e.assessmentType === 'aiBoardDirection').mode, s.engagements[0].mode, at);
    assert.deepEqual(scopeFromLink(decodeURIComponent(s.matterBrief.url.split('#/brief/')[1])), s.matterBrief.scope, at);
    assert.deepEqual(atlas.languageIssues(s, 'response'), [], at);
    n++;
  }
  assert.equal(n, roles.length * Object.keys(ENTITY_TYPES).length * Object.keys(JURISDICTIONS).length * prompts.length);
});

test('a super trustee prompted by the APRA letter starts with AI Board Direction in connected mode, then the regulated chain', () => {
  const s = solutionSet({ role: 'croOrRisk', sectors: ['AU-SUPERANNUATION'], jurisdiction: 'AU', size: 'large', prompt: 'apraLetter' });
  assert.equal(s.profile, 'regulated');
  assert.deepEqual(s.engagements.map((e) => [e.assessmentType, e.yourPart]), [['aiBoardDirection', 'cro'], ['aiRiskAppetite', 'cro'], ['aiUseAssessment', 'cro']]);
  assert.equal(s.engagements[0].mode, 'connected');
  assert.ok(s.engagements[0].startHere);
  assert.equal(s.engagements[2].scope, 'full');
  assert.equal(solutionSet({ sectors: ['AU-SUPERANNUATION'], size: 'small' }).engagements[2].scope, 'lite', 'a smaller trustee is offered Lite scope');
  assert.deepEqual(s.matterBrief.scope.entityTypes, ['superannuationTrustee']);
});

test('a private company with a deal adds the confidentiality assessment and starts there; a consultant has no part of their own', () => {
  const s = solutionSet({ role: 'consultant', entityTypes: ['privateCompany'], jurisdiction: 'AU', prompt: 'deal' });
  assert.deepEqual(s.engagements.map((e) => e.assessmentType), ['aiBoardDirection', 'aiConfidentialityExposureAssessment']);
  assert.ok(s.engagements[1].startHere);
  assert.equal(s.engagements[0].mode, 'standalone');
  assert.ok(s.engagements.every((e) => e.yourPart === null && /GC or counsel/.test(e.yourPartNote)));
  assert.deepEqual(s.matterBrief.scope.useCaseIDs, ['UC10']);
  assert.ok(!s.engagements[0].needs.people.some((p) => /connected mode/.test(p)), 'no CRO in standalone mode');
  const r = solutionSet({ entityTypes: ['bank'], prompt: 'deal' });
  assert.deepEqual(r.engagements.map((e) => e.assessmentType), ['aiBoardDirection', 'aiRiskAppetite', 'aiUseAssessment', 'aiConfidentialityExposureAssessment'], 'a regulated deal adds it too');
});

test('notices: an uncovered jurisdiction, a prompt from another jurisdiction, and no organisation type yet', () => {
  assert.ok(solutionSet({ entityTypes: ['privateCompany'], jurisdiction: 'NZ' }).notices.some((x) => /does not yet cover NZ/.test(x)));
  assert.ok(solutionSet({ entityTypes: ['bank'], jurisdiction: 'SG', prompt: 'apraLetter' }).notices.some((x) => /applies in AU, not SG/.test(x)));
  const none = solutionSet({ role: 'inHouseGC' });
  assert.equal(none.profile, undefined);
  assert.deepEqual(none.engagements.map((e) => e.assessmentType), ['aiBoardDirection']);
  assert.ok(none.notices.some((x) => /Choose an organisation type/.test(x)));
  assert.equal(routeFor([], [], [], ['aiUseAssessment']).assessments.join(), 'aiUseAssessment,aiBoardDirection');
});

test('unknown ids are refused by name', () => {
  assert.match(solutionSet({ role: 'nobody' }).error, /Unknown role nobody/);
  assert.match(solutionSet({ prompt: 'x' }).error, /Unknown prompt x/);
  assert.match(solutionSet({ sectors: ['AU-NOWHERE'] }).error, /Unknown sector AU-NOWHERE/);
});

test('the REST API serves the table and the solution set, and refuses unknown ids', async () => {
  const app = createApp({ snapshot, requireKey: true });
  let r = await app.request('http://atlas.test/api/v1/solution-set/table');
  assert.equal(r.status, 200, 'open without a key, for the front door');
  const table = await r.json();
  assert.equal(table.format, 'triodian.routingTable/1');
  assert.ok(table.jurisdictions.some((j) => j.code === 'AU' && j.covered) && table.jurisdictions.some((j) => j.code === 'NZ' && !j.covered));
  assert.ok(table.sectors.some((d) => d.regulatedSectorID === 'AU-SUPERANNUATION' && d.financiallyRegulated));
  assert.ok(table.generalEntityTypes.some((e) => e.id === 'privateCompany'));
  r = await app.request('http://atlas.test/api/v1/solution-set?role=fractionalGC&sector=AU-SUPERANNUATION&jurisdiction=au&prompt=apraLetter');
  const s = await r.json();
  assert.equal(r.status, 200);
  assert.equal(s.format, 'triodian.solutionSet/1');
  assert.ok(s.matterBrief.url.startsWith('http://atlas.test/#/brief/'));
  for (const [u, code] of [['entityType=dragon', 'query.entityType'], ['jurisdiction=XX', 'query.jurisdiction'], ['size=huge', 'query.solutionSet']]) {
    r = await app.request(`http://atlas.test/api/v1/solution-set?${u}`);
    assert.equal(r.status, 400, u);
    assert.equal((await r.json()).code, code);
  }
});
