import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
for (const [name, dev] of [['m_menu', devices['iPhone 13']], ['m_menu_small', devices['iPhone SE']], ['m_menu_land', devices['iPhone 13 landscape']]]) {
  const m = await b.newPage({ ...dev }); m.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await m.goto('file://' + path.resolve('dist/index.html')); await m.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
  await m.waitForTimeout(2500); await m.screenshot({ path: `shots/${name}.png` });
  console.log(name, await m.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), a = r('bfree'), c = r('brace'), h = r('how'); return JSON.stringify({ vw: innerWidth, vh: innerHeight, free: [Math.round(a.top), Math.round(a.bottom)], race: [Math.round(c.top), Math.round(c.bottom)], howBottom: Math.round(h.bottom), scrollY: document.getElementById('menu').scrollHeight > innerHeight + 1, scrollX: document.documentElement.scrollWidth > innerWidth }); }));
  if (name === 'm_menu') { await m.tap('#w_ulan'); await m.tap('#brace'); await m.waitForTimeout(3000); await m.screenshot({ path: 'shots/m_race.png' }); console.log('race started from phone menu:', await m.evaluate(() => window.__game().mode)); }
  await m.close();
}
console.log(errs.join('\n') || 'no page errors'); await b.close();
