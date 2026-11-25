// Режим «Ми-8 МЧС»: спасатели высокогорья. Район Хан-Тенгри -- база на леднике Южный Иныльчек; у Иссык-Куля --
// площадка старого аэродрома Чолпон-Аты.
// Управление -- как у самолёта: намерение у лётчика, рутина у автоматики (heli.js):
//   ← → / ↑ ↓ (джойстик) -- ручка: куда лететь; отпустил -- зависание. Пробел (▲) -- вверх, Shift (▼) -- вниз,
//   отпустил -- держит высоту, если хватает мощности.
// Спасработы: задание -- в лагерь или к людям на склоне. Сесть рядом (до 40 м) или зависнуть над ними низко (до 15 м
// над землёй, до 25 м в сторону) -- лебёдка: 5 секунд держать место. Груз и люди -- это масса: на высоте
// вертолёту её может не хватить.
import * as THREE from 'three';
import { Heli, MI8, hoverCeiling } from './heli.js';
import { makeHeli } from './helimodel.js';
import { NPCART } from './npcart.js';
import { KCAMPS } from './khanosm.js';
import { clamp, wrapPi } from './sim.js';

const AIRPORT = { X: -4385, Y: 1809 };
const CSS = `
body.heli #speed>b,body.heli #speed>small,body.heli #pos,body.heli #wear,body.heli #dialwrap,body.heli #race,body.heli #bpro,body.heli #bfoot{display:none!important}body.heli #tools{position:fixed;right:max(16px,env(safe-area-inset-right,0px));top:12px}
#hhud{left:max(16px,env(safe-area-inset-left,0px));top:14px;line-height:1.15}#hhud b.v{font-size:44px;font-weight:300;letter-spacing:-1px}#hhud small{font-size:13px;color:var(--dim);margin-left:4px}
#hhud .r{font-size:14px;margin-top:3px}#hhud .r b{font-weight:600}#hhud .bar{display:inline-block;width:86px;height:7px;border-radius:4px;background:rgba(255,255,255,.18);vertical-align:middle;margin:0 6px;overflow:hidden}#hhud .bar i{display:block;height:100%;background:#9fe0a0}#hhud .bar i.hot{background:#ff8a2a}#hhud .bar i.red{background:#ff4a3a}
#hwarn{left:50%;top:28%;transform:translateX(-50%);font:800 clamp(20px,4.6vmin,34px) var(--ui);color:#ff5a3a;text-shadow:0 2px 12px rgba(0,0,0,.7);letter-spacing:.06em;animation:jblink .5s steps(2) infinite}
#hmis{left:50%;top:14px;transform:translateX(-50%);text-align:center;font-size:14px;max-width:min(560px,70vw)}#hmis b{font-size:17px}
#hcol{position:fixed;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));display:none;flex-direction:column;gap:14px;z-index:2}
#hcol button{width:76px;height:76px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(10,30,60,.45);color:#fff;font:800 26px var(--ui);touch-action:none;-webkit-user-select:none;user-select:none}
#hcol button.on{background:rgba(255,138,42,.75)}body.touchdev.heli #hcol{display:flex}
body.touchdev.heli #joy{display:block;left:calc(26px + env(safe-area-inset-left,0px));transform:none;width:168px;height:168px;bottom:calc(26px + env(safe-area-inset-bottom,0px))}body.touchdev.heli #joy i{width:64px;height:64px;margin:-32px 0 0 -32px}body.touchdev.heli #ts{display:none!important}
body.touchdev.heli #hint{bottom:calc(206px + env(safe-area-inset-bottom,0px))}
#hcoach{left:50%;bottom:calc(210px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(520px,86vw);background:rgba(8,24,52,.72);border:2px solid #ff8a2a;border-radius:16px;padding:12px 16px;font-size:17px;line-height:1.3;text-align:center;pointer-events:none}
#hcoach small{display:block;color:#ffb07a;font-size:12px;letter-spacing:.12em;margin-bottom:4px}body:not(.touchdev) #hcoach{bottom:40px}
#harr{left:50%;top:84px;transform:translateX(-50%);text-align:center;font-size:14px}#harr i{display:inline-block;font-style:normal;font-size:34px;line-height:34px;color:#ff8a2a;text-shadow:0 2px 8px rgba(0,0,0,.6)}
#hland{left:50%;top:40%;transform:translateX(-50%);font:800 clamp(18px,4vmin,28px) var(--ui);letter-spacing:.05em;text-shadow:0 2px 10px rgba(0,0,0,.7)}#hland.ok{color:#9fe0a0}#hland.go{color:#ffd27a}#hland.bad{color:#ff5a3a}
`;

