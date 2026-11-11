import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 500)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 });
await p.click('#w_breeze'); await p.click('#bfree');
// север: залитые солнцем горы
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(500, -2500, 0); G.camYaw = 0; window.__tick(2, {}); G.freeze = true; }); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/sun_north.png' });
// на солнце: оно на ЮЮЗ, высота около 38 градусов -- смотрим туда и чуть вверх
await p.evaluate(() => { const G = window.__game(); G.freeze = false; G.player.b.reset(500, -2500, 3.55); G.camYaw = 3.55; G.orbitP = -0.2; G.zoom = 1.3; window.__tick(1, {}); G.freeze = true; }); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/sun_at.png' });
await p.evaluate(() => { const G = window.__game(); G.freeze = false; G.cam = 1; G.orbit = 0.5; G.orbitP = -0.45; window.__tick(0.5, {}); G.freeze = true; }); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/sun_cockpit.png' });
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
