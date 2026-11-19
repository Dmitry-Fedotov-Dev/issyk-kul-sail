// Физика параплана (src/para.js): поляра, разворот, термик, динамика у склона, ошибки крыла, посадка, буксировка, ИИ.
// Строки «ok …» / «FAIL …» превращает в отдельные тесты test/unit/physics.test.mjs.
import { Air, Glider, aiPilot, WING, polarSink } from '../src/para.js';

let fails = 0; const ck = (name, cond, info = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' -- ' + info : ''}`); if (!cond) fails++; };
const wind = (U = 0, dirDeg = 180) => ({ U, dirNow: dirDeg * Math.PI / 180, gust: () => 1, veer: () => 0 });
const flat = (H = 300) => (X, Y) => H; // ровная суша на 300 м над озером
const run = (gl, air, sec, ctl, dt = 1 / 120) => { for (let i = 0; i < sec / dt; i++) { gl.step(dt, typeof ctl === 'function' ? ctl(gl) : ctl, air); if (gl.mode === 'landed') break; } };
const still = (h = flat()) => { const a = new Air(h, wind(0)); a.sun = 0; a.update = () => {}; return a; };

// поляра в спокойном воздухе (солнца нет -- ни термиков, ни фонового спуска)
{ const air = still(), g = new Glider(3).reset(0, 0, 1500, 0); run(g, air, 25, {}); const z0 = g.Z, x0 = g.Y; run(g, air, 20, {}); const sink = (z0 - g.Z) / 20, v = (g.Y - x0) / 20;
  ck('триммер: 37-40 км/ч', v * 3.6 > 37 && v * 3.6 < 40, (v * 3.6).toFixed(1)); ck('триммер: снижение 1.0-1.2 м/с', sink > 1.0 && sink < 1.2, sink.toFixed(2)); ck('качество 8.8-10', v / sink > 8.8 && v / sink < 10, (v / sink).toFixed(1)); }
{ const air = still(), g = new Glider(3).reset(0, 0, 1500, 0); run(g, air, 25, { tBar: 1 }); const z0 = g.Z, y0 = g.Y; run(g, air, 20, { tBar: 1 }); const sink = (z0 - g.Z) / 20, v = (g.Y - y0) / 20;
  ck('полный акселератор: 50-55 км/ч', v * 3.6 > 50 && v * 3.6 < 55, (v * 3.6).toFixed(1)); ck('акселератор: качество 6-7.5', v / sink > 6 && v / sink < 7.5, (v / sink).toFixed(1)); }
{ const air = still(), g = new Glider(3).reset(0, 0, 1500, 0); run(g, air, 25, { tL: 0.3, tR: 0.3 }); const z0 = g.Z; run(g, air, 20, { tL: 0.3, tR: 0.3 }); const sink = (z0 - g.Z) / 20;
  ck('лёгкие клеванты: минимальное снижение около 1 м/с', sink > 0.95 && sink < 1.1, sink.toFixed(2)); }
// разворот
{ const air = still(), g = new Glider(3).reset(0, 0, 1500, 0); run(g, air, 6, { tR: 0.5 }); const phi = g.phi * 180 / Math.PI; let turn = 0, th = g.th, t = 0; while (turn < 2 * Math.PI && t < 60) { run(g, air, 0.1, { tR: 0.5 }); turn += ((g.th - th + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; th = g.th; t += 0.1; }
  ck('правая клеванта 50%: крен вправо 25-40°', phi > 25 && phi < 40, phi.toFixed(0) + '°'); ck('круг за 9-25 с', t > 9 && t < 25, t.toFixed(1) + ' с'); }
// спираль: долгий глубокий разворот -- крен растёт, снижение больше 6 м/с; отпустил -- выходит
{ const air = still(), g = new Glider(3).reset(0, 0, 2500, 0); let ev = []; run(g, air, 14, { tR: 1 }); ev = g.events.map((e) => e.type); const sink = -g.vz;
  ck('глубокая клеванта: спираль', ev.includes('spiral') || ev.includes('spin'), ev.join(',')); ck('в спирали снижение > 5 м/с', sink > 5, sink.toFixed(1)); g.events.length = 0; run(g, air, 14, {}); ck('отпустил -- крыло выходит само', Math.abs(g.phi) < 0.5 && !g.spin, (g.phi * 57).toFixed(0) + '°'); }
// сваливание
{ const air = still(), g = new Glider(3).reset(0, 0, 1500, 0); run(g, air, 5, { tL: 1, tR: 1 }); ck('обе клеванты в пол дольше секунды -- сваливание', g.stall === 1); const z = g.Z; run(g, air, 1, { tL: 1, tR: 1 }); ck('в сваливании снижение 6-9 м/с', z - g.Z > 6 && z - g.Z < 9.5, (z - g.Z).toFixed(1));
  run(g, air, 4, {}); ck('отпустил -- выход из сваливания', !g.stall && g.events.some((e) => e.type === 'stallExit')); }
// подсложение открывается само, подкачка -- быстрее
{ const air = still(); const t1 = (pump) => { const g = new Glider(5).reset(0, 0, 1500, 0); run(g, air, 3, {}); g.col = 0.5; g.colSide = -1; let t = 0, k = 0;
    while (g.col > 0 && t < 20) { const c = pump ? { tL: (k++ % 60) < 30 ? 0.7 : 0, tR: 0.3 } : {}; g.step(1 / 120, c, air); t += 1 / 120; } return t; };
  const a = t1(false), b = t1(true); ck('подсложение открывается само за 2-6 с', a > 2 && a < 6, a.toFixed(1) + ' с'); ck('подкачка и встречная клеванта открывают быстрее', b < a * 0.7, b.toFixed(1) + ' с'); }
// термик: соперник находит и набирает
{ const air = new Air(flat(), wind(0), 3); air.setSky('breeze'); air.sun = 1; air.list.push({ id: 1, X: 300, Y: 0, zg: 300, w0: 3, R0: 110, age: 300, life: 2000, ph: 0, wob: 0.15, cloud: 1 });
  const g = new Glider(4).reset(0, 0, 800, Math.PI / 2), mem = {}; let z0 = 0; for (let i = 0; i < 120 * 120; i++) { air.t += 1 / 120; g.step(1 / 120, aiPilot(g, air, { X: 6000, Y: 0, R: 300 }, mem, 1 / 120, 0.9), air); if (i === 30 * 120) z0 = g.Z; }
  const climb = (g.Z - z0) / 90; ck('ИИ центрирует термик 3 м/с: набор > 1.1 м/с', climb > 1.1, climb.toFixed(2) + ' м/с'); }
// динамика у склона: ветер 8 м/с с юга на склон, поднимающийся к северу
{ const slope = (X, Y) => (Y < 0 ? 0 : Y * 0.35), air = new Air(slope, wind(8, 180)); air.sun = 0; const s = air.sample(0, -80, 120, {}); ck('ветер на склон: подъём перед склоном > 1.2 м/с', s.w > 1.2, s.w.toFixed(2));
  const s2 = air.sample(0, -80, 900, {}); ck('высоко над склоном подъём слабеет', s2.w < s.w * 0.5, s2.w.toFixed(2)); const lee = (X, Y) => (Y > 0 ? 0 : -Y * 0.35), air2 = new Air(lee, wind(8, 180)); air2.sun = 0; const s3 = air2.sample(0, 100, 60, {});
  ck('за гребнем -- спуск и болтанка', s3.w < -0.5 && s3.turb > 0.3, `${s3.w.toFixed(2)} / ${s3.turb.toFixed(2)}`); }
// посадка: подрыв у земли -- мягкое касание; без подрыва -- обычное
{ const air = still(); const land = (flare) => { const g = new Glider(3).reset(0, 0, 340, 0); run(g, air, 60, (q) => (flare && q.agl < 1.8 ? { tL: 1, tR: 1 } : {})); return g.landed; };
  const a = land(false), b = land(true); ck('без подрыва -- касание на скорости триммера', a && a.gs > 9, a && a.gs.toFixed(1)); ck('с подрывом -- мягко', b && b.q === 'soft', b && `${b.q} vz ${b.vz.toFixed(2)} gs ${b.gs.toFixed(1)}`); }
// буксировка лебёдкой: набор до 350-450 м и отцепка
{ const air = still(flat(80)), g = new Glider(3).reset(0, 0, 80, 0, 'tow'); g.startTow({ X: 0, Y: 1200, Z: 80, max: 420 }); run(g, air, 200, (q) => ({ tL: q.tow.dev > 0.1 ? 0.5 : 0, tR: q.tow.dev < -0.1 ? 0.5 : 0 }));
  const r = g.events.find((e) => e.type === 'release'); ck('лебёдка: отцепка на 250-450 м', r && r.agl > 250 && r.agl < 450 && r.why !== 'weaklink', r && `${r.agl.toFixed(0)} ${r.why} за ${g.tow.t.toFixed(0)} с`); }
// старт с ног: подъём крыла и отрыв на склоне
{ const sl = (X, Y) => 600 - Y * 0.4, air = still(sl), g = new Glider(3).reset(0, 0, 600, 0, 'launch'); g.startLaunch(); run(g, air, 15, { go: true }); ck('старт с ног: отрыв за 15 с', g.mode === 'air', g.mode); }
console.log(fails ? `\n${fails} FAIL` : '\nвсё в порядке'); process.exit(fails ? 1 : 0);
void WING; void polarSink;
