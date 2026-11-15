// Абордажный крюк. Бросок в ближайшее судно не дальше 30 м: игрока онлайн, NPC акватории или соперника в гонке.
// Попадание не гарантировано: чем дальше и чем быстрее расходятся лодки, тем чаще мимо.
// Зацепился -- между носом своей лодки и корпусом цели натянут трос длиной в расстояние броска; хозяин крюка понемногу
// выбирает его (подтягивает цель). Трос -- пружина с затуханием: пока он провисает, сил нет. Если лодки расходятся
// и трос выбирает слабину на скорости, получается рывок: обе лодки резко дёргает навстречу друг другу (неупругий
// удар, скорость гасится в долях по массам), трясёт камеру, корпус получает урон по силе рывка; трос тянет за нос --
// лодку разворачивает к цели. Слишком сильный рывок или растяжение рвут трос. Отцепиться (или перерубить чужой трос)
// -- та же кнопка. В сети каждый клиент двигает только свою лодку: трос у обоих один и тот же, силы симметричны.
import * as THREE from 'three';
import { BOAT, clamp } from './sim.js';

export const HOOK_RANGE = 30;
const massOf = (b) => (b.kind ? b.spec.mass : BOAT.mass);
const bowOf = (b) => (b.kind ? b.hl * 0.9 : 3.6);

