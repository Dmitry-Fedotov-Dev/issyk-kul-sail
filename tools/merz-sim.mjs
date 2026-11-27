// Расчёт прорыва озера Мерцбахера -> src/merzsim.js (записанный сценарий, игра его проигрывает).
//
// Данные (Ng & Liu 2009, J. Glaciology 55(192); Wikipedia «Lake Merzbacher»; Walder & Costa 1996, USGS):
//   полное озеро ~0.2 км³ (сброс ~0.16 км³), глубина 80-100 м, уровень ~3300 м; плотина -- нижние 15 км ледника
//   Южный Иныльчек; вода уходит подо льдом (туннель), сброс 4-18 сут, пик ~1000 м³/с (по Walder-Costa для туннельных
//   прорывов Qp = 46·V^0.66 = ~1300 м³/с при V = 160 млн м³); паводок обрывается резко (туннель пережимает лёд).
//
// Модель -- как у гляциологов:
//  1. Расход -- туннель Ная (Nye 1976; Clarke 2003): сечение S растёт от таяния теплом трения потока и сжимается
//     ползучестью льда (закон Глена n = 3): dS/dt = Q·Ψ/(ρi·Lf) − 2·A·S·(N/n)^n; расход по Маннингу Q = S·R^(2/3)·√(Ψ/ρw g)/nM;
//     Ψ -- градиент напора (уровень озера над выходом у языка ледника / длина туннеля), N -- эффективное давление
//     (вес льда над туннелем − давление воды). Озеро: dV/dt = Qin − Q, уровень -- по кривой объёмов чаши.
//  2. Озеро -- уравнения мелкой воды (Сен-Венан), метод конечных объёмов (схема Русанова) на сетке рельефа 100 м,
//     с осушением; сток -- в устье туннеля у плотины. На каждый ключевой кадр -- квазиустановившееся течение.
//  3. Обвалы -- по разгрузке: обнажившийся крутой берег (уклон > 0.45, высота над водой > 12 м) теряет подпор воды и
//     обрушивается; ледяной обрыв плотины откалывается блоками чаще, чем ниже упала вода (потеря плавучей опоры).
//
// Время сжато: паводок (сутки) -> час прорыва в игре. Течения масштабируются тем же сжатием, с потолком 6 м/с у устья.
// Запуск: node tools/merz-sim.mjs
import fs from 'node:fs'; import zlib from 'node:zlib';
import { KHAN, KHAN_POI } from '../src/khandata.js';
import { KLAKE } from '../src/khanosm.js';
import { lakeBowl } from '../src/lakebowl.js';

const { W, H, X0, Y1, STEP } = KHAN;
// карта высот khan.png: (R*256+G)/4-64 м над Иссык-Кулем, B -- маска (255 ледник, 128 озеро); PNG без фильтров
function readPNG(buf) { let p = 8, w = 0, h = 0; const idat = []; while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = (raw.length / h - 1) / w, out = Buffer.alloc(w * h * bpp), st = w * bpp; for (let y = 0; y < h; y++) raw.copy(out, y * st, y * (st + 1) + 1, (y + 1) * (st + 1)); return { out, bpp }; }
const { out: px, bpp } = readPNG(fs.readFileSync(new URL('../src/khan.png', import.meta.url)));
const hs = new Float32Array(W * H), osm = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { hs[i] = (px[i * bpp] * 256 + px[i * bpp + 1]) / 4 - 64; osm[i] = px[i * bpp + 2]; }
const lc = KLAKE.reduce((a, p) => [a[0] + p[0] / KLAKE.length, a[1] + p[1] / KLAKE.length], [0, 0]), m0 = KLAKE.length ? lc : KHAN_POI.merz;
const B = lakeBowl({ hs, W, H, X0, Y1, STEP, osm }, m0[0], m0[1], true), top = B.top, cells = B.cells, q = B.q, A1 = STEP * STEP;
// глубочайшая клетка и устье туннеля (край чаши, ближайший к телу ледника -- самая низкая клетка у льда)
let deep = q[0]; for (const k of q) if (hs[k] < hs[deep]) deep = k;
let out = deep; { let best = 1e9; for (const k of q) { const i = k % W, j = (k / W) | 0; let ice = false, edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (j + b) * W + i + a; if (!cells[kk]) edge = true; if (osm[kk] === 255) ice = true; } const sc = hs[k] - (ice ? 400 : 0); if (edge && sc < best) { best = sc; out = k; } } }
const bed = hs[deep];
// кривая объёмов: V(z) -- вода в чаше при уровне z
const levels = [], vols = []; for (let z = bed; z <= top + 0.01; z += 0.5) { let v = 0; for (const k of q) if (z > hs[k]) v += (z - hs[k]) * A1; levels.push(z); vols.push(v); }
const Vmax = vols[vols.length - 1], zOfV = (v) => { if (v <= 0) return bed; let i = 1; while (i < vols.length && vols[i] < v) i++; if (i >= vols.length) return top; const t = (v - vols[i - 1]) / (vols[i] - vols[i - 1]); return levels[i - 1] + 0.5 * t; };
console.log(`чаша: ${q.length} клеток (${(q.length * A1 / 1e6).toFixed(2)} км²), глубина ${(top - bed).toFixed(0)} м, объём ${(Vmax / 1e9).toFixed(3)} км³`);

