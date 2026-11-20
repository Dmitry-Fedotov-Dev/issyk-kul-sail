// Пеший Дымок в браузере: посадка параплана -> F (спешивание) -> ходьба, бег, прыжок -> F у ведёрка (посадка).
// Снимки -- в папку из аргумента. Запуск: node test/foot.mjs <папка>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const PW = ['/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/', '/'].find((d) => { try { createRequire(d).resolve('playwright'); return true; } catch { return false; } });
const { chromium } = createRequire(PW)('playwright'); const S = process.argv[2] || 'shots'; fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } }); p.setDefaultTimeout(300000);
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + process.cwd() + '/dist/index.html');
await p.waitForFunction(() => window.__game && window.__game() && window.__game().corridor, null, { timeout: 120000 });
await p.evaluate(() => localStorage.setItem('issyk.paraSite', JSON.stringify('airport')));
await p.click('#c_para'); await p.click('#bfree'); await p.waitForTimeout(1500);
await p.keyboard.press('Escape'); await p.waitForTimeout(300); // мультик закрываем как человек -- Esc
await p.evaluate(() => { const g = window.__game().player.g; g.mode = 'landed'; g.landed = { q: 'soft', t: 0 }; });
await p.waitForTimeout(1000);
const st = () => p.evaluate(() => { const f = window.__foot && window.__foot(); return f ? { on: f.on, st: f.state.st, X: +f.state.X.toFixed(1), Y: +f.state.Y.toFixed(1), Z: +f.state.Z.toFixed(2), surf: f.state.surf } : 'no __foot'; });
console.log('mode before F', await p.evaluate(() => window.__game().player.g.mode));
await p.keyboard.press('KeyF'); await p.waitForTimeout(900); console.log('errs', errs.join(' | ')); console.log('toast', await p.evaluate(() => document.getElementById('toast').textContent), 'bfoot hidden', await p.evaluate(() => document.getElementById('bfoot').hidden)); await p.screenshot({ path: `${S}/f_dis.png` });
await p.waitForFunction(() => window.__foot().state.st !== 'dis', null, { timeout: 60000 }); await p.waitForTimeout(800); console.log('after dis', JSON.stringify(await st())); await p.screenshot({ path: `${S}/f_idle.png` });
await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.screenshot({ path: `${S}/f_back.png` }); await p.keyboard.up('KeyW');
await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.screenshot({ path: `${S}/f_side.png` });
await p.keyboard.down('ShiftLeft'); await p.waitForTimeout(1200); await p.screenshot({ path: `${S}/f_run.png` }); await p.keyboard.press('Space'); await p.waitForTimeout(250); await p.screenshot({ path: `${S}/f_jump.png` });
await p.keyboard.up('ShiftLeft'); await p.keyboard.up('KeyD'); await p.waitForTimeout(1000); console.log('moved', JSON.stringify(await st()));
await p.keyboard.down('KeyS'); await p.waitForTimeout(1200); await p.screenshot({ path: `${S}/f_front.png` }); await p.keyboard.up('KeyS');
await p.evaluate(() => { const f = window.__foot().state; f.X = f.seat.X + 1; f.Y = f.seat.Y; });
await p.keyboard.press('KeyF'); await p.waitForFunction(() => !window.__foot().on, null, { timeout: 60000 }).catch(() => {}); console.log('mounted', JSON.stringify(await st()));
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close();
