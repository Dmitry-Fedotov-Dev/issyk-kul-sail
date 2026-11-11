import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
p.on('console', (m) => console.log('[' + m.type() + ']', m.text().slice(0, 300))); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
await p.waitForTimeout(1500);
await p.click('#bfree');
for (let i = 0; i < 4; i++) { await p.waitForTimeout(1500); await p.screenshot({ path: `shots/dbg${i}.png` });
  console.log(await p.evaluate(() => { const G = window.__game(); const c = document.getElementById('gl'); const r = c.getBoundingClientRect(); return JSON.stringify({ frame: G.frame, w: c.width, h: c.height, rect: [r.width, r.height], disp: getComputedStyle(c).display }); })); }
await b.close();
