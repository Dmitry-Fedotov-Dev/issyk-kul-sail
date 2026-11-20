// Нарезка листа пешего Дымка (art/dymok/foot.png): фон панелей -- заливкой от краёв полосы, кадры -- крупнейшие
// связные области, значки/стрелки/пыль -- прочь, общий масштаб, опора -- лапы (низ кадра, центр масс по X).
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const DIR = '/home/feduk/Code/issyk-kul-sail/art/dymok/', src = 'data:image/png;base64,' + fs.readFileSync(DIR + 'foot.png').toString('base64');
const BANDS = [['dis', 700, 42, 1530, 200, 5], ['idle', 8, 250, 492, 362, 4], ['rest', 503, 250, 982, 362, 3], ['look', 995, 250, 1530, 362, 4],
  ['walk', 8, 403, 726, 514, 5], ['run', 738, 403, 1530, 514, 5], ['back', 8, 553, 726, 668, 7], ['jump', 738, 553, 1182, 668, 4], ['land', 1193, 553, 1530, 668, 3],
  ['inter', 1043, 708, 1530, 838, 4], ['emo', 8, 872, 1106, 1008, 8]];
const SC = 0.62;
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async ([src, BANDS, SC]) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, cv = new OffscreenCanvas(W, im.height), x = cv.getContext('2d'); x.drawImage(im, 0, 0);
  const D = x.getImageData(0, 0, W, im.height).data, OUT = [];
  for (const [name, x0, y0, x1, y1, n] of BANDS) {
    const w = x1 - x0, h = y1 - y0, bg = new Uint8Array(w * h), px = (i, j) => ((y0 + j) * W + x0 + i) * 4;
    const ed = []; for (let i = 0; i < w; i += 3) ed.push(px(i, 0), px(i, h - 1)); const med = [0, 1, 2].map((c) => ed.map((o) => D[o + c]).sort((a, b) => a - b)[ed.length >> 1]);
    const isBg = (o) => { const dr = D[o] - med[0], dg = D[o + 1] - med[1], db = D[o + 2] - med[2]; return dr * dr + dg * dg + db * db < 30 * 30; };
    const st = []; for (let i = 0; i < w; i++) st.push(i, 0, i, h - 1); for (let j = 0; j < h; j++) st.push(0, j, w - 1, j);
    while (st.length) { const j = st.pop(), i = st.pop(); if (i < 0 || j < 0 || i >= w || j >= h) continue; const k = j * w + i; if (bg[k] || !isBg(px(i, j))) continue; bg[k] = 1; st.push(i + 1, j, i - 1, j, i, j + 1, i, j - 1); }
    const lab = new Int32Array(w * h).fill(-1), comps = [];
    for (let k0 = 0; k0 < w * h; k0++) { if (bg[k0] || lab[k0] >= 0) continue; const c = { n: 0, a: 1e9, b: 1e9, c: -1, d: -1, id: comps.length }, q = [k0]; lab[k0] = c.id;
      while (q.length) { const kk = q.pop(), ii = kk % w, jj = (kk / w) | 0; c.n++; c.a = Math.min(c.a, ii); c.b = Math.min(c.b, jj); c.c = Math.max(c.c, ii); c.d = Math.max(c.d, jj);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = ii + di, j2 = jj + dj; if (i2 < 0 || j2 < 0 || i2 >= w || j2 >= h) continue; const k2 = j2 * w + i2; if (!bg[k2] && lab[k2] < 0) { lab[k2] = c.id; q.push(k2); } } }
      comps.push(c); }
    const big = comps.filter((c) => c.n > 500).sort((a, b) => b.n - a.n).slice(0, n).sort((a, b) => a.a - b.a);
    for (const m of big) { const keep = new Set([m.id]); for (const c of comps) if (c !== m && c.n > m.n * 0.1 && c.a >= m.a - 3 && c.c <= m.c + 3 && c.b >= m.b - 3 && c.d <= m.d + 3) keep.add(c.id);
      const fw = m.c - m.a + 1, fh = m.d - m.b + 1, A = new Uint8ClampedArray(fw * fh * 4); let sx = 0, sn = 0;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const k = (m.b + j) * w + m.a + i; if (!keep.has(lab[k])) continue; const o = px(m.a + i, m.b + j), t = (j * fw + i) * 4; A[t] = D[o]; A[t + 1] = D[o + 1]; A[t + 2] = D[o + 2]; A[t + 3] = 255; sx += i; sn++; }
      const W2 = Math.round(fw * SC), H2 = Math.round(fh * SC), c0 = new OffscreenCanvas(fw, fh); c0.getContext('2d').putImageData(new ImageData(A, fw, fh), 0, 0);
      const c1 = new OffscreenCanvas(W2, H2), x1 = c1.getContext('2d'); x1.imageSmoothingQuality = 'high'; x1.drawImage(c0, 0, 0, W2, H2); const I2 = x1.getImageData(0, 0, W2, H2);
      for (let k = 3; k < I2.data.length; k += 4) { if (I2.data[k] < 110) I2.data[k] = 0; else { const al = I2.data[k] / 255; for (let e = 1; e <= 3; e++) I2.data[k - e] = Math.min(255, I2.data[k - e] / al); I2.data[k] = 255; } }
      OUT.push({ name, w: W2, h: H2, ax: (sx / sn) * SC, ay: H2, data: Array.from(I2.data) }); } }
  const AW = 1024; let X = 2, Y = 2, rowH = 0; for (const f of OUT) { if (X + f.w + 2 > AW) { X = 2; Y += rowH + 2; rowH = 0; } f.x = X; f.y = Y; X += f.w + 2; rowH = Math.max(rowH, f.h); }
  const ac = new OffscreenCanvas(AW, Y + rowH + 2), ax = ac.getContext('2d'); for (const f of OUT) ax.putImageData(new ImageData(Uint8ClampedArray.from(f.data), f.w, f.h), f.x, f.y);
  const bl = await ac.convertToBlob(); const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); });
  return { url, frames: OUT.map(({ data, ...f }) => f) };
}, [src, BANDS, SC]);
fs.writeFileSync(DIR + 'foot_atlas.png', Buffer.from(out.url.split(',')[1], 'base64'));
const cnt = {}, F = {}; for (const f of out.frames) { const i = (cnt[f.name] = (cnt[f.name] ?? -1) + 1); F[f.name + i] = [f.x, f.y, f.w, f.h, Math.round(f.ax * 10) / 10, f.ay]; }
console.log(Object.entries(cnt).map(([k, v]) => k + ':' + (v + 1)).join(' '), 'atlas', out.frames.length);
fs.writeFileSync(DIR + 'foot_atlas.json', JSON.stringify(F)); await b.close();
