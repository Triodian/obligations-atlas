/** OpenAPI description of the Atlas REST API. */
export function openapi(version) {
  const list = (desc) => ({ name: desc[0], in: 'query', schema: { type: 'string' }, description: desc[1] });
  return {
    openapi: '3.0.3',
    info: {
      title: 'AI Obligations Atlas API',
      version,
      description: 'AI governance obligations by jurisdiction, mapped to standardised AI use cases and tagged by source tier. Every record carries its source link, tier, last-verified date and a provenance reference. Records state what sources say and how they are classified; they are not legal advice and do not say what the law requires of any particular client.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Registered firm account key' } },
    },
    security: [{ apiKey: [] }, {}],
    paths: {
      '/api/v1/obligations': {
        get: {
          summary: 'Find obligations',
          parameters: [
            list(['jurisdiction', 'Comma-separated codes: AU, SG, EU, GB, NZ, US, INT']),
            list(['tier', 'binding, expected, anticipated']),
            list(['useCase', 'UC1 to UC10. Records specific to these use cases come first; records that apply to any AI use (appliesToAnyAIUse) follow']),
            list(['includeAnyUse', 'false to leave out records that apply to any AI use when filtering by use case']),
            list(['domain', 'regulated domain, e.g. AU-BANKING or SG-INSURANCE; sets the jurisdiction and its entity types']),
            list(['entityType', 'e.g. authorisedDepositTakingInstitution, generalInsurer, bank, privateCompany, notForProfit; records addressed to anyOrganization match every type']),
            list(['role', 'e.g. board, deployer, serviceProvider']),
            list(['status', 'proposed, pending, inForce, amended, superseded, repealed, withdrawn']),
            list(['q', 'Text search']),
            list(['current', 'true to exclude superseded, repealed and withdrawn']),
            list(['includeInternational', 'false to exclude INT standards']),
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { 200: { description: 'Obligations. When a requested jurisdiction is not yet covered, coverage explains that no records does not mean no obligations' } },
        },
      },
      '/api/v1/obligations/{id}': { get: { summary: 'One obligation', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Obligation' }, 404: { description: 'Not found' } } } },
      '/api/v1/instruments': { get: { summary: 'Instruments, with their obligations and tiers', responses: { 200: { description: 'Instruments' } } } },
      '/api/v1/changes': { get: { summary: 'Changes since a date. Commencements are dated by when they take effect; items after today are marked upcoming', parameters: [{ name: 'since', in: 'query', schema: { type: 'string', format: 'date' } }, list(['jurisdiction', 'One jurisdiction code'])], responses: { 200: { description: 'Changes, newest first' } } } },
      '/api/v1/provenance/{ref}': { get: { summary: 'Provenance for a record or ledger entry, hash-checked', parameters: [{ name: 'ref', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Provenance' } } } },
      '/api/v1/use-cases': { get: { summary: 'Standardised use cases UC1 to UC10', responses: { 200: { description: 'Use cases' } } } },
      '/api/v1/jurisdictions': { get: { summary: 'Jurisdictions and coverage', responses: { 200: { description: 'Jurisdictions' } } } },
      '/api/v1/organizations': { get: { summary: 'Regulators and standards bodies', responses: { 200: { description: 'Organizations' } } } },
      '/api/v1/dataset': { get: { summary: 'Whole dataset in compact form (used by the web app to filter and build matter briefs in the browser)', responses: { 200: { description: 'Dataset' } } } },
      '/api/v1/policy': { get: { summary: 'The published dataset policy (precedence, autonomy, freshness, language rules)', responses: { 200: { description: 'Policy' } } } },
      '/mcp': { post: { summary: 'MCP server (Streamable HTTP): find_obligations, get_obligation, list_changes, explain_provenance', responses: { 200: { description: 'JSON-RPC response' } } } },
    },
  };
}
