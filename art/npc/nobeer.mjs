// Пляж без алкоголя: на лотке торговца и на вывеске закрашиваем надпись «АРПА ПИВО СОСИСКИ» цветом лотка/доски
// (рисунок сосиски остаётся). Правит art/npc/npc_atlas.png на месте; запускать после cutnpc.mjs.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const DIR = '/home/feduk/Code/issyk-kul-sail/art/npc/', F = JSON.parse(fs.readFileSync(DIR + 'npc_atlas.json')), src = 'data:image/png;base64,' + fs.readFileSync(DIR + 'npc_atlas.png').toString('base64');
const targets = Object.keys(F).filter((k) => /^vend|^obj13$|^type\d$/.test(k)).map((k) => [k, F[k]]);
const b = await chromium.launch(); const p = await b.newPage();
const url = await p.evaluate(async ([src, targets]) => { const im = new Image(); im.src = src; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
  for (const [k, [fx, fy, w, h]] of targets) { const d = x.getImageData(fx, fy, w, h), D = d.data, at = (i, j) => (j * w + i) * 4;
    // поле надписи: лоток -- красный, вывеска -- тёмная доска; ищем рамку по цвету поля в нижней части кадра
    const isField = (o) => (k === 'obj13' ? D[o] < 70 && D[o + 1] < 70 && D[o + 2] < 90 : D[o] > 120 && D[o + 1] < 85 && D[o + 2] < 85 && D[o] - D[o + 1] > 60);
    let a = w, bb = h, cc = -1, dd = -1, sr = 0, sg = 0, sb = 0, n = 0;
    for (let j = Math.floor(h * (k === 'obj13' ? 0 : 0.45)); j < h; j++) for (let i = 0; i < w; i++) { const o = at(i, j); if (D[o + 3] && isField(o)) { a = Math.min(a, i); cc = Math.max(cc, i); bb = Math.min(bb, j); dd = Math.max(dd, j); sr += D[o]; sg += D[o + 1]; sb += D[o + 2]; n++; } }
    if (n < 30) continue; sr /= n; sg /= n; sb /= n;
    for (let j = bb; j <= dd; j++) for (let i = a; i <= cc; i++) { const o = at(i, j); if (!D[o + 3]) continue; const r = D[o], g = D[o + 1], bl = D[o + 2], lum = r * 0.3 + g * 0.59 + bl * 0.11, fl = sr * 0.3 + sg * 0.59 + sb * 0.11, orange = r > 180 && bl < 110 && g > 70 && g < 200 && r - bl > 110, light = lum > fl + 28 && !orange;
      if (light) { D[o] = sr; D[o + 1] = sg; D[o + 2] = sb; } }
    x.putImageData(d, fx, fy); }
  const bl = await c.convertToBlob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); }, [src, targets]);
fs.writeFileSync(DIR + 'npc_atlas.png', Buffer.from(url.split(',')[1], 'base64')); await b.close();
