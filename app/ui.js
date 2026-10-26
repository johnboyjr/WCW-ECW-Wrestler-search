'use strict';
/* WCW Match Search Engine — the window. All searching happens in engine.js (a worker). */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : iso; };
const n = (x) => (x || 0).toLocaleString();
const NWA_END = '1988-11-21';
const ERA = { nwa: 'NWA', wcw: 'WCW', ecw: 'ECW', wecw: 'WWE ECW' };
const ERA_LONG = { nwa: 'NWA / Jim Crockett era', wcw: 'WCW', ecw: 'ECW', wecw: 'WWE’s ECW brand' };
const KIND = { tv: 'TV', ppv: 'PPV', house: 'House show', event: 'Show' };
/** The company as it was called on that date. */
const badge = (era) => `<i class="badge co-${era}">${ERA[era] || ''}</i>`;

/* ---------------- worker */
const worker = new Worker('engine.js');
let seq = 0;
const waiting = new Map();
let info = null;
function ask(type, data = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...data });
  });
}
worker.onmessage = ({ data }) => {
  if (data.type === 'progress') {
    $('#load-text').textContent = `Reading ${n(data.total)} matches… ${Math.floor((data.done / data.total) * 100)}%`;
    $('#load-bar').style.width = `${(data.done / data.total) * 100}%`;
    return;
  }
  if (data.type === 'ready') { info = data.info; ready(); return; }
  if (data.type === 'failed') { $('#load-text').textContent = `Couldn’t open the database: ${data.error}`; return; }
  const w = waiting.get(data.id);
  if (!w) return;
  waiting.delete(data.id);
  if (data.error) { console.error(data.error); w.reject(new Error(data.error)); } else w.resolve(data.result);
};

/* ---------------- state (remembered between visits) */
const DEFAULTS = { tab: 'matches', text: '', eras: [], never: '', show: '', min: '1', from: '', to: '', kind: 'all', order: 'oldest', result: 'any', finish: 'any', mode: 'all', dark: 'hide', type: '', showText: '' };
let st = { ...DEFAULTS };
try { Object.assign(st, JSON.parse(localStorage.getItem('state') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('state', JSON.stringify(st)); } catch {} };

function chips(el, key, options, multi = false) {
  el.innerHTML = options.map(([k, label, cls]) => `<button class="chip${cls ? ` ${cls}` : ''}" data-k="${esc(k)}">${esc(label)}</button>`).join('');
  const sync = () => el.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', multi ? (b.dataset.k === '' ? !st[key].length : st[key].includes(b.dataset.k)) : st[key] === b.dataset.k));
  el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    if (multi) {
      const k = b.dataset.k;
      st[key] = k === '' ? [] : st[key].includes(k) ? st[key].filter((x) => x !== k) : [...st[key], k];
    } else st[key] = b.dataset.k;
    if (st.fromText) delete st.fromText[key];
    sync(); save(); refresh();
  }));
  sync();
  el.sync = sync;
}
const allChips = () => document.querySelectorAll('.group').forEach((g) => g.sync && g.sync());

