// Живой берег в браузере: днём -- отдыхающие у Чолпон-Аты, ночью -- компании у костров. Снимки в папку из аргумента.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const PW = ['/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/', '/'].find((d) => { try { createRequire(d).resolve('playwright'); return true; } catch { return false; } });
const { chromium } = createRequire(PW)('playwright'); const S = process.argv[2] || 'shots'; fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } }); p.setDefaultTimeout(300000);
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + process.cwd() + '/dist/index.html');
await p.waitForFunction(() => window.__game && window.__game() && window.__game().beach, null, { timeout: 120000 });
await p.evaluate(() => localStorage.setItem('issyk.craft', JSON.stringify('yacht'))); await p.click('#c_yacht').catch(() => {}); await p.click('#bfree'); await p.waitForTimeout(1500);
const look = (hr, kind) => p.evaluate(([hr, kind]) => { const G = window.__game(); G.clock = hr; const B = G.beach;
  // камера над берегом Чолпон-Аты, чтобы ячейки заселились
  G.dbgLook = { p: [-2249, 60, -900], t: [-2249, 0, -1300] }; return B.cells.filter((c) => c.on).length; }, [hr, kind]);
const aim = (pred) => p.evaluate((pred) => { const G = window.__game(), B = G.beach, f = new Function('e', 'c', 'return ' + pred); let best = null;
  for (const c of B.cells) if (c.on) for (const e of (c.camp ? c.ents.concat(c.camp.ents) : c.ents)) if (e.s && e.s.visible && f(e, c)) { best = e; break; }
  if (!best) return 'none'; const e = best, h = G.h(e.x, e.y); G.dbgLook = { p: [e.x - 9, h + 3.5, -(e.y - 9)], t: [e.x, h + 0.8, -e.y] }; return `${e.role || e.prop} at ${e.x.toFixed(0)},${e.y.toFixed(0)} zone`; }, pred);
await look(13); await p.waitForTimeout(6000);
console.log('day cells', await p.evaluate(() => window.__game().beach.cells.filter((c) => c.on).map((c) => c.zone + ':' + c.ents.length).join(' ')), 'sprites', await p.evaluate(() => window.__game().beach.count));
console.log('aim day', await aim("e.role === 'pink'")); await p.waitForTimeout(2500); await p.screenshot({ path: `${S}/b_day.png` });
console.log('aim vendor', await aim("e.vendor")); await p.waitForTimeout(2000); await p.screenshot({ path: `${S}/b_vend.png` });
await look(23); await p.waitForTimeout(5000);
console.log('night camps', await p.evaluate(() => window.__game().beach.cells.filter((c) => c.camp).map((c) => c.zone + ':' + c.camp.sc).join(' ')), 'sprites', await p.evaluate(() => window.__game().beach.count));
console.log('visible keys', await p.evaluate(() => { const G = window.__game(), out = {}; G.scene_ = null; const sc = window.__gfx().scene; sc.traverse((o) => { if (o.isSprite && o.visible && o.userData.key) out[o.userData.key] = (out[o.userData.key] || 0) + 1; }); return JSON.stringify(out); }));
console.log('aim fire', await aim('e.fire')); await p.waitForTimeout(2500); await p.screenshot({ path: `${S}/b_night.png` });
console.log(errs.slice(0, 5).join('\n') || 'no errors'); await b.close();
