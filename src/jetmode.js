// Режим «Як-130»: учебно-боевой реактивный самолёт, на котором учат лётчиков-истребителей в Армавире.
// Свободный полёт -- взлёт с полосы старого аэродрома Чолпон-Аты; «Пилотажная зона» -- кольца над озером на время.
// Управление (философия игры -- намерение у лётчика, рутина у автоматики, см. jet.js):
//   ← → крен (отпустил -- крылья сами в горизонт), ↓ на себя / ↑ от себя (отпустил -- держит траекторию),
//   Пробел -- максимал, Shift -- малый газ и щитки. Шасси и скорость захода автоматика ставит сама у полосы.
//   Телефон: джойстик -- ручка управления (вниз -- на себя), кнопка -- максимал.
// Награды: петля Нестерова, бочка, 1000 км/ч, 8g, бреющий над водой, потолок, посадка «на три точки», кольца.
// Земля по курсу -- «Вывод!» и пищалка; удар -- катапульта К-36: лётчик под куполом, самолёт -- в протокол.
import * as THREE from 'three';
import { Jet, YAK } from './jet.js';
import { makeJet } from './jetmodel.js';
import { FAR } from './farmap.js';
import { clamp, wrapPi } from './sim.js';

const AIRPORT = { X: -4385, Y: 1809 };
const CSS = `
body.jet #speed,body.jet #dialwrap,body.jet #race,body.jet #bpro,body.jet #bfoot{display:none!important}body.jet #tools{position:fixed;right:max(16px,env(safe-area-inset-right,0px));top:12px}
#jhud{left:max(16px,env(safe-area-inset-left,0px));top:14px;line-height:1.15}#jhud b.v{font-size:44px;font-weight:300;letter-spacing:-1px}#jhud small{font-size:13px;color:var(--dim);margin-left:4px}
#jhud .r{font-size:14px;margin-top:3px}#jhud .r b{font-weight:600}#jhud .g{display:inline-block;min-width:54px}#jhud .thr{display:inline-block;padding:0 6px;border-radius:5px;background:rgba(255,255,255,.15);font-size:12px;font-weight:700;margin-left:6px}#jhud .thr.max{background:#ff8a2a;color:#2a1300}
#jwarn{left:50%;top:28%;transform:translateX(-50%);font:800 clamp(20px,4.6vmin,34px) var(--ui);color:#ff5a3a;text-shadow:0 2px 12px rgba(0,0,0,.7);letter-spacing:.06em;animation:jblink .5s steps(2) infinite}
@keyframes jblink{50%{opacity:.35}}#jring{left:50%;top:14px;transform:translateX(-50%);text-align:center;font-size:13px}#jring b{font-size:26px;font-weight:700}
#jhorizon{position:fixed;inset:0;pointer-events:none}body.touchdev.jet #joy{display:block;left:calc(28px + 66px)}body.touchdev.jet #ts{display:block;left:auto;right:28px;transform:none}
`;

