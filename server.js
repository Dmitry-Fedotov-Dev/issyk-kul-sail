// Сервер игры без зависимостей: раздаёт dist/index.html и держит общий мир для сетевой игры.
//   node server.js            -> http://localhost:8080
//   PORT=3000 node server.js  -> другой порт
// За обратным прокси (nginx, Caddy) нужен проброс WebSocket для пути /ws.
//
// Сеть устроена так: каждый клиент 10 раз в секунду присылает своё положение, сервер 10 раз в секунду отвечает
// каждому списком ТОЛЬКО тех игроков, что находятся рядом с ним (зона видимости VIEW метров, не больше MAX_NEAR
// ближайших). Игрок на другом конце озера никому не шлётся и ничего не стоит. Мир клиента сервер не считает:
// ветер, волны и физика у каждого свои, сервер только пересылает положения.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const port = process.env.PORT || 8080, file = path.join(__dirname, 'dist', 'index.html');
const VIEW = 1800, MAX_NEAR = 16, MAX_RACE = 64, MAX_CLIENTS = 400, MAX_MSG = 2048;

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ online: clients.size })); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(500); res.end('dist/index.html не найден: сначала npm run build'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(data);
  });
});

// ---------- WebSocket (RFC 6455), только текстовые кадры ----------
const clients = new Map(); let nextId = 1;
function frame(str) { const p = Buffer.from(str), n = p.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, p]); }
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || !key || clients.size >= MAX_CLIENTS) { sock.destroy(); return; }
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
    crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
  const c = { id: nextId++, sock, s: null, seen: Date.now() }; clients.set(c.id, c); let buf = Buffer.alloc(0);
  const drop = () => { if (c.lobby) leave(c); clients.delete(c.id); sock.destroy(); };
  sock.setNoDelay(true); sock.write(frame(JSON.stringify({ t: 'hi', id: c.id })));
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); if (buf.length > 65536) return drop();
    for (;;) { if (buf.length < 2) return; const op = buf[0] & 15, masked = buf[1] & 128; let n = buf[1] & 127, off = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); off = 4; } else if (n === 127) return drop(); // длинные кадры клиенту ни к чему
      if (!masked || n > MAX_MSG) return drop(); if (buf.length < off + 4 + n) return;
      const mask = buf.subarray(off, off + 4), p = Buffer.from(buf.subarray(off + 4, off + 4 + n)); for (let i = 0; i < n; i++) p[i] ^= mask[i & 3]; buf = buf.subarray(off + 4 + n);
      if (op === 8) return drop(); if (op === 9) { sock.write(Buffer.from([0x8a, 0])); continue; } if (op !== 1) continue;
      let m; try { m = JSON.parse(p.toString()); } catch (e) { continue; } // мусор вместо JSON просто пропускаем
      if (!m) continue; c.seen = Date.now();
      if (m.t === 's' && Number.isFinite(m.X) && Number.isFinite(m.Y)) { // храним только ожидаемые поля
        c.name = String(m.n || '').slice(0, 16);
        c.s = { k: String(m.k || 'yacht').slice(0, 8), X: m.X, Y: m.Y, th: +m.th || 0, phi: +m.phi || 0, vx: +m.vx || 0, vy: +m.vy || 0, w: String(m.w || 'lake').slice(0, 40), r: Array.isArray(m.r) ? m.r.slice(0, 2).map((v) => +v || 0) : [0, 0],
          a: Array.isArray(m.a) ? m.a.slice(0, 6).map((v) => +v || 0) : [], n: c.name, f: Array.isArray(m.f) ? m.f.slice(0, 4).map((v) => +v || 0) : [0, 0, 0, 0] }; }
      else if (m.t === 'join') { if (m.n) c.name = String(m.n).slice(0, 16); join(c, String(m.k || ''), String(m.p || '')); }
      else if (m.t === 'go') go(c);
      else if (m.t === 'leave') leave(c);
      else if (m.t === 'hit') { const o = clients.get(+m.to); // удар по чужой лодке: пересылаем адресату, он сам решит, вылетел ли
        if (o && o !== c && c.s && o.s && Math.hypot(o.s.X - c.s.X, o.s.Y - c.s.Y) < 30) send(o, { t: 'hit', from: c.id, n: c.name || '', vx: +m.vx || 0, vy: +m.vy || 0, i: +m.i || 0 }); } } });
  sock.on('close', () => { leave(c); drop(); }); sock.on('error', () => { leave(c); drop(); });
});
const send = (c, o) => { try { c.sock.write(frame(JSON.stringify(o))); } catch (e) { /* сокет уже закрыт -- уберёт рассылка */ } };

