import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_breeze'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.5); b.vx = Math.sin(b.th) * 2; b.vy = Math.cos(b.th) * 2; G.dbgCam = { back: 4.5, side: 2.5, up: 5.5 }; window.__tick(2, { left: false, right: false, ease: false }); });
for (const w of [0, 1]) { await p.evaluate((w) => { const G = window.__game(); G.wet = w; G.player.model.setWet(w); }, w); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/wet_${w}.png` });
  console.log(w, await p.evaluate(() => { const G = window.__game(); let out = []; G.player.model.root.traverse((o) => { if (o.isMesh && o.material.isMeshPhysicalMaterial && o.material.flatShading) out.push(Object.keys(o.material).includes('onBeforeCompile')); }); return JSON.stringify({ wet: G.wet, n: out.length }); })); }
await b.close();
