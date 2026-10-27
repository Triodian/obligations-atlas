/**
 * AI Obligations Atlas web app. The whole public dataset is downloaded once;
 * filtering and matter briefs run here in the browser, so nothing about a
 * lawyer's matter is sent to the server.
 */
import { buildMatterBrief, ENTITY_TYPES, ROLES, TIERS, STATUS, JURISDICTIONS, ASSESSMENTS, STANDING_RULE } from '/core/atlas.js';

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
const state = { tier: '', jurisdiction: 'AU', entityType: '', useCase: '', q: '', current: true };

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
const allUseCases = (ids) => ucIDs().length > 1 && ids.length >= ucIDs().length;
const ucShort = (ids) => (allUseCases(ids) ? `All ${ids.length} use cases` : ids.join(', '));
const issuer = (o) => (o.regulator && o.regulator.acronym) || '';
const whereLine = (o) => [issuer(o), o.instrument, o.citation].filter(Boolean).map(esc).join(' · ');

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.setAttribute('href', href(a.dataset.nav === 'register' ? '' : a.dataset.nav)));
  document.querySelectorAll('.wordmark, .brand').forEach((a) => a.setAttribute('href', href('')));
  document.querySelectorAll('.steps [data-nav], .drawer [data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

function filtered() {
  return data.obligations.filter((o) => (!state.jurisdiction || o.jurisdiction === state.jurisdiction || o.jurisdiction === 'INT')
    && (!state.tier || o.sourceTier === state.tier)
    && (!state.entityType || o.entityTypes.includes(state.entityType) || o.entityTypes.includes('anyOrganization'))
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
      <div class="meta"><span>${esc(jurName(o.jurisdiction))}</span><span>${esc(o.statusLabel)}</span><span title="${esc(o.useCaseIDs.map((u) => [u, ucTitle(u)].filter(Boolean).join(' ')).join('; '))}">${esc(ucShort(o.useCaseIDs))}</span>${basis ? `<span>${esc(basis)}</span>` : ''}<span>Verified ${esc(fmtDate(o.lastVerified))}</span></div>
    </div></li>`;
}

function renderRegister() {
  setNav('register');
  const jurOpts = [['', 'All jurisdictions'], ...data.jurisdictions.filter((j) => j.available && j.code !== 'INT').map((j) => [j.code, j.name])];
  const entOpts = [['', 'Any entity'], ...Object.entries(ENTITY_TYPES).filter(([k]) => !['anyOrganization', 'other'].includes(k) && data.obligations.some((o) => o.entityTypes.includes(k))).map(([k, v]) => [k, v])];
  const ucOpts = [['', 'Any use case'], ...ucIDs().map((u) => [u, [u, ucTitle(u)].filter(Boolean).join(' ')])];
  const tierOpts = [['', 'All tiers'], ...Object.entries(TIERS).map(([k, t]) => [k, t.label])];
  const rows = filtered();
  main.innerHTML = `
    <div class="opening">
      <div class="eyebrow">Register</div>
      <h1>AI governance obligations</h1>
    </div>
    <form class="filters" id="query" role="search" aria-label="Find obligations">
      <label>Tier<select name="tier">${options(tierOpts, state.tier)}</select></label>
      <label>Jurisdiction<select name="jurisdiction">${options(jurOpts, state.jurisdiction)}</select></label>
      <label>Entity<select name="entityType">${options(entOpts, state.entityType)}</select></label>
      <label>Use case<select name="useCase">${options(ucOpts, state.useCase)}</select></label>
      <label class="grow">Search<input name="q" type="search" placeholder="Title, instrument or text" value="${esc(state.q)}"></label>
    </form>
    <div class="resultline">
      <span aria-live="polite"><span class="count">${rows.length} record${rows.length === 1 ? '' : 's'}</span>${state.jurisdiction ? ', including international standards' : ''}</span>
      <ul class="key" aria-label="Source tiers">${Object.entries(TIERS).map(([k]) => `<li>${tierBadge(k)}<span>${esc(TIER_SHORT[k] || '')}</span></li>`).join('')}</ul>
      <label><input type="checkbox" id="current" ${state.current ? 'checked' : ''}> Hide superseded and withdrawn</label>
    </div>
    ${rows.length ? `<ol class="register">${rows.map(entryHTML).join('')}</ol>` : '<p class="empty">No records match. Widen the jurisdiction, entity or use case above.</p>'}`;
  const form = document.getElementById('query');
  form.addEventListener('change', (e) => { if (e.target.name === 'q') return; state[e.target.name] = e.target.value; store.set('atlas.filters', state); renderRegister(); document.querySelector(`[name="${e.target.name}"]`).focus(); });
  let t;
  form.q.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderRegister(); const i = document.querySelector('[name="q"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('current').addEventListener('change', (e) => { state.current = e.target.checked; store.set('atlas.filters', state); renderRegister(); });
}

async function renderObligation(id) {
  setNav('register');
  const o = data.obligations.find((x) => x.obligationID === id);
  if (!o) { main.innerHTML = `<a class="back" href="${href('register')}">Register</a><h1>No record ${esc(id)}</h1>`; return; }
  const ents = o.entityTypes.map((e) => ENTITY_TYPES[e] || e).join(', ');
  const ucs = allUseCases(o.useCaseIDs)
    ? `All ${o.useCaseIDs.length} use cases`
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
    && (related.entityType ? (x.entityTypes.includes(related.entityType) || x.entityTypes.includes('anyOrganization')) : true));
  const max = 8;
  box.innerHTML = `<h2 class="sh" id="related-h">Related records in ${esc(jurName(o.jurisdiction))}</h2>
    <form class="filters compact" id="relform">
      ${sel('useCase', 'Use case', o.useCaseIDs.map((u) => [u, [u, ucTitle(u)].filter(Boolean).join(' ')]), `${anyOf(o.useCaseIDs)} use cases`)}
      ${sel('entityType', 'Entity', ents.map((e) => [e, ENTITY_TYPES[e] || e]), `${anyOf(ents)} entities`)}
      <label>Tier<select name="tier">${options([['', 'All tiers'], ...Object.entries(TIERS).map(([k, t]) => [k, t.label])], related.tier)}</select></label>
    </form>
    <p class="small soft" aria-live="polite">${rows.length} other record${rows.length === 1 ? '' : 's'}${related.useCase || related.entityType || related.tier ? ' match' : ' share a use case with this one'}.</p>
    ${rows.length ? `<ul class="rel">${rows.slice(0, max).map((x) => `<li>${tierBadge(x.sourceTier)}<span><a href="${href('obligation', x.obligationID)}">${esc(x.title)}</a><span class="where">${whereLine(x)}</span></span></li>`).join('')}</ul>` : ''}
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

function renderChanges() {
  setNav('changes');
  const kinds = { instrumentChange: 'Instrument change', lead: 'Lead, unverified', recordPublished: 'Record published', recordUpdated: 'Record updated', recordSuperseded: 'Record superseded' };
  main.innerHTML = `<div class="opening"><div class="eyebrow">Changes</div><h1>New and amended sources</h1>
    <p class="lede">New and amended instruments, commencements and withdrawals, newest first. A lead comes from a source that cannot set a status or date on its own; it points to an official source still to be checked.</p></div>
    <ol class="register">${data.changes.map((c) => `<li class="entry"><div class="row">
      <h3 class="title">${esc(c.title)}</h3>
      <div class="tags"><span class="badge status">${esc(kinds[c.kind] || c.kind)}</span>${c.publicationStatus === 'pendingReview' ? '<span class="badge pending">Pending review</span>' : ''}</div>
      <div class="where"><time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time>${c.jurisdiction ? ` · ${esc(jurName(c.jurisdiction))}` : ''}</div>
      ${c.summary ? `<p class="gist">${esc(c.summary)}</p>` : ''}
      <div class="meta">${c.effectiveDate ? `<span>Effective ${esc(fmtDate(c.effectiveDate))}</span>` : ''}${c.sourceURL ? `<span><a href="${esc(c.sourceURL)}" target="_blank" rel="noopener">Source</a> (rank ${esc(c.sourceRank)})</span>` : ''}${(c.affects || []).filter((a) => data.obligations.some((o) => o.obligationID === a)).slice(0, 6).map((a) => `<span><a href="${href('obligation', a)}">${esc(a)}</a></span>`).join('')}</div>
    </div></li>`).join('')}</ol>`;
}

// ------------------------------------------------------------ matter brief
function briefHTML(b) {
  const sect = (tier) => {
    const items = b.obligationsByTier[tier] || [];
    return `<h3>${tierBadge(tier)} ${items.length} record${items.length === 1 ? '' : 's'}</h3>
      ${items.length ? `<ol>${items.map((o) => `<li><strong>${esc(o.instrument)}, ${esc(o.citation)}</strong>: ${esc(o.title)} <span class="muted">(${esc(o.jurisdiction)}; ${esc(STATUS[o.status] || o.status)}; verified ${esc(fmtDate(o.lastVerified))}; <a href="${esc(o.sourceURL)}">source</a>; record ${esc(o.governedRecordID)}${o.publicationStatus === 'pendingReview' ? '; pending review' : ''})</span></li>`).join('')}</ol>` : '<p class="muted">None in scope.</p>'}`;
  };
  return `<div class="brief" id="brief-out">
    <h2>${esc(b.matterLabel)}</h2>
    <p class="muted">Matter brief, ${esc(fmtDate(b.generatedAt))}. Scope: ${esc(b.scope.jurisdictions.map(jurName).join(', ') || 'all jurisdictions')}; ${esc(b.scope.entityTypes.map((e) => ENTITY_TYPES[e]).join(', ') || 'any entity')}; ${esc(b.scope.useCases.map((u) => `${u.useCaseID}${u.consequenceLevel ? ` (${u.consequenceLevel.toUpperCase()})` : ''}`).join(', ') || 'any use case')}.</p>
    <h2>Obligations by tier</h2>${sect('binding')}${sect('expected')}${sect('anticipated')}
    <h2>Questions for counsel to determine</h2><ol>${b.questionsForCounsel.map((q) => `<li>${esc(q.question)}</li>`).join('')}</ol>
    <h2>Engagements that fit</h2>
    ${b.engagementsThatFit.length ? `<ul>${b.engagementsThatFit.map((e) => `<li><strong>${esc(e.name)}</strong>: ${esc(e.purpose)}. <span class="muted">From ${esc(e.useCaseIDs.join(', '))}.</span></li>`).join('')}</ul><p class="notice">Counsel decides whether to engage, and on what terms.</p>` : '<p class="muted">Select use cases to see which engagements fit.</p>'}
    ${b.notices.map((n) => `<p class="notice">${esc(n)}</p>`).join('')}
  </div>`;
}

function renderBrief() {
  setNav('brief');
  const saved = store.get('atlas.briefs', []);
  const draft = store.get('atlas.briefDraft', { matterLabel: '', jurisdictions: ['AU'], entityTypes: [], useCaseIDs: [], consequence: {} });
  const ents = Object.entries(ENTITY_TYPES).filter(([k]) => !['anyOrganization', 'other'].includes(k) && data.obligations.some((o) => o.entityTypes.includes(k)));
  main.innerHTML = `<div class="opening screen-only"><div class="eyebrow">Matter brief</div><h1>Matter brief</h1>
    <p class="lede">Pick the client's jurisdictions, entity type and AI use cases. The brief lists the obligations in scope by tier, the questions counsel will need to determine, and the engagements that fit. It is built and kept in this browser; nothing you enter here is sent to Triodian.</p></div>
    <form class="brief-form" id="bf">
      <fieldset><legend>Matter</legend>
        <label for="ml" class="muted">Your label for the matter (stays in this browser)</label>
        <input id="ml" class="text" name="matterLabel" value="${esc(draft.matterLabel)}" placeholder="e.g. Insurer AI claims triage">
        <legend style="margin-top:1.2rem">Jurisdictions</legend>
        ${data.jurisdictions.filter((j) => j.available && j.code !== 'INT').map((j) => `<label class="check"><input type="checkbox" name="jur" value="${esc(j.code)}" ${draft.jurisdictions.includes(j.code) ? 'checked' : ''}> ${esc(j.name)}</label>`).join('')}
        <p class="muted">International standards are included with any jurisdiction.</p>
      </fieldset>
      <fieldset><legend>Entity type</legend>
        ${ents.map(([k, v]) => `<label class="check"><input type="checkbox" name="ent" value="${esc(k)}" ${draft.entityTypes.includes(k) ? 'checked' : ''}> ${esc(v)}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Use cases, and consequence for this client</legend>
        ${data.useCases.map((u) => `<div class="ucrow"><label class="check"><input type="checkbox" name="uc" value="${esc(u.useCaseID)}" ${draft.useCaseIDs.includes(u.useCaseID) ? 'checked' : ''}> <span><strong>${esc(u.useCaseID)}</strong> ${esc(u.title)}</span></label>
          <select class="small" name="c-${esc(u.useCaseID)}" aria-label="Consequence for ${esc(u.useCaseID)}">${options([['', 'C not set'], ['c1', 'C1'], ['c2', 'C2'], ['c3', 'C3'], ['c4', 'C4'], ['c5', 'C5']], draft.consequence[u.useCaseID] || '')}</select></div>`).join('')}
      </fieldset>
    </form>
    <div class="actions">
      <button class="btn" id="build" type="button">Build brief</button>
      <button class="btn secondary" id="export" type="button" disabled>${EMBED ? 'Copy brief as JSON' : 'Export for an assessment app'}</button>
      ${EMBED ? '' : '<button class="btn secondary" id="print" type="button" disabled>Print</button>'}
      <button class="btn secondary" id="save" type="button" disabled>Save in this browser</button>
    </div>
    <div id="out"></div>
    <div class="saved-wrap">${saved.length ? `<h2>Saved in this browser</h2><ul class="saved">${saved.map((s, i) => `<li><button class="linkish" data-open="${i}">${esc(s.matterLabel)}</button><span class="muted">${esc(fmtDate(s.generatedAt))}</span><button class="linkish" data-del="${i}">Delete</button></li>`).join('')}</ul>` : ''}</div>`;

  const form = document.getElementById('bf');
  let brief = null;
  const read = () => {
    const f = new FormData(form);
    const d = { matterLabel: f.get('matterLabel') || '', jurisdictions: f.getAll('jur'), entityTypes: f.getAll('ent'), useCaseIDs: f.getAll('uc'), consequence: {} };
    for (const u of data.useCases) { const c = f.get(`c-${u.useCaseID}`); if (c) d.consequence[u.useCaseID] = c; }
    store.set('atlas.briefDraft', d);
    return d;
  };
  const show = (b) => {
    brief = b;
    document.getElementById('out').innerHTML = briefHTML(b);
    ['export', 'print', 'save'].forEach((id) => { const b = document.getElementById(id); if (b) b.disabled = false; });
  };
  form.addEventListener('change', read);
  document.getElementById('build').addEventListener('click', () => show(buildMatterBrief(data, read())));
  if (!EMBED) document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('export').addEventListener('click', async () => {
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
  });
  document.getElementById('save').addEventListener('click', () => { store.set('atlas.briefs', [brief, ...saved].slice(0, 30)); renderBrief(); show(brief); });
  main.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => show(saved[Number(b.dataset.open)])));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { saved.splice(Number(b.dataset.del), 1); store.set('atlas.briefs', saved); renderBrief(); }));
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
    <p>The description is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>. Send a registered firm's key in the <code>x-api-key</code> header for higher limits.</p>
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
    <p>Records are written against the open <a href="https://github.com/Triodian/Triodian_Metamodel">Triodian Metamodel</a>: Obligation, External Organization, Use Case, Trigger, Data Flow, Compliance and Public Reporting. They are governed through the published Reasoning Fabric connector, under the <a href="/api/v1/policy">AI Obligations Atlas dataset policy</a>. That policy sets source precedence, which changes wait for a named reviewer, freshness thresholds and the language rules.</p>
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

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [page, arg] = parseRoute();
  window.scrollTo(0, 0);
  if (page === 'obligation') renderObligation(arg);
  else if (page === 'use-cases') renderUseCases();
  else if (page === 'changes') renderChanges();
  else if (page === 'brief') renderBrief();
  else if (page === 'developers') renderDevelopers();
  else renderRegister();
  if (h) main.focus({ preventScroll: true });
}

async function start() {
  Object.assign(state, store.get('atlas.filters', {}));
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
  document.getElementById('standing-rule').textContent = STANDING_RULE;
  const jurs = data.jurisdictions.filter((j) => j.available).length;
  document.getElementById('dataset-line').textContent = `Triodian Metamodel ${data.info.metamodelVersion} · data ${fmtDate(data.info.generatedAt)}`;
  document.getElementById('statusline').textContent = `${data.info.counts.obligations} records · ${jurs} jurisdictions`;
  const chip = document.getElementById('datachip');
  chip.hidden = false;
  chip.className = `checkcount ${data.info.preview ? 'b-ochre' : 'b-green'}`;
  chip.textContent = data.info.preview ? 'Preview data' : 'Published records';
  chip.title = data.info.preview ? 'Includes records still waiting for review' : 'Records approved by a named reviewer';
  if (EMBED) document.getElementById('policylink').remove();
  if (data.info.preview) {
    const p = document.getElementById('preview');
    p.hidden = false;
    p.textContent = 'Preview. Records marked pending review come from the seed research of 27 October 2026 and have not yet been approved by a Triodian reviewer. Do not rely on them in a matter.';
    document.querySelectorAll('[data-app]').forEach((a) => { a.href = `https://${a.dataset.app}-test.triodian.com/`; });
  }
  setupDrawer();
  window.addEventListener('hashchange', route);
  route();
}

start();
