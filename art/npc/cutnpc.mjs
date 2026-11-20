// Нарезка листов NPC пляжа (art/npc/beach.png -- день, night.png -- ночь): в полосе фон панели -- заливкой от краёв,
// персонажи/предметы -- связные области; значки, сердечки, ноты -- прочь по размеру. Масштаб полосы -- по росту
// стоящего человека в ней (ref), чтобы все персонажи вышли одного роста. Опора -- низ кадра, центр масс по X.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const DIR = '/home/feduk/Code/issyk-kul-sail/art/npc/', HUMAN = 64; // рост человека в пикселях атласа
// [имя, лист, x0, y0, x1, y1, кадров (0 -- все крупные), рост человека в полосе]
const BANDS = [['type', 'beach', 1105, 42, 1532, 193, 5, 150], ['lie', 'beach', 8, 296, 872, 386, 6, 100], ['sun', 'beach', 884, 296, 1532, 386, 5, 100],
  ['goth', 'beach', 8, 418, 838, 516, 8, 95], ['blond', 'beach', 8, 553, 952, 642, 9, 92], ['chill', 'beach', 964, 553, 1532, 645, 3, 100],
  ['vend', 'beach', 8, 680, 806, 820, 7, 135], ['gran', 'beach', 818, 680, 1532, 820, 6, 125], ['obj', 'beach', 8, 868, 668, 1018, 0, 135],
  ['ngoth', 'night', 625, 345, 1122, 440, 5, 120], ['nguit', 'night', 8, 478, 566, 562, 5, 112], ['neat', 'night', 578, 478, 1122, 562, 5, 112],
  ['nbig', 'night', 8, 598, 582, 706, 5, 125], ['ndym', 'night', 592, 598, 1122, 706, 5, 125], ['nobj', 'night', 8, 878, 1028, 1018, 0, 125]];