// ---- 1. туннель Ная-Кларка ----
const g = 9.81, rw = 1000, ri = 917, Lf = 3.34e5, Aglen = 2.4e-24, nG = 3, Lt = 20000, zExit = -330, Hice = 140, Qin = 25;
// калибровка объёма: модельная чаша по рельефу 100 м меньше настоящего озера -- расход считаем для настоящих 0.2 км³,
// а уровень в чаше -- по доле слитого объёма (форма спада реальная, глубина -- наша)
const Vreal = 2.0e8;
function tunnel(S0, nM) { let S = S0, V = Vreal, t = 0; const rec = []; let Qpk = 0;
  for (; t < 25 * 86400; t += 30) { const frac = V / Vreal, hLake = 88 * Math.pow(Math.max(0, frac), 0.6), psi = rw * g * (hLake + 330) / Lt;
    const R = Math.sqrt(S / (2 * Math.PI)), Q = Math.min(S * Math.pow(R, 2 / 3) * Math.sqrt(psi / (rw * g)) / nM, V / 30 + Qin), N = Math.max(0, ri * g * Hice - rw * g * hLake); // воды в озере нет -- сток не больше притока
    S += (Q * psi / (ri * Lf) - 2 * Aglen * S * Math.pow(N / nG, nG)) * 30; S = Math.max(S, 0.05); V += (Qin - Q) * 30; if (V < 0) V = 0;
    if (t % 1800 === 0) rec.push([t, Q, V]); Qpk = Math.max(Qpk, Q); if (V <= 0.02 * Vreal && Q < 60) break; }
  return { rec, Qpk, T: t }; }
let best = null; for (const S0 of [0.05, 0.1, 0.2, 0.5, 1, 2]) for (const nM of [0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5]) { const r = tunnel(S0, nM); const t80 = (r.rec.find((x) => x[1] > 80) || [0])[0], dur = (r.T - t80) / 86400; const score = Math.abs(r.Qpk - 1150) / 1150 + Math.abs(dur - 5) / 5; if (!best || score < best.score) best = { ...r, S0, nM, dur, score }; } // калибровка: пик ~1150 м³/с, паводок ~5 сут
const hyd = best.rec, Tend = best.T; console.log(`туннель: S0 ${best.S0} м², Маннинг ${best.nM}, пик ${best.Qpk.toFixed(0)} м³/с, паводок ${best.dur.toFixed(1)} сут`);
// старт паводка -- когда расход заметно превысил приток (раньше -- «озеро ещё полное»)
const t0 = hyd.find((r) => r[1] > 80)[0], DUR = 3600 * 0.92; // сжатие: паводок -> 55 минут
const C = (Tend - t0) / DUR;

