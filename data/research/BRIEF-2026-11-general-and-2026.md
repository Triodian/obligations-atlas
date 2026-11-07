# Research brief: general-company sources and the 2026 sources

Development plan task 2.3. Brief for the research and update agent, 8 November 2026.

The Atlas so far covers financial regulators (APRA, ASIC, MAS), the AI-specific guidance around them, and two
international standards. Since Metamodel 2.4.0 and 2.5.0, the Atlas offers entity types and regulated sectors for
organizations outside financial regulation: private companies, not-for-profits, listed companies, health service
providers, critical infrastructure asset owners and defence industry suppliers. Those clients can choose a sector
today and find few records addressed to them. This brief closes that gap, and brings in the sources published in 2026
that the first research did not hold.

## What to research

### A. General-company sources, Australia and Singapore

For each, find the provision that reaches an organization's use of AI, and record it once per provision group.

| Area | Australia | Singapore |
| --- | --- | --- |
| Privacy | Privacy Act 1988 APP 6 (use and disclosure) and APP 11 (security); the statutory tort for serious invasions of privacy (POLA Act 2024, Sch 2); OAIC guidance on commercially available AI products and on developing and training generative AI models | PDPA protection obligation (s 24) and data breach notification (Part 6A) |
| Consumer law | Australian Consumer Law ss 18 and 29 (misleading or deceptive conduct; false representations), as they reach AI claims and AI-generated statements | Consumer Protection (Fair Trading) Act 2003, unfair practices |
| Directors' duties | Corporations Act 2001 s 180 (care and diligence) | Companies Act 1967 s 157 (honesty and diligence) |
| Cyber incident reporting | Cyber Security Act 2024 Part 3 (ransomware payment reporting) | Cybersecurity Act 2018, as amended in 2024, incident reporting |
| Critical infrastructure | Security of Critical Infrastructure Act 2018 Part 2A (risk management program) and Part 2B (mandatory cyber incident reporting) | Cybersecurity Act 2018 duties of owners of critical information infrastructure |
| Workplace surveillance | Workplace Surveillance Act 2005 (NSW), computer surveillance notice | Workplace Fairness Act 2025, where it reaches AI in hiring and employment decisions |
| Export controls | Defence Trade Controls Act 2012, supply of DSGL technology, as amended in 2024 | Strategic Goods (Control) Act 2002, intangible transfer of technology |
| Health | Ahpra and National Boards guidance on using AI in healthcare | Ministry of Health Artificial Intelligence in Healthcare Guidelines |

### B. Sources published in 2026

| Source | What to do |
| --- | --- |
| MAS Guidelines on Artificial Intelligence Risk Management (final, issued 7 October 2026) | The Atlas holds nine records from these guidelines. Check each paragraph citation and quote against the final text, and record any change as an update to the existing record, not a new one |
| FSB report on sound practices for AI (October 2026) | New record, jurisdiction `INT`, tier Expected if it sets out supervisory expectations, otherwise not a record (a lead) |
| APRA CPS 230 amendments (determination No. 1 of 2026, F2026L00475, commencing 1 July 2026) | Confirm what changed. Update the five CPS 230 records only where a cited paragraph changed; add the instrument change |
| OAIC guidance on automated decisions (30 September 2026) | Confirm whether this is the APP 1 guidance the Atlas already holds (`OBL-AU-OAIC-APP1-GUIDE`). Update it, or add a record if it is separate |

## Method

1. **Official text first.** Fetch the instrument from the official register (Federal Register of Legislation, NSW
   legislation, Singapore Statutes Online) or the regulator's own publication. Commentary from a law firm may point to a
   source; it is never the source.
2. **Quote, then summarise.** Each record's statement quotes the operative words, in single quotes, then says in
   plain words what the provision addresses. Never say what an organization "must" do or is "required" to do: the
   language rules reserve that for counsel. Say what the provision "calls for", "provides" or "addresses".
3. **Cite precisely.** Section, subsection or paragraph. Where the text could not be fetched, say so in
   `confidenceNote`, leave the pinpoint out, and expect the Fabric to hold the record as an unverified lead.
4. **Tier by the source, not the outcome.** Binding: an Act, regulation or prudential standard in force. Expected:
   regulator guidance, expectations, or a recognised standard. Anticipated: made but not yet in force, or under
   consultation. Explain any judgment in `confidenceNote`.
5. **Address it to the right entities.** Use the Metamodel's `regulatedEntityType` values. A general law reaching
   any organization uses `anyOrganization`; a law for one sector uses that sector's types (for example
   `criticalInfrastructureAssetOwner` for SOCI Part 2A, `defenceIndustrySupplier` for the Defence Trade Controls
   Act, `healthServiceProvider` for the health guidance). Where an Act has a threshold (the Privacy Act's small
   business exemption), say so in the statement.
6. **Map to use cases.** Use UC1 to UC10. Map to all ten only when the provision applies to any AI use.
7. **Dates.** Record `published`, `commences`, `applies` or `transitionEnds` from the instrument itself. No
   placeholder dates.
8. **Record what you could not settle** in `openQuestions`.

## Output

One file, `data/research/2026-11-08-general-and-2026.json`, in the same shape as `2026-10-27-au-sg.json`:
`obligations`, `externalOrganizations` (new ones only), `monitoringSources` (new ones only), `openQuestions`, and
`updates` (changes to records the Atlas already holds, each naming the record by `obligationID`).

`node data/seed/build-submission.mjs data/research/2026-11-08-general-and-2026.json` turns it into connector change
proposals. The update agent submits them to the Fabric with its token. Every proposal goes to the review queue, and
nothing is published until a named reviewer approves it.

## Out of scope

Jurisdictions other than Australia, Singapore and international standards. State and territory law other than the
NSW workplace surveillance Act. Sector-specific rules already held for financial regulators. Opinions on what any
provision means for a particular organization: that is for counsel.