export function makeHeliMode(A) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input, ach, showGame, resetView, fmt } = A;
  let on = false, built = false, Hc = null, M = null, P = null, prev = null, F = null, boom = null, marks = null, people = null, beacon = null;
  const v3 = new THREE.Vector3(), cpos = new THREE.Vector3(), clook = new THREE.Vector3(0, 0, -1);
  const H = (x, y) => G.h(x, y);

  // ---- спрайты: палатка, флаг лагеря, люди (атлас NPC) ----
  const atlas = (() => { const img = new Image(); img.src = NPCART.png; const t = new THREE.Texture(img); img.onload = () => { t.needsUpdate = true; }; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
  function personSprite(frame, hM = 1.75) { const f = NPCART.frames[frame], img = atlas.image; const t = atlas.clone(); t.needsUpdate = true;
    const W = 1024, Hh = 441; t.repeat.set(f[2] / W, f[3] / Hh); t.offset.set(f[0] / W, 1 - (f[1] + f[3]) / Hh); void img;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.4 })); m.scale.set(hM * f[2] / f[3], hM, 1); m.center.set(f[4] / f[2], 0); return m; }
  function tentSprite(color = '#ff6a1a') { const c = document.createElement('canvas'); c.width = 128; c.height = 80; const x = c.getContext('2d');
    x.fillStyle = color; x.strokeStyle = '#1b1b22'; x.lineWidth = 5; x.beginPath(); x.moveTo(8, 74); x.quadraticCurveTo(20, 6, 64, 6); x.quadraticCurveTo(108, 6, 120, 74); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#2a2a30'; x.beginPath(); x.moveTo(52, 74); x.quadraticCurveTo(64, 34, 76, 74); x.closePath(); x.fill(); x.lineWidth = 3; x.beginPath(); x.moveTo(30, 60); x.quadraticCurveTo(64, 10, 98, 60); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.3 })); s.scale.set(4.2, 2.6, 1); s.center.set(0.5, 0.04); return s; }
  function flagPole() { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 5), new THREE.MeshStandardMaterial({ color: 0xdddddd })); p.position.y = 2.5; g.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide })); f.position.set(0.8, 4.4, 0); g.add(f); g.userData.f = f; return g; }
  // посадочный знак «Н» и круг: видно с воздуха
  function padMark(r = 14) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#ff6a1a'; x.lineWidth = 9; x.beginPath(); x.arc(64, 64, 56, 0, 7); x.stroke();
    x.fillStyle = '#ff6a1a'; x.fillRect(40, 30, 12, 68); x.fillRect(76, 30, 12, 68); x.fillRect(40, 58, 48, 12); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })); m.rotation.x = -Math.PI / 2; return m; }
  // маяк цели: оранжевый световой столб до неба (видно за десятки километров) и дымовая шашка у земли
  function makeBeacon() { const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1200, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
    col.position.y = 600; g.add(col);
    const sm = []; const st = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,140,60,0.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
    for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false })); s.userData.t = i / 14; g.add(s); sm.push(s); }
    scene.add(g); g.visible = false; return { g, col, sm }; }
  function beaconTick(dt, tg, d) { const B = beacon; if (!tg) { B.g.visible = false; return; } B.g.visible = true; B.g.position.set(tg.X, tg.z, -tg.Y);
    B.col.material.opacity = 0.12 + 0.18 * Math.min(1, d / 3000) + 0.05 * Math.sin(F.t * 3); const W = F.wv || { x: 0, y: 0 };
    for (const s of B.sm) { s.userData.t = (s.userData.t + dt * 0.12) % 1; const t = s.userData.t, r = 3 + t * 26; s.position.set(W.x * t * 9, 2 + t * 70, -W.y * t * 9); s.scale.set(r, r, 1); s.material.opacity = 0.75 * (1 - t); } }
  // снежный вихрь от винта: у земли поток разгоняет снег кольцом из-под вертолёта
  function washTick(dt) { if (!G.spray || Hc.agl > 28 || Hc.crash || F.rpm < 0.6) return; const k = (1 - Hc.agl / 28) * Math.min(1, Hc.power + 0.2), n = Math.round(k * 10 * dt * 60 / 2), gz = H(Hc.X, Hc.Y);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = 6 + Math.random() * 10, v = 10 + 14 * k; G.spray.emit(Hc.X + Math.cos(a) * r, gz + 0.5, -(Hc.Y + Math.sin(a) * r), Math.cos(a) * v, 1.5 + Math.random() * 4, -Math.sin(a) * v, 3.5, 1, 1); } }
  function makeBoom() { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 0 }; }

  function build() { if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'hwrap'; w.hidden = true; w.innerHTML = '<div id="hhud" class="hud"></div><div id="hwarn" class="hud" hidden></div><div id="hmis" class="hud" hidden></div><div id="harr" class="hud" hidden><i>⬆</i><div></div></div><div id="hland" class="hud" hidden></div><div id="hcoach" class="hud" hidden></div><div id="hcol"><button id="hup">▲</button><button id="hdn">▼</button></div>'; $('game').appendChild(w);
    for (const [id, k] of [['hup', 'hu'], ['hdn', 'hd']]) { const b = $(id); const set = (v) => (e) => { e.preventDefault(); e.stopPropagation(); input[k] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false)); }
    Hc = new Heli(); M = makeHeli(); scene.add(M.root); M.root.visible = false; boom = makeBoom();
    marks = new THREE.Group(); scene.add(marks); people = []; beacon = makeBeacon();
    P = { id: 'heli', name: 'Вы', b: { X: 0, Y: 0, th: 0, speed: 0, base: 0, y: 0, tws: 0, vx: 0, vy: 0 }, model: { root: M.root }, wake: { pts: [], mesh: { visible: false }, reset() {}, update() {} }, time: 0, leg: 0 }; }

  // ---- места: площадка (база), лагерь на леднике, люди на склоне ----
  function site(X, Y, kind, opt = {}) { const g = new THREE.Group(), z = H(X, Y); g.position.set(X, z, -Y); marks.add(g);
    if (kind === 'base' || kind === 'camp') { const pad = padMark(kind === 'base' ? 16 : 12); pad.position.y = 0.3; g.add(pad); const fp = flagPole(); fp.position.set(18, 0, 0); g.add(fp);
      const tents = kind === 'base' ? 6 : 3; for (let i = 0; i < tents; i++) { const t = tentSprite(['#ff6a1a', '#ffd23a', '#3a8ee8', '#e84a4a'][i % 4]), a = 0.7 + i * 0.9, r = 28 + (i % 2) * 9; t.position.set(Math.cos(a) * r, H(X + Math.cos(a) * r, Y + Math.sin(a) * r) - z, -Math.sin(a) * r); g.add(t); } }
    const folks = []; for (let i = 0; i < (opt.people || 0); i++) { const fr = ['goth0', 'goth1', 'goth2', 'goth3', 'goth4', 'blond0', 'blond4'][(i + (opt.seed || 0)) % 7], s = personSprite(fr), a = i * 2.1 + 0.5, r = 6 + i * 1.6;
      s.position.set(Math.cos(a) * r, H(X + Math.cos(a) * r, Y + Math.sin(a) * r) - z, -Math.sin(a) * r); g.add(s); folks.push(s); }
    if (kind === 'slope') { const t = tentSprite('#ffd23a'); t.position.set(-7, 0, 3); g.add(t); }
    return { X, Y, z, kind, g, folks, name: opt.name || '' }; }
  // ровное место рядом с точкой: самый пологий участок в радиусе R на нужной высоте
  function flatSpot(X0, Y0, R, aslLo, aslHi) { let best = null;
    for (let dy = -R; dy <= R; dy += 100) for (let dx = -R; dx <= R; dx += 100) { const X = X0 + dx, Y = Y0 + dy, z = H(X, Y), asl = z + 1607; if (asl < aslLo || asl > aslHi) continue;
      const sl = Math.hypot(H(X + 30, Y) - H(X - 30, Y), H(X, Y + 30) - H(X, Y - 30)) / 60; if (!best || sl < best.sl) best = { X, Y, sl }; } return best || { X: X0, Y: Y0, sl: 1 }; }

  // пролёт по прямой: самая высокая точка рельефа на отрезке (над морем)
  function ridgeOn(a, b) { let m = -1e9; for (let t = 0; t <= 1; t += 0.02) m = Math.max(m, H(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t)); return m + 1607; }
  // точка на леднике в кольце R0..R1 от a, на высоте lo..hi, ближе к направлению на k, с чистым пролётом от a
  function onIce(a, R0, R1, lo, hi, k) { const z = G.khan, g = z.grid; let best = null;
    for (let dy = -R1; dy <= R1; dy += 200) for (let dx = -R1; dx <= R1; dx += 200) { const r = Math.hypot(dx, dy); if (r < R0 || r > R1) continue; const X = a.X + dx, Y = a.Y + dy, asl = H(X, Y) + 1607; if (asl < lo || asl > hi) continue;
      const i = Math.round((X - g.X0) / g.STEP), j = Math.round((g.Y1 - Y) / g.STEP), gl = z.aG[(j * g.W + i) * 3]; if (gl < 0.55) continue;
      const clear = ridgeOn(a, { X, Y }) - Math.max(asl, H(a.X, a.Y) + 1607), toK = Math.hypot(k.X - X, k.Y - Y), sc = clear * 3 + toK * 0.05; if (!best || sc < best.sc) best = { X, Y, sc }; }
    return best || flatSpot(a.X, a.Y, 1500, lo, hi); }
  function reach(a, k, R, lo, hi) { let best = null;
    for (let dy = -R; dy <= R; dy += 150) for (let dx = -R; dx <= R; dx += 150) { const X = k.X + dx, Y = k.Y + dy, asl = H(X, Y) + 1607; if (asl < lo || asl > hi) continue;
      const sl = Math.hypot(H(X + 30, Y) - H(X - 30, Y), H(X, Y + 30) - H(X, Y - 30)) / 60, clear = ridgeOn(a, { X, Y }) - asl, sc = sl * 400 + Math.max(0, clear) * 2 + Math.hypot(dx, dy) * 0.02; if (!best || sc < best.sc) best = { X, Y, sc }; }
    return best || flatSpot(k.X, k.Y, 1800, lo, hi); }
  // ---- спасработы: цепочка заданий ----
  function missions(mode = '') { const z = G.khan, pts = []; marks.clear();
    if (!z) { const b = site(AIRPORT.X, AIRPORT.Y, 'base', { name: 'аэродром Чолпон-Аты' }); F.base = b; return []; }
    const bc = z.poi.bcS, k = z.poi.khan, b = site(bc.X, bc.Y, 'base', { name: 'база «Южный Иныльчек»', people: 2, seed: 3 }); F.base = b;
    // лагерь 1 -- выше по леднику Южный Иныльчек, на 4000-4300 м, с чистым пролётом от базы; седловина -- у Хан-Тенгри,
    // 5000-5400 м, подлёт от лагеря без стены выше потолка груженого вертолёта
    // настоящие лагеря южного маршрута на Хан-Тенгри (OpenStreetMap): лагерь 1 -- 4200 м на леднике Семёнова-Звёздочка,
    // лагерь 2 -- 5200 м под стеной; без данных -- места по рельефу
    const camp = (ele) => { let best = null; for (const [n, X, Y, e] of KCAMPS) { if (Math.abs(e - ele) > 60) continue; const d = Math.hypot(X - k.X, Y - k.Y); if (d < 12000 && (!best || d < best.d)) best = { X, Y, d, n }; } return best; };
    const c1p = camp(4200) || onIce(bc, 4500, 8000, 4000, 4350, k), c1 = site(c1p.X, c1p.Y, 'camp', { name: 'лагерь 1 · 4200 м', people: 1, seed: 1 });
    const c2p = camp(5200) || reach(c1p, k, 6000, 5000, 5400), c2 = site(c2p.X, c2p.Y, 'slope', { name: 'лагерь 2 · 5200 м', people: 2, seed: 0 });
    if (mode === 'merz' && G.merz) { const o = G.merz.out, ob = site(o.X, o.Y, 'none', { name: 'прорыв Мерцбахера' }); ob.z = G.merz.top;
      pts.push({ t: 'Гидрологи', d: 'Озеро Мерцбахера прорывается! Зависните у плотины — снимаем сброс воды', to: ob, how: 'watch', done: 'Снято! Данные ушли в Бишкек и Аксу' });
      pts.push({ t: 'На базу', d: 'В базовый лагерь Южный Иныльчек', to: b, how: 'land', done: 'Вылет завершён' }); return pts; }
    pts.push({ t: 'Доставка', d: 'Медикаменты в лагерь 1 маршрута на Хан-Тенгри (4200 м)', to: c1, load: 350, how: 'land', done: 'Аптечка в лагере. Врач на связи' });
    pts.push({ t: 'Эвакуация', d: 'Две туристки замерзают в лагере 2 на 5200 м — сесть нельзя, лебёдкой на борт', timer: true, to: c2, add: 2 * 60, how: 'winch', done: 'Обе на борту! Тяжелее на 120 кг — на высоте это чувствуется' });
    pts.push({ t: 'На базу', d: 'В базовый лагерь Южный Иныльчек — врачи ждут', to: b, how: 'land', done: 'Спасены. Экипаж МЧС — благодарность' });
    return pts; }
  function missionTick(dt) { const m = F.mis[F.mi]; if (!m) return; const dx = Hc.X - m.to.X, dy = Hc.Y - m.to.Y, d = Math.hypot(dx, dy);
    let ok = false; if (m.how === 'land') ok = Hc.ground && d < 45; else if (m.how === 'watch') ok = !Hc.ground && d < 900 && Hc.speed < 8; else ok = !Hc.ground && d < 25 && Hc.agl < 16 && Hc.speed < 4;
    F.hold = ok ? F.hold + dt : Math.max(0, F.hold - dt * 2); M.setWinch(m.how === 'winch' && ok ? Math.min(Hc.agl, F.hold * 6) : 0);
    if (F.hold >= (m.how === 'land' ? 2 : m.how === 'watch' ? 15 : 5)) { F.hold = 0; if (m.load > 0) Hc.load = Math.max(0, Hc.load - m.load); if (m.add) Hc.load += m.add;
      for (const s of m.to.folks) s.visible = m.how !== 'winch'; toast(m.done); audio.chime && audio.chime(); G.shake = Math.max(G.shake, 0.25); F.mi++;
      if (F.mis[F.mi] && F.mis[F.mi].timer) F.pt = 100;
      if (F.mi >= F.mis.length) { finish('rescue'); } else announce(); } }
  function announce() { const m = F.mis[F.mi]; if (!m) return; audio.chime && audio.chime(); } // текст задания -- в верхней строке (#hmis)

  // ---- инструктаж (первые вылеты): шаг -- текст и условие, засчитывается по факту ----
  const COACH = [
    { t: () => TOUCH ? 'Зажмите <b>▲</b> справа — шаг вверх: вертолёт оторвётся от льда' : 'Зажмите <b>Пробел</b> — шаг вверх: вертолёт оторвётся от льда', ok: () => !Hc.ground && Hc.agl > 12 },
    { t: () => 'Отпустите — автомат <b>держит высоту</b> и висит на месте', ok: () => !(input.bar || input.hu) && Math.abs(Hc.vz) < 1 && Hc.agl > 8, hold: 1.5 },
    { t: () => `Оранжевый <b>столб дыма</b> — цель. ${TOUCH ? 'Джойстик вперёд' : 'Стрелка ↑'} — летим к ней`, ok: () => Hc.speed > 15 },
    { t: () => `${TOUCH ? 'Джойстик' : 'Стрелки'} в сторону — <b>поворот</b>. Куда тянете — туда и летит`, ok: () => Math.abs(wrapPi(Hc.th - (F.c0 ?? Hc.th))) > 0.4 },
    { t: () => `У цели <b>отпустите</b> — затормозит сам. ${TOUCH ? '<b>▼</b>' : '<b>Shift</b>'} — вниз, садитесь в круг «Н»`, ok: () => F.mi >= 1 } ];
  function coachTick(dt) { const el = $('hcoach'); if (F.coach === undefined || F.coach >= COACH.length) { el.hidden = true; return; }
    const st = COACH[F.coach]; if (F.cStep !== F.coach) { F.cStep = F.coach; F.cT = 0; F.c0 = Hc.th; el.innerHTML = `<small>ИНСТРУКТАЖ · ${F.coach + 1} ИЗ ${COACH.length}</small>${st.t()}`; el.hidden = false; }
    F.cT = st.ok() ? F.cT + dt : 0; if (F.cT >= (st.hold || 0.2)) { F.coach++; audio.chime && audio.chime(); if (F.coach >= COACH.length) { store.set('heliCoach', 1); toast('Отлично! Дальше — сами'); } } }
  function begin() { build(); if (!on) prev = G.player; on = true; for (const k in G.marks || {}) G.marks[k].visible = false;
    if (prev && prev.model && prev.model.root) prev.model.root.visible = false; if (prev && prev.wake && prev.wake.mesh) prev.wake.mesh.visible = false;
    G.player = P; G.race = null; G.mode = 'heli'; M.root.visible = true; boom.m.visible = false; marks.visible = true;
    document.body.classList.add('heli'); document.body.classList.remove('motor', 'para', 'jet'); $('hwrap').hidden = false; $('mark').hidden = true; $('result').hidden = true; $('brief').hidden = true;
    F = { t: 0, ended: false, msg: {}, mis: [], mi: 0, hold: 0, crashT: 0, rpm: 0, camD: 34, coach: store.get('heliCoach') ? undefined : 0, cam: null, touches: 0, hard: 0, soft: 0, wasGround: true }; showGame(true); resetView(); G.cam = 0; camInit = false; }
  function startFree(mode = '') { begin(); F.mis = missions(mode); const b = F.base;
    if (mode === 'merz' && G.merz) { const o = G.merz.out, c = G.merz.center, a = Math.atan2(c.X - o.X, c.Y - o.Y), X = c.X + Math.sin(a) * 600, Y = c.Y + Math.cos(a) * 600;
      Hc.reset(X, Y, Math.max(H(X, Y), G.merz.top) + 150, a + Math.PI, false); Hc.load = 0; F.mi = 0; toast('Озеро Мерцбахера. Слышите? Это лёд'); return; }
    Hc.reset(b.X + 4, b.Y - 6, H(b.X + 4, b.Y - 6), G.khan ? Math.atan2(G.khan.poi.khan.X - b.X, G.khan.poi.khan.Y - b.Y) : 0, true); Hc.load = 0; F.mi = 0;
    const m0 = F.mis[0]; if (m0 && m0.load > 0) Hc.load = m0.load;
    { let px = b.X, py = b.Y, L = 0; for (const m of F.mis) { L += Math.hypot(m.to.X - px, m.to.Y - py); px = m.to.X; py = m.to.Y; } F.par = Math.round(L / 45 + 75 * F.mis.length); } // норматив: 160 км/ч по прямой + минута с четвертью на каждую точку
    const cl = hoverCeiling(Hc.mass); toast(G.khan ? `База ${Math.round(b.z + 1607)} м · висеть можно до ${Math.round(cl)} м` : 'Ми-8 на площадке. Пробел — шаг вверх, стрелки — куда лететь');
    setTimeout(() => { if (on) announce(); }, 4500); }
  function stop() { if (!on) return; on = false; M.root.visible = false; marks.visible = false; beacon.g.visible = false; boom.m.visible = false; document.body.classList.remove('heli'); $('hwrap').hidden = true; camera.up.set(0, 1, 0);
    $('hint').hidden = true; $('mark').hidden = true; audio.jet && audio.jet(0, 0, false); audio.airflow(0, 0, 0, false); input.hu = input.hd = false; if (prev) G.player = prev; F = null; }

  // ---- ветер: общий поток растёт с высотой, на гребнях сильнее; у склонов -- подъём на наветренной стороне,
  //      спуск и роторная болтанка -- на подветренной ----
  // Погода Хан-Тенгри -- по выбору в меню: «бриз» -- ясно (на гребнях ~10 м/с), «санташ» -- ветрено (~22), «улан» --
  // буран: западный ураган до 40 м/с на 6-7 км (струйное течение садится на хребты), метель, снег срывает с гребней.
  // Порывы -- волнами по 20-40 с.
  const KW = { breeze: 10, santash: 22, ulan: 40 };
  function wind(X, Y, Z) { const asl = Z + 1607, zone = G.khan && G.inKhan;
    let wx, wy; if (zone) { const U0 = KW[G.preset] || 12, t = G.t || 0, gust = 0.75 + 0.25 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.67 + 1.3), Uh = U0 * (0.35 + 0.65 * Math.min(1, Math.max(0, asl - 3000) / 3500)) * gust, d = (265 + 15 * Math.sin(t * 0.05)) * Math.PI / 180;
      wx = -Math.sin(d) * Uh; wy = -Math.cos(d) * Uh; F && (F.wU = Uh); } // ветер «с запада» дует на восток
    else { const W = G.wind || { sx: 0, sy: 0 }, k = 1 + Math.min(2.2, Math.max(0, asl - 2500) / 1800); wx = W.sx * k; wy = W.sy * k; }
    const U = Math.hypot(wx, wy) || 1e-3;
    const e = 250, gx = (H(X + e, Y) - H(X - e, Y)) / (2 * e), gy = (H(X, Y + e) - H(X, Y - e)) / (2 * e), agl = Z - H(X, Y), near = Math.exp(-Math.max(0, agl) / 400);
    const up = (wx * gx + wy * gy) * near; // наветренный склон -- вверх, подветренный -- вниз
    const lee = Math.max(0, -(wx * gx + wy * gy) / U), tb = Math.min(1.6, U * 0.02 * (0.3 + near) + lee * 0.5 * near + (U > 25 ? (U - 25) * 0.02 : 0));
    return { x: wx, y: wy, z: clamp(up * 0.6, -3, 3), tb }; }

  // Ручка -- «куда тянешь, туда и летит» относительно экрана: вперёд -- от камеры, вбок -- в ту сторону экрана.
  // Автомат сам доворачивает нос в сторону полёта и наклоняет машину; на себя -- тормоз и назад, не разворачиваясь.
  function ctl() { let x = (input.right ? 1 : 0) - (input.left ? 1 : 0), y = (input.sin ? 1 : 0) - (input.flare ? 1 : 0);
    if (input.joy) { const j = input.joy, ex = (v) => (Math.abs(v) < 0.08 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.08) / 0.92, 1.3)); x = ex(j.x); y = -ex(j.y); }
    const up = (input.bar || input.hu ? 1 : 0) - (input.shift || input.hd ? 1 : 0), mag = Math.min(1, Math.hypot(x, y)); let fwd = 0, side = 0;
    if (mag > 0.05) { if (y < -0.3 && Math.abs(x) < 0.6) { fwd = y; side = x * 0.5; } // на себя -- тормоз и назад
      else { const camYaw = Math.atan2(clook.x, -clook.z) + G.orbit * 0, want = camYaw + Math.atan2(x, Math.max(0.05, y)), err = wrapPi(want - Hc.th);
        side = clamp(err * 1.6, -1, 1); fwd = mag * Math.max(0, Math.cos(err)) * (Math.abs(err) > 1.2 ? 0.3 : 1); F.want = want; } }
    return { fwd, side, up }; }

  function tick(dt) { if (!on) return; F.t += dt;
    if (Hc.crash) { crashTick(dt); return; }
    const c = ctl(), steps = Math.max(1, Math.ceil(dt / (1 / 120))); for (let i = 0; i < steps; i++) Hc.step(dt / steps, c, H, wind);
    Hc.fuel = Math.max(200, Hc.fuel - dt * (0.12 + 0.18 * Hc.power)); // ~800 кг/ч на висении
    if (Hc.crash) { startCrash(); return; }
    if (Hc.touch) { const t = Hc.touch; Hc.touch = null; F.touches = (F.touches || 0) + 1; if (t.vz > 2.5) { F.hard = (F.hard || 0) + 1; G.shake = 0.8; toast('Жёстко! Аккуратнее с шагом'); } else if (t.vz < 1) { F.soft = (F.soft || 0) + 1; toast('Мягко, как пёрышко'); } }
    if (F.wasGround && !Hc.ground) { G.shake = Math.max(G.shake, 0.45); audio.thump && audio.thump(0.35); } F.wasGround = Hc.ground; // отрыв -- вздрогнул и пошёл
    missionTick(dt); coachTick(dt); washTick(dt);
    { const mi = F.mis[F.mi]; beaconTick(dt, mi ? mi.to : null, mi ? Math.hypot(Hc.X - mi.to.X, Hc.Y - mi.to.Y) : 0); if (mi) F.wv = wind(mi.to.X, mi.to.Y, mi.to.z + 50); }
    if (F.pt !== undefined && F.mis[F.mi] && F.mis[F.mi].timer) F.pt = Math.max(0, F.pt - dt / 4.5); // состояние пострадавших тает: спешите, но без риска
    const b = P.b; b.X = Hc.X; b.Y = Hc.Y; b.th = Hc.th; b.speed = Hc.speed; b.base = Hc.Z; b.y = Hc.Z; }
  function startCrash() { boom.t = 0; boom.m.visible = true; boom.m.position.set(Hc.X, Hc.Z + 2, -Hc.Y); M.root.visible = false; audio.thump && audio.thump(1.6); G.shake = 1.4;
    toast(Hc.crash.water ? 'Вертолёт в воде. Экипаж спасён' : Hc.crash.slope > 0.28 ? 'Склон слишком крутой — вертолёт опрокинуло' : 'Удар о землю. Экипаж жив — машина нет'); }
  function crashTick(dt) { F.crashT += dt; boom.t += dt; const k = Math.min(1, boom.t / 0.7); boom.m.scale.setScalar(4 + 16 * k); boom.m.material.opacity = 0.85 * (1 - k); if (k >= 1) boom.m.visible = false; if (F.crashT > 3 && !F.ended) finish('crash'); }
  function finish(kind) { if (F.ended) return; F.ended = true; let h = '', s = '';
    if (kind === 'rescue') { // звёзды: время против норматива, мягкость посадок, состояние пострадавших
      const par = F.par || 600, st = 1 + (F.t < par ? 1 : 0) + ((F.hard || 0) === 0 && (F.pt === undefined || F.pt > 40) ? 1 : 0), best = store.get('heliBest') || 0; if (st > best) store.set('heliBest', st);
      h = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} Спасательная операция`; s = `Время ${fmt(F.t)} (норматив ${fmt(par)}) · жёстких посадок ${F.hard || 0}${F.pt !== undefined ? ` · состояние пострадавших ${Math.round(F.pt)}%` : ''} · топливо ${Math.round(Hc.fuel)} кг`; }
    else { h = 'Авария'; s = 'Горы не прощают ошибок шага. Ещё раз?'; }
    $('rh').textContent = h; $('rs').textContent = s; $('rt').innerHTML = ''; $('ragain').textContent = 'Ещё вылет'; setTimeout(() => { if (on) $('result').hidden = false; }, 1200); }

  // ---- камера: за вертолётом, чуть сверху; на висении -- ближе, на скорости -- дальше ----
  let camInit = false;
  function cam(dt) { if (camera.view && camera.view.enabled) camera.clearViewOffset();
    M.root.position.set(Hc.X, Hc.Z, -Hc.Y); M.root.rotation.set(0, 0, 0); M.root.rotateY(-Hc.th); M.root.rotateX(-Hc.pitch); M.root.rotateZ(-Hc.roll);
    F.rpm += ((Hc.crash ? 0 : Hc.ground && Hc.col < 0.05 && F.t < 2 ? 0.4 : Hc.rpm) - F.rpm) * Math.min(1, dt * 0.8); M.spin(dt, F.rpm);
    if (Hc.crash) { v3.set(Hc.X + 40, Hc.Z + 25, -Hc.Y + 40); camera.position.lerp(v3, Math.min(1, dt * 2)); camera.up.set(0, 1, 0); camera.lookAt(Hc.X, Hc.Z + 3, -Hc.Y); camera.updateProjectionMatrix(); return; }
    const fx = Math.sin(Hc.th), fy = Math.cos(Hc.th), want = new THREE.Vector3(fx, 0, -fy);
    if (!camInit) { clook.copy(want); camInit = true; } else clook.lerp(want, Math.min(1, dt * 1.6)).normalize();
    F.camD += ((26 + Hc.speed * 0.25) * G.zoom - F.camD) * Math.min(1, dt * 1.5); const d = F.camD, back = clook.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), G.orbit).negate();
    v3.set(Hc.X, Hc.Z + 3, -Hc.Y).addScaledVector(back, d); v3.y += d * (0.32 + G.orbitP);
    const gy = Math.max(0, H(v3.x, -v3.z)) + 3; if (v3.y < gy) v3.y = gy;
    const sh = Hc.shake * 0.25 + Math.max(0, G.shake - 0) * 0.5, jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh; G.shake = Math.max(0, G.shake - dt * 1.4);
    // камера на пружине: тяжёлая машина «уезжает» при разгоне и наклоняет горизонт в вираже -- масса чувствуется
    if (!F.cam) F.cam = v3.clone(); else { const k = Math.min(1, dt * 3.2); F.cam.lerp(v3, k); } if (F.cam.distanceTo(v3) > d * 1.5) F.cam.copy(v3);
    camera.position.copy(F.cam); camera.position.x += jx; camera.position.y += jy; camera.up.set(-Math.sin(Hc.roll) * 0.22 * Math.cos(Hc.th), 1, -Math.sin(Hc.roll) * 0.22 * Math.sin(Hc.th)).normalize(); camera.lookAt(cpos.set(Hc.X, Hc.Z + 3, -Hc.Y).addScaledVector(clook, 12));
    camera.fov += (58 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  function resetCam() { camInit = false; camera.up.set(0, 1, 0); }

  // ---- приборы: скорость, высоты, вертикальная, масса и запас тяги, обороты, топливо ----
  let hudT = 0;
  function hud(dt) { if (!on) return; if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
    pointMark(); hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const kmh = Math.round(Hc.speed * 3.6), alt = Math.round(Hc.Z + 1607), agl = Math.round(Math.max(0, Hc.agl)), m = Hc.mass, tw = Hc.Tmax / (m * 9.81), pw = Math.min(1.15, Hc.power);
    const cls = pw > 1 ? 'red' : pw > 0.92 ? 'hot' : '';
    $('hhud').innerHTML = `<div><b class="v">${kmh}</b><small>км/ч</small></div><div class="r"><b>${alt}</b> м над морем · ${agl} м над землёй · ${Hc.vz >= 0 ? '↑' : '↓'}${Math.abs(Hc.vz).toFixed(1)} м/с</div>
      <div class="r">шаг<span class="bar"><i class="${cls}" style="width:${Math.round(Math.min(1, pw) * 100)}%"></i></span>${Math.round(pw * 100)}% · обороты ${Math.round(Hc.rpm * 95)}%</div>
      <div class="r">масса <b>${(m / 1000).toFixed(1)}</b> т · тяга/вес <b>${tw.toFixed(2)}</b>${Hc.ige > 0.03 ? ' · подушка' : ''} · топливо ${Math.round(Hc.fuel)} кг</div>`;
    const w = Hc.crash ? '' : (F.wU || 0) > 30 && G.frame % 120 < 60 ? `ВЕТЕР ${Math.round(F.wU)} М/С` : Hc.gpws ? 'ЗЕМЛЯ! ВВЕРХ ▲' : Hc.warn === 'rpm' ? 'ОБОРОТЫ! СБРОСЬ ШАГ' : Hc.warn === 'vrs' ? 'ВИХРЕВОЕ КОЛЬЦО — СКОРОСТЬ ВПЕРЁД' : Hc.warn === 'power' ? 'МОЩНОСТИ НЕ ХВАТАЕТ' : '';
    const wl = $('hwarn'); if (wl.textContent !== w) wl.textContent = w; wl.hidden = !w; if (w && audio.beep && G.frame % 18 === 0) audio.beep(true);
    const mi = F.mis[F.mi], me = $('hmis'); guide(mi); if (mi) { me.hidden = false; const t = `<b>${mi.t}</b>${mi.timer && F.pt !== undefined ? ` · <span style="color:${F.pt > 50 ? '#9fe0a0' : F.pt > 25 ? '#ffd27a' : '#ff5a3a'}">состояние ${Math.round(F.pt)}%</span>` : ''}<br>${mi.d}${F.hold > 0.2 ? ` · ${mi.how === 'winch' ? 'лебёдка' : mi.how === 'watch' ? 'съёмка' : 'выгрузка'} ${Math.min(100, Math.round(F.hold / (mi.how === 'winch' ? 5 : mi.how === 'watch' ? 15 : 2) * 100))}%` : ''}`; if (me.innerHTML !== t) me.innerHTML = t; } else me.hidden = true;
    const hint = F.coach === undefined && F.t < 30 && Hc.ground && !F.mi ? (TOUCH ? '▲ — шаг вверх · джойстик — куда лететь · отпустил — висит' : 'Пробел — вверх, Shift — вниз · стрелки — куда лететь · отпустил — висит') : '';
    const he = $('hint'); if (he.textContent !== hint) he.textContent = hint; he.hidden = !hint; he.className = 'hud'; }
  // стрелка к цели (относительно взгляда камеры) и посадочные подсказки у цели
  function guide(mi) { const ar = $('harr'), ld = $('hland'); if (!mi || Hc.crash) { ar.hidden = true; ld.hidden = true; return; }
    const dx = mi.to.X - Hc.X, dy = mi.to.Y - Hc.Y, d = Math.hypot(dx, dy), camYaw = Math.atan2(clook.x, -clook.z) + G.orbit, rel = wrapPi(Math.atan2(dx, dy) - camYaw);
    ar.hidden = d < 120; if (!ar.hidden) { ar.firstChild.style.transform = `rotate(${rel}rad)`; ar.lastChild.textContent = d >= 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'; }
    let t = '', c = 'go'; const agl = Hc.agl;
    const brakeD = Hc.speed * Hc.speed / 3.2 + 80; // тормозной путь тяжёлой машины
    if (d < Math.max(220, brakeD) && mi.how !== 'watch') { if (Hc.speed > 7 && d < brakeD) t = 'ТОРМОЗИ — ОТПУСТИ РУЧКУ';
      else if (mi.how === 'land') { if (Hc.ground) { t = d < 45 ? 'ПОСАДКА ✓' : 'ДАЛЕКО ОТ КРУГА'; c = d < 45 ? 'ok' : 'bad'; } else if (Hc.vz < -3 && agl < 18) { t = 'МЯГЧЕ! ▲'; c = 'bad'; } else if (agl > 10) t = `СНИЖАЙСЯ ▼ · ${Math.round(agl)} м`; else { t = 'РОВНО — САДИСЬ'; c = 'ok'; } }
      else if (mi.how === 'winch') { if (agl > 16) t = `НИЖЕ ▼ до 15 м · сейчас ${Math.round(agl)}`; else if (d > 25) t = 'ПОДВИНЬСЯ К ЛЮДЯМ'; else { t = 'ВИСИ РОВНО — ЛЕБЁДКА'; c = 'ok'; } } }
    else if (mi.how === 'watch' && d < 900) { t = Hc.speed > 8 ? 'ЗАВИСНИ — ИДЁТ СЪЁМКА' : 'СНИМАЕМ… ДЕРЖИ МЕСТО'; c = Hc.speed > 8 ? 'go' : 'ok'; }
    ld.hidden = !t; if (ld.textContent !== t) ld.textContent = t; ld.className = 'hud ' + c; }
  function pointMark() { const mk = $('mark'), mi = F && F.mis[F.mi]; if (!mi || Hc.crash) { mk.hidden = true; return; } const tg = [mi.to.X, mi.to.Y, mi.to.z + 6], w = window.innerWidth, hh = window.innerHeight;
    v3.set(tg[0], tg[2], -tg[1]).project(camera); const behind = v3.z > 1; let mx = (v3.x * 0.5 + 0.5) * w, my = (1 - (v3.y * 0.5 + 0.5)) * hh; if (behind) { mx = w - mx; my = hh * 0.5; mx = mx < w / 2 ? 0 : w; }
    const cx = clamp(mx, 74, w - 74), cy = clamp(my, 150, hh - 150), off = behind || cx !== mx || cy !== my; mk.hidden = false; mk.className = 'hud' + (off ? ' off' : ''); mk.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-100%)`;
    if (G.frame % 6 === 0) { const d = Math.hypot(tg[0] - Hc.X, tg[1] - Hc.Y), lab = mi.to.name || 'цель', t = `${off && cx < w / 2 ? '◀ ' : ''}${lab} · ${d >= 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'}${off && cx > w / 2 ? ' ▶' : ''}`; if ($('markd').textContent !== t) $('markd').textContent = t; } }
  // звук: турбины по шагу, свист винта -- по оборотам, поток -- по скорости
  function sound() { if (!on) return; audio.jet && audio.jet(Hc.crash ? 0 : 0.45 + 0.4 * Math.min(1, Hc.power), 40 + Hc.speed * 0.6 * F.rpm, !Hc.crash); audio.airflow(Math.min(60, 12 + Hc.speed * 0.4), Math.min(1, Hc.shake), 0, !Hc.crash); }

  return { get on() { return on; }, get heli() { return Hc; }, get F() { return F; }, startFree, stop, tick, camera: cam, hud, sound, resetCam,
    restart() { startFree(); }, again() { $('result').hidden = true; startFree(); } };
}