const SH = { beach: 'data:image/png;base64,' + fs.readFileSync(DIR + 'beach.png').toString('base64'), night: 'data:image/png;base64,' + fs.readFileSync(DIR + 'night.png').toString('base64') };
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async ([SH, BANDS, HUMAN]) => {
  const IM = {}; for (const k in SH) { const im = new Image(); im.src = SH[k]; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); IM[k] = { W: im.width, D: x.getImageData(0, 0, im.width, im.height).data }; }
  const OUT = [];
  for (const [name, sheet, x0, y0, x1, y1, n, ref] of BANDS) {
    const { W, D } = IM[sheet], SC = HUMAN / ref, w = x1 - x0, h = y1 - y0, bg = new Uint8Array(w * h), px = (i, j) => ((y0 + j) * W + x0 + i) * 4;
    const ed = []; for (let i = 0; i < w; i += 3) ed.push(px(i, 0), px(i, h - 1)); const med = [0, 1, 2].map((c) => ed.map((o) => D[o + c]).sort((a, b) => a - b)[ed.length >> 1]);
    // фон панели -- тёмный с мягким свечением за фигурами: растим область от краёв, пока цвет меняется плавно
    // (шаг < STEP) и не уходит далеко от фона; контур персонажа -- резкий скачок, на нём заливка встаёт
    const far = (o) => { const dr = D[o] - med[0], dg = D[o + 1] - med[1], db = D[o + 2] - med[2]; return dr * dr + dg * dg + db * db > 95 * 95; };
    const STEP = 15, st = []; for (let i = 0; i < w; i++) st.push(i, 0, -1, i, h - 1, -1); for (let j = 0; j < h; j++) st.push(0, j, -1, w - 1, j, -1);
    while (st.length) { const from = st.pop(), j = st.pop(), i = st.pop(); if (i < 0 || j < 0 || i >= w || j >= h) continue; const k = j * w + i; if (bg[k]) continue; const o = px(i, j);
      if (far(o)) continue; if (from >= 0) { const f = px(from % w, (from / w) | 0); if (Math.abs(D[o] - D[f]) + Math.abs(D[o + 1] - D[f + 1]) + Math.abs(D[o + 2] - D[f + 2]) > STEP * 3) continue; }
      bg[k] = 1; st.push(i + 1, j, k, i - 1, j, k, i, j + 1, k, i, j - 1, k); }
    const lab = new Int32Array(w * h).fill(-1), comps = [];
    for (let k0 = 0; k0 < w * h; k0++) { if (bg[k0] || lab[k0] >= 0) continue; const c = { n: 0, a: 1e9, b: 1e9, c: -1, d: -1, id: comps.length }, q = [k0]; lab[k0] = c.id;
      while (q.length) { const kk = q.pop(), ii = kk % w, jj = (kk / w) | 0; c.n++; c.a = Math.min(c.a, ii); c.b = Math.min(c.b, jj); c.c = Math.max(c.c, ii); c.d = Math.max(c.d, jj);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = ii + di, j2 = jj + dj; if (i2 < 0 || j2 < 0 || i2 >= w || j2 >= h) continue; const k2 = j2 * w + i2; if (!bg[k2] && lab[k2] < 0) { lab[k2] = c.id; q.push(k2); } } }
      comps.push(c); }
    let big = comps.filter((c) => c.n > 260).sort((a, b) => b.n - a.n); if (n) big = big.slice(0, n); big.sort((a, b) => a.a - b.a);
    for (const m of big) { const keep = new Set([m.id]); for (const c of comps) if (c !== m && c.n > m.n * 0.08 && c.a >= m.a - 3 && c.c <= m.c + 3 && c.b >= m.b - 3 && c.d <= m.d + 3) keep.add(c.id);
      const fw = m.c - m.a + 1, fh = m.d - m.b + 1, A = new Uint8ClampedArray(fw * fh * 4); let sx = 0, sn = 0;
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const k = (m.b + j) * w + m.a + i; if (!keep.has(lab[k])) continue; const o = px(m.a + i, m.b + j), t = (j * fw + i) * 4; A[t] = D[o]; A[t + 1] = D[o + 1]; A[t + 2] = D[o + 2]; A[t + 3] = 255; sx += i; sn++; }
      const W2 = Math.max(1, Math.round(fw * SC)), H2 = Math.max(1, Math.round(fh * SC)), c0 = new OffscreenCanvas(fw, fh); c0.getContext('2d').putImageData(new ImageData(A, fw, fh), 0, 0);
      const c1 = new OffscreenCanvas(W2, H2), x1 = c1.getContext('2d'); x1.imageSmoothingQuality = 'high'; x1.drawImage(c0, 0, 0, W2, H2); const I2 = x1.getImageData(0, 0, W2, H2);
      for (let k = 3; k < I2.data.length; k += 4) { if (I2.data[k] < 110) I2.data[k] = 0; else { const al = I2.data[k] / 255; for (let e = 1; e <= 3; e++) I2.data[k - e] = Math.min(255, I2.data[k - e] / al); I2.data[k] = 255; } }
      OUT.push({ name, w: W2, h: H2, ax: (sx / sn) * SC, ay: H2, data: Array.from(I2.data) }); } }
  const AW = 1024; let X = 2, Y = 2, rowH = 0; for (const f of OUT) { if (X + f.w + 2 > AW) { X = 2; Y += rowH + 2; rowH = 0; } f.x = X; f.y = Y; X += f.w + 2; rowH = Math.max(rowH, f.h); }
  const ac = new OffscreenCanvas(AW, Y + rowH + 2), ax = ac.getContext('2d'); for (const f of OUT) ax.putImageData(new ImageData(Uint8ClampedArray.from(f.data), f.w, f.h), f.x, f.y);
  const bl = await ac.convertToBlob(); const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); });
  return { url, frames: OUT.map(({ data, ...f }) => f) };
}, [SH, BANDS, HUMAN]);
fs.writeFileSync(DIR + 'npc_atlas.png', Buffer.from(out.url.split(',')[1], 'base64'));
const cnt = {}, F = {}; for (const f of out.frames) { const i = (cnt[f.name] = (cnt[f.name] ?? -1) + 1); F[f.name + i] = [f.x, f.y, f.w, f.h, Math.round(f.ax * 10) / 10, f.ay]; }
console.log(Object.entries(cnt).map(([k, v]) => k + ':' + (v + 1)).join(' '));
fs.writeFileSync(DIR + 'npc_atlas.json', JSON.stringify(F)); await b.close();