// ---- 2. мелкая вода, конечные объёмы ----
let i0 = W, i1 = 0, j0 = H, j1 = 0; for (const k of q) { const i = k % W, j = (k / W) | 0; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
i0 -= 1; j0 -= 1; i1 += 1; j1 += 1; const nx = i1 - i0 + 1, ny = j1 - j0 + 1, N2 = nx * ny, zb = new Float32Array(N2), inl = new Uint8Array(N2);
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = (j + j0) * W + i + i0; zb[j * nx + i] = hs[k]; inl[j * nx + i] = cells[k]; }
const oi = (out % W) - i0, oj = ((out / W) | 0) - j0, ok = oj * nx + oi;
function swe(level, Qout, prev) { const h = new Float32Array(N2), hu = new Float32Array(N2), hv = new Float32Array(N2);
  for (let k = 0; k < N2; k++) { h[k] = inl[k] ? Math.max(0, level - zb[k]) : 0; if (prev) { hu[k] = prev.hu[k]; hv[k] = prev.hv[k]; } }
  const dx = STEP, eps = 0.05; let tsim = 0;
  for (let it = 0; it < 500; it++) { let cmax = 1; for (let k = 0; k < N2; k++) if (h[k] > eps) { const u = hu[k] / h[k], v = hv[k] / h[k]; cmax = Math.max(cmax, Math.hypot(u, v) + Math.sqrt(g * h[k])); }
    const dt = 0.4 * dx / cmax, nh = h.slice(), nhu = hu.slice(), nhv = hv.slice();
    const flux = (a, b, dir) => { // поток Русанова через грань a|b (dir 0 -- x, 1 -- y), с гидростатической реконструкцией (сухие грани -- стенка)
      const ha = h[a], hb = h[b]; if (ha <= eps && hb <= eps) return; const za = zb[a], zbb = zb[b], zf = Math.max(za, zbb), hA = Math.max(0, ha + za - zf), hB = Math.max(0, hb + zbb - zf);
      const ua = ha > eps ? hu[a] / ha : 0, va = ha > eps ? hv[a] / ha : 0, ub = hb > eps ? hu[b] / hb : 0, vb = hb > eps ? hv[b] / hb : 0;
      const una = dir ? va : ua, unb = dir ? vb : ub, s = Math.max(Math.abs(una) + Math.sqrt(g * hA), Math.abs(unb) + Math.sqrt(g * hB));
      const F0 = 0.5 * (hA * una + hB * unb) - 0.5 * s * (hB - hA), Fu = 0.5 * (hA * una * ua + hB * unb * ub + (dir ? 0 : 0.5 * g * (hA * hA + hB * hB))) - 0.5 * s * (hB * ub - hA * ua), Fv = 0.5 * (hA * una * va + hB * unb * vb + (dir ? 0.5 * g * (hA * hA + hB * hB) : 0)) - 0.5 * s * (hB * vb - hA * va);
      const k2 = dt / dx; nh[a] -= F0 * k2; nh[b] += F0 * k2; nhu[a] -= Fu * k2; nhu[b] += Fu * k2; nhv[a] -= Fv * k2; nhv[b] += Fv * k2;
      // источник от уклона дна (гидростатика на гранях): держит покой на неровном дне
      if (dir) { nhv[a] += 0.5 * g * (hA * hA - ha * ha) * k2; nhv[b] -= 0.5 * g * (hB * hB - hb * hb) * k2; } else { nhu[a] += 0.5 * g * (hA * hA - ha * ha) * k2; nhu[b] -= 0.5 * g * (hB * hB - hb * hb) * k2; } };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx - 1; i++) flux(j * nx + i, j * nx + i + 1, 0);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx; i++) flux(j * nx + i, (j + 1) * nx + i, 1);
    // сток в туннель: объём Q·dt уходит из устья; трение дна (Маннинг 0.03)
    nh[ok] = Math.max(0, nh[ok] - Qout * dt / (dx * dx));
    for (let k = 0; k < N2; k++) { if (!inl[k] || nh[k] <= eps) { nh[k] = Math.max(0, nh[k]); nhu[k] = nhv[k] = 0; continue; } const u = nhu[k] / nh[k], v = nhv[k] / nh[k], cf = g * 0.03 * 0.03 / Math.pow(nh[k], 1 / 3), f = 1 / (1 + dt * cf * Math.hypot(u, v) / nh[k]); nhu[k] *= f; nhv[k] *= f; }
    h.set(nh); hu.set(nhu); hv.set(nhv); tsim += dt; if (tsim > 1800) break; }
  return { h, hu, hv }; }

// ключевые кадры: 24 за паводок
const NK = 24, frames = [], tKey = [], lev = [], Qk = []; let prev = null;
for (let f = 0; f < NK; f++) { const tg = DUR * f / (NK - 1), tr = t0 + tg * C; let r = hyd[0]; for (const x of hyd) if (x[0] <= tr) r = x;
  const frac = r[2] / Vreal, z = zOfV(frac * Vmax); tKey.push(+tg.toFixed(1)); lev.push(+(z - top).toFixed(2)); Qk.push(Math.round(r[1]));
  // течения при уровне z и стоке, масштабированном к объёму модельной чаши
  const sw = swe(z, r[1] * Vmax / Vreal, prev); prev = sw; const uv = new Int8Array(N2 * 2);
  for (let k = 0; k < N2; k++) { const hh = sw.h[k]; if (hh < 0.3) continue; const s = Math.min(6, Math.hypot(sw.hu[k], sw.hv[k]) / hh * C) / Math.max(1e-6, Math.hypot(sw.hu[k], sw.hv[k]) / hh), u = sw.hu[k] / hh * s, v = sw.hv[k] / hh * s;
    uv[k * 2] = Math.max(-127, Math.min(127, Math.round(u * 20))); uv[k * 2 + 1] = Math.max(-127, Math.min(127, Math.round(v * 20))); } // 0.05 м/с
  frames.push(Buffer.from(uv.buffer).toString('base64')); process.stdout.write(`кадр ${f + 1}/${NK}: уровень ${(z - top).toFixed(1)} м, Q ${r[1].toFixed(0)} м³/с\r`); }
