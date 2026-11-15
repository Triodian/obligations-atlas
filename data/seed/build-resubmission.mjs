#!/usr/bin/env node
/**
 * Propose again records that the Fabric made leads (their evidence could not set their status), with better evidence.
 * Takes each record from the earlier submission as it was proposed, sets the jurisdiction where the file gives one,
 * replaces the evidence, and gives the proposal a new id. Refuses evidence that still cannot set the record's status
 * under the dataset policy (rank 1 for binding records; rank 2 for expected or anticipated ones).
 *
 * usage: node data/seed/build-resubmission.mjs data/research/2026-11-15-us-leads-official.json
 *        -> data/seed/submission-2026-11-15-us-leads-official.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const file = process.argv[2];
if (!file) { console.error('usage: node data/seed/build-resubmission.mjs <research file>'); process.exit(1); }
const research = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const earlier = JSON.parse(fs.readFileSync(path.join(ROOT, research.from), 'utf8'));
const name = path.basename(file, '.json'), TAG = name.replace(/^\d{4}-\d{2}-\d{2}-/, '').toUpperCase();
const RETRIEVED = `${research.researched}T00:00:00Z`;
const METAMODEL_VERSION = fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/VERSION'), 'utf8').trim();
// The dataset policy (reasoning_fabric policies/ai-obligations-atlas.policy.json): the worst rank that can set status.
const CAN_SET = { binding: 1, expected: 2, anticipated: 2, adopted: 3 };

let n = 0;
const proposals = research.records.map((c) => {
  const p = earlier.proposals.find((x) => x.target.entityID === c.entityID);
  if (!p) throw new Error(`${c.entityID} is not in ${research.from}`);
  const record = { ...structuredClone(p.record), ...(c.jurisdiction ? { jurisdiction: c.jurisdiction } : {}) };
  const best = Math.min(...c.evidence.map((e) => e.sourceRank)), tier = record.sourceTier;
  if (best > CAN_SET[tier]) throw new Error(`${c.entityID}: a ${tier} record needs evidence of rank ${CAN_SET[tier]} or better; best given is ${best}`);
  return {
    ...structuredClone(p), changeProposalID: `CP-${research.researched}-${TAG}-J${String(++n).padStart(3, '0')}`, record,
    evidence: c.evidence.map((e) => ({ ...e, retrievedAt: RETRIEVED })),
    rationale: `${p.rationale || ''} Proposed again with official evidence: the first proposal (${p.changeProposalID}) cited commentary only and became a lead.${c.jurisdiction ? ` Jurisdiction ${c.jurisdiction}, a state law.` : ''}`.trim().slice(0, 4000),
  };
});
const submission = {
  submissionID: `SUB-ATLAS-${research.researched}-${TAG}`, interfaceVersion: earlier.interfaceVersion, metamodelVersion: METAMODEL_VERSION,
  mode: 'propose', dataset: earlier.dataset, submittedAt: RETRIEVED,
  submitter: { ...earlier.submitter, displayName: `Atlas update agent (resubmission with official evidence, ${research.researched})` },
  proposals,
};
fs.writeFileSync(path.join(ROOT, `data/seed/submission-${name}.json`), JSON.stringify(submission, null, 2) + '\n');
console.log(`${proposals.length} proposals -> data/seed/submission-${name}.json`);
