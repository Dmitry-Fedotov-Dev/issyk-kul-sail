// Режим «Ми-8 МЧС»: спасатели высокогорья. Район Хан-Тенгри -- база на леднике Южный Иныльчек; у Иссык-Куля --
// площадка старого аэродрома Чолпон-Аты.
// Управление -- аркадное, как в San Andreas, только проще (heli.js): ручка наклоняет машину (вперёд -- разгон, на себя --
// тормоз, вбок -- вираж), Пробел/▲ -- вверх, Shift/▼ -- вниз; отпустил -- висит, но катится по инерции.
// Ветер -- слоями по высоте (западный перенос, ледниковый сток), порывы видно по снежным струям и позёмке.
// Спасработы: сесть в круг «Н» -- или лебёдка: трос-маятник, крюк навести на человека, поднять ровно, не ударив о склон.
import * as THREE from 'three';
import { Heli, MI8, hoverCeiling } from './heli.js';
import { makeHeli } from './helimodel.js';
import { NPCART } from './npcart.js';
import { KCAMPS } from './khanosm.js';
import { clamp, wrapPi } from './sim.js';
import { makeSar } from './sarmode.js';
import { makeHeliAir } from './heliair.js';
import { INK_U } from './ridges.js';

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const AIRPORT = { X: -4385, Y: 1809 };
const CSS = `
body.heli #speed>b,body.heli #speed>small,body.heli #pos,body.heli #wear,body.heli #dialwrap,body.heli #race,body.heli #bpro,body.heli #bfoot{display:none!important}body.heli #tools{position:fixed;right:max(16px,env(safe-area-inset-right,0px));top:12px}
#hhud{left:max(10px,env(safe-area-inset-left,0px));top:10px;line-height:1.15;background:rgba(8,22,48,.55);border-radius:12px;padding:6px 10px}#hhud b.v{font-size:44px;font-weight:300;letter-spacing:-1px}#hhud small{font-size:13px;color:var(--dim);margin-left:4px}
#hhud .r{font-size:14px;margin-top:3px}#hhud .r b{font-weight:600}#hhud .bar{display:inline-block;width:86px;height:7px;border-radius:4px;background:rgba(255,255,255,.18);vertical-align:middle;margin:0 6px;overflow:hidden}#hhud .bar i{display:block;height:100%;background:#9fe0a0}#hhud .bar i.hot{background:#ff8a2a}#hhud .bar i.red{background:#ff4a3a}
#hwarn{left:50%;top:28%;transform:translateX(-50%);font:800 clamp(20px,4.6vmin,34px) var(--ui);color:#ff5a3a;text-shadow:0 2px 12px rgba(0,0,0,.7);letter-spacing:.06em;animation:jblink .5s steps(2) infinite}
body.spy #hwrap,body.spy #sarw,body.spy #mark,body.spy #hint,body.spy #hvec{display:none!important}
#hflash{position:fixed;inset:0;pointer-events:none;opacity:0;z-index:3}#hflash.hit{box-shadow:inset 0 0 140px 40px rgba(255,40,20,.75)}#hflash.fast{box-shadow:inset 0 0 120px 20px rgba(220,240,255,.7)}
#hvec{position:fixed;width:110px;height:110px;pointer-events:none;z-index:4}#hdbg{left:auto;right:12px;top:120px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.6);padding:6px 8px;border-radius:8px;white-space:pre;color:#cfe}
#hmis{left:50%;top:10px;transform:translateX(-50%);text-align:center;font-size:14px;max-width:min(560px,60vw);background:rgba(8,22,48,.55);border-radius:12px;padding:6px 12px}#hmis b{font-size:17px}
#hcol{position:fixed;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));display:none;flex-direction:column;gap:14px;z-index:2}
#hcol button{width:76px;height:76px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(10,30,60,.45);color:#fff;font:800 26px var(--ui);touch-action:none;-webkit-user-select:none;user-select:none}
#hcol button.on{background:rgba(255,138,42,.75)}body.touchdev.heli #hcol{display:flex}
body.touchdev.heli #joy{display:block;left:calc(26px + env(safe-area-inset-left,0px));transform:none;width:168px;height:168px;bottom:calc(26px + env(safe-area-inset-bottom,0px))}body.touchdev.heli #joy i{width:64px;height:64px;margin:-32px 0 0 -32px}body.touchdev.heli #ts{display:none!important}
body.touchdev.heli #hint{bottom:calc(206px + env(safe-area-inset-bottom,0px))}
#hcoach{left:50%;bottom:calc(210px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(520px,86vw);background:rgba(8,24,52,.72);border:2px solid #ff8a2a;border-radius:16px;padding:12px 16px;font-size:17px;line-height:1.3;text-align:center;pointer-events:none}
#hcoach small{display:block;color:#ffb07a;font-size:12px;letter-spacing:.12em;margin-bottom:4px}body:not(.touchdev) #hcoach{bottom:40px}
#harr{left:50%;top:96px;transform:translateX(-50%);text-align:center;font-size:14px}#harr i{display:inline-block;font-style:normal;font-size:58px;line-height:58px;color:#ff8a2a;-webkit-text-stroke:2px #3a1a00;text-shadow:0 2px 10px rgba(0,0,0,.6)}#harr div{font-weight:700;background:rgba(8,22,48,.55);border-radius:8px;padding:1px 8px;display:inline-block}
#hpop{left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;font:900 clamp(26px,6vmin,46px) var(--ui);color:#ffd24a;-webkit-text-stroke:2px #3a1a00;text-shadow:0 4px 18px rgba(0,0,0,.55);transition:none}
#hpop small{display:block;font-size:.42em;color:#fff;-webkit-text-stroke:0}#hpop.go{animation:hpop .9s cubic-bezier(.2,1.6,.4,1) both}@keyframes hpop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}25%{transform:translate(-50%,-50%) scale(1.15);opacity:1}70%{transform:translate(-50%,-60%) scale(1);opacity:1}100%{transform:translate(-50%,-90%) scale(.95);opacity:0}}
#hscore{right:calc(max(16px,env(safe-area-inset-right,0px)) + 0px);top:62px;text-align:right;background:rgba(8,22,48,.55);border-radius:12px;padding:4px 10px}#hscore b{font-size:24px}#hscore i{font-style:normal;color:#ffd24a;font-weight:800;margin-left:6px}
#hcr{left:max(10px,env(safe-area-inset-left,0px));top:118px;width:150px;font-size:12px;background:rgba(8,22,48,.55);border-radius:10px;padding:4px 8px}#hcr .bar{width:100%;margin:3px 0 0}
#hland{left:50%;top:40%;transform:translateX(-50%);background:rgba(8,22,48,.5);border-radius:10px;padding:4px 12px;font:800 clamp(18px,4vmin,28px) var(--ui);letter-spacing:.05em;text-shadow:0 2px 10px rgba(0,0,0,.7)}#hland.ok{color:#9fe0a0}#hland.go{color:#ffd27a}#hland.bad{color:#ff5a3a}
@media (max-width:640px),(max-height:440px){#hhud{max-width:calc(100vw - 196px);padding:4px 8px}#hhud b.v{font-size:30px}#hhud small{font-size:11px}#hhud .r{font-size:12px;margin-top:1px}#hhud .r2,#hhud .r4,#hhud .lg{display:none}
#hscore{top:58px;padding:2px 8px}#hscore b{font-size:19px}}
@media (max-width:640px){#hmis{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}#hwarn{top:64%;font-size:17px;white-space:nowrap}#hmis{top:104px;width:calc(100vw - 24px);max-width:none;font-size:13px;padding:4px 10px}#hmis b{font-size:15px}#harr{top:178px}#harr i{font-size:44px;line-height:44px}
#hcr{top:auto;bottom:calc(300px + env(safe-area-inset-bottom,0px));width:130px}#hpop{top:36%}#hland{top:46%}}
@media (max-height:440px) and (min-width:641px){#hwarn{top:40%;font-size:18px}#hmis{top:8px;max-width:min(420px,44vw);font-size:12px;padding:3px 10px}#hmis b{font-size:14px}#harr{top:60px;font-size:12px}#harr i{font-size:34px;line-height:34px}
#hcr{top:auto;bottom:calc(200px + env(safe-area-inset-bottom,0px))}#hcoach{bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(420px,50vw);font-size:14px;padding:8px 12px}}
`;