export function makeHook(scene, ctx) {
  // трос -- трубка толщиной 10 см (линия в пиксель на телефоне не видна); точки оси считает draw(), трубку -- tube()
  const N = 20, RS = 6, RAD = 0.05, pos = new Float32Array(N * 3), tp = new Float32Array(N * RS * 3), idx = [];
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < RS; k++) { const a = i * RS + k, b2 = i * RS + ((k + 1) % RS), c = a + RS, d = b2 + RS; idx.push(a, c, b2, b2, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(tp, 3)); geo.setIndex(idx);
  const line = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x8a6a3e })); line.frustumCulled = false; line.visible = false; scene.add(line);
  function tube() { for (let i = 0; i < N; i++) { const p = i * 3, a = Math.max(0, i - 1) * 3, c = Math.min(N - 1, i + 1) * 3;
      let tx = pos[c] - pos[a], ty = pos[c + 1] - pos[a + 1], tz = pos[c + 2] - pos[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let ux = -tz, uy = 0, uz = tx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul; // горизонтальный перпендикуляр
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux; // второй перпендикуляр
      for (let k = 0; k < RS; k++) { const an = (k / RS) * 6.2832, cs = Math.cos(an) * RAD, sn = Math.sin(an) * RAD, o = (i * RS + k) * 3;
        tp[o] = pos[p] + ux * cs + vx * sn; tp[o + 1] = pos[p + 1] + uy * cs + vy * sn; tp[o + 2] = pos[p + 2] + uz * cs + vz * sn; } }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); }
  let H = null, cool = 0, jerkCool = 0;
  const say = (t) => ctx.toast(t);
  // ближайшая цель в пределах броска (из списка, который даёт игра)
  function aim(P) { const b = P.b; let best = null, bd = HOOK_RANGE;
    for (const c of ctx.targets()) { const q = c.body(); if (!q || q === b) continue; const d = Math.hypot(q.X - b.X, q.Y - b.Y); if (d < bd) { bd = d; best = c; } }
    return best; }
  function release(msg, tell = true) { if (!H) return; if (tell && H.tgt.peerId && (H.on || H.mine === false)) ctx.net.hook(H.tgt.peerId, 0, 0); H = null; line.visible = false; cool = 1.5; if (msg) say(msg); }
  // кнопка: бросить, отдать свой трос или перерубить чужой
  function press(P) { if (H) { release(H.mine ? 'Трос отдан' : 'Трос перерублен'); return; } if (cool > 0 || !ctx.allowed()) return;
    const c = aim(P); if (!c) { say(`Некого цеплять: ближе ${HOOK_RANGE} м никого`); return; }
    const b = P.b, q = c.body(), d = Math.hypot(q.X - b.X, q.Y - b.Y), rel = Math.hypot((q.vx || 0) - b.vx, (q.vy || 0) - b.vy);
    const p = clamp(1.05 - (d / HOOK_RANGE) * 0.6 - rel / 12, 0.25, 0.95);
    H = { mine: true, tgt: c, on: false, fly: 0, flyT: 0.3 + d / 32, hit: Math.random() < p, L: d, taut: false, t: 0 }; ctx.audio.slap(0.25); }
  // чужой крюк: m = { from, n, on, L }
  function remote(m, peer) { if (m.on === 2) { if (!H || H.tgt.peerId !== m.from || !H.on || !ctx.player) return; const b = ctx.player().b, q = H.tgt.body(); if (!q) return;
      let dx = q.X - b.X, dy = q.Y - b.Y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; const mA = massOf(b), mB = massOf(q); jerk(b, q, dx, dy, Math.min(9, +m.j || 0), mB / (mA + mB)); return; }
    if (m.on) { if (!peer) return; if (H) release(null); H = { mine: false, tgt: peer, on: true, fly: 1, L: Math.max(6, +m.L || 10), taut: false, t: 0 };
      ctx.audio.thump(0.5); ctx.shake(0.4); say(`${m.n || 'Игрок'} зацепил вас крюком! Перерубить — кнопка «крюк»`); }
    else if (H && H.tgt.peerId === m.from) { H = null; line.visible = false; say('Трос отдан'); } }

  const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };
  // рывок для своей лодки: скорость к цели (доля по массам), разворот за нос, урон корпусу, тряска, брызги
  function jerk(b, q, dx, dy, vr, share) { H.jt = 0.5; const dv = vr * 0.85; b.vx += dx * dv * share; b.vy += dy * dv * share;
    if (H.mine) b.r = (b.r || 0) + clamp(-(Math.sin(b.th) * dy - Math.cos(b.th) * dx) * dv * 0.35, -0.8, 0.8); // дёрнуло за нос -- разворачивает к цели
    ctx.wear(b, 0, clamp(0.012 + 0.03 * vr, 0, 0.2)); ctx.shake(Math.min(1.1, 0.3 + vr * 0.22)); ctx.audio.thump(Math.min(1, 0.45 + vr * 0.15));
    ctx.splash(b, vr); if (jerkCool <= 0) { jerkCool = 1; say(vr > 2.5 ? 'Сильный рывок! Корпус трещит' : 'Рывок троса'); } }
  function step(dt, P) { cool -= dt; jerkCool -= dt; if (!H) { line.visible = false; return; }
    const b = P.b, q = H.tgt.body(); if (!q || !ctx.allowed()) { release(q ? null : 'Цель ушла — трос отдан'); return; }
    // точки крепления: у бросившего -- нос, у цели -- середина корпуса
    const mb = H.mine ? bowOf(b) : 0, tb = H.mine ? 0 : bowOf(q);
    A.x = b.X + Math.sin(b.th) * mb; A.y = b.Y + Math.cos(b.th) * mb; A.z = (b.y || 0) + (b.kind ? 0.45 : 1.1);
    B.x = q.X + Math.sin(q.th || 0) * tb; B.y = q.Y + Math.cos(q.th || 0) * tb; B.z = (q.y || 0) + (q.kind ? 0.45 : 1.0);
    let dx = B.x - A.x, dy = B.y - A.y; const d = Math.hypot(dx, dy) || 1e-3; dx /= d; dy /= d;
    if (!H.on) { // крюк летит
      H.fly += dt / H.flyT; draw(H.fly, d);
      if (H.fly >= 1) { if (!H.hit) { H = null; line.visible = false; cool = 2; say('Мимо!'); return; }
        H.on = true; H.L = Math.max(6, d); ctx.audio.thump(0.6); say(`Крюк зацепил: ${H.tgt.name}`); if (H.tgt.peerId) ctx.net.hook(H.tgt.peerId, 1, H.L); }
      return; }
    H.t += dt; H.jt = (H.jt || 0) - dt; if (H.mine && H.L > 9) H.L = Math.max(9, H.L - 0.7 * dt); // выбираем трос: подтягиваем цель
    if (d > H.L) { const mA = massOf(b), mB = H.tgt.inf ? Infinity : massOf(q), share = Number.isFinite(mB) ? mB / (mA + mB) : 1, mu = mA * share;
      const vr = ((q.vx || 0) - b.vx) * dx + ((q.vy || 0) - b.vy) * dy; // > 0 -- расходятся
      // Рывок: лодки расходятся быстрее, чем трос успевает тянуться (выбрал слабину или кто-то рванул прочь). Неупругий
      // удар через трос: расхождение почти гасится, скорость делится по массам, корпус бьёт. Очень резкий рывок трос рвёт
      if ((H.taut ? vr > 1.2 : vr > 0.6) && H.jt <= 0) {
        if (vr > 9) { release('Трос лопнул от рывка!'); ctx.audio.thump(1); ctx.shake(1); ctx.wear(b, 0, 0.12); return; }
        jerk(b, q, dx, dy, vr, share, mB); if (H.tgt.peerId) ctx.net.hook(H.tgt.peerId, 2, H.L, vr); // второй игрок видит нас с запаздыванием -- рывок сообщаем сами
        if (H.tgt.local && Number.isFinite(mB)) { q.vx -= dx * vr * 0.85 * (1 - share); q.vy -= dy * vr * 0.85 * (1 - share); } }
      H.taut = true;
      const F = Math.max(0, mu * (4 * (d - H.L) + 2.5 * vr)); // пружина и затухание троса
      b.vx += dx * F / mA * dt; b.vy += dy * F / mA * dt;
      if (H.tgt.local && Number.isFinite(mB)) { q.vx -= dx * F / mB * dt; q.vy -= dy * F / mB * dt; }
      if (H.mine) b.r = (b.r || 0) + clamp(-(Math.sin(b.th) * dy - Math.cos(b.th) * dx) * F / mA * dt * 0.25, -0.2, 0.2);
      ctx.wear(b, 0, dt * 0.003 * clamp(d - H.L, 0, 3)); // трос, натянутый втугую, мнёт борт
      if (d - H.L > 10) { release('Трос лопнул!'); ctx.audio.thump(0.9); return; }
    } else H.taut = false;
    if (H.t > 45) { release('Крюк сорвался'); return; }
    draw(1, d); }
  // трос: провисает цепной линией, пока не натянут; в полёте -- дуга от носа к цели
  function draw(f, d) { line.visible = true; const ex = A.x + (B.x - A.x) * Math.min(f, 1), ey = A.y + (B.y - A.y) * Math.min(f, 1), ez = A.z + (B.z - A.z) * Math.min(f, 1);
    const flying = f < 1 || !H.on, arc = flying ? (1.5 + d * 0.12) * Math.sin(Math.PI * Math.min(f, 1)) : 0, sag = flying ? 0 : 0.15 + Math.sqrt(Math.max(0, H.L * H.L - d * d)) * 0.45;
    for (let i = 0; i < N; i++) { const t = i / (N - 1), o = i * 3; pos[o] = A.x + (ex - A.x) * t; pos[o + 2] = -(A.y + (ey - A.y) * t);
      pos[o + 1] = A.z + (ez - A.z) * t + (arc - sag) * 4 * t * (1 - t); }
    tube(); }
  return { press, remote, step, release, aim, get state() { return H; }, get active() { return !!H; }, get mine() { return !!(H && H.mine); }, get ready() { return cool <= 0; } };
}
