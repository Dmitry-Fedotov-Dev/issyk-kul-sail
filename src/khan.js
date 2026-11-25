// Район Хан-Тенгри -- Иныльчек: высокогорье Центрального Тянь-Шаня, ~250 км к востоку от Чолпон-Аты.
// Рельеф -- открытые данные Terrain Tiles (tools/zone-dem.mjs), лежит в мире на своём настоящем месте; карта высот
// грузится отдельным файлом khan.png, только когда в район летят (основная загрузка игры не растёт).
// Здесь: ледники Северный и Южный Иныльчек, Хан-Тенгри (7010), пик Победы (7439), озеро Мерцбахера в устье Северного
// Иныльчека, базовые лагеря на леднике.
import { KHAN, KHAN_POI } from './khandata.js';
import { gridTerrain } from './world.js';

export const KHAN_NAMES = { khan: 'Хан-Тенгри', pobeda: 'пик Победы', merz: 'озеро Мерцбахера', bcS: 'базовый лагерь Южный Иныльчек', bcN: 'базовый лагерь Северный Иныльчек', tongue: 'язык ледника Иныльчек' };
const { W, H, X0, Y1, STEP } = KHAN;
export const khanInside = (X, Y) => X > X0 + STEP && X < X0 + (W - 2) * STEP && Y < Y1 - STEP && Y > Y1 - (H - 2) * STEP;

// Ледники по карте высот: пологое дно вогнутых долин выше ~2900 м -- лёд; течение -- вниз по сглаженному рельефу.
// aG: x -- ледник 0..1, y, z -- направление течения (X, Y мира)
function glaciers(hs) { const N = W * H, at = (A, i, j) => A[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  const blur = (A, r) => { const T = new Float32Array(N), O = new Float32Array(N); // коробочное сглаживание радиусом r клеток (по осям)
    for (let j = 0; j < H; j++) { let s = 0; for (let i = -r; i <= r; i++) s += at(A, i, j); for (let i = 0; i < W; i++) { T[j * W + i] = s / (2 * r + 1); s += at(A, i + r + 1, j) - at(A, i - r, j); } }
    for (let i = 0; i < W; i++) { let s = 0; for (let j = -r; j <= r; j++) s += at(T, i, j); for (let j = 0; j < H; j++) { O[j * W + i] = s / (2 * r + 1); s += at(T, i, j + r + 1) - at(T, i, j - r); } } return O; };
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const m6 = blur(hs, 6), m2 = blur(hs, 1), big = blur(hs, 10), g = new Float32Array(N), out = new Float32Array(N * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, sx = (at(m2, i + 1, j) - at(m2, i - 1, j)) / (2 * STEP), sy = (at(m2, i, j - 1) - at(m2, i, j + 1)) / (2 * STEP), sl = Math.hypot(sx, sy), asl = hs[k] + 1607, cv = m6[k] - hs[k];
    g[k] = sm(0.30, 0.14, sl) * sm(2850, 3050, asl) * sm(-15, 30, cv); }
  const gb = blur(g, 1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, fx = -(at(big, i + 1, j) - at(big, i - 1, j)), fy = -(at(big, i, j - 1) - at(big, i, j + 1)), l = Math.hypot(fx, fy) || 1;
    out[k * 3] = Math.min(1, gb[k] * 1.25); out[k * 3 + 1] = fx / l; out[k * 3 + 2] = fy / l; }
  return out; }

let loading = null;
// загрузить и построить (один раз); onProgress -- для экрана ожидания
export function loadKhan(scene, url = 'khan.png') {
  if (loading) return loading;
  loading = new Promise((res, rej) => { const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, hs = new Float32Array(W * H); for (let i = 0; i < W * H; i++) hs[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 4 - 64;
    const aG = glaciers(hs), mesh = gridTerrain(hs, W, H, X0, Y1, STEP, { aG }); scene.add(mesh);
    const h = mesh.userData.heightAt;
    const poi = {}; for (const [k, [X, Y]] of Object.entries(KHAN_POI)) poi[k] = { X, Y, h: h(X, Y), name: KHAN_NAMES[k] };
    res({ mesh, h, hs, grid: { hs, W, H, X0, Y1, STEP }, inside: khanInside, poi }); };
    img.onerror = () => { loading = null; rej(new Error('не загрузился рельеф района Хан-Тенгри')); }; img.src = url; });
  return loading;
}
