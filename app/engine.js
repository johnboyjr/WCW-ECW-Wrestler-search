'use strict';
/* WCW Match Search Engine — the search engine. Runs in a worker: reads the bundled
 * database once (NWA / WCW and ECW shows), parses every match line, and keeps a posting list
 * per wrestler so searches stay instant. */
importScripts('parse.js');

const WIKI = 'https://prowrestling.fandom.com/wiki/';
const NWA_END = '1988-11-21'; // Turner bought Jim Crockett Promotions; "WCW" from here on
/** nwa | wcw | ecw (1992-2001) | wecw (WWE's ECW brand, 2006-2010) */
const eraOf = (ev) => (ev.c === 'ecw' ? (ev.d < '2002' ? 'ecw' : 'wecw') : ev.d < NWA_END ? 'nwa' : 'wcw');
const ERAS = ['nwa', 'wcw', 'ecw', 'wecw'];
let EVENTS = [];   // {d, c, k, s, t, v, m, g}
let M = [];        // per match: {e, i, w, l, a, sd, o, dark, dq, co, runIn, types}
let NAMES = [];    // id → normalised name
const NAME_ID = new Map();
let POST = [];     // id → [match index…] in date order
let last = null;   // the last search's hits, for paging
let TEAM_ID = new Set();
const GROUP_CASE = new Map();

const nameId = (n) => {
  let id = NAME_ID.get(n);
  if (id === undefined) { id = NAMES.length; NAMES.push(n); NAME_ID.set(n, id); POST.push([]); }
  return id;
};
const year = (d) => +d.slice(0, 4);

