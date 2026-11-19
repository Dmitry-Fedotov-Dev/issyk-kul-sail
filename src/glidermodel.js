// Параплан крупным планом: купол, стропы, свободные концы, пилот в коконе.
//
// Купол -- как у настоящего крыла класса EN-B: эллиптический план (хорда 2.7 м в центре, законцовки отведены назад),
// дуга с опущенными консолями, профиль с «акульим носом» и лёгким S-образным хвостиком. 44 ячейки: между нервюрами
// верхняя поверхность надута, нижняя чуть втянута; у передней кромки -- воздухозаборники. Задняя кромка своей
// половины уходит вниз, когда тянут клеванту (сильнее к законцовке), подсложение подворачивает консоль под крыло,
// фронтальное -- переднюю кромку. Ткань -- рисунок на холсте (верх и низ свои), сетка рипстопа; на просвет купол
// светится цветом снизу.
// Стропы -- каскад, как на крыле: четыре ряда (A, B, C, D) и тормозные, у каждого ряда свой цвет. Галерейные стропы от
// купола сходятся в узлы, узлы -- в основные, основные -- к свободным концам. Свободные концы -- ленты от карабинов;
// акселератор тянет передние вниз. Тормозные стропы приходят к ручкам, ручки -- в руках пилота.
// Пилот -- в коконе с обтекателем за спиной, с приборной панелью на коленях; в повороте смещает вес.
// Оси модели: нос в -z, вверх +y, правая консоль +x. Начало -- центр масс пилота; карабины на 0.45 м выше.
import * as THREE from 'three';
import { clamp, smooth } from './sim.js';
import { WING } from './para.js';
import { DYMOK } from './dymok.js';

const NCELL = 44, NCOL = NCELL * 2 + 1, NROW = 15, HANG = WING.hang, ARC = 0.92, C0 = 2.75;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UP = V3(0, 1, 0);
const mat = (c, r = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, envMapIntensity: 0.6, ...extra });
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const G_LIMB = new THREE.CylinderGeometry(1, 1, 1, 8);
function limb(m, a, b, r, r2 = r) { m.position.copy(a).add(b).multiplyScalar(0.5); const d = b.clone().sub(a), l = d.length() || 1e-3; m.scale.set(r, l, r2); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); }

// ---------- форма купола ----------
// u -- по размаху (-1..1), s -- по хорде от передней кромки (0) к задней (1)
const chord = (u) => C0 * (0.36 + 0.64 * Math.pow(1 - u * u, 0.62));
const lead = (u) => -0.3 * C0 + 0.42 * Math.pow(Math.abs(u), 3.2) * C0; // передняя кромка отведена назад к законцовкам
const arcA = (u) => ARC * (u + 0.42 * u * u * u) / 1.42; // консоли опущены сильнее центра
const thick = (s) => 0.16 * 2.6 * Math.sqrt(s) * (1 - s); // толщина профиля, max 16% на трети хорды
const camber = (s) => 0.035 * Math.sin(Math.PI * s) - 0.012 * smooth(0.72, 1, s); // средняя линия с S-хвостиком
const sSpace = (k) => (1 - Math.cos((k / (NROW - 1)) * Math.PI)) / 2; // гуще у кромок

