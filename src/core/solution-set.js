import { REGULATED_SECTORS } from './sectors.js';
/**
 * The solution set (development plan task 5.3): one routing table that says which Triodian engagements suit a
 * client, in what order, why each fits and what each needs. The Atlas matter brief (task 2.4) routes from the same
 * table, so the front door (Triodian Start, phase 5) and the brief always agree. Plain ES module, shared by the
 * server, the REST API, the MCP server and the browser, like atlas.js.
 *
 * The table holds no prices and no legal view. What each engagement needs comes from its framework's summary table
 * (people from each app's roles, documents from its inputs, sessions from its method and duration).
 */

export const SOLUTION_SET_FORMAT = 'triodian.solutionSet/1';
export const ROUTING_TABLE_VERSION = '1.0.0';

const SUITE = 'triodian.com';
const site = (host) => `https://${host}.${SUITE}/`;

/** The routing table. Served whole at /api/v1/solution-set/table for the front door's questions. */
export const ROUTING_TABLE = {
  format: 'triodian.routingTable/1',
  version: ROUTING_TABLE_VERSION,
  // Who the person is (task 5.2). `parts` says which role they would usually hold in each engagement.
  roles: [
    { id: 'fractionalGC', name: 'Fractional GC', parts: { aiBoardDirection: 'gc', aiRiskAppetite: 'gc', aiUseAssessment: 'gc', aiConfidentialityExposureAssessment: 'gc' } },
    { id: 'inHouseGC', name: 'In-house GC', parts: { aiBoardDirection: 'gc', aiRiskAppetite: 'gc', aiUseAssessment: 'gc', aiConfidentialityExposureAssessment: 'gc' } },
    { id: 'boardAdvisor', name: 'Board advisor', parts: { aiBoardDirection: 'advisor' } },
    { id: 'directorOrChair', name: 'Director or chair', parts: { aiBoardDirection: 'chair', aiRiskAppetite: 'board' } },
    { id: 'croOrRisk', name: 'CRO or risk', parts: { aiBoardDirection: 'cro', aiRiskAppetite: 'cro', aiUseAssessment: 'cro' } },
    { id: 'externalCounsel', name: 'External counsel', parts: { aiRiskAppetite: 'counsel', aiUseAssessment: 'counsel', aiConfidentialityExposureAssessment: 'counsel' } },
    { id: 'consultant', name: 'Consultant', parts: {} },
  ],
  // What prompted it (task 5.2). `useCaseIDs` pre-scope the matter brief; `startWith` names the first engagement.
  prompts: [
    { id: 'boardRequest', name: 'The board asked', useCaseIDs: [], startWith: 'aiBoardDirection' },
    { id: 'apraLetter', name: 'APRA’s letter on AI (30 April 2026)', useCaseIDs: [], startWith: 'aiBoardDirection', jurisdictions: ['AU'] },
    { id: 'masGuidelines', name: 'MAS AI Risk Management Guidelines', useCaseIDs: [], startWith: 'aiBoardDirection', jurisdictions: ['SG'] },
    { id: 'privacyAdm', name: 'Privacy Act automated decisions (from 10 December 2026)', useCaseIDs: ['UC2', 'UC3'], startWith: 'aiBoardDirection', jurisdictions: ['AU'] },
    { id: 'deal', name: 'A deal or other confidential matter', useCaseIDs: ['UC10'], startWith: 'aiConfidentialityExposureAssessment' },
    { id: 'providerQuestion', name: 'A question about a provider’s AI', useCaseIDs: ['UC7'], startWith: null },
  ],
  sizes: [
    { id: 'small', name: 'Fewer than 100 staff' },
    { id: 'medium', name: '100 to 1,000 staff' },
    { id: 'large', name: 'More than 1,000 staff' },
  ],
  // The two routes. A financially regulated scope (any entity type or sector in one) takes the regulated chain.
  profiles: {
    regulated: { name: 'Financially regulated', reason: 'Fits a financially regulated entity', engagements: ['aiRiskAppetite', 'aiUseAssessment', 'aiBoardDirection'], boardMode: 'connected',
      // The order the work is done in (plan task 5.7): the board directs first, then the appetite, then the assessment.
      journey: ['aiBoardDirection', 'aiRiskAppetite', 'aiUseAssessment'] },
    general: { name: 'Outside financial regulation', reason: 'Fits an entity outside financial regulation', engagements: ['aiBoardDirection', 'aiConfidentialityExposureAssessment'], boardMode: 'standalone',
      journey: ['aiBoardDirection', 'aiConfidentialityExposureAssessment'] },
  },
  // An engagement a use case brings in when the profile does not list it.
  addedByUseCase: { aiConfidentialityExposureAssessment: ['UC10'] },
  engagements: {
    aiBoardDirection: {
      name: 'AI Board Direction', site: site('board-direction'),
      does: 'Records the board’s directions on AI: its appetite, red lines and questions for counsel, resolved at a board meeting',
      why: {
        regulated: 'The board gives its directions first; the AI risk appetite engagement then stays within them',
        general: 'The board sets the whole AI appetite in one engagement',
      },
      needs: {
        people: ['Chair', 'Directors', 'CEO or accountable executive', 'General counsel', 'Board advisor (optional)', 'CRO (connected mode)', 'Triodian method owner and recorder'],
        documents: ['A list of the AI tools and uses in the business (the B1 inventory; a provider register can be imported)', 'An Atlas matter brief'],
        sessions: { connected: 'A director briefing, then the board’s directions before the AI risk appetite engagement, and its approval of the statement after', standalone: 'A director briefing, one workshop of about three hours, and the resolution at the next board meeting: two to four weeks' },
      },
    },
    aiRiskAppetite: {
      name: 'AI Risk Appetite', site: site('risk-appetite'),
      does: 'Sets the board’s AI risk appetite and the triggers that act on it',
      why: { regulated: 'Turns the board’s directions into an AI risk appetite statement, a tolerance and trigger schedule and a calibration set' },
      needs: {
        people: ['Counsel (facilitator)', 'General counsel', 'CRO', 'Risk function', 'Independent reviewer', 'The board, to approve', 'Triodian recorder'],
        documents: ['The existing risk appetite statement', 'Critical operations and their tolerances', 'Operational risk thresholds', 'The AI inventory', 'The board’s directions, from AI Board Direction'],
        sessions: { any: 'Eight decisions in two sessions and a challenge round: two to three weeks, alongside the first two weeks of the assessment' },
      },
    },
    aiUseAssessment: {
      name: 'AI Use Assessment', site: site('use-assessment'),
      does: 'Assesses a particular AI use, including AI in the supply chain',
      why: { regulated: 'Tests, arrangement by arrangement, what evidence of AI behaviour each provider can produce, against the calibration set', any: 'Fits the use cases in scope' },
      needs: {
        people: ['Counsel', 'General counsel', 'CRO', 'Arrangement owners', 'Independent reviewer', 'Triodian method owner, assessor, peer reviewer, validation and delivery manager'],
        documents: ['The AI inventory or provider register', 'The agreement for each arrangement in scope', 'The calibration set, from AI Risk Appetite'],
        sessions: { any: 'Three to four weeks; in Lite scope, the 10 to 15 arrangements behind critical operations' },
      },
    },
    aiConfidentialityExposureAssessment: {
      name: 'AI Confidentiality Exposure Assessment', site: site('confidentiality'),
      does: 'Assesses exposure of confidential information, such as deal information, to AI tools',
      why: { general: 'When a deal or other confidential matter arises, tests each channel by which matter information could reach an external AI model', any: 'Fits a confidential matter: a deal, a dispute, a tender or board papers' },
      needs: {
        people: ['Counsel (law firm)', 'General counsel or approving executive', 'Matter team lead', 'Tenant owner', 'Independent checker', 'Triodian method owner, assessor, classification reviewer, validation and delivery manager'],
        documents: ['Through counsel: the matter team and insider list', 'The adviser list and their letters', 'The confidentiality deed or other terms that bind the matter', 'The board’s confidentiality position, if set', 'The tenant owner’s configuration summary', 'The sanctioned tools’ terms'],
        sessions: { any: 'Two weeks' },
      },
    },
  },
};

