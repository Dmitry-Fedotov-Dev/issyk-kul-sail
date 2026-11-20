// Релиз 2 в браузере: яхта стоит в открытой воде -> G (прыжок за борт) -> плывёт, мокнет -> находка на берегу ->
// обратно к лодке и F (на борт). Снимки -- в папку из аргумента. Запуск: node test/swim.mjs <папка>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const PW = ['/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/', '/'].find((d) => { try { createRequire(d).resolve('playwright'); return true; } catch { return false; } });
const { chromium } = createRequire(PW)('playwright'); const S = process.argv[2] || 'shots'; fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } }); p.setDefaultTimeout(300000);
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + process.cwd() + '/dist/index.html');
await p.waitForFunction(() => window.__game && window.__game() && window.__game().corridor, null, { timeout: 120000 });
await p.click('#c_yacht'); await p.click('#bfree'); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const f = window.__foot().state; return { on: window.__foot().on, st: f.st, swim: f.swim, wet: +f.wet.toFixed(2), mood: +f.mood.toFixed(2), food: +f.food.toFixed(2), X: +f.X.toFixed(1), Y: +f.Y.toFixed(1), Z: +f.Z.toFixed(2) }; });
await p.evaluate(() => { const b = window.__game().player.b; b.vx = b.vy = 0; b.speed = 0; });
console.log('clock', await p.evaluate(() => window.__game().clock.toFixed(2)));
await p.keyboard.press('KeyG'); await p.waitForTimeout(600); console.log('toast', await p.evaluate(() => document.getElementById('toast').textContent));
await p.waitForFunction(() => window.__foot().on && window.__foot().state.st !== 'dis', null, { timeout: 60000 }); await p.waitForTimeout(500);
console.log('in water', JSON.stringify(await st()), 'toast', await p.evaluate(() => document.getElementById('toast').textContent)); await p.screenshot({ path: `${S}/s_float.png` });
await p.waitForTimeout(4000); await p.screenshot({ path: `${S}/s_float2.png` }); await p.keyboard.down('KeyS'); await p.waitForTimeout(6000); await p.screenshot({ path: `${S}/s_swim.png` }); await p.keyboard.up('KeyS');
console.log('swam', JSON.stringify(await st()), 'hint', await p.evaluate(() => document.getElementById('hint').textContent), 'dstat', await p.evaluate(() => document.getElementById('dstat').innerText));
// паника: сырость до конца
await p.evaluate(() => { window.__foot().state.wet = 0.999; }); await p.waitForTimeout(3000); console.log('panic', JSON.stringify(await st()), await p.evaluate(() => document.getElementById('toast').textContent)); await p.screenshot({ path: `${S}/s_panic.png` });
// обратно к лодке и на борт
await p.evaluate(() => { const f = window.__foot().state; f.X = f.seat.X + 1.5; f.Y = f.seat.Y; });
await p.waitForTimeout(400); await p.keyboard.press('KeyF'); await p.waitForFunction(() => !window.__foot().on, null, { timeout: 60000 }).catch(() => {}); console.log('mounted', (await st()).on === false);
// на берег: сойти у пляжа, найти находку и подобрать
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.X = 60; b.Y = 440; b.vx = b.vy = 0; b.speed = 0; });
for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); }
await p.keyboard.press('KeyG'); await p.waitForTimeout(400); console.log('exit 2 toast', await p.evaluate(() => document.getElementById('toast').textContent));
await p.waitForFunction(() => window.__foot().on && window.__foot().state.st !== 'dis', null, { timeout: 60000 }).catch(() => console.log('no exit 2'));
await p.waitForTimeout(3000);
const nf = await p.evaluate(() => { const f = window.__foot().state, n = window.__game().finds.nearest(f.X, f.Y, 1500); return n ? { d: +n.d.toFixed(1), k: n.f.kind.id, x: n.f.x, y: n.f.y } : null; }); console.log('nearest find', JSON.stringify(nf), 'sparks', await p.evaluate(() => window.__game().finds.count));
await p.screenshot({ path: `${S}/s_beach.png` });
if (nf) { await p.evaluate((nf) => { const f = window.__foot().state; f.X = nf.x - 4; f.Y = nf.y; f.camP.set(f.X - 5, 3, -f.Y + 2); }, nf); await p.waitForTimeout(3000); await p.screenshot({ path: `${S}/s_spark.png` }); await p.evaluate((nf) => { const f = window.__foot().state; f.X = nf.x; f.Y = nf.y; }, nf); await p.waitForTimeout(600);
  console.log('after take', await p.evaluate(() => document.getElementById('toast').textContent), JSON.stringify(await p.evaluate(() => window.__game().finds.coll)), await p.evaluate(() => document.getElementById('dstat').innerText)); await p.screenshot({ path: `${S}/s_take.png` }); }
console.log('journal', await p.evaluate(() => [...document.querySelectorAll('#jlist .ja.ok b')].map((e) => e.textContent).join(', ')));
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close();
