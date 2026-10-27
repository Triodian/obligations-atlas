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
const ucTitle = (id) => (data.useCases.find((u) => u.useCaseID === id) || {}).title || id;
const tab = (tier) => `<span class="tab ${esc(tier)}" aria-hidden="true"></span>`;
const tierWord = (tier) => `<span class="tierword ${esc(tier)}">${esc(TIERS[tier] ? TIERS[tier].label : tier)}</span>`;
const pendingBadge = (o) => (o.publicationStatus === 'pendingReview' ? ' <span class="badge" title="Not yet approved by a Triodian reviewer">Pending review</span>' : '');

function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.setAttribute('href', href(a.dataset.nav === 'register' ? '' : a.dataset.nav)));
  document.querySelector('.wordmark').setAttribute('href', href(''));
  document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
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
  return `<li class="entry">${tab(o.sourceTier)}
    <div class="entry-body">
      <div class="citation"><span class="where">${esc(o.instrument)}, ${esc(o.citation)}</span><span>${esc(jurName(o.jurisdiction))}. ${esc(o.statusLabel)}</span></div>
      <h3><a href="${href('obligation', o.obligationID)}">${esc(o.title)}</a>${pendingBadge(o)}${o.stale ? ' <span class="badge stale">Past freshness threshold</span>' : ''}</h3>
      <p class="statement">${esc(o.statement)}</p>
      <ul class="facts">
        <li>${tierWord(o.sourceTier)}${o.tierBasis.length ? `, resting on ${o.tierBasis.length} binding provision${o.tierBasis.length > 1 ? 's' : ''}` : ''}</li>
        <li>${o.useCaseIDs.map((u) => `<span class="uc" title="${esc(ucTitle(u))}">${esc(u)}</span>`).join('')}</li>
        <li><a href="${esc(o.sourceURL)}" rel="noopener" target="_blank">Official source</a></li>
        <li>Verified ${esc(fmtDate(o.lastVerified))}</li>
      </ul>
    </div></li>`;
}

/** Size each select in the query sentence to its chosen option, so the sentence reads naturally. */
function sizeSelects(form) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  form.appendChild(probe);
  form.querySelectorAll('select').forEach((s) => {
    probe.style.font = getComputedStyle(s).font;
    probe.textContent = s.options[s.selectedIndex].text;
    s.style.width = `${Math.ceil(probe.getBoundingClientRect().width) + 30}px`;
  });
  probe.remove();
}

