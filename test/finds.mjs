// Находки видно с воды: яхта у пляжа днём и ночью (время -- кнопкой в меню). Запуск: node test/finds.mjs <папка>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire('/home/feduk/.npm/_npx/e41f203b7505f1fb/node_modules/')('playwright'); const S = process.argv[2] || 'shots'; fs.mkdirSync(S, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } }); p.setDefaultTimeout(300000); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file://' + process.cwd() + '/dist/index.html');
await p.waitForFunction(() => window.__game && window.__game() && window.__game().corridor, null, { timeout: 120000 });
for (const tod of ['day', 'night']) {
  await p.click('#tod [data-id="' + tod + '"]'); await p.click('#c_yacht'); await p.click('#bfree'); await p.waitForTimeout(1000);
  // яхта в воде напротив ближайшей находки, носом к берегу
  const f = await p.evaluate(() => { const G = window.__game(); const b = G.player.b; b.X = 100; b.Y = 350; b.vx = b.vy = 0; return G.clock; }); console.log(tod, 'clock', f.toFixed(1));
  await p.waitForTimeout(15000);
  const nf = await p.evaluate(() => { const G = window.__game(), b = G.player.b, n = G.finds.nearest(b.X, b.Y, 2000); if (!n) return null; window.__rare = n.f; n.f.kind = { ...n.f.kind, tone: 6, col: [255, 140, 255] }; if (n.f.s) n.f.s.material.color.setRGB(1, 0.55, 1); let x = n.f.x, y = n.f.y; const a = Math.atan2(b.X - x, b.Y - y); for (let r = 10; r < 200; r += 5) { const X = x + Math.sin(a) * r, Y = y + Math.cos(a) * r; if (G.h(X, Y) < -1.5) { b.X = X; b.Y = Y; b.th = a + Math.PI; break; } } const cx = x + Math.sin(a) * 45, cy = y + Math.cos(a) * 45; G.dbgLook = { p: [cx, 3, -cy], t: [x, 0.5, -y] }; return { k: n.f.kind.id, d: Math.hypot(b.X - x, b.Y - y).toFixed(0), n: G.finds.count }; });
  console.log(tod, 'find', JSON.stringify(nf)); await p.waitForTimeout(6000); await p.screenshot({ path: `${S}/fd_${tod}.png` });
  await p.evaluate(() => { window.__game().dbgLook = null; document.getElementById('bmenu').click(); }); await p.waitForTimeout(800);
}
console.log(errs.join('\n') || 'no errors'); await b.close();
