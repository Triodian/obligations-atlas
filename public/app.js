/**
 * AI Obligations Atlas web app. The whole public dataset is downloaded once;
 * filtering and matter briefs run here in the browser, so nothing about a
 * lawyer's matter is sent to the server.
 */
import { buildMatterBrief, ENTITY_TYPES, ROLES, TIERS, STATUS, JURISDICTIONS, ASSESSMENTS, STANDING_RULE, SOURCE_RANKS, sectorByID, reachedEntityTypes, PORTFOLIO_FORMAT, draftFromBrief, normalisePortfolio, saveToPortfolio, removeFromPortfolio, exportPortfolio, importPortfolio } from '/core/atlas.js';

const main = document.getElementById('main');
// When embedded (single-file preview), data comes from window.ATLAS_EMBED and routes are plain #names.
const EMBED = window.ATLAS_EMBED || null;
const href = (page, arg) => (EMBED ? `#${page || 'register'}${arg ? `-${arg}` : ''}` : `#/${page || ''}${arg ? `/${encodeURIComponent(arg)}` : ''}`);
const parseRoute = () => {
  const h = location.hash.replace(/^#\/?/, '');
  if (!EMBED) { const [page, arg] = h.split('/'); return [page, arg ? decodeURIComponent(arg) : '']; }
  const m = /^(obligation)-(.+)$/.exec(h);
  return m ? [m[1], m[2]] : [h, ''];
};
let data;
const state = { tier: '', jurisdiction: 'AU', sector: '', entityType: '', useCase: '', q: '', current: true };
// The regulated sectors of one jurisdiction (Metamodel reference data, in the dataset).
const sectorsOf = (j) => (data.sectors || []).filter((d) => d.jurisdiction === j);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const jurName = (c) => (JURISDICTIONS[c] ? JURISDICTIONS[c].name : c);
// Use-case titles come from the published use-case records; when one is not yet published, show the ID alone.
const ucTitle = (id) => (data.useCases.find((u) => u.useCaseID === id) || {}).title || '';
const TIER_SHORT = { binding: 'in force', expected: 'guidance or standard', anticipated: 'not yet in force' };
const tierLabel = (tier) => (TIERS[tier] ? TIERS[tier].label : tier);
const tierBadge = (tier) => `<span class="badge ${esc(tier)}" title="${esc(TIERS[tier] ? TIERS[tier].describes : '')}">${esc(tierLabel(tier))}</span>`;
const pendingBadge = (o) => (o.publicationStatus === 'pendingReview' ? '<span class="badge pending" title="Not yet approved by a Triodian reviewer">Pending review</span>' : '');
const staleBadge = (o) => (o.stale ? '<span class="badge stale" title="Not re-verified within the freshness threshold">Past freshness threshold</span>' : '');
// Use-case IDs known to the dataset: the published use-case records, or, before they are published, the IDs the obligations cite.
const ucNum = (u) => Number(String(u).replace(/\D/g, '')) || 0;
const ucIDs = () => (data.useCases.length ? data.useCases.map((u) => u.useCaseID) : [...new Set(data.obligations.flatMap((o) => o.useCaseIDs))].sort((a, b) => ucNum(a) - ucNum(b)));
// A record mapped to every standardised use case applies to any AI use, not to particular uses.
const allUseCases = (ids) => ids.length >= 10;
const ucShort = (ids) => (allUseCases(ids) ? 'Any AI use' : ids.join(', '));
// Entity types grouped by the jurisdictions whose records address them.
const entityGroups = (jurs) => Object.entries(data.entityTypesByJurisdiction || {})
  .filter(([j]) => !jurs.length || jurs.includes(j))
  .sort(([a], [b]) => jurName(a).localeCompare(jurName(b)));
const entityOptions = (selected, jurs) => entityGroups(jurs).map(([j, types]) => `<optgroup label="${esc(jurName(j))}">${options(types.map((e) => [e, ENTITY_TYPES[e] || e]), selected)}</optgroup>`).join('');
const notCovered = () => data.jurisdictions.filter((j) => !j.available && j.code !== 'INT');
const issuer = (o) => (o.regulator && o.regulator.acronym) || '';
const whereLine = (o) => [issuer(o), o.instrument, o.citation].filter(Boolean).map(esc).join(' · ');

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.setAttribute('href', href(a.dataset.nav === 'register' ? '' : a.dataset.nav)));
  document.querySelectorAll('.wordmark, .brand').forEach((a) => a.setAttribute('href', href('')));
  document.querySelectorAll('.steps [data-nav], .drawer [data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

/** The chosen entity type, or else the chosen sector's types, widened by the broader types they reach. */
function entityMatch(o) {
  const d = state.sector ? sectorByID(state.sector) : null;
  const chosen = state.entityType ? [state.entityType] : d ? d.entityTypes : [];
  if (!chosen.length) return true;
  const reach = reachedEntityTypes(chosen, state.jurisdiction ? [state.jurisdiction] : []);
  return o.entityTypes.some((e) => reach.includes(e) || e === 'anyOrganization');
}

function filtered() {
  return data.obligations.filter((o) => (!state.jurisdiction || o.jurisdiction === state.jurisdiction || o.jurisdiction === 'INT')
    && (!state.tier || o.sourceTier === state.tier)
    && entityMatch(o)
    && (!state.useCase || o.useCaseIDs.includes(state.useCase))
    && (!state.current || !['superseded', 'repealed', 'withdrawn'].includes(o.status))
    && (!state.q || [o.title, o.statement, o.instrument, o.citation, o.authority].join(' ').toLowerCase().includes(state.q.toLowerCase())));
}

const options = (pairs, selected) => pairs.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

function entryHTML(o) {
  const basis = o.tierBasis.length ? `Rests on ${o.tierBasis.length} binding provision${o.tierBasis.length > 1 ? 's' : ''}` : '';
  return `<li class="entry ${esc(o.sourceTier)}"><div class="row">
      <h3 class="title"><a href="${href('obligation', o.obligationID)}">${esc(o.title)}</a></h3>
      <div class="tags">${tierBadge(o.sourceTier)}${pendingBadge(o)}${staleBadge(o)}</div>
      <div class="where" title="${esc(`${o.instrument}, ${o.citation}`)}">${whereLine(o)}</div>
      <p class="gist">${esc(o.statement)}</p>
      <div class="meta"><span>${esc(jurName(o.jurisdiction))}</span><span>${esc(o.statusLabel)}</span><span title="${esc(allUseCases(o.useCaseIDs) ? 'Mapped to every standardised use case' : o.useCaseIDs.map((u) => [u, ucTitle(u)].filter(Boolean).join(' ')).join('; '))}">${esc(ucShort(o.useCaseIDs))}</span>${basis ? `<span>${esc(basis)}</span>` : ''}<span>Verified ${esc(fmtDate(o.lastVerified))}</span></div>
    </div></li>`;
}

function renderRegister() {
  setNav('register');
  const jurOpts = [['', 'All jurisdictions'], ...data.jurisdictions.filter((j) => j.available && j.code !== 'INT').map((j) => [j.code, j.name])];
  // Entity types belong to a jurisdiction; offer only those of the chosen one.
  const entJurs = state.jurisdiction ? [state.jurisdiction] : [];
  // A sector belongs to a jurisdiction, and narrows the entity types offered to its own.
  if (state.sector && (!state.jurisdiction || !sectorsOf(state.jurisdiction).some((d) => d.regulatedSectorID === state.sector))) state.sector = '';
  const sec = state.sector ? sectorByID(state.sector) : null;
  const secOpts = [['', state.jurisdiction ? 'Any sector' : 'Choose a jurisdiction first'], ...(state.jurisdiction ? sectorsOf(state.jurisdiction).map((d) => [d.regulatedSectorID, d.name]) : [])];
  if (state.entityType && !entityGroups(entJurs).some(([, t]) => t.includes(state.entityType))) state.entityType = '';
  if (state.entityType && sec && !sec.entityTypes.includes(state.entityType)) state.entityType = '';
  const ucOpts = [['', 'Any use case'], ...ucIDs().map((u) => [u, [u, ucTitle(u)].filter(Boolean).join(' ')])];
  const tierOpts = [['', 'All tiers'], ...Object.entries(TIERS).map(([k, t]) => [k, t.label])];
  const rows = filtered();
  // With a use case chosen, records specific to it come first; records that apply to any AI use follow, folded.
  const specific = state.useCase ? rows.filter((o) => !allUseCases(o.useCaseIDs)) : rows;
  const anyUse = state.useCase ? rows.filter((o) => allUseCases(o.useCaseIDs)) : [];
  const anyOpen = store.get('atlas.anyUseOpen', false);
  const gaps = notCovered();
  const countLine = state.useCase
    ? `<span class="count">${specific.length} record${specific.length === 1 ? '' : 's'} specific to ${esc(state.useCase)}</span>, plus ${anyUse.length} that apply to any AI use`
    : `<span class="count">${rows.length} record${rows.length === 1 ? '' : 's'}</span>${state.jurisdiction ? ', including international standards' : ''}`;
  main.innerHTML = `
    <div class="opening">
      <div class="eyebrow">Register</div>
      <h1>AI governance obligations</h1>
    </div>
    <form class="filters" id="query" role="search" aria-label="Find obligations">
      <label>Tier<select name="tier">${options(tierOpts, state.tier)}</select></label>
      <label>Jurisdiction<select name="jurisdiction">${options(jurOpts, state.jurisdiction)}</select></label>
      <label>Sector<select name="sector"${state.jurisdiction ? '' : ' disabled'}>${options(secOpts, state.sector)}</select></label>
      <label>Entity<select name="entityType"><option value="">${sec ? `Any in ${esc(sec.name.toLowerCase())}` : 'Any entity'}</option>${sec ? options(sec.entityTypes.map((e) => [e, ENTITY_TYPES[e] || e]), state.entityType) : entityOptions(state.entityType, entJurs)}</select></label>
      <label>Use case<select name="useCase">${options(ucOpts, state.useCase)}</select></label>
      <label class="grow">Search<input name="q" type="search" placeholder="Title, instrument or text" value="${esc(state.q)}"></label>
    </form>
    ${gaps.length ? `<p class="coverage small">Covers ${esc(data.jurisdictions.filter((j) => j.available && j.code !== 'INT').map((j) => j.name).join(' and '))}, with international standards. Not yet covered: ${esc(gaps.map((j) => j.name).join(', '))}.</p>` : ''}
    <div class="resultline">
      <span aria-live="polite">${countLine}</span>
      <ul class="key" aria-label="Source tiers">${Object.entries(TIERS).map(([k]) => `<li>${tierBadge(k)}<span>${esc(TIER_SHORT[k] || '')}</span></li>`).join('')}</ul>
      <label><input type="checkbox" id="current" ${state.current ? 'checked' : ''}> Hide superseded and withdrawn</label>
    </div>
    ${specific.length ? `<ol class="register">${specific.map(entryHTML).join('')}</ol>` : `<p class="empty">${state.useCase && anyUse.length ? `No records are specific to ${esc(state.useCase)} with these filters.` : 'No records match. Widen the jurisdiction, entity or use case above.'}</p>`}
    ${anyUse.length ? `<details class="anyuse" id="anyuse"${anyOpen ? ' open' : ''}><summary><span class="sh" style="margin:0">Apply to any AI use</span><span class="small soft">${anyUse.length} record${anyUse.length === 1 ? '' : 's'} mapped to every use case, such as board accountability and risk management</span></summary><ol class="register">${anyUse.map(entryHTML).join('')}</ol></details>` : ''}`;
  const form = document.getElementById('query');
  form.addEventListener('change', (e) => { if (e.target.name === 'q') return; state[e.target.name] = e.target.value; store.set('atlas.filters', state); renderRegister(); document.querySelector(`[name="${e.target.name}"]`).focus(); });
  let t;
  form.q.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderRegister(); const i = document.querySelector('[name="q"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('current').addEventListener('change', (e) => { state.current = e.target.checked; store.set('atlas.filters', state); renderRegister(); });
  const det = document.getElementById('anyuse');
  if (det) det.addEventListener('toggle', () => store.set('atlas.anyUseOpen', det.open));
}

async function renderObligation(id) {
  setNav('register');
  const o = data.obligations.find((x) => x.obligationID === id);
  if (!o) { main.innerHTML = `<a class="back" href="${href('register')}">Register</a><h1>No record ${esc(id)}</h1>`; return; }
  const ents = o.entityTypes.map((e) => ENTITY_TYPES[e] || e).join(', ');
  const ucs = allUseCases(o.useCaseIDs)
    ? 'Any AI use<div class="small soft">Mapped to every standardised use case</div>'
    : `<ul class="uclist">${o.useCaseIDs.map((u) => `<li><span class="uc">${esc(u)}</span>${esc(ucTitle(u))}</li>`).join('')}</ul>`;
  const dateType = (t) => t.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  main.innerHTML = `
    <a class="back" href="${href('register')}">Register</a>
    <div class="opening">
      <div class="eyebrow">${whereLine(o)}</div>
      <h1>${esc(o.title)}</h1>
      <div class="record-tags">${tierBadge(o.sourceTier)}<span class="badge status">${esc(o.statusLabel)}</span>${pendingBadge(o)}${staleBadge(o)}</div>
    </div>
    <div class="split">
      <div>
        <div class="card">
          <div class="section"><p class="statement">${esc(o.statement)}</p></div>
          ${o.tierBasis.length ? `<div class="section"><h2 class="sh">Rests on</h2><ul class="basis">${o.tierBasis.map((b) => `<li><a href="${href('obligation', b.obligationID)}">${esc(b.title || b.obligationID)}</a>${tierBadge(b.sourceTier)}${b.note ? `<span class="note">${esc(b.note)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
          ${o.keyDates.length ? `<div class="section"><h2 class="sh">Key dates</h2><ol class="timeline">${o.keyDates.map((k) => `<li><time datetime="${esc(k.date)}">${esc(fmtDate(k.date))}</time>${esc(dateType(k.dateType))}${k.provisions ? `, ${esc(k.provisions)}` : ''}${k.note ? `<div class="note">${esc(k.note)}</div>` : ''}</li>`).join('')}</ol></div>` : ''}
          <div class="section"><h2 class="sh">Cite this record</h2><div class="cite"><span id="citeas">${esc(o.citeAs)}</span><button class="copybtn" id="copycite" type="button">Copy</button></div></div>
        </div>
        <section class="card related" id="related" aria-labelledby="related-h"></section>
        <details class="pr" id="prov"><summary>Provenance trail <span class="small" id="provsum">Loading…</span></summary><div class="body" id="trail"></div></details>
      </div>
      <aside class="card facts" aria-label="Record details">
        <dl class="kv">
          <dt>Tier</dt><dd>${tierBadge(o.sourceTier)}<div class="small soft" style="margin-top:4px">${esc(TIERS[o.sourceTier].describes)}</div></dd>
          <dt>Jurisdiction</dt><dd>${esc(jurName(o.jurisdiction))}</dd>
          <dt>Issued by</dt><dd>${esc(o.regulator ? o.regulator.name : o.authority)}</dd>
          <dt>Addressed to</dt><dd>${esc(ents)}</dd>
          <dt>Roles</dt><dd>${esc(o.roles.map((r) => ROLES[r] || r).join(', '))}</dd>
          <dt>Use cases</dt><dd>${ucs}</dd>
          <dt class="brk">Source</dt><dd class="brk"><a class="srclink" href="${esc(o.sourceURL)}" target="_blank" rel="noopener">Official text</a></dd>
          <dt>Verified</dt><dd>${esc(fmtDate(o.lastVerified))}</dd>
          <dt>Confidence</dt><dd>${o.confidence ? `${esc(o.confidence.band.replace(/^./, (c) => c.toUpperCase()))} (${esc(Number(o.confidence.score).toFixed(2))})` : 'Not scored'}</dd>
          <dt>Approved by</dt><dd>${o.approval ? `${esc(o.approval.approverName)}<div class="small soft">${esc(fmtDate(o.approval.approvedAt))}</div>` : '<span class="soft">Not yet approved</span>'}</dd>
          <dt>Record</dt><dd><code>${esc(o.governedRecordID)}</code></dd>
        </dl>
      </aside>
    </div>`;
  renderRelated(o);
  document.getElementById('copycite').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(o.citeAs); e.target.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents(document.getElementById('citeas')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  });
  const sum = document.getElementById('provsum');
  try {
    const p = EMBED ? await EMBED.provenance(o.obligationID) : await (await fetch(`/api/v1/provenance/${encodeURIComponent(o.obligationID)}`)).json();
    const bad = p.entries.filter((e) => !e.hashVerified).length;
    sum.textContent = `${p.entries.length} ledger entr${p.entries.length === 1 ? 'y' : 'ies'}, ${bad ? `${bad} hash${bad > 1 ? 'es do' : ' does'} not match` : 'every hash checks'}`;
    document.getElementById('trail').innerHTML = `<p class="small soft">Each step is an entry in the Reasoning Fabric's append-only provenance ledger. Its hash is checked here against its content.</p>
      <ol class="trail">${p.entries.map((e) => `<li><span class="${e.hashVerified ? 'ok' : 'bad'}">${e.hashVerified ? 'Hash checks' : 'Hash does not match'}</span> · ${esc(fmtDate(e.recordedAt))}, ${esc(e.eventType.replace(/([A-Z])/g, ' $1').toLowerCase())} by ${esc(e.actor.displayName || e.actor.actorID)}${e.decision || e.ruleIDs ? `<div class="small soft">${esc(e.decision || '')}${e.ruleIDs ? ` Rules: ${e.ruleIDs.map((x) => `<code>${esc(x)}</code>`).join(', ')}` : ''}</div>` : ''}</li>`).join('')}</ol>`;
  } catch {
    sum.textContent = 'Could not be loaded';
    document.getElementById('trail').innerHTML = '<p class="small soft">The provenance trail could not be loaded. Reload the page to try again.</p>';
  }
}

/**
 * Related records on a record page. The jurisdiction is fixed to the record's own;
 * the dropdowns offer only the use cases and entities this record applies to (shown when there is a choice),
 * and match the register's filters so the selection can be opened there.
 */
const related = { useCase: '', entityType: '', tier: '' };
function renderRelated(o) {
  const box = document.getElementById('related');
  const ents = o.entityTypes.filter((e) => e !== 'anyOrganization' && e !== 'other');
  const keep = (k, vals) => { if (!vals.includes(related[k])) related[k] = ''; };
  keep('useCase', o.useCaseIDs); keep('entityType', ents);
  if (!related.useCase && state.useCase && o.useCaseIDs.includes(state.useCase)) related.useCase = state.useCase;
  if (!related.entityType && state.entityType && ents.includes(state.entityType)) related.entityType = state.entityType;
  const anyOf = () => 'Any of this record’s';
  const sel = (name, label, pairs, all) => (pairs.length > 1 ? `<label>${label}<select name="${name}"><option value="">${esc(all)}</option>${options(pairs, related[name])}</select></label>` : '');
  const rows = data.obligations.filter((x) => x.obligationID !== o.obligationID
    && x.jurisdiction === o.jurisdiction
    && !['superseded', 'repealed', 'withdrawn'].includes(x.status)
    && (!related.tier || x.sourceTier === related.tier)
    && (related.useCase ? x.useCaseIDs.includes(related.useCase) : x.useCaseIDs.some((u) => o.useCaseIDs.includes(u)))
    && (related.entityType ? (x.entityTypes.includes(related.entityType) || x.entityTypes.includes('anyOrganization')) : true))
    // Records specific to a use case before those that apply to any AI use.
    .sort((a, b) => Number(allUseCases(a.useCaseIDs)) - Number(allUseCases(b.useCaseIDs)));
  const max = 8;
  box.innerHTML = `<h2 class="sh" id="related-h">Related records in ${esc(jurName(o.jurisdiction))}</h2>
    <form class="filters compact" id="relform">
      ${sel('useCase', 'Use case', o.useCaseIDs.map((u) => [u, [u, ucTitle(u)].filter(Boolean).join(' ')]), `${anyOf(o.useCaseIDs)} use cases`)}
      ${sel('entityType', 'Entity', ents.map((e) => [e, ENTITY_TYPES[e] || e]), `${anyOf(ents)} entities`)}
      <label>Tier<select name="tier">${options([['', 'All tiers'], ...Object.entries(TIERS).map(([k, t]) => [k, t.label])], related.tier)}</select></label>
    </form>
    <p class="small soft" aria-live="polite">${rows.length} other record${rows.length === 1 ? '' : 's'}${related.useCase || related.entityType || related.tier ? ' match' : ' share a use case with this one'}.</p>
    ${rows.length ? `<ul class="rel">${rows.slice(0, max).map((x) => `<li>${tierBadge(x.sourceTier)}<span><a href="${href('obligation', x.obligationID)}">${esc(x.title)}</a><span class="where">${allUseCases(x.useCaseIDs) ? 'Any AI use · ' : ''}${whereLine(x)}</span></span></li>`).join('')}</ul>` : ''}
    ${rows.length ? `<p class="small" style="margin:10px 0 0"><a href="${href('register')}" id="relall">${rows.length > max ? `Show all ${rows.length} in the register` : 'Open these filters in the register'}</a></p>` : ''}`;
  box.querySelector('#relform').addEventListener('change', (e) => { related[e.target.name] = e.target.value; renderRelated(o); box.querySelector(`[name="${e.target.name}"]`).focus(); });
  const all = box.querySelector('#relall');
  if (all) all.addEventListener('click', () => {
    Object.assign(state, { jurisdiction: o.jurisdiction, useCase: related.useCase, entityType: related.entityType, tier: related.tier, q: '' });
    store.set('atlas.filters', state);
  });
}

function renderUseCases() {
  setNav('use-cases');
  main.innerHTML = `<div class="opening"><div class="eyebrow">Use cases</div><h1>Standardised AI use cases</h1>
    <p class="lede">Every obligation is mapped to the same ten use cases, defined on the authority (A) and boundary (B) scales, so results compare across jurisdictions and clients. Consequence (C1 to C5) is set per matter, against the client's own thresholds.</p></div>
    <div class="scroll"><table><thead><tr><th>Use case</th><th>Authority</th><th>Boundary</th><th>Leads to</th><th>Records</th></tr></thead><tbody>
    ${data.useCases.map((u) => `<tr><td><strong>${esc(u.useCaseID)}</strong> ${esc(u.title)}<div class="muted">${esc(u.description)}</div></td><td>${esc(u.authorityLabels.join(', '))}</td><td>${esc((u.boundaries || []).map((b) => b.toUpperCase()).join(', ') || (u.confidentialityChannels ? 'Channels K1 to K7' : ''))}</td><td>${esc((u.assessmentTypes || []).map((a) => ASSESSMENTS[a].name).join('; '))}</td><td><a href="${href('register')}" data-uc="${esc(u.useCaseID)}">${u.obligationCount}</a></td></tr>`).join('')}
    </tbody></table></div>`;
  main.querySelectorAll('[data-uc]').forEach((a) => a.addEventListener('click', () => { state.useCase = a.dataset.uc; state.jurisdiction = ''; }));
}

function changeHTML(c) {
  const kinds = { instrumentChange: 'Instrument change', lead: 'Lead, not yet checked', recordPublished: 'Record published', recordUpdated: 'Record updated', recordSuperseded: 'Record superseded' };
  const affects = (c.affects || []).filter((a) => data.obligations.some((o) => o.obligationID === a)).slice(0, 6);
  return `<li class="entry"><div class="row">
      <h3 class="title">${esc(c.title)}</h3>
      <div class="tags"><span class="badge ${c.kind === 'lead' ? 'pending' : 'status'}">${esc(kinds[c.kind] || c.kind)}</span>${c.publicationStatus === 'pendingReview' ? '<span class="badge pending">Pending review</span>' : ''}</div>
      <div class="where"><time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time>${c.jurisdiction ? ` · ${esc(jurName(c.jurisdiction))}` : ''}</div>
      ${c.summary ? `<p class="gist">${esc(c.summary)}</p>` : ''}
      <div class="meta">${c.effectiveDate && c.effectiveDate !== c.date ? `<span>Takes effect ${esc(fmtDate(c.effectiveDate))}</span>` : ''}${c.sourceURL ? `<span><a href="${esc(c.sourceURL)}" target="_blank" rel="noopener">${c.kind === 'lead' ? 'Where the lead came from' : 'Source'}</a>${c.sourceKind ? ` (${esc(c.sourceKind)})` : ''}</span>` : ''}${affects.map((a) => `<span><a href="${href('obligation', a)}">${esc(a)}</a></span>`).join('')}</div>
    </div></li>`;
}

function renderChanges() {
  setNav('changes');
  const upcoming = data.changes.filter((c) => c.upcoming).sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = data.changes.filter((c) => !c.upcoming);
  main.innerHTML = `<div class="opening"><div class="eyebrow">Changes</div><h1>New and amended sources</h1>
    <p class="lede">Commencements still to come, then new and amended instruments and withdrawals, newest first. A lead points to an official source still to be checked; it sets no status or date until a reviewer confirms it.</p></div>
    ${upcoming.length ? `<h2 class="sh">Coming up</h2><ol class="register" style="margin-bottom:26px">${upcoming.map(changeHTML).join('')}</ol>` : ''}
    <h2 class="sh">Recent</h2>
    <ol class="register">${recent.map(changeHTML).join('')}</ol>`;
}

// ------------------------------------------------------------ matter brief
function briefHTML(b) {
  const item = (o) => `<li><strong>${esc(o.instrument)}, ${esc(o.citation)}</strong>: ${esc(o.title)} <span class="muted">(${esc(o.jurisdiction)}; ${esc(STATUS[o.status] || o.status)}; verified ${esc(fmtDate(o.lastVerified))}; <a href="${esc(o.sourceURL)}">source</a>; record ${esc(o.governedRecordID)}${o.publicationStatus === 'pendingReview' ? '; pending review' : ''})</span></li>`;
  const hasUCs = b.scope.useCases.length > 0;
  const sect = (tier) => {
    const items = b.obligationsByTier[tier] || [];
    const specific = hasUCs ? items.filter((o) => !o.appliesToAnyAIUse) : items;
    const anyUse = hasUCs ? items.filter((o) => o.appliesToAnyAIUse) : [];
    return `<h3>${tierBadge(tier)} ${items.length} record${items.length === 1 ? '' : 's'}</h3>
      ${!items.length ? '<p class="muted">None in scope.</p>' : ''}
      ${specific.length ? `${hasUCs ? '<p class="subgroup">Specific to the selected use cases</p>' : ''}<ol>${specific.map(item).join('')}</ol>` : ''}
      ${anyUse.length ? `<p class="subgroup">Apply to any AI use</p><ol>${anyUse.map(item).join('')}</ol>` : ''}`;
  };
  return `<div class="brief" id="brief-out">
    <h2>${esc(b.matterLabel)}</h2>
    <p class="muted">Matter brief, ${esc(fmtDate(b.generatedAt))}. Scope: ${esc(b.scope.jurisdictions.map(jurName).join(', ') || 'all jurisdictions')}; ${esc(b.scope.entityTypes.map((e) => ENTITY_TYPES[e]).join(', ') || 'any entity')}; ${esc(b.scope.useCases.map((u) => `${u.useCaseID}${u.consequenceLevel ? ` (${u.consequenceLevel.toUpperCase()})` : ''}`).join(', ') || 'any use case')}.</p>
    ${(b.coverage || []).map((c) => `<p class="notice">${esc(c.note)}</p>`).join('')}
    <h2>Obligations by tier</h2>${sect('binding')}${sect('expected')}${sect('anticipated')}
    <h2>Questions for counsel to determine</h2><ol>${b.questionsForCounsel.map((q) => `<li>${esc(q.question)}</li>`).join('')}</ol>
    <h2>Engagements that fit</h2>
    ${b.engagementsThatFit.length ? `<ul>${b.engagementsThatFit.map((e) => `<li><strong>${esc(e.name)}</strong>${e.mode ? ` <span class="checkcount b-grey">${e.mode === 'connected' ? 'Connected' : 'Standalone'}</span>` : ''}: ${esc(e.purpose)}. <span class="muted">${esc(e.reason || '')}${e.useCaseIDs.length ? `${e.reason ? '; ' : ''}from ${esc(e.useCaseIDs.join(', '))}` : ''}.</span></li>`).join('')}</ul><p class="notice">Counsel decides whether to engage, and on what terms.</p>` : '<p class="muted">Choose an entity type, sector or use cases to see which engagements fit.</p>'}
    <div class="screen-only" id="bring-slot"></div>
    ${b.notices.map((n) => `<p class="notice">${esc(n)}</p>`).join('')}
  </div>`;
}

/* The client portfolio (task 2.5): one brief per client, kept in this browser (localStorage), and moved to another
   browser as a file. Briefs saved before the portfolio existed (atlas.briefs) are carried into it once. */
const PF_KEY = 'atlas.portfolio';
function loadPortfolio() {
  const stored = store.get(PF_KEY, null);
  if (stored) return normalisePortfolio(stored);
  const legacy = store.get('atlas.briefs', []);
  const pf = normalisePortfolio((Array.isArray(legacy) ? legacy : []).map((b) => ({ draft: draftFromBrief(b), brief: b, savedAt: b && b.generatedAt })));
  if (pf.length) { store.set(PF_KEY, { format: PORTFOLIO_FORMAT, clients: pf }); store.set('atlas.briefs', []); }
  return pf;
}
const savePortfolio = (pf) => store.set(PF_KEY, { format: PORTFOLIO_FORMAT, clients: pf });
const pfScope = (d) => [d.jurisdictions.map(jurName).join(', ') || 'All jurisdictions', d.sectors.map((x) => (sectorByID(x) || {}).name || x).join(', '), d.useCaseIDs.length ? `${d.useCaseIDs.length} use case${d.useCaseIDs.length === 1 ? '' : 's'}` : 'any use case'].filter(Boolean).join(' · ');
function portfolioHTML(pf) {
  return `<div class="saved-wrap" id="portfolio"><h2 class="sh" style="margin-top:18px">Client portfolio${pf.length ? ` · ${pf.length}` : ''}</h2>
    <p class="small soft" style="margin:0 0 8px">One brief per client, kept in this browser. Saving under the same label replaces that client’s brief.${EMBED ? '' : ' Export the portfolio to keep a copy or move it to another browser.'}</p>
    ${pf.length ? `<ul class="saved portfolio">${pf.map((x, i) => `<li><span class="pf-main"><button class="linkish" data-open="${i}">${esc(x.label)}</button><span class="small soft">${esc(pfScope(x.draft))}</span></span><span class="small soft">${esc(fmtDate(x.savedAt))}</span><button class="linkish small" data-del="${i}" aria-label="Delete ${esc(x.label)}">Delete</button></li>`).join('')}</ul>` : '<p class="small soft" style="margin:0">No clients yet. Label the matter, then <em>Save to client portfolio</em>.</p>'}
    ${EMBED ? '' : `<div class="pf-actions"><button class="btn secondary" id="pfExport" type="button" ${pf.length ? '' : 'disabled'}>Export portfolio</button><label class="btn secondary" for="pfImport" style="cursor:pointer">Import portfolio</label><input type="file" id="pfImport" accept=".json,application/json" class="vh"></div>`}</div>`;
}
function renderBrief() {
  setNav('brief');
  let portfolio = loadPortfolio();
  const dflt = data.defaults || {};
  const dSec = sectorByID(dflt.sector);
  const draft = { sectors: [], ...store.get('atlas.briefDraft', { matterLabel: '', jurisdictions: [dflt.jurisdiction || 'AU'], entityTypes: dSec ? [...dSec.entityTypes] : [], sectors: dSec ? [dSec.regulatedSectorID] : [], useCaseIDs: [], consequence: {} }) };
  const jurs = data.jurisdictions.filter((j) => j.available && j.code !== 'INT');
  const cOpts = [['', 'Not set'], ['c1', 'C1'], ['c2', 'C2'], ['c3', 'C3'], ['c4', 'C4'], ['c5', 'C5']];
  main.innerHTML = `<div class="opening screen-only"><div class="eyebrow">Build a brief for a client matter</div><h1>Matter brief</h1>
    <p class="lede">Choose the client's jurisdictions, regulated sector, entity type and AI use cases. The brief lists the obligations in scope by tier, the questions for counsel and the engagements that fit.</p></div>
    <div class="split brief-split">
      <form class="brief-form" id="bf">
        <fieldset class="card">
          <legend class="sh"><span class="stepno">1</span>Matter</legend>
          <label class="field" for="ml">Your label for the matter<input id="ml" class="text" name="matterLabel" value="${esc(draft.matterLabel)}" placeholder="e.g. Insurer AI claims triage"></label>
          <div class="field">Jurisdictions
            <div class="toggles">${jurs.map((j) => `<label class="toggle"><input type="checkbox" name="jur" value="${esc(j.code)}" ${draft.jurisdictions.includes(j.code) ? 'checked' : ''}><span>${esc(j.name)}</span></label>`).join('')}</div>
            <span class="small soft">International standards are included with any jurisdiction.</span>
          </div>
        </fieldset>
        <fieldset class="card">
          <legend class="sh"><span class="stepno">2</span>Regulated sector and entity type <span class="hint">A sector ticks its entity types. Leave all clear for any entity</span></legend>
          ${entityGroups([]).map(([j, types]) => `<div class="entgroup" data-jur="${esc(j)}"${draft.jurisdictions.length && !draft.jurisdictions.includes(j) ? ' hidden' : ''}><div class="entjur">${esc(jurName(j))}</div>
            ${sectorsOf(j).length ? `<div class="checkgrid secgrid">${sectorsOf(j).map((sc) => `<label class="check"><input type="checkbox" name="sec" value="${esc(sc.regulatedSectorID)}" ${draft.sectors.includes(sc.regulatedSectorID) ? 'checked' : ''}> <strong>${esc(sc.name)}</strong></label>`).join('')}</div>` : ''}
            <div class="checkgrid">${types.map((k) => `<label class="check"><input type="checkbox" name="ent" value="${esc(k)}" ${draft.entityTypes.includes(k) ? 'checked' : ''}> ${esc(ENTITY_TYPES[k] || k)}</label>`).join('')}</div></div>`).join('')}
        </fieldset>
        <fieldset class="card">
          <legend class="sh"><span class="stepno">3</span>AI use cases <span class="hint">Consequence (C1 to C5) against the client's own thresholds</span></legend>
          <div class="uctable">${ucIDs().map((u) => { const on = draft.useCaseIDs.includes(u); return `<div class="ucrow${on ? ' on' : ''}">
            <label class="check"><input type="checkbox" name="uc" value="${esc(u)}" ${on ? 'checked' : ''}><span><strong>${esc(u)}</strong> ${esc(ucTitle(u))}</span></label>
            <select class="small" name="c-${esc(u)}" aria-label="Consequence for ${esc(u)}" ${on ? '' : 'disabled'}>${options(cOpts, draft.consequence[u] || '')}</select></div>`; }).join('')}</div>
        </fieldset>
      </form>
      <aside class="card facts brief-aside" aria-label="Brief scope">
        <h2 class="sh">Scope</h2>
        <dl class="kv" id="scope"></dl>
        <div class="actions stack">
          <button class="btn" id="build" type="button">Build brief</button>
          <button class="btn secondary" id="export" type="button">${EMBED ? 'Copy brief as JSON' : 'Export for an assessment app'}</button>
          ${EMBED ? '' : '<button class="btn secondary" id="print" type="button">Print</button>'}
          <button class="btn secondary" id="save" type="button">Save to client portfolio</button>
        </div>
        <p class="small" style="margin:0 0 6px;color:var(--green)" id="briefstatus" aria-live="polite"></p>
        <p class="small soft" style="margin:0">Built and kept in this browser. Nothing you enter here is sent to Triodian unless you choose to share the scope when you bring in Triodian.</p>
        ${portfolioHTML(portfolio)}
      </aside>
    </div>
    <div id="out"></div>`;

  const form = document.getElementById('bf');
  let brief = null;
  const read = () => {
    const f = new FormData(form);
    const d = { matterLabel: f.get('matterLabel') || '', jurisdictions: f.getAll('jur'), entityTypes: [...new Set(f.getAll('ent'))], sectors: f.getAll('sec'), useCaseIDs: f.getAll('uc'), consequence: {} };
    for (const u of ucIDs()) { const c = f.get(`c-${u}`); if (c) d.consequence[u] = c; }
    store.set('atlas.briefDraft', d);
    return d;
  };
  const status = (t) => { document.getElementById('briefstatus').textContent = t; };
  const out = () => document.getElementById('out');
  const show = (b) => { brief = b; out().innerHTML = briefHTML(b); renderFirmPanel(document.getElementById('bring-slot'), { brief: b }); };
  // Build, Export, Print and Save all work from the current choices: the brief is rebuilt when they have changed.
  let builtFrom = '';
  const current = () => {
    const d = read();
    const key = JSON.stringify(d);
    if (!brief || key !== builtFrom) { show(buildMatterBrief(data, d)); builtFrom = key; }
    return brief;
  };
  const scope = () => {
    const d = read();
    const b = buildMatterBrief(data, d);
    const n = Object.values(b.obligationsByTier).reduce((t, x) => t + x.length, 0);
    const none = (x) => `<span class="soft">${x}</span>`;
    document.getElementById('scope').innerHTML = `
      <dt>Matter</dt><dd>${d.matterLabel ? esc(d.matterLabel) : none('No label')}</dd>
      <dt>Jurisdictions</dt><dd>${d.jurisdictions.length ? esc(d.jurisdictions.map(jurName).join(', ')) : none('All')}</dd>
      <dt>Sectors</dt><dd>${d.sectors.length ? esc(d.sectors.map((x) => (sectorByID(x) || {}).name || x).join(', ')) : none('None chosen')}</dd>
      <dt>Entities</dt><dd>${d.entityTypes.length ? esc(d.entityTypes.map((e) => ENTITY_TYPES[e] || e).join(', ')) : none('Any')}</dd>
      <dt>Use cases</dt><dd>${d.useCaseIDs.length ? esc(d.useCaseIDs.map((u) => `${u}${d.consequence[u] ? ` (${d.consequence[u].toUpperCase()})` : ''}`).join(', ')) : none('Any')}</dd>
      <dt class="brk">In scope</dt><dd class="brk"><strong>${n} record${n === 1 ? '' : 's'}</strong><ul class="tiers">${Object.keys(TIERS).map((t) => `<li>${tierBadge(t)}<span>${(b.obligationsByTier[t] || []).length}</span></li>`).join('')}</ul></dd>`;
    status('');
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'jur') {
      // Show only the entity types of the chosen jurisdictions; clear ticks in the ones hidden.
      const chosen = [...form.querySelectorAll('[name="jur"]:checked')].map((x) => x.value);
      form.querySelectorAll('.entgroup').forEach((g) => {
        const hide = chosen.length > 0 && !chosen.includes(g.dataset.jur);
        g.hidden = hide;
        if (hide) g.querySelectorAll('input:checked').forEach((x) => { x.checked = false; });
      });
    }
    if (e.target.name === 'sec') {
      // A sector ticks its entity types; unticking clears those no other ticked sector needs.
      const sc = sectorByID(e.target.value);
      const keep = new Set([...form.querySelectorAll('[name="sec"]:checked')].flatMap((x) => (sectorByID(x.value) || {}).entityTypes || []));
      for (const k of (sc ? sc.entityTypes : [])) form.querySelectorAll(`.entgroup[data-jur="${sc.jurisdiction}"] [name="ent"][value="${k}"]`).forEach((x) => { x.checked = e.target.checked || keep.has(k); });
    }
    if (e.target.name === 'ent') form.querySelectorAll(`[name="ent"][value="${e.target.value}"]`).forEach((x) => { x.checked = e.target.checked; });
    if (e.target.name === 'uc') { const row = e.target.closest('.ucrow'); row.classList.toggle('on', e.target.checked); row.querySelector('select').disabled = !e.target.checked; }
    scope();
  });
  form.matterLabel.addEventListener('input', scope);
  scope();
  document.getElementById('build').addEventListener('click', () => { current(); out().scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (!EMBED) document.getElementById('print').addEventListener('click', () => { current(); window.print(); });
  document.getElementById('export').addEventListener('click', async () => {
    current();
    if (EMBED) {
      const text = JSON.stringify(brief, null, 2);
      try { await navigator.clipboard.writeText(text); document.getElementById('export').textContent = 'Copied brief as JSON'; }
      catch { const out = document.getElementById('out'); out.insertAdjacentHTML('beforeend', `<textarea class="text" rows="12" readonly>${esc(text)}</textarea>`); out.lastElementChild.select(); }
      return;
    }
    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `matter-brief-${(brief.matterLabel || 'matter').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(`Downloaded ${a.download}`);
  });
  document.getElementById('save').addEventListener('click', () => {
    const b = current();
    const r = saveToPortfolio(portfolio, read(), b, new Date().toISOString());
    if (r.error) { status(r.error); document.getElementById('ml').focus(); return; }
    savePortfolio(r.portfolio);
    renderBrief();
    show(b);
    status(`${r.replaced ? 'Updated' : 'Saved'} “${b.matterLabel}” in the client portfolio`);
  });
  // Opening a client restores its choices in the form and shows its brief, rebuilt from today's records.
  main.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => {
    const x = portfolio[Number(el.dataset.open)]; if (!x) return;
    store.set('atlas.briefDraft', x.draft);
    renderBrief();
    document.getElementById('build').click();
    status(`Opened “${x.label}”, saved ${fmtDate(x.savedAt)}. The brief is rebuilt from the current records.`);
  }));
  // Delete asks for a second click on the same button.
  main.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', () => {
    const x = portfolio[Number(el.dataset.del)]; if (!x) return;
    if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Delete, sure?'; return; }
    savePortfolio(removeFromPortfolio(portfolio, x.label));
    renderBrief();
    status(`Deleted “${x.label}” from this browser`);
  }));
  if (!EMBED) {
    const ex = document.getElementById('pfExport');
    if (ex) ex.addEventListener('click', () => {
      const file = exportPortfolio(portfolio, new Date().toISOString());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
      a.download = `atlas-portfolio-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status(`Downloaded ${a.download}: ${portfolio.length} client${portfolio.length === 1 ? '' : 's'}`);
    });
    document.getElementById('pfImport').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const r = importPortfolio(portfolio, await f.text());
      if (r.error) { status(r.error); return; }
      savePortfolio(r.portfolio);
      renderBrief();
      const c = r.counts;
      status(`Imported: ${c.added} added, ${c.updated} updated${c.keptNewer ? `, ${c.keptNewer} already up to date here` : ''}${c.skipped ? `, ${c.skipped} skipped (no label)` : ''}.`);
    });
  }
}

function renderDevelopers() {
  setNav('developers');
  const origin = location.origin;
  main.innerHTML = `<div class="opening"><div class="eyebrow">For developers</div><h1>API and MCP</h1>
    <p class="lede">The same records are served to the web app, to firms' knowledge systems through the REST API, and to AI assistants through the MCP server. Every response carries the source link, tier, last-verified date and a provenance reference, so anything that quotes a record can cite it.</p></div>
    <h2>REST API</h2>
    <div class="scroll"><table><thead><tr><th>Call</th><th>Returns</th></tr></thead><tbody>
      <tr><td><code>GET /api/v1/obligations?jurisdiction=AU&amp;tier=binding&amp;useCase=UC7</code></td><td>Obligations, filtered by jurisdiction, tier, use case, entity type, role, status or text</td></tr>
      <tr><td><code>GET /api/v1/obligations/{id}</code></td><td>One record, with tier basis, key dates and provenance reference</td></tr>
      <tr><td><code>GET /api/v1/instruments</code></td><td>Instruments, with their tiers and records</td></tr>
      <tr><td><code>GET /api/v1/changes?since=2026-10-01</code></td><td>Instrument changes and record updates since a date</td></tr>
      <tr><td><code>GET /api/v1/provenance/{ref}</code></td><td>The provenance trail for a record, with each ledger entry's hash checked</td></tr>
      <tr><td><code>GET /api/v1/use-cases</code>, <code>/jurisdictions</code>, <code>/organizations</code>, <code>/policy</code></td><td>Reference data and the published dataset policy</td></tr>
    </tbody></table></div>
    <p>The description is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>. Send a registered firm's key in the <code>x-api-key</code> header for higher limits. <a href="${href('firm')}">Register your firm</a> to get one.</p>
    <h2>MCP server</h2>
    <p>Tools: <code>find_obligations</code>, <code>get_obligation</code>, <code>list_changes</code>, <code>explain_provenance</code>. Their descriptions tell assistants that responses are records, not legal conclusions, and how to cite them.</p>
    <pre class="code">{
  "mcpServers": {
    "ai-obligations-atlas": {
      "type": "http",
      "url": "${esc(origin)}/mcp",
      "headers": { "x-api-key": "&lt;your firm key&gt;" }
    }
  }
}</pre>
    <h2>How an obligation becomes a check</h2>
    <p class="lede">A fictional example of how a governed AI system is checked against an obligation, using the open Triodian Metamodel.</p>
    <ol class="chain">
      <li><h3>Obligation</h3><p>A regulator's guidance expects human involvement in high-risk AI decisions about customers. Recorded as an Obligation, tier Expected, mapped to UC3.</p></li>
      <li><h3>Semantic constraint</h3><p>A fictional insurer writes a constraint: its claims triage assistant must not decline a claim without referral to a person. The constraint cites the obligation in its mappings.</p></li>
      <li><h3>Verdict</h3><p>Each output is checked against the constraint and given a verdict, such as allowed, escalated or blocked, with a trace back to the constraint and the obligation.</p></li>
    </ol>
    <h2>Open data model</h2>
    <p>Records are written against the open <a href="https://github.com/Triodian/Triodian_Metamodel">Triodian Metamodel</a>: Obligation, External Organization, Use Case, Trigger, Data Flow, Compliance and Public Reporting. They are governed through the published Reasoning Fabric connector, under the <a href="${href('policy')}">AI Obligations Atlas dataset policy</a>. That policy sets source precedence, which changes wait for a named reviewer, freshness thresholds and the language rules.</p>
    <p class="muted">Dataset generated ${esc(fmtDate(data.info.generatedAt))}; Metamodel ${esc(data.info.metamodelVersion)}; ledger head ${esc(data.info.ledgerHead ? `#${data.info.ledgerHead.sequence}, ${data.info.ledgerHead.hash.slice(0, 16)}…` : 'none')}.</p>`;
}

function setupDrawer() {
  const btn = document.getElementById('menubtn');
  const drawer = document.getElementById('drawer');
  const bg = document.getElementById('drawer-bg');
  const set = (open) => {
    drawer.hidden = !open; bg.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open) drawer.querySelector('a.item, button').focus(); else btn.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => set(drawer.hidden));
  bg.addEventListener('click', () => set(false));
  document.getElementById('menuclose').addEventListener('click', () => set(false));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a.item[data-nav]')) { drawer.hidden = true; bg.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) set(false); });
}

// ------------------------------------------------------------ dataset policy
const RANK_KIND = {
  officialText: 'Official text', regulatorPublication: 'Regulator publication', standardsBodyPublication: 'Standards body publication',
  commentary: 'Commentary', news: 'News',
};
const CHANGE_LABEL = {
  addLead: 'a new lead', addCommentaryLink: 'a commentary link', reverify: 're-checking a record', create: 'a new record', statusChange: 'a status change',
  dateChange: 'a date change', tierChange: 'a tier change', supersede: 'superseding a record', remove: 'removing a record', update: 'any other change',
};
const DATE_SOURCE = {
  'officialText.commencementProvision': 'The commencement provision in the official text',
  'officialText.registerCompilation': 'The official register’s compilation',
  regulatorPublication: 'A regulator publication',
  standardsBodyPublication: 'A standards body publication',
};
const SCOPE_LABEL = { record: 'records', response: 'API and MCP responses', matterBrief: 'matter briefs' };
const days = (iso) => { const m = /^P(\d+)D$/.exec(iso || ''); return m ? `${m[1]} days` : iso; };
const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const listText = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

function renderPolicy() {
  setNav('policy');
  const p = data.policy || {};
  const precedence = (p.sourcePrecedence || []).slice().sort((a, b) => a.rank - b.rank);
  const canSet = (r) => (!r.canSetStatusOrDate ? 'No'
    : r.onlyForTiers ? `Only for ${listText(r.onlyForTiers.map((t) => tierLabel(t)))} records` : 'Yes');
  const rules = p.autonomyRules || [];
  const auto = rules.filter((r) => !r.approverRequired);
  const review = rules.filter((r) => r.approverRequired);
  const ruleRow = (r) => `<tr><td>${esc(sentence(listText((r.changeTypes || []).map((c) => CHANGE_LABEL[c] || c))))}${r.whenTier ? `<div class="small soft">${esc(r.whenTier.map(tierLabel).join(', '))} records</div>` : ''}${r.whenMaxSourceRank ? `<div class="small soft">From a rank ${esc(r.whenMaxSourceRank)} source or better</div>` : ''}</td><td>${esc(r.description || '')}</td></tr>`;
  const bands = Object.entries(p.confidenceBands || {}).sort((a, b) => b[1] - a[1]);
  main.innerHTML = `<div class="opening"><div class="eyebrow">Dataset policy</div><h1>How records are sourced and published</h1>
    <p class="lede">The rules the Reasoning Fabric applies to every Atlas record: which sources can set a status or date, what waits for a named reviewer, when a record goes stale, and the language records may use.</p>
    <p class="small soft">Version ${esc(p.version || '')}${p.effectiveFrom ? `, in effect from ${esc(fmtDate(p.effectiveFrom))}` : ''}${p.methodOwner ? `. Owned by the ${esc(p.methodOwner.replace(/^Triodian /, 'Triodian '))}` : ''}. ${EMBED ? '' : 'Machine-readable: <a href="/api/v1/policy">/api/v1/policy</a>.'}</p></div>

    <div class="policy">
    <section class="card"><h2 class="sh">Source precedence</h2>
      <p class="small soft">When sources disagree, the higher-ranked source wins. Only some sources can set a record’s status or dates.</p>
      <div class="tw"><table><thead><tr><th>Rank</th><th>Source</th><th>Can set a status or date</th></tr></thead><tbody>
      ${precedence.map((r) => `<tr><td>${esc(r.rank)}</td><td>${esc(RANK_KIND[r.basis] || r.basis)}</td><td>${esc(canSet(r))}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small soft" style="margin-top:10px">A source that cannot set a status or date on its own becomes a lead in the change log until a reviewer checks it against the official text.</p>
    </section>

    <section class="card"><h2 class="sh">What waits for a named reviewer</h2>
      <p class="small soft">Nothing that sets a status, a date or a tier is published without a named reviewer, whose name is shown on the record.</p>
      <div class="tw"><table><thead><tr><th>Change</th><th>What happens</th></tr></thead><tbody>
      ${review.map(ruleRow).join('')}
      </tbody></table></div>
      ${auto.length ? `<h3 class="sh" style="margin-top:16px">Published without review</h3><div class="tw"><table><thead><tr><th>Change</th><th>What happens</th></tr></thead><tbody>${auto.map(ruleRow).join('')}</tbody></table></div>` : ''}
    </section>

    <div class="policy-pair">
    <section class="card"><h2 class="sh">Which date is used</h2>
      <p class="small soft">When sources give different dates, the first available in this order is used.</p>
      <ol class="plain">${(p.datePrecedence || []).map((d) => `<li>${esc(DATE_SOURCE[d] || d)}</li>`).join('')}</ol>
    </section>

    <section class="card"><h2 class="sh">Freshness</h2>
      <p class="small soft">A record not re-checked within its tier’s threshold is marked past its freshness threshold.</p>
      <dl class="kv">${(p.freshness || []).map((f) => `<dt>${tierBadge(f.sourceTier)}</dt><dd>${esc(days(f.threshold))}</dd>`).join('')}</dl>
      ${bands.length ? `<h3 class="sh" style="margin-top:16px">Confidence</h3><p class="small soft">Each record’s confidence combines source reliability, recency and corroboration, from 0 to 1.</p>
        <dl class="kv">${bands.map(([k, v]) => `<dt>${esc(sentence(k))}</dt><dd>${esc(Number(v).toFixed(2))} or more</dd>`).join('')}<dt>Low</dt><dd>Below ${esc(Number(Math.min(...bands.map(([, v]) => v))).toFixed(2))}</dd></dl>` : ''}
    </section>
    </div>

    <section class="card"><h2 class="sh">Language rules</h2>
      <p class="small soft">Every record, API and MCP response and matter brief is checked against these rules before it is shown. A response that fails is withheld.</p>
      <ul class="rules">${(p.languageRules || []).map((r) => `<li>${esc(r.description)}<div class="small soft">Checked in ${esc(listText((r.appliesTo || []).map((a) => SCOPE_LABEL[a] || a)).replace(' or ', ' and '))}</div></li>`).join('')}</ul>
    </section>
    </div>`;
}

// ------------------------------------------------------------ firm registration and Bring in Triodian
// The browser keeps its registration ID and an access secret; the Atlas passes the
// registration to Triodian's review console, where a named reviewer approves firms.
const FIRM_KEY = 'atlas.firm';
const firmState = { checked: false, apiKey: null };
const getFirm = () => store.get(FIRM_KEY, null);
const setFirm = (f) => store.set(FIRM_KEY, f);
const newSecret = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
async function firmPost(path, body) {
  const r = await fetch(`/api/v1/firms/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: out };
}
async function refreshFirm() {
  const f = getFirm();
  if (!f || firmState.checked) return f;
  const r = await firmPost('status', { registrationID: f.registrationID, accessSecret: f.accessSecret });
  firmState.checked = true;
  if (r.ok) {
    Object.assign(f, { status: r.body.status, firm: r.body.firm || f.firm, name: r.body.name || f.name });
    if (r.body.apiKey) firmState.apiKey = r.body.apiKey; // shown once
    setFirm(f);
  } else if (r.status === 404) {
    setFirm(null);
    return null;
  }
  return f;
}

/**
 * The firm panel: register, wait for approval, collect the API key once, and,
 * on a matter brief, bring in Triodian with the brief's scope if the lawyer chooses.
 */
async function renderFirmPanel(el, { brief = null } = {}) {
  if (!el) return;
  if (EMBED) { el.innerHTML = '<p class="small soft">Firm registration and requests to Triodian are available on the Atlas site.</p>'; return; }
  el.innerHTML = '<p class="small soft">Checking your firm registration…</p>';
  let f;
  try { f = await refreshFirm(); } catch { f = getFirm(); }
  const heading = brief ? '<h2>Bring in Triodian</h2>' : '';
  const keyBox = firmState.apiKey ? `<div class="keybox"><div class="sh">Your firm's API key</div>
      <div class="cite"><code id="apikey">${esc(firmState.apiKey)}</code><button class="copybtn" type="button" id="copykey">Copy</button></div>
      <p class="small soft">Shown once. Keep it with your firm's other credentials and send it in the <code>x-api-key</code> header. If it is lost, ask Triodian to reissue it.</p></div>` : '';

  if (!f || ['rejected', 'revoked'].includes(f.status)) {
    const was = f && f.status;
    el.innerHTML = `${heading}<div class="firmcard">
      ${was ? `<p class="small">The registration for ${esc(f.firm)} was ${was === 'revoked' ? 'revoked' : 'not approved'}. You can register again.</p>` : ''}
      <p>${brief ? 'Registered firms can ask Triodian to help with this matter: the board’s direction on AI, an AI risk appetite for the board, an assessment of a particular AI use, or a review of confidential information exposure.' : 'Register your firm to ask Triodian for help with a matter and to get an API key for the REST API and MCP server.'} Triodian approves each firm.</p>
      <form id="regform" class="regform">
        <label class="field">Your name<input class="text" name="name" autocomplete="name" required maxlength="120"></label>
        <label class="field">Work email<input class="text" name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label class="field">Firm<input class="text" name="firm" autocomplete="organization" required maxlength="160"></label>
        <label class="field"><span>Role <span class="soft" style="font-weight:400">(optional)</span></span><input class="text" name="role" maxlength="120" placeholder="e.g. Partner, technology and AI"></label>
        <div class="actions" style="margin:4px 0 0"><button class="btn" type="submit">Register your firm</button></div>
        <p class="small soft" id="regmsg" aria-live="polite" style="margin:0">Your name, email and firm go to Triodian's review console. Matter details do not.</p>
      </form></div>`;
    el.querySelector('#regform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = el.querySelector('#regmsg');
      const btn = e.target.querySelector('button');
      btn.disabled = true; msg.textContent = 'Sending…';
      const accessSecret = newSecret();
      const body = { name: fd.get('name'), email: fd.get('email'), firm: fd.get('firm'), role: fd.get('role') || undefined, jurisdictions: brief ? brief.scope.jurisdictions : [], accessSecret };
      const r = await firmPost('register', body);
      btn.disabled = false;
      if (!r.ok) { msg.textContent = [401, 403, 502, 503].includes(r.status) ? 'Registration is not available yet. Please try again later.' : (r.body.title || 'The registration could not be sent. Check the details and try again.'); return; }
      setFirm({ registrationID: r.body.registrationID, accessSecret, status: r.body.status, firm: body.firm, name: body.name, email: body.email });
      firmState.checked = true;
      renderFirmPanel(el, { brief });
    });
    return;
  }

  if (f.status === 'pending') {
    el.innerHTML = `${heading}<div class="firmcard">
      <p><span class="badge pending">Waiting for approval</span></p>
      <p>Triodian has your registration for <strong>${esc(f.firm)}</strong>. Once it is approved you can bring in Triodian from any matter brief and collect your firm's API key here.</p>
      <div class="actions" style="margin:0"><button class="btn secondary" type="button" id="recheck">Check again</button><button class="linkish small" type="button" id="forget">Not you? Use a different registration</button></div></div>`;
    el.querySelector('#recheck').addEventListener('click', () => { firmState.checked = false; renderFirmPanel(el, { brief }); });
    el.querySelector('#forget').addEventListener('click', () => { setFirm(null); firmState.checked = false; renderFirmPanel(el, { brief }); });
    return;
  }

  // approved
  const scopeList = brief ? [
    brief.scope.jurisdictions.length ? `Jurisdictions: ${brief.scope.jurisdictions.map(jurName).join(', ')}` : null,
    brief.scope.entityTypes.length ? `Entities: ${brief.scope.entityTypes.map((e) => ENTITY_TYPES[e] || e).join(', ')}` : null,
    brief.scope.useCases.length ? `Use cases: ${brief.scope.useCases.map((u) => `${u.useCaseID}${u.consequenceLevel ? ` (${u.consequenceLevel.toUpperCase()})` : ''}`).join(', ')}` : null,
    brief.engagementsThatFit.length ? `Engagements: ${brief.engagementsThatFit.map((x) => x.name).join(', ')}` : null,
  ].filter(Boolean) : [];
  el.innerHTML = `${heading}<div class="firmcard">
    <p class="small soft" style="margin-bottom:8px"><span class="badge b-green">Approved</span> ${esc(f.name || '')}, ${esc(f.firm)}</p>
    ${keyBox}
    ${brief ? `<form id="contactform" class="regform">
      <label class="field">What would you like Triodian to help with?<textarea class="text" name="message" rows="4" maxlength="2000" placeholder="e.g. The client's board wants an AI risk appetite before its next meeting."></textarea></label>
      <label class="field"><span>Best way to reach you <span class="soft" style="font-weight:400">(optional)</span></span><input class="text" name="preferredContact" maxlength="200" placeholder="e.g. phone number, or times that suit"></label>
      ${scopeList.length ? `<label class="check"><input type="checkbox" name="share"> <span>Share this brief's scope with Triodian: ${esc(scopeList.join('; '))}. The matter label and anything else in the brief stay in this browser.</span></label>` : ''}
      <div class="actions" style="margin:4px 0 0"><button class="btn" type="submit">Send to Triodian</button></div>
      <p class="small soft" id="contactmsg" aria-live="polite" style="margin:0">Triodian replies to ${esc(f.email || 'your registered email')}.</p>
    </form>` : `<p>From any <a href="${href('brief')}">matter brief</a> you can now bring in Triodian.</p>`}
  </div>`;
  const copy = el.querySelector('#copykey');
  if (copy) copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(firmState.apiKey); copy.textContent = 'Copied'; } catch { /* select manually */ } });
  const form = el.querySelector('#contactform');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const msg = el.querySelector('#contactmsg');
    const btn = form.querySelector('button');
    if (!String(fd.get('message') || '').trim() && !fd.get('share')) { msg.textContent = 'Add a note, or share the brief’s scope, so Triodian knows what the matter needs.'; return; }
    btn.disabled = true; msg.textContent = 'Sending…';
    const scope = fd.get('share') ? {
      jurisdictions: brief.scope.jurisdictions, entityTypes: brief.scope.entityTypes,
      useCases: brief.scope.useCases.map((u) => ({ useCaseID: u.useCaseID, ...(u.consequenceLevel ? { consequenceLevel: u.consequenceLevel } : {}) })),
      engagements: brief.engagementsThatFit.map((x) => x.assessmentType),
    } : undefined;
    const r = await firmPost('contact', { registrationID: f.registrationID, accessSecret: f.accessSecret, message: fd.get('message') || undefined, preferredContact: fd.get('preferredContact') || undefined, scope });
    btn.disabled = false;
    if (!r.ok) { msg.textContent = r.body.title || 'The request could not be sent. Please try again.'; return; }
    form.innerHTML = `<p><span class="badge b-green">Sent</span> Triodian has your request and will reply to ${esc(f.email || 'your registered email')}.</p>`;
  });
}

