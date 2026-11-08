# Listing the MCP server

The AI Obligations Atlas MCP server is at `https://obligations-atlas.triodian.com/mcp` (Streamable HTTP, stateless).
Anyone can connect without a key: the keyless tier (below) is the free entry point. This page is the checklist for
listing it in public MCP directories (development plan task 2.9).

## The keyless tier

- No key, no sign-up. The REST API and the MCP server serve the published records: Australia, Singapore and the
  international standards that apply with them.
- Each caller (by IP address) may make `ATLAS_KEYLESS_PER_MINUTE` requests a minute (60 by default, set in
  `wrangler.jsonc`), counted separately for the REST API and the MCP server. Over the limit, the REST API answers
  `429` with `retry-after`, and the MCP server answers JSON-RPC error `-32002` with `retryAfter` and a note on how to
  get a higher limit.
- The limit is counted in each Worker instance, so it is a fair-use limit rather than an exact quota.
- A registered firm sends its own key in `x-api-key` and gets its own, higher limit, and can bring in Triodian from a
  matter brief. Provenance, the source tiers and the matter brief are the same for everyone: what registering adds is
  the higher limit and the relationship.

## The official MCP Registry

`server.json` in the repository root describes the server for the official registry
([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)) as `io.github.Triodian/obligations-atlas`.

Publish it from **Actions → Publish to MCP Registry → Run workflow**. The workflow signs in with GitHub OIDC, so the
registry trusts it because it runs in this repository, owned by the Triodian organisation; no token or secret is
needed. The interactive `mcp-publisher login github` cannot publish under an organisation's name: it cannot read
organisation roles, and the registry answers 403.

When `server.json` changes, raise its `version` and run the workflow again. Keep `description` within 100
characters (the workflow checks it); if the registry refuses the file, check its `$schema` date against the
registry's current schema.

## Other directories

Several community directories list remote MCP servers. Each has its own submission form or pull request. For each,
use the same name, description and URL as `server.json`, say that no key is needed, and link to
`https://obligations-atlas.triodian.com/#/developers` for the tools and limits.
