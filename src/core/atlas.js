/**
 * Atlas core: queries over a governed-record snapshot from the Reasoning Fabric
 * connector. Plain ES module with no dependencies, shared by the server, the
 * REST API, the MCP server and the browser (the matter brief runs entirely in
 * the lawyer's browser).
 *
 * Standing rule: the Atlas states what sources say and how they are classified.
 * It never states what the law requires of a particular client.
 */

export const STANDING_RULE = 'Records state what sources say and how they are classified. They are not legal advice and do not say what the law requires of any particular client; counsel decides what applies.';

export const TIERS = {
  binding: { label: 'Binding', describes: 'Law or prudential standard in force' },
  expected: { label: 'Expected', describes: 'Regulator expectation, guidance or recognised standard' },
  anticipated: { label: 'Anticipated', describes: 'Made but not yet in force, under consultation, or a pending bill' },
};

export const JURISDICTIONS = {
  AU: { name: 'Australia', depth: 'full' },
  SG: { name: 'Singapore', depth: 'full' },
  EU: { name: 'European Union', depth: 'core' },
  GB: { name: 'United Kingdom', depth: 'core' },
  NZ: { name: 'New Zealand', depth: 'core' },
  US: { name: 'United States (insurance)', depth: 'core' },
  INT: { name: 'International standards', depth: 'reference' },
};

export const ENTITY_TYPES = {
  authorisedDepositTakingInstitution: 'Authorised deposit-taking institution',
  generalInsurer: 'General insurer',
  lifeInsurer: 'Life insurer',
  privateHealthInsurer: 'Private health insurer',
  superannuationTrustee: 'Superannuation trustee',
  financialServicesLicensee: 'Financial services licensee',
  creditLicensee: 'Credit licensee',
  listedEntity: 'Listed entity',
  bank: 'Bank',
  insurer: 'Insurer',
  capitalMarketsIntermediary: 'Capital markets intermediary',
  paymentServiceProvider: 'Payment service provider',
  financialInstitution: 'Financial institution',
  anyOrganization: 'Any organisation',
  other: 'Other',
};

export const ROLES = {
  regulatedEntity: 'Regulated entity', board: 'Board', seniorManagement: 'Senior management', accountablePerson: 'Accountable person',
  provider: 'AI provider', deployer: 'AI deployer', serviceProvider: 'Service provider', importer: 'Importer', distributor: 'Distributor',
};

export const STATUS = {
  proposed: 'Under consultation or a bill', pending: 'Made, not yet in force', inForce: 'In force', amended: 'Amended',
  superseded: 'Superseded', repealed: 'Repealed', withdrawn: 'Withdrawn',
};

export const ASSESSMENTS = {
  aiRiskAppetite: { name: 'AI Risk Appetite', does: 'Sets the board’s AI risk appetite and the triggers that act on it' },
  aiUseAssessment: { name: 'AI Use Assessment', does: 'Assesses a particular AI use, including AI in the supply chain' },
  aiConfidentialityExposureAssessment: { name: 'AI Confidentiality Exposure Assessment', does: 'Assesses exposure of confidential information, such as deal information, to AI tools' },
};

export const AUTHORITY = { a1Productivity: 'A1 productivity', a2Analytical: 'A2 analytical', a3Decision: 'A3 decision', a4Transactional: 'A4 transactional', a5Agentic: 'A5 agentic', a6Actuation: 'A6 actuation' };

const byNum = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',')).map((s) => String(s).trim()).filter(Boolean);
const today = () => new Date().toISOString().slice(0, 10);

/** Canonical JSON and SHA-256 (Web Crypto), to check provenance entries. */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}
export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyEntry(entry) {
  const { hash, ...rest } = entry;
  return (await sha256Hex(canonicalJSON(rest))) === hash;
}

