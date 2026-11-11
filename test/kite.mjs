import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(240000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
const hold = (sec, twa) => p.evaluate(([sec, twa]) => { const G = window.__game(); for (let i = 0; i < sec * 20; i++) { const b = G.player.b, want = G.wind.dirNow + twa, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(0.05, { left: d < -0.04, right: d > 0.04, ease: false }); } const b = G.player.b; return { kn: +(b.speed * 1.944).toFixed(1), kite: +b.kite.toFixed(2), heel: Math.round(b.phi * 57.3), wet: +(G.wet || 0).toFixed(2), cap: b.capsized }; }, [sec, twa]);
await p.click('#w_santash'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.6); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; });
console.log('beam reach 90:', JSON.stringify(await hold(10, 1.57)));
console.log('broad reach 140:', JSON.stringify(await hold(14, 2.45)));
for (const [name, back, side, up] of [['kite_front', -13, 7, 3.2], ['kite_side', 2, -15, 4], ['kite_chase', 12, 2, 4.5]]) { await p.evaluate(([back, side, up]) => { window.__game().dbgCam = { back, side, up }; }, [back, side, up]); await p.waitForTimeout(1800); await p.screenshot({ path: `shots/${name}.png` }); }
// шторм: бейдевинд против волны -- удары, брызги, мокрая палуба
await p.keyboard.press('Escape'); await p.click('#w_ulan'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 0.85); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.dbgCam = { back: 6.5, side: 3.2, up: 2.6 }; });
let best = null; for (let i = 0; i < 12; i++) { const r = await p.evaluate(() => { const G = window.__game(); for (let k = 0; k < 40; k++) { const b = G.player.b, want = G.wind.dirNow + 0.85, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(0.05, { left: d < -0.04, right: d > 0.04, ease: Math.abs(b.phi) > 0.45 }); } return { wet: +(G.wet || 0).toFixed(2), kn: +(G.player.b.speed * 1.944).toFixed(1), cap: G.player.b.capsized }; }); if (!best || r.wet > best.wet) best = r; if (r.wet > 0.5) break; }
console.log('storm upwind:', JSON.stringify(best)); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/storm_wet.png' });
console.log(errs.slice(0, 6).join('\n') || 'no console errors'); await b.close();
