// Проверка физики без браузера: поляра скоростей, крен, опрокидывание, левентик, автомат.
import { Boat, Wind, PRESETS, DEG, KN, wrapPi, aiControl } from '../src/sim.js';

function steady(preset, twaDeg, opts = {}) {
  const p = { ...PRESETS[preset], gust: opts.gust ?? 0, shift: 0 };
  const w = new Wind(p, null), b = new Boat();
  b.reset(0, 0, wrapPi(p.dir * DEG + twaDeg * DEG)); b.vx = Math.sin(b.th) * 1.5; b.vy = Math.cos(b.th) * 1.5;
  let maxHeel = 0, cap = false;
  for (let i = 0; i < 120 * 90; i++) {
    w.update(1 / 120);
    // держим курс относительно ветра пропорциональным рулём
    const want = wrapPi(w.dirNow + twaDeg * DEG), steer = Math.max(-1, Math.min(1, wrapPi(want - b.th) * 3 - b.r));
    b.step(1 / 120, { steer, ease: opts.ease ? opts.ease(b) : false }, w, null);
    maxHeel = Math.max(maxHeel, Math.abs(b.phi)); if (b.capsized) { cap = true; break; }
  }
  return { v: b.speed * KN, heel: Math.abs(b.phi) / DEG, maxHeel: maxHeel / DEG, cap, leeway: Math.atan2(Math.abs(b.vs), Math.abs(b.u)) / DEG };
}
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

for (const pr of ['breeze', 'santash', 'ulan']) {
  console.log(`\n${pr}: TWA -> узлы / крен / макс.крен / дрейф`);
  for (const a of [0, 30, 45, 60, 90, 120, 150, 180]) {
    const r = steady(pr, a);
    console.log(`  ${String(a).padStart(3)}°  ${r.v.toFixed(1).padStart(5)} уз  ${r.heel.toFixed(0).padStart(3)}°  ${r.maxHeel.toFixed(0).padStart(3)}°  ${r.leeway.toFixed(1)}°${r.cap ? '  ОПРОКИНУЛАСЬ' : ''}`);
  }
}
const s45 = steady('santash', 45), s0 = steady('santash', 0), s90 = steady('santash', 90), b45 = steady('breeze', 45);
ok(s0.v < 1.2, `в левентике лодка стоит (${s0.v.toFixed(2)} уз)`);
ok(s45.v > 4 && s45.v < 7, `бейдевинд при 7 м/с: ${s45.v.toFixed(1)} уз`);
ok(s90.v > s45.v, 'галфвинд быстрее бейдевинда');
ok(s45.heel > 12 && s45.heel < 32, `крен в бейдевинд при 7 м/с умеренный (${s45.heel.toFixed(0)}°)`);
ok(b45.heel < 14 && !b45.cap, `в бриз спокойно (${b45.heel.toFixed(0)}°)`);
{ const r = steady('santash', 60, { gust: 0.27 }); ok(!r.cap, `Санташ с порывами: без травления выживаем (макс. крен ${r.maxHeel.toFixed(0)}°)`); }
const u60 = steady('ulan', 60, { gust: 0.33 }), u60e = steady('ulan', 60, { gust: 0.33, ease: (b) => Math.abs(b.phi) > 27 * DEG });
ok(u60.cap, `Улан без травления: опрокидывание или сильный крен (${u60.maxHeel.toFixed(0)}°, cap=${u60.cap})`);
ok(!u60e.cap && u60e.v > 4, `Улан с травлением шкота: идём (${u60e.v.toFixed(1)} уз, макс.крен ${u60e.maxHeel.toFixed(0)}°)`);
const e = steady('santash', 60, { ease: () => true });
ok(e.v < s45.v * 0.6 && e.heel < 8, `вытравленный шкот обезветривает парус (${e.v.toFixed(1)} уз, крен ${e.heel.toFixed(0)}°)`);

// автомат должен дойти до знака на ветру (лавировка) и обратно
{
  const p = { ...PRESETS.santash }, w = new Wind(p, null), b = new Boat(), st = {};
  b.reset(0, 0, wrapPi(p.dir * DEG + 50 * DEG));
  const tx = -Math.sin(p.dir * DEG) * -300, ty = -Math.cos(p.dir * DEG) * -300; // 300 м на ветер
  let t = 0, tacks = 0, reached = false;
  for (; t < 600 && !reached; t += 1 / 60) {
    w.update(1 / 60); const c = aiControl(b, tx, ty, st, 1 / 60); b.step(1 / 120, c, w, null); b.step(1 / 120, c, w, null);
    for (const ev of b.events) if (ev.type === 'tack') tacks++; b.events.length = 0;
    if (Math.hypot(tx - b.X, ty - b.Y) < 15) reached = true;
  }
  ok(reached && tacks >= 1 && t < 400, `автомат вылавировал 300 м на ветер за ${t.toFixed(0)} с, поворотов ${tacks}`);
}
// поворот фордевинд даёт событие
{
  const p = { ...PRESETS.santash, gust: 0, shift: 0 }, w = new Wind(p, null), b = new Boat();
  b.reset(0, 0, wrapPi(p.dir * DEG + 160 * DEG)); let g = 0;
  for (let i = 0; i < 120 * 30; i++) { w.update(1 / 120); b.step(1 / 120, { steer: i > 120 * 12 ? (i < 120 * 16 ? 0.8 : 0) : 0, ease: false }, w, null); for (const ev of b.events) if (ev.type === 'gybe') g++; b.events.length = 0; }
  ok(g >= 1, `поворот фордевинд зафиксирован (${g})`);
}
// полная дистанция регаты на волне: автомат обязан финишировать во всех трёх ветрах
import { Waves } from '../src/sim.js';
for (const pr of ['breeze', 'santash', 'ulan']) {
  const p = PRESETS[pr], w = new Wind(p, null), wv = new Waves(); wv.setFromWind(p.speed, p.dir * DEG, p.fetch);
  const D = p.dir * DEG, up = [Math.sin(D), Math.cos(D)], pts = [[231, 10], [-81, -10], [14, 0]].map(([a, l]) => [up[0] * a + up[1] * l, up[1] * a - up[0] * l]);
  const b = new Boat(), st = {}; b.skill = 0.9; b.reset(-up[0] * 50, -up[1] * 50, wrapPi(D + 47 * DEG));
  let t = 0, leg = 0, caps = 0, maxHeel = 0;
  for (; t < 1500 && leg < 3; t += 1 / 60) { w.update(1 / 60); b.updatePose(wv, t, null);
    const c = aiControl(b, pts[leg][0], pts[leg][1], st, 1 / 60); b.step(1 / 120, c, w, null); b.step(1 / 120, c, w, null);
    for (const ev of b.events) if (ev.type === 'capsize') caps++; b.events.length = 0; maxHeel = Math.max(maxHeel, Math.abs(b.phi));
    const a = b.X * up[0] + b.Y * up[1]; if ((leg === 0 && a > 223) || (leg === 1 && a < -73) || (leg === 2 && a > 0)) leg++; }
  ok(leg === 3 && t < 900, `${pr}: автомат прошёл дистанцию за ${(t / 60).toFixed(1)} мин, опрокидываний ${caps}, макс. крен ${(maxHeel / DEG).toFixed(0)}°, Hs=${wv.Hs.toFixed(2)} м, λ=${wv.lp.toFixed(0)} м`);
}
console.log(fail ? `\nПРОВАЛЕНО: ${fail}` : '\nвсе проверки физики прошли'); process.exit(fail ? 1 : 0);