// ---------- ткань: рисунок верха и низа ----------
function fabric(pal, top) { const W = 1024, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const [m, a, e] = pal.map(hex); // основной, акцент, кромка
  x.fillStyle = top ? '#f3f2ec' : m; x.fillRect(0, 0, W, H);
  if (top) { // верх: светлая база, тёмная передняя кромка, крупные стреловидные полосы к законцовкам
    x.fillStyle = e; x.fillRect(0, 0, W, H * 0.16);
    for (const sd of [-1, 1]) { x.save(); x.translate(W / 2, 0); x.scale(sd, 1);
      x.fillStyle = m; x.beginPath(); x.moveTo(40, H); x.lineTo(150, H * 0.16); x.lineTo(330, H * 0.16); x.lineTo(470, H); x.closePath(); x.fill();
      x.fillStyle = a; x.beginPath(); x.moveTo(500, H); x.lineTo(380, H * 0.16); x.lineTo(430, H * 0.16); x.lineTo(540, H); x.closePath(); x.fill();
      x.fillStyle = m; x.fillRect(W / 2 - 120, 0, 120, H); x.fillStyle = e; x.fillRect(W / 2 - 52, 0, 52, H);
      x.restore(); }
    for (const sd of [-1, 1]) { x.save(); x.translate(W / 2 + sd * 245, H * 0.6); x.scale(0.8, 1.6); x.fillText('ИССЫК-КУЛЬ', 0, 0); x.restore(); } x.restore();
  } else { // низ: цвет крыла, белые шевроны, тёмные воздухозаборники у кромки
    x.fillStyle = a; for (let i = 0; i < 6; i++) { const X = W / 2 + (i - 2.5) * 70; x.beginPath(); x.moveTo(X - 25, H); x.lineTo(X, H * 0.3); x.lineTo(X + 25, H); x.closePath(); x.globalAlpha = 0.85; x.fill(); } x.globalAlpha = 1;
    x.fillStyle = e; x.fillRect(0, 0, 70, H); x.fillRect(W - 70, 0, 70, H);
    x.fillStyle = '#f3f2ec'; x.fillRect(0, H * 0.86, W, H * 0.03);
    x.fillStyle = 'rgba(10,12,16,.92)'; for (let k = 0; k < NCELL; k++) { const c0 = (k / NCELL) * W, cw = W / NCELL, uu = (k + 0.5) / NCELL * 2 - 1; if (Math.abs(uu) > 0.86) continue; x.beginPath(); x.ellipse(c0 + cw / 2, H * 0.035, cw * 0.36, H * 0.032, 0, 0, 7); x.fill(); } }
  // нервюры (швы ячеек) и рипстоп
  x.strokeStyle = top ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.22)'; x.lineWidth = 1.5; for (let k = 0; k <= NCELL; k++) { const X = (k / NCELL) * W; x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,.05)'; x.lineWidth = 1; for (let X = 0; X < W; X += 6) { x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke(); } for (let Y = 0; Y < H; Y += 6) { x.beginPath(); x.moveTo(0, Y); x.lineTo(W, Y); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, H - 1); x.lineTo(W, H - 1); x.stroke(); // задняя кромка
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ---------- пилот -- Дымок: пиксельный котёнок из дыма в пиксельном снаряжении ----------
// Кадр эмоции из атласа + дорисованные пиксели: шлем между ушами с очками, подвеска-сиденье с полосой, свободные концы
// по бокам. Один холст на эмоцию; спрайт всегда лицом к камере и кренится вместе с крылом.
const DIMG = typeof Image !== 'undefined' ? new Image() : null; if (DIMG) DIMG.src = DYMOK.png;
const EMO = { content: 'emo_content', joy: 'emo_joy', surprised: 'emo_surprised', sad: 'emo_sad', curious: 'emo_curious' };
function dymokSheet(helmetCol, seatCol, stripeCol) { const out = {}, ready = [];
  for (const k in EMO) { const f = DYMOK.frames[EMO[k]], w = f[2], h = f[3], ox = 3, oy = 1, Wd = w + 6, Hd = h + 9, sy = oy + h - 3, c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, Wd, Hd); const px = (X, Y, col) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
      const INK = '#3b3340', cx = ox + f[4];
      // свободные концы: по бокам от карабинов вверх
      for (let y = 0; y < sy; y++) { px(ox - 1, y, INK); px(ox + w, y, INK); }
      x.drawImage(DIMG, f[0], f[1], w, h, ox, oy, w, h);
      // подвеска: сиденье-кокон под котиком
      const seat = [[-7, 7], [-8, 8], [-8, 8], [-8, 8], [-7, 7], [-6, 6], [-4, 4]];
      seat.forEach(([a, b], r) => { for (let X = a; X <= b; X++) px(cx + X, sy + r, X === a || X === b || r === seat.length - 1 ? INK : r === 2 ? stripeCol : seatCol); });
      for (let X = -8; X <= 8; X++) px(cx + X, sy - 1, INK);
      px(ox - 1, sy, INK); px(ox + w, sy, INK); px(cx - 9, sy, '#c9ced6'); px(cx + 9, sy, '#c9ced6'); // карабины
      // шлем между ушами: купол на макушке, светлая полоса, очки на лбу
      const hy = oy + 3, dome = [[-3, 3], [-5, 5], [-5, 5], [-6, 6]];
      dome.forEach(([a, b], r) => { for (let X = a; X <= b; X++) px(cx + X, hy + r, r === 0 || X === a || X === b ? INK : X === 0 ? '#fff6ea' : helmetCol); });
      for (let X = -5; X <= 5; X++) px(cx + X, hy + 4, X === -5 || X === 5 ? INK : Math.abs(X) === 3 || Math.abs(X) === 2 ? '#9fd6f0' : INK); // очки
      tex.needsUpdate = true; };
    if (DIMG && DIMG.complete) draw(); else if (DIMG) ready.push(draw);
    out[k] = { tex, W: Wd, H: Hd, seatY: sy + 2 }; }
  if (DIMG && ready.length) DIMG.addEventListener('load', () => ready.forEach((d) => d()));
  return out; }