const T = ROUTING_TABLE;
export const ENGAGEMENT_IDS = Object.keys(T.engagements);
const sectorOf = (id) => REGULATED_SECTORS.find((d) => d.regulatedSectorID === id) || null;
/** Entity types in a financially regulated sector (Metamodel reference data), including the broader types those sectors reach. */
export const FINANCIALLY_REGULATED_TYPES = [...new Set(REGULATED_SECTORS.filter((d) => d.financiallyRegulated).flatMap((d) => [...d.entityTypes, ...(d.alsoReaches || [])]))];

/**
 * The route for a scope, from the table. With an entity type or sector, the profile decides; a use case can add an
 * engagement the profile does not list (UC10 adds the confidentiality assessment). With neither, the caller's
 * use-case fits decide (`fits`, engagement ids), and AI Board Direction is listed without a mode.
 * @returns {{ profile: 'regulated'|'general'|null, assessments: string[], boardMode: 'connected'|'standalone'|null, added: string[] }}
 */
export function routeFor(entityTypes = [], sectors = [], useCaseIDs = [], fits = []) {
  const secs = sectors.map((d) => (typeof d === 'string' ? sectorOf(d) : d)).filter(Boolean);
  if (!entityTypes.length && !secs.length) {
    const list = [...new Set([...fits, 'aiBoardDirection'])];
    return { profile: null, assessments: list, boardMode: null, added: [] };
  }
  const regulated = entityTypes.some((e) => FINANCIALLY_REGULATED_TYPES.includes(e)) || secs.some((d) => d.financiallyRegulated);
  const profile = regulated ? 'regulated' : 'general', p = T.profiles[profile];
  const added = Object.entries(T.addedByUseCase).filter(([a, ucs]) => !p.engagements.includes(a) && ucs.some((u) => useCaseIDs.includes(u))).map(([a]) => a);
  return { profile, assessments: [...p.engagements, ...added], boardMode: p.boardMode, added };
}

