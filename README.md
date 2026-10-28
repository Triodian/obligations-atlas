# AI Obligations Atlas

The Atlas sets out AI governance obligations by jurisdiction, maps them to standardised AI use cases (UC1 to UC10), and tags each by the tier of its source:
- **Binding**: law or prudential standard in force;
- **Expected**: regulator expectation, guidance or recognised standard;
- **Anticipated**: made but not yet in force, under consultation, or a pending bill.

It is built for AI, technology and regulatory lawyers in external counsel firms. It serves the same records three ways: a web app, a REST API and an MCP server.

> Records state what sources say and how they are classified. They are not legal advice and do not say what the law requires of any particular client; counsel decides what applies.

## How it fits together

```mermaid
flowchart LR
  R["Research and update agent"] -- "change proposals<br/>(governance interface 1.0)" --> F["Reasoning Fabric<br/>(closed)"]
  V["Named reviewer<br/>(reasoning-fabric-app /admin/connector)"] -- "review decisions" --> F
  F -- "snapshot: governed records<br/>+ provenance" --> A["Atlas<br/>web app, REST API, MCP"]
  M["Triodian Metamodel<br/>(open schemas, policy)"] -.-> F
  M -.-> A
```

- **Data model:** the open [Triodian Metamodel](https://github.com/Triodian/Triodian_Metamodel), vendored and pinned in `vendor/triodian-metamodel` (`npm run sync-metamodel`). Records are Obligations, External Organizations, Use Cases, Data Flows (monitored sources) and Triggers (instrument changes).
- **Governance:** every record goes through the Reasoning Fabric connector under the AI Obligations Atlas dataset policy (kept in reasoning_fabric `policies/`, and served in every snapshot and at `/api/v1/policy`). Nothing that sets a status, a date or a tier is published without a named approver. Every record carries a hash-chained provenance trail.
- **Data in this repo:**
  - `data/research/` holds the research behind the seed.
  - `data/seed/build-seed.mjs` turns it into connector proposals.
  - `data/snapshot/` holds what the Fabric returns. `ai-obligations-atlas.json` has the published records only. `ai-obligations-atlas.preview.json` adds records still waiting for review, marked `pendingReview`.

## Run it

```bash
npm ci
npm run dev                     # http://localhost:8787, published records only
ATLAS_PREVIEW=true npm run dev  # include records waiting for review, with a preview banner
npm test                        # API, MCP, matter brief, language rules, provenance, keys, rate limits
npm run data:check              # every snapshot record against its schema, language rules and hashes
```

## Deploy (Cloudflare Workers)

Workers Builds deploys `main`. `wrangler.jsonc` serves `public/` as static assets, and runs `/api/*`, `/mcp` and `/healthz` in `src/handler.js`. One Worker serves both domains:

| Domain | Shows |
| --- | --- |
| `obligations-atlas.triodian.com` | Published records only. With the `FABRIC_READ_TOKEN` secret set, they are read live from the Reasoning Fabric (`FABRIC_URL`) and cached for `ATLAS_CACHE_SECONDS`. Without it, or if the Fabric cannot be reached, the bundled `data/snapshot/ai-obligations-atlas.json` is used |
| `obligations-atlas-test.triodian.com` (`ATLAS_PREVIEW_HOSTS`) | The bundled preview snapshot, including records waiting for review, under a preview banner |

Attach both domains under Settings → Domains & Routes → Custom domain. Set the secrets under Settings → Variables and Secrets:
- `FABRIC_READ_TOKEN`: the read-only `obligations-atlas` governance token;
- `ATLAS_API_KEYS`: optional, `[{"firm":"…","keySha256":"…","perMinute":600}]`.

`/healthz` reports which data a domain is serving (`fabric`, `bundled` or `bundled-preview`), and the last error reading from the Fabric, if any.

## Refresh the data

The reviewer approves in the review console, or locally with `node scripts/connector.js review --reviewer "<name>"` in reasoning_fabric. Then export a new snapshot:

```bash
# in reasoning_fabric
node scripts/connector.js snapshot ai-obligations-atlas ../obligations-atlas/data/snapshot/ai-obligations-atlas.json --url "$FABRIC" --token "$READ_TOKEN"
```

## Interfaces

| Channel | Calls |
| --- | --- |
| Web app | Register (query by tier, jurisdiction, entity, use case), record pages with provenance, use cases, changes, matter brief, API and MCP page |
| REST API | `/api/v1/obligations`, `/obligations/{id}`, `/instruments`, `/changes?since=`, `/provenance/{ref}`, `/use-cases`, `/jurisdictions`, `/organizations`, `/policy`, `/openapi.json` |
| MCP (Streamable HTTP at `/mcp`) | `find_obligations`, `get_obligation`, `list_changes`, `explain_provenance` |

**Privacy.**
- The web app downloads the whole public dataset once and filters it in the browser. The matter brief is built and kept there too, in the format in `schemas/matter-brief.schema.json`. No client facts reach the server unless the lawyer chooses to share a brief's scope with Triodian (see below). The matter label is never sent.
- `public/_headers` sets a Content-Security-Policy, so the page runs only its own scripts and connects only to its own API. An analytics beacon injected by Cloudflare can't load. Turn off Web Analytics for the Atlas hostnames in Cloudflare as well.

**Firm registration and Bring in Triodian.**
- A lawyer registers their firm from a matter brief or the **Your firm** page. The registration goes to the Reasoning Fabric's firm registry (`/firms/v1`), and a named reviewer approves it in the review console (`/admin/firms`).
- After approval, the browser collects the firm's API key once. From any matter brief, the lawyer can then bring in Triodian, with a note and, if they tick the box, the brief's scope.
- Keys issued this way are read from the Fabric with the snapshot and accepted by the REST API and MCP server.
- The Worker uses `FABRIC_READ_TOKEN`, which needs the `firms.submit` scope. `/healthz` reports how many firm keys are loaded.

**Use cases and "any AI use".** A record mapped to every standardised use case (UC1–UC10) applies to any AI use, such as board accountability or risk management, rather than to particular uses. When a lawyer filters by use case, records specific to it come first and records that apply to any AI use follow. They appear in a folded group in the register and a separate list in the brief. The API marks them `appliesToAnyAIUse`; `includeAnyUse=false` leaves them out.

**Coverage.** The Atlas covers Australia, Singapore and international standards. Asking the API or MCP server about another jurisdiction (EU, GB, NZ, US) returns a `coverage` note saying it isn't covered yet, so an empty result isn't read as "no obligations".

**Language rules.** Every API and MCP response is checked against the dataset's language rules before it leaves. A response that fails the check is withheld.
