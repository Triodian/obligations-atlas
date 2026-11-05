/* Triodian demo suite: an introduction to the five apps, and a "Switch app" link in a demo band.
 *
 * DEMO ADDITION. This file is the same in all five apps: AI Obligations Atlas, AI Board Direction, AI Risk Appetite,
 * AI Use Assessment and AI Confidentiality Exposure Assessment. The dialog shows the four-step chain for regulated
 * entities, then the two apps an unregulated company uses: AI Board Direction in standalone mode, and AI Confidentiality
 * Exposure Assessment. It is not part of any app's own logic: it adds a band at the top of the page
 * and a dialog, and touches nothing else. To switch it off for a client deployment, set DEMO to
 * false below, or remove the <script src="/suite.js"> line from public/index.html.
 *
 * The introduction opens once per browser session on each site, and again whenever someone
 * presses "Switch app". Links between the apps carry ?suite=1 so the introduction does not open
 * a second time when someone has just chosen an app from it.
 */
(function () {
  'use strict';
  var DEMO = true;
  if (!DEMO) return;

  var script = document.currentScript;
  var CURRENT = (script && script.dataset.current) || '';
  var TEST = /-test\./.test(location.hostname);
  var SEEN_KEY = 'triodian.suite.seen';
  var BAND_H = 34;

  var APPS = [
    {
      id: 'oa', host: 'obligations-atlas', name: 'AI Obligations Atlas', n: '1', verb: 'What applies',
      who: 'For counsel',
      text: 'AI governance obligations for Australia, Singapore and international standards, mapped to ten standard AI use cases. Each record is tagged Binding, Expected or Anticipated, and carries its source and review trail.',
      hands: 'Matter brief',
    },
    {
      id: 'bd', host: 'board-direction', name: 'AI Board Direction', n: '2', verb: 'What the board directs',
      who: 'For the board, its advisor and the GC',
      text: 'The board works through ten templated steps, from the AI in use to red lines, decisions reserved to it, confidential information and what it expects to hear. Connected, it gives the board’s directions for the appetite. Standalone, it is the whole appetite for an unregulated company.',
      hands: 'Board directions',
    },
    {
      id: 'ra', host: 'risk-appetite', name: 'AI Risk Appetite', n: '3', verb: 'What the board will accept',
      who: 'For the CRO, counsel and the board',
      text: 'The board’s positions on eight decisions about AI, tested for consistency and challenged before approval. It produces the appetite statement, the tolerance and trigger schedule, and the calibration set.',
      hands: 'Calibration set',
    },
    {
      id: 'ua', host: 'use-assessment', name: 'AI Use Assessment', n: '4', verb: 'Whether each AI use fits',
      who: 'For counsel, the GC and the CRO',
      text: 'Each AI arrangement registered and classified against the calibration set, with blind peer review and independent validation. It produces the register, the evidence gaps and the findings.',
      hands: 'Register and findings',
    },
  ];
  // A separate app, not a step in the chain above: for unregulated entities, which have no calibration set to measure against.
  var CE = {
    id: 'ce', host: 'confidentiality', name: 'AI Confidentiality Exposure Assessment', verb: 'Where deal information can reach an external AI model',
    who: 'For unregulated entities · counsel and the GC, during a transaction',
    text: 'For companies outside the regulated-entity chain above, with no calibration set to measure against. For one live or recently closed transaction, it registers every channel by which deal information can reach an external model, and what the company could show about each. It produces the channel register, one finding per channel and a 90-day plan.',
    hands: 'Channel register and findings',
  };
  var url = function (a) { return 'https://' + a.host + (TEST ? '-test' : '') + '.triodian.com/?suite=1'; };

  function seen() { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }
  function markSeen() { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {} }

  var CSS = [
    ':root{--demo-h:' + BAND_H + 'px}',
    'body{padding-top:var(--demo-h)}',
    '.hdr{top:calc(var(--demo-h) + env(safe-area-inset-top,0px)) !important}',
    '.drawer,.overlay{top:var(--demo-h) !important}',
    '.tsu-band{position:fixed;top:0;left:0;right:0;height:var(--demo-h);z-index:160;display:flex;align-items:center;gap:10px;padding:0 12px 0 16px;',
    '  background:repeating-linear-gradient(135deg,#FBF2DE 0 10px,#F6E8C6 10px 20px);border-bottom:1px dashed #C99A3A;color:#5C3D00;',
    "  font:500 12px/1 'IBM Plex Sans',system-ui,sans-serif;box-sizing:border-box}",
    '.tsu-tag{font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;background:#7A5200;color:#fff;padding:4px 7px;border-radius:3px}',
    '.tsu-note{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.tsu-switch{margin-left:auto;flex-shrink:0;display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:#fff;color:#5C3D00;',
    "  border:1px dashed #7A5200;border-radius:16px;padding:5px 12px;font:600 12px/1 'IBM Plex Sans',system-ui,sans-serif}",
    '.tsu-switch:hover{background:#7A5200;color:#fff;border-style:solid}',
    '.tsu-switch:focus-visible,.tsu-card a:focus-visible,.tsu-x:focus-visible{outline:2px solid #182635;outline-offset:2px}',
    '@media (max-width:620px){.tsu-note .tsu-long{display:none}}',
    '.tsu-bg{position:fixed;inset:0;z-index:300;background:rgba(24,38,53,.62);display:flex;align-items:flex-start;justify-content:center;padding:max(5vh,20px) 16px 24px;overflow:auto;box-sizing:border-box}',
    ".tsu-dlg{position:relative;background:#fff;color:#17202B;border-radius:14px;max-width:1180px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.28);padding:32px 34px 22px;box-sizing:border-box;font:400 15px/1.55 'IBM Plex Sans',system-ui,sans-serif}",
    '.tsu-dlg *{box-sizing:border-box}',
    '.tsu-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:#4F5966;font-size:18px;cursor:pointer}',
    '.tsu-x:hover{background:#F4F5F7;color:#17202B}',
    '.tsu-top{display:flex;align-items:center;gap:12px;margin-bottom:18px}',
    '.tsu-top img{height:26px;width:auto;display:block}',
    ".tsu-h{font:600 30px/1.18 'Source Serif 4',Georgia,serif;margin:0 0 8px;letter-spacing:-.01em;max-width:24ch}",
    '.tsu-lead{color:#4F5966;margin:0 0 24px;max-width:64ch}',
    '.tsu-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;align-items:stretch}',
    '@media (max-width:1060px){.tsu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:820px){.tsu-grid{grid-template-columns:1fr}.tsu-dlg{padding:26px 20px 18px}.tsu-h{font-size:25px}}',
    '.tsu-card{position:relative;display:flex;flex-direction:column;border:1px solid #D3D8DF;border-radius:12px;padding:18px 18px 16px;background:#F4F5F7}',
    '.tsu-card.is-here{background:#fff;border-color:#4E3A5E;box-shadow:inset 0 3px 0 #4E3A5E}',
    ".tsu-step{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#4E3A5E;margin-bottom:10px;display:flex;justify-content:space-between;gap:8px}",
    '.tsu-here{color:#2F6B47}',
    ".tsu-card h3{font:600 19px/1.25 'Source Serif 4',Georgia,serif;margin:0 0 2px}",
    '.tsu-verb{font-weight:600;color:#17202B;margin:0 0 2px;font-size:14px}',
    '.tsu-who{font-size:13px;color:#5E6874;margin:0 0 10px}',
    '.tsu-text{font-size:14px;color:#4F5966;margin:0 0 14px;flex:1}',
    '.tsu-out{font-size:12px;color:#4F5966;border-top:1px solid #E6E9ED;padding-top:10px;margin:0 0 14px}',
    '.tsu-out b{color:#17202B;font-weight:600}',
    ".tsu-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;border-radius:8px;padding:10px 14px;font:600 14px/1 'IBM Plex Sans',system-ui,sans-serif;background:#182635;color:#fff;border:1px solid #182635}",
    '.tsu-go:hover{background:#2A3B4E}',
    '.is-here .tsu-go{background:#fff;color:#182635}',
    '.is-here .tsu-go:hover{background:#F4F5F7}',
    '.tsu-flow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:#4F5966;margin:18px 0 0;padding:12px 14px;background:#F4F5F7;border-radius:10px}',
    ".tsu-flow b{font-weight:600;color:#17202B}",
    '.tsu-arrow{color:#4E3A5E;font-weight:700}',
    '.tsu-sep{display:flex;align-items:center;gap:10px;margin:22px 0 10px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8A5A3B}',
    '.tsu-sep:after{content:"";flex:1;border-top:1px solid #E6E9ED}',
    '.tsu-ce{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 24px;align-items:end;border:1px solid #D3D8DF;border-left:4px solid #8A5A3B;border-radius:12px;padding:18px 18px 16px;background:#FBF7F3}',
    '.tsu-ce .tsu-text{margin:0 0 10px}',
    '.tsu-ce .tsu-out{margin:0;border:0;padding:0}',
    '.tsu-ce .tsu-go{white-space:nowrap}',
    '.tsu-ce.is-here{background:#fff;border-color:#8A5A3B}',
    '@media (max-width:820px){.tsu-ce{grid-template-columns:1fr}}',
    '.tsu-foot{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding-top:14px;border-top:1px dashed #C99A3A;font-size:12px;color:#5C3D00}',
    '.tsu-foot .tsu-tag{flex-shrink:0;margin-top:1px}',
  ].join('\n');

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  var lastFocus = null, dlg = null;

  function card(a) {
    var here = a.id === CURRENT;
    return '<section class="tsu-card' + (here ? ' is-here' : '') + '" aria-labelledby="tsu-' + a.id + '">' +
      '<div class="tsu-step"><span>Step ' + a.n + '</span>' + (here ? '<span class="tsu-here">● You are here</span>' : '') + '</div>' +
      '<h3 id="tsu-' + a.id + '">' + a.name + '</h3>' +
      '<p class="tsu-verb">' + a.verb + '</p>' +
      '<p class="tsu-who">' + a.who + '</p>' +
      '<p class="tsu-text">' + a.text + '</p>' +
      '<p class="tsu-out">Hands on: <b>' + a.hands + '</b></p>' +
      (here
        ? '<a class="tsu-go" href="#" data-tsu-close>Continue in ' + a.name.replace('AI ', '') + '</a>'
        : '<a class="tsu-go" href="' + url(a) + '">Open ' + a.name.replace('AI ', '') + ' <span aria-hidden="true">→</span></a>') +
      '</section>';
  }

  function ceCard(a) {
    var here = a.id === CURRENT;
    return '<section class="tsu-ce' + (here ? ' is-here' : '') + '" aria-labelledby="tsu-' + a.id + '"><div>' +
      (here ? '<div class="tsu-step"><span class="tsu-here">● You are here</span></div>' : '') +
      '<h3 id="tsu-' + a.id + '" style="font:600 19px/1.25 \'Source Serif 4\',Georgia,serif;margin:0 0 2px">' + a.name + '</h3>' +
      '<p class="tsu-verb">' + a.verb + '</p>' +
      '<p class="tsu-who">' + a.who + '</p>' +
      '<p class="tsu-text">' + a.text + '</p>' +
      '<p class="tsu-out">Hands on: <b>' + a.hands + '</b></p></div>' +
      (here
        ? '<a class="tsu-go" href="#" data-tsu-close>Continue in Confidentiality Exposure</a>'
        : '<a class="tsu-go" href="' + url(a) + '">Open Confidentiality Exposure <span aria-hidden="true">→</span></a>') +
      '</section>';
  }

  function open() {
    if (dlg) return;
    markSeen();
    lastFocus = document.activeElement;
    dlg = el('<div class="tsu-bg" data-tsu-bg>' +
      '<div class="tsu-dlg" role="dialog" aria-modal="true" aria-labelledby="tsu-h">' +
      '<button class="tsu-x" type="button" aria-label="Close" data-tsu-close>✕</button>' +
      '<div class="tsu-top"><img src="/triodian-logo.svg" alt="Triodian"></div>' +
      '<h2 class="tsu-h" id="tsu-h">From what the law expects to evidence each AI use fits</h2>' +
      '<p class="tsu-lead">Four connected apps for governing AI in a regulated entity. Counsel and the board’s advisor lead each engagement; the board, the CRO and management own the positions. Each app hands a defined output to the next, so the board’s appetite is traceable from the obligations behind it to the assessment of every AI use.</p>' +
      '<div class="tsu-grid">' + APPS.map(card).join('') + '</div>' +
      '<div class="tsu-flow" aria-label="How the apps connect"><b>Obligations</b><span class="tsu-arrow" aria-hidden="true">→</span>matter brief<span class="tsu-arrow" aria-hidden="true">→</span><b>Board direction</b><span class="tsu-arrow" aria-hidden="true">→</span>board directions<span class="tsu-arrow" aria-hidden="true">→</span><b>Appetite</b><span class="tsu-arrow" aria-hidden="true">→</span>calibration set<span class="tsu-arrow" aria-hidden="true">→</span><b>Assessment</b><span class="tsu-arrow" aria-hidden="true">→</span>register and findings</div>' +
      '<div class="tsu-sep">For unregulated entities</div>' +
      '<p class="tsu-text" style="margin:0 0 12px">An unregulated company starts with <a href="' + url(APPS[1]) + '">AI Board Direction</a> in standalone mode: the board’s steps are the whole appetite, and its confidentiality position can seed the assessment below.</p>' + ceCard(CE) +
      '<div class="tsu-foot"><span class="tsu-tag">DEMO</span><span>This introduction and the Switch app link are added for demonstrations and are not part of the apps. The worked examples use fictional organisations. Atlas records describe what sources say; they are not legal advice.</span></div>' +
      '</div></div>');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      var t = e.target;
      if (t === dlg || (t.closest && t.closest('[data-tsu-close]'))) { e.preventDefault(); close(); }
    });
    dlg.addEventListener('keydown', trap);
    var first = dlg.querySelector('.is-here .tsu-go') || dlg.querySelector('.tsu-go');
    if (first) first.focus({ preventScroll: true });
    dlg.scrollTop = 0;
  }
  function close() {
    if (!dlg) return;
    dlg.remove(); dlg = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function trap(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = dlg.querySelectorAll('a[href],button');
    if (!f.length) return;
    var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }

  function start() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    var band = el('<div class="tsu-band" role="region" aria-label="Demo">' +
      '<span class="tsu-tag">DEMO</span>' +
      '<span class="tsu-note">Triodian demonstration<span class="tsu-long"> · this band is added for demos and is not part of the app</span></span>' +
      '<button class="tsu-switch" type="button" aria-haspopup="dialog"><span aria-hidden="true">⇄</span> Switch app</button>' +
      '</div>');
    document.body.insertBefore(band, document.body.firstChild);
    band.querySelector('.tsu-switch').addEventListener('click', open);

    // Arrived from the introduction or another app's menu: don't show it again straight away.
    var q = new URLSearchParams(location.search);
    if (q.has('suite')) {
      markSeen();
      q.delete('suite');
      var rest = q.toString();
      try { history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) {}
    }
    if (!seen()) open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