const pick = (o, profile) => (o ? o[profile] || o.any || o[Object.keys(o)[0]] : '');

/**
 * The solution set for a person and their organisation (tasks 5.2 and 5.3). input: { role, entityTypes, sectors,
 * jurisdiction, size, prompt }. Returns the engagements in the order the work is done, why each fits, what each
 * needs, the person's usual part in each, and a pre-scoped matter brief (its scope, and a link that opens the Atlas
 * brief with it). Unknown ids are refused by name.
 */
export function solutionSet(input = {}, { atlasUrl = 'https://obligations-atlas.triodian.com', coveredJurisdictions = ['AU', 'SG'] } = {}) {
  const errors = [];
  const role = input.role ? T.roles.find((r) => r.id === input.role) : null;
  if (input.role && !role) errors.push(`Unknown role ${input.role}; use one of ${T.roles.map((r) => r.id).join(', ')}`);
  const prompt = input.prompt ? T.prompts.find((p) => p.id === input.prompt) : null;
  if (input.prompt && !prompt) errors.push(`Unknown prompt ${input.prompt}; use one of ${T.prompts.map((p) => p.id).join(', ')}`);
  const size = input.size ? T.sizes.find((s) => s.id === input.size) : null;
  if (input.size && !size) errors.push(`Unknown size ${input.size}; use one of ${T.sizes.map((s) => s.id).join(', ')}`);
  const sectors = (input.sectors || []).filter(Boolean);
  const badSec = sectors.filter((s) => !sectorOf(s));
  if (badSec.length) errors.push(`Unknown sector ${badSec.join(', ')}`);
  if (errors.length) return { error: errors.join('. ') + '.' };

  const jurisdiction = input.jurisdiction || null;
  const entityTypes = [...new Set([...(input.entityTypes || []), ...sectors.flatMap((s) => sectorOf(s).entityTypes)])];
  const useCaseIDs = prompt ? prompt.useCaseIDs.slice() : [];
  const route = routeFor(entityTypes, sectors, useCaseIDs);
  const profile = route.profile;
  const order = profile ? [...T.profiles[profile].journey, ...route.added] : route.assessments;
  const start = prompt && prompt.startWith && order.includes(prompt.startWith) ? prompt.startWith : order[0];
  const engagements = order.map((id, i) => {
    const e = T.engagements[id];
    const mode = id === 'aiBoardDirection' && route.boardMode ? route.boardMode : null;
    const sessions = e.needs.sessions[mode || ''] || e.needs.sessions.any || e.needs.sessions.standalone;
    const part = role ? role.parts[id] || null : null;
    return {
      assessmentType: id, step: i + 1, name: e.name, purpose: e.does, ...(mode ? { mode } : {}),
      why: route.added.includes(id) ? pick(e.why, 'any') : pick(e.why, profile || 'any'),
      needs: { people: e.needs.people.filter((p) => mode !== 'standalone' || !/connected mode/.test(p)), documents: e.needs.documents.filter((d) => profile === 'regulated' || !/from AI (Board Direction|Risk Appetite)/.test(d)), sessions },
      ...(role ? { yourPart: part, ...(part ? {} : { yourPartNote: `A ${role.name.toLowerCase()} usually works through the GC or counsel who holds a role here` }) } : {}),
      ...(id === start ? { startHere: true } : {}),
      ...(id === 'aiUseAssessment' && profile === 'regulated' && size ? { scope: size.id === 'large' ? 'full' : 'lite' } : {}),
      workedExample: e.site,
    };
  });
  const notices = [];
  if (jurisdiction && !coveredJurisdictions.includes(jurisdiction)) notices.push(`The Atlas does not yet cover ${jurisdiction}: the engagements still fit, but the matter brief will hold few or no records for it.`);
  if (prompt && prompt.jurisdictions && jurisdiction && !prompt.jurisdictions.includes(jurisdiction)) notices.push(`${prompt.name} applies in ${prompt.jurisdictions.join(', ')}, not ${jurisdiction}.`);
  if (!profile) notices.push('Choose an organisation type or a regulated sector to see the route; until then the engagements fit the use cases only.');
  const briefScope = { jurisdictions: jurisdiction ? [jurisdiction] : [], entityTypes, sectors, useCaseIDs };
  const q = new URLSearchParams();
  if (briefScope.jurisdictions.length) q.set('j', briefScope.jurisdictions.join(','));
  if (entityTypes.length) q.set('e', entityTypes.join(','));
  if (sectors.length) q.set('s', sectors.join(','));
  if (useCaseIDs.length) q.set('u', useCaseIDs.join(','));
  return {
    format: SOLUTION_SET_FORMAT, routingTableVersion: T.version,
    ...(profile ? { profile, profileName: T.profiles[profile].name } : {}),
    input: { ...(role ? { role: role.id } : {}), entityTypes, sectors, ...(jurisdiction ? { jurisdiction } : {}), ...(size ? { size: size.id } : {}), ...(prompt ? { prompt: prompt.id } : {}) },
    engagements,
    matterBrief: { scope: briefScope, url: `${atlasUrl}/#/brief/${encodeURIComponent(q.toString())}` },
    notices,
  };
}

/** Reads a brief scope from the Atlas brief link's argument ("j=AU&e=...&s=...&u=..."), as solutionSet writes it. */
export function scopeFromLink(arg) {
  const q = new URLSearchParams(arg || '');
  const list = (k) => (q.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { jurisdictions: list('j'), entityTypes: list('e'), sectors: list('s'), useCaseIDs: list('u') };
}
