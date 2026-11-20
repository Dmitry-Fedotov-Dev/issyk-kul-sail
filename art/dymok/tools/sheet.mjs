// контрольный лист: все кадры на шахматке (видно прозрачность), масштаб x2 без сглаживания
import { createRequire } from 'node:module'; const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright');
import fs from 'fs';
const dir = process.argv[2], outp = process.argv[3], files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const imgs = files.map((f) => [f, 'data:image/png;base64,' + fs.readFileSync(dir + '/' + f).toString('base64')]);
const b = await chromium.launch(); const p = await b.newPage();
const url = await p.evaluate(async (imgs) => { const L = []; for (const [n, s] of imgs) { const im = new Image(); im.src = s; await im.decode(); L.push([n, im]); }
  const cols = 8, cw = 220, ch = 240, rows = Math.ceil(L.length / cols), c = new OffscreenCanvas(cols * cw, rows * ch), x = c.getContext('2d');
  for (let j = 0; j < rows * ch; j += 10) for (let i = 0; i < cols * cw; i += 10) { x.fillStyle = ((i + j) / 10) % 2 ? '#7c9' : '#ace'; x.fillRect(i, j, 10, 10); }
  x.imageSmoothingEnabled = false; L.forEach(([n, im], k) => { const i = k % cols, j = (k / cols) | 0, s = Math.min(2, 200 / im.width, 210 / im.height); x.drawImage(im, i * cw + 5, j * ch + 5, im.width * s, im.height * s); x.fillStyle = '#000'; x.font = '14px sans-serif'; x.fillText(n, i * cw + 5, j * ch + 234); });
  const bl = await c.convertToBlob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); }, imgs);
fs.writeFileSync(outp, Buffer.from(url.split(',')[1], 'base64')); await b.close();
