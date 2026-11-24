// Отдельные PNG облаков (прозрачный фон, дневная палитра, тёмный контур) и общий лист для просмотра.
// node art/clouds/export.mjs  ->  art/clouds/<имя>.png, art/clouds/sheet.png
import { makeCloudAtlas, AW, CLOUD_KINDS } from '../../src/cloudart.js';
import zlib from 'node:zlib'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { data, px, used } = makeCloudAtlas();
const PAL = { L: [255, 255, 255], M: [172, 206, 244], S: [96, 145, 220], D: [62, 104, 188], I: [16, 28, 78], R: [128, 196, 210] }; // R -- рефлекс // sRGB: свет, основной, тень, глубокая тень, контур

function render(name) { const [x0, y0, w, h] = px[name], out = Buffer.alloc(w * h * 4), A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[((y0 + y) * AW + x0 + x) * 4 + 3]);
  const ci = name.startsWith('ci'), rain = name === 'rain';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = ((y0 + y) * AW + x0 + x) * 4, t = data[o] / 255, a = data[o + 3], p = ((h - 1 - y) * w + x) * 4;
    if (rain) { if (a) { out.set(PAL.S, p); out[p + 3] = a * 0.6; } continue; }
    if (a < 8) continue;
    let c = t > 0.56 ? PAL.L : t > 0.32 ? PAL.M : t > 0.17 ? PAL.S : PAL.D; const rf = data[o + 2] / 255 * 0.85;
    if (rf > 0 && t <= 0.4) c = c.map((v, i) => Math.round(v + (PAL.R[i] - v) * rf));
    if (!ci) { let e = false; for (let dy = -2; dy <= 2 && !e; dy++) for (let dx = -2; dx <= 2 && !e; dx++) if (dx * dx + dy * dy <= 5 && A(x + dx, y + dy) < 8) e = true; if (e) c = PAL.I; }
    out.set(c, p); out[p + 3] = ci ? 215 : 255; }
  return { w, h, rgba: out }; }

function png(file, w, h, rgba) { const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const tab = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])); }

// лист: по строке на тип, на тёмно-синем фоне, как в атласе-референсе
const rows = Object.entries(CLOUD_KINDS).map(([k, n]) => Array.from({ length: n }, (_, i) => k + i)), G = 16, SW = 2048;
const lay = []; let y = G; for (const row of rows) { let x = G, rh = 0; for (const nm of row) { const [, , w, h] = px[nm]; if (x + w > SW - G) { x = G; y += rh + G; rh = 0; } lay.push([nm, x, y]); x += w + G; rh = Math.max(rh, h); } y += rh + G * 2; }
const SH = y, sheet = Buffer.alloc(SW * SH * 4); for (let i = 0; i < SW * SH; i++) sheet.set([62, 128, 224, 255], i * 4);
for (const [nm, x, yy] of lay) { const s = render(nm); png(path.join(DIR, nm + '.png'), s.w, s.h, s.rgba);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const p = (j * s.w + i) * 4, a = s.rgba[p + 3] / 255; if (!a) continue; const q = ((yy + j) * SW + x + i) * 4; for (let c = 0; c < 3; c++) sheet[q + c] = sheet[q + c] * (1 - a) + s.rgba[p + c] * a; } }
{ const s = render('rain'); png(path.join(DIR, 'rain.png'), s.w, s.h, s.rgba); }
png(path.join(DIR, 'sheet.png'), SW, SH, sheet);
console.log('спрайтов:', lay.length + 1, '· занято атласа:', used, 'строк из 2048');
