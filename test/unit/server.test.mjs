// Сетевой протокол server.js: настоящий сервер на свободном порту и клиенты на сырых WebSocket-кадрах (без зависимостей)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';

let srv, port;
before(async () => { port = 20000 + Math.floor(Math.random() * 20000); srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  await new Promise((res, rej) => { srv.stdout.on('data', (d) => /localhost/.test(String(d)) && res()); srv.on('exit', (c) => rej(new Error('сервер вышел ' + c))); }); });
after(() => srv && srv.kill());

const frame = (o) => { const p = Buffer.from(JSON.stringify(o)), n = p.length, mask = crypto.randomBytes(4); const h = n < 126 ? Buffer.from([0x81, 0x80 | n]) : Buffer.from([0x81, 0x80 | 126, n >> 8, n & 255]);
  const m = Buffer.from(p); for (let i = 0; i < n; i++) m[i] ^= mask[i & 3]; return Buffer.concat([h, mask, m]); };
function client() { return new Promise((res) => { const s = net.connect(port, '127.0.0.1'), msgs = []; let buf = Buffer.alloc(0), up = false; const waiters = [];
  const c = { msgs, send: (o) => s.write(frame(o)), close: () => s.destroy(),
    wait: (pred, ms = 3000) => new Promise((ok, no) => { const f = msgs.find(pred); if (f) return ok(f); const t = setTimeout(() => no(new Error('нет ответа')), ms); waiters.push({ pred, ok: (m) => { clearTimeout(t); ok(m); } }); }) };
  s.on('connect', () => s.write(`GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  s.on('data', (d) => { buf = Buffer.concat([buf, d]); if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = true; buf = buf.subarray(i + 4); }
    for (;;) { if (buf.length < 2) return; let n = buf[1] & 127, off = 2; if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); off = 4; } else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + n) return; const m = JSON.parse(buf.subarray(off, off + n).toString()); buf = buf.subarray(off + n); msgs.push(m);
      if (m.t === 'hi') { c.id = m.id; res(c); } for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); } } }); }); }
const pos = (c, X, Y, extra = {}) => c.send({ t: 's', k: 'yacht', X, Y, th: 0, phi: 0, vx: 0, vy: 0, w: 'lake', a: [], r: [0, 0], n: 'P' + c.id, ...extra });

test('GET /health отвечает числом подключённых', async () => { const r = await fetch(`http://127.0.0.1:${port}/health`); assert.equal(r.status, 200); assert.ok('online' in await r.json()); });
test('соседи видят друг друга в рассылке мира', async () => { const a = await client(), b = await client();
  pos(a, 0, 0); pos(b, 50, 0); const w = await a.wait((m) => m.t === 'w' && m.p.some((x) => x.id === b.id)); assert.equal(w.p.find((x) => x.id === b.id).X, 50); a.close(); b.close(); });
test('дальний игрок (за 1.8 км) в рассылку не попадает', async () => { const a = await client(), b = await client();
  pos(a, 0, 0); pos(b, 5000, 0); await new Promise((r) => setTimeout(r, 400)); pos(a, 0, 0); await a.wait((m) => m.t === 'w');
  assert.ok(!a.msgs.filter((m) => m.t === 'w').some((m) => m.p.some((x) => x.id === b.id))); a.close(); b.close(); });
test('поиск друга по открытому номеру: место, погода, мир', async () => { const a = await client(), b = await client();
  a.send({ t: 'hello', pid: 'pa', fid: 'fa' }); pos(a, 120, -340, { pr: 'ulan' }); await new Promise((r) => setTimeout(r, 200));
  b.send({ t: 'find', fids: ['fa', 'nobody'] }); const f = await b.wait((m) => m.t === 'found');
  assert.deepEqual(f.list.map((x) => [x.fid, x.on]), [['fa', 1], ['nobody', 0]]); assert.equal(f.list[0].X, 120); assert.equal(f.list[0].w, 'lake'); assert.equal(f.list[0].pr, 'ulan'); a.close(); b.close(); });
test('привет другу по ссылке доходит с именем пришедшего', async () => { const a = await client(), b = await client();
  a.send({ t: 'hello', pid: 'pa2', fid: 'fa2' }); b.send({ t: 'hello', pid: 'pb2', fid: 'fb2' }); await new Promise((r) => setTimeout(r, 100));
  b.send({ t: 'friend', to: 'fa2', n: 'Боб' }); const m = await a.wait((x) => x.t === 'friend'); assert.equal(m.fid, 'fb2'); assert.equal(m.n, 'Боб'); a.close(); b.close(); });
test('крюк: зацепить можно только того, кто ближе 45 м; рывок и отдача троса доходят', async () => { const a = await client(), b = await client();
  pos(a, 0, 0); pos(b, 100, 0); await new Promise((r) => setTimeout(r, 200)); a.send({ t: 'hook', to: b.id, on: 1, L: 12 }); await new Promise((r) => setTimeout(r, 300));
  assert.ok(!b.msgs.some((m) => m.t === 'hook'), 'зацепил на 100 м');
  pos(b, 20, 0); await new Promise((r) => setTimeout(r, 200)); a.send({ t: 'hook', to: b.id, on: 1, L: 12 }); const on = await b.wait((m) => m.t === 'hook' && m.on === 1); assert.equal(on.from, a.id); assert.equal(on.L, 12);
  a.send({ t: 'hook', to: b.id, on: 2, L: 12, j: 3.2 }); assert.equal((await b.wait((m) => m.t === 'hook' && m.on === 2)).j, 3.2);
  pos(b, 900, 0); await new Promise((r) => setTimeout(r, 200)); a.send({ t: 'hook', to: b.id, on: 0 }); await b.wait((m) => m.t === 'hook' && m.on === 0); a.close(); b.close(); });
test('лобби заезда: два игрока в одной комнате, «Старт сейчас» сокращает ожидание до 3 с', async () => { const a = await client(), b = await client();
  a.send({ t: 'hello', pid: 'la', fid: 'x1' }); b.send({ t: 'hello', pid: 'lb', fid: 'x2' }); a.send({ t: 'join', k: 'kayak', p: 'santash', n: 'А' }); await a.wait((m) => m.t === 'lobby');
  b.send({ t: 'join', k: 'kayak', p: 'santash', n: 'Б' }); const l = await b.wait((m) => m.t === 'lobby' && m.list.length === 2); assert.equal(l.list.length, 2);
  b.send({ t: 'go' }); const g = await a.wait((m) => m.t === 'lobby' && m.go); assert.ok(g.T0 - Date.now() < 3500); a.close(); b.close(); });
test('место в лобби держится после обрыва связи', async () => { const a = await client(); a.send({ t: 'hello', pid: 'keep', fid: 'k1' }); a.send({ t: 'join', k: 'sup', p: 'breeze', n: 'А' });
  const l1 = await a.wait((m) => m.t === 'lobby'); a.close(); await new Promise((r) => setTimeout(r, 300));
  const a2 = await client(); a2.send({ t: 'hello', pid: 'keep', fid: 'k1' }); const l2 = await a2.wait((m) => m.t === 'lobby'); assert.equal(l2.room, l1.room); a2.close(); });
test('мусор вместо JSON сервер не роняет', async () => { const a = await client(); a.send('не json'); const s = net.connect(port, '127.0.0.1'); s.end(); pos(a, 0, 0); await a.wait((m) => m.t === 'w'); a.close(); });
