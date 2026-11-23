// Пиксельные спрайты джайлоо в стиле пляжных NPC и Дымка: тёмно-сливовый контур в пиксель, тёплая заливка в три тона
// (блик сверху, тень снизу), круглые «чибишные» формы, глазки-точки. Рисуются кодом при загрузке в один атлас,
// без файлов. Все смотрят вправо; влево -- зеркалом в шейдере.
// Кадры: пасётся (2 -- голова у травы покачивается), идёт (2), у лошади ещё галоп (2). Юрта -- один кадр.
import * as THREE from 'three';

const INK = [42, 29, 36]; // контур: как у пляжных персонажей
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mul = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

// холст спрайта: пиксели с номером «материала», потом контур и светотень
function Pix(w, h) {
  const col = new Array(w * h).fill(null);
  const P = {
    w, h, col,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) col[y * w + x] = c; },
    get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? col[y * w + x] : null; },
    rect(x, y, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) P.set(x + i, y + j, c); },
    ell(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35); if (dx * dx + dy * dy <= 1) P.set(x, y, c); } },
    line(x0, y0, x1, y1, r, c) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let i = 0; i <= n; i++) { const t = i / n; P.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, c); } },
    poly(pts, c) { let y0 = 1e9, y1 = -1e9; for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) { const xs = []; for (let i = 0; i < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]; if ((ay <= y + 0.5) !== (by <= y + 0.5)) xs.push(ax + (y + 0.5 - ay) / (by - ay) * (bx - ax)); }
        xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) P.set(x, y, c); } },
  };
  return P;
}
// в ImageData: светотень (блик у верхнего края, тень у нижнего и справа), контур снаружи, тень на земле
function bake(P, img, ox, oy, W, shadow = true) {
  const { w, h } = P, out = img.data, put = (x, y, rgb, a = 255) => { const o = ((oy + y) * W + ox + x) * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = a; };
  if (shadow) { let x0 = w, x1 = 0, yb = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (P.get(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); yb = Math.max(yb, y); }
    const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2 + 1; for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = (x - cx) / rx; if (Math.abs(d) <= 1 && yb + 1 < h) { put(x, yb + 1, [40, 50, 30], 70); if (Math.abs(d) < 0.7 && yb < h) put(x, yb, [40, 50, 30], 70); } } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = P.get(x, y); if (!c) continue;
    const up = P.get(x, y - 1), dn = P.get(x, y + 1), rt = P.get(x + 1, y), up2 = P.get(x, y - 2); let k = 1;
    if (c.flat) k = 1; else if (!up || up !== c && !c.solid) k = 1.18; else if (!up2) k = 1.08; if (!c.flat && (!dn || (!rt && !dn))) k = 0.74; else if (!c.flat && !rt) k = Math.min(k, 0.86);
    put(x, y, mul(c.rgb, k)); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (P.get(x, y)) continue; if (P.get(x - 1, y) || P.get(x + 1, y) || P.get(x, y - 1) || P.get(x, y + 1)) put(x, y, INK); }
}
const M = (h, o = {}) => ({ rgb: typeof h === 'string' ? hex(h) : h, ...o });

