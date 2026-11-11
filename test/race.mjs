import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
p.on('pageerror', (e) => console.log('PAGEERROR ' + e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game(), null, { timeout: 60000 });
for (const w of process.argv.slice(2)) {
  await p.click('#w_' + w); await p.click('#brace');
  for (let i = 0; i < 12; i++) { await p.evaluate(() => window.__tick(50, { left: false, right: false, ease: false }));
    const s = await p.evaluate(() => { const G = window.__game(), R = G.race; return G.rivals.map((r) => { const b = r.b, a = (b.X - R.S.X) * R.up.x + (b.Y - R.S.Y) * R.up.y, l = (b.X - R.S.X) * R.cr.x + (b.Y - R.S.Y) * R.cr.y; return `${r.name}:leg${r.leg} a=${a.toFixed(0)} l=${l.toFixed(0)} ${(b.speed * 1.94).toFixed(1)}kn twa=${(b.twa * 57.3).toFixed(0)}${b.capsized ? ' CAP' : ''}${b.aground ? ' AGR' : ''}${r.leg >= 4 ? ' t=' + r.time.toFixed(0) : ''}`; }).join(' | ') + ` [aW=${R.aW.toFixed(0)} aL=${R.aL.toFixed(0)}]`; });
    console.log(w, (i + 1) * 50, s); if (/leg4.*leg4.*leg4/.test(s)) break; }
  await p.keyboard.press('Escape');
}
await b.close();
