// Winner Stays On game server: serves the site, runs every match, relays chat, keeps the ranking.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const E = require('./public/engine.js');

const PORT = process.env.PORT || 3000;
const DATA = path.join(process.env.DATA_DIR || __dirname, 'wins.json');
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const MAX_PLAYERS = 200, GRACE = 6000, FORGET = 60000;

const S = E.fresh();
S.ver = Math.floor(Date.now() / 1000);          // keeps rising across restarts
try { S.w = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch {}

const players = new Map();                       // token -> { peer, ws, presence, since, goneAt }
const verified = new Map();
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = url === '/' ? 'index.html' : url.slice(1);
  if (!['index.html', 'engine.js'].includes(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' });
  fs.createReadStream(path.join(PUB, file)).pipe(res);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(msg); }
function all(obj, except) {
  const m = JSON.stringify(obj);
  for (const p of players.values()) if (p !== except) send(p.ws, m);
}
const pub = st => { const c = JSON.parse(JSON.stringify(st)); delete c.end; c.end = 0; return c; };
const visible = () => [...players.values()].filter(p => p.ws && p.presence.name).map(p => ({ peer: p.peer, presence: p.presence }));

// Only these fields ever reach other players, and the join time is the server's own.
function accept(p, raw) {
  if (!raw || typeof raw !== 'object') return;
  const now = Date.now(), out = { v: 2, hb: 0 };
  const name = clean(raw.name, 18);
  if (!name) {                                   // back at the main menu: leaves the queue or forfeits at once
    if (p.presence.name) { p.presence = {}; p.since = 0; all({ t: 'left', peer: p.peer }); }
    return;
  }
  out.name = name; out.ready = true;
  if (!p.since) p.since = now;
  out.since = p.since;
  const a = raw.act;
  if (a && typeof a === 'object' && Number.isInteger(a.id) && typeof a.h === 'string' && a.h.length <= 32) {
    out.act = { id: a.id, h: a.h };
    if (Number.isInteger(a.pick) && typeof a.salt === 'string' && a.salt.length <= 32) { out.act.pick = a.pick; out.act.salt = a.salt; }
  }
  let chat = p.presence.chat;
  if (Array.isArray(raw.chat) && JSON.stringify(raw.chat) !== JSON.stringify(chat || []) && now - (p.chatAt || 0) > 700) {
    p.chatAt = now;
    chat = raw.chat.slice(-3).filter(m => m && Number.isInteger(m.i) && typeof m.x === 'string').map(m => ({ i: m.i, x: clean(m.x, 100) }));
  }
  if (chat) out.chat = chat;
  const before = JSON.stringify(p.presence);
  p.presence = out;
  if (JSON.stringify(out) !== before) all({ t: 'p', peer: p.peer, presence: out });
}
function verify(peer, act) {
  if (act.pick === undefined) return undefined;
  if (![0, 1, 2].includes(act.pick)) return false;
  const h = crypto.createHash('sha256').update(act.id + '|' + act.pick + '|' + act.salt).digest('hex').slice(0, 16);
  return h === act.h;
}
function step() {
  const now = Date.now();
  const on = [...players.values()].filter(p => p.ws && p.presence.name);
  const byPeer = new Map([...players.values()].map(p => [p.peer, p]));
  const env = {
    roster: on.map(p => ({ peer: p.peer, name: p.presence.name, since: p.since })), now,
    gone: peer => { const p = byPeer.get(peer); return !p || !p.presence.name || (p.goneAt && now - p.goneAt > GRACE); },
    act: peer => { const p = byPeer.get(peer); return (p && p.presence.act) || null; },
    verify, rand: n => crypto.randomInt(n),
  };
  const wins = JSON.stringify(S.w);
  if (E.step(S, env)) {
    S.ver += 1;
    all({ t: 'st', st: pub(S) });
    if (JSON.stringify(S.w) !== wins) fs.writeFile(DATA, JSON.stringify(S.w), () => {});
  }
  for (const [token, p] of players) if (p.goneAt && now - p.goneAt > FORGET) players.delete(token);
}

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token') || '';
  if (!/^[0-9a-f]{32}$/.test(token) || (!players.has(token) && players.size >= MAX_PLAYERS)) return ws.close();
  let p = players.get(token);
  if (p) { try { p.ws && p.ws.terminate(); } catch {} p.ws = ws; p.goneAt = 0; }
  else { p = { peer: crypto.randomBytes(8).toString('hex'), ws, presence: {}, since: 0, goneAt: 0 }; players.set(token, p); }
  ws.alive = true;
  let budget = 40, last = Date.now();
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', buf => {
    const now = Date.now();
    budget = Math.min(40, budget + (now - last) / 100); last = now;
    if (--budget < 0) return;
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m && m.t === 'p') { accept(p, m.presence); step(); }
  });
  ws.on('close', () => {
    if (p.ws !== ws) return;
    p.ws = null; p.goneAt = Date.now();
    if (p.presence.name) all({ t: 'left', peer: p.peer });
  });
  send(ws, JSON.stringify({ t: 'welcome', peer: p.peer, peers: visible(), st: pub(S) }));
});

setInterval(step, 250);
setInterval(() => { for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; c.ping(); } }, 20000);
server.listen(PORT, () => console.log('Winner Stays On running on port ' + PORT));
