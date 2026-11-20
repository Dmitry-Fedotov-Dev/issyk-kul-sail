// Як-130: взлёт, горизонт без рук, координированный вираж, петля, сваливание, посадка/столкновение
import test from 'node:test'; import assert from 'node:assert/strict';
import { Jet, YAK } from '../../src/jet.js';
const flat = () => 10, run = (j, sec, ctl, h = flat, rwy = () => true) => { for (let i = 0; i < sec * 120; i++) j.step(1 / 120, ctl, h, rwy); };
test('разбег и отрыв: максимал, на скорости отрыва -- ручку на себя', () => {
  const j = new Jet(); j.reset(0, 0, 10, 0, 'ground'); run(j, 20, { max: true }); assert.equal(j.mode, 'ground'); assert.ok(j.V > YAK.Vr, 'разогнался ' + j.V);
  run(j, 3, { max: true, pitch: 0.6 }); assert.equal(j.mode, 'air'); assert.ok(j.Z > 15, 'набирает ' + j.Z); });
test('без рук -- держит высоту и скорость 650 км/ч', () => {
  const j = new Jet(); j.reset(0, 0, 1000, 0, 'air', 150); j.gear = false; run(j, 40, {}); assert.ok(Math.abs(j.Z - 1000) < 40, 'высота ' + j.Z); assert.ok(Math.abs(j.V - YAK.cruise) < 12, 'скорость ' + j.V); });
test('крен без ручки -- вираж без потери высоты, отпустил -- выходит в горизонт', () => {
  const j = new Jet(); j.reset(0, 0, 1000, 0, 'air', 180); j.gear = false; run(j, 0.35, { roll: 1 }); const ph = j.phi; assert.ok(ph > 0.6, 'крен ' + ph);
  const th0 = j.th; run(j, 4, {}); assert.ok(Math.abs(j.phi) < 0.1, 'вывел ' + j.phi); assert.ok(j.th - th0 > 0.02, 'повернул вправо ' + (j.th - th0)); assert.ok(Math.abs(j.Z - 1000) < 60, 'высота ' + j.Z); });
test('петля: ручку на себя до упора -- проходит вертикаль, верх вверх ногами и возвращается', () => {
  const j = new Jet(); j.reset(0, 0, 2000, 0, 'air', 230); j.gear = false; let top = false, minUw = 1; for (let i = 0; i < 120 * 20; i++) { j.step(1 / 120, { pitch: 1, max: true }, flat); minUw = Math.min(minUw, j.u[2]); if (j.u[2] < -0.8) top = true; if (top && j.f[2] > -0.05 && j.f[2] < 0.05 && j.u[2] > 0.8) break; }
  assert.ok(top, 'вверх ногами на вершине ' + minUw); assert.ok(j.Z > 1500 && j.mode === 'air', 'жив ' + j.Z); assert.ok(j.nPeak <= YAK.nMax + 1e-6); });
test('медленно и ручку на себя -- сваливание, нос опускается', () => {
  const j = new Jet(); j.reset(0, 0, 2000, 0, 'air', 60); j.gear = false; run(j, 6, { pitch: 1, brake: true }); assert.ok(j.f[2] < 0.2); });
test('в землю без шасси -- катастрофа, на полосу с шасси плавно -- посадка', () => {
  const a = new Jet(); a.reset(0, 0, 200, 0, 'air', 150); a.gear = false; run(a, 30, { pitch: -0.4 }); assert.equal(a.mode, 'crash');
  const b = new Jet(); b.reset(0, 0, 40, 0, 'air', 75); b.gear = true; b.f = [0, 0.998, -0.04 / 1]; run(b, 30, { Vset: 72 }); assert.equal(b.mode, 'ground', 'сел ' + b.mode); assert.ok(b.touch && b.touch.rwy); });
test('заход без рук: автомат выравнивания -- мягкое касание', () => {
  const j = new Jet(); j.reset(0, 0, 160, 0, 'air', 80); j.gear = true; j.f = [0, 0.9986, -0.053]; for (let i = 0; i < 120 * 60 && j.mode === 'air'; i++) j.step(1 / 120, { Vset: 74 }, () => 10, () => true);
  assert.equal(j.mode, 'ground'); assert.ok(j.touch.vz > -2, 'касание ' + j.touch.vz); });
