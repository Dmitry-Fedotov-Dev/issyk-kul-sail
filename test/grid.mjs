import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_breeze'); await p.click('#bfree');
console.log('gust map update ms:', await p.evaluate(() => { const G = window.__game(), t = performance.now(); for (let i = 0; i < 10; i++) G.water.updateGust(G.wind, 0, 0); return ((performance.now() - t) / 10).toFixed(2); }));
for (const [name, X, Y, th] of [['g_shore', 200, 150, -1.9], ['g_south', 400, -1500, 3.14], ['g_north', 400, -3000, 0]]) {
  await p.evaluate(([X, Y, th]) => { const G = window.__game(), b = G.player.b; b.reset(X, Y, th); b.vx = Math.sin(th) * 1.5; b.vy = Math.cos(th) * 1.5; G.camYaw = th; window.__tick(2, { left: false, right: false, ease: false }); }, [X, Y, th]);
  await p.waitForTimeout(2200); await p.screenshot({ path: `shots/${name}.png` });
}
await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); await p.waitForTimeout(2200); await p.screenshot({ path: 'shots/g_top.png' });
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