function buildControls() {
  chips($('#f-era'), 'eras', [['', 'Everything'], ['nwa', 'NWA / Crockett', 'co-nwa'], ['wcw', 'WCW', 'co-wcw'], ['ecw', 'ECW', 'co-ecw'], ['wecw', 'WWE ECW', 'co-wecw']], true);
  chips($('#f-never'), 'never', [['', 'Any'], ['beat', 'Never beat…'], ['lost', 'Never lost to…'], ['overall', 'Never lost']]);
  chips($('#f-min'), 'min', [['1', 'Faced 1+ times'], ['2', '2+'], ['3', '3+'], ['5', '5+']]);
  const show = $('#f-show');
  show.innerHTML = `<option value="">Every show</option>${info.shows.map(([g, c]) => `<option value="${esc(g)}">${esc(g)} (${n(c)})</option>`).join('')}`;
  show.value = st.show;
  show.addEventListener('change', () => { st.show = show.value; save(); refresh(); });
  chips($('#f-kind'), 'kind', [['all', 'All shows'], ['tv', 'TV'], ['ppv', 'PPV'], ['house', 'House shows']]);
  chips($('#f-order'), 'order', [['oldest', 'Oldest first'], ['newest', 'Newest first']]);
  chips($('#f-result'), 'result', [['any', 'Any result'], ['won', 'Won'], ['lost', 'Lost'], ['draw', 'Draw / NC']]);
  chips($('#f-finish'), 'finish', [['any', 'Any finish'], ['clean', 'Clean (pin / submission)'], ['dq', 'DQ'], ['runin', 'DQ (run-in)']]);
  chips($('#f-mode'), 'mode', [['all', 'All matches'], ['debut', 'Debuts'], ['last', 'Last matches']]);
  chips($('#f-dark'), 'dark', [['hide', 'Hide dark'], ['show', 'Include dark'], ['only', 'Only dark']]);
  const type = $('#f-type');
  // Only the match types that actually happened in NWA / WCW, with how many.
  type.innerHTML = `<option value="">Any match type</option>${info.types.map(([t, c]) => `<option value="${esc(t)}">${esc(t)} (${n(c)})</option>`).join('')}`;
  type.value = st.type;
  type.addEventListener('change', () => { st.type = type.value; if (st.fromText) delete st.fromText.type; save(); refresh(); });
  const [y0, y1] = info.years;
  const years = []; for (let y = y0; y <= y1; y++) years.push(y);
  $('#f-from').innerHTML = `<option value="">${y0}</option>${years.slice(1).map((y) => `<option>${y}</option>`).join('')}`;
  $('#f-to').innerHTML = `${years.slice(0, -1).map((y) => `<option>${y}</option>`).join('')}<option value="">${y1}</option>`;
  $('#f-from').value = st.from; $('#f-to').value = st.to;
  for (const id of ['from', 'to']) $(`#f-${id}`).addEventListener('change', (e) => { st[id] = e.target.value; save(); refresh(); });
  $('#reset').addEventListener('click', () => {
    Object.assign(st, { eras: [], never: '', show: '', min: '1', from: '', to: '', kind: 'all', result: 'any', finish: 'any', mode: 'all', dark: 'hide', type: '', fromText: {} });
    $('#f-from').value = ''; $('#f-to').value = ''; type.value = ''; show.value = '';
    allChips(); save(); refresh();
  });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  const q = $('#q');
  q.value = st.tab === 'shows' ? st.showText : st.text;
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (st.tab === 'shows') { st.showText = q.value; save(); refresh(); return; }
      st.text = q.value;
      // Words in the box set the filters; the buttons can still change them.
      // A filter set by a word goes back to its default when the word is removed.
      const p = parseQuery(st.text);
      const said = { result: p.result !== 'any' && p.result, finish: p.finish !== 'any' && p.finish, mode: p.mode !== 'all' && p.mode, dark: p.dark, type: p.type, never: p.never && (p.overall ? 'overall' : p.never) };
      st.fromText = st.fromText || {};
      for (const k of Object.keys(said)) {
        if (said[k]) { st[k] = said[k]; st.fromText[k] = true; }
        else if (st.fromText[k]) { st[k] = DEFAULTS[k]; delete st.fromText[k]; }
      }
      $('#f-type').value = st.type;
      allChips(); save(); refresh();
      suggestFor(p.opponents && p.opponents.length ? p.opponents[p.opponents.length - 1] : p.opponent || p.wrestler);
    }, 200);
  });
  q.addEventListener('keydown', (e) => {
    const box = $('#suggest');
    const items = [...box.querySelectorAll('button')];
    const at = items.findIndex((b) => b.classList.contains('hl'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (box.hidden || !items.length) return;
      e.preventDefault();
      const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((b, i) => b.classList.toggle('hl', i === next));
    } else if (e.key === 'Enter') {
      if (!box.hidden && at >= 0) { e.preventDefault(); items[at].click(); } else box.hidden = true;
    } else if (e.key === 'Escape') box.hidden = true;
  });
  q.addEventListener('blur', () => setTimeout(() => { $('#suggest').hidden = true; }, 150));
  $('#dbbtn').addEventListener('click', showDatabase);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  setTab(st.tab, true);
}

/* ---------------- name suggestions */
let suggestSeq = 0;
async function suggestFor(part) {
  const box = $('#suggest');
  const mine = ++suggestSeq;
  if (!part || part.length < 2 || st.tab !== 'matches') { box.hidden = true; return; }
  const list = await ask('suggest', { text: part });
  if (mine !== suggestSeq) return;
  const exact = list.some((x) => x.name.toLowerCase() === part.trim().toLowerCase());
  if (!list.length || exact) { box.hidden = true; return; }
  box.innerHTML = list.map((s) => `<button data-name="${esc(s.name)}"><span>${esc(s.name)}</span><small>${n(s.n)} ${s.n === 1 ? 'match' : 'matches'}</small></button>`).join('');
  box.hidden = false;
  box.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const q = $('#q');
    const lower = q.value.toLowerCase();
    const i = lower.lastIndexOf(part.toLowerCase());
    q.value = i >= 0 ? q.value.slice(0, i) + b.dataset.name + q.value.slice(i + part.length) : b.dataset.name;
    box.hidden = true;
    q.dispatchEvent(new Event('input'));
    suggestSeq++;
  }));
}

