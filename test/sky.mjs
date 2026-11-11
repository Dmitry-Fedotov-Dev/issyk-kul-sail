import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
for (const w of ['breeze', 'santash', 'ulan']) {
  await p.click('#w_' + w); await p.click('#bfree');
  await p.evaluate(() => { const G = window.__game(), b = G.player.b, th = -2.2; b.reset(500, -2500, th); b.vx = Math.sin(th) * 2.5; b.vy = Math.cos(th) * 2.5; G.camYaw = th; G.cam = 1; window.__tick(4, { left: false, right: false, ease: false }); });
  await p.waitForTimeout(2500); await p.screenshot({ path: `shots/sky_${w}.png` });
  await p.evaluate(() => { window.__game().cam = 0; }); await p.keyboard.press('Escape');
}
console.log(errs.join('\n') || 'no console errors');
const m = await b.newPage({ ...devices['iPhone 13'] });
await m.goto('file://' + path.resolve('dist/index.html')); await m.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await m.tap('#bfree'); await m.waitForTimeout(3500);
// касание левой половины экрана должно дать руль влево
const before = await m.evaluate(() => window.__game().player.b.th);
await m.touchscreen.tap(60, 400); const rud = await m.evaluate(async () => { const c = document.getElementById('gl'); c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 60, clientY: 400, bubbles: true })); window.__tick(1.5); const r = window.__game().player.b.rudder; window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 })); window.__tick(0.5); return [r, window.__game().player.b.rudder]; });
console.log('touch left half -> rudder while held / after release:', rud.map((x) => x.toFixed(2)).join(' / '));
await m.screenshot({ path: 'shots/m_game.png' });
await b.close();
