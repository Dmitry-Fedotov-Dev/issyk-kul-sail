// Масштаб воды (?scale=): волны той же доли длины лодки, скорость -- по дисперсии (подобие Фруда)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Waves, Boat, DEG } from '../../src/sim.js';

const make = (s) => { const w = new Waves(); w.s = s; w.setFromWind(7, 98 * DEG, 24000); return w; };
test('волны в масштабе 0.01: длина и высота в 100 раз меньше', () => {
  const a = make(1), b = make(0.01);
  a.w.forEach((w, i) => { assert.ok(Math.abs(b.w[i].k / w.k - 100) < 1e-6); assert.ok(Math.abs(b.w[i].a / w.a - 0.01) < 1e-9); });
});
test('волны в масштабе 0.01: период в 10 раз короче (дисперсия глубокой воды)', () => {
  const a = make(1), b = make(0.01); a.w.forEach((w, i) => assert.ok(Math.abs(b.w[i].om / w.om - 10) < 1e-6));
});
test('крутизна волн и сила качки (Hs) от масштаба не зависят', () => {
  const a = make(1), b = make(0.01); assert.equal(a.Hs, b.Hs); assert.ok(Math.abs(a.qf - b.qf) < 1e-9);
});
test('игрушечная лодка видит ту же крутизну волны, что и настоящая', () => {
  const t = 3.7, pose = (s) => { const w = make(s), bt = new Boat(); bt.ps = s; bt.reset(0, 0, 0.6); bt.updatePose(w, t * Math.sqrt(s), null); return bt; };
  const A = pose(1), B = pose(0.01); assert.ok(Math.abs(A.slopeF - B.slopeF) < 1e-6); assert.ok(Math.abs(A.slopeR - B.slopeR) < 1e-6);
});
