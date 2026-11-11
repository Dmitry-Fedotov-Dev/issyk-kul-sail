import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
const w = process.argv[2] || 'breeze';
await p.click('#w_' + w); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.6); b.vx = Math.sin(b.th) * 2.5; b.vy = Math.cos(b.th) * 2.5; G.player.wake.reset(); });
const run = (sec, steer) => p.evaluate(([sec, steer]) => { const G = window.__game(); for (let i = 0; i < sec * 60; i++) { const b = G.player.b, want = G.wind.dirNow + 1.6, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(1 / 60, steer ? { left: false, right: true, ease: false } : { left: d < -0.04, right: d > 0.04, ease: Math.abs(b.phi) > 0.5 }); } return +(G.player.b.speed * 1.944).toFixed(1); }, [sec, steer]);
let kn; for (let i = 0; i < 16; i++) kn = await run(1, false); console.log(w, 'speed kn', kn);
await p.evaluate(() => { window.__game().freeze = true; });
for (const [name, back, side, up] of [['top', 14, 0.01, 52], ['chase', 13, 1.5, 4.6], ['high', 22, 6, 13]]) { await p.evaluate(([back, side, up]) => { window.__game().dbgCam = { back, side, up }; }, [back, side, up]); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/wk_${w}_${name}.png` }); }
await p.evaluate(() => { window.__game().freeze = false; }); for (let i = 0; i < 5; i++) await run(1, true);
await p.evaluate(() => { const G = window.__game(); G.freeze = true; G.dbgCam = { back: 8, side: 0.01, up: 52 }; }); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/wk_${w}_turn.png` });
console.log(errs.slice(0, 4).join('\n') || 'no console errors'); await b.close();