// ---------- овца / баран (24x20) ----------
function sheep(P, { wool, face, ram, frame, graze }) {
  const W = M(wool), F = M(face), L = M(mul(face, 0.8)), H = M('#c9a36b'), E = M('#f4efe6', { flat: true }), B = M('#1a1216', { flat: true });
  const step = graze ? 0 : frame ? 1 : -1;
  for (const [x, ph] of [[6, 1], [9, -1], [15, 1], [18, -1]]) P.rect(x + step * ph, 13, 2, 5, L); // ножки
  P.ell(3, 10, 2.4, 2.4, W); // курдюк
  P.ell(11.5, 10.5, 8.5, 4.6, W); for (const [x, y, r] of [[4.5, 7.5, 2.8], [8.5, 5.2, 3.2], [13, 4.6, 3.3], [17, 6.2, 2.8], [6.5, 11, 3], [12, 12, 3], [16.5, 11, 2.8]]) P.ell(x, y, r, r * 0.9, W); // шерсть кудряшками
  const hy = graze ? 13 + (frame ? 0.6 : 0) : 7.5, hx = graze ? 20.5 : 20.5;
  P.ell(hx, hy, 2.6, 3, F); P.ell(hx + 1.6, hy + 1.2, 1.6, 1.6, F); // мордочка
  P.ell(hx - 1, hy - 3, 2, 1.6, W); // чёлка
  P.rect(hx - 3, hy - 1, 2, 1, F); // ушко
  if (ram) { const Hc = H; P.ell(hx - 1.5, hy - 0.5, 2.4, 2.4, Hc); P.ell(hx - 1.5, hy - 0.5, 1, 1, F); } // закрученный рог
  P.set(hx + 1, hy - 0.5, E); P.set(hx + 1, hy, B); // глазик
}
// ---------- лошадь (46x38), с всадником -- выше ----------
function horse(P, { coat, mane, frame, gait, rider, oy = 0 }) {
  const C = M(coat), D = M(mul(coat, 0.78)), Mn = M(mane), Hf = M('#2c2224'), E = M('#1a1216', { flat: true }), Wt = M('#f4efe6', { flat: true });
  const y0 = oy; // всадник сдвигает лошадь вниз
  // ноги: шаг -- попеременно, галоп -- передние вперёд, задние назад и наоборот
  const legs = [[14, 0], [17, 1], [29, 0], [32, 1]];
  for (const [x, ph] of legs) { let dx = 0, lift = 0; if (gait === 'walk') { dx = (frame ^ ph ? 1 : -1); lift = frame ^ ph ? 1 : 0; } if (gait === 'run') { const fr = x > 24; dx = frame ? (fr ? 3 : -3) : (fr ? -1 : 2); lift = frame ? 2 : 0; }
    P.line(x, y0 + 22, x + dx, y0 + 31 - lift, 1, x === 17 || x === 32 ? D : C); P.rect(x + dx - 1, y0 + 31 - lift, 3, 2, Hf); }
  P.line(9, y0 + 16, gait === 'run' ? 3 : 7, gait === 'run' ? y0 + 18 : y0 + 27, 1.4, Mn); // хвост
  P.ell(22, y0 + 18, 12, 6.5, C); // корпус
  const graze = gait === 'graze';
  if (graze) { P.line(31, y0 + 15, 37, y0 + 26, 3, C); P.ell(38, y0 + 29, 3, 3.4, C); P.ell(39.5, y0 + 31.5, 2.2, 2, D); P.line(31, y0 + 12, 36, y0 + 23, 1, Mn); P.set(38, y0 + 27, E); P.rect(35, y0 + 24, 1, 2, C); }
  else { const by = gait === 'run' ? 2 : 0; P.line(31, y0 + 15, 37, y0 + 6 + by, 3.2, C); P.poly([[34, y0 + 3 + by], [40, y0 + 4 + by], [43, y0 + 10 + by], [40, y0 + 12 + by], [35, y0 + 8 + by]], C); P.ell(41.5, y0 + 10.5 + by, 1.8, 1.8, D);
    P.line(30, y0 + 12, 35, y0 + 3 + by, 1.1, Mn); P.rect(35, y0 + 1 + by, 1, 2, C); P.set(38, y0 + 6 + by, E); }
  if (rider) { const CH = M(rider.chapan), SK = M('#e0a77a'), K = M('#f6f2e8'), KB = M('#20181c', { flat: true }), BT = M('#3a2a24');
    P.poly([[19, y0 + 13], [27, y0 + 13], [26, y0 + 2], [20, y0 + 2]], CH); P.rect(22, y0 + 13, 3, 6, CH); P.rect(22, y0 + 19, 4, 2, BT); // чапан, нога, сапог
    P.line(25, y0 + 6, 30, y0 + 11, 1, CH); // рука к поводу
    P.ell(23, y0 - 1.5, 2.8, 2.8, SK); P.set(25, y0 - 2, E); // голова
    P.poly([[20, y0 - 3], [26, y0 - 3], [23.5, y0 - 11]], K); P.rect(20, y0 - 4, 7, 1, KB); P.set(23, y0 - 7, KB); // ак-калпак с чёрной каймой
    P.set(24, y0 + 4, Wt); }
}
// ---------- як (44x34) ----------
function yak(P, { coat, frame, graze }) {
  const C = M(coat), D = M(mul(coat, 0.75)), Hn = M('#efe8da'), Mz = M(mul(coat, 1.5)), E = M('#f4efe6', { flat: true });
  const st = graze ? 0 : frame ? 1 : -1;
  for (const [x, ph] of [[11, 1], [15, -1], [27, 1], [31, -1]]) P.rect(x + st * ph, 21, 3, 9, x === 15 || x === 31 ? D : C);
  P.ell(20, 15, 13, 8, C); P.ell(26, 9, 6, 5, C); // туша и горб
  for (let x = 8; x <= 32; x += 3) P.poly([[x, 18], [x + 3, 18], [x + 1.5, 25 + ((x / 3) % 2)]], D); // шерстяная юбка
  P.line(6, 12, 4, 22, 1, C); P.ell(4, 23, 1.6, 2.4, D); // хвост с кистью
  const hy = graze ? 22 + (frame ? 0.6 : 0) : 15;
  P.ell(36, hy, 4.2, 4.2, C); P.ell(39, hy + 2, 2.6, 2.2, Mz); // голова и светлая морда
  P.line(34, hy - 3, 32, hy - 7, 0.8, Hn); P.line(37, hy - 3, 39, hy - 7, 0.8, Hn); P.set(39, hy - 8, Hn); P.set(32, hy - 8, Hn); // рога
  P.set(37, hy - 0.5, E);
}
// ---------- юрта (112x84) ----------
function yurt(P) {
  const F = M('#f3ecdc'), F2 = M('#e3d8c2', { solid: true }), R = M('#c2352b', { solid: true }), G = M('#e8c25a', { flat: true }), Bl = M('#2f5fae', { flat: true }), Wd = M('#8a4a22'), Dr = M('#d0662a', { solid: true }), Dk = M('#5a2e18', { flat: true }), St = M('#a88a6a', { flat: true });
  P.rect(8, 50, 96, 30, F); // стена
  for (let x = 8; x < 104; x++) { const t = (x - 56) / 48, y = 50 - 27 * Math.pow(Math.max(0, 1 - t * t), 0.7); for (let yy = Math.round(y); yy < 51; yy++) P.set(x, yy, F2); } // купол
  for (let i = -3; i <= 3; i++) { const xb = 56 + i * 15; P.line(56 + i * 2.2, 24, xb, 50, 0.4, St); } // арканы по куполу
  P.rect(46, 20, 21, 4, Wd); P.rect(50, 18, 13, 2, Wd); // тюндюк
  P.rect(8, 53, 96, 7, R); for (const y of [53, 59]) P.rect(8, y, 96, 1, G); // красный пояс с тесьмой
  for (let x = 12; x < 102; x += 8) { P.set(x, 56, Bl); P.set(x - 1, 56, Bl); P.set(x + 1, 56, Bl); P.set(x, 55, Bl); P.set(x, 57, Bl); } // ромбы орнамента
  P.rect(49, 61, 15, 19, Dr); P.rect(51, 63, 11, 15, M('#e88a3a', { solid: true })); // дверь
  for (let y = 65; y < 77; y += 4) P.rect(53, y, 7, 1, Dk); P.rect(56, 63, 1, 15, Dk);
}

