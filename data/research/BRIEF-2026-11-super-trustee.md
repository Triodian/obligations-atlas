# Research brief: super trustee sources, for an ART engagement

Development plan task 2.3b. Brief for the research and update agent, 9 November 2026.

The Atlas holds 20 published records that reach a superannuation trustee: APRA's letter on AI (nine), CPS 230 (five),
CPS 234 (three), FAR (two) and ASIC's cyber letter (one). They are all cross-sector. None comes from the law that
is particular to super trustees, which is where an AI use in member services, claims, advice or administration first
meets the trustee's duties. This round adds those sources, so a matter brief for a super trustee lists them.

## What to research

| Area | Source | What to record |
| --- | --- | --- |
| Covenants | Superannuation Industry (Supervision) Act 1993 s 52(2) (care, skill and diligence; best financial interests) | The covenants as they reach decisions made or informed by AI |
| Insurance | SIS Act s 52(7) (insurance strategy; cost to beneficiaries; pursuing claims) | The duty to pursue a claim, as it reaches AI in claims triage and assessment |
| Retirement income | SIS Act s 52(8A) and s 52AA (retirement income strategy; gathering information) | The strategy and the information it rests on, as AI is used to understand members |
| Member outcomes | SPS 515 (commencing 1 July 2025) and SIS Act s 52(9) | Strategic objectives, business plan, performance metrics and triggers, the annual review and outcomes assessment |
| Risk management | SPS 220 | The framework, the Board's responsibility, operational and insurance risk, outsourced functions, appetite and review |
| Design and distribution | Corporations Act Part 7.8A (ss 994B, 994C, 994E, 994F) | Target market determinations for choice products, review triggers, distribution conditions and reasonable steps, as they reach digital and AI-driven distribution. Note the MySuper exclusion |
| Complaints | SIS Act s 101; ASIC RG 271; ASIC REP 844 (2 November 2026) | The IDR obligation, the systemic issue paragraphs, and what ASIC expects where AI is used for member services |
| Claims handling | ASIC REP 831 (June 2026), following REP 806 | ASIC's expectations of trustees on death benefit claims, data, board reporting and oversight of insurers and administrators |

Also confirm the 20 records already tagged for super trustees are in the published snapshot, and record it under
`updates`.

## Method

As in BRIEF-2026-11-general-and-2026.md: official text first; quote, then summarise; cite precisely; tier by the
source; address each record to the right entity types (`superannuationTrustee`, and the other issuers or licensees a
provision reaches); map to use cases UC1 to UC10; dates from the instrument; record what could not be settled in
`openQuestions`. Never say what a trustee "must" do in Triodian's own words: say what a provision "provides",
"calls for" or "addresses". Quoting the operative words is fine.

## Output

`data/research/2026-11-09-super-trustee.json`, in the same shape as the earlier rounds. Then
`node data/seed/build-submission.mjs data/research/2026-11-09-super-trustee.json`, and the update agent submits the
result to the Fabric with its token. Every proposal goes to the review queue; nothing is published until a named
reviewer approves it.

## Out of scope

SIS Regulations; the SPS standards other than 515 and 220 (SPS 530 investment governance, SPS 114 operational risk
financial requirement); APRA practice guides; the Retirement Income Covenant position paper; state law; opinions on
what any provision means for a particular trustee.