console.log('');

// ---- 3. обвалы ----
let seed = 1234567; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const levelAt = (tg) => { let i = 1; while (i < tKey.length && tKey[i] < tg) i++; if (i >= tKey.length) return top + lev[lev.length - 1]; const a = (tg - tKey[i - 1]) / (tKey[i] - tKey[i - 1]); return top + lev[i - 1] + (lev[i] - lev[i - 1]) * a; };
const events = [];
// берега: клетки края чаши и прибрежья; уклон по соседям; обвал -- когда вода ушла ниже на 12+ м
const slope = (k) => { const i = k % W, j = (k / W) | 0; return Math.hypot(hs[k + 1] - hs[k - 1], hs[k + W] - hs[k - W]) / (2 * STEP); };
const shore = []; for (const k of q) { const i = k % W, j = (k / W) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const kk = (j + b) * W + i + a; if (!cells[kk] && osm[kk] !== 255 && slope(kk) > 0.4 && hs[kk] > top - 20) { shore.push(kk); break; } } }
for (const k of shore) { if (rnd() > 0.42) continue; const zt = hs[k] - 12 - rnd() * 30; let tg = null; for (let s = 0; s <= DUR; s += 10) if (levelAt(s) < zt) { tg = s; break; } if (tg === null) continue;
  const i = k % W, j = (k / W) | 0, gx = hs[k + 1] - hs[k - 1], gy = hs[k - W] - hs[k + W], L = Math.hypot(gx, gy) || 1;
  events.push({ t: Math.round(tg + rnd() * 60), k: 'bank', X: Math.round(X0 + i * STEP + (rnd() - 0.5) * 60), Y: Math.round(Y1 - j * STEP + (rnd() - 0.5) * 60), dx: +(-gx / L).toFixed(2), dy: +(-gy / L).toFixed(2), s: Math.round(8 + rnd() * 22) }); }
// ледяной обрыв плотины: клетки льда у чаши; откол -- чаще с глубиной спада (опора уходит), блоки 10-45 м
const front = []; for (const k of q) { const i = k % W, j = (k / W) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (j + b) * W + i + a; if (osm[kk] === 255 && !cells[kk]) { front.push([kk, a, b]); break; } } }
for (let n = 0; n < 34 && front.length; n++) { const u = Math.pow(rnd(), 0.7), tg = u * DUR, [k, a, b] = front[Math.floor(rnd() * front.length)], i = k % W, j = (k / W) | 0;
  events.push({ t: Math.round(tg), k: 'calve', X: Math.round(X0 + i * STEP), Y: Math.round(Y1 - j * STEP), dx: -a, dy: b, s: Math.round(10 + rnd() * rnd() * 35) }); }
events.sort((a, b) => a.t - b.t);
console.log(`обвалов берега: ${events.filter((e) => e.k === 'bank').length}, отколов плотины: ${events.filter((e) => e.k === 'calve').length}`);

const outS = `// Записанный расчёт прорыва озера Мерцбахера (tools/merz-sim.mjs) -- не править руками.
// Модель: туннель Ная-Кларка (расход), уравнения мелкой воды конечными объёмами (течения в чаше), обвалы по разгрузке.
// Пик ${best.Qpk.toFixed(0)} м³/с, паводок ${best.dur.toFixed(1)} сут -> ${Math.round(DUR / 60)} мин; уровни -- от полного (м); течения -- 0.05 м/с, Int8, сетка 100 м.
export const MERZSIM = ${JSON.stringify({ dur: DUR, top: +top.toFixed(2), grid: { i0, j0, nx, ny }, out: { X: X0 + (out % W) * STEP, Y: Y1 - ((out / W) | 0) * STEP }, Qpk: Math.round(best.Qpk), t: tKey, level: lev, Q: Qk, events })};
export const MERZFLOW = ${JSON.stringify(frames)};
`;
fs.writeFileSync(new URL('../src/merzsim.js', import.meta.url), outS); console.log(`src/merzsim.js: ${(outS.length / 1024).toFixed(0)} КБ`);
