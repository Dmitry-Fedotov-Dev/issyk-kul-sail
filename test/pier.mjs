import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
await p.waitForTimeout(2500); await p.screenshot({ path: 'shots/menu.png' });
await p.click('#bfree');
// идём на причал сбоку
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(-40, G.shore.pierY + 40, 1.57); b.vx = 3; });
let hit = false, off = false; for (let k = 0; k < 80 && !hit; k++) { await p.evaluate(() => window.__tick(0.5, { left: false, right: false, ease: false })); hit = await p.evaluate(() => window.__game().player.b.aground); }
const where = await p.evaluate(() => { const b = window.__game().player.b; return [b.X.toFixed(1), b.Y.toFixed(1)]; });
for (let k = 0; k < 60 && !off; k++) { await p.evaluate(() => window.__tick(0.5, { left: false, right: false, ease: false })); off = !(await p.evaluate(() => window.__game().player.b.aground)); }
console.log('pier hit:', hit, where, 'pushed off:', off, await p.evaluate(() => { const b = window.__game().player.b; return [b.X.toFixed(1), b.Y.toFixed(1)]; }));
console.log(errs.join('\n') || 'no console errors');
// телефон
const m = await b.newPage({ ...devices['iPhone 13'] });
await m.goto('file://' + path.resolve('dist/index.html')); await m.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
await m.waitForTimeout(2500); await m.screenshot({ path: 'shots/m_menu.png' });
await m.tap('#bfree'); await m.waitForTimeout(4000); await m.screenshot({ path: 'shots/m_game.png' });
console.log('mobile scroll overflow:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth));
await b.close();
