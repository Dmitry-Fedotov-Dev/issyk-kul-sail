// Пеший Дымок: общий режим для всех снарядов. Снаряд подключается адаптером (canExit / exitPoint / mountPoint /
// hide / show), сам режим ничего не знает о физике параплана или лодки и её не трогает: пока Дымок гуляет, снаряд
// стоит в мире, где его оставили.
// Автомат состояний: DISMOUNTING -> ON_FOOT (idle, walk, run, jump, land, rest, look, interact, happy) -> MOUNTING.
// Кадры -- с листа автора (dymokfoot.js): со спины -- когда идёт от камеры, боком -- вправо/влево (зеркалом),
// мордочкой -- на камеру и в покое. Чего в листе нет, добирает процедура: подпрыгивание шага, дуга прыжка, сжатие.
import * as THREE from 'three';
import { DFOOT } from './dymokfoot.js';
import { clamp, wrapPi } from './sim.js';

const IMG = typeof Image !== 'undefined' ? new Image() : null; if (IMG) IMG.src = DFOOT.png;
const FR = DFOOT.frames, CW = 128, CH = 104, AX = 64, AY = 98, PXM = 0.021;
const SEQ = { idle: ['idle0', 'idle1', 'idle2', 'idle3'], walk: ['walk0', 'walk1', 'walk2', 'walk3', 'walk4'], run: ['run0', 'run1', 'run2', 'run3', 'run4'],
  back: ['back0', 'back1', 'back2', 'back3'], backRun: ['back4', 'back5', 'back6'], front: ['idle0', 'idle1', 'look0', 'idle3'],
  jump: ['jump0', 'jump1', 'jump2', 'jump3'], land: ['land0', 'land1', 'land2'], rest: ['rest0', 'rest1', 'rest2'], look: ['look0', 'look1', 'look2', 'look3'],
  inter: ['inter0', 'inter1', 'inter2', 'inter3'], happy: ['emo0', 'emo1'], scared: ['emo2'], dis: ['dis0', 'dis1', 'dis2', 'dis3', 'dis4'] };
const WALK = 2.3, RUN = 5.4, G = 15; // м/с; ускорение свободного падения -- чуть мультяшнее земного

// ---------- адаптеры снарядов ----------
// Параплан: выйти можно только после посадки, крыло и пустое ведёрко остаются на месте.
export function paraAdapter(PG) {
  return {
    id: 'para', name: 'параплан',
    canExit() { const P = PG.player, g = P && P.g; if (!g) return { ok: false, why: '' }; if (g.mode !== 'landed') return { ok: false, why: 'Сначала посадка — из ведёрка в полёте не выпрыгнешь' }; return { ok: true }; },
    exitPoint() { const g = PG.player.g; return { X: g.X, Y: g.Y, th: g.th }; },
    seat() { const g = PG.player.g; return { X: g.X, Y: g.Y }; },
    hide() { PG.player.model.fp(true); }, show() { PG.player.model.fp(false); },
    bucket: true,
  };
}
// Лодки и доски: сойти можно, когда снаряд стоит у самого берега; плавание -- следующим этапом.
export function boatAdapter(Gm) {
  const near = (b, h) => { for (let r = 2; r <= 10; r += 2) for (let a = 0; a < 16; a++) { const x = b.X + Math.cos(a / 16 * 6.283) * r, y = b.Y + Math.sin(a / 16 * 6.283) * r; if (h(x, y) > 0.3) return { X: x, Y: y }; } return null; };
  return {
    id: 'boat', name: 'лодка',
    canExit() { const b = Gm.player.b; if ((b.speed || 0) > 0.7) return { ok: false, why: 'Сначала остановитесь' }; if (!near(b, Gm.h)) return { ok: false, why: 'До берега далеко — подойдите к суше (плавание будет позже)' }; return { ok: true }; },
    exitPoint() { const b = Gm.player.b, p = near(b, Gm.h); return { X: p.X, Y: p.Y, th: Math.atan2(p.X - b.X, p.Y - b.Y) }; },
    seat() { const b = Gm.player.b; return { X: b.X, Y: b.Y }; },
    hide() {}, show() {}, bucket: false,
  };
}

