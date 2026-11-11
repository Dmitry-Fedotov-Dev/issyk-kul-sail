import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, opt] of [['menu_d', { viewport: { width: 1280, height: 720 } }], ['menu_p', devices['iPhone 13']]]) { const p = await b.newPage(opt); p.setDefaultTimeout(300000); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('file://' + path.resolve('dist/index.html')); await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 }); await p.waitForTimeout(2500); await p.screenshot({ path: `shots/${name}.png` });
  console.log(name, await p.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(); return JSON.stringify({ cardRight: Math.round(c.right), vw: innerWidth }); })); await p.close(); }
await b.close();
