#!/usr/bin/env node
/**
 * Close leads whose record is already published. The Reasoning Fabric closes a lead itself when the record that
 * replaces it is published (lead promotion, reasoning_fabric #13); a record published before that, or under a key the
 * lead does not hold, can leave its lead open. For each open lead in the snapshot whose affected record is published,
 * this proposes an update of the lead to status "promoted", with a line naming the record, as the Fabric writes it, and
 * the record's own official source as evidence.
 *
 * usage: node data/seed/build-close-leads.mjs <date YYYY-MM-DD> [snapshot]
 *        -> data/seed/submission-<date>-close-leads.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('usage: node data/seed/build-close-leads.mjs <YYYY-MM-DD> [snapshot]'); process.exit(1); }
const snapshot = JSON.parse(fs.readFileSync(path.resolve(process.argv[3] || path.join(ROOT, 'data/snapshot/ai-obligations-atlas.json')), 'utf8'));
const METAMODEL_VERSION = fs.readFileSync(path.join(ROOT, 'vendor/triodian-metamodel/VERSION'), 'utf8').trim();
const published = new Map(snapshot.records.filter((r) => r.publicationStatus === 'published' && r.domainType !== 'trigger').map((r) => [r.entityID, r]));

let n = 0;
const proposals = [];
for (const l of snapshot.records) {
  const r = l.record || {};
  if (l.domainType !== 'trigger' || r.status !== 'lead') continue;
  const rec = (r.affectedEntities || []).map((a) => published.get(a.entityID)).find(Boolean);
  if (!rec) continue;
  const url = rec.record.source && rec.record.source.url;
  if (!url) throw new Error(`${rec.entityID} has no source URL to cite`);
  proposals.push({
    changeProposalID: `CP-${date}-CLOSE-LEADS-J${String(++n).padStart(3, '0')}`, changeType: 'update', baseVersion: l.version,
    target: { domainType: 'trigger', entityID: l.entityID, title: (r.label || l.entityID).slice(0, 160) },
    record: { ...structuredClone(r), status: 'promoted', description: `${r.description || ''} Promoted on ${date}: the record ${rec.governedRecordID || `${rec.entityID}@${rec.version}`} replaces this lead.`.trim() },
    // The record's own source page, cited as a regulator's or legislature's publication (rank 2): enough to set a lead's status.
    evidence: [{ url, title: `${rec.record.source.instrument || rec.entityID}`.slice(0, 200), sourceRank: 2, retrievedAt: `${date}T00:00:00Z` }],
    rationale: `Close the lead: ${rec.entityID} is published (version ${rec.version}) and replaces it. The record was approved before lead promotion (reasoning_fabric #13) was running, or under another key, so the Fabric did not close the lead itself.`,
  });
}
const submission = {
  submissionID: `SUB-ATLAS-${date}-CLOSE-LEADS`, interfaceVersion: '1.0.0', metamodelVersion: METAMODEL_VERSION, mode: 'propose',
  dataset: 'ai-obligations-atlas', submittedAt: `${date}T00:00:00Z`,
  submitter: { actorType: 'agent', actorID: 'atlas-update-agent', displayName: `Atlas update agent (closing leads, ${date})` },
  proposals,
};
fs.writeFileSync(path.join(ROOT, `data/seed/submission-${date}-close-leads.json`), JSON.stringify(submission, null, 2) + '\n');
console.log(`${proposals.length} leads to close -> data/seed/submission-${date}-close-leads.json: ${proposals.map((p) => p.target.entityID).join(', ')}`);
