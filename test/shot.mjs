import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const out = process.argv[2] || 'shots', what = process.argv[3] || 'all';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: out + '/menu.png' });
if (what !== 'menu') {
  await p.click('#bfree'); await p.waitForTimeout(6000); console.log(await p.evaluate(() => { const G = window.__game(), c = G.water.mesh.parent.children; const cam = G.sky.position; const b = G.player.b; return JSON.stringify({ cam: [cam.x, cam.y, cam.z], boat: [b.X, b.Y, b.th, b.y], h: G.h(b.X, b.Y), camYaw: G.camYaw, orbit: G.orbit, pierY: G.shore.pierY }); })); await p.screenshot({ path: out + '/free.png' });
  await p.keyboard.press('KeyC'); await p.waitForTimeout(2500); await p.screenshot({ path: out + '/cockpit.png' });
  await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); await p.keyboard.press('Escape');
  await p.click('#w_ulan'); await p.click('#brace'); await p.waitForTimeout(9000); await p.screenshot({ path: out + '/race.png' });
}
console.log(JSON.stringify(await p.evaluate(() => { const G = window.__game(), b = G.player.b; return { mode: G.mode, X: b.X, Y: b.Y, kn: b.speed * 1.94, heel: b.phi * 57.3, frame: G.frame, t: G.t }; })));
console.log(errs.slice(0, 12).join('\n') || 'no console errors');
await b.close();