/* ---------------- tabs */
function setTab(tab, first = false) {
  st.tab = tab; save();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  document.body.dataset.tab = tab;
  const q = $('#q');
  q.value = tab === 'shows' ? st.showText : st.text;
  q.placeholder = tab === 'shows' ? 'Find a show…  e.g. Starrcade 1985 · Halloween Havoc · Nitro 1998 · Clash of the Champions' : 'Search a wrestler…  e.g. Hulk Hogan never beat Sting in a singles match · Sting vs Ric Flair · Goldberg debut';
  $('#suggest').hidden = true;
  if (!first) q.focus();
  refresh();
}
const filters = () => ({ eras: st.eras, show: st.show, min: st.min, from: st.from, to: st.to, kind: st.kind, dark: st.dark });

/* ---------------- searching */
let searchSeq = 0;
let lastResult = null;
async function refresh() {
  if (!info) return;
  const mine = ++searchSeq;
  if (st.tab === 'shows') return refreshShows(mine);
  const p = parseQuery(st.text);
  // The "Never" buttons ask the same thing as typing "never beat" / "never lost to" / "never lost".
  if (!p.never && st.never && p.wrestler) {
    p.never = st.never === 'overall' ? 'lost' : st.never;
    p.overall = st.never === 'overall';
    p.opponents = p.overall ? [] : p.opponent ? [p.opponent] : [];
  }
  const q = { ...p, result: st.result, finish: st.finish, type: st.type, mode: st.mode, dark: st.dark };
  if (!q.wrestler && !q.type && q.finish === 'any' && q.mode === 'all' && q.dark !== 'only') { home(); return; }
  const res = await ask('search', { q, f: filters(), order: st.order });
  if (mine !== searchSeq) return;
  lastResult = { q, res, rows: res.rows || [] };
  document.body.dataset.never = res.never && !res.verdicts && !res.overall ? 'list' : '';
  if (res.never) { paintNever(); return; }
  paintResults();
  paintProfile();
}

