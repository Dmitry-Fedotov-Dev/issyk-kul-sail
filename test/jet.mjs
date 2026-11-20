// Як-130 в браузере: полоса -> разбег -> отрыв -> полёт (снаружи и из кабины) -> кольца -> катапульта.
// Запуск: node test/jet.mjs <папка>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright'); const S = process.argv[2] || 'shots'; fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } }); p.setDefaultTimeout(300000); const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + process.cwd() + '/dist/index.html');
await p.waitForFunction(() => window.__game && window.__game() && window.__game().corridor, null, { timeout: 120000 });
await p.click('#c_jet'); console.log('menu', await p.evaluate(() => document.getElementById('bfree').innerText.replace(/\n/g, ' | '), await p.evaluate(() => document.getElementById('brace').innerText.replace(/\n/g, ' | '))));
await p.click('#bfree'); await p.waitForTimeout(2500);
const st = () => p.evaluate(() => { const j = window.__jet().jet; return { mode: j.mode, V: Math.round(j.V * 3.6), alt: Math.round(j.Z + 1601), agl: Math.round(j.agl || 0), n: +j.n.toFixed(1), gear: j.gear, rwy: window.__jet().runway && Math.round(window.__jet().runway.th * 57.3) }; });
console.log('start', JSON.stringify(await st()), errs.join('|')); await p.screenshot({ path: `${S}/j_rwy.png` });
await p.evaluate(() => window.__tick(6, { bar: true })); await p.waitForTimeout(1500); console.log('roll', JSON.stringify(await st())); await p.screenshot({ path: `${S}/j_roll.png` });
await p.evaluate(() => window.__tick(8, { bar: true })); await p.evaluate(() => window.__tick(3, { bar: true, flare: true })); await p.evaluate(() => window.__tick(12, { bar: false, flare: false }));
console.log('air', JSON.stringify(await st()), await p.evaluate(() => document.getElementById('toast').textContent)); await p.waitForTimeout(2000); await p.screenshot({ path: `${S}/j_air.png` });
await p.evaluate(() => window.__tick(0.6, { right: true })); await p.evaluate(() => window.__tick(0.01, { right: false })); await p.waitForTimeout(2500); console.log('bank', JSON.stringify(await st())); await p.screenshot({ path: `${S}/j_bank.png` });
await p.evaluate(() => { window.__game().cam = 1; }); await p.waitForTimeout(2500); console.log('cockpit dbg', JSON.stringify(await p.evaluate(() => { const j = window.__jet().jet; return { gam: +j.gamma.toFixed(3), phi: +j.phi.toFixed(2) }; }))); await p.screenshot({ path: `${S}/j_cockpit.png` }); await p.evaluate(() => { window.__game().cam = 0; });
// петля
await p.evaluate(() => window.__tick(25, { bar: true, sin: false })); console.log('fast', JSON.stringify(await st())); await p.evaluate(() => window.__tick(25, { bar: true, flare: true })); await p.evaluate(() => window.__tick(5, { bar: false, flare: false })); console.log('after loop', JSON.stringify(await st()), 'journal', await p.evaluate(() => [...document.querySelectorAll('#jlist .ja.ok b')].map((e) => e.textContent).join(', ')));
// кольца
await p.evaluate(() => { document.getElementById('bmenu').click(); }); await p.waitForTimeout(800); await p.click('#brace'); await p.waitForTimeout(2500);
console.log('rings', await p.evaluate(() => window.__jet().rings.map((r) => `${r.X},${r.Y},${r.Z}:h${Math.round(window.__game().h(r.X, r.Y))}`).join(' ')));
await p.evaluate(() => window.__tick(17, {})); await p.waitForTimeout(2500); await p.screenshot({ path: `${S}/j_ring.png` }); console.log('dbg', JSON.stringify(await p.evaluate(() => { const j = window.__jet().jet, G = window.__game(); return { cam: G.cam, gam: +j.gamma.toFixed(3), phi: +j.phi.toFixed(2), f: j.f.map((v) => +v.toFixed(2)), u: j.u.map((v) => +v.toFixed(2)) }; })));
console.log('race', await p.evaluate(() => document.getElementById('jring').innerText.replace(/\n/g, ' ')), await p.evaluate(() => document.getElementById('markd').textContent));
// катапульта: пике в воду
await p.evaluate(() => window.__tick(12, { sin: true })); await p.waitForTimeout(12000); console.log('crash', JSON.stringify(await st()), await p.evaluate(() => document.getElementById('toast').textContent)); await p.screenshot({ path: `${S}/j_eject.png` });
await p.evaluate(() => window.__tick(7, {})); await p.waitForTimeout(2500); console.log('result', await p.evaluate(() => !document.getElementById('result').hidden && document.getElementById('rh').textContent + ' / ' + document.getElementById('rs').textContent));
// посадка: на глиссаде в 3 км от торца, автоматика выпускает шасси и держит 270 км/ч
await p.evaluate(() => { document.getElementById('result').hidden = true; document.getElementById('bmenu').click(); }); await p.waitForTimeout(600); await p.click('#c_jet'); await p.click('#bfree'); await p.waitForTimeout(1500);
console.log('land', await p.evaluate(() => { const JM = window.__jet(), j = JM.jet, r = JM.runway, th = r.th + Math.PI, s0 = r.L / 2 + 3000, X = r.X + Math.sin(r.th) * s0, Y = r.Y + Math.cos(r.th) * s0, gz = window.__game().h(r.X + Math.sin(r.th) * (r.L / 2 - 150), r.Y + Math.cos(r.th) * (r.L / 2 - 150));
  j.reset(X, Y, gz + 160, th, 'air', 80); j.gear = false; JM._F().airT = 40; j.f = [Math.sin(th) * 0.9986, Math.cos(th) * 0.9986, -0.053]; const z = { sin: false, flare: false, bar: false, left: false, right: false, shift: false }, log = []; for (let k = 0; k < 35 && j.mode === 'air'; k++) { window.__tick(1, z); log.push(`${Math.round(j.agl)}/${j.vz.toFixed(1)}/${Math.round(window.__game().h(j.X, j.Y))}`); } window.__tick(40, {}); window.__landLog = log.join(' '); return JSON.stringify({ log: window.__landLog, mode: j.mode, V: Math.round(j.V * 3.6), gear: j.gear, onR: j.onRwy, toast: document.getElementById('toast').textContent }); }));
await p.waitForTimeout(2000); console.log('land result', await p.evaluate(() => !document.getElementById('result').hidden && document.getElementById('rh').textContent + ' / ' + document.getElementById('rs').textContent), await p.evaluate(() => [...document.querySelectorAll('#jlist .ja.ok b')].map((e) => e.textContent).join(', ')));
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close();