// ---------- атлас ----------
// rects[вид][состояние] = [u0, v0, du, dv, wM, hM] -- первый кадр (второй -- правее на du), размер в метрах
export function makeJailooAtlas() {
  const W = 1024, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), img = x.createImageData(W, H);
  let cx = 0, cy = 0, rowH = 0; const R = {};
  const slot = (w, h) => { if (cx + w > W) { cx = 0; cy += rowH; rowH = 0; } const s = [cx, cy]; cx += w; rowH = Math.max(rowH, h); return s; };
  // ppm -- пикселей на метр: все животные в одном масштабе (как пляжные фигурки), юрта -- своя плотность
  const add = (kind, state, w, h, ppm, draws) => { const pos = slot(w * draws.length, h); draws.forEach((fn, i) => { const P = Pix(w, h); fn(P); bake(P, img, pos[0] + i * w, pos[1], W); });
    (R[kind] ||= {})[state] = [pos[0] / W, 1 - (pos[1] + h) / H, w / W, h / H, w / ppm, h / ppm]; };
  const SHEEP = [['#f6f1e6', '#3a2c2a'], ['#efe2c4', '#4a3428'], ['#9a6a45', '#2e2220'], ['#4e3d36', '#231a1a']];
  SHEEP.forEach(([wool, face], ci) => { for (const ram of [false, true]) { const k = (ram ? 'ram' : 'sheep') + ci;
    add(k, 'graze', 24, 20, 21, [0, 1].map((f) => (P) => sheep(P, { wool: hex(wool), face: hex(face), ram, frame: f, graze: true })));
    add(k, 'walk', 24, 20, 21, [0, 1].map((f) => (P) => sheep(P, { wool: hex(wool), face: hex(face), ram, frame: f, graze: false }))); } });
  const HORSE = [['#9a5530', '#2a1c1a'], ['#b8692f', '#e9d6a6'], ['#3a2e2c', '#1c1414'], ['#c9c3b8', '#6e6862'], ['#e0bb6e', '#f5ead0'], ['#7a4a36', '#2a1c1a']];
  HORSE.forEach(([coat, mane], ci) => { const k = 'horse' + ci;
    for (const g of ['graze', 'walk', 'run']) add(k, g, 46, 36, 21, [0, 1].map((f) => (P) => horse(P, { coat: hex(coat), mane: hex(mane), frame: f, gait: g })));
    if (ci < 3) { const kr = 'rider' + ci; for (const g of ['walk', 'run']) add(kr, g, 46, 48, 21, [0, 1].map((f) => (P) => horse(P, { coat: hex(coat), mane: hex(mane), frame: f, gait: g, rider: { chapan: ['#3d3f78', '#7a2a35', '#2f5a4a'][ci] }, oy: 12 }))); } });
  const YAK = ['#2c2422', '#5a3e2f', '#e6dccb'];
  YAK.forEach((coat, ci) => { const k = 'yak' + ci; for (const g of ['graze', 'walk']) add(k, g, 44, 32, 21, [0, 1].map((f) => (P) => yak(P, { coat: hex(coat), frame: f, graze: g === 'graze' }))); });
  add('yurt', 'still', 112, 84, 17, [(P) => yurt(P)]);
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  return { tex: t, rects: R, canvas: cv, counts: { sheep: SHEEP.length, horse: HORSE.length, rider: 3, yak: YAK.length } };
}
