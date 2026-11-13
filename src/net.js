// Сетевая игра. Если страница открыта с игрового сервера (node server.js), клиент подключается к нему сам, без кнопок:
// зашёл -- и ты в общем мире. Десять раз в секунду шлём своё положение и получаем соседей в зоне видимости; чужие
// лодки рисуются как «куклы» на тех же моделях, между пакетами их движение достраивается по скорости.
// Над каждой куклой -- имя игрока. Кроме положений по сети ходят: лобби заездов (join/go/leave), удары по чужой
// лодке (hit -- адресат сам решает, вылетел ли он с доски) и «полёт» сапбордиста (поле f: номер полёта и скорость
// вылета), чтобы все рядом увидели один и тот же кувырок.
// Без сервера (файл с диска, чужой хостинг без /ws) модуль молчит и игра остаётся одиночной.
import * as THREE from 'three';
import { makeBoat } from './boatmodel.js';
import { MODEL } from './craftmodels.js';
import { makeCraftBody, SPECS } from './crafts.js';
import { Boat, wrapPi } from './sim.js';

// табличка с именем: всегда одного размера на экране, поверх воды, но без влияния на контуры комикс-обработки
function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '700 30px "Avenir Next","Segoe UI",Arial,sans-serif'; const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(7,26,58,.72)'; g.beginPath(); if (g.roundRect) g.roundRect(128 - w / 2, 10, w, 44, 22); else g.rect(128 - w / 2, 10, w, 44); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33, 230);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.16, 0.04, 1); s.renderOrder = 10; return s;
}
export const radiusOf = (b) => (b.kind ? b.hl * 0.85 : 2.6);