/* Which show a page belongs to, for the show filter: "WCW Monday Nitro" → "Nitro". */
const SHOW_GROUPS = [
  [/hardcore tv/i, 'ECW Hardcore TV'], [/on tnn/i, 'ECW on TNN'], [/sci ?fi|syfy|\d{4} ECW results/i, 'ECW on Sci Fi'],
  [/nitro/i, 'Nitro'], [/thunder/i, 'Thunder'], [/saturday night/i, 'Saturday Night'], [/world ?wide/i, 'Worldwide'],
  [/power hour/i, 'Power Hour'], [/main event/i, 'Main Event'], [/clash of the champions/i, 'Clash of the Champions'],
  [/\bpro\b/i, 'Pro'], [/prime/i, 'Prime'], [/world championship wrestling/i, 'World Championship Wrestling (TBS)'],
  [/mid-atlantic/i, 'Mid-Atlantic Championship Wrestling'], [/georgia championship/i, 'Georgia Championship Wrestling'],
  [/house show|live event/i, 'House shows'],
];
function showGroup(ev) {
  if (ev.k === 'house') return ev.c === 'ecw' ? 'ECW house shows' : 'House shows';
  const name = `${ev.s} ${ev.k === 'ppv' ? '' : ev.t}`;
  for (const [re, g] of SHOW_GROUPS) if (re.test(ev.k === 'ppv' ? ev.s : name)) return g;
  if (ev.k === 'ppv' || ev.k === 'event') {
    return ev.s.replace(/\s*\([^)]*\)\s*$/, '').replace(/^(?:NWA|WCW|Jim Crockett Promotions'?s?)\s+/i, '')
      .replace(/^(World War) (?:3|III)\b.*$/i, 'World War 3').replace(/\s*(?:'\d{2}|\d{4}|\b[IVX]+\b|(?<!World War )\d{1,3})(?::.*)?$/, '').replace(/:.*$/, '').trim() || ev.s;
  }
  return ev.s;
}

const TEAM_WORDS = /\b(?:brothers|bros|boys|express|warriors|horsemen|connection|patrol|squad|order|nwo|n w o|wolfpac|army|machine|commission|alliance|club|crew|family|gang|team|twins|clique|heat|posse|kronik|naturals|faces of fear|nasty boys|mafia|militia|ninjas|dragons|filthy animals|thrillers|flock|dungeon|ministry|enforcers|stud stable|stable|hollywood blondes|blondes|bunch|corp|corporation|pack|unit|express|riders|raiders|cartel|syndicate|lwo|revolution|ring warriors|patriots|hardliners|kings|misfits|natural born|dudes|cheerleaders|skyscrapers|road warriors|dynamic dudes|freebirds|sheepherders|varsity club|four horsemen|steiner brothers|harlem heat|public enemy|amazing french canadians|american males|young pistols|fabulous freebirds|blue bloods|headbangers)\b/;
const MULTI = /^(?:Tag team|Six-man|Triple threat|Four-way|Handicap|Battle royal|World War 3|WarGames|Elimination|Triple cage|Tournament)/;
const isTeam = (id) => TEAM_ID.has(id);

/** Singles and tag matches are worked out from the sides when the line doesn't say. */
function inferTypes(m) {
  const t = m.types;
  if (t.some((x) => MULTI.test(x)) || t.includes('Singles')) return;
  if (m.sd.length !== 2) return;
  const shape = (side) => { const teams = side.filter(isTeam).length; return { people: side.length - teams, teams, n: side.length }; };
  const [a, b] = m.sd.map(shape);
  if (a.n === 1 && b.n === 1 && !a.teams && !b.teams) { t.push('Singles'); return; }
  const tagSide = (s) => (s.teams === 1 && s.people <= 2) || (!s.teams && s.people === 2);
  if (tagSide(a) && tagSide(b)) { t.push('Tag team'); return; }
  const trioSide = (s) => (s.teams <= 1 && s.people === 3) || (s.teams === 1 && s.n === 1);
  if (!a.teams && !b.teams && a.people === 3 && b.people === 3) t.push('Six-man / eight-man');
  else if (trioSide(a) && trioSide(b) && (a.people === 3 || b.people === 3)) t.push('Six-man / eight-man');
}

async function load() {
  const res = await fetch('app://bundle/db.json');
  const db = await res.json();
  EVENTS = (db.events || []).filter((e) => e.c === 'wcw' || e.c === 'ecw');
  M = []; NAMES = []; NAME_ID.clear(); POST = [];
  const total = EVENTS.reduce((n, e) => n + e.m.length, 0);
  let done = 0, tick = 0;
  for (let e = 0; e < EVENTS.length; e++) {
    const ev = EVENTS[e];
    ev.m = ev.m.filter(isMatchLine);
    ev.era = eraOf(ev);
    const g = showGroup(ev);
    ev.g = GROUP_CASE.get(g.toLowerCase()) || (GROUP_CASE.set(g.toLowerCase(), g), g);
    for (let i = 0; i < ev.m.length; i++) {
      const p = parseMatch(ev.m[i]);
      const k = M.length;
      const w = p.winners.map(nameId), l = p.losers.map(nameId), a = p.all.map(nameId);
      M.push({ e, i, w, l, a, sd: (p.sides || []).map((s) => s.map(nameId)), o: p.outcome, dark: p.dark, dq: p.dq, co: p.countout, runIn: p.runIn, types: p.types });
      for (const id of a) POST[id].push(k);
    }
    done += ev.m.length;
    if (++tick % 400 === 0) postMessage({ type: 'progress', done, total });
  }
  TEAM_ID = new Set();
  NAMES.forEach((n, id) => { if (TEAMS.has(n) || TEAM_WORDS.test(n)) TEAM_ID.add(id); });
  const typeCount = new Map();
  for (const m of M) { inferTypes(m); for (const t of m.types) typeCount.set(t, (typeCount.get(t) || 0) + 1); }
  nameCounts = new Map(NAMES.map((n, id) => [n, POST[id].length]));
  const shows = new Map();
  const by = Object.fromEntries(ERAS.map((x) => [x, { events: 0, matches: 0, from: '', to: '' }]));
  for (const ev of EVENTS) {
    shows.set(ev.g, (shows.get(ev.g) || 0) + 1);
    const b = by[ev.era];
    b.events++; b.matches += ev.m.length;
    if (!b.from || ev.d < b.from) b.from = ev.d;
    if (!b.to || ev.d > b.to) b.to = ev.d;
  }
  const years = EVENTS.length ? [year(EVENTS[0].d), year(EVENTS[EVENTS.length - 1].d)] : [1983, 2001];
  postMessage({ type: 'ready', info: {
    events: EVENTS.length, matches: M.length, wrestlers: NAMES.length - TEAM_ID.size, by, years, built: db.built || '',
    types: MATCH_TYPES.map(([t]) => [t, typeCount.get(t) || 0]).filter(([, c]) => c > 0),
    shows: [...shows].sort((x, y) => y[1] - x[1]).filter(([, c]) => c >= 2),
  } });
}

/* ---------------- names: exact, then partial, then a close spelling ("Bret Heart") */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function resolve(text) {
  const r = resolvePerson(text);
  if (!r) return null;
  if ([...r.names].some((n) => NAME_ID.has(n))) return r;
  const q = normName(text);
  const max = q.length < 5 ? 1 : q.length < 10 ? 2 : 3;
  let best = null;
  for (let id = 0; id < NAMES.length; id++) {
    if (isTeam(id)) continue;
    const d = lev(q, NAMES[id], max);
    if (d > max) continue;
    const c = POST[id].length;
    if (!best || d < best.d || (d === best.d && c > best.c)) best = { id, d, c };
  }
  if (!best) return r;
  const key = (aliasIndex.get(NAMES[best.id]) || [NAMES[best.id]])[0];
  return { names: new Set(aliasIndex.get(key) || [NAMES[best.id]]), key, others: [], guessed: true, typed: text.trim() };
}

/* ---------------- filters */
function filterFn(f) {
  const from = +f.from || 0, to = +f.to || 9999;
  const kind = f.kind || 'all';
  const dark = f.dark || 'hide';
  const eras = f.eras && f.eras.length ? new Set(f.eras) : null;
  const show = f.show || '';
  return (m) => {
    const ev = EVENTS[m.e];
    if (eras && !eras.has(ev.era)) return false;
    const y = year(ev.d);
    if (y < from || y > to) return false;
    if (kind !== 'all' && (kind === 'tv' ? !(ev.k === 'tv' || ev.k === 'event') : ev.k !== kind)) return false;
    if (show && ev.g !== show) return false;
    if (dark === 'hide' ? m.dark : dark === 'only' ? !m.dark : false) return false;
    return true;
  };
}
const finishOk = (m, finish) => finish === 'any'
  || (finish === 'dq' ? m.dq : finish === 'runin' ? m.runIn : finish === 'clean' ? (m.o === 'win' && !m.dq && !m.co) : true);
const idsFor = (r) => new Set([...r.names].map((n) => NAME_ID.get(n)).filter((x) => x !== undefined));
function postingFor(ids) {
  if (ids.size === 1) return POST[[...ids][0]];
  const set = new Set();
  for (const id of ids) for (const k of POST[id]) set.add(k);
  return [...set].sort((a, b) => a - b);
}
const has = (arr, ids) => arr.some((x) => ids.has(x));
const canonicalId = (id) => { const g = aliasIndex.get(NAMES[id]); return g ? g[0] : NAMES[id]; };
const prettyName = (n) => { const g = ALIAS_GROUPS.find((x) => normName(x[0]) === n); return g ? g[0] : n.replace(/\b\w/g, (c) => c.toUpperCase()); };

function resultFor(m, ids) {
  if (ids) {
    if (has(m.w, ids)) return 'won';
    if (has(m.l, ids)) return 'lost';
  }
  return m.o === 'draw' ? 'draw' : 'unknown';
}
/** Everyone on the other side(s) from the wrestler; null if we can't tell the sides apart. */
function opponentsOf(m, ids) {
  if (m.sd.length >= 2) {
    const mine = m.sd.findIndex((s) => has(s, ids));
    if (mine < 0) return null;
    return m.sd.filter((_, i) => i !== mine).flat();
  }
  return m.a.filter((x) => !ids.has(x));
}

/** All hits for a query: [{k, res, who}] */
function run(q, f, oppIds = null) {
  const me = q.wrestler ? resolve(q.wrestler) : null;
  const them = !oppIds && q.opponent ? resolve(q.opponent) : null;
  const ids = me ? idsFor(me) : null;
  const opp = oppIds || (them ? idsFor(them) : null);
  const ok = filterFn(f);
  const passes = (m, res) => (q.result === 'any' || res === q.result)
    && finishOk(m, q.finish)
    && (!q.type || m.types.includes(q.type));
  const pool = ids ? postingFor(ids) : null;
  const each = (fn) => { if (pool) for (const k of pool) fn(k); else for (let k = 0; k < M.length; k++) fn(k); };
  let hits = [];

  if (q.mode === 'debut' || q.mode === 'last') {
    const best = new Map();
    each((k) => {
      const m = M[k];
      if (!ok(m)) return;
      const key0 = EVENTS[m.e].c; // first / last match in WCW (incl. NWA) and in ECW
      if (ids) {
        if (!has(m.a, ids)) return;
        if (q.mode === 'last' || !best.has(key0)) best.set(key0, { k, res: resultFor(m, ids) });
      } else {
        for (const id of m.a) {
          if (isTeam(id)) continue;
          const key = `${key0}|${canonicalId(id)}`;
          if (q.mode === 'last' || !best.has(key)) {
            const res = m.w.includes(id) ? 'won' : m.l.includes(id) ? 'lost' : m.o === 'draw' ? 'draw' : 'unknown';
            best.set(key, { k, res, who: prettyName(canonicalId(id)) });
          }
        }
      }
    });
    hits = [...best.values()];
    if (opp) hits = hits.filter((h) => has(M[h.k].a, opp));
    hits = hits.filter((h) => passes(M[h.k], h.res));
    hits.sort((a, b) => a.k - b.k);
  } else {
    each((k) => {
      const m = M[k];
      if (!ok(m)) return;
      let res = m.o === 'draw' ? 'draw' : 'unknown';
      if (ids) {
        const isW = has(m.w, ids), isL = has(m.l, ids);
        if (opp) {
          const others = opponentsOf(m, ids);
          if (!others || !has(others, opp)) return; // partners aren't opponents
        }
        res = isW ? 'won' : isL ? 'lost' : res;
      } else if (q.result === 'won' || q.result === 'lost') {
        res = m.o === 'win' ? q.result : res;
      }
      if (!passes(m, res)) return;
      hits.push({ k, res });
    });
  }
  return { hits, me, them, ids, opp, ok };
}

/* ---------------- "never" questions: X never beat Y (or Z), who never beat X */
function never(q, f) {
  const me = resolve(q.wrestler);
  const ids = idsFor(me);
  const ok = filterFn(f);
  const fits = (m) => ok(m) && (!q.type || m.types.includes(q.type));
  // A win only counts if it ended the way the finish filter says ("clean" leaves out DQs and count-outs).
  const counted = (m, res) => res !== 'won' && res !== 'lost' ? res : finishOk(m, q.finish) ? res : 'other';
  const tally = new Map();
  for (const k of postingFor(ids)) {
    const m = M[k];
    if (!fits(m)) continue;
    const others = opponentsOf(m, ids);
    if (!others || others.length > 6) continue;
    const res = counted(m, resultFor(m, ids));
    const seen = new Set();
    for (const id of others) {
      if (ids.has(id)) continue;
      const key = canonicalId(id);
      if (seen.has(key)) continue;
      seen.add(key);
      const t = tally.get(key) || { n: 0, won: 0, lost: 0, draw: 0, other: 0, team: isTeam(id), ks: [] };
      t.n++; t[res === 'unknown' ? 'other' : res]++; t.ks.push(k);
      tally.set(key, t);
    }
  }
  const g = (r) => ({ key: r.key, name: prettyName(r.key), guessed: r.guessed, typed: r.typed || '', others: (r.others || []).map(([n, c]) => ({ name: prettyName(n), n: c })), known: idsFor(r).size > 0 });
  const out = { never: q.never, me: g(me), type: q.type, finish: q.finish };
  const key = q.never === 'beat' ? 'won' : 'lost';
  if (q.overall) {
    // "Goldberg never lost": every match they had, with these filters.
    const t = { n: 0, won: 0, lost: 0, draw: 0, other: 0 };
    const all = [];
    for (const k of postingFor(ids)) {
      const m = M[k];
      if (!fits(m)) continue;
      const res = counted(m, resultFor(m, ids));
      t.n++; t[res === 'unknown' ? 'other' : res]++;
      all.push({ k, res: resultFor(m, ids), counted: res });
    }
    out.overall = { ...t, holds: t[key] === 0 };
    // Show the ones that break it (the losses / the wins); if it holds, every match.
    const hits = out.overall.holds ? all : all.filter((h) => h.counted === key);
    out.total = hits.length;
    out.listing = out.overall.holds ? 'all' : key;
    last = f.order === 'newest' ? hits.reverse() : hits;
    out.rows = last.slice(0, 300).map(row);
    return out;
  }
  if (q.opponents.length) {
    const ks = new Set();
    out.verdicts = q.opponents.map((name) => {
      const r = resolve(name);
      const oppIds = idsFor(r);
      const t = { n: 0, won: 0, lost: 0, draw: 0, other: 0 };
      for (const k of postingFor(ids)) {
        const m = M[k];
        if (!fits(m)) continue;
        const others = opponentsOf(m, ids);
        if (!others || !has(others, oppIds)) continue;
        const res = counted(m, resultFor(m, ids));
        t.n++; t[res === 'unknown' ? 'other' : res]++;
        ks.add(k);
      }
      return { opp: g(r), ...t, holds: t[key] === 0 };
    });
    const hits = [...ks].sort((a, b) => a - b).map((k) => ({ k, res: resultFor(M[k], ids) }));
    out.total = hits.length;
    last = f.order === 'newest' ? hits.reverse() : hits;
    out.rows = last.slice(0, 300).map(row);
    return out;
  }
  const min = Math.max(1, +f.min || 1);
  out.table = [...tally].filter(([, t]) => t[key] === 0 && t.n >= min && (f.teams || !t.team))
    .sort((a, b) => b[1].n - a[1].n).slice(0, 400)
    .map(([n, t]) => ({ name: prettyName(n), n: t.n, won: t.won, lost: t.lost, draw: t.draw, other: t.other, team: t.team }));
  out.total = out.table.length;
  out.faced = [...tally].filter(([, t]) => t.n >= min && (f.teams || !t.team)).length;
  last = [];
  return out;
}

/* ---------------- a wrestler's profile (record, years, opponents, eras) */
function profile(ids, ok, only = null, type = '') {
  const rec = { won: 0, lost: 0, draw: 0, unknown: 0 };
  const overall = { won: 0, lost: 0, draw: 0, unknown: 0 }; // before the match-type filter
  const byCo = {}, byYear = {}, opps = new Map(), types = new Map(), partners = new Map();
  let first = -1, lastK = -1, titles = 0, titleWins = 0;
  for (const k of only || postingFor(ids)) {
    const m = M[k];
    if (!ok(m)) continue;
    const res = resultFor(m, ids);
    overall[res]++;
    if (type && !m.types.includes(type)) continue; // the panel follows the match type being looked at
    const ev = EVENTS[m.e];
    rec[res]++;
    const c = byCo[ev.era] = byCo[ev.era] || { n: 0, won: 0, lost: 0, from: ev.d, to: ev.d };
    c.n++; if (res === 'won') c.won++; if (res === 'lost') c.lost++; c.to = ev.d;
    const y = year(ev.d);
    const yb = byYear[y] = byYear[y] || { n: 0, won: 0, lost: 0 };
    yb.n++; if (res === 'won') yb.won++; if (res === 'lost') yb.lost++;
    if (first < 0) first = k;
    lastK = k;
    if (m.types.includes('Title match')) { titles++; if (res === 'won') titleWins++; }
    for (const t of m.types) {
      if (t === 'Title match') continue;
      const tb = types.get(t) || { n: 0, won: 0, lost: 0, draw: 0 };
      tb.n++; if (res === 'won') tb.won++; if (res === 'lost') tb.lost++; if (res === 'draw') tb.draw++;
      types.set(t, tb);
    }
    const mine = m.sd.length >= 2 ? m.sd.find((s) => has(s, ids)) : null;
    if (mine) for (const id of mine) if (!ids.has(id) && !isTeam(id)) { const key = canonicalId(id); partners.set(key, (partners.get(key) || 0) + 1); }
    const other = opponentsOf(m, ids);
    if (!other || other.length > 6) continue; // battle royals say little about rivals
    const seen = new Set();
    for (const id of other) {
      const key = canonicalId(id);
      if (seen.has(key) || ids.has(id) || isTeam(id)) continue;
      seen.add(key);
      const o = opps.get(key) || { n: 0, won: 0, lost: 0 };
      o.n++; if (res === 'won') o.won++; if (res === 'lost') o.lost++;
      opps.set(key, o);
    }
  }
  const top = (map, n) => [...map].sort((a, b) => (b[1].n || b[1]) - (a[1].n || a[1])).slice(0, n);
  return {
    rec, overall, type, byCo, byYear, titles, titleWins,
    opponents: top(opps, 12).map(([n, o]) => ({ name: prettyName(n), ...o })),
    partners: top(partners, 6).map(([n, c]) => ({ name: prettyName(n), n: c })),
    types: top(types, 12).map(([t, b]) => ({ t, ...b })),
    first: first >= 0 ? row({ k: first, res: resultFor(M[first], ids) }) : null,
    last: lastK >= 0 ? row({ k: lastK, res: resultFor(M[lastK], ids) }) : null,
  };
}

function row(h) {
  const m = M[h.k], ev = EVENTS[m.e];
  return { k: h.k, e: m.e, d: ev.d, c: ev.c, era: ev.era, kind: ev.k, s: ev.s, t: ev.t, line: ev.m[m.i], res: h.res, who: h.who || '', dark: m.dark, dq: m.dq, co: m.co, runIn: m.runIn };
}

function search({ q, f, order }) {
  if (q.never && q.wrestler) return never(q, { ...f, order });
  const { hits, me, them, ids, ok } = run(q, f);
  if (order === 'newest') hits.reverse();
  last = hits;
  const out = { total: hits.length, rows: hits.slice(0, 300).map(row), page: 0 };
  const g = (r) => (r ? { key: r.key, name: prettyName(r.key), guessed: r.guessed, typed: r.typed || '', others: (r.others || []).map(([n, c]) => ({ name: prettyName(n), n: c })), aka: ((ALIAS_GROUPS.find((x) => normName(x[0]) === r.key) || []).slice(1, 5)), known: idsFor(r).size > 0 } : null);
  out.me = g(me);
  out.them = g(them);
  if (ids && ids.size && q.mode === 'all') {
    // Against one opponent the panel shows just those matches (head to head).
    const only = them ? run({ ...q, result: 'any', finish: 'any', type: '' }, f).hits.map((h) => h.k) : null;
    out.profile = profile(ids, ok, only, q.type);
  }
  if (q.dark !== 'only' && (f.dark || 'hide') === 'hide') out.darkHidden = run(q, { ...f, dark: 'only' }).hits.length;
  return out;
}

function events({ f, text, order }) {
  const from = +f.from || 0, to = +f.to || 9999;
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  let list = [];
  for (let e = 0; e < EVENTS.length; e++) {
    const ev = EVENTS[e];
    if (f.eras && f.eras.length && !f.eras.includes(ev.era)) continue;
    const y = year(ev.d);
    if (y < from || y > to) continue;
    if (f.kind && f.kind !== 'all' && (f.kind === 'tv' ? !(ev.k === 'tv' || ev.k === 'event') : ev.k !== f.kind)) continue;
    if (f.show && ev.g !== f.show) continue;
    if (words.length) {
      const hay = `${ev.t} ${ev.s} ${ev.v} ${ev.d} ${ev.g}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    list.push(e);
  }
  if (order === 'newest') list.reverse();
  const total = list.length;
  return { total, rows: list.slice(0, 1000).map((e) => { const ev = EVENTS[e]; return { e, d: ev.d, c: ev.c, era: ev.era, kind: ev.k, s: ev.s, t: ev.t, v: ev.v, n: ev.m.length }; }) };
}

function eventDetail({ e }) {
  const ev = EVENTS[e];
  if (!ev) return null;
  return { e, d: ev.d, c: ev.c, era: ev.era, kind: ev.k, s: ev.s, t: ev.t, v: ev.v, matches: ev.m, dark: ev.m.map(isOffAir), url: WIKI + encodeURIComponent(ev.t.replace(/ /g, '_')).replace(/%2F/g, '/') };
}

const JUNK = /\b(?:by|count|out|champion|championship|fought|title|contest|disqualification|match|defeated|winner|retain|heavyweight|undisputed)\b/;
function suggest({ text }) {
  const t = normName(text);
  if (t.length < 2) return [];
  const words = t.split(' ');
  const out = [];
  for (let id = 0; id < NAMES.length; id++) {
    const n = NAMES[id];
    const parts = n.split(' ');
    if (parts.length > 4 || JUNK.test(n)) continue;
    if (!words.every((w) => parts.some((p) => p.startsWith(w)))) continue;
    out.push([n, POST[id].length]);
  }
  out.sort((a, b) => b[1] - a[1]);
  const seen = new Set();
  const res = [];
  for (const [n, c] of out) {
    const key = canonicalId(NAME_ID.get(n));
    if (seen.has(key)) continue;
    seen.add(key);
    res.push({ name: prettyName(n), n: c });
    if (res.length >= 8) break;
  }
  return res;
}

onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    let result;
    if (type === 'load') return await load();
    if (type === 'search') result = search(data);
    else if (type === 'page') result = { rows: (last || []).slice(data.offset, data.offset + 300).map(row) };
    else if (type === 'events') result = events(data);
    else if (type === 'event') result = eventDetail(data);
    else if (type === 'suggest') result = suggest(data);
    postMessage({ id, result });
  } catch (error) {
    postMessage({ id, error: String(error && error.stack || error) });
    if (type === 'load') postMessage({ type: 'failed', error: String(error) });
  }
};
