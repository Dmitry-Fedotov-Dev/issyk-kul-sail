// Поисковая операция: дела по всем сценариям генерируются на настоящем рельефе Иныльчека, связь задаёт сложность,
// улики ведут к людям, выживание и очки ведут себя разумно
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import zlib from 'node:zlib';
import { KHAN } from '../../src/khandata.js';
import { SCEN, makeCase, codeOf, seedOf, aliveAt, pod, scoreOf, walkerPos, pickScenario, rng } from '../../src/sar.js';
// рельеф района из src/khan.png (без фильтров строк, как пишет tools/zone-dem.mjs)
const buf = fs.readFileSync(new URL('../../src/khan.png', import.meta.url)); let p = 8, idat = [];
while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
const raw = zlib.inflateSync(Buffer.concat(idat)), { W, H, X0, Y1, STEP } = KHAN, hs = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = j * (W * 3 + 1) + 1 + i * 3; hs[j * W + i] = (raw[o] * 256 + raw[o + 1]) / 4 - 64; }
const h = (X, Y) => { const fi = Math.max(0, Math.min(W - 1.001, (X - X0) / STEP)), fj = Math.max(0, Math.min(H - 1.001, (Y1 - Y) / STEP)), i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j, k = j * W + i;
  return (hs[k] * (1 - a) + hs[k + 1] * a) * (1 - b) + (hs[k + W] * (1 - a) + hs[k + W + 1] * a) * b; };

test('код операции: туда и обратно', () => { for (const s of [0, 1, 12345, 2 ** 25 - 1]) assert.equal(seedOf(codeOf(s)), s); assert.equal(seedOf('xx'), null); });
test('каждый сценарий на каждом своём маршруте: люди и улики на рельефе района, улики рядом с маршрутом и людьми', () => {
  for (const sc of SCEN) for (let k = 0; k < 12; k++) { const c = makeCase(codeOf(1000 + k * 77 + sc.id.length), h, { scen: sc.id });
    assert.ok(c.victims.length >= 1, sc.id); for (const v of c.victims) { assert.ok(v.X > X0 && v.X < X0 + W * STEP && v.Y < Y1 && v.Y > Y1 - H * STEP, `${sc.id}: человек вне района`); assert.ok(h(v.X, v.Y) > 0, `${sc.id}: в воде`); }
    const key = c.clues.filter((q) => q.key); assert.ok(key.length >= 2, sc.id);
    // хотя бы одна ключевая улика в 1.5 км от кого-то из людей -- детективу есть за что зацепиться
    assert.ok(key.some((q) => c.victims.some((v) => Math.hypot(v.X - q.X, v.Y - q.Y) < 1500)), `${sc.id}: улики далеко от людей`);
    // люди не дальше 6 км от маршрута (поиск реален за вылет)
    for (const v of c.victims) assert.ok(c.pts.some((p) => Math.hypot(p.X - v.X, p.Y - v.Y) < 6500), `${sc.id}: человек за 6 км от маршрута`); } });
test('одинаковый код -- одинаковое дело (совместная операция)', () => { const a = makeCase('K7QZA', h), b = makeCase('K7QZA', h); assert.deepEqual(a.victims.map((v) => [v.X, v.Y, v.left]), b.victims.map((v) => [v.X, v.Y, v.left])); assert.equal(a.clues.length, b.clues.length); });
test('разнообразие: 300 дел -- все 10 ситуаций, все 3 вида связи, чередование без повторов подряд', () => {
  const seen = {}, comm = {}; for (let s = 0; s < 300; s++) { const c = makeCase(codeOf(s * 9973), h); seen[c.scen] = (seen[c.scen] || 0) + 1; comm[c.comm.id] = 1; }
  assert.equal(Object.keys(seen).length, 10, JSON.stringify(seen)); assert.equal(Object.keys(comm).length, 3);
  const r = rng(5), recent = []; for (let i = 0; i < 40; i++) { const s = pickScenario(r, i % 3, recent); assert.ok(!recent.slice(-4).includes(s.id)); recent.push(s.id); } });
test('живые и погибшие: исходы разные; найденный живым живёт дольше; набор с дрона даёт часы', () => {
  let alive = 0, dead = 0; for (let s = 0; s < 200; s++) for (const v of makeCase(codeOf(s * 31 + 7), h).victims) v.alive0 ? alive++ : dead++;
  assert.ok(alive > dead && dead > 10, `живых ${alive}, погибших ${dead}`);
  const v = { alive0: true, left: 300 }; assert.ok(aliveAt(v, 200) && !aliveAt(v, 320)); v.foundT = 200; assert.ok(aliveAt(v, 400)); v.kit = 1; assert.ok(aliveAt({ ...v, foundT: undefined }, 600)); });
test('обнаружение: близко и низко -- видно, далеко -- нет; засыпанного -- только лавинным датчиком низко', () => {
  const person = { name: 'А' }; assert.ok(pod(person, 60, 50, false) > 0.9); assert.equal(pod(person, 400, 50, false), 0); assert.ok(pod(person, 100, 50, true) > pod({ k: 'glove' }, 100, 50, true));
  assert.equal(pod({ name: 'Б', buried: 1 }, 30, 120, false), 0); assert.ok(pod({ name: 'Б', buried: 1 }, 30, 40, false) > 0.8); });
test('треккер уходит днём по ложбине и стоит ночью', () => { const path = Array.from({ length: 50 }, (_, i) => [i * 50, 0]), v = { walker: 1, path };
  assert.ok(walkerPos(v, 120, 10)[0] > walkerPos(v, 60, 10)[0]); assert.equal(walkerPos(v, 120, 21)[0], walkerPos(v, 60, 21)[0]); });
test('очки: живой -- имба, быстрее -- лучше, потери спасателей -- больно, без связи -- множитель', () => {
  const base = { saved: 1, alive: 1, aliveFound: 0, dead: 0, clues: 5, minutes: 200, rescuerLost: 0, droneLost: 0, comm: { k: 1 } };
  const a = scoreOf(base), slow = scoreOf({ ...base, minutes: 600 }), lost = scoreOf({ ...base, rescuerLost: 1 }), deadOnly = scoreOf({ ...base, saved: 0, dead: 1 }), hard = scoreOf({ ...base, comm: { k: 2.2 } });
  assert.ok(a.total > slow.total && a.total > lost.total && a.total > deadOnly.total * 2 && hard.total > a.total * 2); assert.equal(a.stars, 3); assert.equal(lost.stars, 2); });
test('зацепка первой минуты: у каждого дела есть известная метка группы и текст свидетеля', () => {
  for (let s = 0; s < 120; s++) { const c = makeCase(codeOf(s * 131 + 5), h); assert.ok(c.hook && c.clues[c.hook.id], c.code + ' ' + c.scen); assert.ok(/видели группу/.test(c.hook.txt)); }
});