function renderFirm() {
  setNav('firm');
  main.innerHTML = `<div class="opening"><div class="eyebrow">Your firm</div><h1>Register your firm</h1>
    <p class="lede">Registered firms can bring in Triodian from any matter brief, and get an API key for the REST API and MCP server.</p></div>
    <div class="card" style="max-width:720px" id="firmpanel"></div>`;
  renderFirmPanel(document.getElementById('firmpanel'));
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg] = parseRoute();
  window.scrollTo(0, 0);
  if (page === 'obligation') renderObligation(arg);
  else if (page === 'use-cases') renderUseCases();
  else if (page === 'changes') renderChanges();
  else if (page === 'brief') renderBrief();
  else if (page === 'developers') renderDevelopers();
  else if (page === 'firm') renderFirm();
  else if (page === 'policy') renderPolicy();
  else renderRegister();
  if (h) main.focus({ preventScroll: true });
}

async function start() {
  try {
    if (EMBED) data = EMBED.dataset();
    else {
      const r = await fetch('/api/v1/dataset');
      if (!r.ok) throw new Error(String(r.status));
      data = await r.json();
    }
  } catch (e) {
    main.innerHTML = `<h1>The register could not be loaded</h1><p>The dataset request failed (${esc(e.message)}). Check your connection and reload the page.</p>`;
    return;
  }
  // Start where this deployment is set (DEFAULT_JURISDICTION, DEFAULT_SECTOR) unless this browser chose otherwise.
  const saved = store.get('atlas.filters', null);
  if (saved) Object.assign(state, saved);
  else Object.assign(state, { jurisdiction: (data.defaults && data.defaults.jurisdiction) || 'AU', sector: (data.defaults && data.defaults.sector) || '' });
  document.getElementById('standing-rule').textContent = STANDING_RULE;
  const jurs = data.jurisdictions.filter((j) => j.available).length;
  document.getElementById('dataset-line').textContent = `Triodian Metamodel ${data.info.metamodelVersion} · data ${fmtDate(data.info.generatedAt)}`;
  document.getElementById('statusline').textContent = `${data.info.counts.obligations} records · ${jurs} jurisdictions`;
  const chip = document.getElementById('datachip');
  chip.hidden = false;
  chip.className = `checkcount ${data.info.preview ? 'b-ochre' : 'b-green'}`;
  chip.textContent = data.info.preview ? 'Preview data' : 'Published records';
  chip.title = data.info.preview ? 'Includes records still waiting for review' : 'Records approved by a named reviewer';

  if (data.info.preview) {
    const p = document.getElementById('preview');
    p.hidden = false;
    p.textContent = 'Preview. Records marked pending review come from the seed research of 27 October 2026 and have not yet been approved by a Triodian reviewer. Do not rely on them in a matter.';
    document.querySelectorAll('[data-app]').forEach((a) => { a.href = `https://${a.dataset.app}-test.triodian.com/?suite=1`; });
  }
  setupDrawer();
  window.addEventListener('hashchange', route);
  route();
}

start();
