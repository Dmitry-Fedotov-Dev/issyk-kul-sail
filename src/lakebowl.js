// Чаша озера Мерцбахера по карте высот -- общая для игры (khan.js, merz.js) и расчёта прорыва (tools/merz-sim.mjs).
// Глубина полного озера -- 80-100 м (Ng & Liu 2009, J. Glaciology 55(192)): дно прорезаем до top - 4 - 84 = 88 м к середине.
const DEPTH = 84;
// Чаша озера по карте высот: заливка от точки озера всем, что ниже уровня полного озера (+45 м над нынешней гладью
// в данных), в радиусе 4.5 км. carve -- прорезать дно: в данных рельефа на месте озера -- плоская гладь, и вода с ней
// совпадала бы (мерцание); дно делаем чашей до 60 м глубиной к середине.
export function lakeBowl(grid, X, Y, carve = false, top0 = null) { const { hs, W, H, X0, Y1, STEP } = grid, i0 = Math.round((X - X0) / STEP), j0 = Math.round((Y1 - Y) / STEP);
  // контур озера из OSM (128 в маске), расширенный на 2 клетки: полное озеро чуть больше снимка
  const osm = grid.osm, near = osm ? new Uint8Array(W * H) : null; if (near) for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) if (osm[j * W + i] === 128) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) near[(j + b) * W + i + a] = 1;
  const top = top0 ?? hs[j0 * W + i0] + 45, R = 45, cells = new Uint8Array(W * H), q = [j0 * W + i0]; cells[q[0]] = 1;
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % W, j = (k / W) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b, kk = jj * W + ii;
    if (ii < 0 || jj < 0 || ii >= W || jj >= H || cells[kk] || Math.hypot(ii - i0, jj - j0) > R || hs[kk] > top) continue; if (near && !near[kk]) continue; cells[kk] = 1; q.push(kk); } }
  if (carve) { const dist = new Float32Array(W * H).fill(1e9), b = []; // расстояние до берега (в клетках)
    for (const k of q) { const i = k % W, j = (k / W) | 0; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells[(j + c) * W + i + a]) { dist[k] = 1; b.push(k); break; } }
    for (let h = 0; h < b.length; h++) { const k = b[h], i = k % W, j = (k / W) | 0; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (j + c) * W + i + a; if (cells[kk] && dist[kk] > dist[k] + 1) { dist[kk] = dist[k] + 1; b.push(kk); } } }
    for (const k of q) hs[k] = Math.min(hs[k], top - 4 - DEPTH * Math.pow(Math.min(1, (dist[k] - 1) / 6), 0.7)); }
  return { top, cells, q, W }; }

