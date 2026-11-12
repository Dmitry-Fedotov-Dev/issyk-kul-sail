// Плавность анимации: шаг за шагом снимаем угол весла и корпуса и ищем скачки между соседними кадрами.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(600000); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 });
for (const id of ['kayak', 'sup', 'scull']) { await p.evaluate((id) => { document.getElementById('w_breeze').click(); document.getElementById('c_' + id).click(); document.getElementById('bfree').click(); }, id);
  const r = await p.evaluate((id) => { const G = window.__game(), b = G.player.b, m = G.player.model; b.reset(300, -1200, 0.3); let maxJ = 0, prev = null, idle = null;
    // ритмичные гребки, потом пауза -- модель должна вернуться в покой
    for (let i = 0; i < 60 * 8; i++) { const t = i / 60, on = t < 5; const inp = id === 'scull' ? { ease: on && (t % 1.9) < 0.07 } : { left: on && (t % 1.3) < 0.07, right: on && ((t + 0.65) % 1.3) < 0.07 };
      window.__tick(1 / 60, inp); const q = []; m.root.traverse((o) => { if (o.isMesh && o.parent && o.parent !== m.root && o.parent.type === 'Group') { q.push(o.parent.rotation.x, o.parent.rotation.y, o.parent.rotation.z); } });
      if (prev) { let d = 0; for (let k = 0; k < q.length; k++) d = Math.max(d, Math.abs(q[k] - prev[k])); maxJ = Math.max(maxJ, d); } prev = q; if (t > 7.9 && !idle) idle = q.slice(); }
    window.__tick(0.5, {}); const q2 = []; m.root.traverse((o) => { if (o.isMesh && o.parent && o.parent !== m.root && o.parent.type === 'Group') q2.push(o.parent.rotation.x, o.parent.rotation.y, o.parent.rotation.z); });
    let still = 0; for (let k = 0; k < q2.length; k++) still = Math.max(still, Math.abs(q2[k] - idle[k]));
    return { maxJumpPerFrameDeg: +(maxJ * 57.3).toFixed(1), settledDeg: +(still * 57.3).toFixed(2) }; }, id);
  console.log(id, JSON.stringify(r)); await p.evaluate(() => document.getElementById('bmenu').click()); }
await b.close();
