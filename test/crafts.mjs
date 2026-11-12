// Физика новых снарядов без браузера: скорости, ритм, оверкиль, глиссирование, прыжок, автоматы.
import { Wind, Waves, PRESETS, DEG, KN, wrapPi } from '../src/sim.js';
import { makeCraftBody, aiPaddle, aiMotor, SPECS } from '../src/crafts.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
function run(id, preset, secs, ctl, opts = {}) {
  const p = { ...PRESETS[preset], ...(opts.calm ? { speed: 0.5, gust: 0 } : {}) }, w = new Wind(p, null), wv = new Waves(); wv.setFromWind(Math.max(p.speed, 0.5), p.dir * DEG, opts.calm ? 500 : p.fetch);
  const b = makeCraftBody(id); b.reset(0, 0, wrapPi(p.dir * DEG + (opts.twa ?? 90) * DEG)); const st = {}, log = { ev: {}, maxV: 0, maxHeel: 0, air: 0 };
  for (let t = 0; t < secs; t += 1 / 60) { w.update(1 / 60); b.updatePose(wv, t, null); const c = ctl(b, t, st);
    b.step(1 / 120, c, w, null); b.step(1 / 120, c, w, null);
    for (const e of b.events) { log.ev[e.type] = (log.ev[e.type] || 0) + 1; if (e.type === 'land') { log.air = Math.max(log.air, e.air); b.afterLand && b.afterLand(e); } } b.events.length = 0;
    log.maxV = Math.max(log.maxV, b.speed); log.maxHeel = Math.max(log.maxHeel, Math.abs(b.phi)); }
  return { b, log, v: b.speed, kn: b.speed * KN };
}
const straight = (b) => ({ X: b.X + Math.sin(b.th0 ?? (b.th0 = b.th)) * 500, Y: b.Y + Math.cos(b.th0) * 500 });
for (const [id, lo, hi] of [['kayak', 4.2, 6.2], ['scull', 6.5, 9.5], ['sup', 2.4, 4.2]]) {
  const r = run(id, 'breeze', 60, (b, t, st) => { const g = straight(b); return aiPaddle(b, g.X, g.Y, st, 1 / 60, 1); }, { calm: true });
  ok(r.kn > lo && r.kn < hi && !r.b.capsized, `${SPECS[id].name}: автомат в ритме идёт ${r.kn.toFixed(1)} уз (ожидалось ${lo}–${hi}), темп ${Math.round(r.b.cadence)}, серия ${r.b.streak}`);
}
{ // частить -- медленнее, чем в ритм
  const good = run('kayak', 'breeze', 40, (b, t, st) => { const g = straight(b); return aiPaddle(b, g.X, g.Y, st, 1 / 60, 1); }, { calm: true });
  const spam = run('kayak', 'breeze', 40, (b, t) => { const k = Math.floor(t / 0.22) % 2, on = (t % 0.22) < 0.08; return { left: on && !k, right: on && k, ease: false, steer: 0 }; }, { calm: true });
  ok(spam.kn < good.kn * 0.9, `каяк: частить (${spam.kn.toFixed(1)} уз) медленнее, чем грести в ритм (${good.kn.toFixed(1)} уз)`);
  const oneSide = run('kayak', 'breeze', 12, (b, t) => ({ left: (t % 0.62) < 0.08, right: false, ease: false, steer: 0 }), { calm: true });
  ok(wrapPi(oneSide.b.th - (PRESETS.breeze.dir * DEG + 90 * DEG)) > 0.8, `каяк: гребки только слева разворачивают нос вправо (на ${(wrapPi(oneSide.b.th - (PRESETS.breeze.dir + 90) * DEG) / DEG).toFixed(0)}°)`);
}
{ const r = run('scull', 'breeze', 30, (b, t) => ({ left: false, right: false, ease: (t % 0.5) < 0.1, steer: 0 }), { calm: true });
  ok((r.log.ev.crab || 0) >= 1, `скиф: частые гребки ловят «краба» (${r.log.ev.crab || 0} раз)`); }
{ const still = run('sup', 'ulan', 60, () => ({ left: false, right: false, ease: false, steer: 0 }), { twa: 90 }), crouch = run('sup', 'ulan', 60, () => ({ left: false, right: false, ease: true, steer: 0 }), { twa: 90 });
  ok(still.log.ev.capsize >= 1 && !(crouch.log.ev.capsize > 0) || crouch.log.maxHeel < still.log.maxHeel, `SUP в шторм лагом к волне: стоя падает (${still.log.ev.capsize || 0}), присев держится лучше (крен ${(crouch.log.maxHeel / DEG).toFixed(0)}° против ${(still.log.maxHeel / DEG).toFixed(0)}°)`);
  const kb = run('kayak', 'ulan', 60, () => ({ left: false, right: false, ease: true, steer: 0 }), { twa: 90 }); ok(!kb.b.capsized, `каяк на опоре переживает шторм лагом к волне (макс. крен ${(kb.log.maxHeel / DEG).toFixed(0)}°)`); }
