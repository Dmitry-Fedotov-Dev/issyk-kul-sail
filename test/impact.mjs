import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 500)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
await p.click('#w_ulan'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.0); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.dbgCam = { back: 5.5, side: -4.5, up: 3.4 };
  const m = G.player.model, orig = m.addWash.bind(m); G.washLog = []; m.addWash = (z, sd, st) => { G.washLog.push([+z.toFixed(1), sd, +st.toFixed(2), +G.t.toFixed(1)]); orig(z, sd, st); }; });
const run = (sec) => p.evaluate((sec) => { const G = window.__game(); for (let i = 0; i < sec * 60; i++) { const b = G.player.b, want = G.wind.dirNow + 1.0, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(1 / 60, { left: d < -0.04, right: d > 0.04, ease: Math.abs(b.phi) > 0.5 }); } return { n: G.washLog.length, last: G.washLog[G.washLog.length - 1], t: +G.t.toFixed(1), cap: G.player.b.capsized, heel: Math.round(G.player.b.phi * 57.3) }; }, sec);
let r, shot = false; for (let i = 0; i < 40; i++) { const before = r ? r.n : 0; r = await run(0.5); if (r.n > before && !shot && r.last[2] > 0.5) { await run(0.6); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/wash.png' }); shot = true; console.log('shot at', JSON.stringify(r)); } }
console.log('wave impacts in 20 s of storm sailing:', r.n, 'capsized:', r.cap, 'log:', JSON.stringify(await p.evaluate(() => window.__game().washLog.slice(0, 8))));
// переключение ступеней качества не должно ломать шейдеры
for (const q of [0, 1, 2]) { await p.evaluate((q) => { const G = window.__game(); window.__setQ(q); }, q); await p.waitForTimeout(2500); await p.screenshot({ path: `shots/q${q}.png` }); }
console.log(errs.slice(0, 6).join('\n') || 'no console errors'); await b.close();