export function makeJetMode(A) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input, ach, showGame, resetView, fmt } = A;
  let on = false, built = false, J = null, M = null, P = null, prev = null, F = null, R = null, rwy = null, rings = [], chute = null, boom = null, trails = null, hz = null, hzc = null;
  const v3 = new THREE.Vector3(), cpos = new THREE.Vector3(), clook = new THREE.Vector3(), cup = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4();
  const T3 = (a) => new THREE.Vector3(a[0], a[2], -a[1]); // мир (X восток, Y север, Z вверх) -> three
  const H = (x, y) => G.h(x, y);
  const HG = (x, y) => { const m = G.hMesh ? G.hMesh(x, y) : null; return (m ?? G.h(x, y)) + (onRunway(x, y) ? 0.45 : 0); }; // земля под колёсами -- та, что нарисована

  // ---- полоса: самая ровная прямая 1800 м у старого аэродрома, курс 130..190° ----
  function findRunway() { let best = null;
    for (let dx = -600; dx <= 600; dx += 150) for (let dy = -600; dy <= 600; dy += 150) for (let a = 130; a <= 190; a += 5) {
      const th = a * Math.PI / 180, cx = AIRPORT.X + dx, cy = AIRPORT.Y + dy, L = 1800, hs = [];
      for (let s = -L / 2; s <= L / 2; s += 60) hs.push(H(cx + Math.sin(th) * s, cy + Math.cos(th) * s)); if (Math.min(...hs) < 3) continue;
      const m = hs.reduce((p, q) => p + q, 0) / hs.length, dev = Math.max(...hs.map((q) => Math.abs(q - m))) + Math.abs(hs[0] - hs[hs.length - 1]) * 0.3;
      if (!best || dev < best.dev) best = { dev, X: cx, Y: cy, th, L }; }
    return best || { X: AIRPORT.X, Y: AIRPORT.Y, th: 2.8, L: 1800 }; }
  function runwayMesh(r) { // полоса по рельефу: асфальт, осевая, торцы с «зеброй» и номерами
    const c = document.createElement('canvas'); c.width = 64; c.height = 1024; const x = c.getContext('2d'); x.fillStyle = '#3d4044'; x.fillRect(0, 0, 64, 1024);
    for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; x.fillRect(Math.random() * 64, Math.random() * 1024, 1, 1); }
    x.fillStyle = '#e8e8e8'; for (let y = 60; y < 964; y += 30) x.fillRect(31, y, 2, 16); for (const y0 of [6, 1000]) for (let k = 0; k < 8; k++) x.fillRect(6 + k * 7, y0, 4, 18); x.fillRect(2, 0, 1, 1024); x.fillRect(61, 0, 1, 1024);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    // вершины часто (10 м вдоль, 6 поперёк) и прямо на нарисованном рельефе -- иначе полоса тонет «пилой» между треугольниками земли
    const N = Math.round(r.L / 10), NC = 6, W2 = 22, pos = [], uv = [], idx = [], sx = Math.cos(r.th), sy = -Math.sin(r.th);
    for (let i = 0; i <= N; i++) { const s = -r.L / 2 + r.L * i / N, cx = r.X + Math.sin(r.th) * s, cy = r.Y + Math.cos(r.th) * s;
      for (let c = 0; c <= NC; c++) { const k = c / NC * 2 - 1, px = cx + sx * W2 * k, py = cy + sy * W2 * k, hh = G.hMesh ? (G.hMesh(px, py) ?? H(px, py)) : H(px, py); pos.push(px, hh + 0.45, -py); uv.push(c / NC, i / N); } }
    for (let i = 0; i < N; i++) for (let c = 0; c < NC; c++) { const a = i * (NC + 1) + c, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide })); m.receiveShadow = true; return m; }
  const onRunway = (X, Y) => { if (!rwy) return false; const dx = X - rwy.X, dy = Y - rwy.Y, al = dx * Math.sin(rwy.th) + dy * Math.cos(rwy.th), sd = dx * Math.cos(rwy.th) - dy * Math.sin(rwy.th); return Math.abs(al) < rwy.L / 2 + 60 && Math.abs(sd) < 30; };

  // ---- пилотажная зона: кольца над озером напротив Чолпон-Аты -- слалом, «горка» вверх и пике к воде ----
  function course() { const pts = [], X0 = -9000, Y0 = -3500;
    const alt = [180, 120, 260, 90, 140, 1100, 160, 70, 300, 120];
    for (let i = 0; i < 10; i++) { const X = X0 + i * 1900, Y = Y0 - Math.sin(i * 1.1) * 900 - (i === 5 ? 0 : 0); pts.push({ X, Y, Z: alt[i] }); }
    return pts; }
  function ringMesh() { const m = new THREE.Mesh(new THREE.TorusGeometry(38, 2.2, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, fog: false })); scene.add(m); m.visible = false; return m; }

  // ---- катапульта: купол с лётчиком; взрыв -- огненный шар и дым ----
  function makeChute() { const g = new THREE.Group(), dome = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, roughness: 0.8 }));
    dome.position.y = 7; g.add(dome); const stripe = new THREE.Mesh(new THREE.SphereGeometry(4.02, 16, 3, 0, Math.PI * 2, 0.55, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })); stripe.position.y = 7; g.add(stripe);
    const lm = new THREE.LineBasicMaterial({ color: 0x333333 }); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, ge = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(Math.cos(a) * 3.6, 7.6, Math.sin(a) * 3.6)]); g.add(new THREE.Line(ge, lm)); }
    const pilot = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x4a5a3a })); pilot.position.y = 0.4; g.add(pilot);
    const hel = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); hel.position.y = 1.1; g.add(hel); g.visible = false; scene.add(g); return g; }
  function makeBoom() { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m);
    const smoke = Array.from({ length: 10 }, () => { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0x55504a, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); return s; }); return { m, smoke, t: 0 }; }
  // ---- инверсионные следы с законцовок при большой перегрузке ----
  function makeTrails() { const N = 50, mk = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); l.frustumCulled = false; scene.add(l); return l; };
    return { L: mk(), R: mk(), N, n: 0, on: 0 }; }

  function build() { if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'jwrap'; w.hidden = true; w.innerHTML = '<canvas id="jhorizon"></canvas><div id="jhud" class="hud"></div><div id="jwarn" class="hud" hidden></div><div id="jring" class="hud" hidden></div>'; $('game').appendChild(w);
    hzc = $('jhorizon'); hz = hzc.getContext('2d');
    J = new Jet(); M = makeJet(); scene.add(M.root); M.root.visible = false;
    rwy = findRunway(); rwy.mesh = runwayMesh(rwy); scene.add(rwy.mesh); rwy.mesh.visible = false;
    rings = course().map((p) => ({ ...p, m: ringMesh() }));
    rings.forEach((r, i) => { const a = rings[i - 1] || r, b = rings[i + 1] || r; r.m.position.set(r.X, r.Z, -r.Y); r.m.lookAt(r.X + (b.X - a.X), r.Z + (b.Z - a.Z) * 0.5, -(r.Y + (b.Y - a.Y))); }); chute = makeChute(); boom = makeBoom(); trails = makeTrails();
    // «игрок» для главного цикла: свет и вода смотрят на G.player.b
    P = { id: 'jet', name: 'Вы', b: { X: 0, Y: 0, th: 0, speed: 0, base: 0, y: 0, tws: 0, vx: 0, vy: 0 }, model: { root: M.root, fp: M.fp }, wake: { pts: [], mesh: { visible: false }, reset() {}, update() {} }, time: 0, leg: 0 }; }

  function begin() { build(); if (!on) prev = G.player; on = true; for (const k in G.marks || {}) G.marks[k].visible = false;
    if (prev && prev.model && prev.model.root) prev.model.root.visible = false; if (prev && prev.wake && prev.wake.mesh) prev.wake.mesh.visible = false;
    G.player = P; G.race = null; G.mode = 'jet'; M.root.visible = true; rwy.mesh.visible = true; chute.visible = false; boom.m.visible = false; for (const r of rings) r.m.visible = false;
    document.body.classList.add('jet'); document.body.classList.remove('motor', 'para'); $('jwrap').hidden = false; $('ts').textContent = 'максимал'; $('mark').hidden = true; $('result').hidden = true; $('brief').hidden = true;
    F = { t: 0, loop: { s: 0, t: 0 }, roll: { a: 0, t: 0 }, lowT: 0, ended: false, ejT: -1, landT: 0, msg: {}, gearK: 1, apprMsg: false }; R = null; showGame(true); resetView(); G.cam = G.cam === 2 ? 0 : G.cam; trails.n = 0; }
  function startFree() { begin(); const s = -rwy.L / 2 + 80, X = rwy.X + Math.sin(rwy.th) * s, Y = rwy.Y + Math.cos(rwy.th) * s; J.reset(X, Y, Math.max(0, HG(X, Y)), rwy.th, 'ground'); J.gear = true;
    toast('Як-130 на полосе. Пробел — максимал, на 210 км/ч — ↓ на себя'); F.free = true; }
  function startRace() { begin(); const r0 = rings[0], r1 = rings[1], th = Math.atan2(r1.X - r0.X, r1.Y - r0.Y), X = r0.X - Math.sin(th) * 4500, Y = r0.Y - Math.cos(th) * 4500;
    J.reset(X, Y, 450, th, 'air', 185); J.gear = false; F.gearK = 0; R = { next: 0, t: 0, miss: 0, best: store.get('jetBest') };
    for (const r of rings) { r.m.visible = true; r.prev = undefined; r.m.material.color.setHex(0xff8a2a); r.m.material.opacity = 0.9; } toast('Пилотажная зона: пройдите 10 колец. Шестое — высоко, за ним — пике к воде'); }
  function stop() { if (!on) return; on = false; M.root.visible = false; rwy.mesh.visible = false; chute.visible = false; boom.m.visible = false; for (const s of boom.smoke) s.visible = false; for (const r of rings) r.m.visible = false; trails.L.visible = trails.R.visible = false;
    document.body.classList.remove('jet'); $('jwrap').hidden = true; camera.up.set(0, 1, 0); $('hint').hidden = true; $('mark').hidden = true; $('ts').textContent = 'шкот'; $('ragain').textContent = 'Ещё гонка'; audio.jet && audio.jet(0, 0, false); audio.airflow(0, 0, 0, false); if (prev) G.player = prev; R = null; F = null; }

  // ---- управление ----
  function ctl() { let roll = (input.right ? 1 : 0) - (input.left ? 1 : 0), pitch = (input.flare ? 1 : 0) - (input.sin ? 1 : 0);
    if (input.joy) { const j = input.joy; roll = Math.abs(j.x) > 0.08 ? j.x : 0; pitch = Math.abs(j.y) > 0.08 ? j.y : 0; } // джойстик: вниз -- на себя
    // граница зоны полётов: автоматика уводит в разворот к озеру
    const m = 4000, out = J.X < FAR.X0 + m || J.X > FAR.X0 + (FAR.W - 1) * FAR.STEP - m || J.Y > FAR.Y1 - m || J.Y < FAR.Y1 - (FAR.H - 1) * FAR.STEP + m;
    if (out && J.mode === 'air') { const want = Math.atan2(-J.X, -12000 - J.Y), d = wrapPi(want - J.th); roll = clamp(d * 2 - J.phi, -1, 1); if (!F.msg.out) { F.msg.out = 1; toast('Граница зоны полётов — разворот к озеру'); } } else F.msg.out = 0;
    // заход: снижаемся к полосе, курс вдоль неё и на неё, после взлёта прошло время -- автоматика выпускает шасси
    const dR = Math.hypot(J.X - rwy.X, J.Y - rwy.Y), da = Math.abs(wrapPi(J.th - rwy.th)), al = Math.min(da, Math.PI - da), to = Math.abs(wrapPi(Math.atan2(rwy.X - J.X, rwy.Y - J.Y) - J.th));
    const appr = J.mode === 'air' && F.airT > 25 && dR < 9000 && (J.agl || 0) < 500 && J.vz < -1 && al < 0.5 && (to < 0.5 || dR < 1200);
    return { roll, pitch, max: !!input.bar, brake: !!input.shift || (J.mode === 'ground' && F.landed), Vset: J.gear && J.mode === 'air' ? 74 : YAK.cruise, appr }; }

  function tick(dt) { if (!on) return; F.t += dt;
    if (J.mode === 'crash') { crashTick(dt); return; }
    if (J.mode === 'air') F.airT = (F.airT || 0) + dt; else F.airT = 0;
    const c = ctl(); const steps = Math.max(1, Math.ceil(dt / (1 / 120))); for (let i = 0; i < steps; i++) J.step(dt / steps, c, HG, onRunway);
    // шасси: автоматика -- выпущено на земле и на заходе у полосы, убрано после отрыва
    const gearWant = J.mode === 'ground' || (c.appr && J.V < 125) || (J.agl < 60 && J.vz < 2 && J.V < 100);
    if (gearWant !== J.gear) { J.gear = gearWant; if (J.mode === 'air') toast(J.gear ? 'Шасси выпущено · автомат тяги 270 км/ч — заход' : 'Шасси убрано'); }
    F.gearK += ((J.gear ? 1 : 0) - F.gearK) * Math.min(1, dt * 1.2);
    if (J.liftoff) { J.liftoff = false; ach('jt_takeoff'); toast('Отрыв! Шасси уберётся само'); }
    if (J.mode === 'ground' && J.touch) { const t = J.touch; J.touch = null; F.landed = true; F.landVz = t.vz; if (t.rwy) { toast(-t.vz < 1.5 ? 'Касание — как по маслу!' : 'Касание. Тормозим'); } else toast('Сели на грунт — смело!'); }
    if (F.landed && J.mode === 'ground' && J.V < 1 && !F.ended) finish('land');
    if (J.mode === 'crash') { J.crash.t = 0; startCrash(); return; }
    track(dt, c); if (R) raceTick(dt);
    const b = P.b; b.X = J.X; b.Y = J.Y; b.th = J.th; b.speed = J.V; b.base = J.Z; b.y = J.Z; }

  // достижения: петля, бочка, тысяча, 8g, бреющий, потолок
  function track(dt, c) { if (J.mode !== 'air') return; const l = F.loop, uw = J.u[2], fz = J.f[2];
    l.t += dt; if (l.s === 0 && fz > 0.85) { l.s = 1; l.t = 0; l.th = J.th; } else if (l.s === 1 && uw < -0.6) l.s = 2; else if (l.s === 2 && fz < -0.85) l.s = 3; else if (l.s === 3 && Math.abs(fz) < 0.3 && uw > 0.7) { l.s = 0; ach('jt_loop'); toast('Петля Нестерова!'); audio.chime && audio.chime(); }
    if (l.t > 30) l.s = 0;
    const r = F.roll; if (Math.abs(c.roll) > 0.5 && Math.abs(fz) < 0.5) { r.a += (J.p || 0) * dt; r.t = 0; if (Math.abs(r.a) > Math.PI * 2 - 0.2) { r.a = 0; ach('jt_roll'); toast('Бочка!'); } } else if ((r.t += dt) > 1) r.a = 0;
    if (J.V * 3.6 >= 1000) ach('jt_1000'); if (J.n >= 7.9) ach('jt_8g'); if (J.Z + 1601 >= 12000) ach('jt_ceiling');
    if (J.agl < 30 && H(J.X, J.Y) < -2 && J.V * 3.6 > 600) { F.lowT += dt; if (F.lowT > 10) ach('jt_low'); } else F.lowT = 0; }

  function raceTick(dt) { R.t += dt; const r = rings[R.next]; if (!r) return; P.time = R.t;
    // пролёт плоскости кольца: знак проекции на направление кольца сменился
    const nx = r.nx ?? (r.nx = (rings[R.next + 1] || r).X - (rings[R.next - 1] || r).X), ny = r.ny ?? (r.ny = (rings[R.next + 1] || r).Y - (rings[R.next - 1] || r).Y), nl = Math.hypot(nx, ny) || 1;
    const s = ((J.X - r.X) * nx + (J.Y - r.Y) * ny) / nl; if (r.prev !== undefined && r.prev < 0 && s >= 0) { const d = Math.hypot(J.X - r.X - nx / nl * s, J.Y - r.Y - ny / nl * s, J.Z - r.Z);
      if (d < 40) { R.next++; audio.find ? audio.find(R.next >= 8 ? 4 : 1, R.next) : audio.chime(); r.m.material.color.setHex(0x55dd77); r.m.material.opacity = 0.35; if (R.next >= rings.length) finish('rings'); }
      else { R.miss++; toast(`Мимо кольца ${R.next + 1} на ${Math.round(d - 38)} м — разворот и ещё раз`); } }
    r.prev = s; }

  function startCrash() { const c = J.crash; F.ejT = 0; chute.visible = true; chute.position.set(J.X, J.Z + 2, -J.Y); chute.userData.v = 28; chute.scale.setScalar(0.2);
    boom.t = 0; boom.m.visible = true; boom.m.position.set(J.X, J.Z + 2, -J.Y); M.root.visible = false; trails.L.visible = trails.R.visible = false;
    if (c.water && G.spray) for (let i = 0; i < 40; i++) G.spray.emit(J.X, 0.5, -J.Y, (Math.random() - 0.5) * 20, 6 + Math.random() * 14, (Math.random() - 0.5) * 20, 3, 1, 1);
    boom.smoke.forEach((s, i) => { s.visible = !c.water; s.position.set(J.X + (Math.random() - 0.5) * 8, J.Z + 2 + i * 1.5, -J.Y + (Math.random() - 0.5) * 8); s.userData.t = -i * 0.15; });
    audio.pop && audio.pop(1.6); audio.thump && audio.thump(1.5); G.shake = 1.4; ach('jt_eject'); toast('Катапультирование! К-36 сработало — лётчик под куполом'); }
  function crashTick(dt) { F.ejT += dt; boom.t += dt; const k = Math.min(1, boom.t / 0.6); boom.m.scale.setScalar(4 + 18 * k); boom.m.material.opacity = 0.85 * (1 - k); if (k >= 1) boom.m.visible = false;
    for (const s of boom.smoke) if (s.visible) { s.userData.t += dt; const t = Math.max(0, s.userData.t); s.scale.setScalar(3 + t * 4); s.position.y += dt * 4; s.material.opacity = Math.max(0, 0.5 - t * 0.06); }
    // кресло выстреливает вверх, купол раскрывается и тихо спускается
    const v = chute.userData.v; chute.userData.v = Math.max(-4, v - 14 * dt); chute.position.y = Math.max(H(J.X, J.Y) > 0 ? H(J.X, J.Y) : 0, chute.position.y + chute.userData.v * dt); chute.scale.setScalar(Math.min(1, 0.2 + F.ejT * 0.8));
    chute.position.x += G.wind.sx * dt * 0.5; chute.position.z -= G.wind.sy * dt * 0.5; chute.rotation.z = Math.sin(F.ejT * 1.3) * 0.08;
    if (F.ejT > 9 && !F.ended) finish('crash'); }

  function finish(kind) { if (F.ended) return; F.ended = true;
    let h = '', s = '';
    if (kind === 'land') { const vz = -(F.landVz || 0), onR = onRunway(J.X, J.Y); h = onR ? (vz < 1.5 ? 'Посадка на отлично' : vz < 3 ? 'Посадка' : 'Жёсткая посадка') : 'Посадка вне полосы'; s = `Вертикальная скорость касания ${vz.toFixed(1)} м/с · в воздухе ${fmt(F.t)}`; if (onR) ach('jt_land'); if (onR && vz < 1.5) ach('jt_butter'); }
    else if (kind === 'crash') { h = 'Катапультировался'; s = `${J.crash.water ? 'Самолёт в озере' : 'Самолёт потерян'}, лётчик цел. В Армавире бы сказали: «Земля не прощает»`; }
    else if (kind === 'rings') { const t = R.t, best = R.best, rec = !best || t < best; if (rec) store.set('jetBest', t); const medal = t < 95 ? '🥇' : t < 120 ? '🥈' : '🥉';
      h = `${medal} Пилотажная зона`; s = `Время ${fmt(t)}${R.miss ? ` · промахов ${R.miss}` : ''}${rec ? ' · личный рекорд' : ` · рекорд ${fmt(best)}`}`; ach('jt_rings'); if (t < 95) ach('jt_gold'); }
    $('rh').textContent = h; $('rs').textContent = s; $('rt').innerHTML = ''; $('ragain').textContent = R ? 'Ещё раз' : 'Ещё полёт'; setTimeout(() => { if (on) $('result').hidden = false; }, kind === 'rings' ? 600 : 1200); }

  // ---- камера: за самолётом по скорости, горизонт наполовину кренится с ним; из кабины -- через фонарь ----
  let camInit = false;
  function cam(dt) { if (camera.view && camera.view.enabled) camera.clearViewOffset(); // меню сдвигает кадр -- в полёте кадр по центру
    const pos = T3([J.X, J.Y, J.Z + 1.8]), f = T3(J.f), u = T3(J.u), r = T3(J.r);
    m4.makeBasis(r, u, f.clone().negate()); M.root.quaternion.setFromRotationMatrix(m4); M.root.position.copy(pos); M.setGear(F ? F.gearK : 1); M.setThrust(J.thr);
    if (J.mode === 'crash') { const c = chute.position; v3.set(c.x + 30, c.y + 10, c.z + 30); camera.position.lerp(v3, Math.min(1, dt * 2)); camera.up.set(0, 1, 0); camera.lookAt(c.x, c.y + 3, c.z); camera.fov += (55 - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix(); M.fp(false); return; }
    M.fp(G.cam === 1);
    if (G.cam === 1) { camera.position.copy(pos).addScaledVector(f, 2.3).addScaledVector(u, 1.12); camera.up.copy(u); m4.makeBasis(r, u, f.clone().negate()); camera.quaternion.setFromRotationMatrix(m4); camera.rotateY(-G.orbit); camera.rotateX(-0.06 - G.orbitP * 0.8);
      camera.fov += (clamp(70 * G.zoom, 35, 95) + J.V * 0.03 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); return; }
    const far = G.cam === 2, d = (far ? 70 : 19 + J.V * 0.035) * G.zoom, upB = far ? 0.15 : 0.5;
    const UP = new THREE.Vector3(0, 1, 0), cu = UP.clone().lerp(u, upB).normalize(); // «верх» камеры -- между небом и кабиной: крен чувствуется, а горизонт не кувыркается
    // позиция -- жёстко от самолёта (на 250 м/с любое запаздывание уносит его из кадра), сглаживается только направление
    if (!camInit) { clook.copy(f); cup.copy(cu); camInit = true; } else { clook.lerp(f, Math.min(1, dt * 5)).normalize(); cup.lerp(cu, Math.min(1, dt * 4)).normalize(); }
    const back = clook.clone().applyAxisAngle(cup, G.orbit).negate();
    v3.copy(pos).addScaledVector(back, d).addScaledVector(cup, d * (far ? 0.35 : 0.18) + G.orbitP * d);
    const gy = Math.max(0, H(v3.x, -v3.z)) + 3; if (v3.y < gy) v3.y = gy;
    G.shake = Math.max(0, G.shake - dt * 1.4); const sh = G.shake * G.shake + Math.max(0, J.n - 5) * 0.004 + (J.V > 260 ? 0.002 : 0), jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    camera.position.copy(v3); camera.position.x += jx; camera.position.y += jy; camera.up.copy(cup); camera.lookAt(cpos.copy(pos).addScaledVector(clook, 14).addScaledVector(cup, 1.5));
    camera.fov += (58 + Math.max(0, J.V - 120) * 0.05 - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix(); }
  function resetCam() { camInit = false; camera.up.set(0, 1, 0); }

  // ---- приборы ----
  let hudT = 0;
  function hud(dt) { if (!on) return; if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
    pointMark(); drawHorizon(); trailsTick(dt);
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const kmh = Math.round(J.V * 3.6), alt = Math.round(J.Z + 1601), agl = Math.round(J.agl || 0);
    $('jhud').innerHTML = `<div><b class="v">${kmh}</b><small>км/ч</small><span class="thr${J.max ? ' max' : ''}">${J.max ? 'МАКСИМАЛ' : J.brake ? 'ЩИТКИ' : J.mode === 'ground' ? 'РУД ' + Math.round(J.thr * 100) + '%' : 'АВТОМАТ'}</span></div>
      <div class="r"><b>${alt}</b> м над морем · ${agl} м над землёй</div><div class="r"><span class="g">M ${J.mach.toFixed(2)}</span> <span class="g"><b>${J.n.toFixed(1)}</b> g</span> ${J.gear ? '· шасси ⬇' : ''}</div>${R ? '' : ''}`;
    const w = J.mode === 'crash' ? '' : J.stall ? 'СВАЛИВАНИЕ — ОТДАЙ РУЧКУ' : J.gpws && !J.gear ? 'ВЫВОД! ЗЕМЛЯ' : J.n > 7.6 ? 'ПРЕДЕЛ ПЕРЕГРУЗКИ' : '';
    const wl = $('jwarn'); if (wl.textContent !== w) wl.textContent = w; wl.hidden = !w; if (w && audio.beep && G.frame % 18 === 0) audio.beep(true);
    const rr = $('jring'); if (R) { rr.hidden = false; rr.innerHTML = `<b>${fmt(R.t)}</b><br>кольцо ${Math.min(R.next + 1, rings.length)} из ${rings.length}${R.best ? ` · рекорд ${fmt(R.best)}` : ''}`; } else rr.hidden = true;
    const hint = J.mode === 'ground' && !F.landed ? (J.V < 3 ? (TOUCH ? 'Кнопка «максимал» — разбег' : 'Пробел — максимал: разбег') : J.V < YAK.Vr ? `Разбег… отрыв на ${Math.round(YAK.Vr * 3.6)} км/ч` : (TOUCH ? 'Джойстик вниз — на себя!' : '↓ — на себя: отрыв!'))
      : J.mode === 'air' && F.t < 40 && F.free ? (TOUCH ? 'Джойстик — ручка (вниз — на себя) · отпустил — автоматика держит' : '← → крен · ↓ на себя, ↑ от себя · отпустил — автомат держит · Пробел — максимал · Shift — щитки') : '';
    const he = $('hint'); if (he.textContent !== hint) he.textContent = hint; he.hidden = !hint; he.className = 'hud'; }
  // ИЛС из кабины: линия горизонта и «птичка» вектора скорости, лестница тангажа -- зелёным, как на настоящем
  function drawHorizon() { const W = window.innerWidth, Hh = window.innerHeight; if (hzc.width !== W || hzc.height !== Hh) { hzc.width = W; hzc.height = Hh; } hz.clearRect(0, 0, W, Hh);
    const show = G.cam === 1 && J.mode !== 'crash'; hzc.style.display = show ? '' : 'none'; if (!show) return; const ph = J.phi, gm = J.gamma, k = Hh / (camera.fov * Math.PI / 180);
    hz.save(); hz.translate(W / 2, Hh / 2); hz.rotate(-ph); hz.strokeStyle = 'rgba(120,255,150,.85)'; hz.fillStyle = hz.strokeStyle; hz.lineWidth = 2; hz.font = '600 12px sans-serif';
    for (let a = -60; a <= 60; a += 10) { const y = (gm - a * Math.PI / 180) * k * -1 * -1; const yy = (a * Math.PI / 180 - gm) * -k; if (Math.abs(yy) > Hh) continue; const L = a === 0 ? W * 0.35 : 60; hz.setLineDash(a < 0 ? [8, 6] : []); hz.beginPath(); hz.moveTo(-L, yy); hz.lineTo(-24, yy); hz.moveTo(24, yy); hz.lineTo(L, yy); hz.stroke(); if (a) { hz.fillText(String(a), L + 6, yy + 4); } void y; }
    hz.restore(); hz.setLineDash([]); hz.strokeStyle = 'rgba(120,255,150,.95)'; hz.lineWidth = 2; hz.beginPath(); hz.arc(W / 2, Hh / 2, 8, 0, 7); hz.moveTo(W / 2 - 22, Hh / 2); hz.lineTo(W / 2 - 8, Hh / 2); hz.moveTo(W / 2 + 8, Hh / 2); hz.lineTo(W / 2 + 22, Hh / 2); hz.moveTo(W / 2, Hh / 2 - 8); hz.lineTo(W / 2, Hh / 2 - 16); hz.stroke(); }
  // маркер цели: следующее кольцо или полоса
  function pointMark() { const mk = $('mark'); let tg = null, lab = '';
    if (R && rings[R.next]) { const r = rings[R.next]; tg = [r.X, r.Y, r.Z]; lab = `кольцо ${R.next + 1}`; } else if (F.free && J.mode === 'air' && F.t > 20) { tg = [rwy.X, rwy.Y, Math.max(0, H(rwy.X, rwy.Y)) + 10]; lab = 'полоса'; }
    if (!tg || J.mode === 'crash') { mk.hidden = true; return; } const w = window.innerWidth, hh = window.innerHeight; v3.set(tg[0], tg[2], -tg[1]).project(camera); const behind = v3.z > 1;
    let mx = (v3.x * 0.5 + 0.5) * w, my = (1 - (v3.y * 0.5 + 0.5)) * hh; if (behind) { mx = w - mx; my = hh * 0.5; mx = mx < w / 2 ? 0 : w; }
    const cx = clamp(mx, 74, w - 74), cy = clamp(my, 150, hh - 150), off = behind || cx !== mx || cy !== my; mk.hidden = false; mk.className = 'hud' + (off ? ' off' : ''); mk.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-100%)`;
    if (G.frame % 6 === 0) { const d = Math.hypot(tg[0] - J.X, tg[1] - J.Y), t = `${off && cx < w / 2 ? '◀ ' : ''}${lab} · ${d >= 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'}${off && cx > w / 2 ? ' ▶' : ''}`; if ($('markd').textContent !== t) $('markd').textContent = t; } }
  // следы с законцовок: при перегрузке больше 4.5 или на большой скорости у воды (влажно)
  function trailsTick(dt) { const want = J.mode === 'air' && (J.n > 4.5 || (J.agl < 80 && J.V > 220)); trails.on += ((want ? 1 : 0) - trails.on) * Math.min(1, dt * 4);
    const vis = trails.on > 0.05 && G.cam !== 1; trails.L.visible = trails.R.visible = vis; if (!vis) { trails.n = 0; return; }
    const N = trails.N; for (const [L, sx] of [[trails.L, -1], [trails.R, 1]]) { const a = L.geometry.attributes.position.array; a.copyWithin(3, 0, (N - 1) * 3);
      const p = [J.X + J.r[0] * 4.9 * sx, J.Y + J.r[1] * 4.9 * sx, J.Z + 1.8 + J.r[2] * 4.9 * sx]; a[0] = p[0]; a[1] = p[2]; a[2] = -p[1]; if (trails.n < N) for (let i = 1; i < N; i++) { a[i * 3] = a[0]; a[i * 3 + 1] = a[1]; a[i * 3 + 2] = a[2]; }
      L.geometry.attributes.position.needsUpdate = true; L.material.opacity = 0.65 * trails.on; } trails.n = N; }

  function sound() { if (!on) return; audio.jet && audio.jet(J.mode === 'crash' ? 0 : J.thr, J.V, J.mode !== 'crash'); audio.airflow(Math.min(60, J.V * 0.12), J.n > 5 ? 0.4 : 0, 0, J.mode === 'air'); }

  return { _F: () => F, get on() { return on; }, get jet() { return J; }, get runway() { return rwy; }, get rings() { return rings; }, startFree, startRace, stop, tick, camera: cam, hud, sound, resetCam,
    restart() { if (R) startRace(); else startFree(); }, again() { $('result').hidden = true; if (R) startRace(); else startFree(); } };
}
