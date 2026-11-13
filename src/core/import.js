// Importing a client's own registers (development plan task R.1). Three CSV files, each with a header row:
//   1. AI arrangements and providers: the client's provider register, or a GRC export of it. AI Use Assessment loads it
//      into its register, and AI Board Direction into its B1 inventory, keeping the client's ids so a re-export
//      round-trips.
//   2. AI limits: a limits register, which is a Triodian input and not part of any ISO/IEC 42001 document. The client
//      lists its own AI limits by function, each an authority ceiling (A1 to A6) or a consequence level (C1 to C5), and
//      check K11 tests each against the board's direction and the calibration set.
//   3. Statement of Applicability: the document ISO/IEC 42001:2023 clause 6.1.3 asks for. It lists the Annex A
//      controls, whether each applies, the justification, and how far it is implemented. It holds no limits. The
//      evidence index sets each control against the suite's outputs (public/shared/evidence.js; plan task ISO.5).
// Plain functions, no page code: the same file is in all three apps, and the tests run it in Node.
// Each reader returns { rows, refused, error }: refused rows carry their line number and the reason, and are not loaded.

const MAX_ROWS = 1000, MAX_CELL = 2000;

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, a byte-order mark. Returns rows of strings. */
export function parseCsv(text) {
  const s = String(text == null ? '' : text).replace(/^﻿/, ''), rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r' || c === '\n') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const key = h => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const csvCell = v => { const t = String(v == null ? '' : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
/** CSV text from a header and rows. */
export function toCsv(header, rows) { return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

/** Reads a CSV whose header row names `required[0]`, so a privilege marking or title above it is skipped.
 *  columns: { name: [aliases] }. Each row becomes { _line, name: value } with the cells trimmed. */
function table(text, columns, required) {
  const all = parseCsv(text);
  const aliasOf = {}; Object.entries(columns).forEach(([k, al]) => [k, ...al].forEach(a => { aliasOf[key(a)] = k; }));
  const at = all.findIndex(r => r.some(h => aliasOf[key(h)] === required[0]));
  if (at < 0) return { error: `No header row naming ${required[0]} was found. The first row of the table names the columns: ${Object.keys(columns).join(', ')}.` };
  const head = all[at].map(h => aliasOf[key(h)] || null), missing = required.filter(r => !head.includes(r));
  if (missing.length) return { error: `The header row has no ${missing.join(' or ')} column.` };
  const body = all.slice(at + 1);
  if (body.length > MAX_ROWS) return { error: `The file has ${body.length} rows; at most ${MAX_ROWS} load at once.` };
  return { rows: body.map((r, i) => { const o = { _line: at + i + 2 }; head.forEach((k, j) => { if (k) o[k] = String(r[j] == null ? '' : r[j]).trim().slice(0, MAX_CELL); }); return o; }) };
}
const pick = (v, allowed, what) => { if (!v) return ['', '']; const x = allowed.find(a => a.toLowerCase() === v.toLowerCase()); return x ? [x, ''] : ['', `${what} "${v.slice(0, 40)}" is not one of ${allowed.join(', ')}`]; };
const code = (v, re, what) => { if (!v) return ['', '']; const m = re.exec(v.trim()); return m ? [m[1].toUpperCase(), ''] : ['', `${what} "${v.slice(0, 40)}" is not valid`]; };
const ID = /^[A-Za-z0-9][A-Za-z0-9 _.:\/-]{0,63}$/;

/* ---------- 1. AI arrangements and providers ---------- */
export const ARRANGEMENT_COLUMNS = {
  provider_register_id: ['provider id', 'register id', 'supplier id', 'vendor id'],
  system_id: ['ai system id', 'use id', 'asset id'],
  provider: ['supplier', 'vendor', 'provider name'],
  system: ['ai system', 'system name', 'use', 'tool'],
  arrangement: ['arrangement name', 'contract', 'service'],
  function: ['business function', 'area', 'business area'],
  critical_operation: ['critical operation', 'critical business service'],
  boundary: ['boundary type'],
  where: ['where the ai acts', 'location type'],
  platform: ['model provider', 'platform and model provider'],
  location: ['locations', 'country', 'offshoring'],
  what_it_does: ['description', 'purpose'],
  human_involvement: ['human involvement', 'oversight'],
  credentials: ['systems it can change'],
  on_inventory: ['on inventory', 'on the inventory'],
  users: ['who uses it', 'used by'],
  authority: ['authority tier', 'tier'],
  consequence: ['failure consequence'],
  information: ['information class', 'data class'],
  tool_kind: ['tool kind'],
  decisions_about_individuals: ['automated decisions', 'adm'],
  owner: ['business owner', 'accountable owner'],
};
/** The arrangements file: one row per AI system or use, keyed on the client's provider register id. */
export function readArrangements(text) {
  const t = table(text, ARRANGEMENT_COLUMNS, ['provider_register_id', 'provider', 'system']); if (t.error) return { error: t.error, rows: [], refused: [] };
  const rows = [], refused = [], seen = new Set();
  for (const r of t.rows) {
    const why = [];
    if (!r.provider_register_id) why.push('no provider register id'); else if (!ID.test(r.provider_register_id)) why.push(`provider register id "${r.provider_register_id.slice(0, 40)}" has characters other than letters, digits and . _ : / -`);
    if (r.system_id && !ID.test(r.system_id)) why.push(`system id "${r.system_id.slice(0, 40)}" is not a valid id`);
    if (!r.provider) why.push('no provider'); if (!r.system) why.push('no AI system or use');
    const [boundary, e1] = pick(r.boundary, ['B1', 'B2', 'B3'], 'Boundary'), [where, e2] = pick(r.where, ['own', 'provider', 'platform'], 'Where the AI acts');
    const [human, e3] = pick(r.human_involvement, ['acts', 'decides', 'decision', 'unattended'], 'Human involvement'), [onInv, e4] = pick(r.on_inventory, ['yes', 'no', 'partly'], 'On the inventory');
    const [authority, e5] = code(r.authority, /^(A[1-6])\b/i, 'Authority'), [consequence, e6] = code(r.consequence, /^(C[1-5])\b/i, 'Consequence');
    const [information, e7] = code(r.information, /^(G[1-6])\b/i, 'Information class'), [kind, e8] = code(r.tool_kind, /^(K[1-7])\b/i, 'Tool kind');
    const [adm, e9] = pick(r.decisions_about_individuals, ['yes', 'no'], 'Decisions about individuals');
    why.push(...[e1, e2, e3, e4, e5, e6, e7, e8, e9].filter(Boolean));
    const k = r.system_id || r.provider_register_id + '|' + r.system;
    if (!why.length && seen.has(k)) why.push(r.system_id ? `system id ${r.system_id} appears twice` : 'the same provider and system appear twice');
    if (why.length) { refused.push({ line: r._line, reason: why.join('; ') }); continue; }
    seen.add(k);
    rows.push({ line: r._line, providerId: r.provider_register_id, systemId: r.system_id || '', provider: r.provider, system: r.system, arrangement: r.arrangement || r.provider,
      function: r.function || '', criticalOperation: r.critical_operation || '', boundary, where, platform: r.platform || '', location: r.location || '', whatItDoes: r.what_it_does || '',
      human, credentials: r.credentials || '', onInventory: onInv, users: r.users || '', authority, consequence, information, kind, adm: adm === 'yes', owner: r.owner || '' });
  }
  return { rows, refused };
}
const ARR_HEAD = ['provider_register_id', 'system_id', 'provider', 'system', 'arrangement', 'function', 'critical_operation', 'boundary', 'where', 'platform', 'location', 'what_it_does', 'human_involvement', 'credentials', 'on_inventory', 'users', 'authority', 'consequence', 'information', 'tool_kind', 'decisions_about_individuals', 'owner'];
/** The arrangements file again, from rows in the shape readArrangements gives: the client's ids go back out unchanged. */
export function writeArrangements(rows) {
  return toCsv(ARR_HEAD, rows.map(r => [r.providerId, r.systemId, r.provider, r.system, r.arrangement, r.function, r.criticalOperation, r.boundary, r.where, r.platform, r.location, r.whatItDoes, r.human, r.credentials, r.onInventory, r.users, r.authority, r.consequence, r.information, r.kind, r.adm === true ? 'yes' : r.adm === false ? 'no' : '', r.owner]));
}

/* ---------- 2. AI limits (the limits register, a Triodian input) ---------- */
export const LIMIT_COLUMNS = {
  limit_id: ['limit', 'id', 'limit ref'],
  function: ['business function', 'area'],
  location: ['where', 'applies to'],
  authority: ['authority ceiling', 'ceiling', 'tier'],
  consequence: ['consequence level'],
  description: ['limit description', 'statement'],
  control: ['annex a control', 'iso control', 'soa control'],
  owner: ['limit owner'],
};
export function readLimits(text) {
  const t = table(text, LIMIT_COLUMNS, ['limit_id', 'function']); if (t.error) return { error: t.error, rows: [], refused: [] };
  const rows = [], refused = [], seen = new Set();
  for (const r of t.rows) {
    const why = [];
    if (!r.limit_id) why.push('no limit id'); else if (!ID.test(r.limit_id)) why.push(`limit id "${r.limit_id.slice(0, 40)}" is not a valid id`);
    if (!r.function) why.push('no function');
    const [location, e1] = pick(r.location, ['own', 'provider', 'platform'], 'Location'), [authority, e2] = code(r.authority, /^(A[1-6])\b/i, 'Authority ceiling'), [consequence, e3] = code(r.consequence, /^(C[1-5])\b/i, 'Consequence level');
    why.push(...[e1, e2, e3].filter(Boolean));
    if (!e2 && !e3 && !authority && !consequence) why.push('no authority ceiling (A1 to A6) or consequence level (C1 to C5)');
    if (r.control && !/^A\.\d{1,2}(\.\d{1,2}){0,2}$/.test(r.control)) why.push(`control "${r.control.slice(0, 20)}" is not an Annex A reference such as A.6.2`);
    if (!why.length && seen.has(r.limit_id)) why.push(`limit id ${r.limit_id} appears twice`);
    if (why.length) { refused.push({ line: r._line, reason: why.join('; ') }); continue; }
    seen.add(r.limit_id);
    rows.push({ line: r._line, id: r.limit_id, function: r.function, location, authority, consequence, description: r.description || '', control: r.control || '', owner: r.owner || '' });
  }
  return { rows, refused };
}

/* ---------- 3. Statement of Applicability ---------- */
export const SOA_COLUMNS = { control: ['annex a control', 'reference', 'id'], title: ['control title', 'name'], applicable: ['included', 'applies'], justification: ['reason', 'justification for inclusion or exclusion'], implemented: ['status', 'implementation'] };
export function readSoA(text) {
  const t = table(text, SOA_COLUMNS, ['control', 'applicable']); if (t.error) return { error: t.error, rows: [], refused: [] };
  const rows = [], refused = [], seen = new Set();
  for (const r of t.rows) {
    const why = [];
    if (!/^A\.\d{1,2}(\.\d{1,2}){0,2}$/.test(r.control || '')) why.push(`control "${String(r.control || '').slice(0, 20)}" is not an Annex A reference such as A.6.2`);
    const [applicable, e1] = pick(r.applicable, ['yes', 'no'], 'Applicable'), [implemented, e2] = pick(r.implemented, ['yes', 'no', 'partly'], 'Implemented');
    if (!r.applicable) why.push('no yes or no for applicable'); why.push(...[e1, e2].filter(Boolean));
    if (!why.length && seen.has(r.control)) why.push(`control ${r.control} appears twice`);
    if (why.length) { refused.push({ line: r._line, reason: why.join('; ') }); continue; }
    seen.add(r.control);
    rows.push({ line: r._line, control: r.control, title: r.title || '', applicable: applicable === 'yes', justification: r.justification || '', implemented });
  }
  return { rows, refused };
}

/** One line for a toast: how many loaded, how many refused and the first reason. */
export function summary(what, r) {
  if (r.error) return r.error;
  return `${r.rows.length} ${what} loaded` + (r.refused.length ? `; ${r.refused.length} row${r.refused.length === 1 ? '' : 's'} refused (line ${r.refused[0].line}: ${r.refused[0].reason}${r.refused.length > 1 ? '; see the list' : ''})` : '') + '.';
}