function home() {
  const by = info.by;
  $('#results').innerHTML = `<div class="hello">
    <h2>Every NWA, WCW and ECW match, one search.</h2>
    <p>${n(info.matches)} matches from ${n(info.events)} shows. Type a wrestler, or try one of these:</p>
    <div class="examples">${['Hulk Hogan never beat Sting or Arn Anderson in a singles match', 'Goldberg never lost', 'Who never beat Ric Flair', 'Taz never lost to', 'Sting vs Ric Flair', 'Sabu vs Taz', 'Goldberg debut', 'WarGames', 'Singapore cane', 'Rob Van Dam ladder', 'Hogan DQ run-in', 'Terry Funk']
      .map((x) => `<button class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="cogrid">${Object.keys(ERA).map((c) => `<div class="cobox co-${c}"><b>${esc(ERA_LONG[c])}</b><strong>${n(by[c].matches)}</strong><span>matches · ${n(by[c].events)} shows</span><span>${by[c].from ? `${by[c].from.slice(0, 4)}–${by[c].to.slice(0, 4)}` : 'none yet'}</span></div>`).join('')}</div>
    <p class="credit">Results from the Pro Wrestling Wiki (prowrestling.fandom.com), CC BY-SA.</p>
  </div>`;
  $('#results').querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
    Object.assign(st, { result: 'any', finish: 'any', mode: 'all', dark: 'hide', type: '', fromText: {} });
    $('#f-type').value = '';
    $('#q').value = b.dataset.ex;
    $('#q').dispatchEvent(new Event('input'));
  }));
  $('#side').innerHTML = '';
  $('#side').classList.remove('has');
}

/* ---------------- "never" questions */
const typePhrase = (q) => (q.type ? (q.type === 'Singles' ? ' in a singles match' : q.type === 'Tag team' ? ' in a tag team match' : q.type === 'Title match' ? ' in a title match' : ` in a ${q.type} match`) : '');
const finishPhrase = (q) => (q.finish === 'clean' ? ' cleanly (pinfall or submission)' : q.finish === 'dq' ? ' by DQ' : '');
const times = (x) => `${n(x)} ${x === 1 ? 'time' : 'times'}`;
function paintNever() {
  const { q, res } = lastResult;
  const el = $('#results');
  const side = $('#side');
  side.innerHTML = ''; side.classList.remove('has');
  const me = res.me;
  const fuzzy = (who) => (who && who.typed ? `<div class="also"><span>No one called “${esc(who.typed)}” — showing <b>${esc(who.name)}</b>.</span></div>` : '');
  const aboutFinish = q.finish === 'clean' ? '' : '<p class="note">Wins by DQ and count-out count as wins here. Pick “Clean (pin / submission)” to count only pinfalls and submissions.</p>';
  if (!me.known) { el.innerHTML = `<div class="empty">No wrestler called “${esc(q.wrestler)}” in the database.</div>`; return; }
  if (res.overall) {
    const v = res.overall;
    const lostWord = q.never === 'lost';
    const short = me.name.split(' ').slice(-1)[0];
    const record = `${n(v.n)} ${v.n === 1 ? 'match' : 'matches'}: <b class="won">${n(v.won)}</b> wins · <b class="lost">${n(v.lost)}</b> losses · <b>${n(v.draw)}</b> draws / no contests${v.other ? ` · ${n(v.other)} other` : ''}`;
    const card = !v.n ? `<div class="verdict unknown"><span class="mark2">–</span><div><h3>No ${esc(me.name)} matches${esc(typePhrase(q))} with these filters</h3></div></div>`
      : v.holds ? `<div class="verdict yes"><span class="mark2">✓</span><div><small>TRUE</small><h3>${esc(me.name)} never ${lostWord ? 'lost' : 'won'}${esc(typePhrase(q))}${esc(finishPhrase(q))}.</h3><p>${record}</p></div></div>`
      : `<div class="verdict no"><span class="mark2">✗</span><div><small>NOT TRUE</small><h3>${esc(me.name)} ${lostWord ? 'lost' : 'won'} ${times(lostWord ? v.lost : v.won)}${esc(typePhrase(q))}${esc(finishPhrase(q))}.</h3><p>${record}</p></div></div>`;
    el.innerHTML = `${fuzzy(me)}<div class="verdicts">${card}</div>${q.finish === 'clean' ? '' : `<p class="note">Losses by DQ and count-out count here. Pick “Clean (pin / submission)” to count only pinfalls and submissions.</p>`}
      ${res.total ? `<div class="summary"><h2>${v.holds ? 'Every match' : lostWord ? `${esc(short)}’s losses` : `${esc(short)}’s wins`}</h2><span class="count"><b>${n(res.total)}</b> ${res.total === 1 ? 'match' : 'matches'}</span></div>
      <div class="list" id="list">${res.rows.map((r) => rowHtml(r, false)).join('')}</div>
      ${res.rows.length < res.total ? `<button class="more" id="more">Show more (${n(res.total - res.rows.length)} left)</button>` : ''}` : ''}`;
    wireRows(el);
    wireMore(res);
    return;
  }
  if (res.verdicts) {
    const what = q.never === 'beat' ? 'beat' : 'lost to';
    const cards = res.verdicts.map((v) => {
      const sentence = `${esc(me.name)} never ${what} ${esc(v.opp.name)}${esc(typePhrase(q))}${esc(finishPhrase(q))}.`;
      const record = `${times(v.n).replace(/times?$/, v.n === 1 ? 'match' : 'matches')}: <b class="won">${n(v.won)}</b> ${esc(me.name.split(' ').slice(-1)[0])} wins · <b class="lost">${n(v.lost)}</b> losses · <b>${n(v.draw)}</b> draws / no contests${v.other ? ` · ${n(v.other)} other` : ''}`;
      if (!v.opp.known) return `<div class="verdict unknown"><span class="mark2">?</span><div><h3>No wrestler called “${esc(v.opp.name)}”</h3></div></div>`;
      if (!v.n) return `<div class="verdict unknown"><span class="mark2">–</span><div><h3>${esc(me.name)} and ${esc(v.opp.name)} never met${esc(typePhrase(q))}</h3><p>Not in this database, with these filters.</p></div></div>`;
      return v.holds
        ? `<div class="verdict yes"><span class="mark2">✓</span><div><small>TRUE</small><h3>${sentence}</h3><p>${record}</p>${fuzzy(v.opp)}</div></div>`
        : `<div class="verdict no"><span class="mark2">✗</span><div><small>NOT TRUE</small><h3>${esc(me.name)} ${q.never === 'beat' ? `beat ${esc(v.opp.name)} ${times(v.won)}` : `lost to ${esc(v.opp.name)} ${times(v.lost)}`}${esc(typePhrase(q))}${esc(finishPhrase(q))}.</h3><p>${record}</p>${fuzzy(v.opp)}</div></div>`;
    }).join('');
    el.innerHTML = `${fuzzy(me)}<div class="verdicts">${cards}</div>${aboutFinish}
      ${res.total ? `<div class="summary"><h2>The matches</h2><span class="count"><b>${n(res.total)}</b> ${res.total === 1 ? 'match' : 'matches'}</span></div>
      <div class="list" id="list">${res.rows.map((r) => rowHtml(r, false)).join('')}</div>
      ${res.rows.length < res.total ? `<button class="more" id="more">Show more (${n(res.total - res.rows.length)} left)</button>` : ''}` : ''}`;
    wireRows(el);
    wireMore(res);
    return;
  }
  // No opponent named: everyone they faced and never beat / never lost to.
  const title = q.never === 'beat' ? `Who ${esc(me.name)} never beat` : `Who never beat ${esc(me.name)}`;
  el.innerHTML = `${fuzzy(me)}<div class="summary"><h2>${title}<small>${esc(typePhrase(q))}${esc(finishPhrase(q))}</small></h2>
      <span class="count"><b>${n(res.total)}</b> of the ${n(res.faced)} opponents faced ${st.min === '1' ? '' : `${st.min}+ times `}</span></div>
    <p class="note">${q.never === 'beat' ? `Opponents ${esc(me.name)} faced but never beat` : `Opponents who faced ${esc(me.name)} and never beat him (he never lost to them)`}${esc(typePhrase(q))}. Most-faced first. Use “Faced 2+ times” to hide one-off matches. Click a name for the full head to head.</p>
    ${aboutFinish}
    ${res.table.length ? `<div class="list nevers"><div class="row nrow nhead"><span>Opponent</span><span>Met</span><span>${esc(me.name)}’s record against them</span></div>${res.table.map((t) => `<button class="row nrow" data-vs="${esc(t.name)}">
        <span class="nname">${esc(t.name)}${t.team ? ' <em>team</em>' : ''}</span>
        <span class="nnum">${n(t.n)} ${t.n === 1 ? 'match' : 'matches'}</span>
        <span class="wl"><b class="won">${t.won}</b> W · <b class="lost">${t.lost}</b> L · <b>${t.draw}</b> D${t.other ? ` · ${t.other} other` : ''}</span></button>`).join('')}</div>` : '<div class="empty">Nobody — with these filters there’s no one on that list.</div>'}`;
  el.querySelectorAll('[data-vs]').forEach((b) => b.addEventListener('click', () => {
    const typeWords = q.type ? ` ${q.type.toLowerCase()}` : '';
    $('#q').value = q.never === 'beat' ? `${me.name} never beat ${b.dataset.vs}${typeWords}` : `${me.name} never lost to ${b.dataset.vs}${typeWords}`;
    $('#q').dispatchEvent(new Event('input'));
  }));
}
function wireMore(res) {
  $('#more')?.addEventListener('click', async () => {
    const more = await ask('page', { offset: lastResult.rows.length });
    lastResult.rows.push(...more.rows);
    $('#list').insertAdjacentHTML('beforeend', more.rows.map((r) => rowHtml(r, true)).join(''));
    wireRows($('#list'));
    const left = res.total - lastResult.rows.length;
    if (left > 0) $('#more').textContent = `Show more (${n(left)} left)`; else $('#more').remove();
  });
}

function describe(q, res) {
  const bits = [];
  if (q.wrestler) bits.push(esc(res.me ? res.me.name : q.wrestler) + (q.opponent ? ` <span class="vs">vs</span> ${esc(res.them ? res.them.name : q.opponent)}` : ''));
  const what = [q.type, { won: 'wins', lost: 'losses', draw: 'draws' }[q.result], { dq: 'by DQ', runin: 'DQs with a run-in', clean: 'clean finishes' }[q.finish]].filter(Boolean);
  if (q.mode === 'debut') bits.push(q.wrestler ? '<small>first match in WCW and in ECW</small>' : 'Debuts');
  if (q.mode === 'last') bits.push(q.wrestler ? '<small>last match in WCW and in ECW</small>' : 'Last matches');
  if (what.length) bits.push(`<small>${esc(what.join(' · '))}</small>`);
  if (q.dark === 'only') bits.push('<small>dark matches</small>');
  return bits.join(' ') || 'Matches';
}
const RES = { won: 'W', lost: 'L', draw: 'D', unknown: '–' };
function rowHtml(r, showWho) {
  return `<button class="row" data-e="${r.e}" data-k="${r.k}">
    <span class="date">${esc(dateLabel(r.d))}</span>
    <span class="show">${badge(r.era)}${esc(r.s)}${r.kind === 'ppv' ? ' <em>PPV</em>' : r.kind === 'house' ? ' <em>house</em>' : ''}</span>
    <span class="line">${showWho && r.who ? `<b>${esc(r.who)}</b> · ` : ''}${esc(r.line)}${r.dark ? ' <i class="tag dark">dark match</i>' : ''}${r.runIn ? ' <i class="tag">run-in</i>' : r.dq ? ' <i class="tag">DQ</i>' : r.co ? ' <i class="tag">count-out</i>' : ''}</span>
    <span class="res ${r.res}">${RES[r.res]}</span></button>`;
}
function paintResults() {
  const { q, res, rows } = lastResult;
  const el = $('#results');
  const also = (who, label, side) => (who && who.typed ? `<div class="also"><span>No one called “${esc(who.typed)}” — showing <b>${esc(who.name)}</b>.</span></div>`
    : who && who.guessed && who.others.length
    ? `<div class="also"><span>${esc(label)}</span>${who.others.map((o) => `<button class="chip" data-who="${esc(o.name)}" data-side="${side}">${esc(o.name)} <small>${n(o.n)}</small></button>`).join('')}</div>` : '');
  const unknown = (who) => who && !who.known ? `<div class="empty">No wrestler called “${esc(who.name)}” in the database. Check the spelling, or try their ring name from that era.</div>` : '';
  const head = `<div class="summary">
      <h2>${describe(q, res)}${res.me && res.me.aka.length ? ` <span class="aka">also ${esc(res.me.aka.join(', '))}</span>` : ''}</h2>
      <span class="count"><b>${n(res.total)}</b> ${q.mode === 'debut' ? 'debuts' : q.mode === 'last' ? 'last matches' : res.total === 1 ? 'match' : 'matches'}${res.darkHidden ? ` · ${n(res.darkHidden)} dark hidden` : ''}</span>
    </div>
    ${also(res.me, `Showing ${res.me ? res.me.name : ''}. Others named “${parseQuery(st.text).wrestler}”:`, 'me')}
    ${also(res.them, `Opponent: ${res.them ? res.them.name : ''}. Others:`, 'opp')}`;
  if (!res.total) {
    el.innerHTML = `${head}${unknown(res.me) || unknown(res.them) || `<div class="empty">No matches found with these filters.${q.finish === 'runin' ? ' The run-in filter only finds DQs where the result mentions the interference.' : ''}</div>`}`;
  } else {
    el.innerHTML = `${head}${q.mode !== 'all' ? `<p class="note">${q.mode === 'debut' ? 'First' : 'Last'} match in WCW (including NWA) and in ECW in this database — the earliest/latest show with results, which can differ from a wrestler’s real ${q.mode === 'debut' ? 'debut' : 'final match'}.</p>` : ''}
      <div class="list" id="list">${rows.map((r) => rowHtml(r, true)).join('')}</div>
      ${rows.length < res.total ? `<button class="more" id="more">Show more (${n(res.total - rows.length)} left)</button>` : ''}`;
  }
  el.querySelectorAll('[data-who]').forEach((b) => b.addEventListener('click', () => {
    const p = parseQuery(st.text);
    const me = b.dataset.side === 'me' ? b.dataset.who : p.wrestler;
    const them = b.dataset.side === 'opp' ? b.dataset.who : p.opponent;
    $('#q').value = `${me}${them ? ` vs ${them}` : ''}`;
    $('#q').dispatchEvent(new Event('input'));
  }));
  wireRows(el);
  wireMore(res);
}
function wireRows(root) {
  root.querySelectorAll('.row:not(.wired)').forEach((b) => {
    b.classList.add('wired');
    b.addEventListener('click', () => openEvent(+b.dataset.e, b.dataset.k ? +b.dataset.k : null, b));
  });
}

/* ---------------- the wrestler panel */
function paintProfile() {
  const side = $('#side');
  const { q, res } = lastResult;
  const p = res.profile;
  if (!p) { side.innerHTML = ''; side.classList.remove('has'); return; }
  side.classList.add('has');
  const total = p.rec.won + p.rec.lost + p.rec.draw + p.rec.unknown;
  const pct = (x) => (total ? (x / total) * 100 : 0);
  const years = Object.keys(p.byYear).map(Number).sort((a, b) => a - b);
  const span = years.length ? [years[0], years[years.length - 1]] : [];
  const allYears = []; for (let y = span[0]; y <= span[1]; y++) allYears.push(y);
  const max = Math.max(1, ...Object.values(p.byYear).map((b) => b.n));
  const name = res.me.name;
  const pc = (x, of) => (of ? `${Math.round((x / of) * 100)}%` : '–');
  const ot = p.overall.won + p.overall.lost + p.overall.draw + p.overall.unknown;
  const typeName = p.type === 'Singles' ? 'Singles matches' : p.type === 'Tag team' ? 'Tag team matches' : p.type === 'Title match' ? 'Title matches' : `${p.type} matches`;
  side.innerHTML = `<div class="profile">
    <h3>${esc(name)}${q.opponent ? ` <span class="vs">vs</span> ${esc(res.them.name)}` : ''}</h3>
    ${q.opponent ? `<div class="h2h">Head to head${st.result !== 'any' || st.finish !== 'any' ? ' (before the result and finish filters)' : ''}</div>` : ''}
    ${p.type ? `<div class="typepill"><span>${esc(typeName)} only</span><button id="p-alltypes">Show all matches</button></div>` : ''}
    <div class="record">
      <div><strong>${n(total)}</strong><span>matches</span></div>
      <div><strong class="won">${n(p.rec.won)}</strong><span>${q.opponent ? `${esc(name.split(' ').slice(-1)[0])} won` : 'wins'}</span><em class="won">${pc(p.rec.won, total)}</em></div>
      <div><strong class="lost">${n(p.rec.lost)}</strong><span>${q.opponent ? `${esc(res.them.name.split(' ').slice(-1)[0])} won` : 'losses'}</span><em class="lost">${pc(p.rec.lost, total)}</em></div>
      <div><strong>${n(p.rec.draw)}</strong><span>draws / NC</span><em>${pc(p.rec.draw, total)}</em></div>
    </div>
    <div class="split"><i class="won" style="width:${pct(p.rec.won)}%"></i><i class="lost" style="width:${pct(p.rec.lost)}%"></i><i class="draw" style="width:${pct(p.rec.draw)}%"></i></div>
    <p class="small">Wins ${pc(p.rec.won, p.rec.won + p.rec.lost)} of the matches with a winner${p.rec.unknown ? ` · ${n(p.rec.unknown)} more where the result isn’t clear from the listing` : ''}.</p>
    ${p.type ? `<div class="compare"><span>Compared with all ${n(ot)} matches</span><span><b class="won">${pc(p.overall.won, ot)}</b> wins · <b class="lost">${pc(p.overall.lost, ot)}</b> losses · ${pc(p.overall.draw, ot)} draws</span></div>` : ''}
    <h4>By era</h4>
    <div class="cos">${Object.keys(ERA).filter((c) => p.byCo[c]).map((c) => { const b = p.byCo[c]; return `<button class="corow" data-co="${c}"><i class="badge co-${c}">${esc(ERA[c])}</i><span>${n(b.n)} ${b.n === 1 ? 'match' : 'matches'}</span><span class="wl"><b class="won">${b.won}</b>–<b class="lost">${b.lost}</b> <small>${pc(b.won, b.n)}</small></span><span class="yrs">${b.from.slice(0, 4)}–${b.to.slice(0, 4)}</span></button>`; }).join('')}</div>
    ${allYears.length > 1 ? `<h4>Matches per year</h4>
    <div class="years-chart" title="Click a year to see just that year">${allYears.map((y) => { const b = p.byYear[y] || { n: 0, won: 0, lost: 0 }; return `<button class="yr" data-y="${y}" title="${y}: ${b.n} matches, ${b.won}–${b.lost}"><i style="height:${(b.n / max) * 100}%"><s style="height:${b.n ? (b.won / b.n) * 100 : 0}%"></s></i></button>`; }).join('')}</div>
    <div class="years-axis"><span>${span[0]}</span><span>${span[1]}</span></div>` : ''}
    ${!q.opponent && p.opponents.length ? `<h4>Most-faced opponents</h4>
    <div class="opps">${p.opponents.map((o) => `<button class="opp" data-vs="${esc(o.name)}"><span>${esc(o.name)}</span><span class="wl">${o.n} · <b class="won">${o.won}</b>–<b class="lost">${o.lost}</b> <small>${pc(o.won, o.n)}</small></span></button>`).join('')}</div>` : ''}
    ${!q.opponent && p.partners.length ? `<h4>Most frequent partners</h4><div class="tags">${p.partners.map((x) => `<span>${esc(x.name)} <small>${x.n}</small></span>`).join('')}</div>` : ''}
    ${p.types.length || p.titles ? `<h4>Record by match type</h4>
    <div class="opps types">
      <div class="opp thead"><span>Type</span><span class="wl">Matches · W–L · win %</span></div>
      ${p.titles ? `<button class="opp${p.type === 'Title match' ? ' on' : ''}" data-type="Title match"><span>Title matches</span><span class="wl">${p.titles} · <b class="won">${p.titleWins}</b> won <small>${pc(p.titleWins, p.titles)}</small></span></button>` : ''}
      ${p.types.map((t) => `<button class="opp${p.type === t.t ? ' on' : ''}" data-type="${esc(t.t)}"><span>${esc(t.t)}</span><span class="wl">${t.n} · <b class="won">${t.won}</b>–<b class="lost">${t.lost}</b> <small>${pc(t.won, t.n)}</small></span></button>`).join('')}
    </div>` : ''}
    <h4>First and last in these results</h4>
    <div class="firstlast">${[['First', p.first], ['Last', p.last]].filter(([, r]) => r).map(([l, r]) => `<button class="fl" data-e="${r.e}"><small>${l} · ${esc(dateLabel(r.d))} · ${esc(r.s)}</small><span>${esc(r.line)}</span></button>`).join('')}</div>
  </div>`;
  side.querySelectorAll('[data-vs]').forEach((b) => b.addEventListener('click', () => { $('#q').value = `${name} vs ${b.dataset.vs}`; $('#q').dispatchEvent(new Event('input')); }));
  side.querySelectorAll('[data-co]').forEach((b) => b.addEventListener('click', () => { st.eras = [b.dataset.co]; allChips(); save(); refresh(); }));
  side.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { st.from = st.to = b.dataset.y; $('#f-from').value = b.dataset.y; $('#f-to').value = b.dataset.y; save(); refresh(); }));
  side.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { st.type = st.type === b.dataset.type ? '' : b.dataset.type; if (st.fromText) delete st.fromText.type; $('#f-type').value = st.type; save(); refresh(); }));
  $('#p-alltypes')?.addEventListener('click', () => { st.type = ''; if (st.fromText) delete st.fromText.type; $('#f-type').value = ''; save(); refresh(); });
  side.querySelectorAll('.fl').forEach((b) => b.addEventListener('click', () => openEvent(+b.dataset.e)));
}

/* ---------------- shows */
async function refreshShows(mine) {
  const res = await ask('events', { f: filters(), text: st.showText, order: st.order });
  if (mine !== searchSeq) return;
  $('#side').innerHTML = ''; $('#side').classList.remove('has');
  $('#results').innerHTML = `<div class="summary"><h2>${st.showText.trim() ? `Shows matching “${esc(st.showText.trim())}”` : 'All shows'}</h2><span class="count"><b>${n(res.total)}</b> shows</span></div>
    ${res.total ? `<div class="list shows">${res.rows.map((r) => `<button class="row" data-e="${r.e}">
        <span class="date">${esc(dateLabel(r.d))}</span>
        <span class="show">${badge(r.era)}${esc(r.t)}</span>
        <span class="line">${esc(r.v || KIND[r.kind] || '')}</span>
        <span class="num">${r.n} ${r.n === 1 ? 'match' : 'matches'}</span></button>`).join('')}</div>
      ${res.total > res.rows.length ? `<p class="note">Showing the first ${n(res.rows.length)}. Pick a year or show to narrow it down.</p>` : ''}` : '<div class="empty">No shows match.</div>'}`;
  wireRows($('#results'));
}

/* ---------------- the card for one show */
async function openEvent(e, k = null, from = null) {
  const ev = await ask('event', { e });
  if (!ev) return;
  const highlight = from && from.querySelector('.line') ? from.querySelector('.line').textContent.replace(/ ·.*$/, '') : '';
  const people = lastResult && st.tab === 'matches' ? [lastResult.res.me, lastResult.res.them, ...((lastResult.res.verdicts || []).map((v) => v.opp))].filter(Boolean).map((x) => x.name) : [];
  const mark = (line) => {
    let html = esc(line);
    for (const p of people) html = html.replace(new RegExp(`\\b(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi'), '<mark>$1</mark>');
    return html;
  };
  openModal(`<div class="card">
    <button class="x" data-close aria-label="Close">✕</button>
    <div class="cardhead co-${ev.era}">
      ${badge(ev.era)}
      <h2>${esc(ev.t)}</h2>
      <p>${esc(dateLabel(ev.d))}${ev.v ? ` · ${esc(ev.v)}` : ''} · ${esc(KIND[ev.kind] || 'Show')}</p>
    </div>
    <ol class="matches">${ev.matches.map((m, i) => `<li class="${ev.dark[i] ? 'dark' : ''}${highlight && m.startsWith(highlight.slice(0, 40)) ? ' hit' : ''}">${mark(m)}${ev.dark[i] ? ' <i class="tag dark">dark</i>' : ''}</li>`).join('')}</ol>
    <div class="cardfoot"><span>Results from the Pro Wrestling Wiki, CC BY-SA.</span><button class="link" id="wiki">Open this page on the wiki ↗</button></div>
  </div>`);
  $('#wiki').addEventListener('click', () => desktop.openWiki(ev.url));
  $('.matches .hit')?.scrollIntoView({ block: 'center' });
}
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; }

