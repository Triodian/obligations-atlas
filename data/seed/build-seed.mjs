#!/usr/bin/env node
/**
 * Build the Atlas seed submission from the research file.
 *
 * Turns data/research/2026-10-27-au-sg.json into Triodian Metamodel records
 * (External Organizations, Obligations, Use Cases, Data Flows, Triggers) and
 * wraps them as Reasoning Fabric connector change proposals. Every proposal
 * carries the evidence actually fetched, ranked by source precedence, so the
 * Fabric, not this script, decides what can be published and what must wait for
 * a named reviewer.
 *
 * usage: node data/seed/build-seed.mjs  ->  data/seed/submission-seed-2026-10-27.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const research = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/research/2026-10-27-au-sg.json'), 'utf8'));
const useCases = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/reference-data/use-cases.json'), 'utf8'));
const METAMODEL_VERSION = fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/VERSION'), 'utf8').trim();
const RESEARCHED = '2026-10-27';
const RETRIEVED = `${RESEARCHED}T00:00:00Z`;

// ------------------------------------------------------------ external organizations
const ORG_IDS = {
  APRA: 'EXT-APRA', ASIC: 'EXT-ASIC', OAIC: 'EXT-OAIC', ASX: 'EXT-ASX', 'Parliament of Australia': 'EXT-PARL-AU',
  DISR: 'EXT-DISR', NAIC: 'EXT-NAIC', OPC: 'EXT-OPC', MAS: 'EXT-MAS', PDPC: 'EXT-PDPC', IMDA: 'EXT-IMDA',
  MDDI: 'EXT-MDDI', 'AI Verify Foundation': 'EXT-AIVF', 'Parliament of Singapore': 'EXT-PARL-SG', AGC: 'EXT-AGC',
  'ISO/IEC': 'EXT-ISO-IEC', NIST: 'EXT-NIST', SA: 'EXT-STANDARDS-AU',
};
const REMIT = {
  'EXT-APRA': 'Prudential regulation of authorised deposit-taking institutions, general, life and private health insurers, and superannuation trustees',
  'EXT-ASIC': 'Corporate, markets, financial services and consumer credit regulation',
  'EXT-OAIC': 'Privacy and freedom of information regulation',
  'EXT-ASX': 'Market operator; administers and enforces the ASX Listing Rules',
  'EXT-MAS': 'Central bank and integrated financial regulator of Singapore',
  'EXT-PDPC': 'Administers and enforces the Personal Data Protection Act 2012',
  'EXT-IMDA': 'Infocomm and media development and regulation; AI governance frameworks',
  'EXT-ISO-IEC': 'International standards, including ISO/IEC JTC 1/SC 42 on artificial intelligence',
  'EXT-NIST': 'US measurement and standards body; publishes the AI Risk Management Framework',
};
const externalOrganizations = research.externalOrganizations.map((o) => {
  const key = o.acronym || o.name;
  const id = ORG_IDS[key];
  if (!id) throw new Error(`No ID for organization ${key}`);
  const juris = o.jurisdiction === 'INTL' ? 'INT' : o.jurisdiction;
  return {
    externalOrgID: id,
    name: o.name,
    ...(o.acronym ? { acronym: o.acronym } : {}),
    type: id === 'EXT-ASX' ? 'regulator' : o.type,
    jurisdiction: juris,
    jurisdictionCodes: [juris],
    ...(REMIT[id] ? { remit: REMIT[id] } : {}),
    website: o.website,
  };
});
const orgByAuthority = (authority) => {
  const a = authority.toUpperCase();
  for (const [k, id] of Object.entries(ORG_IDS)) if (a.includes(k.toUpperCase())) return id;
  if (/PARLIAMENT/i.test(authority) && /OAIC/i.test(authority)) return 'EXT-OAIC';
  return undefined;
};

// ------------------------------------------------------------ obligation IDs
const OBL_IDS = [
  'OBL-AU-APRA-AI-01', 'OBL-AU-APRA-AI-02', 'OBL-AU-APRA-AI-03', 'OBL-AU-APRA-AI-04', 'OBL-AU-APRA-AI-05',
  'OBL-AU-APRA-AI-06', 'OBL-AU-APRA-AI-07', 'OBL-AU-APRA-AI-08', 'OBL-AU-APRA-AI-09',
  'OBL-AU-CPS220-9', 'OBL-AU-CPS220-23',
  'OBL-AU-CPS230-20', 'OBL-AU-CPS230-33', 'OBL-AU-CPS230-35', 'OBL-AU-CPS230-47', 'OBL-AU-CPS230-54',
  'OBL-AU-CPS234-13', 'OBL-AU-CPS234-16', 'OBL-AU-CPS234-27',
  'OBL-AU-FAR-21', 'OBL-AU-FAR-20',
  'OBL-AU-PRIVACY-APP1-7', 'OBL-AU-OAIC-APP1-GUIDE',
  'OBL-AU-ASIC-REP798', 'OBL-AU-ASIC-26-092', 'OBL-AU-ASIC-MIR-AI',
  'OBL-AU-ASX-LR3-1A', 'OBL-AU-ASX-GN8',
  'OBL-AU-DISR-AI-ADOPTION', 'OBL-AU-DISR-VAISS', 'OBL-AU-DISR-GUARDRAILS',
  'OBL-INT-ISO42001', 'OBL-INT-NIST-AIRMF',
  'OBL-SG-MAS-AIRM-3', 'OBL-SG-MAS-AIRM-4-1', 'OBL-SG-MAS-AIRM-4-10', 'OBL-SG-MAS-AIRM-5-4', 'OBL-SG-MAS-AIRM-5-9',
  'OBL-SG-MAS-AIRM-5-10', 'OBL-SG-MAS-AIRM-5-15', 'OBL-SG-MAS-AIRM-5-23', 'OBL-SG-MAS-AIRM-6',
  'OBL-SG-MAS-TRM', 'OBL-SG-MAS-N658', 'OBL-SG-MAS-OUTSOURCING', 'OBL-SG-MAS-TPRM-CP', 'OBL-SG-MAS-FEAT',
  'OBL-SG-PDPC-AI', 'OBL-SG-IMDA-GENAI', 'OBL-SG-IMDA-AGENTIC',
];
if (OBL_IDS.length !== research.obligations.length) throw new Error(`ID list (${OBL_IDS.length}) does not match research (${research.obligations.length})`);

// tierBasis strings in the research -> the records held for them
const BASIS = [
  [/^CPS 220 para 9/, ['OBL-AU-CPS220-9']],
  [/^CPS 220 para (23|28)/, ['OBL-AU-CPS220-23']],
  [/^CPS 230 paras? 20/, ['OBL-AU-CPS230-20']],
  [/^CPS 230 (para 38|paras 35-42)/, ['OBL-AU-CPS230-35']],
  [/^CPS 230 paras 47-54 and 59/, ['OBL-AU-CPS230-47', 'OBL-AU-CPS230-54']],
  [/^CPS 234 paras 21 and 27/, ['OBL-AU-CPS234-16', 'OBL-AU-CPS234-27']],
  [/^CPS 234 paras 15 and 21/, ['OBL-AU-CPS234-13', 'OBL-AU-CPS234-16']],
  [/^CPS 234 paras 27-34/, ['OBL-AU-CPS234-27']],
  [/^Privacy Act 1988 Sch 1 APP 1\.7/, ['OBL-AU-PRIVACY-APP1-7']],
  [/^ASX Listing Rule 3\.1A/, ['OBL-AU-ASX-LR3-1A']],
  [/^APRA AI letter, assurance/, ['OBL-AU-APRA-AI-09']],
  [/^MAS Notice 658/, ['OBL-SG-MAS-N658']],
];

// Wording the language rules do not allow ("required" is reserved for counsel's determination).
const STATEMENT_FIXES = {
  'OBL-AU-ASIC-26-092': [["entities 'are required to table the letter at their ultimate board and risk governance committees'", "that entities are to table the letter at their ultimate board and risk governance committees"]],
  'OBL-AU-ASX-LR3-1A': [['the carve-out ceases to apply and disclosure is required immediately', 'the carve-out ceases to apply and Listing Rule 3.1 again calls for immediate disclosure']],
  'OBL-SG-PDPC-AI': [['that consent is generally required and should be meaningful', 'that consent is generally needed and should be meaningful']],
};
// Corrections to status, dates or citation found while building.
const CORRECTIONS = {
  'OBL-AU-DISR-GUARDRAILS': { status: 'withdrawn' }, // the Government is not proceeding with the proposal
  'OBL-AU-ASIC-MIR-AI': { dropDates: ['2028-01-01'] }, // placeholder: ASIC states only 'take effect in 2028'
  'OBL-AU-DISR-VAISS': { supersededBy: 'OBL-AU-DISR-AI-ADOPTION' }, // updated by Guidance for AI Adoption (Oct 2025)
};

// ------------------------------------------------------------ evidence ranking
function rankFor(url) {
  const u = url.toLowerCase();
  if (/legislation\.gov\.au|sso\.agc\.gov\.sg|handbook\.apra\.gov\.au/.test(u)) return [1, 'Official legislation register'];
  if (/apra\.gov\.au\/(standards?|sites\/default\/files\/cps_)/.test(u)) return [1, 'APRA prudential standard'];
  if (/mas\.gov\.sg\/-\/media\/.*guidelines.*\.pdf/.test(u) || /mas\.gov\.sg\/regulation\/notices\//.test(u)) return [1, 'MAS instrument'];
  if (/asx\.com\.au\/.*listing-rules|asxonline\.com\/.*gn\d+/.test(u)) return [1, 'ASX Listing Rules and Guidance Notes'];
  if (/pdpc\.gov\.sg\/-\/media\/.*advisory-guidelines/.test(u)) return [1, 'PDPC advisory guidelines'];
  if (/iso\.org|nist\.gov/.test(u)) return [3, 'Standards body'];
  if (/allenandgledhill|bakermckenzie|lexology|herbertsmith|nortonrose|allens\.com|kwm\.com|gtlaw|minterellison/.test(u)) return [4, 'Law firm commentary'];
  if (/apra\.gov\.au|asic\.gov\.au|oaic\.gov\.au|mas\.gov\.sg|pdpc\.gov\.sg|imda\.gov\.sg|mddi\.gov\.sg|industry\.gov\.au|asx\.com\.au/.test(u)) return [2, 'Regulator publication'];
  return [5, 'Other'];
}
const urlsIn = (s) => [...new Set((s || '').match(/https?:\/\/[^\s;,)]+/g) || [])].map((u) => u.replace(/[.'"]+$/, ''));
function evidenceFor(o) {
  const fetched = urlsIn(o.verifiedFrom);
  const list = (fetched.length ? fetched : [o.url]).map((url) => {
    const [sourceRank, kind] = rankFor(url);
    return { url, title: `${o.instrument} (${kind})`.slice(0, 200), sourceRank, retrievedAt: RETRIEVED };
  });
  return list.sort((a, b) => a.sourceRank - b.sourceRank);
}

// ------------------------------------------------------------ obligations
const DATE_TYPES = new Set(['made', 'published', 'commences', 'applies', 'transitionEnds', 'consultationOpens', 'consultationCloses', 'reviewDue', 'repealed']);
const proposals = [];
let n = 0;
const cp = () => `CP-SEED-2026-10-27-${String(++n).padStart(4, '0')}`;

const obligations = research.obligations.map((o, i) => {
  const id = OBL_IDS[i];
  const corr = CORRECTIONS[id] || {};
  let statement = o.statement;
  for (const [from, to] of STATEMENT_FIXES[id] || []) {
    if (!statement.includes(from)) throw new Error(`${id}: statement fix not found: ${from}`);
    statement = statement.replace(from, to);
  }
  const keyDates = (o.keyDates || []).filter((k) => DATE_TYPES.has(k.dateType) && !(corr.dropDates || []).includes(k.date))
    .map((k) => ({ dateType: k.dateType, date: k.date, ...(k.note ? { note: k.note.slice(0, 300) } : {}) }));
  const main = keyDates.find((k) => k.dateType === 'commences') || keyDates.find((k) => k.dateType === 'applies');
  const basis = [];
  const basisNotes = [];
  for (const b of o.tierBasis || []) {
    const hit = BASIS.find(([re]) => re.test(b));
    if (!hit) { basisNotes.push(b); continue; }
    for (const target of hit[1]) {
      if (target === id || basis.some((x) => x.obligationID === target)) continue;
      const t = research.obligations[OBL_IDS.indexOf(target)];
      basis.push({ obligationID: target, sourceTier: t.sourceTier, note: o.jurisdiction === 'AU' && /APRA Letter/.test(o.instrument) ? 'Triodian mapping; the letter does not cite this standard by number' : `Rests on ${b}`.slice(0, 200) });
    }
  }
  const jurisdiction = /^(ISO\/IEC|NIST)/.test(o.instrument) ? 'INT' : o.jurisdiction;
  const record = {
    obligationID: id,
    title: o.title.slice(0, 120),
    statement,
    obligationType: o.obligationType,
    source: {
      authority: o.authority,
      instrument: o.instrument,
      citation: o.citation,
      url: o.url,
      ...(orgByAuthority(o.authority) ? { externalOrgID: orgByAuthority(o.authority) } : {}),
    },
    jurisdiction,
    sourceTier: o.sourceTier,
    ...(basis.length ? { tierBasis: basis } : {}),
    entityTypes: [...new Set(o.entityTypes)],
    roles: [...new Set(o.roles)],
    useCaseIDs: [...new Set(o.useCases)],
    ...(main ? { effectiveDate: main.date } : {}),
    ...(keyDates.length ? { effectiveDates: keyDates } : {}),
    status: corr.status || o.status,
    ...(corr.supersededBy ? { supersededByObligationID: corr.supersededBy } : {}),
    monitoringFrequency: 'daily',
    lastVerified: RESEARCHED,
  };
  const rationale = [
    o.confidenceNote ? `Research note: ${o.confidenceNote}` : null,
    basisNotes.length ? `Also rests on instruments not held as records: ${basisNotes.join('; ')}` : null,
  ].filter(Boolean).join(' ');
  proposals.push({
    changeProposalID: cp(),
    changeType: 'create',
    target: { domainType: 'obligation', entityID: id, title: record.title },
    record,
    evidence: evidenceFor(o),
    ...(rationale ? { rationale: rationale.slice(0, 4000) } : {}),
  });
  return record;
});

// ------------------------------------------------------------ external organizations, use cases
for (const org of externalOrganizations) {
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'externalOrganization', entityID: org.externalOrgID, title: org.name },
    record: org, evidence: [{ url: org.website, title: `${org.name} website`, sourceRank: org.type === 'standardsBody' ? 3 : 2, retrievedAt: RETRIEVED }],
  });
}
for (const uc of useCases.items) {
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'useCase', entityID: uc.useCaseID, title: uc.title },
    record: uc,
    evidence: [{ url: `https://github.com/Triodian/Triodian_Metamodel/blob/main/reference-data/use-cases.json`, title: 'Triodian Metamodel standardised use cases', sourceRank: 1, retrievedAt: RETRIEVED }],
  });
}

// ------------------------------------------------------------ monitored sources (data flows)
const dfIDs = new Map();
const dataFlows = research.monitoringSources.map((m, i) => {
  const org = ORG_IDS[m.regulator] || orgByAuthority(m.regulator || '');
  const id = `DF-${(m.regulator || 'SRC').replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${String(i + 1).padStart(2, '0')}`;
  dfIDs.set(org, [...(dfIDs.get(org) || []), id]);
  const basis = { 1: 'officialText', 2: 'regulatorPublication', 3: 'standardsBodyPublication' }[m.rank] || 'regulatorPublication';
  const feed = /rss|feed/i.test(m.url) || /rss|feed/i.test(m.name);
  return {
    dataFlowID: id,
    title: `Watch: ${m.name}`.slice(0, 160),
    description: (m.note || `Daily check of ${m.name} for new or amended instruments`).slice(0, 500),
    sourceSystems: [{ endpointType: feed ? 'feed' : m.rank === 1 ? 'register' : 'webPage', title: m.name, url: m.url }],
    targetSystems: [{ endpointType: 'software', title: 'Atlas update agent (via the Reasoning Fabric connector)' }],
    frequency: 'daily',
    schemaReference: { format: feed ? 'rss' : 'html' },
    sourcePrecedence: { rank: m.rank, basis, canSetStatusOrDate: m.rank <= 3 },
    ...(org ? { externalOrgID: org } : {}),
    jurisdiction: m.jurisdiction === 'INTL' ? 'INT' : m.jurisdiction,
    governance: { ownerTitle: 'Triodian method owner', humanApprovalRequired: true },
    status: 'planned',
  };
});
for (const df of dataFlows) {
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'dataFlow', entityID: df.dataFlowID, title: df.title },
    record: df, evidence: [{ url: df.sourceSystems[0].url, title: df.sourceSystems[0].title, sourceRank: df.sourcePrecedence.rank, retrievedAt: RETRIEVED }],
  });
}
for (const p of proposals) {
  if (p.target.domainType === 'externalOrganization' && dfIDs.get(p.target.entityID)) p.record.monitoredSourceDataFlowIDs = dfIDs.get(p.target.entityID);
}

// ------------------------------------------------------------ triggers: recent instrument changes
const ids = (prefix) => obligations.filter((o) => o.obligationID.startsWith(prefix)).map((o) => ({ domainType: 'obligation', entityID: o.obligationID, title: o.title }));
const triggers = [
  {
    triggerID: 'TRG-SG-MAS-AIRM-2026-10-07', label: 'MAS issues Guidelines on AI Risk Management',
    description: 'MAS issued its Guidelines on Artificial Intelligence Risk Management on 7 October 2026. They take effect on 7 October 2027; sections 3 and 4 from that date, and sections 5 and 6 by 7 October 2028.',
    instrumentChange: { instrument: 'MAS Guidelines on Artificial Intelligence Risk Management', changeType: 'newInstrument', jurisdiction: 'SG', externalOrgID: 'EXT-MAS', sourceURL: research.obligations[33].url, sourceRank: 1, publishedDate: '2026-10-07', effectiveDate: '2027-10-07', summary: 'New guidelines; consultation P017-2025 closed 31 January 2026' },
    affected: ids('OBL-SG-MAS-AIRM'), detection: '2026-10-07', horizon: 'shortTerm',
  },
  {
    triggerID: 'TRG-AU-APRA-AI-LETTER-2026-04-30', label: 'APRA letter to industry on AI',
    description: 'APRA wrote to regulated entities on 30 April 2026 setting out minimum expectations for boards, governance, information security, suppliers and assurance in the use of AI.',
    instrumentChange: { instrument: 'APRA Letter to Industry on Artificial Intelligence (AI)', changeType: 'guidance', jurisdiction: 'AU', externalOrgID: 'EXT-APRA', sourceURL: research.obligations[0].url, sourceRank: 2, publishedDate: '2026-04-30', summary: 'Regulator expectations; APRA states it is not proposing additional requirements at this stage' },
    affected: ids('OBL-AU-APRA-AI'), detection: '2026-04-30', horizon: 'immediate',
  },
  {
    triggerID: 'TRG-AU-CPS230-REMADE-2026-04-29', label: 'CPS 230 remade with targeted amendments',
    description: 'APRA remade CPS 230 on 29 April 2026 with targeted amendments, commencing 1 July 2026, including an exemption from some contract provisions for specified non-traditional service providers.',
    instrumentChange: { instrument: 'Prudential Standard CPS 230 Operational Risk Management', changeType: 'amendment', jurisdiction: 'AU', externalOrgID: 'EXT-APRA', sourceURL: 'https://www.apra.gov.au/news-and-publications/final-targeted-amendments-cps-230-operational-risk-management', sourceRank: 2, publishedDate: '2026-04-29', effectiveDate: '2026-07-01', summary: 'Paragraph numbering in the 2026 text to be confirmed against the 2023 numbering used in the records' },
    affected: ids('OBL-AU-CPS230'), detection: '2026-04-29', horizon: 'immediate',
  },
  {
    triggerID: 'TRG-AU-PRIVACY-ADM-2026-12-10', label: 'Automated decision transparency provisions commence',
    description: 'APP 1.7 to 1.9, inserted by the Privacy and Other Legislation Amendment Act 2024, commence on 10 December 2026. On that date the record moves from the anticipated to the binding tier, subject to review.',
    instrumentChange: { instrument: 'Privacy Act 1988 (Cth), Schedule 1, APP 1.7-1.9', changeType: 'commencement', jurisdiction: 'AU', externalOrgID: 'EXT-OAIC', sourceURL: research.obligations[21].url, sourceRank: 1, publishedDate: '2024-12-10', effectiveDate: '2026-12-10' },
    affected: ids('OBL-AU-PRIVACY').concat(ids('OBL-AU-OAIC')), detection: '2026-10-27', horizon: 'immediate',
  },
  {
    triggerID: 'TRG-AU-GUARDRAILS-WITHDRAWN', label: 'Mandatory AI guardrails proposal not proceeding',
    description: 'The Australian Government stated it will not proceed at this time with the mandatory guardrails proposals, relying instead on existing laws and the National AI Plan.',
    instrumentChange: { instrument: 'Introducing mandatory guardrails for AI in high-risk settings: proposals paper', changeType: 'withdrawal', jurisdiction: 'AU', externalOrgID: 'EXT-DISR', sourceURL: research.obligations[30].url, sourceRank: 2, publishedDate: '2025-12-02' },
    affected: ids('OBL-AU-DISR-GUARDRAILS'), detection: '2025-12-02', horizon: 'immediate',
  },
].map((t) => ({
  triggerID: t.triggerID, label: t.label, description: t.description, primaryCategory: 'regulatoryCompliance', subCategory: 'AI governance instrument',
  origin: 'External', timeHorizon: t.horizon, status: 'identified', detectionMethod: 'Atlas research (seed)', evidenceStrength: t.instrumentChange.sourceRank === 1 ? 5 : 4,
  detectionDate: t.detection, sourceReference: t.instrumentChange.sourceURL, instrumentChange: t.instrumentChange, affectedEntities: t.affected,
}));
for (const t of triggers) {
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'trigger', entityID: t.triggerID, title: t.label },
    record: t, evidence: [{ url: t.instrumentChange.sourceURL, title: t.instrumentChange.instrument, sourceRank: t.instrumentChange.sourceRank, retrievedAt: RETRIEVED, ...(t.instrumentChange.publishedDate ? { publishedDate: t.instrumentChange.publishedDate } : {}) }],
  });
}

const submission = {
  submissionID: 'SUB-ATLAS-SEED-2026-10-27',
  interfaceVersion: '1.0.0',
  metamodelVersion: METAMODEL_VERSION,
  mode: 'propose',
  dataset: 'ai-obligations-atlas',
  submittedAt: RETRIEVED,
  submitter: { actorType: 'agent', actorID: 'atlas-seed-builder', displayName: 'Atlas seed builder (research of 27 Oct 2026)' },
  proposals,
};
const out = path.join(ROOT, 'data/seed/submission-seed-2026-10-27.json');
fs.writeFileSync(out, JSON.stringify(submission, null, 2) + '\n');
const count = (t) => proposals.filter((p) => p.target.domainType === t).length;
console.log(`${proposals.length} proposals -> ${path.relative(ROOT, out)}: ${count('obligation')} obligations, ${count('externalOrganization')} external organizations, ${count('useCase')} use cases, ${count('dataFlow')} data flows, ${count('trigger')} triggers`);
