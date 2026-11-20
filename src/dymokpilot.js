// Дымок в ведёрке под парапланом, вид со спины. Гибрид: позы -- кадры из спрайт-листа автора (dymokpara.js),
// а всё, что должно жить непрерывно, -- процедурно поверх: хвост шарфа (цепочка с инерцией, её треплет поток),
// крен и раскачка ведёрка (пружина с запаздыванием), подъём в термике, дрожь в болтанке.
// Состояние выбирается по настоящему полёту (тормоза, крен, вариометр, порыв, турбулентность), с приоритетами
// и минимальным временем удержания -- позы не мигают. Физику, управление и камеру модуль не трогает.
import * as THREE from 'three';
import { DPARA } from './dymokpara.js';

const IMG = typeof Image !== 'undefined' ? new Image() : null; if (IMG) IMG.src = DPARA.png;
const F = DPARA.frames, CW = 128, CH = 112, AX = 64, AY = 104, PXM = 0.032; // холст кадра; опора -- дно ведёрка; метров на пиксель
const SEQ = { idle: ['idle0', 'idle1', 'idle2', 'idle3'], fly: ['cycle0', 'cycle1', 'cycle2', 'cycle3', 'cycle4', 'cycle5', 'cycle6', 'cycle7'], sway: ['walk0', 'walk1', 'walk2', 'walk3'],
  left: ['left0', 'left1', 'left2'], right: ['right0', 'right1', 'right2'], pullL: ['act0'], pullR: ['act1'], brake: ['act2'], thermal: ['act3'], gust: ['act4'], turb: ['act5'], jump: ['act6'],
  happy: ['mood0'], sad: ['mood2'] };
// вид спереди: те же состояния, кадры с лицом (шарф на них уже нарисован)
const FRONT = { idle: ['front0', 'front11'], fly: ['front0', 'front11'], sway: ['front0', 'front11'], left: ['front5'], right: ['front4'], pullL: ['front5'], pullR: ['front4'],
  brake: ['front2'], thermal: ['front3'], gust: ['front8'], turb: ['front6'], jump: ['front7'], happy: ['front9'], sad: ['front10'] };
