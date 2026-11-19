// Параплан: крыло, пилот и воздух над Чолпон-Атой. Модуль без three.js: физику проверяют в node (test/para.mjs).
// Координаты как у яхты: X -- восток, Y -- север, Z -- высота над уровнем озера (1601 м над морем), м.
//
// Крыло -- точка с маятником. Скорость по воздуху задают клеванты и акселератор (поляра крыла класса EN-B: триммер
// 38 км/ч, минимальное снижение 1 м/с на 32 км/ч, качество около 9.5, с полным акселератором 53 км/ч и качество 6.8).
// Крен -- маятник под крылом: асимметрия клевант даёт целевой крен, разворот -- координированный (g * tg крена / V).
// Вертикаль -- снижение по поляре, деленное на cos(крена)^1.5, плюс движение самого воздуха и обмен скорости на высоту
// (притормозил -- скорость уходит в высоту; отпустил -- крыло «клюёт» и разгоняется). Ошибки -- как в жизни, но прощающие:
// подсложения в болтанке (их меньше при «активном пилотировании» -- лёгком натяжении клевант -- и больше на акселераторе),
// сваливание на глубоких клевантах, штопор при перетяге одной клеванты на малой скорости, спираль при долгом глубоком
// развороте. Всё выходит само, если отпустить; правильные действия выводят быстрее.
//
// Воздух: ветер растёт с высотой; у склона, на который дует ветер, -- динамический подъём, за гребнем -- спуск и ротор;
// солнечные склоны и посёлки рождают термики. Термик живёт минуты: растёт, достигает базы облаков (там над ним вырастает
// кучевое облако -- главный знак для пилота), слабеет и умирает; облако ещё висит и тает. Ствол термика наклонён по ветру,
// ядро не круглое и гуляет -- его надо «центрировать». Вокруг термика -- кольцо спуска, над озером -- ровный слабый спуск.
import { clamp, smooth, wrapPi, noise2 } from './sim.js';

export const GR = 9.81;
export const WING = { trim: 10.6, bar: 4.2, brake: 5.2, vms: 9.0, smin: 1.0, k: 0.035, stallV: 5.8, hang: 6.9 };
// снижение по поляре; bS -- симметричное торможение 0..1 (глубокие клеванты добавляют сопротивление)
export function polarSink(V, bS = 0) { let s = WING.smin + WING.k * (V - WING.vms) ** 2; if (V < 7) s += (7 - V) ** 2 * 0.75; return s + 0.35 * bS * bS; }
export function targetSpeed(bS, bar) { return WING.trim + WING.bar * bar - WING.brake * bS * (1 - 0.3 * bS); }

// генератор случайных чисел с зерном: одинаковый воздух у всех соперников и в тестах
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// погода для полётов: база облаков (над озером), сила термиков, болтанка
export const SKY = {
  breeze: { base: 1750, wmax: 4.6, dens: 1.0, turb: 0.8, name: 'кучевые, база 3350 м' },
  santash: { base: 1500, wmax: 4.0, dens: 0.85, turb: 1.15, name: 'база 3100 м, ветер усиливается к высоте' },
  ulan: { base: 850, wmax: 2.4, dens: 0.5, turb: 1.9, name: 'низкая облачность, сильная болтанка' },
};

const TB = { X0: -17000, X1: 12500, Y0: -9500, Y1: 20000, STEP: 380 }; // где рождаются термики (вся подробная карта)

