import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_santash'); await p.click('#brace');
// ведём лодку автоматом через старт, чтобы увидеть экран первого участка
await p.evaluate(() => { const G = window.__game(); for (let i = 0; i < 60 * 44; i++) { const b = G.player.b, R = G.race, want = G.wind.dir0 + 0.8, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(1 / 60, { left: d < -0.05, right: d > 0.05, ease: Math.abs(b.phi) > 0.5 }); } });
await p.waitForTimeout(3000); await p.screenshot({ path: 'shots/leg1.png' });
console.log(await p.evaluate(() => { const m = document.getElementById('mark'), G = window.__game(); return JSON.stringify({ hidden: m.hidden, tr: m.style.transform, cls: m.className, txt: m.textContent, leg: G.player.leg, t: G.race.t.toFixed(0), hint: document.getElementById('hint').textContent }); }));
await b.close();
