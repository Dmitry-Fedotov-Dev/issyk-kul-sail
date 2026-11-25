// Ми-8: потолок висения по плотности, висение с автоматом высоты, влияние земли, разгон, вихревое кольцо, посадка
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { Heli, MI8, hoverCeiling, sigma } from '../../src/heli.js';
const flat = (H) => () => H;
const run = (hl, sec, ctl, h, wind) => { for (let i = 0; i < sec * 120; i++) { hl.step(1 / 120, typeof ctl === 'function' ? ctl(hl) : ctl, h, wind); if (hl.crash) break; } };

test('потолок висения: 11.1 т -- около 4000 м, 13 т -- ниже 3000 м', () => {
  const c1 = hoverCeiling(11100), c2 = hoverCeiling(13000);
  assert.ok(c1 > 3700 && c1 < 4300, String(c1)); assert.ok(c2 < 3000 && c2 > 1800, String(c2)); assert.ok(sigma(4000) > 0.64 && sigma(4000) < 0.7);
});
test('висение: отпустил шаг -- держит высоту', () => {
  const hl = new Heli().reset(0, 0, 400, 0, false); hl.load = 0; run(hl, 25, {}, flat(0));
  assert.ok(Math.abs(hl.Z - 400) < 3, String(hl.Z)); assert.ok(hl.speed < 1, String(hl.speed));
});
test('высоко и тяжело: вне влияния земли не висит, у земли -- висит', () => {
  const g0 = 4700 - 1607; // ледник на 4700 м
  const hi = new Heli().reset(0, 0, g0 + 80, 0, false); hi.load = 2400; run(hi, 15, {}, flat(g0));
  assert.ok(hi.Z < g0 + 75, 'теряет высоту: ' + (hi.Z - g0).toFixed(1));
  const lo = new Heli().reset(0, 0, g0 + 4, 0, false); lo.load = 2400; let minA = 99; run(lo, 10, (q) => { minA = Math.min(minA, q.agl); return {}; }, flat(g0));
  assert.ok(lo.ige > 0.08 && !lo.crash, 'подушка держит: ige ' + lo.ige.toFixed(2));
});
test('ручка вперёд: разгон до 200+ км/ч', () => {
  const hl = new Heli().reset(0, 0, 500, 0, false); run(hl, 45, { fwd: 1 }, flat(0));
  assert.ok(hl.speed * 3.6 > 200, String(hl.speed * 3.6)); assert.ok(hl.Y > 1500, 'летит на север');
});
test('вихревое кольцо: быстрое снижение на месте -- провал тяги и тряска', () => {
  const hl = new Heli().reset(0, 0, 900, 0, false); hl.load = 2500; run(hl, 8, { up: -1 }, flat(0));
  assert.ok(hl.vrs > 0.3, 'vrs ' + hl.vrs.toFixed(2));
});
test('посадка: плавно вниз -- на земле, без аварии', () => {
  const hl = new Heli().reset(0, 0, 30, 0, false); run(hl, 30, (q) => ({ up: q.agl > 8 ? -0.5 : -1 }), flat(0));
  assert.ok(hl.ground && !hl.crash, JSON.stringify(hl.touch));
});
test('взлёт с земли: шаг вверх -- отрыв', () => {
  const hl = new Heli().reset(0, 0, 0, 0, true); run(hl, 6, { up: 1 }, flat(0));
  assert.ok(!hl.ground && hl.Z > 10, String(hl.Z));
});
test('аркада: отпустил ручку на скорости -- катится по инерции, а не встаёт', () => {
  const hl = new Heli().reset(0, 0, 500, 0, false); run(hl, 20, { fwd: 1 }, flat(0)); const v0 = hl.speed; run(hl, 4, {}, flat(0));
  assert.ok(hl.speed > v0 * 0.6, `${v0.toFixed(0)} -> ${hl.speed.toFixed(0)}`); run(hl, 6, { fwd: -1 }, flat(0)); assert.ok(hl.speed < v0 * 0.45, 'на себя -- тормоз: ' + hl.speed.toFixed(0));
});
test('удар о склон: отскок и повреждение, не мгновенная авария', () => {
  const wall = (x, y) => (y > 300 ? 400 : 0); const hl = new Heli().reset(0, 0, 100, 0, false); run(hl, 30, (q) => ({ fwd: q.Y < 150 ? 0.4 : 0 }), wall);
  assert.ok(hl.hp < 100 && !hl.crash, 'hp ' + hl.hp + ' crash ' + JSON.stringify(hl.crash)); assert.ok(hl.Y < 300, 'отбросило: ' + hl.Y.toFixed(0));
});
test('порыв сбоку сносит висящую машину', () => {
  const hl = new Heli().reset(0, 0, 300, 0, false); run(hl, 3, {}, flat(0), () => ({ x: 15, y: 0, z: 0, gx: 15, gy: 0 }));
  assert.ok(hl.vx > 2, 'vx ' + hl.vx.toFixed(1));
});
test('висение на ветру: отпустил ручку -- держит место (снос < 15 м за 40 с)', () => {
  const hl = new Heli().reset(0, 0, 300, 0, false); run(hl, 40, {}, flat(0), () => ({ x: 8, y: -5, z: 0 }));
  assert.ok(Math.hypot(hl.X, hl.Y) < 15, `снос ${Math.hypot(hl.X, hl.Y).toFixed(1)} м`);
});
