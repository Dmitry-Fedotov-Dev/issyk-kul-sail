// Карта района Хан-Тенгри -- Иныльчек для выбора места старта, в духе советской топокарты: бумага, отмывка с северо-запада,
// горизонтали (коричневые; на ледниках -- синие), утолщённые с подписями, ледники и озеро Мерцбахера -- по маске OpenStreetMap
// из khan.png, километровая сетка, вершины с отметками, лагеря, вертолётная площадка.
// Рисуется попиксельно под текущий масштаб: при приближении горизонтали сгущаются (100 -> 50 -> 20 м) и остаются резкими.
// Во время жеста -- в половинном разрешении (быстро), после -- в полном.
import { KHAN, KHAN_POI } from './khandata.js';
import { KPEAKS, KCAMPS, KHELI } from './khanosm.js';

const { W, H, X0, Y1, STEP } = KHAN, ASL = 1607;
export const KHAN_BOUNDS = { x0: X0 + STEP * 2, x1: X0 + (W - 3) * STEP, y0: Y1 - (H - 3) * STEP, y1: Y1 - STEP * 2 };
export const khanHome = () => { const b = KHAN_BOUNDS; return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, R: (b.x1 - b.x0) / 2 }; };

// высота (над озером) и доли маски «ледник» / «озеро» -- билинейно по сетке 100 м
function sampler(grid) { const hs = grid.hs, osm = grid.osm;
  return (X, Y, out) => { const fx = (X - X0) / STEP, fy = (Y1 - Y) / STEP, i = Math.max(0, Math.min(W - 2, Math.floor(fx))), j = Math.max(0, Math.min(H - 2, Math.floor(fy))), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fy - j));
    const k = j * W + i, a = hs[k], b = hs[k + 1], c = hs[k + W], d = hs[k + W + 1]; out.z = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    const ic = (m) => (osm[m] === 255 ? 1 : 0), lc = (m) => (osm[m] === 128 ? 1 : 0);
    out.ice = (ic(k) * (1 - u) + ic(k + 1) * u) * (1 - v) + (ic(k + W) * (1 - u) + ic(k + W + 1) * u) * v; out.lake = (lc(k) * (1 - u) + lc(k + 1) * u) * (1 - v) + (lc(k + W) * (1 - u) + lc(k + W + 1) * u) * v; return out; }; }

