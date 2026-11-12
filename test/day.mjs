import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 500)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 });
await p.click('#w_breeze'); await p.click('#bfree');
for (const [h, th] of [[6, 0], [13, 0], [20.3, -1.2], [23.5, 0]]) {
  console.log(h, await p.evaluate(([h, th]) => { const G = window.__game(); G.freeze = false; G.clock = h; G.player.b.reset(500, -2500, th); G.camYaw = th; window.__tick(13, {}); G.freeze = true; return document.getElementById('windtxt').textContent; }, [h, th]));
  await p.waitForTimeout(1500); await p.screenshot({ path: `shots/day_${Math.round(h)}.png` }); }
await p.evaluate(() => { const G = window.__game(); G.freeze = false; G.clock = 13; document.getElementById('bmenu').click(); document.getElementById('w_ulan').click(); document.getElementById('bfree').click(); G.player.b.reset(500, -2500, 0); G.camYaw = 0; window.__tick(13, {}); G.freeze = true; });
await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/day_storm.png' });
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
