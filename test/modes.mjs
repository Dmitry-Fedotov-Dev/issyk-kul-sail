// Режимы: спринт, слалом, сплав, милиция, старт на горе. Игроком управляет автомат -- проверяем, что всё проходимо.
import { createRequire } from 'node:module'; const { chromium } = createRequire('/')('playwright');
import path from 'node:path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(600000);
const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await p.goto('file://' + path.resolve('dist/index.html'));
await p.waitForFunction(() => window.__game && window.__game() && document.getElementById('load').hidden, null, { timeout: 240000 });
await p.click('#w_breeze'); const want = process.argv.slice(2), on = (k) => !want.length || want.includes(k);
const shot = async (n) => { await p.evaluate(() => { window.__game().freeze = true; }); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/${n}.png` }); await p.evaluate(() => { window.__game().freeze = false; }); };
// автомат игрока: гребёт или газует к точке
const drive = `(sec, tgt) => { const G = window.__game(); let t = 0; const st = G.__st || (G.__st = {}); for (let i = 0; i < sec * 60; i++) { const b = G.player.b, g = tgt(G, b); if (!g) break; const err = Math.atan2(Math.sin(Math.atan2(g.X - b.X, g.Y - b.Y) - b.th), Math.cos(Math.atan2(g.X - b.X, g.Y - b.Y) - b.th));
  let inp; if (b.spec.cls === 'motor') inp = { left: err < -0.06, right: err > 0.06, ease: g.thr === undefined ? Math.abs(err) < 1.2 || b.speed < 4 : g.thr };
  else { st.t = (st.t ?? 9) + 1 / 60; st.hold = (st.hold || 0) - 1 / 60; inp = { left: false, right: false, ease: b.capsized || !!g.brace }; if (st.hold > 0) inp[st.key] = true; else if (st.t >= b.spec.period) { st.t = 0; st.hold = 0.08; st.key = b.kind === 'scull' ? (Math.abs(err) > 0.09 ? (err > 0 ? 'left' : 'right') : 'ease') : Math.abs(err) > 0.14 ? (err > 0 ? 'left' : 'right') : (st.last === 'left' ? 'right' : 'left'); st.last = st.key; inp[st.key] = true; } }
  window.__tick(1 / 60, inp); } }`;
if (on('sprint')) { await p.click('#c_kayak'); await p.click('#brace');
  for (let i = 0; i < 30; i++) { await p.evaluate(`(${drive})(10, (G, b) => (G.race2 && !G.race2.over ? G.player.course[G.player.leg] : null))`); if (await p.evaluate(() => !window.__game().race2 || window.__game().race2.over)) break; if (i === 1) await shot('x_sprint'); }
  console.log('sprint:', await p.evaluate(() => { const G = window.__game(), R = G.race2; return JSON.stringify({ t: +R.t.toFixed(0), player: +G.player.time.toFixed(1), rivals: R.rivals.map((r) => [r.name, r.leg, +r.time.toFixed(1), r.b.capsized]), result: document.getElementById('rh').textContent }); })); await p.keyboard.press('Escape'); }
if (on('slalom')) { await p.click('#c_jetski'); await p.click('#brace');
  for (let i = 0; i < 20; i++) { await p.evaluate(`(${drive})(10, (G, b) => (G.race2 && !G.race2.over ? G.player.course[G.player.leg] : null))`); if (await p.evaluate(() => !window.__game().race2 || window.__game().race2.over)) break; if (i === 1) await shot('x_slalom'); }
  console.log('slalom:', await p.evaluate(() => { const G = window.__game(), R = G.race2; return JSON.stringify({ t: +R.t.toFixed(0), playerLeg: G.player.leg, player: +G.player.time.toFixed(1), rivals: R.rivals.map((r) => [r.name, r.leg, +r.time.toFixed(1), r.b.capsized]) }); })); await p.keyboard.press('Escape'); }
if (on('river')) { await p.click('#c_kayak'); await p.click('#briver');
  // автомат: держит нос по струе и подгребает к середине русла, на порогах в крене ставит опору
  for (let i = 0; i < 40; i++) { await p.evaluate(`(${drive})(10, (G, b) => { if (!G.rv || G.rv.over) return null; const pr = G.rv.pr, l = Math.hypot(b.cx, b.cy) || 1, fx = b.cx / l, fy = b.cy / l, d = pr ? pr.d : 0; return { X: b.X + fx * 14 - fy * d, Y: b.Y + fy * 14 + fx * d, brace: Math.abs(b.phi) > 0.45 }; })`);
    if (i === 2) await shot('x_river'); if (i === 7) await shot('x_river2'); const q = await p.evaluate(() => { const G = window.__game(); return G.rv ? [G.rv.over, Math.round(G.rv.pr.s), G.rv.hits, G.player.b.capsized] : null; }); if (!q || q[0]) break; if (i % 4 === 0) console.log('  river progress', JSON.stringify(q)); }
  console.log('river:', await p.evaluate(() => { const G = window.__game(), rv = G.rv, b = G.player.b; return JSON.stringify({ t: +rv.t.toFixed(0), over: rv.over, hits: rv.hits, s: rv.pr && Math.round(rv.pr.s), cap: b.capsized, result: document.getElementById('rs').textContent }); })); await p.keyboard.press('Escape'); }
if (on('law')) { await p.click('#c_boat'); await p.click('#bfree');
  const st = () => p.evaluate(() => { const G = window.__game(), L = G.__X.traffic.law, P = G.__X.traffic.patrols[0].b, b = G.player.b; return { stars: L.stars, d: Math.round(Math.hypot(P.X - b.X, P.Y - b.Y)), fines: L.fines, wanted: document.getElementById('wanted').hidden ? '' : document.getElementById('wanted').textContent, kn: +(b.speed * 1.944).toFixed(0) }; });
  console.log('npc visible:', await p.evaluate(() => window.__game().__X.traffic.list.filter((e) => e.model.root.visible).map((e) => e.type).join(',')));
  await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1400, 2.4); G.__X.traffic.offence(1, 'тест: столкновение'); });
  await p.evaluate(`(${drive})(120, (G, b) => (G.__X.traffic.law.stars ? { X: b.X + Math.sin(b.th) * 50, Y: b.Y + Math.cos(b.th) * 50, thr: false } : null))`); console.log('stopped and waited:', JSON.stringify(await st()), '| toast:', await p.evaluate(() => document.getElementById('toast').textContent));
  await p.evaluate(() => { window.__game().__X.traffic.offence(2, 'тест: навал'); });
  const flee = `(G, b) => { const L = G.__X.traffic.law; if (!L.stars) return null; const P = G.__X.traffic.patrols[0].b, a = Math.atan2(b.X - P.X, b.Y - P.Y); let th = a; for (const k of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) { if (G.h(b.X + Math.sin(a + k) * 250, b.Y + Math.cos(a + k) * 250) < -6) { th = a + k; break; } } return { X: b.X + Math.sin(th) * 300, Y: b.Y + Math.cos(th) * 300 }; }`;
  await p.evaluate(`(${drive})(20, ${flee})`); console.log('fleeing 20 s:', JSON.stringify(await st())); await shot('x_police');
  await p.evaluate(`(${drive})(240, ${flee})`); console.log('fleeing on:', JSON.stringify(await st()), '| toast:', await p.evaluate(() => document.getElementById('toast').textContent));
  await p.keyboard.press('Escape'); await p.click('#c_kayak'); await p.click('#bfree'); await p.evaluate(() => { const G = window.__game(), b = G.player.b; b.reset(400, -1400, 2.4); G.__X.traffic.offence(1, 'тест'); });
  await p.evaluate(`(${drive})(150, ${flee})`); console.log('kayak fleeing:', JSON.stringify(await st()), '| toast:', await p.evaluate(() => document.getElementById('toast').textContent));
  console.log('law achievements:', await p.evaluate(() => JSON.parse(localStorage.getItem('issyk.ach') || '[]').filter((a) => a[0] === 'l' && a[1] === '_').join(','))); await p.keyboard.press('Escape'); }
if (on('gag')) { await p.click('#c_kayak'); await p.click('#bmap'); const bb = await (await p.$('#mapcv')).boundingBox(); await p.mouse.click(bb.x + bb.width * 0.52, bb.y + bb.height * 0.2); await p.waitForTimeout(300);
  console.log('map pick:', await p.evaluate(() => document.getElementById('bmap').textContent)); await p.screenshot({ path: 'shots/x_map.png' }); await p.click('#mclose'); await p.click('#bfree');
  let r; for (let i = 0; i < 30; i++) { r = await p.evaluate(() => { window.__tick(3, { left: false, right: false, ease: false }); const G = window.__game(), b = G.player.b; return { gag: !!G.gag, h: Math.round(G.h(b.X, b.Y)), y: Math.round(b.y), toast: document.getElementById('toast').textContent }; }); if (i === 1) await shot('x_gag'); if (!r.gag) break; }
  console.log('mountain start ends:', JSON.stringify(r)); await p.keyboard.press('Escape'); await p.click('#bmap'); await p.click('#mreset'); }
console.log(errs.slice(0, 8).join('\n') || 'no console errors'); await b.close();