// pal: [основной, акцент, кромка]; suit -- кокон и куртка; helmet -- шлем
export function makeGlider(pal = [0xff6a1a, 0x1d3f8f, 0x16243a], suit = 0x22303f, helmet = 0xf2f2f2) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const pivot = new THREE.Group(); pivot.position.y = 0.45; root.add(pivot); // крыло со стропами качается вокруг карабинов
  const wingG = new THREE.Group(); pivot.add(wingG);
  // ---- купол: две поверхности на одной сетке колонок (нервюры и середины ячеек) ----
  const NV = NCOL * NROW, base = [new Float32Array(NV * 3), new Float32Array(NV * 3)], meta = new Float32Array(NV * 3), geos = [], pos = [];
  for (let side = 0; side < 2; side++) { const p = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), b = base[side];
    for (let j = 0; j < NCOL; j++) for (let k = 0; k < NROW; k++) { const n = j * NROW + k, u = (j / (NCOL - 1)) * 2 - 1, s = sSpace(k), c = chord(u), a = arcA(u);
      const tipK = 1 - Math.pow(Math.abs(u), 10), T = thick(s) * (0.5 + 0.5 * Math.sqrt(1 - u * u)) * tipK, mid = j % 2 === 1 && Math.abs(u) < 0.985;
      let r; if (side === 0) r = HANG + c * (camber(s) + 0.62 * T + (mid ? 0.022 * Math.sin(Math.PI * s) ** 0.6 * tipK : 0)); // надутая ячейка
      else r = HANG + c * (camber(s) - 0.38 * T + (s < 0.1 ? 0.2 * T : 0) - (mid ? 0.006 * Math.sin(Math.PI * s) : 0)); // «акулий нос» у воздухозаборников
      b[n * 3] = Math.sin(a) * r; b[n * 3 + 1] = Math.cos(a) * r; b[n * 3 + 2] = lead(u) + s * c; uv[n * 2] = (u + 1) / 2; uv[n * 2 + 1] = 1 - s;
      if (side === 0) { meta[n * 3] = u; meta[n * 3 + 1] = s; meta[n * 3 + 2] = c; } }
    p.set(b); const idx = []; for (let j = 0; j < NCOL - 1; j++) for (let k = 0; k < NROW - 1; k++) { const a = j * NROW + k, b2 = (j + 1) * NROW + k, c2 = b2 + 1, d = a + 1; if (side === 0) idx.push(a, d, c2, a, c2, b2); else idx.push(a, b2, c2, a, c2, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); geos.push(g); pos.push(p); }
  const tTop = fabric(pal, true), tBot = fabric(pal, false);
  const mTop = mat(0xffffff, 0.55, { map: tTop, side: THREE.DoubleSide }), mBot = mat(0xffffff, 0.62, { map: tBot, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tBot, emissiveIntensity: 0.22 }); // низ светится на просвет
  const top = new THREE.Mesh(geos[0], mTop), bot = new THREE.Mesh(geos[1], mBot); for (const m of [top, bot]) { m.castShadow = true; m.frustumCulled = false; wingG.add(m); }
  // ---- стропы: каскад ----
  // точки крепления на нижней поверхности: ряды A, B, C, D по нервюрам через одну ячейку; тормозные -- на задней кромке
  const ROWS = [{ s: 0.07, col: 0x8a4a3c, rz: -0.06 }, { s: 0.36, col: 0x7d6a3e, rz: 0 }, { s: 0.66, col: 0x3e5470, rz: 0.06 }]; // минимальный набор: ряды A, B, C (тёмные, как настоящие стропы)
  const ribs = []; for (let j = 0; j < NCOL; j += 4) { const u = (j / (NCOL - 1)) * 2 - 1; if (Math.abs(u) > 0.02 && Math.abs(u) < 0.995) ribs.push(j); }
  const rowK = (s) => { let k = 0; while (k < NROW - 1 && sSpace(k) < s) k++; return k; };
  const segs = []; // [от, до] -- ссылки на точки: {v: индекс вершины низа} или {node}
  const nodes = []; const node = (kids, toward, t) => { const o = { kids, toward, t, p: V3(0, 0, 0) }; nodes.push(o); return o; };
  const risers = {}; // верх свободных концов (в осях подвески)
  for (const sx of [-1, 1]) {
    ROWS.forEach((R, ri) => { const rt = { p: V3(sx * (0.2 + ri * 0.012), 0.48, R.rz) }; risers[`${sx}${ri}`] = rt;
      // каскад 4 -> 2 -> 1: четыре точки на куполе (по размаху своей половины), два узла, одна основная стропа к свободному концу
      const pts = [0.12, 0.38, 0.62, 0.86].map((uu) => { const j = Math.round(((sx * uu + 1) / 2) * (NCOL - 1)); return { v: j * NROW + rowK(R.s) }; });
      const ups = [node(pts.slice(0, 2), rt, 0.35), node(pts.slice(2, 4), rt, 0.35)]; ups.forEach((n, i) => { for (const k of pts.slice(i * 2, i * 2 + 2)) segs.push([k, n, R.col]); });
      const main = node(ups, rt, 0.55); for (const k of ups) segs.push([k, main, R.col]); segs.push([main, rt, R.col]); });
    // тормозные: задняя кромка внешних двух третей размаха -> узлы -> основная -> ручка
    const hand = { p: V3(sx * 0.3, 0.6, 0.12) }; risers[`${sx}b`] = hand;
    const te = [0.3, 0.52, 0.72, 0.92].map((uu) => ({ v: Math.round(((sx * uu + 1) / 2) * (NCOL - 1)) * NROW + NROW - 1 }));
    const bu = [node(te.slice(0, 2), hand, 0.3), node(te.slice(2, 4), hand, 0.3)]; bu.forEach((n, i) => { for (const k of te.slice(i * 2, i * 2 + 2)) segs.push([k, n, 0xc8642a]); });
    const bm = node(bu, hand, 0.55); for (const k of bu) segs.push([k, bm, 0xc8642a]); segs.push([bm, hand, 0xc8642a]); }
  const lp = new Float32Array(segs.length * 6), lc = new Float32Array(segs.length * 6);
  segs.forEach((sg, i) => { const c = new THREE.Color(sg[2]); for (let q = 0; q < 2; q++) { lc[i * 6 + q * 3] = c.r; lc[i * 6 + q * 3 + 1] = c.g; lc[i * 6 + q * 3 + 2] = c.b; } });
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lgeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false })); lines.renderOrder = 3; lines.frustumCulled = false; pivot.add(lines); // после воды (иначе озеро ложится поверх), без записи глубины -- без жирной обводки
  // свободные концы (ленты) и ручки клевант
  const web = mat(0x1d1f24, 0.8), strap = [], toggles = [];
  for (const sx of [-1, 1]) { for (let ri = 0; ri < 3; ri++) { const m = new THREE.Mesh(G_LIMB, mat(ROWS[ri].col, 0.7)); m.castShadow = true; pivot.add(m); strap.push({ m, sx, ri }); }
    const tg = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14), mat(0xff8a00, 0.5)); pivot.add(tg); toggles.push(tg);
    const kb = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), mat(0xc9ced6, 0.25, { metalness: 0.9 })); kb.position.set(sx * 0.2, 0.0, 0); kb.rotation.y = Math.PI / 2; pivot.add(kb); }
  // ---- пилот ----
  const pilot = new THREE.Group(); root.add(pilot);
  const sm = mat(suit, 0.75), acc = mat(pal[0], 0.5), dark = mat(0x15181d, 0.6);
  const lathe = (prof, m) => new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), m);
  const pod = new THREE.Group(); pilot.add(pod); // кокон: от сиденья вперёд к ногам
  { const body = lathe([[0.001, 0], [0.2, 0.06], [0.27, 0.3], [0.28, 0.6], [0.24, 0.95], [0.17, 1.25], [0.08, 1.45], [0.001, 1.5]], sm); body.rotation.x = -Math.PI / 2 + 0.18; body.position.set(0, -0.08, 0.12); pod.add(body);
    const stripe = lathe([[0.276, 0.55], [0.282, 0.62], [0.276, 0.69]], acc); stripe.rotation.copy(body.rotation); stripe.position.copy(body.position); pod.add(stripe);
    // обтекатель за спиной
    const fair = lathe([[0.001, 0], [0.24, 0.12], [0.26, 0.32], [0.18, 0.6], [0.06, 0.85], [0.001, 0.9]], acc); fair.rotation.x = Math.PI / 2 - 0.25; fair.position.set(0, 0.0, 0.2); fair.scale.set(1, 1, 0.75); pod.add(fair);
    // приборная панель на коленях со светящимся экраном
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.24), dark); deck.position.set(0, 0.2, -0.5); deck.rotation.x = 0.35; pod.add(deck);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.1), new THREE.MeshBasicMaterial({ color: 0x9ff3ff })); scr.position.set(-0.06, 0.226, -0.49); scr.rotation.x = -Math.PI / 2 + 0.35; pod.add(scr);
    const scr2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd36a })); scr2.position.set(0.09, 0.226, -0.49); scr2.rotation.x = scr.rotation.x; pod.add(scr2);
    const reserve = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), mat(0xd8262a, 0.5)); reserve.position.set(0.27, 0.05, -0.05); pod.add(reserve); }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 4, 12), mat(0x3a4656, 0.7)); torso.position.set(0, 0.36, 0.12); torso.rotation.x = 0.42; pilot.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), mat(helmet, 0.3)); head.position.set(0, 0.73, 0.27); pilot.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.143, 16, 10, -1.0, 2.0, 1.05, 0.75), new THREE.MeshStandardMaterial({ color: 0x0d1a24, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5 })); visor.position.copy(head.position); visor.rotation.y = Math.PI; pilot.add(visor);
  const hstripe = new THREE.Mesh(new THREE.TorusGeometry(0.141, 0.012, 6, 24, Math.PI), acc); hstripe.position.copy(head.position); hstripe.rotation.set(0, Math.PI / 2, 0); pilot.add(hstripe);
  const arms = [-1, 1].map((sx) => { const up = new THREE.Mesh(G_LIMB, sm), lo = new THREE.Mesh(G_LIMB, sm), glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark); pilot.add(up, lo, glove); return { up, lo, glove, sx }; });
  const legs = [-1, 1].map((sx) => { const m = new THREE.Mesh(G_LIMB, sm); pilot.add(m); m.visible = false; return { m, sx }; });
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // Дымок вместо человечка
  const sheet = dymokSheet('#' + new THREE.Color(pal[1]).getHexString(), '#' + new THREE.Color(suit).getHexString(), '#' + new THREE.Color(pal[0]).getHexString());
  const sm2 = new THREE.SpriteMaterial({ map: sheet.content.tex, transparent: true, alphaTest: 0.3 }), spr = new THREE.Sprite(sm2), PXM = 0.075; let emoNow = 'content';
  const setEmo = (k) => { const S = sheet[k] || sheet.content; sm2.map = S.tex; spr.scale.set(S.W * PXM, S.H * PXM, 1); spr.center.set(0.5, 1 - S.seatY / S.H); emoNow = k; };
  setEmo('content'); root.add(spr); pilot.visible = false;
  const tv = V3(0, 0, 0), tw = V3(0, 0, 0), sh = V3(0, 0, 0), el = V3(0, 0, 0), hd = V3(0, 0, 0), vp = (v) => tv.set(pos[1][v * 3], pos[1][v * 3 + 1], pos[1][v * 3 + 2]);
  let frame = 0, stand = 0; const PINV = new THREE.Matrix4();
  // ---- форма в кадре ----
  function shape(g, t, full) {
    const up = clamp(g.wingUp ?? 1, 0, 1), fl = 0.25 + 0.75 * up, cs = g.colSide || 0, cf = g.col || 0, fr = g.front || 0, st = g.stall ? 1 : 0, flut = (g.turb || 0) * 0.03 + cf * 0.04 + (g.gustFx || 0) * 0.07, bL = g.L || 0, bR = g.R || 0;
    if (full) for (let side = 0; side < 2; side++) { const b = base[side], p = pos[side];
      for (let n = 0; n < NV; n++) { const u = meta[n * 3], s = meta[n * 3 + 1], c = meta[n * 3 + 2]; let x = b[n * 3], y = b[n * 3 + 1], z = b[n * 3 + 2]; const a = arcA(u), sa = Math.sin(a), ca = Math.cos(a);
        // клеванта: задняя кромка своей половины вниз, сильнее к законцовке; в сваливании -- вся кромка и хорда назад
        const br = u > 0 ? bR : bL, w = smooth(0.06, 0.7, Math.abs(u)) * Math.max(0, (s - 0.5) / 0.5) ** 2, dn = (br * 0.95 * w + st * 0.55 * s * s) * c / C0;
        x -= sa * dn; y -= ca * dn; z += dn * 0.3 + st * 0.25 * s;
        if (cf > 0 && u * cs > 0) { const uf = 1 - 1.45 * cf, au = Math.abs(u); if (au > uf) { const tt = (au - uf) / Math.max(0.05, 1 - uf), ang = cs * (2.55 * smooth(0, 1, tt) + Math.sin(t * 13 + u * 9) * 0.07); const af = arcA(uf * cs), px = Math.sin(af) * HANG, py = Math.cos(af) * HANG;
          const dx = x - px, dy = y - py, cA = Math.cos(ang), sA = Math.sin(ang); x = px + dx * cA + dy * sA; y = py - dx * sA + dy * cA; } }
        if (fr > 0 && s < 0.5) { const wf = ((0.5 - s) / 0.5) * fr; y -= wf * 1.7 * ca; x -= wf * 1.7 * sa; z += wf * 1.1; }
        y = y + (1 - fl) * (HANG - y) * 0.85; x *= 0.85 + 0.15 * fl;
        const f = flut * Math.sin(t * 19 + u * 13 + s * 7); x += sa * f; y += ca * f;
        p[n * 3] = x; p[n * 3 + 1] = y; p[n * 3 + 2] = z; }
      geos[side].attributes.position.needsUpdate = true; if (frame % 2 === 0) geos[side].computeVertexNormals(); }
    // свободные концы: акселератор тянет передние ряды вниз и чуть вперёд
    for (const R in risers) { if (R.endsWith('b')) continue; const ri = +R.slice(-1), sx = +R.slice(0, -1); risers[R].p.set(sx * (0.92 + ri * 0.01), 1.12 - (g.bar || 0) * (ri === 0 ? 0.13 : ri === 1 ? 0.08 : 0), ROWS[ri].rz - (g.bar || 0) * 0.03 * (2 - ri)); } // к свободным концам Дымка
    for (const sx of [-1, 1]) { const b = sx < 0 ? bL : bR; risers[`${sx}b`].p.set(sx * 0.95, 0.75 - 0.55 * b, 0.12); }
    // узлы каскада: среднее своих строп, подтянутое к свободному концу
    for (const n of nodes) { tw.set(0, 0, 0); for (const k of n.kids) tw.add(k.v !== undefined ? vp(k.v) : k.p); tw.multiplyScalar(1 / n.kids.length); n.p.copy(tw).lerp(n.toward.p, n.t); }
    let m = 0; const put = (o) => { const q = o.v !== undefined ? vp(o.v) : o.p; lp[m++] = q.x; lp[m++] = q.y; lp[m++] = q.z; };
    for (const sg of segs) { put(sg[0]); put(sg[1]); } lgeo.attributes.position.needsUpdate = true; lines.visible = up > 0.4;
    for (const S of strap) { const r = risers[`${S.sx}${S.ri}`].p; limb(S.m, tw.set(S.sx * 0.2, 0.02, 0), r, 0.014, 0.004); S.m.visible = false; }
    toggles.forEach((tg, i) => { tg.position.copy(risers[`${i ? 1 : -1}b`].p); });
    // руки пилота держат ручки (перевод из осей подвески в оси пилота)
    pivot.updateMatrix(); pilot.updateMatrix(); PINV.copy(pilot.matrix).invert();
    for (const A of arms) { hd.copy(risers[`${A.sx}b`].p).applyMatrix4(pivot.matrix).applyMatrix4(PINV);
      sh.set(A.sx * 0.2, 0.55, 0.16); el.copy(sh).lerp(hd, 0.5); el.x += A.sx * 0.14; el.z += 0.1; limb(A.up, sh, el, 0.055); limb(A.lo, el, hd, 0.045); A.glove.position.copy(hd); } }
  return {
    root, pivot, canopy: top,
    update(g, dt, t, near = true) { frame++; const standing = g.mode === 'landed' || g.mode === 'launch' || (g.mode === 'tow' && (g.wingUp ?? 1) < 1);
      stand += ((standing ? 1 : 0) - stand) * Math.min(1, dt * 3.5); // из стойки в подвеску -- за полсекунды, без скачка
      root.position.set(g.X, g.Z + 0.15 + 0.85 * stand, -g.Y); root.rotation.set(0, -g.th, -(g.phi || 0) * 0.92);
      const upW = clamp(g.wingUp ?? 1, 0, 1), th = g.mode === 'air' ? 0 : Math.max(0, -(g.pitch || 0));
      pivot.rotation.set(-(g.pitch || 0), 0, (g.mode === 'air' ? 0 : (g.wingOff || 0) * 0.5) + (g.phi || 0) * 0.08);
      wingG.rotation.x = -th * (1 - upW * 0.6); wingG.position.y = -(1 - upW) * 1.1; lines.rotation.copy(wingG.rotation); lines.position.copy(wingG.position);
      // перенос веса: в повороте пилот кренится в сторону поворота сильнее крыла
      pilot.rotation.set(standing ? -0.35 : 0, 0, standing ? 0 : -((g.R || 0) - (g.L || 0)) * 0.16); pilot.position.y = standing ? -0.15 : 0;
      pod.visible = !standing; for (const L of legs) { L.m.visible = standing; if (standing) limb(L.m, tw.set(L.sx * 0.1, 0.05, 0.1), sh.set(L.sx * 0.12, -0.8, 0.0), 0.07); }
      shape(g, t, near || frame % 4 === 0);
      const emo = g.col || g.front || g.stall || g.spin || (g.gustFx || 0) > 0.55 ? 'surprised' : g.mode === 'launch' || g.mode === 'tow' ? 'curious' : g.mode === 'landed' ? (g.landed && g.landed.q === 'soft' ? 'joy' : 'content')
        : g.vario > 0.8 ? 'joy' : g.vario < -2.4 ? 'sad' : 'content'; if (emo !== emoNow) setEmo(emo);
      sm2.rotation = -(g.phi || 0) * 0.35; spr.position.set(0, -0.85 * stand + (1 - stand) * Math.sin(t * 2.3) * 0.03, 0); },
    fp(on) { spr.visible = !on; },
  };
}