export function makeHeliMode(A) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input, ach, showGame, resetView, fmt } = A; let SAR = null, lastMode = '';
  let AIRFX = null, on = false, built = false, Hc = null, M = null, P = null, prev = null, F = null, boom = null, marks = null, people = null, beacon = null, reticle = null;
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
  // прицел посадки: тень-кольцо на земле под вертолётом -- видно, куда сядешь; над центром «Н» зеленеет
  function makeReticle() { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 54, 0, 7); x.stroke(); x.lineWidth = 4;
    for (let a = 0; a < 4; a++) { const q = a * Math.PI / 2; x.beginPath(); x.moveTo(64 + Math.cos(q) * 40, 64 + Math.sin(q) * 40); x.lineTo(64 + Math.cos(q) * 62, 64 + Math.sin(q) * 62); x.stroke(); } x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(64, 64, 30, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c), m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, color: 0xffffff })); m.rotation.x = -Math.PI / 2; scene.add(m); m.visible = false; return m; }
  function makeBoom() { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 0 }; }

  function build() { if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'hwrap'; w.hidden = true; w.innerHTML = '<div id="hhud" class="hud"></div><div id="hwarn" class="hud" hidden></div><div id="hmis" class="hud" hidden></div><div id="harr" class="hud" hidden><i>⬆</i><div></div></div><div id="hland" class="hud" hidden></div><div id="hcoach" class="hud" hidden></div><div id="hpop" class="hud" hidden></div><div id="hscore" class="hud"></div><div id="hcr" class="hud" hidden></div><div id="hflash"></div><canvas id="hvec" width="180" height="180"></canvas><pre id="hdbg" class="hud" hidden></pre><div id="hcol"><button id="hup">▲</button><button id="hdn">▼</button></div>'; $('game').appendChild(w);
    for (const [id, k] of [['hup', 'hu'], ['hdn', 'hd']]) { const b = $(id); const set = (v) => (e) => { e.preventDefault(); e.stopPropagation(); input[k] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false)); }
    SAR = makeSar({ G, scene, camera, $, store, toast, audio, TOUCH, input, H, net: A.net, personSprite, flagPole, pop: (t, sub) => pop(t, sub), score: (p, t, sub) => score(p, t, sub), buzz: (ms) => buzz(ms),
      heli: () => Hc, base: () => F.base, windAt: (X, Y, Z) => wind(X, Y, Z),
      addMission(m) { const to = m.base ? F.base : site(m.X, m.Y, 'slope', { people: 1, name: m.d.split(':')[0], seed: 1 }); F.mis.push({ ...m, to }); if (F.mi === F.mis.length - 1) announce(); },
      setGoal(g) { F.goal = g ? { ...g, to: { X: g.X, Y: g.Y, z: H(g.X, g.Y), name: g.name || g.t } } : null; }, busy: () => F.mi < F.mis.length, resetCam: () => { camInit = false; F.cam = null; }, mission: () => F.mis[F.mi] || null, goal: () => F.goal && { X: F.goal.to.X, Y: F.goal.to.Y },
      hasMission: (k) => F.mis.slice(F.mi).some((m) => (k === 'base' ? m.base : false)) });
    Hc = new Heli(); M = makeHeli(); scene.add(M.root); M.root.visible = false; boom = makeBoom();
    marks = new THREE.Group(); scene.add(marks); people = []; beacon = makeBeacon(); reticle = makeReticle(); AIRFX = makeHeliAir({ scene, H }); window.addEventListener('keydown', (e) => { if (on && F && e.code === 'Backquote') F.dbg = !F.dbg; });
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
    if (mode === 'sar') return []; // поиск: задания появляются по ходу операции (эвакуация найденных)
    // лагерь 1 -- выше по леднику Южный Иныльчек, на 4000-4300 м, с чистым пролётом от базы; седловина -- у Хан-Тенгри,
    // 5000-5400 м, подлёт от лагеря без стены выше потолка груженого вертолёта
    // настоящие лагеря южного маршрута на Хан-Тенгри (OpenStreetMap): лагерь 1 -- 4200 м на леднике Семёнова-Звёздочка,
    // лагерь 2 -- 5200 м под стеной; без данных -- места по рельефу
    // вылеты по кругу: Хан-Тенгри -> пик Победы -> север и Мерцбахер; каждый следующий -- другой настоящий маршрут
    const nS = store.get('heliSorties') || 0, route = nS % 3, pk = route === 1 ? z.poi.pobeda : k;
    const camp = (ele, near = pk) => { let best = null; for (const [n, X, Y, e] of KCAMPS) { if (Math.abs(e - ele) > 60) continue; const d = Math.hypot(X - near.X, Y - near.Y); if (d < 12000 && (!best || d < best.d)) best = { X, Y, d, n }; } return best; };
    if (route === 2) { const nb = KCAMPS.find((c) => /Базовый лагерь Хан/.test(c[0])), pm = KCAMPS.find((c) => /Мерцбахер/.test(c[0]));
      const s1 = nb ? site(nb[1], nb[2], 'camp', { name: 'базовый лагерь «Северный Иныльчек»', people: 1, seed: 2 }) : null, s2 = pm ? site(pm[1], pm[2], 'slope', { name: 'поляна Мерцбахера', people: 2, seed: 4 }) : null;
      if (s1 && s2) { pts.push({ t: 'Заброска', d: 'Спасатели и снаряжение — в северный базовый лагерь, через перевал', to: s1, load: 600, how: 'land', done: 'Спасатели на месте. Перевал пройден' });
        pts.push({ t: 'Эвакуация', d: 'Туристки на поляне Мерцбахера: озеро вот-вот прорвёт — забрать!', timer: true, to: s2, add: 2 * 60, how: 'winch', done: 'Успели до прорыва!' });
        pts.push({ t: 'На базу', d: 'В базовый лагерь Южный Иныльчек', to: b, how: 'land', done: 'Вылет завершён' }); store.set('heliSorties', nS + 1); return pts; } }
    store.set('heliSorties', nS + 1);
    const e1 = route === 1 ? 4600 : 4200, c1p = camp(e1) || onIce(bc, 4500, 8000, 4000, 4350, k), c1 = site(c1p.X, c1p.Y, 'camp', { name: `лагерь 1 · ${e1} м`, people: 1, seed: 1 });
    const c2p = camp(5200) || reach(c1p, k, 6000, 5000, 5400), c2 = site(c2p.X, c2p.Y, 'slope', { name: 'лагерь 2 · 5200 м', people: 2, seed: 0 });
    if (mode === 'merz' && G.merz) { const o = G.merz.out, ob = site(o.X, o.Y, 'none', { name: 'прорыв Мерцбахера' }); ob.z = G.merz.top;
      pts.push({ t: 'Гидрологи', d: 'Озеро Мерцбахера прорывается! Зависните у плотины — снимаем сброс воды', to: ob, how: 'watch', done: 'Снято! Данные ушли в Бишкек и Аксу' });
      pts.push({ t: 'На базу', d: 'В базовый лагерь Южный Иныльчек', to: b, how: 'land', done: 'Вылет завершён' }); return pts; }
    pts.push({ t: 'Доставка', d: `Медикаменты в лагерь 1 маршрута на ${route === 1 ? 'пик Победы' : 'Хан-Тенгри'} (${e1} м)`, to: c1, load: 350, how: 'land', done: 'Аптечка в лагере. Врач на связи' });
    pts.push({ t: 'Эвакуация', d: 'Две туристки замерзают в лагере 2 на 5200 м — сесть нельзя, лебёдкой на борт', timer: true, to: c2, add: 2 * 60, how: 'winch', done: 'Обе на борту! Тяжелее на 120 кг — на высоте это чувствуется' });
    pts.push({ t: 'На базу', d: 'В базовый лагерь Южный Иныльчек — врачи ждут', to: b, how: 'land', done: 'Спасены. Экипаж МЧС — благодарность' });
    return pts; }
  function missionTick(dt) { const m = F.mis[F.mi]; M.setWinch(0); if (!m) { winchDraw(null); return; } const dx = Hc.X - m.to.X, dy = Hc.Y - m.to.Y, d = Math.hypot(dx, dy);
    if (m.how === 'winch') { winchTick(dt, m, d); return; } winchDraw(null);
    let ok = false; if (m.how === 'land') ok = Hc.ground && d < 45; else if (m.how === 'watch') ok = !Hc.ground && d < 900 && Hc.speed < 8;
    F.hold = ok ? F.hold + dt : Math.max(0, F.hold - dt * 2);
    if (F.hold >= (m.how === 'land' ? 2 : 15)) complete(m); }
  function complete(m) { F.hold = 0; F.w = null; if (m.load > 0) Hc.load = Math.max(0, Hc.load - m.load); if (m.add && m.how !== 'winch') Hc.load += m.add;
    { const tb = Math.max(0, Math.round(200 - (F.t - (F.legT || 0)) * 0.8)); F.legT = F.t; setTimeout(() => { if (on && tb > 0) score(tb, 'СКОРОСТЬ', 'бонус за время'); }, 1300); }
    toast(m.done); F.banner = { t: 2.6, txt: m.how === 'winch' ? 'ВСЕ НА БОРТУ ✓' : m.how === 'watch' ? 'СНЯТО ✓' : F.mi === F.mis.length - 1 ? 'ДОМА ✓' : 'ДОСТАВЛЕНО ✓' }; audio.chime && audio.chime(); G.shake = Math.max(G.shake, 0.25); F.mi++;
    if (F.mis[F.mi] && F.mis[F.mi].timer) F.pt = 100;
    if (F.sar) SAR.missionDone(m); else if (F.mi >= F.mis.length) { finish('rescue'); } else announce(); }
  // ---- лебёдка: трос -- маятник. Порыв и резкие движения вертолёта раскачивают человека; крюк надо навести на него,
  // поднимать ровно (ровно -- быстрее), не бить о склон. Каждый человек -- отдельный подъём ----
  const wA = new THREE.Vector3(), wUp = new THREE.Vector3(0, 1, 0);
  let rope = null;
  function winchDraw(W, A) { if (!rope) { const mat = new THREE.MeshBasicMaterial({ color: 0x1c1c22 }); rope = { r: new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), mat), h: new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a })) }; rope.r.geometry.translate(0, 0.5, 0); scene.add(rope.r, rope.h); }
    const show = !!(W && W.L > 0.4 && A); rope.r.visible = rope.h.visible = show; if (!show) return;
    const bx = W.p[0], by = W.p[2], bz = -W.p[1]; rope.h.position.set(bx, by, bz); rope.r.position.set(bx, by, bz); v3.set(A.x - bx, A.y - by, A.z - bz); const L = v3.length(); rope.r.scale.set(1, Math.max(0.01, L), 1); rope.r.quaternion.setFromUnitVectors(wUp, v3.normalize()); }
  function winchTick(dt, m, d) { const W = F.w || (F.w = { L: 0, ph: 'idle', p: [0, 0, 0], v: [0, 0, 0], sw: 0, maxSw: 0, hitT: 0, init: false });
    M.root.updateMatrixWorld(true); M.winch.getWorldPosition(wA); const AX = wA.x, AY = -wA.z, AZ = wA.y;
    const g = m.to.g.position, left = m.to.folks.filter((f) => !f.userData.up), wpos = (f) => [g.x + f.position.x, -(g.z + f.position.z), g.y + f.position.y];
    const T = W.who || left[0], tp = T ? wpos(T) : null, inRange = !Hc.ground && d < 70 && Hc.agl < 50;
    if (W.ph === 'idle' && inRange && left.length) W.ph = 'lower';
    if (W.ph === 'lower') { if (!inRange) W.ph = 'idle'; W.L = Math.min(W.L + dt * 6, Math.max(2, Hc.agl + 3), 52); }
    if (W.ph === 'idle') W.L = Math.max(0, W.L - dt * 8);
    if (W.L <= 0.4) { W.init = false; winchDraw(null); return; }
    if (!W.init) { W.p = [AX, AY, AZ - W.L]; W.v = [Hc.vx, Hc.vy, 0]; W.init = true; }
    // маятник: тяжесть, ветер (человек парусит сильнее пустого крюка), трос не растягивается
    const b = WB, n = 4, h = dt / n, kd = W.who ? 0.2 : 0.07; let gzB = 0;
    for (let k = 0; k < n; k++) { gustAt(W.p[0], W.p[1], W.p[2], gq); const wx = b.x + gq.x, wy = b.y + gq.y;
      W.v[0] += kd * (wx - W.v[0]) * h; W.v[1] += kd * (wy - W.v[1]) * h; W.v[2] += (-9.81 - kd * W.v[2]) * h; for (let j = 0; j < 3; j++) W.p[j] += W.v[j] * h;
      const rx = W.p[0] - AX, ry = W.p[1] - AY, rz = W.p[2] - AZ, r = Math.hypot(rx, ry, rz);
      if (r > W.L) { const ux = rx / r, uy = ry / r, uz = rz / r, vr = W.v[0] * ux + W.v[1] * uy + W.v[2] * uz; W.p[0] = AX + ux * W.L; W.p[1] = AY + uy * W.L; W.p[2] = AZ + uz * W.L; if (vr > 0) { W.v[0] -= vr * ux; W.v[1] -= vr * uy; W.v[2] -= vr * uz; } }
      gzB = H(W.p[0], W.p[1]) + 0.3; if (W.p[2] < gzB) { const vh = Math.hypot(W.v[0], W.v[1], W.v[2]);
        if (W.ph === 'raise' && vh > 4 && W.hitT <= 0 && W.L > 5) { W.hitT = 1.2; F.pt = Math.max(0, (F.pt ?? 100) - 8); F.combo = 1; pop('УДАР О СКЛОН!', 'держи ровнее · −8% состояния'); buzz([60, 40, 60]); G.shake = Math.max(G.shake, 0.35); }
        W.p[2] = gzB; if (W.v[2] < 0) W.v[2] = 0; W.v[0] *= 0.85; W.v[1] *= 0.85; } }
    W.hitT -= dt; { const rx = W.p[0] - AX, ry = W.p[1] - AY; W.sw = Math.atan2(Math.hypot(rx, ry), Math.max(0.1, AZ - W.p[2])); }
    if (W.ph === 'lower' && tp && Math.hypot(W.p[0] - tp[0], W.p[1] - tp[1]) < 6.5 && W.p[2] - tp[2] < 3) { W.ph = 'raise'; W.who = T; W.maxSw = 0; W.first = W.first ?? true; score(W.first ? 120 : 60, 'ЗАЦЕП!', W.first ? 'с первого захода' : ''); buzz([30, 30, 30]); audio.thump && audio.thump(0.2); }
    if (W.ph === 'raise') { W.maxSw = Math.max(W.maxSw, W.sw); const steady = W.sw < 0.17; W.L = Math.max(0, W.L - dt * (steady ? 2.8 : 1.3));
      W.who.position.set(W.p[0] - g.x, W.p[2] - 1.75 - g.y, -W.p[1] - g.z);
      if (W.L <= 2.2) { const who = W.who; who.userData.up = true; who.visible = false; Hc.load += (m.add || 0) / m.to.folks.length; const rest = left.length - 1; W.who = null; W.ph = rest ? 'lower' : 'idle'; W.first = false;
        if (W.maxSw < 0.26) score(250, 'ЧИСТЫЙ ПОДЪЁМ', rest ? `ещё ${rest} внизу` : 'без раскачки'); else score(100, 'НА БОРТУ', rest ? `ещё ${rest} внизу` : '');
        if (!rest) { W.L = 0; winchDraw(null); complete(m); return; } } }
    wA.set(AX, AZ, -AY); winchDraw(W, wA); }
  function announce() { const m = F.mis[F.mi]; if (!m) return; audio.chime && audio.chime(); } // текст задания -- в верхней строке (#hmis)

  // ---- очки экипажа: точность, мягкость, бреющий; комбо растёт с чистыми действиями, сгорает на жёсткой посадке ----
  function score(pts, txt, sub = '') { const k = F.combo; F.score += Math.round(pts * k); F.combo = Math.min(4, +(F.combo + 0.25).toFixed(2)); pop(`+${Math.round(pts * k)} ${txt}`, sub || (k > 1 ? `комбо ×${k.toFixed(2).replace(/\.?0+$/, '')}` : ''));
    audio.chime && audio.chime(); buzz(25); }
  // вспышка по краям экрана: удар -- красная, бреющий -- светлая полоса скорости
  function flash(kind, k = 1) { const el = $('hflash'); if (!el) return; el.className = kind; el.style.opacity = String(k); el.style.transition = 'none'; void el.offsetWidth; el.style.transition = 'opacity .6s ease-out'; el.style.opacity = '0'; }
  function pop(txt, sub = '') { const el = $('hpop'); el.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`; el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); clearTimeout(pop.t); pop.t = setTimeout(() => { el.hidden = true; }, 950); }
  const buzz = (ms) => { try { if (TOUCH && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* нет вибрации -- не страшно */ } };
  function landingScore(t, mi) { if (!mi || mi.how !== 'land') return; const d = Math.hypot(Hc.X - mi.to.X, Hc.Y - mi.to.Y); if (d > 45) return;
    if (d < 5) score(300, 'В ЯБЛОЧКО!', `${d.toFixed(1)} м от центра`); else if (d < 15) score(150, 'ТОЧНО', `${Math.round(d)} м от центра`); else score(50, 'В КРУГЕ');
    if (t.vz < 0.8) setTimeout(() => { if (on) score(120, 'ПЁРЫШКО', `${t.vz.toFixed(1)} м/с`); }, 700); else if (t.vz < 1.6) setTimeout(() => { if (on) score(50, 'МЯГКО'); }, 700); }
  function skillTick() {} // бреющий -- серией в tick (у земли и у стены)
  // ---- инструктаж (первые вылеты): шаг -- текст и условие, засчитывается по факту ----
  const COACH = [
    { t: () => TOUCH ? 'Зажмите <b>▲</b> справа — шаг вверх: вертолёт оторвётся от льда' : 'Зажмите <b>Пробел</b> — шаг вверх: вертолёт оторвётся от льда', ok: () => !Hc.ground && Hc.agl > 12 },
    { t: () => 'Отпустите — автомат <b>держит высоту</b> и висит на месте', ok: () => !(input.bar || input.hu) && Math.abs(Hc.vz) < 1 && Hc.agl > 8, hold: 1.5 },
    { t: () => `${TOUCH ? 'Джойстик вперёд' : 'Стрелка ↑'} — <b>наклон носа</b>: машина поехала. Цель — оранжевый столб дыма`, ok: () => Hc.speed > 18 },
    { t: () => `${TOUCH ? 'Джойстик' : 'Стрелки'} в сторону — <b>вираж</b>: машина ложится в поворот`, ok: () => Math.abs(wrapPi(Hc.th - (F.c0 ?? Hc.th))) > 0.5 },
    { t: () => `${TOUCH ? 'Джойстик на себя' : 'Стрелка ↓'} — <b>тормоз</b>: нос вверх, машину тянет назад. Отпустите — покатится по инерции`, ok: () => (F.cv = Math.max(F.cv || 0, Hc.speed)) > 15 && Hc.speed < 5 },
    { t: () => `Видите <b>белые струи</b>? Это ветер. Плотная полоса — <b>порыв</b>: бросает машину. ${TOUCH ? '<b>▼</b>' : '<b>Shift</b>'} — вниз, садитесь в круг «Н»`, ok: () => F.mi >= 1 } ];
  function coachTick(dt) { const el = $('hcoach'); if (F.coach === undefined || F.coach >= COACH.length) { el.hidden = true; return; }
    const st = COACH[F.coach]; if (F.cStep !== F.coach) { F.cStep = F.coach; F.cT = 0; F.c0 = Hc.th; el.innerHTML = `<small>ИНСТРУКТАЖ · ${F.coach + 1} ИЗ ${COACH.length}</small>${st.t()}`; el.hidden = false; }
    F.cT = st.ok() ? F.cT + dt : 0; if (F.cT >= (st.hold || 0.2)) { F.coach++; audio.chime && audio.chime(); if (F.coach >= COACH.length) { store.set('heliCoach', 1); toast('Отлично! Дальше — сами'); } } }
  function begin() { build(); if (!on) prev = G.player; on = true; for (const k in G.marks || {}) G.marks[k].visible = false;
    if (prev && prev.model && prev.model.root) prev.model.root.visible = false; if (prev && prev.wake && prev.wake.mesh) prev.wake.mesh.visible = false;
    G.player = P; G.race = null; G.mode = 'heli'; M.root.visible = true; boom.m.visible = false; marks.visible = true;
    document.body.classList.add('heli'); document.body.classList.remove('motor', 'para', 'jet'); $('hwrap').hidden = false; $('mark').hidden = true; $('result').hidden = true; $('brief').hidden = true;
    F = { dbg: /helidbg/.test(location.search), t: 0, ended: false, msg: {}, mis: [], mi: 0, hold: 0, crashT: 0, rpm: 0, camD: 34, coach: store.get('heliCoach') ? undefined : 0, cam: null, score: 0, combo: 1, lowT: 0, touches: 0, hard: 0, soft: 0, wasGround: true }; showGame(true); resetView(); G.cam = 0; camInit = false; WB.t = -1; }
  function startFree(mode = '') { begin(); G.spyAir = true; if (A.post && A.post.setInk) A.post.setInk(0.55); lastMode = mode; F.mis = missions(mode); const b = F.base; if (mode === 'sar') { F.sar = true; F.coach = undefined; }
    if (mode === 'merz' && G.merz) { const o = G.merz.out, c = G.merz.center, a = Math.atan2(c.X - o.X, c.Y - o.Y), X = c.X + Math.sin(a) * 600, Y = c.Y + Math.cos(a) * 600;
      Hc.reset(X, Y, Math.max(H(X, Y), G.merz.top) + 150, a + Math.PI, false); Hc.load = 0; F.mi = 0; toast('Озеро Мерцбахера. Слышите? Это лёд'); return; }
    Hc.reset(b.X + 4, b.Y - 6, H(b.X + 4, b.Y - 6), G.khan ? Math.atan2(G.khan.poi.khan.X - b.X, G.khan.poi.khan.Y - b.Y) : 0, true); Hc.load = 0; F.mi = 0;
    const m0 = F.mis[0]; if (m0 && m0.load > 0) Hc.load = m0.load;
    { let px = b.X, py = b.Y, L = 0; for (const m of F.mis) { L += Math.hypot(m.to.X - px, m.to.Y - py); px = m.to.X; py = m.to.Y; } F.par = Math.round(L / 45 + 75 * F.mis.length); } // норматив: 160 км/ч по прямой + минута с четвертью на каждую точку
    if (F.sar) { SAR.begin(); return; }
    const cl = hoverCeiling(Hc.mass); toast(G.khan ? `База ${Math.round(b.z + 1607)} м · висеть можно до ${Math.round(cl)} м` : 'Ми-8 на площадке. Пробел — вверх, стрелки — наклон и поворот');
    setTimeout(() => { if (on) announce(); }, 4500); }
  function stop() { if (!on) return; on = false; G.spyAir = false; if (A.post && A.post.setInk) A.post.setInk(1); INK_U.uK.value = Math.max(0.75, INK_U.uRes.value.y / 720); if (SAR) SAR.stop(); if (AIRFX) AIRFX.hide(); if (streak) streak.m.visible = false; winchDraw(null); M.root.visible = false; marks.visible = false; beacon.g.visible = false; reticle.visible = false; boom.m.visible = false; document.body.classList.remove('heli'); $('hwrap').hidden = true; camera.up.set(0, 1, 0);
    $('hint').hidden = true; $('mark').hidden = true; audio.jet && audio.jet(0, 0, false); audio.rotor && audio.rotor(1, 0, 0, 0, false); audio.airflow(0, 0, 0, false); input.hu = input.hd = false; if (prev) G.player = prev; F = null; }

  // ---- ветер Центрального Тянь-Шаня: слоями по высоте, как в настоящих горах ----
  //  * Свободная атмосфера -- западный перенос (с 260°): у дна долин ~3 м/с, на 5 км ~13, на 6-7 км -- 20-30 м/с
  //    (струйное течение садится на хребты; в «улан» -- в 1.6 раза сильнее). В глубокой долине он прикрыт хребтами.
  //  * Ледниковый (стоковый) ветер: холодный воздух стекает вниз по Иныльчеку, сильнее всего в 20-150 м над льдом,
  //    ночью и утром ~6 м/с, днём слабее.
  //  * У склонов: наветренный -- подъём, подветренный -- спуск и роторная болтанка.
  //  * Порывы -- отдельные «стены» ветра, идут по потоку; видно по снежным струям и позёмке.
  const KW = { breeze: 0.6, santash: 1, ulan: 1.6 }, PROF = [[2500, 3], [4000, 7], [5000, 13], [6000, 21], [7000, 30], [8000, 34]];
  const prof = (asl) => { if (asl <= PROF[0][0]) return PROF[0][1]; for (let i = 1; i < PROF.length; i++) if (asl < PROF[i][0]) { const [a0, u0] = PROF[i - 1], [a1, u1] = PROF[i]; return u0 + (u1 - u0) * (asl - a0) / (a1 - a0); } return PROF[PROF.length - 1][1]; };
  const WB = { t: -1, x: 0, y: 0, z: 0, tb: 0, X: 0, Y: 0, Z: 0, dx: 1, dy: 0, U: 0 };
  // медленная часть (раз в 0.15 с, у вертолёта): слои, укрытие хребтами, ледниковый сток, склоны
  function windBase(X, Y, Z) { const now = G.t || 0; if (Math.abs(now - WB.t) < 0.15 && Math.abs(X - WB.X) + Math.abs(Y - WB.Y) < 60 && Math.abs(Z - WB.Z) < 30) return WB;
    Object.assign(WB, { t: now, X, Y, Z }); const asl = Z + 1607, zone = G.khan && G.inKhan, gz = H(X, Y), agl = Z - gz; let wx, wy;
    if (zone) { const K = KW[G.preset] ?? 0.8, swell = 0.85 + 0.15 * Math.sin(now * 0.05), d = (260 + 12 * Math.sin(now * 0.03)) * Math.PI / 180;
      let crest = gz; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; crest = Math.max(crest, H(X + Math.cos(a) * 1500, Y + Math.sin(a) * 1500)); }
      const open = 0.5 + 0.5 * sm(-700, 150, Z - crest), U = prof(asl) * K * swell * open; wx = -Math.sin(d) * U; wy = -Math.cos(d) * U; // «с запада» -- дует на восток
      // ледниковый сток вниз по склону долины
      const e = 400, sx = (H(X + e, Y) - H(X - e, Y)) / (2 * e), sy = (H(X, Y + e) - H(X, Y - e)) / (2 * e), sl = Math.hypot(sx, sy) || 1e-4, hr = G.clock ?? 12, day = hr > 10 && hr < 17 ? 0.5 : 1;
      const kat = 7 * day * sm(0.004, 0.05, sl) * Math.min(1, Math.max(0, agl) / 20 + 0.3) * Math.exp(-Math.max(0, agl - 60) / 250); wx -= sx / sl * kat; wy -= sy / sl * kat; WB.kat = kat; }
    else { const W = G.wind || { sx: 0, sy: 0 }, k = 1 + Math.min(2.2, Math.max(0, asl - 2500) / 1800); wx = W.sx * k; wy = W.sy * k; WB.kat = 0; }
    const U = Math.hypot(wx, wy) || 1e-3, e = 250, gx = (H(X + e, Y) - H(X - e, Y)) / (2 * e), gy = (H(X, Y + e) - H(X, Y - e)) / (2 * e), near = Math.exp(-Math.max(0, agl) / 400);
    const upw = (wx * gx + wy * gy) * near, lee = Math.max(0, -(wx * gx + wy * gy) / U);
    Object.assign(WB, { x: wx, y: wy, z: clamp(upw * 0.6, -3, 3), U, dx: wx / U, dy: wy / U, tb: Math.min(1.6, U * 0.02 * (0.3 + near) + lee * 0.5 * near + (U > 25 ? (U - 25) * 0.02 : 0)) }); if (F) F.wU = U; return WB; }
  // порывы: ячейки 150-250 м, бегут по ветру чуть быстрее потока; спереди -- резкий фронт, сзади -- плавный хвост
  const gustAt = (X, Y, Z, out) => { out.x = 0; out.y = 0; out.f = 0; if (!F || !F.gusts) return out;
    for (const c of F.gusts) { const rx = X - c.X, ry = Y - c.Y, a = (rx * c.dx + ry * c.dy) / c.R, q = (rx * c.dy - ry * c.dx) / c.R, dz = (Z - c.Z) / 160; if (a > 0.35 || a < -3 || Math.abs(q) > 2.2 || Math.abs(dz) > 2.5) continue;
      const f = (a > 0 ? 1 - a / 0.35 : Math.exp(-(a / 1.4) * (a / 1.4))) * Math.exp(-q * q) * Math.exp(-dz * dz) * c.k; out.x += c.dx * c.S * f; out.y += c.dy * c.S * f; out.f = Math.max(out.f, f); } return out; };
  const gq = { x: 0, y: 0, f: 0 };
  function wind(X, Y, Z) { const b = windBase(X, Y, Z), q = gustAt(X, Y, Z, gq); return { x: b.x + q.x, y: b.y + q.y, z: b.z, tb: b.tb + q.f * 0.7, gx: q.x, gy: q.y }; }
  function gustTick(dt) { const b = windBase(Hc.X, Hc.Y, Hc.Z), gs = F.gusts || (F.gusts = []);
    for (const c of gs) { c.X += c.dx * c.V * dt; c.Y += c.dy * c.V * dt; c.k = Math.min(1, c.k + dt * 0.8); c.life -= dt; }
    for (let i = gs.length - 1; i >= 0; i--) if (gs[i].life <= 0) gs.splice(i, 1);
    // чем сильнее ветер, тем чаще порывы; в штиль -- редкие слабые
    F.gT = (F.gT ?? 3) - dt; if (F.gT <= 0 && gs.length < 6) { const U = Math.max(b.U, 5), r = Math.random(), off = (Math.random() - 0.5) * 500, d = 650 + Math.random() * 250, tw = (Math.random() - 0.5) * 0.5, dx = b.dx * Math.cos(tw) - b.dy * Math.sin(tw), dy = b.dx * Math.sin(tw) + b.dy * Math.cos(tw);
      gs.push({ X: Hc.X - dx * d + dy * off, Y: Hc.Y - dy * d - dx * off, Z: Hc.Z + (Math.random() - 0.4) * 120, dx, dy, V: U * 1.1 + 4, S: U * (0.45 + 0.5 * r) + 5, R: 150 + Math.random() * 110, k: 0, life: (d + 900) / (U * 1.1 + 4) });
      F.gT = (9 + Math.random() * 8) * clamp(14 / U, 0.35, 1.6); }
    // предупреждение: фронт порыва в 120-450 м и идёт на нас
    let warn = null; for (const c of gs) { const rx = Hc.X - c.X, ry = Hc.Y - c.Y, a = rx * c.dx + ry * c.dy, q = Math.abs(rx * c.dy - ry * c.dx); if (a > 60 && a < 450 && q < c.R * 1.4 && c.S > Math.max(10, b.U + 3)) { const rel = wrapPi(Math.atan2(-c.dx, -c.dy) - Hc.th); warn = { side: Math.abs(rel) < 0.8 ? 'СПЕРЕДИ' : Math.abs(rel) > 2.4 ? 'СЗАДИ' : rel > 0 ? 'СПРАВА' : 'СЛЕВА', S: c.S }; break; } }
    if (warn && !F.gWarn) audio.airflow && G.shake < 0.1 && (G.shake = 0.08); F.gWarn = warn;
    // позёмка: порыв у земли срывает снег со льда -- видно, как он бежит по леднику
    if (G.spray && G.inKhan) for (const c of gs) { const n = Math.round(c.k * c.S * dt * 1.6); for (let i = 0; i < n; i++) { const a = -Math.random() * 2.2 * c.R, q = (Math.random() - 0.5) * 2 * c.R, X = c.X + c.dx * a + c.dy * q, Y = c.Y + c.dy * a - c.dx * q, gz = H(X, Y);
      if (gz < 0 || c.Z - gz > 220 || Math.hypot(X - Hc.X, Y - Hc.Y) > 700) continue; const v = c.S * 0.8; G.spray.emit(X, gz + 0.6, -Y, c.dx * v, 1 + Math.random() * 2.5, -c.dy * v, 5 + Math.random() * 4, 1, 1); } } }
  // снежные струи: короткие штрихи вокруг вертолёта летят с ветром -- длина и яркость по силе, в порыве -- ярче и гуще
  const NS = 520; let streak = null;
  function makeStreaks() { const g = new THREE.BufferGeometry(), pos = new Float32Array(NS * 12), col = new Float32Array(NS * 16), idx = new Uint16Array(NS * 6);
    for (let i = 0; i < NS; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false; scene.add(m); m.visible = false;
    const p = new Float32Array(NS * 4); for (let i = 0; i < NS; i++) p[i * 4 + 3] = -Math.random(); return { m, g, pos, col, p }; }
  const BX = 115, BZ0 = -50, BZ1 = 70;
  function streakTick(dt) { if (!streak) streak = makeStreaks(); const S = streak; S.m.visible = !Hc.crash; const b = windBase(Hc.X, Hc.Y, Hc.Z);
    for (let i = 0; i < NS; i++) { const o = i * 4; let x = S.p[o], y = S.p[o + 1], z = S.p[o + 2], life = S.p[o + 3];
      if (life <= 0 || Math.abs(x - Hc.X) > BX || Math.abs(y - Hc.Y) > BX || z - Hc.Z < BZ0 || z - Hc.Z > BZ1) { if (life < 0) { S.p[o + 3] = life + dt; } else { x = Hc.X + (Math.random() * 2 - 1) * BX; y = Hc.Y + (Math.random() * 2 - 1) * BX; z = Hc.Z + BZ0 + Math.random() * (BZ1 - BZ0); S.p[o + 3] = 0.001; life = 0.001; } }
      gustAt(x, y, z, gq); const wx = b.x + gq.x, wy = b.y + gq.y, wz = b.z, U = Math.hypot(wx, wy), gz = H(x, y); if (z < gz + 1) z = gz + 1 + Math.random() * 3;
      x += wx * dt; y += wy * dt; z += wz * dt * 0.5; if (life > 0) { life = Math.min(1, life + dt * 1.5); S.p[o + 3] = life; } S.p[o] = x; S.p[o + 1] = y; S.p[o + 2] = z;
      const L = 2 + U * 0.3 * (1 + gq.f), dd = Math.hypot(x - Hc.X, y - Hc.Y, z - Hc.Z), a = Math.max(0, life) * clamp((U - 2) / 10, 0, 1) * (0.5 + 0.5 * gq.f) * (1 - sm(80, BX, dd)) * (U > 0.1 ? 1 : 0), ux = wx / (U || 1), uy = wy / (U || 1);
      // лента к камере: ширина растёт с расстоянием (~2 пикселя на любом удалении)
      const hx = x, hy = z, hz = -y, tx = x - ux * L, ty = z - wz / (U || 1) * L * 0.3, tz = -(y - uy * L), cx = camera.position.x - hx, cy = camera.position.y - hy, cz = camera.position.z - hz, dc = Math.hypot(cx, cy, cz) || 1;
      let sx = (ty - hy) * cz - (tz - hz) * cy, sy = (tz - hz) * cx - (tx - hx) * cz, sz = (tx - hx) * cy - (ty - hy) * cx; const sl = Math.hypot(sx, sy, sz) || 1, wd = clamp(dc * 0.0035, 0.05, 1.2) / sl; sx *= wd; sy *= wd; sz *= wd;
      const v = i * 12; S.pos[v] = hx + sx; S.pos[v + 1] = hy + sy; S.pos[v + 2] = hz + sz; S.pos[v + 3] = hx - sx; S.pos[v + 4] = hy - sy; S.pos[v + 5] = hz - sz;
      S.pos[v + 6] = tx + sx; S.pos[v + 7] = ty + sy; S.pos[v + 8] = tz + sz; S.pos[v + 9] = tx - sx; S.pos[v + 10] = ty - sy; S.pos[v + 11] = tz - sz;
      const c = i * 16; for (let k = 0; k < 4; k++) { S.col[c + k * 4] = 0.6; S.col[c + k * 4 + 1] = 0.68; S.col[c + k * 4 + 2] = 0.82; S.col[c + k * 4 + 3] = k < 2 ? Math.min(0.85, a) : 0; } }
    S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; }

  // Ручка -- как в San Andreas: вперёд -- наклон носа и разгон, на себя -- торможение, в стороны -- поворот (на скорости --
  // вираж с креном). Пробел/▲ -- вверх, Shift/▼ -- вниз. Отпустил всё -- висит, но по инерции ещё катится.
  // клавиши -- не «всё или ничего»: отклонение нарастает за ~0.45 с (короткое нажатие -- подправка), отпустил -- возвращается быстро
  const kb = { x: 0, y: 0, s: 0 }, ramp = (v, t, dt) => v + Math.max(-dt * (t === 0 ? 6 : 2.2), Math.min(dt * (t === 0 ? 6 : 2.2), t - v)) * (Math.sign(t) && Math.sign(v) && Math.sign(t) !== Math.sign(v) ? 2 : 1);
  function ctl(dt = 1 / 60) { let x = (input.right ? 1 : 0) - (input.left ? 1 : 0), y = (input.sin ? 1 : 0) - (input.flare ? 1 : 0); kb.x = ramp(kb.x, x, dt); kb.y = ramp(kb.y, y, dt); x = kb.x; y = kb.y;
    const st = (input.sr ? 1 : 0) - (input.sl ? 1 : 0); kb.s = ramp(kb.s, st, dt);
    if (input.joy) { const j = input.joy, ex = (v) => (Math.abs(v) < 0.08 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.08) / 0.92, 1.25)); x = ex(j.x); y = -ex(j.y); }
    const up = (input.bar || input.hu ? 1 : 0) - (input.shift || input.hd ? 1 : 0);
    return { fwd: y, side: x, up, strafe: kb.s }; }

  function tick(dt) { if (!on) return; if (F.slow > 0) { F.slow -= dt; dt *= 0.3; } F.t += dt; // удар: на миг время замедляется -- удар чувствуется
    if (Hc.crash) { crashTick(dt); return; }
    const c0 = ctl(dt), c = SAR && SAR.drone ? { fwd: 0, side: 0, up: 0 } : c0, steps = Math.max(1, Math.ceil(dt / (1 / 120))); for (let i = 0; i < steps; i++) Hc.step(dt / steps, c, H, wind);
    if (F.sar) SAR.tick(dt, c0);
    Hc.fuel = Math.max(200, Hc.fuel - dt * (0.12 + 0.18 * Hc.power)); // ~800 кг/ч на висении
    if (Hc.crash) { startCrash(); return; }
    if (Hc.touch) { const t = Hc.touch; Hc.touch = null; F.touches = (F.touches || 0) + 1; buzz(t.vz > 2.5 ? [60, 40, 60] : 35);
      if (t.vz > 2.5) { F.hard = (F.hard || 0) + 1; F.combo = 1; G.shake = 0.8; pop('ЖЁСТКО!', 'комбо сгорело'); } else { if (t.vz < 1) F.soft = (F.soft || 0) + 1; landingScore(t, F.mis[F.mi]); G.shake = Math.max(G.shake, 0.18); } }
    // бреющий: быстрее 120 км/ч в 30 м от земли или склона -- очки капают, комбо растёт; свист потока и тряска у стены (камера)
    { const low = !Hc.ground && Hc.speed > 33 && (Hc.agl < 30 || (F.near || 0) > 0.55); F.nm = low ? Math.min(3, (F.nm || 0) + dt) : Math.max(0, (F.nm || 0) - dt * 1.5); F.nmOff = low ? 0 : (F.nmOff || 0) + dt; // серия держится секунду после выхода -- кочка её не рвёт
      if (low) { F.nmAcc = (F.nmAcc || 0) + dt * (Hc.agl < 15 ? 30 : 18) * (Hc.speed / 40); if (F.nm > 0.4 && !F.nmSnd) { F.nmSnd = true; audio.gust && audio.gust(0.8); flash('fast', 0.5); } }
      else if (F.nmOff > 1) { if (F.nmAcc > 8 && !F.sar) score(Math.round(F.nmAcc), 'БРЕЮЩИЙ', `${Math.round(F.nmT || 0)} с у самой земли`); else if (F.nmAcc > 8) pop(`БРЕЮЩИЙ · ${Math.round(F.nmT || 0)} с`, 'у самой земли'); F.nmAcc = 0; F.nmSnd = false; F.nmT = 0; }
      if (low) F.nmT = (F.nmT || 0) + dt; }
    if (Hc.heatHit) { Hc.heatHit = false; pop('ПЕРЕГРЕВ!', 'мощность −20% на 15 с'); buzz([80, 50, 80, 50, 80]); }
    if (Hc.crOn && !F.crWas) { pop('ЧР', 'чрезвычайный режим · +12% тяги'); buzz(40); } F.crWas = Hc.crOn;
    skillTick(dt);
    if (F.wasGround && !Hc.ground) { G.shake = Math.max(G.shake, 0.45); audio.thump && audio.thump(0.35); } F.wasGround = Hc.ground; // отрыв -- вздрогнул и пошёл
    missionTick(dt); coachTick(dt); washTick(dt); gustTick(dt); streakTick(dt);
    if (Hc.hit) { const h = Hc.hit; F.slow = Math.min(0.45, 0.12 + h.imp * 0.02); flash('hit', Math.min(1, 0.4 + h.imp * 0.04)); audio.shake && audio.shake(); audio.pop && audio.pop(Math.min(1.6, 0.6 + h.imp * 0.06)); Hc.hit = null; F.combo = 1; F.hits = (F.hits || 0) + 1; G.shake = Math.max(G.shake, Math.min(1.2, 0.3 + h.imp * 0.05)); audio.thump && audio.thump(Math.min(1.4, 0.4 + h.imp * 0.05)); buzz([70, 30, 90]);
      pop('УДАР!', `корпус ${Math.round(Hc.hp)}% · комбо сгорело`); for (let i = 0; i < 24 && G.spray; i++) G.spray.emit(Hc.X, Hc.Z + 1, -Hc.Y, (Math.random() - 0.5) * 14, 2 + Math.random() * 6, (Math.random() - 0.5) * 14, 4, 1, 1); }
    { const mi = F.mis[F.mi] || F.goal; beaconTick(dt, mi ? mi.to : null, mi ? Math.hypot(Hc.X - mi.to.X, Hc.Y - mi.to.Y) : 0); if (mi) F.wv = WB; }
    if (F.pt !== undefined && F.mis[F.mi] && F.mis[F.mi].timer) F.pt = Math.max(0, F.pt - dt / 4.5); // состояние пострадавших тает: спешите, но без риска
    const b = P.b; b.X = Hc.X; b.Y = Hc.Y; b.th = Hc.th; b.speed = Hc.speed; b.base = Hc.Z; b.y = Hc.Z; }
  function startCrash() { boom.t = 0; boom.m.visible = true; boom.m.position.set(Hc.X, Hc.Z + 2, -Hc.Y); M.root.visible = false; audio.thump && audio.thump(1.6); G.shake = 1.4;
    toast(Hc.crash.water ? 'Вертолёт в воде. Экипаж спасён' : Hc.crash.slope > 0.28 ? 'Склон слишком крутой — вертолёт опрокинуло' : 'Удар о землю. Экипаж жив — машина нет'); }
  function crashTick(dt) { F.crashT += dt; boom.t += dt; const k = Math.min(1, boom.t / 0.7); boom.m.scale.setScalar(4 + 16 * k); boom.m.material.opacity = 0.85 * (1 - k); if (k >= 1) boom.m.visible = false; if (F.crashT > 3 && !F.ended) finish('crash'); }
  function finish(kind) { if (F.sar) { SAR.end(); return; } if (F.ended) return; F.ended = true; let h = '', s = '';
    if (kind === 'rescue') { // звёзды: время против норматива, мягкость посадок, состояние пострадавших
      const par = F.par || 600, st = 1 + (F.t < par ? 1 : 0) + ((F.hard || 0) === 0 && (F.pt === undefined || F.pt > 40) ? 1 : 0), best = store.get('heliBest') || 0; if (st > best) store.set('heliBest', st);
      const sc = F.score + Math.round((F.pt ?? 100) * 3), rec = sc > (store.get('heliScore') || 0); if (rec) store.set('heliScore', sc);
      h = `${'★'.repeat(st)}${'☆'.repeat(3 - st)} ${sc} очков${rec ? ' · рекорд!' : ''}`; s = `Время ${fmt(F.t)} (норматив ${fmt(par)}) · жёстких посадок ${F.hard || 0}${F.pt !== undefined ? ` · состояние пострадавших ${Math.round(F.pt)}%` : ''} · топливо ${Math.round(Hc.fuel)} кг`; }
    else { h = 'Авария'; s = 'Горы не прощают ошибок шага. Ещё раз?'; }
    $('rh').textContent = h; $('rs').textContent = s; $('rt').innerHTML = ''; $('ragain').textContent = 'Ещё вылет'; setTimeout(() => { if (on) $('result').hidden = false; }, 1200); }

  // ---- камера: за вертолётом, чуть сверху; на висении -- ближе, на скорости -- дальше ----
  let camInit = false;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a)), clampA = (v, a, b) => Math.max(a, Math.min(b, v)), sm2 = (a, b, x) => { const t = clampA((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // расстояние до склона сбоку/впереди (для ощущения скорости у стены): лучи в 4 стороны на 30-80 м
  function wallDist() { let best = 999; for (let k = 0; k < 6; k++) { const a = Hc.th + (k - 2.5) * 0.9; for (const r of [30, 55, 80]) if (H(Hc.X + Math.sin(a) * r, Hc.Y + Math.cos(a) * r) > Hc.Z - 8) { best = Math.min(best, r); break; } } return best; }
  function cam(dt) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); INK_U.uK.value = Math.max(0.75, INK_U.uRes.value.y / 720) * 0.55; /* хребты с воздуха -- тонким пером */ if (M && !M.root.visible && on && !Hc.crash && F && F.spyHid) { M.root.visible = true; F.spyHid = false; }
    M.root.position.set(Hc.X, Hc.Z, -Hc.Y); M.root.rotation.set(0, 0, 0); M.root.rotateY(-Hc.th); M.root.rotateX(-Hc.pitch); M.root.rotateZ(-Hc.roll);
    F.rpm += ((Hc.crash ? 0 : Hc.ground && Hc.col < 0.05 && F.t < 2 ? 0.4 : Hc.rpm) - F.rpm) * Math.min(1, dt * 0.8); M.spin(dt, F.rpm); if (SAR && SAR.cam(dt)) { if (reticle) reticle.visible = false; return; }
    if (Hc.crash) { v3.set(Hc.X + 40, Hc.Z + 25, -Hc.Y + 40); camera.position.lerp(v3, Math.min(1, dt * 2)); camera.up.set(0, 1, 0); camera.lookAt(Hc.X, Hc.Z + 3, -Hc.Y); camera.updateProjectionMatrix(); return; }
    // камера полёта: сфера вокруг машины, как у яхты (орбита пальцем/мышью, колесо -- дальше-ближе), но живая:
    //  * на скорости смотрит туда, куда машина ЛЕТИТ (между носом и вектором скорости) -- занос виден, нос «гуляет» в кадре;
    //  * точка взгляда -- впереди по движению (look-ahead), камера на пружине с запаздыванием ~0.15 с: разгон оттягивает её назад;
    //  * на скорости отъезжает и расширяет кадр (FOV 55 -> 70), рывок разгона -- короткий «удар» FOV;
    //  * вираж наклоняет горизонт; тряска -- только от турбулентности, ЧР и пролёта у самого склона
    const Vg = Hc.speed, vdir = Math.atan2(Hc.vx, Hc.vy), fl = sm2(12, 35, Vg);
    if (!camInit) { F.cyaw = Hc.th; camInit = true; F.cam = null; }
    const want = Hc.th + wrapA(vdir - Hc.th) * 0.6 * fl; F.cyaw += wrapA(want - F.cyaw) * Math.min(1, dt * (1.6 + 1.4 * fl)); clook.set(Math.sin(F.cyaw), 0, -Math.cos(F.cyaw));
    const tall = window.innerHeight / Math.max(1, window.innerWidth), wl = F.w && F.w.L > 1 && F.w.init ? (F.wl = Math.min(1, (F.wl || 0) + dt)) : (F.wl = Math.max(0, (F.wl || 0) - dt)); // лебёдка: камера выше, видно крюк и людей
    F.camD += ((32 + 22 * sm2(10, 70, Vg)) * G.zoom * Math.min(1.7, Math.max(1, tall * 0.8)) - F.camD) * Math.min(1, dt * 1.2); const d = F.camD * (1 + 0.15 * wl);
    const yaw = F.cyaw + G.orbit, el = Math.min(1.45, Math.max(-0.05, 0.19 - 0.05 * fl + G.orbitP + 0.35 * wl)), ce = Math.cos(el), se = Math.sin(el), fx = Math.sin(yaw), fy = Math.cos(yaw);
    const la = Math.min(1, 0.9 * fl), tx = Hc.X + clampA(Hc.vx * 0.8, -50, 50) * la + Math.sin(Hc.th) * 5, ty = Hc.Y + clampA(Hc.vy * 0.8, -50, 50) * la + Math.cos(Hc.th) * 5, tz = Hc.Z + 3; // смотрим вперёд по движению
    v3.set(Hc.X - fx * d * ce, tz + d * se, -(Hc.Y - fy * d * ce));
    const gy = Math.max(0, H(v3.x, -v3.z)) + 6; F.cgy = Math.max(gy, (F.cgy || gy) + (gy - (F.cgy || gy)) * Math.min(1, dt * 4)); if (v3.y < F.cgy) v3.y = F.cgy; // склон под камерой -- приподнимаем плавно
    // пружина: относительно машины (иначе на 70 м/с камера отстаёт на десятки метров) -- запаздывание чувствуется только при рывках
    const rel = F.crel || (F.crel = new THREE.Vector3()), tgt = v3.clone().sub(M.root.position); if (!F.cam) rel.copy(tgt); else rel.lerp(tgt, Math.min(1, dt * 6)); F.cam = true;
    // у склона на скорости: лёгкая дрожь и шире кадр -- скорость видна по близкой стене
    const near = Vg > 25 ? sm2(90, 25, Math.min(Hc.agl, wallDist())) : 0; F.near = (F.near || 0) + (near - (F.near || 0)) * Math.min(1, dt * 3);
    const sh = Hc.shake * 0.22 + Math.max(0, G.shake) * 0.5 + F.near * 0.12 + (Hc.tb || 0) * 0.15, jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh; G.shake = Math.max(0, G.shake - dt * 1.4);
    camera.position.copy(M.root.position).add(rel); camera.position.x += jx; camera.position.y += jy; camera.up.set(0, 1, 0);
    cpos.set(tx, tz + (tall > 1.2 ? -2 : 1), -ty); if (wl > 0 && F.w) cpos.lerp(v3.set(F.w.p[0], F.w.p[2], -F.w.p[1]), 0.4 * wl); camera.lookAt(cpos);
    F.croll = (F.croll || 0) + (Hc.roll * 0.22 * Math.cos(G.orbit) - (F.croll || 0)) * Math.min(1, dt * 3); camera.rotateZ(-F.croll); // вираж наклоняет горизонт
    const acc = Math.hypot(Hc.ax || 0, Hc.ay || 0); F.kick = Math.max((F.kick || 0) - dt * 1.5, Math.min(1, Math.max(0, acc - 3) / 4) * (Hc.pitch < -0.1 ? 1 : 0));
    camera.fov += (55 + 15 * sm2(15, 75, Vg) + F.kick * 3 + F.near * 4 + Hc.cr * 3 - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
    if (AIRFX) AIRFX.tick(dt, Hc, wind(Hc.X, Hc.Y, Hc.Z), camera);
    // прицел посадки на земле
    if (reticle) { const show = !Hc.crash && Hc.agl < 120 && Hc.agl > 0.8; reticle.visible = show; if (show) { const gz = H(Hc.X, Hc.Y), mi = F.mis[F.mi], d = mi ? Math.hypot(Hc.X - mi.to.X, Hc.Y - mi.to.Y) : 99, sc = 14 + Hc.agl * 0.12;
      reticle.position.set(Hc.X, gz + 0.4, -Hc.Y); reticle.scale.set(sc, sc, 1); reticle.material.color.setHex(d < 5 ? 0x6cff7a : d < 15 ? 0xffe14a : 0xffffff); reticle.material.opacity = 0.35 + 0.5 * (1 - Hc.agl / 120); } } }
  function resetCam() { camInit = false; camera.up.set(0, 1, 0); }

  // ---- приборы: скорость, высоты, вертикальная, масса и запас тяги, обороты, топливо ----
  let hudT = 0;
  // вектор полёта: вид сверху, «вверх» -- куда смотрит камера. Белый силуэт -- нос, оранжевая стрелка -- куда машина
  // реально летит (длина -- скорость), голубая -- ветер. Видно занос и снос: нос повернул, а машина ещё идёт по-старому
  function vec() { const cv = $('hvec'); if (!cv) return; const hh = $('hhud').getBoundingClientRect(), phone = window.innerWidth <= 640; cv.hidden = phone || TOUCH || Hc.crash || document.body.classList.contains('sardr');
    if (cv.hidden) return; cv.style.left = '16px'; cv.style.bottom = '16px'; cv.style.top = 'auto';
    const x = cv.getContext('2d'), R = 90, cyaw = Math.atan2(clook.x, -clook.z) + G.orbit; x.clearRect(0, 0, 180, 180); x.save(); x.translate(90, 90);
    x.fillStyle = 'rgba(8,22,48,.55)'; x.beginPath(); x.arc(0, 0, R - 2, 0, 7); x.fill(); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; for (const r of [30, 60]) { x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); }
    const arrow = (a, L, c, w) => { x.save(); x.rotate(a); x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -L); x.stroke(); x.beginPath(); x.moveTo(0, -L - 10); x.lineTo(8, -L + 4); x.lineTo(-8, -L + 4); x.closePath(); x.fill(); x.restore(); };
    const wv = WB.U || 0; if (wv > 1) arrow(Math.atan2(WB.x, WB.y) - cyaw, Math.min(70, 14 + wv * 2.2), 'rgba(110,190,255,.85)', 4);
    const V = Hc.speed; if (V > 1) arrow(Math.atan2(Hc.vx, Hc.vy) - cyaw, Math.min(78, 12 + V * 0.95), '#ff8a2a', 7);
    x.save(); x.rotate(Hc.th - cyaw); x.fillStyle = '#fff'; x.strokeStyle = '#0b1a33'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -24); x.lineTo(9, 10); x.lineTo(0, 5); x.lineTo(-9, 10); x.closePath(); x.stroke(); x.fill(); x.restore();
    x.font = '700 22px system-ui,sans-serif'; x.textAlign = 'center'; x.fillStyle = Hc.hov > 0.5 && V < 3 ? '#9fe0a0' : '#ffd27a';
    const st = Hc.ground ? 'НА ЗЕМЛЕ' : Hc.hov > 0.5 && V < 3 ? 'ВИСЕНИЕ' : Math.abs(Hc.slip) > 0.25 && V > 12 ? 'ЗАНОС' : ''; if (st) x.fillText(st, 0, 78); x.restore(); }
  // отладка лётной модели: ` (обратная кавычка) или ?helidbg
  function dbg() { const el = $('hdbg'); if (!F.dbg) { el.hidden = true; return; } el.hidden = false; const w = wind(Hc.X, Hc.Y, Hc.Z), f = (v, n = 1) => (+v || 0).toFixed(n);
    el.textContent = `V ${f(Hc.speed)} м/с  vx ${f(Hc.vx)} vy ${f(Hc.vy)} vz ${f(Hc.vz)}\nнос ${f(Hc.th * 57.3 % 360, 0)}°  движение ${f(Math.atan2(Hc.vx, Hc.vy) * 57.3, 0)}°  занос ${f(Hc.slip * 57.3, 0)}°\nтангаж ${f(Hc.pitch * 57.3)}°  крен ${f(Hc.roll * 57.3)}° (вираж ${f(Hc.bank * 57.3)})  рыск ${f(Hc.yr, 2)} рад/с\nускор ${f(Hc.ax)} / ${f(Hc.ay)} м/с²\nветер ${f(w.x)} / ${f(w.y)} / ${f(w.z)}  порыв ${f(w.gx || 0)}/${f(w.gy || 0)}  болт ${f(w.tb, 2)}\nвисение ${f(Hc.hov, 2)}  автомат ${f(Hc.assistA, 2)} м/с²  интеграл ${f(Hc.iF, 2)} / ${f(Hc.iS, 2)}\nшаг ${f(Hc.col, 2)}  запрос ${f(Hc.dem, 2)}  тяга/вес ${f(Hc.Tmax / (Hc.mass * 9.81), 2)}  σ ${f(Hc.sig, 2)}  ETL ${f(Hc.etl, 2)}`; }
  function hud(dt) { if (!on) return; if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
    pointMark(); if (F.sar) SAR.hud(); vec(); hudT -= dt; if (hudT > 0) return; hudT = 0.1; dbg();
    const kmh = Math.round(Hc.speed * 3.6), alt = Math.round(Hc.Z + 1607), agl = Math.round(Math.max(0, Hc.agl)), m = Hc.mass, tw = Hc.Tmax / (m * 9.81), pw = Math.min(1.15, Hc.power);
    const cls = pw > 1 ? 'red' : pw > 0.92 ? 'hot' : '';
    $('hhud').innerHTML = `<div><b class="v">${kmh}</b><small>км/ч</small></div><div class="r"><b>${alt}</b> м<span class="lg"> над морем</span> · ${agl} м<span class="lg"> над землёй</span> · ${Hc.vz >= 0 ? '↑' : '↓'}${Math.abs(Hc.vz).toFixed(1)} м/с</div>
      <div class="r r2">шаг<span class="bar"><i class="${cls}" style="width:${Math.round(Math.min(1, pw) * 100)}%"></i></span>${Math.round(pw * 100)}% · обороты ${Math.round(Hc.rpm * 95)}%</div>
      <div class="r">ветер <b>${Math.round(WB.U || 0)}</b> м/с <i style="display:inline-block;font-style:normal;transform:rotate(${(wrapPi(Math.atan2(WB.x, WB.y) - Math.atan2(clook.x, -clook.z) - G.orbit)).toFixed(2)}rad)">⬆</i>${WB.kat > 2 ? ' · ледниковый сток' : ''} · корпус <b style="color:${Hc.hp > 60 ? '#9fe0a0' : Hc.hp > 30 ? '#ffd27a' : '#ff5a3a'}">${Math.round(Hc.hp)}%</b></div>
      <div class="r r4">масса <b>${(m / 1000).toFixed(1)}</b> т · тяга/вес <b>${tw.toFixed(2)}</b>${Hc.ige > 0.03 ? ' · подушка' : ''} · топливо ${Math.round(Hc.fuel)} кг</div>`;
    $('hscore').innerHTML = `<b>${F.score}</b>${F.combo > 1 ? `<i>×${F.combo.toFixed(2).replace(/\.?0+$/, '')}</i>` : ''}<br><small>рекорд ${store.get('heliScore') || 0}</small>`;
    { const cr = $('hcr'), show = Hc.cr > 0.05 || Hc.heat > 0.02 || Hc.hot > 0; cr.hidden = !show; if (show) cr.innerHTML = `${Hc.hot > 0 ? `ПЕРЕГРЕВ · ${Math.ceil(Hc.hot)} с` : Hc.crOn ? '<b style="color:#ff8a2a">ЧР</b> · +12% тяги' : 'двигатели остывают'}<span class="bar"><i class="${Hc.heat > 0.75 ? 'red' : Hc.heat > 0.45 ? 'hot' : ''}" style="width:${Math.round(Hc.heat * 100)}%"></i></span>`; }
    const w = Hc.crash ? '' : Hc.gpws ? 'ЗЕМЛЯ! ВВЕРХ ▲' : F.gWarn ? `ПОРЫВ ${F.gWarn.side}! ${Math.round(F.gWarn.S)} М/С` : (F.wU || 0) > 30 && G.frame % 120 < 60 ? `ВЕТЕР ${Math.round(F.wU)} М/С` : Hc.warn === 'hot' ? '' : Hc.warn === 'rpm' ? 'ОБОРОТЫ! СБРОСЬ ШАГ' : Hc.warn === 'vrs' ? 'ВИХРЕВОЕ КОЛЬЦО — СКОРОСТЬ ВПЕРЁД' : Hc.warn === 'power' ? 'МОЩНОСТИ НЕ ХВАТАЕТ' : '';
    const wl = $('hwarn'); if (wl.textContent !== w) wl.textContent = w; wl.hidden = !w; if (w && audio.beep && G.frame % 18 === 0) audio.beep(true);
    const mi = F.mis[F.mi] || F.goal, me = $('hmis'); guide(mi); if (mi) { me.hidden = false; const t = `<b>${mi.t}</b>${mi.timer && F.pt !== undefined ? ` · <span style="color:${F.pt > 50 ? '#9fe0a0' : F.pt > 25 ? '#ffd27a' : '#ff5a3a'}">состояние ${Math.round(F.pt)}%</span>` : ''}<br>${mi.d}${mi.how === 'winch' ? ` · на борту ${mi.to.folks.filter((f) => f.userData.up).length} из ${mi.to.folks.length}` : F.hold > 0.2 ? ` · ${mi.how === 'watch' ? 'съёмка' : 'выгрузка'} ${Math.min(100, Math.round(F.hold / (mi.how === 'watch' ? 15 : 2) * 100))}%` : ''}`; if (me.innerHTML !== t) me.innerHTML = t; } else me.hidden = true;
    const hint = !F.sar && F.coach === undefined && F.t < 30 && Hc.ground && !F.mi ? (TOUCH ? '▲ — вверх · джойстик: вперёд — разгон, на себя — тормоз, вбок — поворот' : 'Пробел — вверх, Shift — вниз · ↑ разгон, ↓ тормоз, ← → поворот') : '';
    const he = $('hint'); if (he.textContent !== hint) he.textContent = hint; he.hidden = !hint; he.className = 'hud'; }
  // стрелка к цели (относительно взгляда камеры) и посадочные подсказки у цели
  function guide(mi) { const ar = $('harr'), ld = $('hland'); if (F.banner && F.banner.t > 0) { F.banner.t -= 0.1; ar.hidden = true; ld.hidden = false; ld.textContent = F.banner.txt; ld.className = 'hud ok'; ld.style.fontSize = '42px'; return; } ld.style.fontSize = ''; if (!mi || Hc.crash) { ar.hidden = true; ld.hidden = true; return; }
    const dx = mi.to.X - Hc.X, dy = mi.to.Y - Hc.Y, d = Math.hypot(dx, dy), camYaw = Math.atan2(clook.x, -clook.z) + G.orbit, rel = wrapPi(Math.atan2(dx, dy) - camYaw);
    ar.hidden = d < 120; if (!ar.hidden) { ar.firstChild.style.transform = `rotate(${rel}rad)`; ar.lastChild.textContent = d >= 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'; }
    let t = '', c = 'go'; const agl = Hc.agl;
    const brakeD = Hc.speed * Hc.speed / 7 + 50; // тормозной путь тяжёлой машины
    if (d < Math.max(220, brakeD) && mi.how !== 'watch') { if (Hc.speed > 7 && d < brakeD) t = TOUCH ? 'ТОРМОЗИ — ДЖОЙСТИК НА СЕБЯ' : 'ТОРМОЗИ — СТРЕЛКА ↓';
      else if (mi.how === 'land') { if (Hc.ground) { t = d < 45 ? 'ПОСАДКА ✓' : 'ДАЛЕКО ОТ КРУГА'; c = d < 45 ? 'ok' : 'bad'; } else if (Hc.vz < -3 && agl < 18) { t = 'МЯГЧЕ! ▲'; c = 'bad'; } else if (agl > 10) t = `СНИЖАЙСЯ ▼ · ${Math.round(agl)} м`; else { t = 'РОВНО — САДИСЬ'; c = 'ok'; } }
      else if (mi.how === 'winch') { const W = F.w; if (!W || W.ph === 'idle' || !W.init) { t = agl > 50 ? `НИЖЕ ▼ · трос до 50 м · сейчас ${Math.round(agl)}` : 'ЗАВИСНИ НАД ЛЮДЬМИ'; }
        else if (W.ph === 'lower' && W.init) { const f = mi.to.folks.find((q) => !q.userData.up), gp = mi.to.g.position, hd = f ? Math.hypot(W.p[0] - gp.x - f.position.x, W.p[1] + gp.z + f.position.z) : 0; t = `НАВЕДИ КРЮК НА ЧЕЛОВЕКА · ${Math.round(hd)} м`; c = hd < 8 ? 'ok' : 'go'; }
        else if (W.sw > 0.45) { t = 'РАСКАЧКА! ДЕРЖИ РОВНО'; c = 'bad'; } else { t = W.sw < 0.17 ? 'ПОДЪЁМ · РОВНО — БЫСТРЕЕ' : 'ПОДЪЁМ · ГАСИ КАЧКУ'; c = W.sw < 0.17 ? 'ok' : 'go'; } } }
    else if (mi.how === 'watch' && d < 900) { t = Hc.speed > 8 ? 'ЗАВИСНИ — ИДЁТ СЪЁМКА' : 'СНИМАЕМ… ДЕРЖИ МЕСТО'; c = Hc.speed > 8 ? 'go' : 'ok'; }
    ld.hidden = !t; if (ld.textContent !== t) ld.textContent = t; ld.className = 'hud ' + c; }
  function pointMark() { const mk = $('mark'), mi = F && (F.mis[F.mi] || F.goal); if (!mi || Hc.crash) { mk.hidden = true; return; } const tg = [mi.to.X, mi.to.Y, mi.to.z + 6], w = window.innerWidth, hh = window.innerHeight;
    v3.set(tg[0], tg[2], -tg[1]).project(camera); const behind = v3.z > 1; let mx = (v3.x * 0.5 + 0.5) * w, my = (1 - (v3.y * 0.5 + 0.5)) * hh; if (behind) { mx = w - mx; my = hh * 0.5; mx = mx < w / 2 ? 0 : w; }
    const half = Math.max(40, mk.offsetWidth / 2 + 8), cx = clamp(mx, half, w - half), cy = clamp(my, 150, hh - (hh > w ? 320 : 150)), off = behind || cx !== mx || cy !== my; mk.hidden = false; mk.className = 'hud' + (off ? ' off' : ''); mk.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-100%)`;
    if (G.frame % 6 === 0) { const d = Math.hypot(tg[0] - Hc.X, tg[1] - Hc.Y), lab = off ? '' : (mi.to.name || 'цель') + ' · ', t = `${off && cx < w / 2 ? '◀ ' : ''}${lab}${d >= 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'}${off && cx > w / 2 ? ' ▶' : ''}`; if ($('markd').textContent !== t) $('markd').textContent = t; } }
  // звук: турбины по шагу, свист винта -- по оборотам, поток -- по скорости
  // звук: «чоп» несущего винта (нагрузка, шлепок в вираже/вихревом кольце/болтанке), турбины, поток -- по скорости, болтанка -- рывками
  function sound() { if (!on) return; const slap = Math.max(Hc.vrs, Math.max(0, Math.abs(Hc.roll) - 0.25) * 1.6, (Hc.tb || 0) * 0.6, Math.max(0, Hc.col - 0.95) * 4);
    if (audio.rotor) audio.rotor(F.rpm, Hc.crash ? 0 : Hc.col, Hc.speed, slap, !Hc.crash); else audio.jet && audio.jet(Hc.crash ? 0 : 0.45 + 0.4 * Math.min(1, Hc.power), 40 + Hc.speed * 0.6 * F.rpm, !Hc.crash);
    audio.airflow(Math.min(60, 6 + Hc.speed * 0.55), Math.min(1, Hc.shake + (Hc.tb || 0) * 0.5), 0, !Hc.crash); }

  return { spyEye() { if (M.root.visible) { M.root.visible = false; F.spyHid = true; } return { eyeW: [Hc.X, Hc.Z + 0.5, -Hc.Y], phi: Hc.roll * 0.4, p: Hc.shake * 0.3 + (Hc.tb || 0) * 0.4 }; }, get on() { return on; }, get heli() { return Hc; }, get F() { return F; }, get sar() { return SAR; }, startFree, stop, tick, camera: cam, hud, sound, resetCam,
    restart() { startFree(lastMode); }, again() { $('result').hidden = true; if (SAR) SAR.stop(); startFree(lastMode); } };
}
