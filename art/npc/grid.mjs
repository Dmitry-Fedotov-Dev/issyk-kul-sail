// контрольный снимок листа с сеткой координат (каждые 50 px), для разметки полос нарезки
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const [inp, outp, x0, y0, x1, y1] = process.argv.slice(2); const src = 'data:image/png;base64,' + fs.readFileSync(inp).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
const url = await p.evaluate(async ([src, x0, y0, x1, y1]) => { const im = new Image(); im.src = src; await im.decode(); const w = x1 - x0, h = y1 - y0, c = new OffscreenCanvas(w, h), x = c.getContext('2d');
  x.drawImage(im, x0, y0, w, h, 0, 0, w, h); x.font = '11px sans-serif';
  for (let X = Math.ceil(x0 / 50) * 50; X < x1; X += 50) { x.fillStyle = X % 100 ? 'rgba(0,255,0,.5)' : 'rgba(255,255,0,.8)'; x.fillRect(X - x0, 0, 1, h); x.fillText(X, X - x0 + 2, 10); }
  for (let Y = Math.ceil(y0 / 50) * 50; Y < y1; Y += 50) { x.fillStyle = Y % 100 ? 'rgba(0,255,0,.5)' : 'rgba(255,255,0,.8)'; x.fillRect(0, Y - y0, w, 1); x.fillText(Y, 2, Y - y0 - 2); }
  const bl = await c.convertToBlob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); }, [src, +x0, +y0, +x1, +y1]);
fs.writeFileSync(outp, Buffer.from(url.split(',')[1], 'base64')); await b.close();
