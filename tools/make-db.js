// Builds app/data/matches.wmdb: the NWA / WCW and ECW shows from a builder database plus
// Wrestling Chronology's match cards. Usage: node tools/make-db.js out.wmdb in1 [in2 …]
const fs = require('fs'), zlib = require('zlib');
const [out, ...inputs] = process.argv.slice(2);
const read = (f) => { let b = fs.readFileSync(f); if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8').replace(/^﻿/, '')); };
// Pages the wiki builder filed under WCW/ECW that belong to other promotions (shared show names).
const OTHER = /^(?:SMW|IWF|HPW|WCWO|GAEA|PWA|RCW|WSU|RPW|VOW|EVW|SWA|VPWA|NOVA|NEW|MCW|AIW|MLW|PROGRESS|Stardom|Wrestling GO|Accion|NXT)\b|^NWA (?:Western States|Houston|WildKat|WR|SPW)\b/i;
const WWE_ECW = /\bECW\b|^One Night Stand 200[56]\b|^December to Dismember/i;
function keep(e) {
  if (OTHER.test(e.t)) return null;
  if (e.c === 'wcw') return e.d <= '2001-03-31' ? e : null;
  if (e.c === 'ecw') return e.d <= '2001-04-30' || (e.d >= '2005-06-01' && e.d <= '2010-02-28') ? e : null;
  if (e.c === 'wwe' && WWE_ECW.test(e.t) && e.d >= '2005-06-01' && e.d <= '2010-02-28') return { ...e, c: 'ecw' }; // WWE's ECW brand
  return null;
}
const byKey = new Map();
for (const f of inputs) {
  const data = read(f);
  let events = [];
  if (data.format === 'wrestling-match-db') events = data.events;
  else for (const card of Object.values(data)) {
    if (!card || !card.matches || !card.matches.length || !card.meta) continue;
    const { company, date, show, title } = card.meta;
    const t = card.title || title || show;
    events.push({ d: date, c: company, k: /house show|live event/i.test(t) ? 'house' : show === 'PPV' ? 'ppv' : 'tv', s: show === 'PPV' ? title : show, t, v: '', m: card.matches });
  }
  let n = 0;
  for (const e0 of events) {
    const e = keep(e0);
    if (!e || !e.m || !e.m.length) continue;
    if (e.c === 'ecw' && /\bShow \(/.test(e.t)) e.k = 'house'; // "Philadelphia Show (Mar '92)"
    if (e.c === 'ecw' && e.d > '2005' && e.s === 'ECW') e.s = 'ECW on Sci Fi'; // WWE's weekly ECW show
    const key = `${e.d}|${String(e.t).toLowerCase()}`;
    if (!byKey.has(key) || (byKey.get(key).m.length < e.m.length)) byKey.set(key, e);
    n++;
  }
  console.log(f, n, 'NWA/WCW/ECW shows');
}
const events = [...byKey.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.c < b.c ? -1 : 1));
fs.writeFileSync(out, zlib.gzipSync(Buffer.from(JSON.stringify({ format: 'wrestling-match-db', v: 1, built: new Date().toISOString(), source: 'Pro Wrestling Wiki (prowrestling.fandom.com), CC BY-SA 3.0', events })), { level: 9 }));
const by = {}; for (const e of events) { const k = e.c + (e.c === 'ecw' && e.d > '2002' ? '-wwe' : ''); by[k] = by[k] || [0, 0, e.d, e.d]; by[k][0]++; by[k][1] += e.m.length; by[k][3] = e.d; }
console.log('wrote', out, events.length, 'shows', events.reduce((n, e) => n + e.m.length, 0), 'matches', JSON.stringify(by));