// приоритеты: чем выше, тем важнее; удержание -- чтобы поза не мигала
const PRI = { happy: 9, jump: 8, turb: 7, gust: 6, brake: 5, pullL: 4, pullR: 4, left: 3, right: 3, thermal: 2, sad: 2, fly: 1, sway: 1, idle: 0 };
const N = 10, SEG = 5; // шарф: узлы цепочки, длина звена в пикселях кадра
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeDymokPilot() {
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const cx = cv.getContext('2d');
  const rb = document.createElement('canvas'); rb.width = CW; rb.height = CH; const rx = rb.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3 }), spr = new THREE.Sprite(mat);
  spr.scale.set(CW * PXM, CH * PXM, 1); spr.center.set(AX / CW, 1 - AY / CH);
  const S = { st: 'fly', hold: 0, fi: 0, ft: 0, happyT: 0, jumpT: 0, prevMode: '', rot: 0, rotV: 0, lift: 0, liftV: 0, side: -1, sideU: 0, prevVz: 0, ay: 0, prevTh: null, yaw: 0, shake: 0 };
  // цепочка шарфа в координатах холста
  const P = Array.from({ length: N }, (_, i) => ({ x: AX - 20 - i * SEG, y: 50 + i, px: AX - 20 - i * SEG, py: 50 + i }));
  let frameKey = 'cycle0', front = false; const cam = new THREE.Vector3(), me = new THREE.Vector3();
  spr.onBeforeRender = (r, sc, camera) => { cam.copy(camera.position); }; // откуда смотрят -- чтобы повернуть Дымка как параплан

  function choose(g, dt) {
    const air = g.mode === 'air', L = g.L || 0, R = g.R || 0, d = R - L, bank = g.phi || 0, gust = g.gustFx || 0, turb = g.turb || 0, v = g.vario || 0;
    if (S.prevMode && S.prevMode !== 'air' && air) S.jumpT = 0.9; // отрыв от склона
    S.prevMode = g.mode;
    let want;
    if (S.happyT > 0) want = 'happy';
    else if (S.jumpT > 0) want = 'jump';
    else if (!air) want = g.mode === 'landed' ? 'idle' : 'sway';
    else if (turb > 0.85 || g.col || g.front) want = 'turb';
    else if (gust > 0.5) want = 'gust';
    else if (Math.min(L, R) > 0.5 || g.stall) want = 'brake';
    else if (d < -0.55) want = 'pullL'; else if (d > 0.55) want = 'pullR';
    else if (d < -0.12 || bank < -0.22) want = 'left'; else if (d > 0.12 || bank > 0.22) want = 'right';
    else if (v > 1.8) want = 'thermal'; else if (v < -2.6) want = 'sad';
    else want = 'fly';
    S.hold -= dt;
    if (want !== S.st && (S.hold <= 0 || PRI[want] > PRI[S.st])) { S.st = want; S.hold = 0.35; S.fi = 0; S.ft = 0; }
    // кадр внутри состояния: поворот -- по силе, остальное -- по кругу, темп от скорости
    const seq = (front ? FRONT : SEQ)[S.st];
    if ((S.st === 'left' || S.st === 'right') && !front) S.fi = Math.min(seq.length - 1, Math.floor(clamp(Math.abs(d) * 3 + Math.abs(bank) * 2.2, 0, 2.99)));
    else { const fps = S.st === 'fly' ? 3 + (g.V || 10) * 0.25 : S.st === 'idle' ? 2.5 : 4; S.ft += dt * fps; if (S.ft >= 1) { S.ft -= 1; S.fi = (S.fi + 1) % seq.length; } }
    return seq[S.fi % seq.length];
  }

  function scarf(g, dt, f) {
    // корень: узел на шее, с той стороны, куда уходит хвост; при смене стороны корень переезжает по узлу плавно
    const k = (F[f] ? F[f] : F.cycle0), ox = AX - k[4], oy = AY - k[5];
    const Lr = k[6] !== null ? [k[6] + ox, k[7] + oy] : null, Rr = k[8] !== null ? [k[8] + ox, k[9] + oy] : null;
    const rl = Lr || (Rr ? [2 * AX - Rr[0], Rr[1]] : [AX - 18, 50]), rr = Rr || [2 * AX - rl[0], rl[1]];
    // куда уносит: поворот вправо -- поток заходит справа, хвост уходит влево; порыв и болтанка добавляют рывки
    const yaw = S.yaw, sideT = Math.abs(yaw) > 0.08 ? -Math.sign(yaw) : S.side; S.side = sideT;
    S.sideU += ((S.side > 0 ? 1 : 0) - S.sideU) * Math.min(1, dt * 2.5);
    const root = [rl[0] + (rr[0] - rl[0]) * S.sideU, rl[1] + (rr[1] - rl[1]) * S.sideU], sd = S.sideU * 2 - 1;
    const V = g.mode === 'air' ? (g.V || 10) : 2, gust = g.gustFx || 0, turb = g.turb || 0, t = performance.now() / 1000;
    const flow = 18 + V * 5.5 + gust * 60, h = dt * dt;
    const ay = S.ay; // рывок вверх -- шарф отстаёт вниз
    P[0].x = root[0]; P[0].y = root[1]; P[0].px = root[0]; P[0].py = root[1];
    for (let i = 1; i < N; i++) { const p = P[i], s = i / (N - 1);
      // поток: назад-в сторону и чуть вниз; трепет -- бегущая волна поперёк, сильнее к концу и в порыв
      const wave = Math.sin(t * (9 + V * 0.6 + gust * 8) - i * 0.9) * (14 + V * 2.2 + gust * 70 + turb * 40) * s;
      let fx = sd * flow + (Math.random() - 0.5) * turb * 160 * s, fy = flow * 0.1 + 14 + wave + ay * 6 + (Math.random() - 0.5) * gust * 120 * s;
      fx -= yaw * 140 * s; // в повороте ткань отстаёт по инерции
      const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9; p.px = p.x; p.py = p.y; p.x += vx + fx * h; p.y += vy + fy * h; }
    for (let it = 0; it < 4; it++) for (let i = 1; i < N; i++) { const a = P[i - 1], b = P[i], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-3, e = (l - SEG) / l;
      if (i === 1) { b.x -= dx * e; b.y -= dy * e; } else { a.x += dx * e * 0.5; a.y += dy * e * 0.5; b.x -= dx * e * 0.5; b.y -= dy * e * 0.5; } }
    for (const p of P) { p.x = clamp(p.x, 1, CW - 2); p.y = clamp(p.y, 1, CH - 2); }
    // рисуем лентой: контур, ткань, светлая кромка; край -- порогом альфы, чтобы остался пиксельным
    rx.clearRect(0, 0, CW, CH); rx.lineCap = 'round'; rx.lineJoin = 'round';
    const band = (wid, col) => { rx.strokeStyle = col; for (let i = 1; i < N; i++) { rx.lineWidth = wid * (1 - 0.55 * i / N); rx.beginPath(); rx.moveTo(P[i - 1].x, P[i - 1].y); rx.lineTo(P[i].x, P[i].y); rx.stroke(); } };
    band(11, '#5a1a22'); band(8, '#e2453a'); rx.translate(0, -1.5); band(2.5, '#ff8a6e'); rx.setTransform(1, 0, 0, 1, 0, 0);
    const id = rx.getImageData(0, 0, CW, CH), dd = id.data; for (let q = 3; q < dd.length; q += 4) dd[q] = dd[q] > 120 ? 255 : 0; rx.putImageData(id, 0, 0);
  }

  return {
    sprite: spr,
    happy(sec = 1.6) { S.happyT = Math.max(S.happyT, sec); },
    // g -- состояние параплана; near -- близко к камере (процедурный шарф и перерисовка каждый кадр)
    update(g, dt, near = true) {
      dt = Math.min(dt, 0.05); S.happyT -= dt; S.jumpT -= dt;
      if (S.prevTh !== null) { let dth = (g.th || 0) - S.prevTh; dth = Math.atan2(Math.sin(dth), Math.cos(dth)); S.yaw += (dth / Math.max(dt, 1e-3) - S.yaw) * Math.min(1, dt * 3); } S.prevTh = g.th || 0;
      // спереди или сзади: по тому, куда смотрит крыло относительно камеры (с запасом, чтобы на боку не мигало)
      spr.getWorldPosition(me); const fx = Math.sin(g.th || 0), fz = -Math.cos(g.th || 0), dx = me.x - cam.x, dz = me.z - cam.z, dl = Math.hypot(dx, dz) || 1, dot = (fx * dx + fz * dz) / dl;
      if (front && dot > 0.2) front = false; else if (!front && dot < -0.2) front = true;
      const f = choose(g, dt), k = F[f] || F.cycle0;
      // ведёрко: крен за креном крыла и тормозами -- пружиной, с запаздыванием и лёгким перехлёстом
      const air = g.mode === 'air', tr = air ? -(g.phi || 0) * 0.45 - ((g.R || 0) - (g.L || 0)) * 0.12 : 0, turb = g.turb || 0;
      S.shake += (Math.random() - 0.5) * turb * 60 * dt; S.shake *= Math.exp(-dt * 9);
      S.rotV += ((tr + S.shake - S.rot) * 38 - S.rotV * 6.5) * dt; S.rot += S.rotV * dt; mat.rotation = front ? -S.rot : S.rot; // спереди крен виден зеркально
      // подъём: в термике чуть выше, рывок вверх -- проседание с отдачей; лёгкое покачивание всегда
      const ay = clamp(((g.vz || 0) - S.prevVz) / Math.max(dt, 1e-3), -6, 6); S.prevVz = g.vz || 0; S.ay = ay;
      const lt = (air ? clamp((g.vario || 0) * 0.025, -0.05, 0.08) : 0) - ay * 0.012;
      S.liftV += ((lt - S.lift) * 30 - S.liftV * 6) * dt; S.lift += S.liftV * dt;
      spr.position.y = S.lift + Math.sin(performance.now() / 1000 * 2.3) * 0.025;
      if (!near) { if (f === frameKey) return; }
      frameKey = f; if (!IMG || !IMG.complete) return;
      cx.clearRect(0, 0, CW, CH); cx.imageSmoothingEnabled = false;
      cx.drawImage(IMG, k[0], k[1], k[2], k[3], Math.round(AX - k[4]), Math.round(AY - k[5]), k[2], k[3]);
      if (near && !front) { scarf(g, dt, f); cx.drawImage(rb, 0, 0); }
      tex.needsUpdate = true;
    },
  };
}
