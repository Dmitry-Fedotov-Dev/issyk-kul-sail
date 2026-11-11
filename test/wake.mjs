import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 640 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 90000 });
await p.click('#w_santash'); await p.click('#bfree');
await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1500, G.wind.dir0 + 1.6); b.vx = Math.sin(b.th) * 3; b.vy = Math.cos(b.th) * 3; G.cam = 2; window.__tick(8, { left: false, right: false, ease: false }); });
await p.waitForTimeout(2000); await p.screenshot({ path: 'shots/wake_straight.png' });
// поворот: руль вправо на 6 секунд -- след обязан лечь дугой
const r = await p.evaluate(() => { const G = window.__game(), b = G.player.b, th0 = b.th; window.__tick(6, { left: false, right: true, ease: false }); window.__tick(0.2, { left: false, right: false, ease: false });
  const a = G.player.wake.mesh.geometry.attributes.position.array, mid = (i) => [(a[i * 6] + a[i * 6 + 3]) / 2, (a[i * 6 + 2] + a[i * 6 + 5]) / 2];
  // кривизна следа: отклонение середины ленты от прямой между её началом и точкой в 40 м
  const p0 = mid(0), p1 = mid(22), p2 = mid(44), dx = p2[0] - p0[0], dz = p2[1] - p0[1], L = Math.hypot(dx, dz);
  return { turnedDeg: Math.round((b.th - th0) * 57.3), chord: +L.toFixed(1), sagitta: +Math.abs(((p1[0] - p0[0]) * dz - (p1[1] - p0[1]) * dx) / L).toFixed(1) }; });
console.log('after turn:', JSON.stringify(r));
await p.waitForTimeout(2500); await p.screenshot({ path: 'shots/wake_turn.png' });
console.log(errs.slice(0, 5).join('\n') || 'no console errors'); await b.close();
