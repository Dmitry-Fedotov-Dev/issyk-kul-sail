import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } }); p.setDefaultTimeout(300000);
p.on('console', (m) => { if (m.type() !== 'log') console.log('[' + m.type() + ']', m.text().slice(0, 700)); }); p.on('pageerror', (e) => console.log('PAGEERROR', e.message, (e.stack || '').slice(0, 400)));
await p.goto('file://' + path.resolve('dist/index.html')); await p.waitForTimeout(15000);
console.log('load text:', await p.evaluate(() => document.getElementById('load').textContent + ' hidden=' + document.getElementById('load').hidden));
await b.close();
