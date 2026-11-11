// Сценарии в настоящем браузере: шторм без травления (должны опрокинуться и встать), вид сверху, касание мели.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
const st = () => p.evaluate(() => { const G = window.__game(), b = G.player.b; return { kn: +(b.speed * 1.944).toFixed(1), heel: +(b.phi * 57.3).toFixed(0), twa: +(b.twa * 57.3).toFixed(0), cap: b.capsized, agr: b.aground, tws: +b.tws.toFixed(1), hint: document.getElementById('hint').textContent.slice(0, 40), goals: Object.keys(G.free ? G.free.done : {}).join(',') }; });
await p.click('#w_ulan'); await p.click('#bfree');
// выводим лодку на открытую воду и ставим в галфвинд, без травления
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(300, -900, G.wind.dir0 + 1.4); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; });
await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); await p.waitForTimeout(3000); await p.screenshot({ path: 'shots/top.png' });
await p.keyboard.press('KeyC');
const ff = (sec, inp) => p.evaluate(([s, i]) => window.__tick(s, i), [sec, { left: false, right: false, ease: false, ...(inp || {}) }]);
let capsized = false, t = 0;
for (; t < 180 && !capsized; t += 0.25) { const s = await st(), a = Math.abs(s.twa), toWind = s.twa > 0 ? 'right' : 'left', away = s.twa > 0 ? 'left' : 'right';
  await ff(0.25, a < 85 ? { [away]: true } : a > 100 ? { [toWind]: true } : {}); if (Math.round(t * 4) % 80 === 0) console.log(JSON.stringify(s)); capsized = s.cap; }
console.log(`Ulan, holding a beam reach with keys, never easing: capsized=${capsized} after ${t} s`);
await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/capsize.png' });
if (capsized) { await ff(5, { ease: true }); const s = await st(); console.log('righted by holding Space 5 s:', !s.cap); await ff(0.1); }
// тот же шторм, но травим шкот при крене -- должны продержаться 2 минуты
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(300, -900, G.wind.dir0 + 1.4); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; });
let surv = true, mh = 0; for (let k = 0; k < 600 && surv; k++) { const s = await st(), a = Math.abs(s.twa), toWind = s.twa > 0 ? 'right' : 'left', away = s.twa > 0 ? 'left' : 'right'; mh = Math.max(mh, Math.abs(s.heel)); surv = !s.cap; await ff(0.2, { ease: Math.abs(s.heel) > 24, ...(a < 85 ? { [away]: true } : a > 100 ? { [toWind]: true } : {}) }); }
console.log(`Ulan with easing: survived=${surv}, max heel ${mh}, ` + JSON.stringify(await st()));
// руль: 2 секунды вправо на ходу в свежий ветер
await p.keyboard.press('Escape'); await p.click('#w_santash'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(300, -900, G.wind.dir0 + 1.57); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; });
await ff(6); const th0 = await p.evaluate(() => window.__game().player.b.th); await ff(2, { right: true });
const th1 = await p.evaluate(() => window.__game().player.b.th); console.log('heading change in 2 s of → (deg):', ((th1 - th0) * 57.3).toFixed(0));
await ff(2, { left: true }); const th2 = await p.evaluate(() => window.__game().player.b.th); console.log('then 2 s of ← (deg):', ((th2 - th1) * 57.3).toFixed(0));
// оверштаг: держим руль к ветру, пока не сменится галс
const twa0 = (await st()).twa; let tacked = false; for (let k = 0; k < 40 && !tacked; k++) { await ff(0.5, twa0 > 0 ? { right: true } : { left: true }); tacked = Math.sign((await st()).twa) !== Math.sign(twa0); }
await ff(6); console.log('tack through the wind:', tacked, JSON.stringify(await st()));
// мель
await p.evaluate(() => { const G = window.__game(), b = G.player.b; let Y = 0; while (G.h(0, Y) < -3) Y += 5; b.reset(0, Y - 40, 0); b.vy = 3; });
let agr = false; for (let k = 0; k < 160 && !agr; k++) { await ff(0.5); agr = (await st()).agr; }
console.log('ran aground near shore:', agr, await p.evaluate(() => { const G = window.__game(), b = G.player.b; return JSON.stringify([b.X.toFixed(0), b.Y.toFixed(0), G.h(b.X, b.Y).toFixed(1), (b.th * 57.3).toFixed(0)]); })); await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/shore.png' });
let off = false; for (let k = 0; k < 40 && !off; k++) { await ff(0.5); off = !(await st()).agr; } console.log('refloated:', off && agr);
// регата целиком: игрок стоит, соперники обязаны финишировать
await p.keyboard.press('Escape'); await p.click('#brace'); await ff(30); await p.waitForTimeout(1200); await p.screenshot({ path: 'shots/race2.png' });
await ff(600); console.log('race:', await p.evaluate(() => { const G = window.__game(); return JSON.stringify({ t: G.race.t.toFixed(0), rivals: G.rivals.map((r) => [r.name, r.leg, r.time.toFixed(0)]), player: G.player.leg }); }));
console.log(errs.slice(0, 8).join('\n') || 'no console errors');
await b.close();
