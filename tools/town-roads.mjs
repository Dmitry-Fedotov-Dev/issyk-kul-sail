// Дороги Чолпон-Аты по данным OpenStreetMap (© участники OpenStreetMap, ODbL) -> src/roaddata.js: полотна асфальта и грунта.
// Покрытие: тег surface, если есть (asphalt/paved/concrete/paving_stones -> асфальт; unpaved/gravel/ground/dirt/... -> грунт).
// Без тега (~85% дорог): магистрали и третьестепенные -- асфальт; жилые улицы, проезды, переулки -- асфальт в плотной
// застройке (до 500 м от магистрали), дальше -- грунт; полевые (track) -- грунт.
// Привязка -- как у домов (src/shoredata.js): веб-меркатор от 42.6361 с.ш., 77.1105 в.д. со сдвигом по урезу (+20, -140 м).
// Запуск: node tools/town-roads.mjs [roads.json]  (без файла -- запрос к Overpass API с зеркалами)
import fs from 'node:fs';
const LAT0 = 42.6361, LON0 = 77.1105, K = Math.cos(42.65 * Math.PI / 180), R = 6378137, SX = 20, SY = -140;
const mx = (lon) => R * lon * Math.PI / 180, my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const toX = (lon) => (mx(lon) - mx(LON0)) * K + SX, toY = (lat) => (my(lat) - my(LAT0)) * K + SY;
const BB = '42.58,76.93,42.72,77.25';
const Q = `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|road|pedestrian)$"](${BB});out geom tags;`;
let data;
if (process.argv[2]) data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
else { for (const u of ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try { const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'content-type': 'application/x-www-form-urlencoded' } }); if (r.ok) { data = await r.json(); break; } } catch (e) { /* следующее зеркало */ } }
  if (!data) throw new Error('Overpass недоступен'); }
const PAVED = /^(asphalt|paved|concrete|concrete:plates|paving_stones|sett|chipseal)$/, UNPAVED = /^(unpaved|gravel|fine_gravel|ground|dirt|earth|mud|sand|compacted|grass|pebblestone)$/;
const MAIN = /^(motorway|trunk|primary|secondary|tertiary)$/;
// ширина полотна, м
const WIDTH = { motorway: 12, trunk: 10, primary: 9, secondary: 8, tertiary: 7, unclassified: 5.5, residential: 5, living_street: 4.5, road: 5, pedestrian: 4, service: 3.5, track: 3 };
const ways = data.elements.filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1).map((e) => ({ t: e.tags || {}, pts: e.geometry.map((g) => [toX(g.lon), toY(g.lat)]) }));
const mainPts = []; for (const w of ways) if (MAIN.test(w.t.highway)) for (const p of w.pts) mainPts.push(p);
const nearMain = (pts) => { let best = 1e9; for (let i = 0; i < pts.length; i += Math.max(1, pts.length >> 2)) { const [x, y] = pts[i]; for (const [a, b] of mainPts) { const d = (a - x) ** 2 + (b - y) ** 2; if (d < best) best = d; } } return Math.sqrt(best); };
// упрощение до 3 м (Дуглас-Пекер)
function simp(pts, eps = 3) { if (pts.length < 3) return pts; const [a, b] = [pts[0], pts[pts.length - 1]]; let md = 0, mi = 0; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } }
  return md > eps ? [...simp(pts.slice(0, mi + 1), eps).slice(0, -1), ...simp(pts.slice(mi), eps)] : [a, b]; }
const out = { a: [], d: [] }; let na = 0, nd = 0;
for (const w of ways) { const hw = w.t.highway, sf = w.t.surface || '';
  let paved; if (PAVED.test(sf)) paved = true; else if (UNPAVED.test(sf)) paved = false; else if (MAIN.test(hw)) paved = true; else if (hw === 'track') paved = false;
  else paved = nearMain(w.pts) < (hw === 'service' ? 250 : 500);
  const wd = WIDTH[hw] || 4, s = simp(w.pts).map(([x, y]) => `${Math.round(x / 2)},${Math.round(y / 2)}`).join(',');
  (paved ? out.a : out.d).push(`${Math.round(wd * 2)}:${s}`); if (paved) na++; else nd++; }
const src = `// Дороги Чолпон-Аты по данным OpenStreetMap (© участники OpenStreetMap, ODbL). Генерирует tools/town-roads.mjs -- не править руками.
// Формат: «ширина×2 м:X,Y,X,Y...» через «;», координаты мира по 2 м. Асфальт ${na}, грунт ${nd}.
export const ROAD_ASPHALT = '${out.a.join(';')}';
export const ROAD_DIRT = '${out.d.join(';')}';
`;
fs.writeFileSync(new URL('../src/roaddata.js', import.meta.url), src);
console.log(`асфальт ${na}, грунт ${nd}, ${(src.length / 1024).toFixed(0)} КБ`);
