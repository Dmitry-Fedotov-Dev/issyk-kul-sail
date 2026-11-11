// Рябь = картинка меняется при ничтожном сдвиге неподвижной камеры (5 см по высоте). Мир заморожен.
// Печатает среднюю разницу яркости по строкам экрана: небо ~0, горы -- то, что нас интересует, вода -- отдельно.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
await p.goto('file://' + path.resolve(process.argv[2] || 'dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 200000 });
await p.click('#w_breeze'); await p.click('#bfree');
const tag = process.argv[3] || 'new';
for (const [name, th] of [['south', Math.PI], ['north', 0]]) {
  await p.evaluate((th) => { const G = window.__game(), b = G.player.b; G.freeze = false; b.reset(500, -2500, th); window.__tick(1, { left: false, right: false, ease: false }); G.freeze = true; G.dbgCam = { back: 14, side: 3, up: 4 }; }, th);
  for (let i = 0; i < 2; i++) { await p.evaluate((i) => { const b = window.__game().player.b; b.X = 500 + i * 0.4; b.Y = -2500 + i * 0.4; }, i); await p.waitForTimeout(1200); await p.screenshot({ path: `shots/shim_${tag}_${name}_${i}.png` }); }
}
await b.close();
