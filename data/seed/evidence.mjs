// Evidence ranking shared by the seed builder and the submission builder: each fetched URL gets a source rank
// (1 official text, 2 regulator publication, 3 standards body, 4 commentary, 5 other), so the Fabric can decide
// what may be published and what waits for a named reviewer.
export function rankFor(url) {
  const u = url.toLowerCase();
  if (/legislation\.gov\.au|legislation\.nsw\.gov\.au|sso\.agc\.gov\.sg|handbook\.apra\.gov\.au/.test(u)) return [1, 'Official legislation register'];
  if (/apra\.gov\.au\/(standards?|sites\/default\/files\/cps_)/.test(u)) return [1, 'APRA prudential standard'];
  if (/mas\.gov\.sg\/-\/media\/.*guidelines.*\.pdf/.test(u) || /mas\.gov\.sg\/regulation\/notices\//.test(u)) return [1, 'MAS instrument'];
  if (/asx\.com\.au\/.*listing-rules|asxonline\.com\/.*gn\d+/.test(u)) return [1, 'ASX Listing Rules and Guidance Notes'];
  if (/pdpc\.gov\.sg\/-\/media\/.*advisory-guidelines/.test(u)) return [1, 'PDPC advisory guidelines'];
  if (/iso\.org|nist\.gov/.test(u)) return [3, 'Standards body'];
  if (/allenandgledhill|bakermckenzie|lexology|herbertsmith|nortonrose|allens\.com|kwm\.com|gtlaw|minterellison|klgates|hsfkramer/.test(u)) return [4, 'Law firm commentary'];
  if (/apra\.gov\.au|asic\.gov\.au|oaic\.gov\.au|mas\.gov\.sg|pdpc\.gov\.sg|imda\.gov\.sg|mddi\.gov\.sg|industry\.gov\.au|asx\.com\.au|ahpra\.gov\.au|csa\.gov\.sg|customs\.gov\.sg|mom\.gov\.sg|ccs\.gov\.sg|moh\.gov\.sg|isomer-user-content\.by\.gov\.sg|defence\.gov\.au|fsb\.org/.test(u)) return [2, 'Regulator publication'];
  return [5, 'Other'];
}
export const urlsIn = (s) => [...new Set((s || '').match(/https?:\/\/[^\s;,)]+/g) || [])].map((u) => u.replace(/[.'"]+$/, ''));
/** Evidence for a research record: every URL it was verified from, best source first. */
export function evidenceFor(o, retrievedAt) {
  const fetched = urlsIn(o.verifiedFrom);
  const list = (fetched.length ? fetched : [o.url]).map((url) => {
    const [sourceRank, kind] = rankFor(url);
    return { url, title: `${o.instrument} (${kind})`.slice(0, 200), sourceRank, retrievedAt };
  });
  return list.sort((a, b) => a.sourceRank - b.sourceRank);
}
