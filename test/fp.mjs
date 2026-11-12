// Вид от первого лица на каждом снаряде, на экране компьютера и телефона (портрет и альбом).
import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [dev, opt, list] of [['d', { viewport: { width: 960, height: 540 } }, ['yacht', 'kayak', 'scull', 'sup', 'jetski', 'boat']], ['p', devices['iPhone 13'], ['kayak', 'boat']], ['l', devices['iPhone 13 landscape'], ['sup', 'jetski']]]) {
  const p = await b.newPage(opt); p.setDefaultTimeout(300000); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.goto('file://' + path.resolve('dist/index.html')); await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 });
  for (const id of list) { await p.evaluate((id) => { document.getElementById('w_breeze').click(); document.getElementById('c_' + id).click(); document.getElementById('bfree').click(); }, id);
    const r = await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(300, -1200, 0.3); G.camYaw = 0.3; G.cam = 1; const m = b.spec && b.spec.cls === 'motor';
      for (let i = 0; i < 180; i++) { const t = i / 60; window.__tick(1 / 60, m ? { ease: true } : b.kind === 'scull' ? { ease: (t % 1.9) < 0.1 } : b.kind ? { left: (t % 1.3) < 0.1, right: ((t + 0.65) % 1.3) < 0.1 } : {}); }
      G.freeze = true; return { fp: !!G.player.model.fp }; });
    await p.waitForTimeout(1300); await p.screenshot({ path: `shots/fp_${dev}_${id}.png` });
    await p.evaluate(() => { const G = window.__game(); G.freeze = false; G.cam = 0; document.getElementById('bmenu').click(); }); }
  await p.close(); }
await b.close();
