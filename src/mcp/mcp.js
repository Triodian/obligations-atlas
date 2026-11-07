/**
 * MCP server for the Atlas: stateless Streamable HTTP (JSON responses), JSON-RPC 2.0.
 * Tools: find_obligations, get_obligation, list_changes, explain_provenance.
 */
import { STANDING_RULE } from '../core/atlas.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const RELAY = `Coverage: the Atlas holds records for Australia, Singapore and international standards. When a response carries a coverage note for a jurisdiction, tell the user that the Atlas does not yet cover it; never read an empty result as meaning no obligations apply. Records with appliesToAnyAIUse apply to any AI use rather than to particular use cases. Responses are records, not legal conclusions. When you quote a record, cite its source link, tier and last-verified date (the citeAs field does this). Describe tiers as describing sources: never tell the user that they or a client are compliant, in breach, or required to do something; say what the source says and that counsel decides what applies. For Anticipated records give the status or key date, never a likelihood that the source will pass or apply. ${STANDING_RULE}`;

export const TOOLS = [
  {
    name: 'find_obligations',
    title: 'Find AI governance obligations',
    description: `Search the AI Obligations Atlas for AI governance obligations by jurisdiction, source tier, standardised AI use case (UC1-UC10), entity type or text. Returns sourced records with tier, status, key dates, source link and provenance reference. ${RELAY}`,
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: { type: 'array', items: { type: 'string', enum: ['AU', 'SG', 'EU', 'GB', 'NZ', 'US', 'INT'] }, description: 'Jurisdiction codes. Covered now: AU, SG and INT (international standards, included unless includeInternational is false). EU, GB, NZ and US are not yet covered; asking for them returns a coverage note, not an answer that nothing applies.' },
        tier: { type: 'array', items: { type: 'string', enum: ['binding', 'expected', 'anticipated'] }, description: 'Source tiers' },
        useCase: { type: 'array', items: { type: 'string', pattern: '^UC([1-9]|10)$' }, description: 'Standardised use cases, e.g. UC3 (automated triage or decline), UC7 (AI inside a provider). Records specific to these come first, then records that apply to any AI use.' },
        includeAnyUse: { type: 'boolean', default: true, description: 'false to leave out records that apply to any AI use when filtering by use case' },
        entityType: { type: 'array', items: { type: 'string' }, description: 'Entity types, e.g. authorisedDepositTakingInstitution, generalInsurer, superannuationTrustee, bank, insurer, listedEntity, or for organisations outside financial regulation privateCompany, notForProfit, criticalInfrastructureAssetOwner, defenceIndustrySupplier, healthServiceProvider. Records addressed to anyOrganization match every type.' },
        q: { type: 'string', description: 'Text to match in title, statement, instrument or citation' },
        current: { type: 'boolean', description: 'Exclude superseded, repealed and withdrawn records' },
        includeInternational: { type: 'boolean', default: true },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_obligation',
    title: 'Get one obligation',
    description: `Get one Atlas obligation record by its ID (e.g. OBL-AU-CPS230-47), with tier basis, key dates, source link, last-verified date and provenance reference. ${RELAY}`,
    inputSchema: { type: 'object', properties: { obligationID: { type: 'string' } }, required: ['obligationID'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_changes',
    title: 'List changes since a date',
    description: `List new and amended instruments, commencements, withdrawals and record updates in the Atlas since a date (YYYY-MM-DD), newest first. Leads from commentary are marked as leads, not verified changes. ${RELAY}`,
    inputSchema: { type: 'object', properties: { since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}' }, jurisdiction: { type: 'string' } }, required: ['since'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'explain_provenance',
    title: 'Explain a record’s provenance',
    description: 'Explain where an Atlas record came from: the sources read, validation, matching, conflicts resolved, confidence, treatment under the published autonomy rules, and the named approver. Accepts an obligation ID, governed record ID (ID@version) or provenance record ID. Each ledger entry is hash-checked.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const text = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj });

async function callTool(atlas, name, args = {}) {
  if (name === 'find_obligations') {
    const all = atlas.findObligations(args);
    const limit = Math.min(Number(args.limit) || 25, 100);
    const coverage = atlas.coverage(args.jurisdiction);
    return text({ total: all.length, returned: Math.min(all.length, limit), obligations: all.slice(0, limit), ...(coverage.length ? { coverage } : {}), notice: STANDING_RULE });
  }
  if (name === 'get_obligation') {
    const o = atlas.getObligation(args.obligationID);
    if (!o) return { isError: true, content: [{ type: 'text', text: `No obligation ${args.obligationID}. Use find_obligations to search.` }] };
    return text({ obligation: o, notice: STANDING_RULE });
  }
  if (name === 'list_changes') {
    let items = atlas.changes(args.since);
    if (args.jurisdiction) items = items.filter((i) => !i.jurisdiction || i.jurisdiction === args.jurisdiction.toUpperCase());
    const coverage = atlas.coverage(args.jurisdiction);
    return text({ since: args.since, changes: items, ...(coverage.length ? { coverage } : {}) });
  }
  if (name === 'explain_provenance') {
    const p = await atlas.provenance(args.ref);
    if (!p) return { isError: true, content: [{ type: 'text', text: `No record or provenance entry ${args.ref}.` }] };
    return text(p);
  }
  return null;
}

/** Handle one JSON-RPC message; returns the response object, or null for notifications. */
export async function handleRpc(atlas, msg, serverInfo) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params && msg.params.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions: `The AI Obligations Atlas sets out AI governance obligations by jurisdiction, mapped to standardised AI use cases and tagged by source tier (Binding, Expected, Anticipated). ${RELAY}`,
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      const result = await callTool(atlas, name, args || {});
      if (!result) return fail(-32602, `Unknown tool ${name}`);
      return reply(result);
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`);
  }
}
