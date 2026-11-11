// Дымовой тест в браузере: каждый снаряд запускается, едет под автоматом, рисуется без ошибок.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 240000 });
await p.screenshot({ path: 'shots/x_menu.png' });
await p.click('#w_breeze');
const which = process.argv.slice(2).length ? process.argv.slice(2) : ['kayak', 'scull', 'sup', 'jetski', 'boat'];
for (const id of which) {
  await p.click('#c_' + id); await p.click('#bfree');
  const r = await p.evaluate((id) => { const G = window.__game(), b = G.player.b; b.reset(300, -900, 2.4); G.camYaw = 2.4;
    const motor = b.spec.cls === 'motor'; let t = 0;
    for (let i = 0; i < 60 * 14; i++) { t += 1 / 60; let inp;
      if (motor) inp = { left: false, right: false, ease: true };
      else if (id === 'scull') inp = { left: false, right: false, ease: (t % 1.9) < 0.1 };
      else { const k = Math.floor(t / b.spec.period) % 2, on = (t % b.spec.period) < 0.1; inp = { left: on && !k, right: on && !!k, ease: false }; }
      window.__tick(1 / 60, inp); }
    return { kind: b.kind, kn: +(b.speed * 1.944).toFixed(1), status: b.status(), pos: document.getElementById('pos').textContent, ts: document.getElementById('ts').textContent, npc: window.__game().mode }; }, id);
  console.log(id, JSON.stringify(r)); await p.evaluate(() => { window.__game().freeze = true; window.__game().dbgCam = null; }); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/x_${id}.png` });
  await p.evaluate(() => { window.__game().freeze = false; }); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
}
console.log(errs.slice(0, 8).join('\n') || 'no console errors'); await b.close();
