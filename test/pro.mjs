// Режим Pro: шкот руками. Хорошо настроенный по колдунчикам шкот должен ехать как автомат, перебранный и недобранный -- хуже,
// а колдунчики -- показывать, в какую сторону ошибка.
import { Boat, Wind, PRESETS, DEG, KN, wrapPi } from '../src/sim.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
function run(twaDeg, pro, sheetFn) {
  const p = { ...PRESETS.breeze, gust: 0, shift: 0 }, w = new Wind(p, null), b = new Boat();
  b.reset(0, 0, wrapPi(p.dir * DEG + twaDeg * DEG)); b.vx = Math.sin(b.th) * 1.5; b.vy = Math.cos(b.th) * 1.5; b.pro = pro;
  for (let i = 0; i < 120 * 60; i++) { w.update(1 / 120); const want = wrapPi(w.dirNow + twaDeg * DEG), steer = Math.max(-1, Math.min(1, wrapPi(want - b.th) * 3 - b.r));
    b.step(1 / 120, { steer, ease: false, sheet: sheetFn ? sheetFn(b) : 0 }, w, null); }
  return { v: b.speed * KN, ttW: b.ttW, ttL: b.ttL, trim: b.trim / DEG };
}
// «по колдунчикам»: пляшет красный -- травим, полощет зелёный -- выбираем
const byTell = (b) => (b.ttL > 0.15 ? -0.5 : b.ttW > 0.15 ? 0.5 : 0);
for (const twa of [50, 90, 135]) {
  const auto = run(twa, false), tell = run(twa, true, byTell), over = run(twa, true, (b) => (b.trim > 4 * DEG ? 1 : 0)), under = run(twa, true, (b) => -1);
  console.log(`TWA ${twa}: авто ${auto.v.toFixed(2)} уз · по колдунчикам ${tell.v.toFixed(2)} · перебран ${over.v.toFixed(2)} (красный ${over.ttL.toFixed(2)}) · недобран ${under.v.toFixed(2)} (зелёный ${under.ttW.toFixed(2)})`);
  ok(tell.v > auto.v * 0.93, `TWA ${twa}: по колдунчикам не хуже автомата`);
  ok(tell.ttL < 0.3 && tell.ttW < 0.3, `TWA ${twa}: настроенный шкот -- колдунчики спокойны`);
  if (twa < 120) { ok(over.v < tell.v * 0.92 && over.ttL > 0.5, `TWA ${twa}: перебранный шкот медленнее, красный пляшет`); }
  if (twa < 120) ok(under.v < tell.v * 0.8 && under.ttW > 0.5, `TWA ${twa}: недобранный шкот медленнее, зелёный полощет`);
}
process.exit(fail ? 1 : 0);
