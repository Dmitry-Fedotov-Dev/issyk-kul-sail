// Нарезка спрайт-листа Дымка со спины: в каждой панели убираем фон заливкой от краёв, находим кадры как связные
// области, выбрасываем значки/стрелки, выравниваем по ведёрку, сводим в атлас. Запуск: node art/dymok/tools/cut.mjs
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const DIR = '/home/feduk/Code/issyk-kul-sail/art/dymok/';
const src = 'data:image/png;base64,' + fs.readFileSync(DIR + 'back.png').toString('base64');
// полосы с кадрами: [имя, x0, y0, x1, y1, сколько кадров]
const BANDS = [['idle', 10, 432, 380, 552, 4], ['walk', 392, 432, 782, 552, 4], ['left', 795, 432, 1150, 552, 3], ['right', 1160, 432, 1530, 552, 3],
  ['act', 10, 590, 1530, 748, 7], ['cycle', 10, 852, 765, 985, 8], ['mood', 908, 48, 1520, 258, 4]];
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async ([src, BANDS]) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, cv = new OffscreenCanvas(W, H), x = cv.getContext('2d'); x.drawImage(im, 0, 0);
  const D = x.getImageData(0, 0, W, H).data, res = [];
  for (const [name, x0, y0, x1, y1, n] of BANDS) {
    const w = x1 - x0, h = y1 - y0, bg = new Uint8Array(w * h), px = (i, j) => ((y0 + j) * W + x0 + i) * 4;
    // цвет фона панели -- медиана по краю
    const ed = []; for (let i = 0; i < w; i += 3) { ed.push(px(i, 0), px(i, h - 1)); } const med = [0, 1, 2].map((c) => ed.map((o) => D[o + c]).sort((a, b) => a - b)[ed.length >> 1]);
    const isBg = (o) => { const dr = D[o] - med[0], dg = D[o + 1] - med[1], db = D[o + 2] - med[2]; return dr * dr + dg * dg + db * db < 34 * 34; };
    const st = []; for (let i = 0; i < w; i++) st.push(i, 0, i, h - 1); for (let j = 0; j < h; j++) st.push(0, j, w - 1, j);
    while (st.length) { const j = st.pop(), i = st.pop(); if (i < 0 || j < 0 || i >= w || j >= h) continue; const k = j * w + i; if (bg[k] || !isBg(px(i, j))) continue; bg[k] = 1; st.push(i + 1, j, i - 1, j, i, j + 1, i, j - 1); }
    // остаток фона внутри (тёмные «дыры» близкие к фону и не связанные с краем) оставляем -- это контур
    // связные области переднего плана
    const lab = new Int32Array(w * h).fill(-1), comps = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; if (bg[k] || lab[k] >= 0) continue; const c = { n: 0, a: 1e9, b: 1e9, c: -1, d: -1, id: comps.length }; const q = [k]; lab[k] = c.id;
      while (q.length) { const kk = q.pop(), ii = kk % w, jj = (kk / w) | 0; c.n++; c.a = Math.min(c.a, ii); c.b = Math.min(c.b, jj); c.c = Math.max(c.c, ii); c.d = Math.max(c.d, jj);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = ii + di, j2 = jj + dj; if (i2 < 0 || j2 < 0 || i2 >= w || j2 >= h) continue; const k2 = j2 * w + i2; if (!bg[k2] && lab[k2] < 0) { lab[k2] = c.id; q.push(k2); } } }
      comps.push(c); }
    const big = comps.filter((c) => c.n > 400).sort((a, b) => b.n - a.n).slice(0, n).sort((a, b) => a.a - b.a);
    for (const m of big) { // кадр: главная область + палочки строп внутри её рамки (коричневые, вытянутые); значки, стрелки, искры -- прочь
      const keep = new Set([m.id]);
      for (const c of comps) { if (c === m || c.n < 40 || c.a < m.a - 4 || c.c > m.c + 4 || c.b < m.b - 4 || c.d > m.d + 4) continue;
        let r = 0, g = 0, bb = 0, k = 0; for (let j = c.b; j <= c.d; j++) for (let i = c.a; i <= c.c; i++) if (lab[j * w + i] === c.id) { const o = px(i, j); r += D[o]; g += D[o + 1]; bb += D[o + 2]; k++; }
        r /= k; g /= k; bb /= k; if (r > g && g > bb && r - bb > 25 && r < 200 && (c.d - c.b) > 0.3 * (m.d - m.b)) keep.add(c.id); }
      const fw = m.c - m.a + 1, fh = m.d - m.b + 1, A = new Uint8ClampedArray(fw * fh * 4);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const k = (m.b + j) * w + m.a + i, o = px(m.a + i, m.b + j), t = (j * fw + i) * 4; if (!keep.has(lab[k])) continue;
        const R = D[o], G2 = D[o + 1], B = D[o + 2]; if (B - R > 45 && B > G2 + 10) continue; // синие стрелки скорости
        A[t] = R; A[t + 1] = G2; A[t + 2] = B; A[t + 3] = 255; }
      res.push({ name, fw, fh, A: Array.from(A) }); } }
  // ---- второй проход: ведёрко, масштаб, шарф ----
  const brown = (A, t) => { if (!A[t + 3] || A[t] < 90) return false; const g = A[t + 1] / A[t], b = A[t + 2] / A[t]; return g > 0.5 && g < 0.85 && b < 0.62 && b < g - 0.12; };
  const red = (A, t) => A[t + 3] && A[t] > 150 && A[t] - A[t + 1] > 70 && A[t] - A[t + 2] > 60;
  const TB = 50, OUT = [];
  // масштаб -- по панели (кадры одной панели нарисованы в одном размере), «очень счастлив» на листе нарочно крупнее
  const PS = { idle: 0.72, walk: 0.72, left: 0.72, right: 0.72, cycle: 0.68, act: 0.49, mood: 0.44 }, cntM = {};
  for (const f of res) { const { fw, fh } = f, A = Uint8ClampedArray.from(f.A); const mi = (cntM[f.name] = (cntM[f.name] ?? -1) + 1);
    const op = (i, j) => A[(j * fw + i) * 4 + 3] > 0; let by1 = 0; for (let j = fh - 1; j >= 0 && !by1; j--) for (let i = 0; i < fw; i++) if (op(i, j)) { by1 = j; break; }
    // ширина низа ведёрка -- по строке на 6% выше дна
    const jb = Math.round(by1 - fh * 0.06); let bx0 = fw, bx1 = 0; for (let i = 0; i < fw; i++) if (op(i, jb)) { bx0 = Math.min(bx0, i); bx1 = Math.max(bx1, i); }
    const cx = (bx0 + bx1) / 2, bw = bx1 - bx0 + 1, span0 = cx - bw * 0.78, span1 = cx + bw * 0.78, cut = new Uint8Array(fw * fh); let rootL = [0, 0, 0], rootR = [0, 0, 0];
    for (let j = 0; j < fh * 0.9; j++) for (let i = 0; i < fw; i++) { const t = (j * fw + i) * 4; if (!red(A, t)) continue;
      if (i < span0 || i > span1) cut[j * fw + i] = 1; else if (i < span0 + 4) { rootL[0] += i; rootL[1] += j; rootL[2]++; } else if (i > span1 - 4) { rootR[0] += i; rootR[1] += j; rootR[2]++; } }
    for (let pass = 0; pass < 3; pass++) for (let j = 1; j < fh - 1; j++) for (let i = 1; i < fw - 1; i++) { const k = j * fw + i; if (cut[k] || (i >= span0 && i <= span1) || !A[k * 4 + 3]) continue;
      const t = k * 4, dark = A[t] + A[t + 1] + A[t + 2] < 330 || red(A, t) || (A[t] > A[t + 2] + 30); if (dark && (cut[k - 1] || cut[k + 1] || cut[k - fw] || cut[k + fw])) cut[k] = 2; }
    let sc = PS[f.name]; if (f.name === 'mood') sc = [0.38, 0.44, 0.52, 0.7][mi]; const s = sc;
    let nc = 0; for (let k = 0; k < cut.length; k++) if (cut[k]) { A[k * 4 + 3] = 0; nc++; }
    const rl = rootL[2] > 3 ? [rootL[0] / rootL[2], rootL[1] / rootL[2]] : null, rr = rootR[2] > 3 ? [rootR[0] / rootR[2], rootR[1] / rootR[2]] : null;
    // в масштаб: сглаженным уменьшением, затем альфа -- порогом, чтобы край остался пиксельным
    const c0 = new OffscreenCanvas(fw, fh); c0.getContext('2d').putImageData(new ImageData(A, fw, fh), 0, 0);
    const W2 = Math.round(fw * s), H2 = Math.round(fh * s), c1 = new OffscreenCanvas(W2, H2), x1 = c1.getContext('2d'); x1.imageSmoothingEnabled = true; x1.imageSmoothingQuality = 'high'; x1.drawImage(c0, 0, 0, W2, H2);
    const I2 = x1.getImageData(0, 0, W2, H2); for (let k = 3; k < I2.data.length; k += 4) { if (I2.data[k] < 110) I2.data[k] = 0; else { const a = I2.data[k] / 255; I2.data[k - 3] = Math.min(255, I2.data[k - 3] / a); I2.data[k - 2] = Math.min(255, I2.data[k - 2] / a); I2.data[k - 1] = Math.min(255, I2.data[k - 1] / a); I2.data[k] = 255; } }
    for (let pass = 0; pass < 5; pass++) { const kill = []; for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { const k = j * W2 + i; if (!I2.data[k * 4 + 3]) continue; // усики в пиксель толщиной
        let n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = i + di, j2 = j + dj; if (i2 >= 0 && j2 >= 0 && i2 < W2 && j2 < H2 && I2.data[(j2 * W2 + i2) * 4 + 3]) n++; } if (n <= 1) kill.push(k); }
      for (const k of kill) I2.data[k * 4 + 3] = 0; }
    { const lb = new Int32Array(W2 * H2).fill(-1), sz = []; // обрывки контура шарфа -- мелкие отдельные области прочь
      for (let k = 0; k < W2 * H2; k++) { if (!I2.data[k * 4 + 3] || lb[k] >= 0) continue; const id = sz.length, q = [k]; lb[k] = id; let n = 0;
        while (q.length) { const kk = q.pop(); n++; const i = kk % W2, j = (kk / W2) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = i + di, j2 = j + dj; if (i2 < 0 || j2 < 0 || i2 >= W2 || j2 >= H2) continue; const k2 = j2 * W2 + i2; if (I2.data[k2 * 4 + 3] && lb[k2] < 0) { lb[k2] = id; q.push(k2); } } }
        sz.push(n); }
      const mx = Math.max(...sz); for (let k = 0; k < W2 * H2; k++) if (lb[k] >= 0 && sz[lb[k]] < mx * 0.08) I2.data[k * 4 + 3] = 0; }
    let cL = 0, cR = 0; for (let k = 0; k < cut.length; k++) if (cut[k]) { if (k % fw < cx) cL++; else cR++; }
    OUT.push({ side: cL >= cR ? -1 : 1, name: f.name, w: W2, h: H2, ax: cx * s, ay: (by1 + 1) * s, rl: rl && [rl[0] * s, rl[1] * s], rr: rr && [rr[0] * s, rr[1] * s], cut: nc, data: Array.from(I2.data) }); }
  // атлас: в ряд с полями по 2 px
  const AW = 1024; let X = 2, Y = 2, rowH = 0; for (const f of OUT) { if (X + f.w + 2 > AW) { X = 2; Y += rowH + 2; rowH = 0; } f.x = X; f.y = Y; X += f.w + 2; rowH = Math.max(rowH, f.h); }
  const AH = Y + rowH + 2, ac = new OffscreenCanvas(AW, AH), ax = ac.getContext('2d'); for (const f of OUT) ax.putImageData(new ImageData(Uint8ClampedArray.from(f.data), f.w, f.h), f.x, f.y);
  const bl = await ac.convertToBlob(); const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); });
  return { url, frames: OUT.map(({ data, ...f }) => f) };
}, [src, BANDS]);
fs.writeFileSync(DIR + 'atlas.png', Buffer.from(out.url.split(',')[1], 'base64'));
const cnt = {}, F = {}; for (const f of out.frames) { const i = (cnt[f.name] = (cnt[f.name] ?? -1) + 1); const r = (v) => Math.round(v * 10) / 10;
  F[f.name + i] = [f.x, f.y, f.w, f.h, r(f.ax), r(f.ay), f.rl ? r(f.rl[0]) : null, f.rl ? r(f.rl[1]) : null, f.rr ? r(f.rr[0]) : null, f.rr ? r(f.rr[1]) : null, f.side]; console.log(f.name + i, f.w + 'x' + f.h, 'ax', Math.round(f.ax), 'ay', Math.round(f.ay), 'cut', f.cut, 'L', f.rl && f.rl.map(Math.round), 'R', f.rr && f.rr.map(Math.round)); }
fs.writeFileSync(DIR + 'atlas.json', JSON.stringify(F));
await b.close();
