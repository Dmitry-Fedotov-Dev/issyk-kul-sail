import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const src = 'data:image/png;base64,' + fs.readFileSync(process.argv[2]).toString('base64');
const b = await chromium.launch(); const p = await b.newPage();
console.log(await p.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = new OffscreenCanvas(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data, h = new Array(9).fill(0); const samp = {};
  for (let i = 0; i < d.length; i += 4) { h[Math.min(8, d[i + 3] >> 5)]++; }
  // образцы мусора: красный при альфе
  const S = []; for (let i = 0; i < d.length && S.length < 12; i += 4 * 997) S.push([d[i], d[i + 1], d[i + 2], d[i + 3]].join(','));
  return JSON.stringify({ h, S }); }, src)); await b.close();
