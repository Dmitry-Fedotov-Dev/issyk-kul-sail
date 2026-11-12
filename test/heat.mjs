// Онлайн-заезд: двое на каяках стартуют вместе, NPC добирают до четырёх; износ копится и чинится у буя.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import { spawn } from 'node:child_process';
const PORT = 8139, srv = spawn('node', ['server.js'], { env: { ...process.env, PORT }, stdio: 'pipe' }); await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const open = async () => { const p = await b.newPage({ viewport: { width: 800, height: 450 } }); p.setDefaultTimeout(300000); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 280000 });
  await p.click('#w_breeze'); await p.click('#c_kayak'); return p; };
const A = await open(), B = await open();
// ждём синхронизации часов с сервером (первый пакет мира приходит только в игре) -- заходим в свободное плавание и обратно
for (const p of [A, B]) { await p.click('#bfree'); }
for (let i = 0; i < 12; i++) { for (const p of [A, B]) await p.evaluate(() => window.__tick(0.1, {})); await new Promise((r) => setTimeout(r, 150)); }
for (const p of [A, B]) { await p.keyboard.press('Escape'); await p.click('#brace'); }
const info = (p) => p.evaluate(() => { const G = window.__game(), R = G.race2; return { online: !!R.online, room: R.room, t: +R.t.toFixed(1), npc: R.all.length - 1, peers: [...G.__X.net.pups.values()].filter((q) => q.model.root.visible).length, toast: document.getElementById('toast').textContent }; });
console.log('before gun  A:', JSON.stringify(await info(A))); console.log('            B:', JSON.stringify(await info(B)));
for (let i = 0; i < 400; i++) { for (const p of [A, B]) await p.evaluate(() => window.__tick(0.1, {})); await new Promise((r) => setTimeout(r, 120)); if ((await A.evaluate(() => window.__game().race2.t)) > 1.5) break; }
console.log('after gun   A:', JSON.stringify(await info(A))); console.log('            B:', JSON.stringify(await info(B)));
// износ и ремонт
const w = await A.evaluate(() => { const G = window.__game(), b = G.player.b; b.wearA = 0.6; b.wearH = 0.4; const before = b.spec.force * (1 - 0.3 * b.wearA);
  window.__tick(1, {}); const hud = document.getElementById('wear').textContent; const pit = G.__X.pit(); b.X = pit.X + 3; b.Y = pit.Y; b.vx = b.vy = 0; window.__tick(4, {}); return { hud, after: [+b.wearA.toFixed(2), +b.wearH.toFixed(2)], hud2: document.getElementById('wear').textContent, toast: document.getElementById('toast').textContent }; });
console.log('wear/repair:', JSON.stringify(w)); console.log(errs.join('\n') || 'no page errors');
await b.close(); srv.kill();