export function makeNet(scene, ctx) {
  const pups = new Map(), st = { online: 0, id: 0, up: false, off: 0, sync: false }; let ws = null, acc = 0, retry = 2, wait = 0;
  const can = typeof WebSocket !== 'undefined' && /^https?:$/.test(location.protocol);
  const sendJ = (o) => { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); return true; } catch (e) { /* соединение рвётся -- переподключимся */ } } return false; };
  function connect() { if (!can) return; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { ws = null; return; } // соединения запрещены средой -- остаёмся в одиночной игре
    ws.onopen = () => { st.up = true; retry = 2; }; ws.onclose = () => { st.up = false; ws = null; wait = retry; retry = Math.min(retry * 2, 60); for (const p of pups.values()) p.model.root.visible = false; st.online = 0; if (ctx.onDown) ctx.onDown(); };
    ws.onerror = () => {}; // причина придёт в onclose, там и переподключение
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'hi') st.id = m.id;
      else if (m.t === 'w') { st.online = m.on; if (m.now) { const o = m.now - Date.now(); st.off = st.sync ? st.off + (o - st.off) * 0.1 : o; st.sync = true; } world(m.p); }
      else if (m.t === 'lobby' && ctx.onLobby) ctx.onLobby(m);
      else if (m.t === 'hit' && ctx.onHit) ctx.onHit(m); }; }
  function make(k) { const yacht = k === 'yacht' || !SPECS[k], b = yacht ? new Boat() : makeCraftBody(k), model = yacht ? makeBoat({ hull: 0x7a2f5a, accent: '#f4f3ee', text: 'ONLINE' }) : MODEL[k]({ hull: 0x7a2f5a, deck: 0xf4f3ee });
    scene.add(model.root); const tag = nameTag(''); scene.add(tag); return { k, b, model, tag, tagText: null, tx: 0, ty: 0, tth: 0, tphi: 0, seen: 0, fresh: true, fseq: null }; }
  const drop = (id, p) => { scene.remove(p.model.root); scene.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); if (p.model.dispose) p.model.dispose(); pups.delete(id); };
  function world(list) { const now = performance.now();
    for (const s of list) { let p = pups.get(s.id); if (p && p.k !== s.k) { drop(s.id, p); p = null; }
      if (!p) { if (pups.size >= 64) continue; p = make(s.k); pups.set(s.id, p); }
      p.r = s.r || [0, 0]; p.id = s.id; p.name = s.n || `Игрок ${s.id}`;
      if (p.tagText !== p.name) { p.tagText = p.name; const old = p.tag; p.tag = nameTag(p.name); scene.remove(old); old.material.map.dispose(); old.material.dispose(); scene.add(p.tag); }
      p.tx = s.X; p.ty = s.Y; p.tth = s.th; p.tphi = s.phi; p.b.vx = s.vx; p.b.vy = s.vy; p.seen = now; const b = p.b, a = s.a || [];
      if (p.fresh) { b.X = s.X; b.Y = s.Y; b.th = s.th; p.fresh = false; }
      // полёт сапбордиста: новый номер -- запускаем кувырок с той же скоростью вылета, что у него самого
      const f = s.f || [0, 0, 0, 0]; if (p.fseq === null) p.fseq = f[0]; else if (f[0] !== p.fseq) { p.fseq = f[0]; if (p.model.fling && !p.model.flying()) p.model.fling(f[1], f[2], f[3]); }
      b.capsized = !!a[0]; b.rudder = a[1] || 0;
      if (b.kind) { if (b.spec.cls === 'motor') b.thr = a[2] || 0; else { b.brace = a[3] || 0; if (a[2] !== p.sk) { p.sk = a[2]; b.lastSide = a[4] === 1 ? 'L' : 'R'; b.st = { side: a[4] === 1 ? 'L' : a[4] === 2 ? 'B' : 'R', t: 0, T: b.spec.drive, q: 1 }; b.endT = 0; } } }
      else { b.boom = a[2] || 0; b.awa = a[3] || 0; b.aws = a[4] || 5; b.luff = a[5] || 0; } } }
  connect();
  return { st, pups,
    now: () => Date.now() + st.off,
    ready: () => st.up && st.sync,
    join: (k, preset) => sendJ({ t: 'join', k, p: preset, n: ctx.name() }),
    go: () => sendJ({ t: 'go' }),
    leave: () => sendJ({ t: 'leave' }),
    hit: (to, vx, vy, i) => sendJ({ t: 'hit', to, vx: +vx.toFixed(2), vy: +vy.toFixed(2), i: +i.toFixed(2) }),
    tick(dt, P, world_, t, rr) {
      if (!can) return; if (!ws) { wait -= dt; if (wait <= 0) { wait = 1e9; connect(); } }
      acc += dt; const b = P.b;
      if (st.up && acc >= 0.1 && ws.readyState === 1 && ctx.active()) { acc = 0; const r = (v, n = 2) => +v.toFixed(n);
        const a = b.kind ? (b.spec.cls === 'motor' ? [b.capsized ? 1 : 0, r(b.rudder), r(b.thr)] : [b.capsized ? 1 : 0, 0, b.strokes, r(b.brace), b.st ? (b.st.side === 'L' ? 1 : b.st.side === 'B' ? 2 : 0) : b.lastSide === 'L' ? 1 : 0])
          : [b.capsized ? 1 : 0, r(b.rudder), r(b.boom), r(b.awa), r(b.aws, 1), r(b.luff)];
        const fl = ctx.fling(); // [номер полёта, vx, vy, vz] своего сапбордиста
        sendJ({ t: 's', k: b.kind || 'yacht', X: r(b.X, 1), Y: r(b.Y, 1), th: r(b.th, 3), phi: r(b.phi, 3), vx: r(b.vx), vy: r(b.vy), w: world_, a, r: rr || [0, 0], n: ctx.name(), f: fl.map((v) => r(v)) }); }
      const now = performance.now();
      for (const [id, p] of pups) { const q = p.b, age = now - p.seen; if (age > 4000 || !ctx.active()) { drop(id, p); continue; }
        p.model.root.visible = age < 1500; p.tx += q.vx * dt; p.ty += q.vy * dt; const k = Math.min(1, dt * 7);
        q.X += q.vx * dt + (p.tx - q.X) * k; q.Y += q.vy * dt + (p.ty - q.Y) * k; q.th = wrapPi(q.th + wrapPi(p.tth - q.th) * k); q.phi += (p.tphi - q.phi) * k;
        if (q.st) { q.st.t += dt; if (q.st.t >= q.st.T) { q.st = null; q.endT = 0; } } else if (q.kind) q.endT += dt;
        q.updatePose(ctx.waves, t, ctx.h); p.model.update(q, dt, t);
        // имя -- над головой или над топом мачты; пока сапбордист летит, табличка летит вместе с ним
        const fp = p.model.flyPos && p.model.flyPos(); p.tag.visible = p.model.root.visible;
        if (fp) p.tag.position.set(fp.x, fp.y + 1.4, fp.z); else p.tag.position.set(q.X, q.y + (q.kind ? (q.kind === 'sup' ? 2.6 : 2.2) : 11), -q.Y); } } };
}