function renderRegister() {
  setNav('register');
  const jurOpts = [['', 'every jurisdiction'], ...data.jurisdictions.filter((j) => j.available && j.code !== 'INT').map((j) => [j.code, j.name])];
  const entOpts = [['', 'any regulated entity'], ...Object.entries(ENTITY_TYPES).filter(([k]) => !['anyOrganization', 'other'].includes(k) && data.obligations.some((o) => o.entityTypes.includes(k))).map(([k, v]) => [k, `a ${v.toLowerCase()}`])];
  const ucOpts = [['', 'any AI use case'], ...data.useCases.map((u) => [u.useCaseID, `${u.useCaseID}, ${u.title.toLowerCase()}`])];
  const tierOpts = [['', 'all'], ['binding', 'binding'], ['expected', 'expected'], ['anticipated', 'anticipated']];
  const rows = filtered();
  main.innerHTML = `
    <form class="query" id="query" role="search" aria-label="Find obligations">
      Show <select name="tier" aria-label="Source tier">${options(tierOpts, state.tier)}</select> obligations in
      <select name="jurisdiction" aria-label="Jurisdiction">${options(jurOpts, state.jurisdiction)}</select> for
      <select name="entityType" aria-label="Entity type">${options(entOpts, state.entityType)}</select> using
      <select name="useCase" aria-label="Use case">${options(ucOpts, state.useCase)}</select>, mentioning
      <input name="q" type="search" placeholder="anything" value="${esc(state.q)}" aria-label="Text to match">.
    </form>
    <div class="resultline">
      <ul class="key" aria-label="Source tiers">
        ${Object.entries(TIERS).map(([k, t]) => `<li>${tab(k)}<span><strong>${esc(t.label)}</strong>: ${esc(t.describes.toLowerCase())}</span></li>`).join('')}
      </ul>
    </div>
    <div class="resultline">
      <span aria-live="polite">${rows.length} record${rows.length === 1 ? '' : 's'}${state.jurisdiction ? `, including international standards` : ''}</span>
      <label><input type="checkbox" id="current" ${state.current ? 'checked' : ''}> Hide superseded and withdrawn sources</label>
    </div>
    ${rows.length ? `<ol class="register">${rows.map(entryHTML).join('')}</ol>` : `<p class="empty">No records match. Widen the jurisdiction, entity or use case above.</p>`}`;
  const form = document.getElementById('query');
  sizeSelects(form);
  form.addEventListener('change', (e) => { state[e.target.name] = e.target.value; store.set('atlas.filters', state); renderRegister(); document.querySelector(`[name="${e.target.name}"]`).focus(); });
  let t;
  form.q.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderRegister(); const i = document.querySelector('[name="q"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.getElementById('current').addEventListener('change', (e) => { state.current = e.target.checked; store.set('atlas.filters', state); renderRegister(); });
}

async function renderObligation(id) {
  setNav('register');
  const o = data.obligations.find((x) => x.obligationID === id);
  if (!o) { main.innerHTML = `<h1>No record ${esc(id)}</h1><p><a href="${href('register')}">Back to the register</a></p>`; return; }
  const ents = o.entityTypes.map((e) => ENTITY_TYPES[e] || e).join(', ');
  main.innerHTML = `
    <p><a href="${href('register')}">Register</a></p>
    <div class="record-head">${tab(o.sourceTier)}<div>
      <div class="citation"><span>${esc(o.instrument)}, ${esc(o.citation)}</span></div>
      <h1>${esc(o.title)}${pendingBadge(o)}</h1>
    </div></div>
    <div class="grid2">
      <div>
        <p class="statement" style="font-size:1.12rem">${esc(o.statement)}</p>
        ${o.tierBasis.length ? `<h2>Rests on</h2><ul>${o.tierBasis.map((b) => `<li><a href="${href('obligation', b.obligationID)}">${esc(b.title || b.obligationID)}</a> (${tierWord(b.sourceTier)})${b.note ? `<div class="muted">${esc(b.note)}</div>` : ''}</li>`).join('')}</ul>` : ''}
        ${o.keyDates.length ? `<h2>Key dates</h2><ol class="timeline">${o.keyDates.map((k) => `<li><time datetime="${esc(k.date)}">${esc(fmtDate(k.date))}</time>${esc(k.dateType.replace(/([A-Z])/g, ' $1').toLowerCase())}${k.provisions ? `, ${esc(k.provisions)}` : ''}${k.note ? `<div class="muted">${esc(k.note)}</div>` : ''}</li>`).join('')}</ol>` : ''}
        <h2>Cite this record</h2>
        <p class="cite">${esc(o.citeAs)}</p>
        <h2>Provenance</h2>
        <div id="trail"><p class="muted">Loading the provenance trail…</p></div>
      </div>
      <aside>
        <dl class="props">
          <dt>Tier</dt><dd>${tierWord(o.sourceTier)}<div class="muted">${esc(TIERS[o.sourceTier].describes)}</div></dd>
          <dt>Status</dt><dd>${esc(o.statusLabel)}</dd>
          <dt>Jurisdiction</dt><dd>${esc(jurName(o.jurisdiction))}</dd>
          <dt>Issued by</dt><dd>${esc(o.regulator ? o.regulator.name : o.authority)}</dd>
          <dt>Addressed to</dt><dd>${esc(ents)}</dd>
          <dt>Roles</dt><dd>${esc(o.roles.map((r) => ROLES[r] || r).join(', '))}</dd>
          <dt>Use cases</dt><dd>${o.useCaseIDs.map((u) => `<div><span class="uc">${esc(u)}</span> ${esc(ucTitle(u))}</div>`).join('')}</dd>
          <dt>Source</dt><dd><a href="${esc(o.sourceURL)}" target="_blank" rel="noopener">Official text</a></dd>
          <dt>Last verified</dt><dd>${esc(fmtDate(o.lastVerified))}${o.stale ? ' <span class="badge stale">Stale</span>' : ''}</dd>
          <dt>Confidence</dt><dd>${o.confidence ? `${esc(o.confidence.band)} (${esc(o.confidence.score)})` : 'not scored'}</dd>
          <dt>Approved by</dt><dd>${o.approval ? `${esc(o.approval.approverName)}, ${esc(fmtDate(o.approval.approvedAt))}` : '<span class="muted">Not yet approved</span>'}</dd>
          <dt>Record</dt><dd><code>${esc(o.governedRecordID)}</code></dd>
        </dl>
      </aside>
    </div>`;
  try {
    const p = EMBED ? await EMBED.provenance(o.obligationID) : await (await fetch(`/api/v1/provenance/${encodeURIComponent(o.obligationID)}`)).json();
    document.getElementById('trail').innerHTML = `<p class="muted">Each step below is an entry in the Reasoning Fabric's append-only provenance ledger. Its hash is checked here against its content.</p>
      <ol class="trail">${p.entries.map((e) => `<li><span class="${e.hashVerified ? 'ok' : 'bad'}">${e.hashVerified ? 'Hash checks' : 'Hash does not match'}</span> ${esc(fmtDate(e.recordedAt))}, ${esc(e.eventType.replace(/([A-Z])/g, ' $1').toLowerCase())} by ${esc(e.actor.displayName || e.actor.actorID)}<div class="muted">${esc(e.decision || '')}${e.ruleIDs ? ` Rules: ${e.ruleIDs.map((x) => `<code>${esc(x)}</code>`).join(', ')}` : ''}</div></li>`).join('')}</ol>`;
  } catch {
    document.getElementById('trail').innerHTML = '<p class="muted">The provenance trail could not be loaded. Reload the page to try again.</p>';
  }
}

function renderUseCases() {
  setNav('use-cases');
  main.innerHTML = `<h1>Standardised AI use cases</h1>
    <p class="lede">Every obligation is mapped to the same ten use cases, defined on the authority (A) and boundary (B) scales, so results compare across jurisdictions and clients. Consequence (C1 to C5) is set per matter, against the client's own thresholds.</p>
    <div class="scroll"><table><thead><tr><th>Use case</th><th>Authority</th><th>Boundary</th><th>Leads to</th><th>Records</th></tr></thead><tbody>
    ${data.useCases.map((u) => `<tr><td><strong>${esc(u.useCaseID)}</strong> ${esc(u.title)}<div class="muted">${esc(u.description)}</div></td><td>${esc(u.authorityLabels.join(', '))}</td><td>${esc((u.boundaries || []).map((b) => b.toUpperCase()).join(', ') || (u.confidentialityChannels ? 'Channels K1 to K7' : ''))}</td><td>${esc((u.assessmentTypes || []).map((a) => ASSESSMENTS[a].name).join('; '))}</td><td><a href="${href('register')}" data-uc="${esc(u.useCaseID)}">${u.obligationCount}</a></td></tr>`).join('')}
    </tbody></table></div>`;
  main.querySelectorAll('[data-uc]').forEach((a) => a.addEventListener('click', () => { state.useCase = a.dataset.uc; state.jurisdiction = ''; }));
}

function renderChanges() {
  setNav('changes');
  const kinds = { instrumentChange: 'Instrument change', lead: 'Lead, unverified', recordPublished: 'Record published', recordUpdated: 'Record updated', recordSuperseded: 'Record superseded' };
  main.innerHTML = `<h1>Changes</h1>
    <p class="lede">New and amended instruments, commencements and withdrawals, newest first. A lead comes from a source that cannot set a status or date on its own; it points to an official source still to be checked.</p>
    <ol class="register">${data.changes.map((c) => `<li class="entry"><div class="entry-body">
      <div class="citation"><span>${esc(kinds[c.kind] || c.kind)}${c.jurisdiction ? `, ${esc(jurName(c.jurisdiction))}` : ''}</span><time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time></div>
      <h3>${esc(c.title)}${c.publicationStatus === 'pendingReview' ? ' <span class="badge">Pending review</span>' : ''}</h3>
      ${c.summary ? `<p class="statement">${esc(c.summary)}</p>` : ''}
      <ul class="facts">${c.effectiveDate ? `<li>Effective ${esc(fmtDate(c.effectiveDate))}</li>` : ''}${c.sourceURL ? `<li><a href="${esc(c.sourceURL)}" target="_blank" rel="noopener">Source</a> (rank ${esc(c.sourceRank)})</li>` : ''}${(c.affects || []).filter((a) => data.obligations.some((o) => o.obligationID === a)).slice(0, 6).map((a) => `<li><a href="${href('obligation', a)}">${esc(a)}</a></li>`).join('')}</ul>
    </div></li>`).join('')}</ol>`;
}

// ------------------------------------------------------------ matter brief
function briefHTML(b) {
  const sect = (tier) => {
    const items = b.obligationsByTier[tier] || [];
    return `<h3>${tab(tier).replace('class="tab', 'style="display:inline-block;height:0.9em;width:0.45em;margin-right:0.5em;vertical-align:-0.05em" class="tab')}${esc(TIERS[tier].label)} (${items.length})</h3>
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
  main.innerHTML = `<h1 class="screen-only">Matter brief</h1>
    <p class="lede screen-only">Pick the client's jurisdictions, entity type and AI use cases. The brief lists the obligations in scope by tier, the questions counsel will need to determine, and the engagements that fit. It is built and kept in this browser; nothing you enter here is sent to Triodian.</p>
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
  main.innerHTML = `<h1>API and MCP</h1>
    <p class="lede">The same records are served to the web app, to firms' knowledge systems through the REST API, and to AI assistants through the MCP server. Every response carries the source link, tier, last-verified date and a provenance reference, so anything that quotes a record can cite it.</p>
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
  document.getElementById('dataset-line').textContent = `${data.info.counts.obligations} records across ${data.jurisdictions.filter((j) => j.available).length} jurisdictions. Data generated ${fmtDate(data.info.generatedAt)}. Data model: Triodian Metamodel ${data.info.metamodelVersion}.`;
  if (data.info.preview) {
    const p = document.getElementById('preview');
    p.hidden = false;
    p.textContent = 'Preview. Records marked pending review come from the seed research of 27 October 2026 and have not yet been approved by a Triodian reviewer. Do not rely on them in a matter.';
  }
  window.addEventListener('hashchange', route);
  route();
}

start();
