import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 680 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_breeze'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.5); b.vx = Math.sin(b.th) * 2; b.vy = Math.cos(b.th) * 2; G.camYaw = b.th; window.__tick(3, { left: false, right: false, ease: false }); });
// крупные планы: с кормы, сбоку-спереди, сверху-сзади -- камера ставится вручную
for (const [name, back, side, up] of [['boat_stern', 7.5, 1.2, 2.6], ['boat_quarter', 5.5, -6.5, 2.2], ['boat_bow', -8, 4.5, 2.4], ['boat_above', 3.5, 1.5, 9]]) {
  await p.evaluate(([back, side, up]) => { const G = window.__game(); G.dbgCam = { back, side, up }; }, [back, side, up]);
  await p.waitForTimeout(1500); await p.screenshot({ path: `shots/${name}.png` });
}
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