export class Atlas {
  /**
   * @param {object} snapshot connector snapshot (records, provenance, policy, ledgerHead)
   * @param {object} opts { preview: show pendingReview records (preview builds only) }
   */
  constructor(snapshot, { preview = false } = {}) {
    this.snapshot = snapshot;
    this.policy = snapshot.policy;
    this.preview = preview && !!snapshot.includesPending;
    const visible = new Set(['published', 'unverified', ...(this.preview ? ['pendingReview'] : [])]);
    this.records = snapshot.records.filter((r) => visible.has(r.publicationStatus));
    this.superseded = snapshot.records.filter((r) => r.publicationStatus === 'superseded');
    const of = (d) => this.records.filter((r) => r.domainType === d);
    this.obligationRecords = of('obligation');
    this.useCaseRecords = of('useCase').sort((a, b) => byNum(a.entityID, b.entityID));
    this.orgRecords = of('externalOrganization');
    this.triggerRecords = of('trigger');
    this.dataFlowRecords = of('dataFlow');
    this.byID = new Map(this.records.map((r) => [r.entityID, r]));
    this.provenanceByID = new Map((snapshot.provenance || []).map((e) => [e.provenanceRecordID, e]));
    this.languageRules = (this.policy && this.policy.languageRules || []).map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }));
  }

  info() {
    const s = this.snapshot;
    return {
      name: 'AI Obligations Atlas',
      dataset: s.dataset,
      generatedAt: s.generatedAt,
      metamodelVersion: s.metamodelVersion,
      connectorVersion: s.connectorVersion,
      ledgerHead: s.ledgerHead,
      preview: this.preview,
      counts: {
        obligations: this.obligationRecords.length,
        useCases: this.useCaseRecords.length,
        organizations: this.orgRecords.length,
        instrumentChanges: this.triggerRecords.length,
        monitoredSources: this.dataFlowRecords.length,
      },
      standingRule: STANDING_RULE,
    };
  }

  org(id) {
    const r = id && this.byID.get(id);
    return r ? { externalOrgID: r.entityID, name: r.record.name, acronym: r.record.acronym, website: r.record.website } : null;
  }

  useCaseTitle(id) {
    const r = this.byID.get(id);
    return r ? r.record.title : id;
  }

  /** Public view of one obligation: the record, its source, tier, verification and provenance. */
  view(gr) {
    const o = gr.record;
    const v = gr.verification || {};
    const prov = gr.provenanceRecordIDs || [];
    return {
      obligationID: o.obligationID,
      title: o.title,
      statement: o.statement,
      sourceTier: o.sourceTier,
      tierLabel: TIERS[o.sourceTier] ? TIERS[o.sourceTier].label : o.sourceTier,
      tierBasis: (o.tierBasis || []).map((b) => ({ ...b, title: this.byID.get(b.obligationID) ? this.byID.get(b.obligationID).record.title : undefined })),
      status: o.status,
      statusLabel: STATUS[o.status] || o.status,
      jurisdiction: o.jurisdiction,
      instrument: o.source.instrument,
      citation: o.source.citation,
      authority: o.source.authority,
      regulator: this.org(o.source.externalOrgID),
      obligationType: o.obligationType,
      sourceURL: o.source.url,
      effectiveDate: o.effectiveDate,
      keyDates: o.effectiveDates || [],
      entityTypes: o.entityTypes || [],
      roles: o.roles || [],
      useCaseIDs: o.useCaseIDs || [],
      supersededByObligationID: o.supersededByObligationID,
      lastVerified: v.lastVerified || o.lastVerified,
      stale: !!v.stale,
      confidence: v.confidence ? { score: v.confidence.score, band: v.confidence.band } : undefined,
      governedRecordID: gr.governedRecordID,
      publicationStatus: gr.publicationStatus,
      approval: gr.approval ? { approverName: gr.approval.approverName, approverRole: gr.approval.approverRole, approvedAt: gr.approval.approvedAt } : null,
      provenanceRef: prov[prov.length - 1] || null,
      citeAs: `${o.source.instrument}, ${o.source.citation} (${TIERS[o.sourceTier] ? TIERS[o.sourceTier].label : o.sourceTier}; last verified ${v.lastVerified || o.lastVerified}; Atlas record ${gr.governedRecordID})`,
    };
  }

  /**
   * Obligations matching filters. jurisdiction includes INT (international
   * standards) unless includeInternational is false.
   */
  findObligations(filters = {}) {
    const jur = list(filters.jurisdiction).map((j) => j.toUpperCase());
    const tiers = list(filters.tier);
    const ucs = list(filters.useCase);
    const ets = list(filters.entityType);
    const roles = list(filters.role);
    const statuses = list(filters.status);
    const q = (filters.q || '').toLowerCase().trim();
    const includeIntl = filters.includeInternational !== false && filters.includeInternational !== 'false';
    const out = this.obligationRecords.filter((gr) => {
      const o = gr.record;
      if (jur.length && !jur.includes(o.jurisdiction) && !(includeIntl && o.jurisdiction === 'INT')) return false;
      if (tiers.length && !tiers.includes(o.sourceTier)) return false;
      if (ucs.length && !(o.useCaseIDs || []).some((u) => ucs.includes(u))) return false;
      if (ets.length && !(o.entityTypes || []).some((e) => ets.includes(e) || e === 'anyOrganization')) return false;
      if (roles.length && !(o.roles || []).some((r) => roles.includes(r))) return false;
      if (statuses.length && !statuses.includes(o.status)) return false;
      if (filters.current === true || filters.current === 'true') {
        if (['superseded', 'repealed', 'withdrawn'].includes(o.status)) return false;
      }
      if (q && ![o.title, o.statement, o.source.instrument, o.source.citation, o.source.authority, o.obligationID].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    const tierOrder = { binding: 0, expected: 1, anticipated: 2 };
    return out
      .sort((a, b) => (a.record.jurisdiction === b.record.jurisdiction ? 0 : a.record.jurisdiction === 'INT' ? 1 : b.record.jurisdiction === 'INT' ? -1 : a.record.jurisdiction < b.record.jurisdiction ? -1 : 1)
        || tierOrder[a.record.sourceTier] - tierOrder[b.record.sourceTier]
        || byNum(a.record.source.instrument, b.record.source.instrument)
        || byNum(a.entityID, b.entityID))
      .map((gr) => this.view(gr));
  }

  getObligation(id) {
    const gr = this.obligationRecords.find((r) => r.entityID === id);
    return gr ? this.view(gr) : null;
  }

  instruments(filters = {}) {
    const groups = new Map();
    for (const v of this.findObligations(filters)) {
      const key = `${v.jurisdiction}|${v.instrument}`;
      if (!groups.has(key)) {
        groups.set(key, { instrument: v.instrument, jurisdiction: v.jurisdiction, authority: v.authority, regulator: v.regulator, sourceURL: v.sourceURL, tiers: [], statuses: [], obligationIDs: [], lastVerified: v.lastVerified });
      }
      const g = groups.get(key);
      if (!g.tiers.includes(v.sourceTier)) g.tiers.push(v.sourceTier);
      if (!g.statuses.includes(v.status)) g.statuses.push(v.status);
      g.obligationIDs.push(v.obligationID);
      if (v.lastVerified < g.lastVerified) g.lastVerified = v.lastVerified;
    }
    return [...groups.values()];
  }

  useCases() {
    return this.useCaseRecords.map((r) => ({
      ...r.record,
      authorityLabels: r.record.anyAuthorityLevel ? ['Any'] : r.record.authorityLevels.map((a) => AUTHORITY[a] || a),
      obligationCount: this.obligationRecords.filter((o) => (o.record.useCaseIDs || []).includes(r.entityID)).length,
      governedRecordID: r.governedRecordID,
      publicationStatus: r.publicationStatus,
    }));
  }

  organizations() {
    return this.orgRecords.map((r) => ({ ...r.record, governedRecordID: r.governedRecordID, publicationStatus: r.publicationStatus }))
      .sort((a, b) => byNum(a.jurisdiction + a.name, b.jurisdiction + b.name));
  }

  jurisdictions() {
    return Object.entries(JURISDICTIONS).map(([code, j]) => {
      const obs = this.obligationRecords.filter((o) => o.record.jurisdiction === code);
      const tiers = {};
      for (const o of obs) tiers[o.record.sourceTier] = (tiers[o.record.sourceTier] || 0) + 1;
      return { code, ...j, obligations: obs.length, tiers, available: obs.length > 0 };
    });
  }

  /** Instrument changes (Triggers) and record versions, newest first, since a date. */
  changes(since = '1970-01-01') {
    const s = String(since);
    const items = [];
    for (const t of this.triggerRecords) {
      const r = t.record;
      const date = (r.instrumentChange && (r.instrumentChange.publishedDate || r.instrumentChange.effectiveDate)) || r.detectionDate || t.publishedAt.slice(0, 10);
      if (date < s.slice(0, 10)) continue;
      items.push({
        kind: r.status === 'lead' || t.publicationStatus === 'unverified' ? 'lead' : 'instrumentChange',
        date,
        title: r.label,
        summary: r.description,
        changeType: r.instrumentChange && r.instrumentChange.changeType,
        instrument: r.instrumentChange && r.instrumentChange.instrument,
        jurisdiction: r.instrumentChange && r.instrumentChange.jurisdiction,
        effectiveDate: r.instrumentChange && r.instrumentChange.effectiveDate,
        sourceURL: r.instrumentChange && r.instrumentChange.sourceURL,
        sourceRank: r.instrumentChange && r.instrumentChange.sourceRank,
        affects: (r.affectedEntities || []).map((a) => a.entityID),
        triggerID: r.triggerID,
        publicationStatus: t.publicationStatus,
        governedRecordID: t.governedRecordID,
      });
    }
    for (const gr of [...this.obligationRecords, ...this.superseded.filter((x) => x.domainType === 'obligation')]) {
      if (gr.publishedAt.slice(0, 10) < s.slice(0, 10) || gr.publicationStatus === 'pendingReview') continue;
      items.push({
        kind: gr.publicationStatus === 'superseded' ? 'recordSuperseded' : gr.version > 1 ? 'recordUpdated' : 'recordPublished',
        date: gr.publishedAt.slice(0, 10),
        title: gr.record.title,
        obligationID: gr.entityID,
        governedRecordID: gr.governedRecordID,
        approval: gr.approval ? gr.approval.approverName : null,
        publicationStatus: gr.publicationStatus,
      });
    }
    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  /** Provenance for a provenance record ID, governed record ID or entity ID, with hash checks. */
  async provenance(ref) {
    let entries = [];
    let subject = null;
    if (this.provenanceByID.has(ref)) {
      const e = this.provenanceByID.get(ref);
      subject = e.subject && e.subject.entityID;
      entries = [e];
    } else {
      const id = String(ref).split('@')[0];
      const gr = this.byID.get(id);
      if (!gr) return null;
      subject = id;
      entries = (gr.provenanceRecordIDs || []).map((p) => this.provenanceByID.get(p)).filter(Boolean);
    }
    const checked = [];
    for (const e of entries.sort((a, b) => a.sequence - b.sequence)) checked.push({ ...e, hashVerified: await verifyEntry(e) });
    const gr = this.byID.get(subject);
    return {
      subject,
      governedRecordID: gr ? gr.governedRecordID : undefined,
      publicationStatus: gr ? gr.publicationStatus : undefined,
      approval: gr && gr.approval ? gr.approval : null,
      entries: checked,
      allHashesVerified: checked.every((e) => e.hashVerified),
      ledgerHead: this.snapshot.ledgerHead,
      note: 'Each entry carries a SHA-256 hash of its canonical JSON and the hash of the entry before it in the Reasoning Fabric provenance ledger.',
    };
  }

  /** Language rule violations in any string of a value, for a scope. */
  languageIssues(value, scope = 'response') {
    const rules = this.languageRules.filter((r) => !r.appliesTo || r.appliesTo.includes(scope));
    const issues = [];
    const visit = (v, path) => {
      if (typeof v === 'string') {
        for (const r of rules) if (r.re.test(v)) issues.push({ ruleID: r.ruleID, path, text: v.slice(0, 120) });
      } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}/${i}`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!/url|URL|ID$|IDs$|Ref$|hash/i.test(k) && k !== 'languageRules') visit(x, `${path}/${k}`);
    };
    visit(value, '');
    return issues;
  }

  /** Compact dataset for the web app, which filters and builds matter briefs in the browser. */
  dataset() {
    return {
      info: this.info(),
      obligations: this.findObligations({}),
      useCases: this.useCases(),
      organizations: this.organizations(),
      jurisdictions: this.jurisdictions(),
      changes: this.changes(),
      policy: { languageRules: (this.policy && this.policy.languageRules) || [], freshness: this.policy && this.policy.freshness },
    };
  }
}

/**
 * Build a matter brief. Pure function over the dataset, so it runs in the
 * browser and no client facts leave it.
 *
 * @param {object} data   Atlas.dataset() output
 * @param {object} input  { matterLabel, jurisdictions[], entityTypes[], useCaseIDs[], consequence: { UCn: 'c1'..'c5' }, preparedBy }
 */
export function buildMatterBrief(data, input) {
  const jur = (input.jurisdictions || []).map((j) => j.toUpperCase());
  const ets = input.entityTypes || [];
  const ucs = input.useCaseIDs || [];
  const obligations = data.obligations.filter((o) => (!jur.length || jur.includes(o.jurisdiction) || o.jurisdiction === 'INT')
    && (!ets.length || o.entityTypes.some((e) => ets.includes(e) || e === 'anyOrganization'))
    && (!ucs.length || o.useCaseIDs.some((u) => ucs.includes(u)))
    && !['superseded', 'repealed', 'withdrawn'].includes(o.status));
  const ref = (o) => ({
    obligationID: o.obligationID, title: o.title, instrument: o.instrument, citation: o.citation, jurisdiction: o.jurisdiction,
    status: o.status, keyDates: o.keyDates, useCaseIDs: o.useCaseIDs.filter((u) => !ucs.length || ucs.includes(u)),
    sourceURL: o.sourceURL, lastVerified: o.lastVerified, governedRecordID: o.governedRecordID, publicationStatus: o.publicationStatus, provenanceRef: o.provenanceRef,
  });
  const byTier = { binding: [], expected: [], anticipated: [] };
  for (const o of obligations) (byTier[o.sourceTier] || (byTier[o.sourceTier] = [])).push(ref(o));
  const ucByID = new Map(data.useCases.map((u) => [u.useCaseID, u]));

  const questions = [];
  for (const u of ucs) {
    const uc = ucByID.get(u);
    if (!uc) continue;
    questions.push({ about: u, question: `Measured against the client’s own thresholds, which consequence level (C1 to C5) should counsel set for ${u} (${uc.title})?` });
  }
  const instruments = new Map();
  for (const o of obligations) {
    const k = `${o.instrument}`;
    if (!instruments.has(k)) instruments.set(k, o);
  }
  for (const o of instruments.values()) {
    if (o.sourceTier === 'binding') questions.push({ about: o.obligationID, question: `Does ${o.instrument} reach the client’s arrangements for the selected use cases, and if so, what do its provisions call for?` });
    else if (o.sourceTier === 'expected') questions.push({ about: o.obligationID, question: `What weight should the client give to ${o.instrument} (${o.authority}) in its approach to the selected use cases?` });
    else {
      const d = (o.keyDates || []).find((k) => ['commences', 'applies'].includes(k.dateType));
      questions.push({ about: o.obligationID, question: `How should the client prepare for ${o.instrument}, which is ${o.status === 'proposed' ? 'under consultation' : 'made but not yet in force'}${d ? ` (key date ${d.date})` : ''}?` });
    }
  }

  const fits = new Map();
  for (const u of ucs) for (const a of (ucByID.get(u) || {}).assessmentTypes || []) {
    if (!fits.has(a)) fits.set(a, []);
    fits.get(a).push(u);
  }
  const engagementsThatFit = [...fits.entries()].map(([a, u]) => ({ assessmentType: a, name: ASSESSMENTS[a].name, purpose: ASSESSMENTS[a].does, useCaseIDs: u }));

  return {
    briefFormat: 'triodian.matterBrief/1',
    generatedAt: new Date().toISOString(),
    matterLabel: input.matterLabel || 'Untitled matter',
    ...(input.preparedBy ? { preparedBy: input.preparedBy } : {}),
    scope: {
      jurisdictions: jur,
      entityTypes: ets,
      useCases: ucs.map((u) => ({ useCaseID: u, title: (ucByID.get(u) || {}).title, consequenceLevel: (input.consequence || {})[u] || null })),
    },
    dataset: { name: data.info.name, generatedAt: data.info.generatedAt, metamodelVersion: data.info.metamodelVersion, ledgerHead: data.info.ledgerHead, preview: data.info.preview },
    obligationsByTier: byTier,
    counts: { binding: byTier.binding.length, expected: byTier.expected.length, anticipated: byTier.anticipated.length },
    questionsForCounsel: questions,
    engagementsThatFit,
    notices: [
      STANDING_RULE,
      'Tiers describe sources: Binding (law or prudential standard in force), Expected (regulator expectation, guidance or recognised standard), Anticipated (made but not yet in force, or under consultation).',
      'This brief was built in the browser. The matter label, scope and consequence levels were not sent to Triodian.',
      ...(data.info.preview ? ['Preview data: records marked pending review have not yet been approved by a Triodian reviewer.'] : []),
    ],
  };
}

export { list as splitList, today };
