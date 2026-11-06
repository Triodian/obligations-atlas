#!/usr/bin/env node
// Vendor the parts of the Triodian Metamodel the Atlas uses (schemas, reference data,
// the dataset policy), pinned by commit in vendor/triodian-metamodel/VENDORED.json.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const src = path.resolve(process.argv[2] || '../triodian_metamodel');
const dest = path.resolve('vendor/triodian-metamodel');
if (!fs.existsSync(path.join(src, 'schemas/common.schema.json'))) throw new Error(`Not a Triodian_Metamodel checkout: ${src}`);
fs.rmSync(dest, { recursive: true, force: true });
for (const rel of ['schemas', 'reference-data', 'VERSION', 'LICENSE']) {
  fs.cpSync(path.join(src, rel), path.join(dest, rel), { recursive: true });
}
let commit = 'unknown';
try { commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim(); } catch {}
const metamodelVersion = fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim();
fs.writeFileSync(path.join(dest, 'VENDORED.json'), JSON.stringify({ source: 'https://github.com/Triodian/Triodian_Metamodel', commit, metamodelVersion, syncedAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`Vendored Triodian Metamodel ${metamodelVersion} (${commit.slice(0, 7)})`);
