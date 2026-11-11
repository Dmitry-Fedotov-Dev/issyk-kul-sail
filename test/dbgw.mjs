import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 700, height: 400 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_santash'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.6); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.cam = 2; window.__tick(3, { left: false, right: false, ease: false }); });
for (const d of [1, 2, 3, 4, 5, 6]) { await p.evaluate((d) => { window.__game().water.uniforms.uDbg.value = d; }, d); await p.waitForTimeout(1200); await p.screenshot({ path: `shots/dbg_${d}.png` }); }
await b.close();