export class Air {
  // h(X, Y) -- высота рельефа над озером (под водой отрицательная); wind -- ветер озера (sim.js Wind)
  constructor(h, wind, seed = 7) {
    this.h = h; this.wind = wind; this.list = []; this.t = 0; this.r = rng(seed); this.sun = 1; this.sky = SKY.breeze; this.nextId = 1;
    this.trig = null; this.spawnAcc = 0;
  }
  setSky(id) { this.sky = SKY[id] || SKY.breeze; }
  ground(X, Y) { return Math.max(0, this.h(X, Y)); }
  // источники термиков: суша, склоны к солнцу, отроги (выпуклый рельеф), посёлок. Считается один раз
  triggers() { if (this.trig) return this.trig; const { X0, X1, Y0, Y1, STEP } = TB, pts = [], w = []; let sum = 0, rr = rng(99);
    for (let Y = Y0; Y <= Y1; Y += STEP) for (let X = X0; X <= X1; X += STEP) { const x = X + (rr() - 0.5) * STEP * 0.8, y = Y + (rr() - 0.5) * STEP * 0.8, h0 = this.h(x, y); if (h0 < 8) continue;
      const e = 120, gx = (this.h(x + e, y) - this.h(x - e, y)) / (2 * e), gy = (this.h(x, y + e) - this.h(x, y - e)) / (2 * e), n = Math.hypot(gx, gy, 1);
      const sunF = clamp((-gx * 0 + -gy * -0.62 + 0.78) / n, 0.05, 1); // солнце днём на юге: склоны к югу (вниз к озеру) греются сильнее
      let avg = 0; for (let k = 0; k < 6; k++) { const a = k * 1.047; avg += this.h(x + Math.cos(a) * 450, y + Math.sin(a) * 450); } const conv = h0 - avg / 6; // отрог или гребень -- срыв термика
      const town = Math.hypot(x, y - 1500) < 2500 || Math.hypot(x + 4385, y - 1809) < 900 ? 1.6 : 1; // посёлок и бетон аэродрома
      const wt = sunF * sunF * smooth(8, 80, h0) * (1 + clamp(conv / 35, -0.6, 2.2)) * town; if (wt < 0.02) continue; sum += wt; pts.push(x, y); w.push(sum); }
    return (this.trig = { pts, w, sum }); }
  pick(cx, cy, rad) { const T = this.triggers(); for (let k = 0; k < 24; k++) { const u = this.r() * T.sum; let lo = 0, hi = T.w.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (T.w[m] < u) lo = m + 1; else hi = m; }
      const x = T.pts[lo * 2], y = T.pts[lo * 2 + 1]; if (Math.hypot(x - cx, y - cy) < rad) return { x, y }; }
    for (let k = 0; k < 40; k++) { const a = this.r() * 6.283, d = Math.sqrt(this.r()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; if (this.h(x, y) > 20) return { x, y }; } return null; }
  spawn(cx, cy, rad, age = 0) { const p = this.pick(cx, cy, rad); if (!p) return null; const r = this.r, S = this.sky;
    const zg = this.ground(p.x, p.y), w0 = S.wmax * (0.55 + 0.45 * r() ** 0.7) * (0.75 + 0.25 * smooth(50, 900, zg));
    const life = 300 + r() * 420, o = { id: this.nextId++, X: p.x, Y: p.y, zg, w0, R0: 70 + r() * 70 + w0 * 12, age, life, ph: r() * 6.283, wob: 0.18 + r() * 0.2, cloud: 0 };
    this.list.push(o); return o; }
  // fx -- точки, около которых нужен воздух (игрок, соперники); dt -- шаг; sunK -- сила солнца 0..1
  update(dt, focus, sunK = 1) {
    this.t += dt; this.sun = sunK; const S = this.sky, rad = 7500, area = Math.PI * (rad / 1000) ** 2, want = Math.round(S.dens * area / 1.9 * smooth(0.05, 0.5, sunK));
    const W = this.wind, dx = -W.U * Math.sin(W.dirNow) * 0.8 * dt, dy = -W.U * Math.cos(W.dirNow) * 0.8 * dt; // термики уходят по ветру вместе с воздухом
    for (const o of this.list) { o.age += dt; o.X += dx; o.Y += dy; const top = this.top(o); o.cloud = o.age < o.life ? Math.min(1, o.cloud + dt / 60 * (top >= S.base - 10 ? 1 : -0.5)) : Math.max(0, o.cloud - dt / 90); if (o.cloud < 0) o.cloud = 0; }
    this.list = this.list.filter((o) => (o.age < o.life || o.cloud > 0) && focus.some((f) => Math.hypot(f.X - o.X, f.Y - o.Y) < rad * 1.25));
    const live = this.list.filter((o) => o.age < o.life).length; this.spawnAcc += dt;
    if (live < want && this.spawnAcc > 0.4) { this.spawnAcc = 0; const f = focus[Math.floor(this.r() * focus.length)]; if (f) this.spawn(f.X, f.Y, rad, 0); }
  }
  // при старте: сразу нужное число термиков разного возраста
  seed(focus, sunK = 1) { this.sun = sunK; const S = this.sky, rad = 7500, want = Math.round(S.dens * Math.PI * 56.25 / 1.9 * smooth(0.05, 0.5, sunK));
    for (let i = 0; i < want; i++) { const f = focus[i % focus.length], o = this.spawn(f.X, f.Y, rad, 0); if (o) { o.age = this.r() * o.life; o.cloud = this.top(o) >= S.base - 10 ? Math.min(1, (o.age - 120) / 60) : 0; if (o.cloud < 0) o.cloud = 0; } } }
  env(o) { return smooth(0, 50, o.age) * (1 - smooth(o.life - 100, o.life, o.age)); }
  top(o) { return o.zg + (this.sky.base - o.zg) * smooth(0, 150, o.age); } // молодой термик ещё не дорос до базы -- облака нет
  // ветер на высоте Z: у земли слабее, выше сильнее
  windAt(X, Y, Z, out) { const W = this.wind, h0 = this.h(X, Y), g = Math.max(0, h0), agl = Math.max(0, Z - g);
    // общий ветер (Санташ, Улан, бриз): у земли слабее, выше сильнее
    const U = W.U * W.gust(X, Y) * (0.6 + 0.4 * smooth(0, 250, agl)) * (1 + 0.14 * Math.max(0, Z) / 1000), d = W.dirNow + W.veer(X, Y);
    let wx = -U * Math.sin(d), wy = -U * Math.cos(d);
    // местный суточный ветер котловины: днём воздух с озера тянет вверх по склонам (бриз + анабатический), ночью
    // холодный горный ветер стекает к озеру. Сильный общий ветер его забивает. Направление -- по крупному уклону рельефа
    const E = 700, Gx = (Math.max(0, this.h(X + E, Y)) - Math.max(0, this.h(X - E, Y))) / (2 * E), Gy = (Math.max(0, this.h(X, Y + E)) - Math.max(0, this.h(X, Y - E))) / (2 * E), gl = Math.hypot(Gx, Gy);
    if (gl > 0.004) { const calm = 1 - smooth(4, 10.5, W.U), v = (this.sun - 0.3) * 3.6 * calm * (1 - smooth(250, 900, agl)) * Math.min(1, gl * 12); wx += (Gx / gl) * v; wy += (Gy / gl) * v; }
    // гребни и вершины разгоняют поток
    let avg = 0; for (let k = 0; k < 4; k++) { const a = k * 1.571; avg += Math.max(0, this.h(X + Math.cos(a) * 350, Y + Math.sin(a) * 350)); } const conv = g - avg / 4, f = 1 + 0.3 * smooth(0, 80, conv) * Math.exp(-agl / 250);
    out.wx = wx * f; out.wy = wy * f; out.U = Math.hypot(out.wx, out.wy); return out; }
  // центр ствола термика на высоте Z (наклон по ветру) и смещение ядра
  center(o, Z, out) { const W = this.wind, up = Math.max(0, Z - o.zg) / (o.w0 * 0.75 + 0.8), U = W.U * 0.12, d = W.dirNow; // ствол сносится вместе с воздухом, наклон небольшой
    const R = o.R0 * (0.7 + 0.5 * smooth(0, 800, Z - o.zg)), a = this.t * 0.05 + o.ph;
    out.x = o.X - U * Math.sin(d) * up + Math.cos(a) * R * o.wob; out.y = o.Y - U * Math.cos(d) * up + Math.sin(a * 1.3) * R * o.wob; out.R = R; return out; }
  // всё о воздухе в точке: ветер, вертикальный поток w, болтанка turb (0..2), облако
  sample(X, Y, Z, out) {
    this.windAt(X, Y, Z, out); const S = this.sky, hX = this.h(X, Y), g = Math.max(0, hX), agl = Z - g, sun = this.sun;
    let w = 0, tb = 0, cl = 0; const C = CEN;
    for (const o of this.list) { const e = this.env(o); if (e <= 0.001) continue; if (Math.abs(o.X - X) > 2500 || Math.abs(o.Y - Y) > 2500) continue;
      this.center(o, Z, C); const r = Math.hypot(X - C.x, Y - C.y), R = C.R; if (r > R * 3.4) continue;
      const top = this.top(o), base = S.base, vp = smooth(o.zg - 5, o.zg + 70, Z) * (1 - smooth(top - 220, top + 20, Z)) + (top >= base - 10 ? smooth(base - 200, base, Z) * 0.25 * (1 - smooth(base, base + 40, Z)) : 0);
      const core = Math.exp(-((r / R) ** 2)), ring = Math.exp(-(((r - 1.75 * R) / (0.7 * R)) ** 2)), pulse = 1 + 0.22 * Math.sin(this.t * 0.7 + o.ph * 3);
      w += o.w0 * e * vp * (core * pulse - 0.3 * ring) * sun; tb += (o.w0 / 3.5) * e * vp * (0.85 * Math.exp(-(((r - R) / (0.45 * R)) ** 2)) + 0.25 * core) * sun;
      if (o.cloud > 0 && Z > base - 20 && r < R * 2.6 * (0.5 + 0.5 * o.cloud)) cl = Math.max(cl, o.cloud); }
    // фон: над сушей днём -- компенсирующий спуск между термиками, над озером -- ровный слабый спуск (вода холоднее)
    w += hX < 0 ? -0.18 * sun : -0.18 * sun * S.dens;
    // склоны: динамика и ротор. Подъём стоит перед склоном -- уклон берём и в точке, и чуть по ветру впереди
    out.ridge = 0; const e = 110, U = out.U || 0; if (U > 0.3 && agl < 1600) { const ux = out.wx / U, uy = out.wy / U;
      const grad = (ss) => { let gx = 0, gy = 0; for (const s of ss) { const x = X + ux * s, y = Y + uy * s; gx += Math.max(0, this.h(x + e, y)) - Math.max(0, this.h(x - e, y)); gy += Math.max(0, this.h(x, y + e)) - Math.max(0, this.h(x, y - e)); } return [gx / (ss.length * 2 * e), gy / (ss.length * 2 * e)]; };
      const [ax, ay] = grad([0, 160, 320]), [bx, by] = grad([-260, -110, 0]), sl = Math.hypot(ax, ay), Hs = 220 + 500 * Math.min(1, sl * 1.6), f = Math.exp(-Math.max(0, agl) / Hs);
      const up = out.wx * ax + out.wy * ay, dn = out.wx * bx + out.wy * by;
      if (up > 0) { const lift = Math.min(4.5, up * 1.25) * f; w += lift; out.ridge = lift; } else out.ridge = 0;
      if (dn < 0) { const f2 = Math.exp(-Math.max(0, agl) / (Hs * 0.8)); w += Math.max(-3.5, dn * 0.8) * f2; tb += Math.min(1.4, -dn * 0.35) * f2; }
      // ротор: с наветра рельеф выше нас или рядом по высоте -- мы в его вихревом следе
      for (const s of [350, 750]) { const hu = this.h(X - ux * s, Y - uy * s); if (hu > Z - 60) tb += Math.min(1.2, U * 0.07) * smooth(-60, 80, hu - Z); }
      tb += (U / 9) * Math.exp(-Math.max(0, agl) / 70) * 0.5; } // механическая болтанка у самой земли
    out.w = w; out.turb = tb * S.turb * 0.9; out.cloud = cl; out.agl = agl; out.g = g; out.water = hX < 0; return out;
  }
}
const CEN = { x: 0, y: 0, R: 1 }, FS = {};

