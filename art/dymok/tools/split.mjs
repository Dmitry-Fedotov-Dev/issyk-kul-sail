// атлас -> отдельные PNG для контрольного листа
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const [atlas, json, out] = process.argv.slice(2), F = JSON.parse(fs.readFileSync(json)), src = 'data:image/png;base64,' + fs.readFileSync(atlas).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const r = await p.evaluate(async ([src, F]) => { const im = new Image(); im.src = src; await im.decode(); const o = {};
  for (const k in F) { const [x, y, w, h, ax, ay] = F[k], c = new OffscreenCanvas(w, h), cx = c.getContext('2d'); cx.drawImage(im, x, y, w, h, 0, 0, w, h); cx.fillStyle = '#f0f'; cx.fillRect(ax - 1, ay - 2, 2, 2);
    if (F[k][6] !== null) { cx.fillStyle = '#0f0'; cx.fillRect(F[k][6] - 1, F[k][7] - 1, 3, 3); } if (F[k][8] !== null) { cx.fillStyle = '#00f'; cx.fillRect(F[k][8] - 1, F[k][9] - 1, 3, 3); }
    const bl = await c.convertToBlob(); o[k] = await new Promise((rs) => { const fr = new FileReader(); fr.onload = () => rs(fr.result); fr.readAsDataURL(bl); }); } return o; }, [src, F]);
for (const k in r) fs.writeFileSync(`${out}/${k}.png`, Buffer.from(r[k].split(',')[1], 'base64')); await b.close();
