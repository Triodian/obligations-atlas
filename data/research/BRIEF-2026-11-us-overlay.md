# Research brief: United States, five main sectors

Development plan step 4b (US.3), from step J.3 of [Adding a jurisdiction](https://github.com/Triodian/Triodian_Metamodel/blob/main/docs/adding-a-jurisdiction.md). Brief for the research and update agent, 14 November 2026.

The Metamodel (2.9.0) lists the United States with five main sectors: banking, insurance, securities and investment advice, health care, and critical infrastructure. The Atlas holds no US obligations; its only US entries are NIST and its AI RMF. This round adds the instruments a matter brief for each main sector would list, and the state laws that reach all five. The scope note is the project document *United States - jurisdiction scope (US.1)*.

## What to research

| Sector | Source | What to record |
| --- | --- | --- |
| Banking | SR 26-2 (17 April 2026), which replaced SR 11-7 | Model risk management, vendor models, and which AI it covers |
| Banking | Interagency Guidance on Third-Party Relationships (June 2023) | Life cycle, board oversight, audit rights, subcontractors |
| Banking | Proposed Third-Party Risk Management Guidance (11 September 2026) | What it would replace, and its status |
| Banking, insurance | 23 NYCRR 500.11 (New York) | Third-party service provider security policy |
| Insurance | NAIC Model Bulletin on AI systems (December 2023) | Written programme, accountability, third-party terms |
| Insurance | NYDFS Insurance Circular Letter No. 7 (2024) | Board oversight, vendor contract terms, scope |
| Securities | Regulation S-P, 17 CFR 248.30 as amended | Incident response, service provider oversight, 72-hour notice |
| Securities | FINRA Rule 3110; FINRA 2026 oversight report | Supervision of AI use, including agents |
| Health care | 45 CFR 92.210 | Identifying and mitigating discrimination risk in decision support tools |
| Health care | HIPAA, 45 CFR 164.308(b) and 164.314 | Business associate terms for AI providers |
| Health care | HTI-5 final rule (28 October 2026) | What it removes from certified health IT, and what stays with providers |
| Critical infrastructure | NERC CIP-013-2 | Supply chain risk management plans for vendor products and services |
| Critical infrastructure | CIRCIA, 6 U.S.C. 681b | Reporting duties and when they take effect |
| All five | California CCPA regulations (ADMT, risk assessments) | Triggers and dates |
| All five | Texas TRAIGA | Prohibited uses, disclosure, enforcement, the framework defence |
| All five | Colorado SB 26-189 | The replacement of the 2024 Act and its dates |

## Method

As in the earlier briefs: official text first; quote, then summarise; cite precisely; tier by the source; address each record to the entity types of the US sectors (`bank`, `insurer`, `capitalMarketsIntermediary`, `healthServiceProvider`, `criticalInfrastructureAssetOwner`, and `anyOrganization` for laws of general application); map to use cases UC1 to UC10; dates from the instrument; record what could not be settled in `openQuestions`. State law is recorded under `US`, with the state in the title. In Triodian's own words, say what a provision "provides", "calls for" or "addresses"; quoting the operative words is fine.

## Output

`data/research/2026-11-14-us-overlay.json`. Then `node data/seed/build-submission.mjs data/research/2026-11-14-us-overlay.json`, and the update agent submits the result to the Fabric with its token. Every proposal goes to the review queue; nothing is published until a named reviewer approves it.

## Out of scope

Payments and money transmission (state licensing; the sector uses its baseline profile); listed companies (the general path); the FDA's device guidance; TSA security directives; agency AI use by federal government; opinions on what any provision means for a particular organisation.
