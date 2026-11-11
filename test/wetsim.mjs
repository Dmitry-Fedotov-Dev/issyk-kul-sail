import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 500)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
const stat = () => p.evaluate(() => { const G = window.__game(), w = G.player.model.water; let f = 0, fm = 0, d = 0, L = 0, R = 0; const NI = 48, NJ = 20;
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const q = j * NI + i; f += w.film[q]; fm = Math.max(fm, w.film[q]); d += w.damp[q]; if (j < NJ / 2) L += w.damp[q]; else R += w.damp[q]; }
  return { film: +(f / 960).toFixed(3), filmMax: +fm.toFixed(2), damp: +(d / 960).toFixed(2), dampPort: +(L / 480).toFixed(2), dampStbd: +(R / 480).toFixed(2), heel: Math.round(G.player.b.phi * 57.3) }; });
const run = (sec, twa) => p.evaluate(([sec, twa]) => { const G = window.__game(); for (let i = 0; i < sec * 60; i++) { const b = G.player.b, want = G.wind.dirNow + twa, d = Math.atan2(Math.sin(want - b.th), Math.cos(want - b.th)); window.__tick(1 / 60, { left: d < -0.04, right: d > 0.04, ease: Math.abs(b.phi) > 0.5 }); } }, [sec, twa]);
// бриз: палуба обязана остаться сухой
await p.click('#w_breeze'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.5); b.vx = Math.sin(b.th) * 2; b.vy = Math.cos(b.th) * 2; });
await run(30, 1.5); console.log('breeze 30 s:', JSON.stringify(await stat()));
// шторм, бейдевинд
await p.keyboard.press('Escape'); await p.click('#w_ulan'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.0); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.dbgCam = { back: 5.5, side: -4.5, up: 3.6 }; });
for (let i = 1; i <= 4; i++) { await run(6, 1.0); console.log('ulan', i * 6, 's:', JSON.stringify(await stat())); if (i === 2) { await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/wet_storm.png' }); } }
// уходим в тихую воду: должно сохнуть
await p.evaluate(() => { const G = window.__game(); G.waves.setFromWind(2, 0, 3000); G.water.setWaves(G.waves); });
await run(40, 1.6); console.log('40 s later in calm:', JSON.stringify(await stat()));
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
