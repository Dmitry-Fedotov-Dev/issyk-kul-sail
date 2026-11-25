// Данные OpenStreetMap для района Хан-Тенгри (© участники OpenStreetMap, ODbL): ледники, озеро Мерцбахера, вершины,
// лагеря и вертолётная площадка -> в координаты игры.
//  * маска ледников и озера -- в синий канал src/khan.png (255 -- ледник, 128 -- озеро; рельеф -- в R, G);
//  * вершины, седловины, лагеря, контур озера -- src/khanosm.js.
// Запуск: node tools/zone-osm.mjs [osm.json]  (без файла -- запрос к Overpass API с зеркалами)
import zlib from 'node:zlib'; import fs from 'node:fs';
import { KHAN } from '../src/khandata.js';
const LAT0 = 42.6361, LON0 = 77.1105, K = Math.cos(42.65 * Math.PI / 180), R = 6378137;
const mx = (lon) => R * lon * Math.PI / 180, my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const toX = (lon) => (mx(lon) - mx(LON0)) * K, toY = (lat) => (my(lat) - my(LAT0)) * K;
const Q = '[out:json][timeout:150];(way["natural"="glacier"](41.93,79.45,42.36,80.42);relation["natural"="glacier"](41.93,79.45,42.36,80.42);node["natural"~"peak|saddle"](41.93,79.45,42.36,80.42);way["natural"="water"](41.93,79.45,42.36,80.42);nwr["tourism"~"camp_site|alpine_hut|wilderness_hut"](41.93,79.45,42.36,80.42);nwr["aeroway"="helipad"](41.93,79.45,42.36,80.42););out body;>;out skel qt;';
let data; if (process.argv[2]) data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
else for (const u of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) { try { const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'User-Agent': 'issyk-sail-game/1.0' } }); const t = await r.text(); if (t[0] === '{') { data = JSON.parse(t); break; } } catch (e) { /* следующее зеркало */ } }
if (!data) throw new Error('Overpass недоступен');
const nodes = new Map(), ways = new Map(); for (const e of data.elements) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); }
const xy = (id) => { const n = nodes.get(id); return n ? [toX(n.lon), toY(n.lat)] : null; };
const ringOf = (w) => w.nodes.map(xy).filter(Boolean);
// кольца отношения: склеиваем ways по концам
function rings(rel, role) { const segs = rel.members.filter((m) => m.type === 'way' && (m.role || 'outer') === role).map((m) => ways.get(m.ref)).filter(Boolean).map((w) => w.nodes.slice()); const out = [];
  while (segs.length) { let r = segs.shift(); let grow = true; while (grow && r[0] !== r[r.length - 1]) { grow = false; for (let i = 0; i < segs.length; i++) { const s = segs[i];
        if (s[0] === r[r.length - 1]) { r = r.concat(s.slice(1)); } else if (s[s.length - 1] === r[r.length - 1]) { r = r.concat(s.slice(0, -1).reverse()); } else if (s[s.length - 1] === r[0]) { r = s.concat(r.slice(1)); } else if (s[0] === r[0]) { r = s.slice().reverse().concat(r.slice(1)); } else continue;
        segs.splice(i, 1); grow = true; break; } } out.push(r.map(xy).filter(Boolean)); } return out; }
const glac = [], lakes = []; // [{outer: [[x,y]...][], inner: [...]}]
for (const e of data.elements) { const t = e.tags || {}; if (t.natural !== 'glacier' && t.natural !== 'water') continue;
  const poly = e.type === 'way' ? { outer: [ringOf(e)], inner: [] } : e.type === 'relation' ? { outer: rings(e, 'outer'), inner: rings(e, 'inner') } : null; if (!poly) continue;
  (t.natural === 'glacier' ? glac : lakes).push({ ...poly, name: t['name:ru'] || t.name || '' }); }
// растр: центр клетки внутри многоугольника (чёт-нечет по всем кольцам)
const { W, H, X0, Y1, STEP } = KHAN, mask = new Uint8Array(W * H);
function inRing(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function fill(p, v) { const all = [...p.outer, ...p.inner].filter((r) => r.length > 2); if (!all.length) return; let a = 1e18, b = -1e18, c = 1e18, d = -1e18; for (const r of p.outer) for (const [x, y] of r) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  const i0 = Math.max(0, Math.floor((a - X0) / STEP)), i1 = Math.min(W - 1, Math.ceil((b - X0) / STEP)), j0 = Math.max(0, Math.floor((Y1 - d) / STEP)), j1 = Math.min(H - 1, Math.ceil((Y1 - c) / STEP));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = X0 + i * STEP, y = Y1 - j * STEP; let n = 0; for (const r of all) if (inRing(r, x, y)) n++; if (n % 2) mask[j * W + i] = Math.max(mask[j * W + i], v); } }
for (const g of glac) fill(g, 255); for (const l of lakes) fill(l, 128);
// синий канал khan.png
function readPNG(buf) { let p = 8, w = 0, h = 0; const idat = []; while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * 3), st = w * 3; // сохранено без фильтров (zone-dem.mjs)
  for (let y = 0; y < h; y++) raw.copy(out, y * st, y * (st + 1) + 1, (y + 1) * (st + 1)); return out; }
function crc32(b) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function writePNG(w, h, rgb) { const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]); }
const rgb = readPNG(fs.readFileSync('src/khan.png')); for (let k = 0; k < W * H; k++) rgb[k * 3 + 2] = mask[k]; fs.writeFileSync('src/khan.png', writePNG(W, H, rgb));
// точки
const peaks = [], camps = []; let helipad = null;
for (const e of data.elements) { if (e.type !== 'node' || !e.tags) continue; const t = e.tags, nm = t['name:ru'] || (t.name || '').split(' - ').find((s) => /[а-яё]/i.test(s)) || '', X = Math.round(toX(e.lon)), Y = Math.round(toY(e.lat)), ele = parseFloat(t.ele) || 0;
  if (t.natural === 'peak' && nm && ele >= 5000) peaks.push([nm, X, Y, ele]); else if (t.natural === 'saddle' && nm) peaks.push([nm, X, Y, ele, 1]);
  if (t.tourism === 'camp_site' || t.tourism === 'alpine_hut') camps.push([nm || 'лагерь', X, Y, ele]); if (t.aeroway === 'helipad') helipad = [X, Y]; }
peaks.sort((a, b) => b[3] - a[3]);
const lake = lakes.find((l) => /Мерцбахер/.test(l.name)), lakeRing = lake ? lake.outer[0].map(([x, y]) => [Math.round(x), Math.round(y)]) : [];
fs.writeFileSync('src/khanosm.js', `// Район Хан-Тенгри по OpenStreetMap (© участники OpenStreetMap, ODbL), tools/zone-osm.mjs: вершины [имя, X, Y, высота, седловина?],
// лагеря альпинистов [имя, X, Y, высота], вертолётная площадка базы Южный Иныльчек, контур Верхнего озера Мерцбахера.
// Маска ледников (255) и озера (128) -- в синем канале khan.png.
export const KPEAKS = ${JSON.stringify(peaks)};
export const KCAMPS = ${JSON.stringify(camps)};
export const KHELI = ${JSON.stringify(helipad)};
export const KLAKE = ${JSON.stringify(lakeRing.filter((_, i) => i % 3 === 0))};
`);
console.log({ glaciers: glac.length, lakes: lakes.length, glCells: mask.reduce((a, v) => a + (v === 255), 0), lakeCells: mask.reduce((a, v) => a + (v === 128), 0), peaks: peaks.length, camps: camps.length, helipad, lakeRing: lakeRing.length });