for (const [id, lo, hi] of [['jetski', 36, 48], ['boat', 28, 38]]) {
  const r = run(id, 'breeze', 30, () => ({ steer: 0, ease: true }), { calm: true });
  ok(r.kn > lo && r.kn < hi && r.log.ev.plane >= 1, `${SPECS[id].name}: полный газ ${r.kn.toFixed(0)} уз (ожидалось ${lo}–${hi}), вышел на глиссер`);
}
{ const a = run('jetski', 'breeze', 8, (b, t) => ({ steer: 1, ease: t < 4 }), { calm: true }); const thOn = run('jetski', 'breeze', 6, () => ({ steer: 1, ease: true }), { calm: true });
  const coast = run('jetski', 'breeze', 6, (b, t) => ({ steer: t > 4 ? 1 : 0, ease: t < 4 }), { calm: true });
  ok(Math.abs(coast.b.r) < Math.abs(thOn.b.r) * 0.4, `гидроцикл без газа почти не рулится (${coast.b.r.toFixed(2)} рад/с против ${thOn.b.r.toFixed(2)} с газом)`); }
{ const r = run('jetski', 'ulan', 60, (b) => ({ steer: 0, ease: true }), { twa: 0 }); ok((r.log.ev.jump || 0) >= 1, `гидроцикл в шторм против волны прыгает: ${r.log.ev.jump || 0} раз, дольше всего ${r.log.air.toFixed(2)} с в воздухе`); }
{ const r = run('boat', 'breeze', 40, (b, t, st) => aiMotor(b, 300, 300), { calm: true, twa: 0 }); ok(Math.hypot(r.b.X - 300, r.b.Y - 300) < 60 || r.b.dist > 300, `катер-автомат дошёл до точки (осталось ${Math.hypot(r.b.X - 300, r.b.Y - 300).toFixed(0)} м)`); }
// опрокидывание на волне: лагом к волне без опоры и без хода
for (const [id, pr] of [['kayak', 'santash'], ['kayak', 'ulan'], ['jetski', 'ulan'], ['boat', 'ulan'], ['kayak', 'breeze']]) { const r = run(id, pr, 120, () => ({ left: false, right: false, ease: false, steer: 0 }), { twa: 90 });
  console.log(`     ${SPECS[id].name}, ${pr}, лагом без хода 2 мин: опрокидываний ${r.log.ev.capsize || 0}, макс. крен ${(r.log.maxHeel / DEG).toFixed(0)}°`); if (pr === 'breeze') ok(!r.log.ev.capsize, 'каяк в бриз не опрокидывается'); if (id === 'kayak' && pr === 'ulan') ok(r.log.ev.capsize >= 1, 'каяк в Улан лагом без опоры опрокидывается'); }
console.log(fail ? `\nПРОВАЛЕНО: ${fail}` : '\nвсе проверки снарядов прошли'); process.exit(fail ? 1 : 0);
