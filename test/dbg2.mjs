import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } }); p.setDefaultTimeout(600000); p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 240000 });
await p.click('#w_breeze'); await p.click('#c_kayak'); await p.click('#brace');
console.log(await p.evaluate(() => { const G = window.__game(); window.__tick(25, {}); const R = G.race2; return JSON.stringify(R.rivals.map((r) => ({ along: Math.round((r.b.X - R.S.X) * R.dir.x + (r.b.Y - R.S.Y) * R.dir.y), kn: +(r.b.speed * 1.94).toFixed(1), strokes: r.b.strokes, cap: r.b.capsized, agr: r.b.aground, heel: Math.round(r.b.phi * 57), ai: r.ai, c: r.course[0] }))); }));
await b.close();