// ---------- лобби онлайн-заездов ----------
// Нажал «соревнование» -- попал в открытое лобби своего снаряда и погоды (или открыл новое). Лобби ждёт игроков
// WAIT секунд; любой участник может нажать «Старт сейчас» -- тогда до старта остаётся 3 секунды, и в эти секунды
// ещё можно присоединиться. После старта лобби закрыто: опоздавшие открывают следующее. Комната заезда (поле w)
// уникальна для лобби, поэтому участники видят друг друга, а не тех, кто гоняется в соседнем заезде.
const WAIT = { yacht: 30, kayak: 20, scull: 25, sup: 15, jetski: 15, boat: 15 }, lobbies = new Map(); let nextLobby = 1;
function lobbyMsg(L) { return { t: 'lobby', room: L.room, T0: L.T0, go: L.go, list: [...L.members.values()].map((m) => ({ id: m.c.id, n: m.c.name || '', slot: m.slot })) }; }
const notify = (L) => { const msg = lobbyMsg(L); for (const m of L.members.values()) send(m.c, msg); };
function join(c, k, p) { leave(c); if (!WAIT[k]) return; const key = k + ':' + p.slice(0, 12), now = Date.now();
  let L = null; for (const x of lobbies.values()) if (x.key === key && x.T0 > now + 300 && x.members.size < 64) { L = x; break; }
  if (!L) { L = { key, room: `r:${key}:${nextLobby++}`, T0: now + WAIT[k] * 1000, go: false, members: new Map(), slots: 0 }; lobbies.set(L.room, L); }
  L.members.set(c.id, { c, slot: L.slots++ }); c.lobby = L.room; notify(L); }
function go(c) { const L = lobbies.get(c.lobby); if (!L) return; const now = Date.now(); if (L.T0 > now + 3000) { L.T0 = now + 3000; L.go = true; notify(L); } }
function leave(c) { const L = lobbies.get(c.lobby); c.lobby = null; if (!L) return; L.members.delete(c.id); if (!L.members.size) lobbies.delete(L.room); else if (L.T0 > Date.now()) notify(L); }
// старые лобби (заезд давно идёт) забываем
setInterval(() => { const now = Date.now(); for (const [id, L] of lobbies) if (now - L.T0 > 15 * 60000) lobbies.delete(id); }, 60000);

// ---------- рассылка: каждому -- только его окрестность ----------
setInterval(() => { const now = Date.now(), list = [...clients.values()];
  for (const c of list) { if (now - c.seen > 30000) { leave(c); clients.delete(c.id); c.sock.destroy(); continue; } if (!c.s) continue; const near = [];
    const race = c.s.w.startsWith('r:'); // в заезде видны все участники комнаты, на всей дистанции
    for (const o of list) { if (o === c || !o.s || o.s.w !== c.s.w) continue; const d = Math.hypot(o.s.X - c.s.X, o.s.Y - c.s.Y); if (race || d < VIEW) near.push([d, o]); }
    near.sort((a, b) => a[0] - b[0]);
    const p = near.slice(0, race ? MAX_RACE : MAX_NEAR).map(([, o]) => ({ id: o.id, ...o.s }));
    try { c.sock.write(frame(JSON.stringify({ t: 'w', on: list.length, now, p }))); } catch (e) { clients.delete(c.id); } } }, 100);

server.listen(port, () => console.log(`Парус Иссык-Куля: http://localhost:${port}  (сетевая игра: ws://localhost:${port}/ws)`));
