import { createRequire } from 'node:module'; const { chromium, devices } = createRequire('/')('playwright');
import path from 'node:path'; import fs from 'node:fs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// сам экран загрузки без тяжёлого скрипта игры: страница до тега <script> с игрой
const html = fs.readFileSync('dist/index.html', 'utf8'), cut = html.lastIndexOf('<script>'); fs.writeFileSync('dist/_load.html', html.slice(0, cut) + '</body></html>');
for (const [name, opt] of [['load_desktop', { viewport: { width: 1280, height: 720 } }], ['load_phone', devices['iPhone 13']]]) { const p = await b.newPage(opt); await p.goto('file://' + path.resolve('dist/_load.html')); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/${name}.png` }); await p.close(); }
fs.unlinkSync('dist/_load.html');
// полная загрузка: этапы меняются, экран уходит, меню открыто
const p = await b.newPage({ viewport: { width: 1000, height: 560 } }); p.setDefaultTimeout(300000);
const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); const msgs = new Set();
await p.goto('file://' + path.resolve('dist/index.html'));
for (let i = 0; i < 400; i++) { const st = await p.evaluate(() => ({ m: document.getElementById('loadmsg').textContent, h: document.getElementById('load').hidden })); msgs.add(st.m); if (st.h) break; await p.waitForTimeout(100); }
console.log('stages seen:', [...msgs].join(' | ')); console.log('menu visible:', await p.evaluate(() => !document.getElementById('menu').hidden && document.getElementById('load').hidden));
console.log(errs.join('\n') || 'no page errors'); await b.close();
