// Карта высот горного района (Хан-Тенгри, Иныльчек) из открытых тайлов Terrain Tiles (Mapzen/AWS, terrarium, z11 ~ 57 м).
// Пересчёт в координаты игры: веб-меркатор, начало мира -- 42.6361 с.ш., 77.1105 в.д., масштаб широты 42.65° (как у основной карты).
// Запуск: node tools/zone-dem.mjs  -> src/khandata.js, src/khan.png; затем node tools/zone-osm.mjs (ледники и озеро -- в синий канал)
import zlib from 'node:zlib'; import fs from 'node:fs';
const LAT0 = 42.6361, LON0 = 77.1105, K = Math.cos(42.65 * Math.PI / 180), R = 6378137;
const mx = (lon) => R * lon * Math.PI / 180, my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const toX = (lon) => (mx(lon) - mx(LON0)) * K, toY = (lat) => (my(lat) - my(LAT0)) * K;
const fromX = (X) => (X / K + mx(LON0)) / R * 180 / Math.PI, fromY = (Y) => (2 * Math.atan(Math.exp((Y / K + my(LAT0)) / R)) - Math.PI / 2) * 180 / Math.PI;
const B = { lon0: 79.45, lon1: 80.42, lat0: 41.93, lat1: 42.36 }, STEP = 100, Z = 11;
const X0 = Math.round(toX(B.lon0)), X1 = Math.round(toX(B.lon1)), Y1 = Math.round(toY(B.lat1)), Y0 = Math.round(toY(B.lat0));
const W = Math.floor((X1 - X0) / STEP) + 1, H = Math.floor((Y1 - Y0) / STEP) + 1;
// ---- минимальный PNG: чтение (RGB/RGBA 8 бит) и запись (RGB 8 бит) ----
function readPNG(buf) { let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], src = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let x = 0; x < st; x++) { const a = x >= bpp ? out[y * st + x - bpp] : 0, b = y ? out[(y - 1) * st + x] : 0, c = x >= bpp && y ? out[(y - 1) * st + x - bpp] : 0;
      let v = src[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * st + x] = v & 255; } }
  return { w, h, bpp, data: out }; }
function crc32(b) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function writePNG(w, h, rgb) { const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc(h * (w * 3 + 1)); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]); }
// ---- тайлы ----
const tx = (lon) => (lon + 180) / 360 * 2 ** Z, ty = (lat) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** Z;
const cache = new Map(), dir = '/tmp/zone-tiles'; fs.mkdirSync(dir, { recursive: true });
async function tile(x, y) { const k = x + '/' + y; if (cache.has(k)) return cache.get(k); const f = `${dir}/${Z}_${x}_${y}.png`;
  if (!fs.existsSync(f)) { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`); if (!r.ok) throw new Error('tile ' + k + ' ' + r.status); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
  const t = readPNG(fs.readFileSync(f)); cache.set(k, t); return t; }
async function elev(lon, lat) { const fx = tx(lon), fy = ty(lat), x = Math.floor(fx), y = Math.floor(fy), t = await tile(x, y); const u = (fx - x) * 256 - 0.5, v = (fy - y) * 256 - 0.5;
  const at = async (i, j) => { let X = x, Y = y; if (i < 0) { X--; i += 256; } if (i > 255) { X++; i -= 256; } if (j < 0) { Y--; j += 256; } if (j > 255) { Y++; j -= 256; } const T = X === x && Y === y ? t : await tile(X, Y), o = (j * 256 + i) * T.bpp; return T.data[o] * 256 + T.data[o + 1] + T.data[o + 2] / 256 - 32768; };
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j; return (await at(i, j)) * (1 - a) * (1 - b) + (await at(i + 1, j)) * a * (1 - b) + (await at(i, j + 1)) * (1 - a) * b + (await at(i + 1, j + 1)) * a * b; }
const rgb = Buffer.alloc(W * H * 3); let mn = 1e9, mxh = -1e9;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const X = X0 + i * STEP, Y = Y1 - j * STEP, e = await elev(fromX(X), fromY(Y)), hh = e - 1607; mn = Math.min(mn, e); mxh = Math.max(mxh, e);
  const q = Math.max(0, Math.min(65535, Math.round((hh + 64) * 4))), o = (j * W + i) * 3; rgb[o] = q >> 8; rgb[o + 1] = q & 255; rgb[o + 2] = 0; }
const png = writePNG(W, H, rgb);
fs.writeFileSync('src/khan.png', png); // карта -- отдельным файлом: грузится, только когда летят в район (основная загрузка игры не растёт)
fs.writeFileSync('src/khandata.js', `// Район Хан-Тенгри -- Иныльчек: открытые данные Terrain Tiles (Mapzen/AWS, z11), пересчитанные в координаты игры (tools/zone-dem.mjs).
// Карта высот -- src/khan.png: высота над озером Иссык-Куль (R*256+G)/4-64 м; сетка W x H, шаг STEP м, X0 -- запад, Y1 -- север.
// ${B.lat0}-${B.lat1} с.ш., ${B.lon0}-${B.lon1} в.д.
export const KHAN = ${JSON.stringify({ W, H, X0, Y1, STEP })};
// точки: Хан-Тенгри, пик Победы, озеро Мерцбахера, базовые лагеря
export const KHAN_POI = ${JSON.stringify({
  khan: [toX(80.1747), toY(42.2111)], pobeda: [toX(80.1294), toY(42.0350)], merz: [toX(79.8640), toY(42.2210)],
  bcS: [toX(79.9660), toY(42.1600)], bcN: [toX(79.9930), toY(42.2480)], tongue: [toX(79.6560), toY(42.2010)] }, (k, v) => typeof v === 'number' ? Math.round(v) : v)};
`);
console.log({ W, H, X0, Y1, Y0, X1, mn: Math.round(mn), max: Math.round(mxh), kb: Math.round(png.length / 1024) });
