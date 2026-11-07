#!/usr/bin/env node
/**
 * Build a Reasoning Fabric submission from a research file after the seed (development plan task 2.3).
 *
 * The research file names each record's obligationID itself (field `id`), lists only new organizations and
 * monitored sources, and keeps changes to records already held under `updates`, written out as notes for the reviewer
 * (the records they touch are still in the review queue, so they cannot take an update proposal yet).
 * Every proposal carries the evidence actually fetched, ranked by source, so the Fabric decides what waits
 * for a named reviewer.
 *
 * usage: node data/seed/build-submission.mjs data/research/2026-11-08-general-and-2026.json
 *        -> data/seed/submission-2026-11-08-general-and-2026.json and data/seed/reviewer-notes-2026-11-08-general-and-2026.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { evidenceFor } from './evidence.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const file = process.argv[2];
if (!file) { console.error('usage: node data/seed/build-submission.mjs <research file>'); process.exit(1); }
const research = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const name = path.basename(file, '.json');
const RESEARCHED = research.researched;
const RETRIEVED = `${RESEARCHED}T00:00:00Z`;
const METAMODEL_VERSION = fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/VERSION'), 'utf8').trim();
const ENTITY_TYPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/schemas/semantic-library/obligation.schema.json'), 'utf8')).definitions.regulatedEntityType.enum;

// Organizations: those in the seed, and any new ones in this research file.
const ORG_IDS = {
  APRA: 'EXT-APRA', ASIC: 'EXT-ASIC', OAIC: 'EXT-OAIC', ASX: 'EXT-ASX', 'Parliament of Australia': 'EXT-PARL-AU',
  DISR: 'EXT-DISR', NAIC: 'EXT-NAIC', OPC: 'EXT-OPC', MAS: 'EXT-MAS', PDPC: 'EXT-PDPC', IMDA: 'EXT-IMDA',
  MDDI: 'EXT-MDDI', 'AI Verify Foundation': 'EXT-AIVF', 'Parliament of Singapore': 'EXT-PARL-SG', AGC: 'EXT-AGC',
  'ISO/IEC': 'EXT-ISO-IEC', NIST: 'EXT-NIST', SA: 'EXT-STANDARDS-AU',
  'Parliament of New South Wales': 'EXT-PARL-NSW', Ahpra: 'EXT-AHPRA', CSA: 'EXT-CSA-SG', 'Singapore Customs': 'EXT-SG-CUSTOMS',
  MOM: 'EXT-MOM-SG', CCCS: 'EXT-CCCS', MOH: 'EXT-MOH-SG', FSB: 'EXT-FSB',
};
const orgID = (key) => ORG_IDS[key];

const proposals = [];
let n = 0;
const cp = () => `CP-${RESEARCHED}-${String(++n).padStart(4, '0')}`;
const DATE_TYPES = new Set(['made', 'published', 'commences', 'applies', 'transitionEnds', 'consultationOpens', 'consultationCloses', 'reviewDue', 'repealed']);

for (const o of research.obligations) {
  if (!/^OBL-(AU|SG|INT)-[A-Z0-9-]+$/.test(o.id)) throw new Error(`Bad obligation id ${o.id}`);
  const unknown = o.entityTypes.filter((e) => !ENTITY_TYPES.includes(e));
  if (unknown.length) throw new Error(`${o.id}: unknown entity types ${unknown.join(', ')}`);
  const keyDates = (o.keyDates || []).filter((k) => DATE_TYPES.has(k.dateType)).map((k) => ({ dateType: k.dateType, date: k.date, ...(k.note ? { note: k.note.slice(0, 300) } : {}) }));
  const main = keyDates.find((k) => k.dateType === 'commences') || keyDates.find((k) => k.dateType === 'applies');
  const org = orgID(o.authority);
  const record = {
    obligationID: o.id,
    title: o.title.slice(0, 120),
    statement: o.statement,
    obligationType: o.obligationType,
    source: { authority: o.authority, instrument: o.instrument, citation: o.citation, url: o.url, ...(org ? { externalOrgID: org } : {}) },
    jurisdiction: o.jurisdiction,
    sourceTier: o.sourceTier,
    entityTypes: [...new Set(o.entityTypes)],
    roles: [...new Set(o.roles)],
    useCaseIDs: [...new Set(o.useCases)],
    ...(main ? { effectiveDate: main.date } : {}),
    ...(keyDates.length ? { effectiveDates: keyDates } : {}),
    status: o.status,
    monitoringFrequency: 'daily',
    lastVerified: RESEARCHED,
  };
  const rationale = [
    o.confidenceNote ? `Research note: ${o.confidenceNote}` : null,
    (o.tierBasis || []).length ? `Rests on: ${o.tierBasis.join('; ')}` : null,
    `Research brief: ${research.brief}`,
  ].filter(Boolean).join(' ');
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'obligation', entityID: o.id, title: record.title },
    record, evidence: evidenceFor(o, RETRIEVED), rationale: rationale.slice(0, 4000),
  });
}

for (const org of research.externalOrganizations || []) {
  const id = orgID(org.acronym || org.name);
  if (!id) throw new Error(`No ID for organization ${org.acronym || org.name}`);
  const juris = org.jurisdiction === 'INTL' ? 'INT' : org.jurisdiction;
  const record = { externalOrgID: id, name: org.name, ...(org.acronym ? { acronym: org.acronym } : {}), type: org.type, jurisdiction: juris, jurisdictionCodes: [juris], website: org.website };
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'externalOrganization', entityID: id, title: org.name },
    record, evidence: [{ url: org.website, title: `${org.name} website`, sourceRank: org.type === 'standardsBody' ? 3 : 2, retrievedAt: RETRIEVED }],
  });
}

for (const [i, m] of (research.monitoringSources || []).entries()) {
  const org = orgID(m.regulator);
  const id = `DF-${(m.regulator || 'SRC').replace(/[^A-Za-z0-9]+/g, '').toUpperCase()}-${RESEARCHED.replace(/-/g, '')}-${String(i + 1).padStart(2, '0')}`;
  const basis = { 1: 'officialText', 2: 'regulatorPublication', 3: 'standardsBodyPublication' }[m.rank] || 'regulatorPublication';
  const record = {
    dataFlowID: id, title: `Watch: ${m.name}`.slice(0, 160), description: (m.note || `Daily check of ${m.name}`).slice(0, 500),
    sourceSystems: [{ endpointType: m.rank === 1 ? 'register' : 'webPage', title: m.name, url: m.url }],
    targetSystems: [{ endpointType: 'software', title: 'Atlas update agent (via the Reasoning Fabric connector)' }],
    frequency: 'daily', schemaReference: { format: 'html' },
    sourcePrecedence: { rank: m.rank, basis, canSetStatusOrDate: m.rank <= 3 },
    ...(org ? { externalOrgID: org } : {}),
    jurisdiction: m.jurisdiction === 'INTL' ? 'INT' : m.jurisdiction,
    governance: { ownerTitle: 'Triodian method owner', humanApprovalRequired: true },
    status: 'planned',
  };
  proposals.push({
    changeProposalID: cp(), changeType: 'create', target: { domainType: 'dataFlow', entityID: id, title: record.title },
    record, evidence: [{ url: m.url, title: m.name, sourceRank: m.rank, retrievedAt: RETRIEVED }],
  });
}

const submission = {
  submissionID: `SUB-ATLAS-${RESEARCHED}-${name.replace(/^\d{4}-\d{2}-\d{2}-/, '').toUpperCase()}`,
  interfaceVersion: '1.0.0',
  metamodelVersion: METAMODEL_VERSION,
  mode: 'propose',
  dataset: 'ai-obligations-atlas',
  submittedAt: RETRIEVED,
  submitter: { actorType: 'agent', actorID: 'atlas-update-agent', displayName: `Atlas update agent (research of ${RESEARCHED})` },
  proposals,
};
// Notes for the reviewer on records already held: kept beside the submission, which the interface does not extend.
const notes = (research.updates || []).map((u) => ({ obligationID: u.obligationID, kind: u.kind, note: u.note, verifiedFrom: u.verifiedFrom }));
const out = path.join(ROOT, `data/seed/submission-${name}.json`);
fs.writeFileSync(out, JSON.stringify(submission, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, `data/seed/reviewer-notes-${name}.json`), JSON.stringify(notes, null, 2) + '\n');
const count = (t) => proposals.filter((p) => p.target.domainType === t).length;
console.log(`${proposals.length} proposals -> ${path.relative(ROOT, out)}: ${count('obligation')} obligations, ${count('externalOrganization')} external organizations, ${count('dataFlow')} data flows; ${notes.length} reviewer notes`);
