import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
const ff = (s, i) => p.evaluate(([s, i]) => window.__tick(s, { left: false, right: false, ease: false, ...i }), [s, i || {}]);
const hud = () => p.evaluate(() => ({ hint: document.getElementById('hint').textContent, mark: document.getElementById('markd').textContent, cls: document.getElementById('mark').className, brief: !document.getElementById('brief').hidden, leg: window.__game().player.leg }));
await p.click('#w_santash'); await p.click('#brace'); await ff(6); await p.waitForTimeout(2500); await p.screenshot({ path: 'shots/brief.png' }); console.log('prestart', JSON.stringify(await hud()));
await ff(24); await p.waitForTimeout(2000); console.log('after gun', JSON.stringify(await hud())); await p.screenshot({ path: 'shots/leg1.png' });
// встаём носом прямо на знак, то есть в ветер
await p.evaluate(() => { const G = window.__game(), b = G.player.b, R = G.race; b.th = Math.atan2(R.W.X - b.X, R.W.Y - b.Y); b.vx = b.vy = 0; }); await ff(3); await p.waitForTimeout(1500); console.log('pointing at mark', JSON.stringify(await hud()));
// уходим одним галсом далеко за знак
await p.evaluate(() => { const G = window.__game(), b = G.player.b, R = G.race, q = R.pt(R.aW + 30, -120); b.reset(q.X, q.Y, G.wind.dir0 - 0.8); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.player.leg = 1; }); await ff(2); await p.waitForTimeout(1500); console.log('overstood', JSON.stringify(await hud()));
console.log(errs.join('\n') || 'no console errors'); await b.close();