// ---------- крыло и пилот ----------
const SA = { wx: 0, wy: 0, U: 0, w: 0, turb: 0, cloud: 0, agl: 0, g: 0, water: false };
export class Glider {
  constructor(seed = 1) { this.r = rng(seed); this.reset(0, 0, 500, 0); }
  reset(X, Y, Z, th, mode = 'air') {
    Object.assign(this, { X, Y, Z, th, mode, V: WING.trim, vz: -1.1, gx: 0, gy: 0, phi: 0, pr: 0, pitch: 0, pv: 0, L: 0, R: 0, bar: 0, bS: 0, asym: 0,
      col: 0, colSide: 0, front: 0, stall: 0, stallT: 0, deepT: 0, spin: 0, spiral: 0, surge: 0, lastLs: 0, lastRs: 0, events: [], air: SA, wAir: 0, turb: 0, vario: 0, varioS: 0, gforce: 1, eta: 0,
      t: 0, airT: 0, dist: 0, maxZ: Z, X0: X, Y0: Y, landed: null, run: 0, wingUp: mode === 'air' ? 1 : 0, wingOff: 0, tow: null, kick: 0, flare: 0, agl: 0, ground: 0, inCloud: 0 });
    this.speed = 0; this.vx = 0; this.vy = 0; return this;
  }
  // ctl: tL, tR, tBar -- желаемые положения 0..1 (игрок тянет постепенно -- это решает режим, ИИ задаёт прямо)
  step(dt, ctl, air) {
    this.t += dt; const A = air.sample(this.X, this.Y, this.Z, this.air = { ...SA }); this.ground = A.g; this.agl = this.Z - A.g;
    if (this.mode === 'landed') return this.stepLanded(dt, A);
    if (this.mode === 'launch') return this.stepLaunch(dt, ctl, A, air);
    if (this.mode === 'tow') return this.stepTow(dt, ctl, A, air);
    this.airT += dt;
    // клеванты и акселератор: руки тянут быстро, но не мгновенно; на акселераторе клеванты не держат
    const mv = (cur, tgt, up, dn) => cur + clamp(tgt - cur, -dn * dt, up * dt);
    const pL = this.L, pR = this.R; this.L = mv(this.L, ctl.tL || 0, 2.6, 3.4); this.R = mv(this.R, ctl.tR || 0, 2.6, 3.4); this.bar = mv(this.bar, ctl.tBar || 0, 0.9, 2.2);
    let bS = (this.L + this.R) / 2, asym = this.R - this.L; this.bS = bS; this.asym = asym;
    const r = this.r, turb = A.turb * (1 + 0.35 * Math.sin(this.t * 2.7) * Math.sin(this.t * 1.3)); this.turb = A.turb;
    // ---- ошибки крыла ----
    // подсложение: шанс от болтанки; лёгкое торможение (активное пилотирование) бережёт, акселератор -- наоборот
    const active = bS > 0.06 && bS < 0.5 ? 1 - Math.abs(bS - 0.24) / 0.26 : 0, risk = Math.max(0, turb - 0.32) * 0.55 * (1 + 2.6 * this.bar) * (1 - 0.7 * active);
    if (!this.col && !this.front && !this.stall && !this.spin && r() < risk * dt) {
      if (this.bar > 0.45 && r() < 0.65) { this.front = 0.45 + 0.4 * r(); this.events.push({ type: 'frontal', f: this.front }); }
      else { this.colSide = r() < 0.5 ? -1 : 1; this.col = clamp(0.22 + 0.35 * r() + 0.15 * (turb - 0.6), 0.2, 0.7); this.events.push({ type: 'collapse', side: this.colSide, f: this.col }); } this.kick = 1; }
    // клевок после сваливания или выхода из спирали: не остановил крыло клевантами -- фронтальное
    if (this.surge > 0) { this.surge -= dt; if (this.pitch > 0.42 && bS < 0.25 && !this.front) { this.front = 0.55; this.surge = 0; this.events.push({ type: 'frontal', f: 0.55, surge: true }); } }
    if (this.col > 0) { // открывается само; «подкачка» клевантой сложенной стороны и умеренная встречная клеванта ускоряют
      const cs = this.colSide < 0 ? this.L : this.R, cp = this.colSide < 0 ? pL : pR, open = this.colSide < 0 ? this.R : this.L;
      if (cp > 0.45 && cs < cp - 0.02 && cs < 0.45 && cp >= 0.45) { this.col -= 0.2; this.events.push({ type: 'pump' }); }
      this.col -= dt * (0.12 + 0.22 * clamp(open / 0.4, 0, 1) * (open < 0.75 ? 1 : 0));
      if (open > 0.82 && this.V < 9 && !this.spin) { this.spin = this.colSide < 0 ? 1 : -1; this.col = 0; this.events.push({ type: 'spin' }); } // перетянул -- штопор в сторону открытой половины
      if (this.col <= 0) { this.col = 0; this.colSide = 0; this.events.push({ type: 'reopen' }); } }
    if (this.front > 0) { this.front -= dt * (this.bar > 0.3 ? 0.18 : 0.5); if (this.front <= 0) { this.front = 0; this.surge = 0.9; this.pv += 0.5; this.events.push({ type: 'reopen', front: true }); } }
    // сваливание: глубокие клеванты дольше секунды или слишком малая скорость
    if (!this.stall && !this.spin) { this.deepT = bS > 0.86 ? this.deepT + dt : Math.max(0, this.deepT - dt * 2); if (this.agl > 2.5 && (this.deepT > 1.3 || (this.V < WING.stallV && this.surge <= 0))) { this.stall = 1; this.stallT = 0; this.events.push({ type: 'stall' }); } }
    else if (this.stall) { this.stallT += dt; if (bS < 0.35 && this.stallT > 0.5) { this.stall = 0; this.deepT = 0; this.surge = 1.2; this.pv += 1.3; this.V = Math.max(this.V, 8.5); this.events.push({ type: 'stallExit' }); } }
    // штопор от перетяга одной клеванты на малой скорости
    if (!this.spin && !this.stall && Math.abs(asym) > 0.82 && Math.max(this.L, this.R) > 0.9 && this.V < 7.6) { this.spin = asym > 0 ? 1 : -1; this.events.push({ type: 'spin' }); }
    if (this.spin && Math.max(this.L, this.R) < 0.3) { this.spinT = (this.spinT || 0) + dt; if (this.spinT > 0.7) { this.spin = 0; this.spinT = 0; this.surge = 1; this.pv += 0.9; this.V = Math.max(this.V, 8.5); this.events.push({ type: 'spinExit' }); } } else this.spinT = 0;
    // консоль, попавшая в поток, подбрасывается: крыло кренит ОТ потока -- пилот чувствует и доворачивает туда
    if (this.feel && (this.feelN = (this.feelN || 0) + 1) % 4 === 0) { const rx = Math.cos(this.th) * 5.5, ry = -Math.sin(this.th) * 5.5, a2 = air.sample(this.X + rx, this.Y + ry, this.Z, FS).w, b2 = air.sample(this.X - rx, this.Y - ry, this.Z, FS).w; this.tip = clamp(a2 - b2, -3, 3); }
    if (this.tip) this.pr += -this.tip * 0.55 * dt;
    // ---- скорость по воздуху ----
    let Vt = targetSpeed(bS, this.bar) + 7.5 * Math.max(0, Math.abs(this.phi) - 0.85) - 2.2 * this.front - 1.2 * this.col;
    if (this.stall) Vt = 3.2; if (this.spin) Vt = 5;
    const V0 = this.V; this.V += (Vt - this.V) * Math.min(1, dt / (this.stall ? 0.8 : 1.35)) + (r() - 0.5) * turb * 1.6 * dt; this.V = Math.max(2, this.V);
    const dV = (this.V - V0) / Math.max(dt, 1e-4);
    // ---- крен и разворот ----
    const k = clamp(this.V / WING.trim, 0.55, 1.45); let phiT = asym * 1.15 * (0.55 + 0.45 * k) + this.colSide * this.col * 1.25;
    if (Math.abs(this.phi) > 0.95 && Math.abs(asym) > 0.45 && Math.sign(asym) === Math.sign(this.phi)) { phiT = Math.sign(this.phi) * 1.28; if (!this.spiral) { this.spiral = 1; this.events.push({ type: 'spiral' }); } }
    else if (this.spiral && Math.abs(this.phi) < 0.6) { this.spiral = 0; this.surge = 1; this.events.push({ type: 'spiralExit' }); }
    if (this.spiral && Math.abs(asym) < 0.45) phiT = this.phi * 0.55; // выход из спирали небыстрый: энергия уходит виражом
    if (this.stall) phiT = 0;
    this.pr += ((phiT - this.phi) * 3.3 - 2.5 * this.pr + (r() - 0.5) * turb * 7 + this.kick * (this.colSide || (r() - 0.5)) * 1.6) * dt; this.kick = 0;
    this.phi = clamp(this.phi + this.pr * dt, -1.35, 1.35);
    let yaw = (GR * Math.tan(this.phi)) / Math.max(this.V, 4); if (this.spin) yaw = this.spin * 2.4; if (this.stall) yaw = (r() - 0.5) * 0.6;
    this.th = wrapPi(this.th + yaw * dt); this.yawRate = yaw; this.gforce = this.spin || this.stall ? 1 : 1 / Math.max(0.25, Math.cos(this.phi));
    // ---- вертикаль ----
    const cb = Math.max(0.28, Math.cos(this.phi)); let sink = polarSink(this.V, this.stall || this.spin ? 0 : bS) / cb ** 1.5 + this.col * 2.6 + this.front * 6.5;
    if (this.stall) sink = 7.8 + 1.5 * Math.sin(this.t * 5); if (this.spin) sink = 6.2;
    const energy = clamp(-(this.V * dV) / GR * 0.75, -5, 5); // притормозил -- вверх, разогнался -- вниз
    const gustV = (r() - 0.5) * turb * 6;
    // подрыв у земли: глубокие клеванты на скорости -- последний «подхват» перед касанием
    const vzT = -sink + A.w + energy + gustV; this.vz += (vzT - this.vz) * Math.min(1, dt * 2.6);
    // маятник по тангажу: разгон -- крыло отстаёт, торможение -- уходит вперёд; болтанка его раскачивает
    this.pv += ((-dV * 0.06 - this.pitch) * 5.5 - 2.1 * this.pv + (r() - 0.5) * turb * 5) * dt; this.pitch = clamp(this.pitch + this.pv * dt, -0.9, 0.9);
    // ---- перемещение ----
    const gx = Math.sin(this.th) * this.V + A.wx, gy = Math.cos(this.th) * this.V + A.wy; this.gx = gx; this.gy = gy; this.vx = gx; this.vy = gy; this.speed = Math.hypot(gx, gy);
    this.X += gx * dt; this.Y += gy * dt; this.Z += this.vz * dt; this.dist += this.speed * dt; this.maxZ = Math.max(this.maxZ, this.Z);
    this.wAir = A.w; this.inCloud = A.cloud;
    // вариометр: полная скорость набора, сглаженная как у прибора
    this.vario += (this.vz - this.vario) * Math.min(1, dt * 2.2); this.varioS += (this.vz - this.varioS) * Math.min(1, dt * 0.08);
    // ---- касание ----
    const g = air.ground(this.X, this.Y);
    // первые секунды после отрыва крыло держит над склоном (подъём от ног и от склона), пока земля не уйдёт вниз
    if (this.toT > 0) { this.toT -= dt; if (this.Z < g + 0.8) { this.Z = g + 0.8; this.vz = Math.max(this.vz, 0); } }
    if (this.Z <= g) this.touch(g, air);
  }
  touch(g, air) { const vzI = -this.vz, gs = this.speed, water = air.h(this.X, this.Y) < 0, e = 25;
    const sl = Math.hypot(air.h(this.X + e, this.Y) - air.h(this.X - e, this.Y), air.h(this.X, this.Y + e) - air.h(this.X, this.Y - e)) / (2 * e);
    // удар в склон: склон впереди поднимается, а мы летим на него
    const ahead = air.h(this.X + this.gx * 0.6, this.Y + this.gy * 0.6) - g, slam = ahead > 3 && gs > 9;
    const q = water ? 'water' : slam ? 'slam' : vzI < 1.7 && gs < 7.5 ? 'soft' : vzI < 3 && gs < 10 ? 'ok' : 'hard';
    this.Z = g; this.mode = 'landed'; this.landed = { q, vz: vzI, gs, water, slope: sl, X: this.X, Y: this.Y, t: 0 }; this.run = gs; this.events.push({ type: 'touch', q, vz: vzI, gs, water, slope: sl }); }
  stepLanded(dt, A) { const L = this.landed; L.t += dt; this.run = Math.max(0, this.run - dt * (L.q === 'soft' ? 5 : 9)); const k = this.run / Math.max(0.1, this.speed);
    this.X += this.gx * k * dt * 0.6; this.Y += this.gy * k * dt * 0.6; this.Z = this.ground = A.g; this.agl = 0; this.speed = this.run; this.vz = 0; this.vario = 0; this.V = 0;
    this.phi *= Math.exp(-dt * 4); this.pitch = Math.max(-1.6, this.pitch - dt * 0.9); this.wingUp = Math.max(0, this.wingUp - dt * 0.6); this.pr = 0; this.pv = 0; }
  // старт с ног: подъём крыла (держать над головой рулением), разбег вниз по склону, отрыв
  stepLaunch(dt, ctl, A, air) { const W = A, head = -(W.wx * Math.sin(this.th) + W.wy * Math.cos(this.th)), cross = W.wx * Math.cos(this.th) - W.wy * Math.sin(this.th);
    this.Z = A.g; this.vario = 0; this.vz = 0;
    if (!this.launchGo) { this.speed = 0; if (ctl.go) { this.launchGo = true; this.events.push({ type: 'inflate' }); } return; }
    if (this.wingUp < 1) { this.wingUp = Math.min(1, this.wingUp + dt * (0.45 + 0.08 * Math.max(0, head)));
      this.wingOff += (cross * 0.05 + (this.r() - 0.5) * 0.5 - this.wingOff * 0.6 - ((ctl.tR || 0) - (ctl.tL || 0)) * 1.9) * dt; // крыло уходит вбок -- тянем клеванту с той же стороны
      if (Math.abs(this.wingOff) > 1) { this.wingUp = 0; this.wingOff = 0; this.launchGo = false; this.events.push({ type: 'wingDown' }); } this.pitch = -1.5 + 1.5 * this.wingUp; this.phi = this.wingOff * 0.5; return; }
    // разбег
    this.run = Math.min(6, this.run + dt * 2.2); this.phi += (-this.phi) * dt * 3; this.wingOff *= Math.exp(-dt * 2);
    this.th = wrapPi(this.th + ((ctl.tR || 0) - (ctl.tL || 0)) * 0.6 * dt);
    const fx = Math.sin(this.th), fy = Math.cos(this.th); this.X += fx * this.run * dt; this.Y += fy * this.run * dt; const g2 = air.ground(this.X, this.Y);
    const as = this.run + Math.max(0, head); this.pitch = 0.1 * Math.sin(this.t * 9); this.Z = g2; this.speed = this.run;
    if (this.run > 3 && (as > 7.6 || (this.Z - air.ground(this.X + fx * 6, this.Y + fy * 6) > 1.2 && as > 5.4))) { this.toT = 3; this.mode = 'air'; this.V = Math.max(8.5, as); this.vz = 0.5; this.Z += 0.3; this.pitch = 0; this.events.push({ type: 'takeoff' }); } }
  // буксировка лебёдкой (или катером): трос тянет к якорю, набор 2.5-3.5 м/с; крен от троса -- «лок-аут», слабое звено рвётся
  stepTow(dt, ctl, A, air) { const T = this.tow; T.t += dt; if (T.vx) { T.X += T.vx * dt; T.Y += T.vy * dt; }
    const dx = T.X - this.X, dy = T.Y - this.Y, hd = Math.hypot(dx, dy), brg = Math.atan2(dx, dy), ang = Math.atan2(this.Z - T.Z, hd);
    if (T.t < 1.6) { this.wingUp = Math.min(1, T.t / 1.4); this.pitch = -1.5 + 1.5 * this.wingUp; this.Z = A.g; this.th = brg; this.vario = 0; return; } // натяжение, крыло встаёт
    this.mode === 'tow' && (this.wingUp = 1);
    const pL = this.L, pR = this.R; this.L += clamp((ctl.tL || 0) - this.L, -3.4 * dt, 2.6 * dt); this.R += clamp((ctl.tR || 0) - this.R, -3.4 * dt, 2.6 * dt); void pL; void pR;
    const asym = this.R - this.L, cross = A.wx * Math.cos(brg) - A.wy * Math.sin(brg);
    // уход с линии троса: снос ветром и болтанкой, исправляем клевантами
    T.dev = (T.dev || 0) + (cross * 0.03 + (this.r() - 0.5) * (0.25 + A.turb) * 0.7 + (T.dev || 0) * 0.16 * smooth(2, 8, T.t) + asym * 1.1) * dt;
    this.th = wrapPi(brg + T.dev); this.phi += (clamp(-T.dev * 1.4, -0.7, 0.7) - this.phi) * dt * 3;
    const climb = (3.2 + 3 * smooth(0, 120, this.Z - T.Z)) * (1 - smooth(0.85, 1.1, ang)), fwd = Math.max(1.5, 9 * Math.cos(ang) - 3);
    this.X += Math.sin(this.th) * fwd * dt; this.Y += Math.cos(this.th) * fwd * dt; this.Z = Math.max(this.Z, A.g) + climb * dt; this.vz = climb; this.vario += (climb - this.vario) * dt * 2;
    this.V = 11; this.speed = fwd; this.vx = Math.sin(this.th) * fwd; this.vy = Math.cos(this.th) * fwd; this.gx = this.vx; this.gy = this.vy;
    T.warn = Math.abs(T.dev) > 0.5;
    if (Math.abs(T.dev) > 1.0) { this.release('weaklink'); return; }
    if (ctl.release && T.t > 4) { this.release('manual'); return; }
    if (ang > 1.05 || this.Z - T.Z > T.max) this.release('top'); }
  release(why) { this.mode = 'air'; this.V = WING.trim; this.vz = -0.5; this.events.push({ type: 'release', why, agl: this.Z - this.ground }); this.tow.done = true; this.pr += why === 'weaklink' ? (this.tow.dev > 0 ? -1.2 : 1.2) : 0; }
  startTow(anchor) { this.mode = 'tow'; this.tow = { X: anchor.X, Y: anchor.Y, Z: anchor.Z, vx: anchor.vx || 0, vy: anchor.vy || 0, t: 0, dev: 0, max: anchor.max || 420, done: false }; this.wingUp = 0; }
  startLaunch() { this.mode = 'launch'; this.launchGo = false; this.wingUp = 0; this.wingOff = 0; this.run = 0; }
}