/* ---------------- database */
async function showDatabase() {
  openModal(`<div class="card dbcard">
    <button class="x" data-close aria-label="Close">✕</button>
    <h2>The database</h2>
    <p>${n(info.matches)} matches · ${n(info.events)} shows · ${n(info.wrestlers)} names${info.built ? ` · updated ${esc(info.built.slice(0, 10))}` : ''}</p>
    <table class="dbt"><tr><th></th><th>Shows</th><th>Matches</th><th>Years</th></tr>
      ${Object.keys(ERA).map((c) => `<tr><td><i class="badge co-${c}">${esc(ERA_LONG[c])}</i></td><td>${n(info.by[c].events)}</td><td>${n(info.by[c].matches)}</td><td>${info.by[c].from ? `${info.by[c].from.slice(0, 4)}–${info.by[c].to.slice(0, 4)}` : '—'}</td></tr>`).join('')}
    </table>
    <p class="small">Built from every NWA / WCW and ECW show with results on the Pro Wrestling Wiki. Some early TV and many house shows have no page there, so “never” and “debut” answers mean “in this database”.</p>
    <p class="credit">Match results from the Pro Wrestling Wiki (prowrestling.fandom.com), licensed CC BY-SA 3.0.</p>
  </div>`);
}

let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3000); }

function ready() {
  $('#dbbtn').innerHTML = `<b>${n(info.matches)}</b> matches`;
  buildControls();
  $('#loading').classList.add('gone');
  setTimeout(() => $('#loading').remove(), 400);
  if (!info.matches) toast('The database is empty — load a database file from the button at the top right.');
  $('#q').focus();
}
worker.postMessage({ type: 'load' });
