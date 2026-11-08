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
([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)). The name `io.github.Triodian/...`
is verified by signing in with GitHub as a member of the Triodian organisation.

1. Install the publisher: see the registry's publishing guide for the current install command.
2. From the repository root: `mcp-publisher login github`, then `mcp-publisher publish`.
3. When the version in `server.json` changes, publish again.

Check `description` stays within 100 characters, and that the `$schema` date matches the registry's current schema
before publishing; the registry refuses a file that does not validate.

## Other directories

Several community directories list remote MCP servers. Each has its own submission form or pull request. For each,
use the same name, description and URL as `server.json`, say that no key is needed, and link to
`https://obligations-atlas.triodian.com/#/developers` for the tools and limits.