// ---------- соперник: ищет термики, центрирует их, идёт по маршруту ----------
// Видит то же, что видел бы пилот: облака над созревшими термиками, кружащих соперников и птиц; свой вариометр.
// skill 0..1: точность центрирования, порог «стоит ли крутиться», смелость на акселераторе.
export function aiPilot(gl, air, tgt, mem, dt, skill = 0.8, others = []) {
  const c = { tL: 0, tR: 0, tBar: 0, go: true, release: false };
  if (gl.mode === 'launch' || gl.mode === 'tow' || gl.mode === 'landed') return c;
  mem.t = (mem.t || 0) + dt; mem.avg = (mem.avg ?? 0) + (gl.vario - (mem.avg ?? 0)) * Math.min(1, dt * 0.25);
  const agl = gl.agl, dx = tgt.X - gl.X, dy = tgt.Y - gl.Y, dist = Math.max(0, Math.hypot(dx, dy) - (tgt.R || 0) * 0.85), brg = Math.atan2(dx, dy);
  const W = air.windAt(gl.X, gl.Y, gl.Z, {}), head = -(W.wx * Math.sin(brg) + W.wy * Math.cos(brg)), gsTo = Math.max(1, WING.trim - head), ld = gsTo / 1.15;
  const gT = air.ground(tgt.X, tgt.Y), need = tgt.pre ? air.sky.base : gT + 120 + dist / ld * (1.15 - 0.1 * skill), mc = tgt.pre ? 0.2 : 0.25 + 0.7 * skill * smooth(0, 300, gl.Z - need + 300);
  // посадка: у земли -- ровно и подрыв
  if (agl < 22 && !mem.climb) { const f = agl < 4.5 ? 1 : agl < 9 ? 0.25 : 0.1; c.tL = c.tR = f; const e = wrapPi(Math.atan2(-W.wx, -W.wy) - gl.th); if (agl > 9) { c.tR += clamp(e, -0.3, 0.3); c.tL -= clamp(e, -0.3, 0.3); } return c; }
  // восстановление: отпустить всё и подкачать
  if (gl.stall || gl.spin) return c; if (gl.col) { const open = gl.colSide < 0 ? 'tR' : 'tL'; c[open] = 0.3; return c; } if (gl.surge > 0 && gl.pitch > 0.25) { c.tL = c.tR = 0.45; return c; }
  // рельеф впереди: отворачиваем вниз по склону
  const fx = Math.sin(gl.th), fy = Math.cos(gl.th); let danger = 0; for (const s of [120, 260, 420]) { const hz = air.ground(gl.X + fx * s, gl.Y + fy * s); if (hz > gl.Z - 35 - s * 0.05) danger = Math.max(danger, 1 - s / 520); }
  if (danger > 0) { mem.climb = false; const e2 = 90, gx = air.ground(gl.X + e2, gl.Y) - air.ground(gl.X - e2, gl.Y), gy = air.ground(gl.X, gl.Y + e2) - air.ground(gl.X, gl.Y - e2), away = Math.atan2(-gx, -gy), err = wrapPi(away - gl.th);
    c.tR = clamp(err * 1.4, 0, 0.75); c.tL = clamp(-err * 1.4, 0, 0.75); return c; }
  // кручение в термике
  if (mem.climb) { mem.ct += dt; const top = air.sky.base - 120 - (1 - skill) * 250;
    mem.lift = (mem.lift ?? gl.vario) + (gl.vario - (mem.lift ?? gl.vario)) * Math.min(1, dt * 0.15);
    if (gl.Z > top || (mem.ct > 25 && mem.lift < mc * 0.55) || (!tgt.pre && gl.Z > need + 450 + skill * 300)) { mem.climb = false; mem.cool = 12; }
    else { // центрирование как у ассистента термиков: где на последнем круге подъём был сильнее -- туда и смещаем круг
      const Wd = air.windAt(gl.X, gl.Y, gl.Z, {}); mem.ax = (mem.ax || 0) + Wd.wx * 0.8 * dt; mem.ay = (mem.ay || 0) + Wd.wy * 0.8 * dt; const ax = gl.X - mem.ax, ay = gl.Y - mem.ay; // в системе воздушной массы
      mem.st = (mem.st || 0) - dt; if (mem.st <= 0) { mem.st = 0.25; (mem.pts = mem.pts || []).push(ax, ay, gl.vario); if (mem.pts.length > 150) mem.pts.splice(0, 3); }
      let sx = 0, sy = 0, sw = 0, mn = 1e9; const P = mem.pts; for (let i = 2; i < P.length; i += 3) mn = Math.min(mn, P[i]);
      let mx = 0, my = 0; const n = P.length / 3; for (let i = 0; i < P.length; i += 3) { const w = (P[i + 2] - mn) ** 2; sx += P[i] * w; sy += P[i + 1] * w; sw += w; mx += P[i] / n; my += P[i + 1] / n; }
      mem.tight = 0.55;
      if (sw > 0 && n > 30 && (mem.hold = (mem.hold || 0) - dt) <= 0) { let vx = sx / sw - mx, vy = sy / sw - my;
        // опытный пилот видит и другие знаки ядра (кружащих птиц, соседей, пыль): подмешиваем настоящий центр
        let best = null, bd = 1e9; const C = { x: 0, y: 0, R: 0 }; for (const o of air.list) { air.center(o, gl.Z, C); C.x -= mem.ax; C.y -= mem.ay; const dd = Math.hypot(C.x - mx, C.y - my); if (dd < C.R * 1.5 && dd < bd) { bd = dd; best = { x: C.x, y: C.y }; } }
        if (best) { const k = 0.65 * skill; vx = vx * (1 - k) + (best.x - mx) * k; vy = vy * (1 - k) + (best.y - my) * k; }
        const d = Math.hypot(vx, vy), e = Math.abs(wrapPi(Math.atan2(vx, vy) - gl.th));
        if (d > 3 && e < 0.5) { mem.tight = 0.05; mem.hold = 0; mem.shift = (mem.shift || 0) + dt; if (mem.shift > 1.2 + d / 15) { mem.pts = []; mem.shift = 0; mem.hold = 2; } } } // нос на сильную сторону -- выполаживаем: круг сползает туда
      mem.tight += (Math.random() - 0.5) * (1 - skill) * 0.1;
      const s = mem.dir || 1; if (s > 0) { c.tR = mem.tight; c.tL = 0.08; } else { c.tL = mem.tight; c.tR = 0.08; } return c; } }
  mem.cool = Math.max(0, (mem.cool || 0) - dt);
  // нашли подъём по прибору -- встаём в круг, если ниже нужного или подъём хороший
  if (!mem.climb && mem.cool <= 0 && gl.vario > mc && (gl.Z < need + 350 || gl.vario > mc + 1)) { mem.pts = []; mem.climb = true; mem.ct = 0; mem.lift = gl.vario; mem.dir = mem.dir || (Math.random() < 0.5 ? -1 : 1); mem.tight = 0.55; return c; }
  // куда лететь: к цели, а если не хватает высоты -- к лучшему видимому термику (облако, кружащие соперники)
  let goX = tgt.X, goY = tgt.Y;
  if (gl.Z < need + 250) { const C = { x: 0, y: 0, R: 0 }; mem.bad = mem.bad || {};
    // выбранного термика держимся, пока он жив и выше нас; пустой (долетели, а подъёма нет) -- запоминаем как плохой
    let cur = mem.thId ? air.list.find((o) => o.id === mem.thId && air.env(o) > 0.3 && air.top(o) > gl.Z + 80) : null;
    if (cur) { air.center(cur, gl.Z, C); const d = Math.hypot(C.x - gl.X, C.y - gl.Y); if (d < C.R * 0.8) { mem.near = (mem.near || 0) + dt; if (mem.near > 8) { mem.bad[cur.id] = 1; cur = null; } } else mem.near = 0; }
    if (!cur) { mem.thId = 0; mem.near = 0; let bs = 0;
      for (const o of air.list) { const e = air.env(o); if (e < 0.4 || o.age < 90 || mem.bad[o.id] || air.top(o) < gl.Z + 120) continue; air.center(o, gl.Z, C); const d = Math.hypot(C.x - gl.X, C.y - gl.Y); if (d > 2600) continue;
        const vis = o.cloud > 0.3 ? 1 : 0.35 + 0.65 * skill, prog = (dx * (C.x - gl.X) + dy * (C.y - gl.Y)) / (Math.hypot(dx, dy) * d + 1), sc = vis * o.w0 * e * (1.2 + prog) / (1 + d / 900); if (sc > bs) { bs = sc; cur = o; } }
      if (cur) mem.thId = cur.id; }
    let px = null, py = 0, ps = 0; for (const p of others) if (p !== gl && p.vario > 1 && Math.abs(p.Z - gl.Z) < 300) { const d = Math.hypot(p.X - gl.X, p.Y - gl.Y); if (d < 1500) { const sc = p.vario / (1 + d / 600); if (sc > ps) { ps = sc; px = p.X; py = p.Y; } } }
    if (cur) { air.center(cur, gl.Z, C); goX = C.x; goY = C.y; if (px !== null && Math.hypot(px - gl.X, py - gl.Y) < Math.hypot(C.x - gl.X, C.y - gl.Y) * 0.5) { goX = px; goY = py; } }
    else if (px !== null) { goX = px; goY = py; } }
  mem.go = [goX, goY]; const err = wrapPi(Math.atan2(goX - gl.X, goY - gl.Y) - gl.th); c.tR = clamp(err * 1.1, 0, 0.55); c.tL = clamp(-err * 1.1, 0, 0.55);
  // акселератор: в спуске и на финальном глиссаде с запасом, против ветра
  const surplus = gl.Z - need; if (Math.abs(err) < 0.4) c.tBar = clamp((gl.vario < -1.6 ? 0.5 : 0) + (surplus > 150 ? 0.6 : 0) + (head > 4 ? 0.4 : 0), 0, 0.5 + 0.5 * skill) * (gl.turb > 0.8 ? 0.3 : 1);
  if (c.tBar < 0.2 && gl.turb > 0.5) { c.tL += 0.18; c.tR += 0.18; } // активное пилотирование в болтанке
  return c;
}

// посадка соперника на поле: издалека -- к полю, над полем -- круги со сбросом высоты, ниже 45 м -- против ветра, у земли -- подрыв
export function aiLand(gl, air, X, Y) { const c = { tL: 0, tR: 0, tBar: 0 }; if (gl.mode !== 'air') return c;
  const W = air.windAt(gl.X, gl.Y, gl.Z, {}), into = Math.atan2(-W.wx, -W.wy), agl = gl.agl, d = Math.hypot(X - gl.X, Y - gl.Y);
  if (gl.col || gl.stall || gl.spin) return c; if (agl < 1.8) { c.tL = c.tR = 1; return c; }
  let want; if (agl < 45) want = into; else if (d > 260) want = Math.atan2(X - gl.X, Y - gl.Y); else { c.tL = 0.5; c.tR = 0.05; return c; }
  const err = wrapPi(want - gl.th); c.tR = clamp(err * 1.2, 0, 0.5); c.tL = clamp(-err * 1.2, 0, 0.5); return c; }