// view: { cx, cy, R } -- центр (м) и половина ширины; q -- шаг пикселя (1 -- полное разрешение, 2 -- быстрое)
export function drawKhanMap(cv, view, grid, { q = 1, dpr = 1, mark = null, start = null } = {}) {
  const w = cv.width, h = cv.height, c = cv.getContext('2d'), mpp = (2 * view.R) / w, x0 = view.cx - view.R, y1 = view.cy + (h / w) * view.R;
  const sw = Math.ceil(w / q), sh = Math.ceil(h / q), S = sampler(grid), o = {}, Z = new Float32Array((sw + 1) * (sh + 1)), IC = new Float32Array((sw + 1) * (sh + 1)), LK = new Float32Array((sw + 1) * (sh + 1));
  const inB = (X, Y) => X > KHAN_BOUNDS.x0 && X < KHAN_BOUNDS.x1 && Y > KHAN_BOUNDS.y0 && Y < KHAN_BOUNDS.y1;
  for (let j = 0; j <= sh; j++) for (let i = 0; i <= sw; i++) { const X = x0 + i * q * mpp, Y = y1 - j * q * mpp, k = j * (sw + 1) + i; if (!inB(X, Y)) { Z[k] = NaN; continue; } S(X, Y, o); Z[k] = o.z + ASL; IC[k] = o.ice; LK[k] = o.lake; }
  // интервал горизонталей -- по масштабу: чем ближе, тем гуще
  const step = q * mpp, CI = step < 5 ? 20 : step < 14 ? 50 : 100, MAJ = CI * 5;
  const img = c.createImageData(sw, sh), D = img.data;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const k = j * (sw + 1) + i, z = Z[k], o4 = (j * sw + i) * 4;
    if (Number.isNaN(z)) { D[o4] = 214; D[o4 + 1] = 206; D[o4 + 2] = 186; D[o4 + 3] = 255; continue; }
    const zr = Z[k + 1], zd = Z[k + sw + 1], kk = Math.max(1, Math.round(40 / step)), ir = Math.min(sw, i + kk), il = Math.max(0, i - kk), jd = Math.min(sh, j + kk), ju = Math.max(0, j - kk); // уклон для отмывки -- на базе ~80 м: без полос по клеткам рельефа
    const zR = Z[j * (sw + 1) + ir], zL = Z[j * (sw + 1) + il], zD = Z[jd * (sw + 1) + i], zU = Z[ju * (sw + 1) + i], sx = (zR === zR && zL === zL ? (zR - zL) / ((ir - il) * step || 1) : 0), sy = (zU === zU && zD === zD ? (zU - zD) / ((jd - ju) * step || 1) : 0), sl = Math.hypot(sx, sy), ice = IC[k] > 0.5, lake = LK[k] > 0.5;
    let r = 244, g = 238, b = 220; // бумага
    if (lake) { r = 150; g = 196; b = 228; } else if (ice) { r = 246; g = 250; b = 253; } else if (sl > 0.75 && z > 3400) { r = 226; g = 214; b = 198; } else if (z < 3000) { r = 222; g = 236; b = 200; }
    const shd = Math.max(0.7, Math.min(1.07, 0.95 + (-sx - sy) * 0.16)); r *= shd; g *= shd; b *= shd;
    if (!lake && zr === zr && zd === zd) { const c0 = Math.floor(z / CI), c1 = Math.floor(zr / CI), c2 = Math.floor(zd / CI);
      if (c0 !== c1 || c0 !== c2) { const top = Math.max(c0, c1, c2) * CI, maj = top % MAJ === 0, a = maj ? 0.95 : 0.55, [cr, cg, cb] = ice ? [40, 110, 190] : [150, 85, 40]; r = r * (1 - a) + cr * a; g = g * (1 - a) + cg * a; b = b * (1 - a) + cb * a; } }
    if (!ice && !lake && sl > 1.0 && z > 3400 && (i + j) % 5 === 0) { r *= 0.82; g *= 0.8; b *= 0.78; } // штриховка скал
    D[o4] = r; D[o4 + 1] = g; D[o4 + 2] = b; D[o4 + 3] = 255; }
  if (q === 1) c.putImageData(img, 0, 0); else { const t = document.createElement('canvas'); t.width = sw; t.height = sh; t.getContext('2d').putImageData(img, 0, 0); c.imageSmoothingEnabled = true; c.drawImage(t, 0, 0, sw * q, sh * q); }
  const P = (X, Y) => [(X - x0) / mpp, (y1 - Y) / mpp], u = dpr;
  // километровая сетка с подписями у рамки
  const gs = mpp * w > 30000 ? 5000 : mpp * w > 12000 ? 2000 : mpp * w > 5000 ? 1000 : 500; c.strokeStyle = 'rgba(30,40,60,.25)'; c.lineWidth = u; c.beginPath();
  for (let X = Math.ceil(x0 / gs) * gs; X < x0 + w * mpp; X += gs) { const [a] = P(X, 0); c.moveTo(a, 0); c.lineTo(a, h); } for (let Y = Math.floor(y1 / gs) * gs; Y > y1 - h * mpp; Y -= gs) { const [, b2] = P(0, Y); c.moveTo(0, b2); c.lineTo(w, b2); } c.stroke();
  c.font = `italic ${10 * u}px Georgia,serif`; c.fillStyle = 'rgba(30,40,60,.7)'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  for (let X = Math.ceil(x0 / gs) * gs; X < x0 + w * mpp; X += gs) { const [a] = P(X, 0); c.fillText(String(((Math.round(X / 1000) % 100) + 100) % 100).padStart(2, '0'), a + 2 * u, 11 * u); }
  // подписи утолщённых горизонталей -- несколько штук по экрану
  c.font = `italic ${9 * u}px Georgia,serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; let lab = 0;
  for (let j = 30; j < sh - 30 && lab < 18; j += 47) for (let i = 30; i < sw - 30 && lab < 18; i += 61) { const k = j * (sw + 1) + i, z = Z[k]; if (Number.isNaN(z)) continue;
    const z2 = Z[k + 1]; if (Number.isNaN(z2) || Math.floor(z / MAJ) === Math.floor(z2 / MAJ)) continue; const t = String(Math.max(Math.floor(z / MAJ), Math.floor(z2 / MAJ)) * MAJ);
    c.fillStyle = 'rgba(244,238,220,.9)'; c.fillRect(i * q - 12 * u, j * q - 6 * u, 24 * u, 11 * u); c.fillStyle = 'rgb(140,80,38)'; c.fillText(t, i * q, j * q); lab++; }
  const label = (x, y, t, font, fill, halo = 'rgba(246,240,224,.92)') => { c.font = font; c.lineWidth = 3 * u; c.strokeStyle = halo; c.strokeText(t, x, y); c.fillStyle = fill; c.fillText(t, x, y); };
  const vis = (a, b2) => a > -40 && a < w + 40 && b2 > -20 && b2 < h + 20;
  // вершины: треугольник и отметка; имена -- у главных и вблизи
  const big = mpp < 25; c.textAlign = 'left';
  for (const [n, X, Y, e] of KPEAKS) { const [a, b2] = P(X, Y); if (!vis(a, b2)) continue; if (!big && e < 6400) continue;
    c.fillStyle = '#1d1d1d'; c.beginPath(); c.moveTo(a, b2 - 4 * u); c.lineTo(a + 3.5 * u, b2 + 2.5 * u); c.lineTo(a - 3.5 * u, b2 + 2.5 * u); c.closePath(); c.fill();
    label(a + 5 * u, b2 - 2 * u, e >= 6000 || mpp < 12 ? `${n} ${e}` : String(e), `italic 700 ${(e >= 6800 ? 12 : 10) * u}px Georgia,serif`, '#1d1d1d'); }
  // лагеря и площадка
  for (const [n, X, Y, e] of KCAMPS) { const [a, b2] = P(X, Y); if (!vis(a, b2)) continue; c.fillStyle = '#c81e28'; c.beginPath(); c.moveTo(a, b2 - 5 * u); c.lineTo(a + 4 * u, b2 + 3 * u); c.lineTo(a - 4 * u, b2 + 3 * u); c.closePath(); c.fill(); c.strokeStyle = '#fff8e6'; c.lineWidth = u; c.stroke();
    if (big) label(a + 6 * u, b2 + 2 * u, n + (e ? ` · ${e}` : ''), `italic ${10 * u}px Georgia,serif`, '#7a0f16'); }
  if (KHELI) { const [a, b2] = P(KHELI[0], KHELI[1]); if (vis(a, b2)) { c.fillStyle = '#1f5fbf'; c.fillRect(a - 6 * u, b2 - 6 * u, 12 * u, 12 * u); c.fillStyle = '#fff'; c.font = `700 ${9 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('Н', a, b2 + 0.5 * u); c.textAlign = 'left'; if (big) label(a + 8 * u, b2 + 3 * u, 'база Южный Иныльчек', `italic 700 ${10 * u}px Georgia,serif`, '#123f7a'); } }
  { const m = KHAN_POI.merz, [a, b2] = P(m[0], m[1]); if (vis(a, b2)) { c.textAlign = 'center'; label(a, b2 - 14 * u, 'оз. Мерцбахера', `italic 700 ${11 * u}px Georgia,serif`, '#1f5fbf'); c.textAlign = 'left'; } }
  if (!big) { c.textAlign = 'center'; for (const [t, X, Y] of [['ледник Южный Иныльчек', 226000, -50500], ['ледник Северный Иныльчек', 232000, -41500]]) { const [a, b2] = P(X, Y); if (vis(a, b2)) label(a, b2, t, `italic ${12 * u}px Georgia,serif`, '#1f4f8f'); } c.textAlign = 'left'; }
  // выбранная точка и рамка
  if (start) { const [a, b2] = P(start.X, start.Y); c.fillStyle = '#ffd21f'; c.strokeStyle = '#1d1d1d'; c.lineWidth = 2 * u; c.beginPath(); c.arc(a, b2, 7 * u, 0, 7); c.fill(); c.stroke(); }
  if (mark) mark(c, P);
  c.strokeStyle = '#1d1d1d'; c.lineWidth = 2 * u; c.strokeRect(u, u, w - 2 * u, h - 2 * u);
  // масштабная линейка
  const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000].find((m) => m / mpp > 60 * u) || 10000, bw = nice / mpp;
  c.fillStyle = 'rgba(7,26,58,.7)'; c.fillRect(8 * u, h - 26 * u, bw + 16 * u, 18 * u); c.fillStyle = '#fff'; c.fillRect(16 * u, h - 13 * u, bw, 2 * u); c.font = `600 ${10 * u}px sans-serif`; c.textAlign = 'left'; c.fillText(nice >= 1000 ? nice / 1000 + ' км' : nice + ' м', 16 * u, h - 17 * u);
  return { CI, mpp }; }

// точка экрана (доли холста) -> мир
export function khanPick(view, px, py, aspect) { const X = view.cx - view.R + px * 2 * view.R, Y = view.cy + aspect * view.R - py * 2 * view.R * aspect; return { X, Y }; }
