'use strict';
// WCW Match Search Engine: every NWA / Jim Crockett / WCW and ECW match in one searchable
// record book. The match database is built into the app (app/data).
const { app, BrowserWindow, ipcMain, shell, protocol, session, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const APP_DIR = path.join(__dirname, 'app');
const DATA_DIR = path.join(APP_DIR, 'data'); // every .wmdb in here is built in
const builtIns = () => { try { return fs.readdirSync(DATA_DIR).filter((f) => /\.(?:wmdb|json)$/i.test(f)).sort().map((f) => path.join(DATA_DIR, f)); } catch { return []; } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/* ---------------- database files */
function readAny(file) {
  let buf = fs.readFileSync(file);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
}
const KIND_FROM_SHOW = (show, title) => (/house show|live event/i.test(title) ? 'house' : show === 'PPV' ? 'ppv' : 'tv');
/** Builder databases as they are; Wrestling Chronology's match-cards.json converted. */
function toEvents(data) {
  if (data && data.format === 'wrestling-match-db' && Array.isArray(data.events)) return data.events;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const out = [];
    for (const card of Object.values(data)) {
      if (!card || !Array.isArray(card.matches) || !card.matches.length || !card.meta) continue;
      const { company, date, show, title } = card.meta;
      if (!/^(?:wwe|wcw|ecw|tna)$/.test(company) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
      out.push({ d: date, c: company, k: KIND_FROM_SHOW(show, card.title || ''), s: show === 'PPV' ? title : show, t: card.title || title || show, v: '', m: card.matches });
    }
    if (out.length) return out;
  }
  throw new Error('That file isn’t a match database.');
}
const valid = (e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && /^(?:wwe|wcw|ecw|tna)$/.test(e.c) && Array.isArray(e.m) && e.m.length;
/** The built-in shows; the same wiki page appears once. */
function database() {
  const sources = [];
  const byKey = new Map();
  const add = (events) => { for (const e of events) if (valid(e)) byKey.set(`${e.d}|${String(e.t || e.s).toLowerCase()}`, { d: e.d, c: e.c, k: e.k || 'event', s: e.s || e.t, t: e.t || e.s, v: e.v || '', m: e.m.map(String) }); };
  let built = '';
  for (const file of builtIns()) {
    try { const db = readAny(file); add(toEvents(db)); if ((db.built || '') > built) built = db.built; sources.push(path.basename(file)); } catch (e) { console.error('Built-in database unreadable', file, e); }
  }
  const events = [...byKey.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.c < b.c ? -1 : a.c > b.c ? 1 : 0));
  return { format: 'wrestling-match-db', built, sources, source: 'Pro Wrestling Wiki (prowrestling.fandom.com), CC BY-SA 3.0', events };
}

function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'bundle') return new Response('Not found', { status: 404 });
  if (url.pathname === '/db.json') {
    try { return new Response(JSON.stringify(database()), { headers: { 'Content-Type': 'application/json' } }); } catch (error) {
      return new Response(JSON.stringify({ events: [], error: String(error) }), { headers: { 'Content-Type': 'application/json' } });
    }
  }
  const file = path.normalize(path.join(APP_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
}

/* ---------------- window */
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#0b0d13',
    title: 'WCW Match Search Engine', autoHideMenuBar: true, show: false,
    icon: path.join(APP_DIR, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://bundle/')) e.preventDefault(); });
  win.loadURL('app://bundle/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_d, cb) => cb({ cancel: true }));
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.protocol.handle('app', serve);

  ipcMain.on('open-wiki', (_e, url) => { if (/^https:\/\/prowrestling\.fandom\.com\//.test(url)) shell.openExternal(url); });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
