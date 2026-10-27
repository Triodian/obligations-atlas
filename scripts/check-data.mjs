#!/usr/bin/env node
// Check the bundled snapshots: every governed record conforms to the connector
// schema, every record to its Metamodel schema, every record passes the dataset
// language rules, and every provenance entry's hash matches its content.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { canonicalJSON } from '../src/core/atlas.js';
import crypto from 'node:crypto';

const root = path.resolve('vendor/triodian-metamodel/schemas');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.schema.json') ? [path.join(d, e.name)] : []));
for (const f of walk(root)) ajv.addSchema(JSON.parse(fs.readFileSync(f, 'utf8')));
const FILES = { obligation: 'semantic-library/obligation', externalOrganization: 'external-organization', useCase: 'use-case', trigger: 'trigger', dataFlow: 'extensions/dynamic-time-series/data-flow' };
const v = (rel) => ajv.getSchema(`https://triodian.com/schemas/${rel}.schema.json`);

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL ${m}`); };
for (const file of ['data/snapshot/ai-obligations-atlas.json', 'data/snapshot/ai-obligations-atlas.preview.json']) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rules = snap.policy.languageRules.filter((r) => r.appliesTo.includes('record')).map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }));
  for (const gr of snap.records) {
    const g = v('connector/governed-record');
    if (!g(gr)) fail(`${file} ${gr.governedRecordID}: ${ajv.errorsText(g.errors)}`);
    const rv = v(FILES[gr.domainType]);
    if (!rv) fail(`${gr.governedRecordID}: no schema for ${gr.domainType}`);
    else if (!rv(gr.record)) fail(`${file} ${gr.governedRecordID}: ${ajv.errorsText(rv.errors)}`);
    const text = JSON.stringify([gr.record.title, gr.record.statement, gr.record.label, gr.record.description]);
    for (const r of rules) if (r.re.test(text)) fail(`${gr.governedRecordID}: ${r.ruleID}`);
  }
  for (const e of snap.provenance) {
    const { hash, ...rest } = e;
    if (crypto.createHash('sha256').update(canonicalJSON(rest)).digest('hex') !== hash) fail(`${file} ${e.provenanceRecordID}: hash mismatch`);
  }
  console.log(`${file}: ${snap.records.length} records, ${snap.provenance.length} provenance entries checked`);
}
console.log(`${failures} failure(s)`);
process.exit(failures ? 1 : 0);