function bucketSprite() { // пустое ведёрко, пиксельное -- в тон кадров
  const c = document.createElement('canvas'); c.width = 30; c.height = 24; const x = c.getContext('2d');
  for (let j = 0; j < 20; j++) { const w = 13 - j * 0.15, y = 3 + j; for (let i = -w; i <= w; i++) { const X = Math.round(15 + i); x.fillStyle = (j === 0 || j === 19 || Math.abs(i) > w - 1) ? '#3a2418' : (j === 4 || j === 14) ? '#8a8a96' : (Math.round(i + 13) % 5 === 0 ? '#7a4a2a' : j < 3 ? '#5e3a22' : '#b07a48'); x.fillRect(X, y, 1, 1); } }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.3 })); s.scale.set(30 * 0.028, 24 * 0.028, 1); s.center.set(0.5, 0.04); return s;
}

export function makeFootMode(A) {
  const { G: Gm, scene, camera, $, input, audio, toast, TOUCH } = A;
  const H = (x, y) => (Gm.hMesh ? Gm.hMesh(x, y) : Gm.h(x, y)); // земля -- та, что нарисована
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3 })); spr.scale.set(CW * PXM, CH * PXM, 1); spr.center.set(AX / CW, 1 - AY / CH); spr.visible = false; scene.add(spr);
  const bucket = bucketSprite(); bucket.visible = false; scene.add(bucket);
  // следы лап на песке и пыль -- маленькие пулы
  const PN = 90, prints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6e5a3e, transparent: true, opacity: 0.55, depthWrite: false }), PN);
  prints.count = 0; prints.frustumCulled = false; scene.add(prints); let pi = 0; const pm = new THREE.Matrix4();
  const dust = Array.from({ length: 14 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); return { s, t: 0 }; }); let di = 0;
  const C = { on: false, st: 'idle', adapter: null, X: 0, Y: 0, Z: 0, vx: 0, vy: 0, vz: 0, th: 0, ground: true, t: 0, fi: 0, ft: 0, idleT: 0, act: null, actT: 0, flip: false, view: 'side', step: 0, camYaw: 0, jumpPrev: false, seat: null, camP: new THREE.Vector3(), lastPrint: 0, bob: 0, msgT: 0 };
  const surface = (X, Y) => { const h = H(X, Y), e = 1.5, sl = Math.hypot(H(X + e, Y) - H(X - e, Y), H(X, Y + e) - H(X, Y - e)) / (2 * e);
    return h < -0.25 ? 'deep' : h < 0.05 ? 'shallow' : h < 5 ? 'sand' : sl > 0.75 || h + 1601 > 3300 ? 'rock' : 'grass'; };
  function setAct(name, sec) { C.act = name; C.actT = sec; C.fi = 0; C.ft = 0; }

  function start(adapter) {
    const q = adapter.canExit(); if (!q.ok) { if (q.why) toast(q.why); return false; }
    const e = adapter.exitPoint(); C.adapter = adapter; C.on = true; C.X = e.X; C.Y = e.Y; C.th = e.th; C.Z = H(C.X, C.Y); C.vx = C.vy = C.vz = 0; C.ground = true; C.seat = adapter.seat();
    C.st = 'dis'; C.fi = 0; C.ft = 0; C.t = 0; spr.visible = true; adapter.hide();
    if (adapter.bucket) { bucket.visible = false; bucket.position.set(C.seat.X, Math.max(0, H(C.seat.X, C.seat.Y)), -C.seat.Y); }
    C.camYaw = e.th; C.camP.set(C.X - Math.sin(C.th) * 6, C.Z + 3, -C.Y + Math.cos(C.th) * 6); $('result').hidden = true; document.body.classList.add('foot'); C.tsText = $('ts').textContent; $('ts').textContent = 'прыжок';
    audio.vario(0, false); audio.airflow(0, 0, 0, false); return true; }
  function stop() { if (!C.on) return; C.on = false; spr.visible = false; bucket.visible = false; if (C.adapter) C.adapter.show(); C.adapter = null; document.body.classList.remove('foot'); $('hint').hidden = true; if (C.tsText) $('ts').textContent = C.tsText; }
  function mount() { if (!C.on || C.st === 'mount' || C.st === 'dis') return; const d = Math.hypot(C.X - C.seat.X, C.Y - C.seat.Y);
    if (d > 3) { toast(`До снаряда ${d.toFixed(0)} м — подойдите ближе`); return; } bucket.visible = false; C.st = 'mount'; C.fi = 0; C.ft = 0; C.X = C.seat.X; C.Y = C.seat.Y; C.Z = H(C.X, C.Y); }

  function tick(dt) {
    if (!C.on) return; C.t += dt;
    if (C.st === 'dis' || C.st === 'mount') { // спешивание / посадка: кадры листа по порядку (посадка -- в обратном)
      C.ft += dt; if (C.ft > 0.42) { C.ft = 0; C.fi++; }
      if (C.st === 'dis') { const k = clamp((C.fi + C.ft / 0.42) / 4, 0, 1), e = k * k * (3 - 2 * k); C.X = C.seat.X + Math.cos(C.th) * 1.4 * e; C.Y = C.seat.Y - Math.sin(C.th) * 1.4 * e; C.Z = H(C.X, C.Y) + Math.sin(k * Math.PI) * 0.5; if (C.fi >= 5) { C.st = 'idle'; C.fi = 0; setAct('look', 1.6); C.Z = H(C.X, C.Y); if (C.adapter.bucket) bucket.visible = true; } } // вылез вбок -- ведёрко рядом, камере его видно
      else if (C.fi >= 4) { stop(); return; }
      return; }
    // ввод относительно камеры
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0), my = (input.sin ? 1 : 0) - (input.flare ? 1 : 0), run = !!input.shift;
    if (input.joy) { const j = input.joy, m = Math.hypot(j.x, j.y); if (m > 0.15) { mx = j.x; my = -j.y; run = m > 0.85; } }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const yaw = C.camYaw + Gm.orbit, wx = Math.cos(yaw) * mx + Math.sin(yaw) * my, wy = -Math.sin(yaw) * mx + Math.cos(yaw) * my; // в мир: X восток, Y север
    const surf = surface(C.X, C.Y), want = (run ? RUN : WALK) * (surf === 'sand' ? 0.88 : surf === 'rock' ? 0.8 : surf === 'shallow' ? 0.6 : 1);
    const tvx = wx * want, tvy = wy * want, acc = (C.ground ? 12 : 3) * dt;
    C.vx += clamp(tvx - C.vx, -acc, acc); C.vy += clamp(tvy - C.vy, -acc, acc);
    const sp = Math.hypot(C.vx, C.vy); if (sp > 0.3) C.th += wrapPi(Math.atan2(C.vx, C.vy) - C.th) * Math.min(1, dt * 10);
    // шаг с проверкой: в глубокую воду нельзя, крутую стену без прыжка не взять, в прыжке -- только на то, что ниже ног
    let nx = C.X + C.vx * dt, ny = C.Y + C.vy * dt; const gh = H(nx, ny), g0 = H(C.X, C.Y);
    if (gh < -0.25) { nx = C.X; ny = C.Y; C.vx *= -0.2; C.vy *= -0.2; if (C.msgT <= 0) { toast('Дальше глубоко — Дымок не любит мочить лапы'); C.msgT = 4; } }
    else if (C.ground && sp > 0.1 && (gh - g0) / (sp * dt) > 1.25) { nx = C.X; ny = C.Y; C.vx *= 0.3; C.vy *= 0.3; if (C.msgT <= 0) { toast('Круто — запрыгните (пробел)'); C.msgT = 3; } }
    else if (!C.ground && gh > C.Z + 0.05) { nx = C.X; ny = C.Y; }
    C.msgT -= dt; C.X = nx; C.Y = ny;
    // прыжок: только с земли, сильнее с разбега
    const jp = !!input.bar; if (jp && !C.jumpPrev && C.ground && C.st !== 'dis') { C.vz = 5.4 + sp * 0.25; C.ground = false; setAct(null, 0); C.st = 'jump'; C.fi = 0; audio.whee && audio.tick(900, 0.03); } C.jumpPrev = jp;
    const gNow = H(C.X, C.Y);
    if (!C.ground) { C.vz -= G * dt; C.Z += C.vz * dt; if (C.Z <= gNow) { C.Z = gNow; const hard = C.vz < -7; C.vz = 0; C.ground = true; setAct('land', 0.35); puff(4); if (hard) setAct('land', 0.6); else if (Math.random() < 0.3) setAct('happy', 0.9); } }
    else { // по земле: следуем рельефу, с обрыва -- падаем
      if (gNow < C.Z - 0.6) { C.ground = false; C.vz = 0; } else C.Z = gNow; }
    // состояние
    C.actT -= dt; if (C.actT <= 0) C.act = null;
    if ((input.left || input.right || input.sin || input.flare || input.joy) && C.act && C.act !== 'land') C.act = null; // управление важнее случайных поз
    if (!C.ground) C.st = 'jump'; else if (C.act) C.st = C.act; else if (sp > 3.6) C.st = 'run'; else if (sp > 0.35) C.st = 'walk'; else C.st = 'idle';
    if (C.st === 'idle') { C.idleT += dt; if (C.idleT > 6 && !C.act) { C.idleT = 0; const r = Math.random(); setAct(r < 0.4 ? 'look' : r < 0.75 ? 'rest' : 'inter', r < 0.4 ? 2.2 : 3.2); } } else C.idleT = 0;
    // эффекты: следы на песке, пыль при беге
    if (C.ground && sp > 0.4) { C.lastPrint += sp * dt; if (C.lastPrint > 0.32) { C.lastPrint = 0; C.step ^= 1; if (surf === 'sand' || surf === 'shallow') print(); if (sp > 3.6 && surf !== 'grass') puff(1); if (surf === 'shallow') audio.stroke && audio.stroke(0.3); } }
    for (const d of dust) if (d.t > 0) { d.t -= dt; const k = 1 - d.t / 0.8; d.s.scale.setScalar(0.25 + k * 0.6); d.s.material.opacity = 0.55 * (1 - k); d.s.position.y += dt * 0.4; if (d.t <= 0) d.s.visible = false; }
    C.sp = sp; C.surf = surf;
  }
  function print() { const sd = C.step ? 1 : -1, ox = Math.cos(C.th) * 0.08 * sd, oy = -Math.sin(C.th) * 0.08 * sd, x = C.X + ox, y = C.Y + oy;
    pm.makeRotationY(-C.th); pm.setPosition(x, H(x, y) + 0.03, -y); prints.setMatrixAt(pi, pm); pi = (pi + 1) % PN; prints.count = Math.min(PN, prints.count + 1); prints.instanceMatrix.needsUpdate = true; }
  function puff(n) { for (let i = 0; i < n; i++) { const d = dust[di]; di = (di + 1) % dust.length; d.t = 0.8; d.s.visible = true; d.s.position.set(C.X + (Math.random() - 0.5) * 0.5, C.Z + 0.1, -C.Y + (Math.random() - 0.5) * 0.5); } }

  // кадр: вид выбирается по направлению движения относительно камеры
  function frame(dt) {
    let seq, flip = C.flip; const camDir = Math.atan2(C.X - camera.position.x, C.Y + camera.position.z), rel = wrapPi(C.th - camDir);
    const moving = C.st === 'walk' || C.st === 'run';
    if (C.st === 'dis' || C.st === 'mount') seq = SEQ.dis;
    else if (moving && Math.abs(rel) < 0.85) seq = C.st === 'run' ? SEQ.backRun : SEQ.back;
    else if (moving && Math.abs(rel) > 2.3) seq = SEQ.front;
    else seq = SEQ[C.st] || SEQ.idle;
    if (Math.abs(rel) > 0.25 && Math.abs(rel) < 2.9) flip = rel < 0; C.flip = flip; // боковые кадры смотрят вправо; влево -- зеркало
    if (C.st === 'dis') { C.fi = Math.min(C.fi, 4); }
    else if (C.st === 'mount') { /* назад по листу */ }
    else if (C.st === 'jump') C.fi = C.vz > 2 ? 1 : C.vz > -1 ? 2 : 3;
    else { const fps = C.st === 'run' ? 11 : C.st === 'walk' ? 7 : C.st === 'land' ? 9 : 3.5; C.ft += dt * fps; if (C.ft >= 1) { C.ft -= 1; C.fi++; } if (C.st === 'land' || C.st === 'inter' || C.st === 'look' || C.st === 'rest') C.fi = Math.min(C.fi, seq.length - 1); }
    const key = C.st === 'mount' ? seq[clamp(3 - C.fi, 0, 4)] : seq[C.fi % seq.length], k = FR[key]; if (!k || !IMG || !IMG.complete) return;
    cx.clearRect(0, 0, CW, CH); cx.imageSmoothingEnabled = false; cx.save(); if (flip) { cx.translate(CW, 0); cx.scale(-1, 1); }
    cx.drawImage(IMG, k[0], k[1], k[2], k[3], Math.round(AX - k[4]), Math.round(AY - k[5]), k[2], k[3]); cx.restore(); tex.needsUpdate = true;
    // шаг подбрасывает тельце, прыжок -- по настоящей дуге
    C.bob = moving ? Math.abs(Math.sin(C.t * (C.st === 'run' ? 13 : 9))) * (C.st === 'run' ? 0.09 : 0.05) : 0;
    spr.position.set(C.X, C.Z + C.bob, -C.Y);
  }
  // камера: сзади-сверху, за курсом тянется плавно, мышью/пальцем -- облёт; в землю не уходит
  function cam(dt) {
    if (!C.on) return; frame(dt);
    if ((C.sp || 0) > 0.8 && !input.left && !input.right) C.camYaw += wrapPi(C.th - C.camYaw) * Math.min(1, dt * 1.2);
    const yaw = C.camYaw + Gm.orbit, d = 5.2 * Gm.zoom, el = clamp(0.32 + Gm.orbitP, 0.05, 1.3);
    const tx = C.X, ty = C.Z + 0.6, tz = -C.Y, want = new THREE.Vector3(tx - Math.sin(yaw) * d * Math.cos(el), ty + d * Math.sin(el), tz + Math.cos(yaw) * d * Math.cos(el));
    const gy = H(want.x, -want.z) + 0.6; if (want.y < gy) want.y = gy;
    C.camP.lerp(want, Math.min(1, dt * 5)); camera.position.copy(C.camP); camera.lookAt(tx, ty, tz); camera.fov += (55 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  function hud() {
    if (!C.on) return; const el = $('hint'), near = C.seat && Math.hypot(C.X - C.seat.X, C.Y - C.seat.Y) < 3 && C.st !== 'dis';
    const h = C.st === 'dis' ? '' : near ? (TOUCH ? 'Рядом снаряд — кнопка «сесть»' : `F — вернуться: ${C.adapter.name}`) : (TOUCH ? 'Джойстик — идти, к краю — бежать · кнопка — прыжок' : 'WASD / стрелки — идти · Shift — бег · пробел — прыжок · E — понюхать · F у снаряда — сесть');
    if (el.textContent !== h) el.textContent = h; el.hidden = !h; el.className = 'hud';
    const fb = $('bfoot'); if (fb) { fb.hidden = !near; fb.textContent = 'сесть'; } }
  function interact() { if (!C.on || !C.ground || C.st === 'dis') return; setAct(Math.random() < 0.5 ? 'inter' : 'look', 2); audio.tick(1400, 0.03); }
  return { get on() { return C.on; }, start, stop, mount, tick, camera: cam, hud, interact, sound() {}, get state() { return C; } };
}
