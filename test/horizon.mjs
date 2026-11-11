import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_' + (process.argv[2] || 'breeze')); await p.click('#bfree');
console.log('far tris', await p.evaluate(() => window.__game().far.userData.tris));
// открытая вода в 3 км от берега; смотрим по очереди на юг, запад, восток, север
for (const [name, th] of [['south', Math.PI], ['west', -Math.PI / 2], ['east', Math.PI / 2], ['north', 0]]) {
  await p.evaluate((th) => { const G = window.__game(), b = G.player.b; b.reset(500, -2500, th); b.vx = Math.sin(th) * 2; b.vy = Math.cos(th) * 2; G.camYaw = th; G.orbit = 0; }, th);
  await p.waitForTimeout(1800); await p.screenshot({ path: `shots/h_${name}.png` });
}
console.log(errs.slice(0, 6).join('\n') || 'no console errors');
await b.close();
