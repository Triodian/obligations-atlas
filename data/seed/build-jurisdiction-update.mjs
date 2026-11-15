#!/usr/bin/env node
/**
 * Build a Reasoning Fabric submission that moves records to another jurisdiction code (first used for the US state
 * codes, 15 November 2026). For each change in the file, a record published in the snapshot gets an update proposal
 * against its current version, carrying the record as published with only the jurisdiction changed, and the record's
 * own source as evidence. A record the snapshot does not hold yet (still in the review queue, or not submitted) gets
 * no proposal: it is listed in the reviewer notes, to be set at review.
 *
 * usage: node data/seed/build-jurisdiction-update.mjs data/research/2026-11-15-us-state-codes.json [snapshot]
 *        -> data/seed/submission-2026-11-15-us-state-codes.json and data/seed/reviewer-notes-2026-11-15-us-state-codes.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const file = process.argv[2];
if (!file) { console.error('usage: node data/seed/build-jurisdiction-update.mjs <changes file> [snapshot]'); process.exit(1); }
const research = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.resolve(process.argv[3] || path.join(ROOT, 'data/snapshot/ai-obligations-atlas.json')), 'utf8'));
const name = path.basename(file, '.json');
const RESEARCHED = research.researched, RETRIEVED = `${RESEARCHED}T00:00:00Z`;
const METAMODEL_VERSION = fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/VERSION'), 'utf8').trim();
const CODE = /^([A-Z]{2}(-[A-Z0-9]{1,3})?|INT)$/;   // the Metamodel's jurisdictionCode

const held = new Map(snapshot.records.filter((r) => r.publicationStatus === 'published').map((r) => [r.entityID, r]));
const proposals = [], notes = [];
let n = 0;
// Proposal ids name the change file, so two files built the same day never share one. The first file
// (2026-11-15-us-state-codes, submitted with J001 to J007) is kept as submitted.
const TAG = name.replace(/^\d{4}-\d{2}-\d{2}-/, '').toUpperCase();
const cp = () => (name === '2026-11-15-us-state-codes' ? `CP-${RESEARCHED}-J${String(++n).padStart(3, '0')}` : `CP-${RESEARCHED}-${TAG}-J${String(++n).padStart(3, '0')}`);

for (const c of research.changes) {
  if (!CODE.test(c.jurisdiction)) throw new Error(`${c.entityID}: ${c.jurisdiction} is not a jurisdiction code`);
  const g = held.get(c.entityID);
  if (!g) { notes.push({ entityID: c.entityID, kind: 'jurisdiction', note: `Not published yet: set the jurisdiction to ${c.jurisdiction} at review. ${c.reason}` }); continue; }
  if (g.domainType !== c.domainType) throw new Error(`${c.entityID} is a ${g.domainType}, not a ${c.domainType}`);
  const was = g.record.jurisdiction;
  if (was === c.jurisdiction) { notes.push({ entityID: c.entityID, kind: 'jurisdiction', note: `Already ${c.jurisdiction}; nothing proposed.` }); continue; }
  const record = { ...structuredClone(g.record), jurisdiction: c.jurisdiction };
  if (Array.isArray(record.jurisdictionCodes)) record.jurisdictionCodes = record.jurisdictionCodes.map((j) => (j === was ? c.jurisdiction : j));
  const url = (record.source && record.source.url) || record.website;
  const evidence = [{ url, title: record.source ? `${record.source.instrument}` .slice(0, 200) : `${record.name} website`, sourceRank: record.source ? 1 : 2, retrievedAt: RETRIEVED }];
  proposals.push({
    changeProposalID: cp(), changeType: 'update', baseVersion: g.version,
    target: { domainType: g.domainType, entityID: c.entityID, title: (record.title || record.name).slice(0, 160) },
    record, evidence, rationale: `Jurisdiction ${was} to ${c.jurisdiction}. ${c.reason} ${research.brief}`.slice(0, 4000),
  });
}

const submission = {
  submissionID: `SUB-ATLAS-${RESEARCHED}-${name.replace(/^\d{4}-\d{2}-\d{2}-/, '').toUpperCase()}`,
  interfaceVersion: '1.0.0', metamodelVersion: METAMODEL_VERSION, mode: 'propose', dataset: 'ai-obligations-atlas', submittedAt: RETRIEVED,
  submitter: { actorType: 'agent', actorID: 'atlas-update-agent', displayName: `Atlas update agent (jurisdiction codes, ${RESEARCHED})` },
  proposals,
};
fs.writeFileSync(path.join(ROOT, `data/seed/submission-${name}.json`), JSON.stringify(submission, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, `data/seed/reviewer-notes-${name}.json`), JSON.stringify(notes, null, 2) + '\n');
console.log(`${proposals.length} update proposals -> data/seed/submission-${name}.json; ${notes.length} in the reviewer notes`);
