// контрольный лист атласа: подпись над кадром, кадры в порядке полос
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const [atlas, json, outp, filt] = process.argv.slice(2), F = JSON.parse(fs.readFileSync(json)), src = 'data:image/png;base64,' + fs.readFileSync(atlas).toString('base64');
const keys = Object.keys(F).filter((k) => !filt || new RegExp(filt).test(k));
const b = await chromium.launch(); const p = await b.newPage();
const url = await p.evaluate(async ([src, F, keys]) => { const im = new Image(); im.src = src; await im.decode(); const cols = 10, cw = 150, ch = 150, rows = Math.ceil(keys.length / cols), c = new OffscreenCanvas(cols * cw, rows * ch), x = c.getContext('2d');
  x.fillStyle = '#9cb'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false; x.font = 'bold 15px sans-serif';
  keys.forEach((k, n) => { const [ax, ay, w, h] = F[k], i = n % cols, j = (n / cols) | 0, s = Math.min(2, 140 / w, 125 / h); x.fillStyle = '#000'; x.fillText(k, i * cw + 4, j * ch + 15); x.drawImage(im, ax, ay, w, h, i * cw + 4, j * ch + 20, w * s, h * s); x.strokeStyle = '#678'; x.strokeRect(i * cw, j * ch, cw, ch); });
  const bl = await c.convertToBlob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); }, [src, F, keys]);
fs.writeFileSync(outp, Buffer.from(url.split(',')[1], 'base64')); await b.close();
