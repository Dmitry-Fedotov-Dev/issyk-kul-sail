// Физика: ветер, волны, лодка. Чистый JS без зависимостей -- запускается и в node (тесты), и в браузере.
// Мир: X -- восток, Y -- север, метры. Курс th -- компасный (0 = север, по часовой), радианы.
export const KN = 1.94384, DEG = Math.PI / 180, G = 9.81;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function wrapPi(a) { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; }

// ---------- градиентный шум ----------
const PERM = new Uint8Array(512);
(() => { let s = 1337; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const X = xi & 255, Y = yi & 255;
  const g = (ix, iy, dx, dy) => { const h = PERM[PERM[ix] + iy] & 7; return GX[h] * dx + GY[h] * dy; };
  const a = g(X, Y, xf, yf), b = g(X + 1, Y, xf - 1, yf), c = g(X, Y + 1, xf, yf - 1), d = g(X + 1, Y + 1, xf - 1, yf - 1);
  return clamp((a + (b - a) * u + (c - a + (a - b + d - c) * u) * v) * 1.2, -1, 1);
}

// ---------- ветер ----------
// Настоящие ветра Иссык-Куля: дневной бриз с озера, «Санташ» с востока, «Улан» с запада (из Боомского ущелья).
export const PRESETS = {
  breeze: { id: 'breeze', name: 'Дневной бриз', sub: 'с озера · 8 узлов · спокойно', dir: 190, speed: 4.2, gust: 0.20, shift: 7, fetch: 9000,
    sky: { cover: -0.62, cirrus: 0.12, storm: 0, scale: 1.7, hor: [0.56, 0.76, 0.97], sun: 1 } }, // почти чистое солнечное небо: редкие кучевые
  santash: { id: 'santash', name: 'Санташ', sub: 'с востока · 14 узлов · порывы', dir: 98, speed: 7.0, gust: 0.27, shift: 10, fetch: 24000,
    sky: { cover: -0.5, cirrus: 0.08, storm: 0, scale: 0.75, hor: [0.54, 0.73, 0.95], sun: 1 } }, // солнечно, отдельные кучевые
  ulan: { id: 'ulan', name: 'Улан', sub: 'с запада · 20 узлов · шквалы и волна', dir: 262, speed: 10.2, gust: 0.33, shift: 12, fetch: 30000,
    sky: { cover: 0.86, cirrus: 0, storm: 0.78, scale: 0.62, hor: [0.36, 0.41, 0.47], sun: 0.32 } }, // штормовой фронт: слоисто-кучевые, свинец
};

export class Wind {
  constructor(preset, terrainH) { this.terrainH = terrainH; this.t = 0; this.set(preset); }
  set(p) {
    this.p = p; this.U = p.speed; this.dir0 = p.dir * DEG; this.dirNow = this.dir0;
    this.sx = -Math.sin(this.dir0); this.sy = -Math.cos(this.dir0); // куда дует
  }
  update(dt) {
    this.t += dt; const t = this.t;
    // медленные заходы ветра: две несоизмеримые гармоники + шум
    this.dirNow = this.dir0 + this.p.shift * DEG * (0.55 * Math.sin(t / 15.5 + 1) + 0.3 * Math.sin(t / 6.3) + 0.35 * noise2(t / 23, 5.5));
  }
  // порывы -- «замороженная турбулентность» (гипотеза Тейлора): поле шума сносится ветром
  gust(X, Y) {
    const a = X * this.sx + Y * this.sy - 0.8 * this.U * this.t, c = X * this.sy - Y * this.sx;
    let n = 0.68 * noise2(a / 520, c / 230) + 0.32 * noise2(a / 170 + 31.7, c / 95 - 11.3);
    n *= 2.1; if (n > 0) n *= 1.35; // порывы резче и сильнее провалов
    return 1 + this.p.gust * clamp(n, -1.1, 1.9);
  }
  veer(X, Y) {
    const a = X * this.sx + Y * this.sy - 0.8 * this.U * this.t, c = X * this.sy - Y * this.sx;
    return noise2(a / 800 + 7.1, c / 420 - 3.3) * 9 * DEG;
  }
  // ветровая тень берега: если с наветра суша -- ветер слабее
  shelter(X, Y) {
    const h = this.terrainH; if (!h) return 1;
    let s = 0;
    const d = [120, 320, 700], w = [0.5, 0.36, 0.22];
    for (let i = 0; i < 3; i++) { const e = h(X - this.sx * d[i], Y - this.sy * d[i]); if (e > 0) s = Math.max(s, w[i] * smooth(0, 25, e + 6)); }
    return 1 - s;
  }
  at(X, Y, out) {
    const sp = this.U * this.gust(X, Y) * this.shelter(X, Y), d = this.dirNow + this.veer(X, Y);
    out.x = -sp * Math.sin(d); out.y = -sp * Math.cos(d); out.speed = sp; out.dir = d; return out;
  }
}

// ---------- волны (сумма волн Герстнера; параметры из разгона и скорости ветра) ----------
// Координаты three.js: x = X, z = -Y.
// Десять волн с несоизмеримыми длинами и направлениями: у шести сумма складывалась в правильный клетчатый узор
export const NWAVES = 10;
export class Waves {
  constructor() { this.w = []; this.Hs = 0; this.qf = 0.7; }
  setFromWind(U, dirFrom, fetch) {
    // эмпирика для ограниченного разгона (SMB / JONSWAP)
    // у берега волна короче и круче открытой: добавляем 25% высоты
    const Hs = Math.min(0.0016 * U * Math.sqrt(fetch / G) * 1.25, 1.5);
    const Tp = 0.286 * (U / G) * Math.cbrt((G * fetch) / (U * U));
    const lp = (G * Tp * Tp) / (2 * Math.PI);
    const ratio = [1.0, 0.71, 1.38, 0.47, 0.31, 0.2, 0.845, 0.577, 1.171, 0.383], off = [0, 15, -19, -34, 41, -58, 26, -8, -46, 63], wt = [1, 0.85, 0.6, 0.7, 0.5, 0.36, 0.78, 0.72, 0.5, 0.55];
    let sum = 0; for (const x of wt) sum += x * x;
    const A = Math.sqrt((Hs * Hs) / 8 / sum);
    this.w = []; let ak = 0;
    for (let i = 0; i < NWAVES; i++) {
      const L = lp * ratio[i], k = (2 * Math.PI) / L, d = dirFrom + off[i] * DEG;
      const a = Math.min(A * wt[i], 0.2 / k);
      // волна бежит ТУДА, куда дует ветер
      this.w.push({ dx: -Math.sin(d), dz: Math.cos(d), k, a, om: Math.sqrt(G * k) });
      ak += a * k;
    }
    this.Hs = Hs; this.Tp = Tp; this.lp = lp; this.qf = Math.min(0.75, 0.85 / Math.max(ak, 1e-6));
  }
  // высота и уклон в точке (x,z); att -- ослабление на мелководье
  sample(x, z, t, att, out) {
    let px = x, pz = z;
    for (let it = 0; it < 2; it++) { // компенсация горизонтального смещения Герстнера
      let ox = 0, oz = 0;
      for (const w of this.w) { const c = Math.cos(w.k * (w.dx * px + w.dz * pz) - w.om * t) * w.a * this.qf * att; ox += w.dx * c; oz += w.dz * c; }
      px = x - ox; pz = z - oz;
    }
    let h = 0, sx = 0, sz = 0;
    for (const w of this.w) { const ph = w.k * (w.dx * px + w.dz * pz) - w.om * t, s = Math.sin(ph), c = Math.cos(ph) * w.a * w.k * att; h += w.a * att * s; sx += w.dx * c; sz += w.dz * c; }
    out.h = h; out.sx = sx; out.sz = sz; return out;
  }
}

// ---------- парус: подъёмная сила и сопротивление от угла атаки (грот + стаксель вместе) ----------
const A_T = [0, 4, 8, 14, 20, 27, 35, 50, 70, 90, 120, 180];
const CL_T = [0, 0.18, 0.62, 1.22, 1.46, 1.38, 1.12, 0.82, 0.42, 0.0, -0.2, 0];
const CD_T = [0.07, 0.07, 0.09, 0.15, 0.24, 0.36, 0.56, 0.86, 1.13, 1.24, 1.05, 0.4];
function tab(T, a) { for (let i = 1; i < A_T.length; i++) if (a <= A_T[i]) return lerp(T[i - 1], T[i], (a - A_T[i - 1]) / (A_T[i] - A_T[i - 1])); return T[T.length - 1]; }

export const BOAT = {
  mass: 1250, massSide: 2100, sail: 24, rhoAir: 1.02 /* воздух на 1600 м разрежен */, ceH: 4.6,
  K: 6700, phiV: 80 * DEG, crewM: 1400, Ix: 2600, rollDamp: 5200, hullSpeed: 3.16, draft: 1.45,
};
const W = { x: 0, y: 0, speed: 0, dir: 0 }, WS = { h: 0, sx: 0, sz: 0 };

export class Boat {
  constructor() { this.events = []; this.skill = 1; this.reset(0, 0, 0); }
  reset(X, Y, th) {
    Object.assign(this, { X, Y, th, vx: 0, vy: 0, r: 0, phi: 0, p: 0, rudder: 0, ease: 0, boom: 0, trim: 30 * DEG, crew: 0,
      capsized: false, righting: 0, rightHold: 0, aground: false, y: 0, pitch: 0, slopeR: 0, slopeF: 0,
      awa: 0, aws: 0, tws: 0, twd: 0, twa: 0, alpha: 0, luff: 0, u: 0, vs: 0, power: 0, lastAwaSign: 0, slam: 0, att: 1 });
    this.events.length = 0;
  }
  get speed() { return Math.hypot(this.vx, this.vy); }

  // поза на волне (раз в кадр): высота, дифферент, уклоны для физики
  updatePose(waves, t, terrainH) {
    const fx = Math.sin(this.th), fz = -Math.cos(this.th), rx = Math.cos(this.th), rz = Math.sin(this.th);
    const x = this.X, z = -this.Y, depth = terrainH ? -terrainH(this.X, this.Y) : 50;
    const att = this.att = smooth(0.2, 5, depth);
    const hb = waves.sample(x + fx * 2.6, z + fz * 2.6, t, att, WS).h, hs = waves.sample(x - fx * 2.6, z - fz * 2.6, t, att, WS).h;
    const hr = waves.sample(x + rx * 1.1, z + rz * 1.1, t, att, WS).h, hl = waves.sample(x - rx * 1.1, z - rz * 1.1, t, att, WS).h;
    const ty = (hb + hs + hr + hl) / 4, tp = Math.atan2(hb - hs, 5.2);
    this.y += (ty - this.y) * 0.35; this.pitch += (tp - this.pitch) * 0.3;
    this.slopeF = (hb - hs) / 5.2; this.slopeR = (hr - hl) / 2.2; this.depth = depth; this.wg = clamp((waves.Hs || 0.3) / 0.55, 0.35, 2.2);
  }

  step(dt, inp, wind, terrainH) {
    const B = BOAT, ev = this.events;
    // --- руль и шкот: быстрый отклик на клавишу ---
    const st = clamp(inp.steer, -1, 1), rr = st === 0 ? 5 : (st * this.rudder < 0 ? 7 : 3.4);
    this.rudder += clamp(st - this.rudder, -rr * dt, rr * dt);
    this.ease += clamp((inp.ease ? 1 : 0) - this.ease, -dt / 1.0, dt / 0.45);

    wind.at(this.X, this.Y, W);
    const fx = Math.sin(this.th), fy = Math.cos(this.th), rx = fy, ry = -fx;
    let ax = W.x - this.vx, ay = W.y - this.vy; const aws = Math.hypot(ax, ay) || 1e-6;
    const awa = Math.atan2(-(ax * rx + ay * ry), -(ax * fx + ay * fy)), absA = Math.abs(awa);
    this.awa = awa; this.aws = aws; this.tws = W.speed; this.twd = W.dir; this.twa = wrapPi(W.dir - this.th);
    let u = this.vx * fx + this.vy * fy, vs = this.vx * rx + this.vy * ry;

    if (this.capsized) return this.stepCapsized(dt, inp, u, vs, fx, fy, rx, ry);
    if (this.aground) return this.stepAground(dt, terrainH);

    // --- автоподбор шкота с запаздыванием + травление ---
    const dOpt = clamp(absA - 18 * DEG, 6 * DEG, 86 * DEG);
    this.trim += clamp(dOpt - this.trim, -0.6 * dt, 0.6 * dt);
    const sheet = Math.min(88 * DEG, this.trim + this.ease * Math.max(0, absA - this.trim) * 0.97);
    const lee = awa > 0 ? -1 : 1; // гик уходит под ветер
    const bt = lee * Math.min(sheet, absA), brate = (1.2 + aws * 0.45) * dt, pb = this.boom;
    this.boom += clamp(bt - this.boom, -brate, brate);
    if (pb * this.boom < 0 || (pb === 0 && this.boom !== 0 && this.lastAwaSign)) {
      if (absA > 105 * DEG) { // поворот фордевинд: гик перелетает
        const pw = clamp((aws * aws) / 90, 0.1, 2.2) * smooth(0.25, 1.2, Math.abs(bt));
        this.p += lee * pw * 0.55; ev.push({ type: 'gybe', power: pw });
      }
    }
    const sg = awa > 0 ? 1 : -1;
    if (this.lastAwaSign && sg !== this.lastAwaSign && absA < 70 * DEG) ev.push({ type: 'tack' });
    this.lastAwaSign = sg;

    const alpha = Math.max(0, absA - Math.abs(this.boom)), aDeg = alpha / DEG;
    this.alpha = alpha; this.luff = 1 - smooth(3, 11, aDeg);
    const ce = Math.pow(Math.max(0, Math.cos(this.phi)), 1.2) * this.skill * (1 - 0.35 * (this.wearA || 0)); // растянутый парус тянет хуже
    const q = 0.5 * B.rhoAir * aws * aws * B.sail * ce, hx = ax / aws, hy = ay / aws;
    // нормаль паруса (подветренная сторона) -- выбирает знак подъёмной силы
    const sb = this.boom >= 0 ? 1 : -1, cb = Math.cos(Math.abs(this.boom)), snb = Math.sin(Math.abs(this.boom));
    const bx = -fx * cb + sb * rx * snb, by = -fy * cb + sb * ry * snb;
    let nx = -by, ny = bx; if (nx * hx + ny * hy < 0) { nx = -nx; ny = -ny; }
    let px = -hy, py = hx; if (px * nx + py * ny < 0) { px = -px; py = -py; }
    const L = q * tab(CL_T, aDeg), D = q * tab(CD_T, aDeg);
    const sFx = L * px + D * hx, sFy = L * py + D * hy;
    const sF = sFx * fx + sFy * fy, sR = sFx * rx + sFy * ry;
    this.power = sF;

    // --- корпус, киль, руль ---
    const V2 = u * u + vs * vs, beta = Math.atan2(vs, Math.abs(u) + 0.3), clk = clamp(3.6 * beta, -0.95, 0.95);
    const kEff = Math.max(0.15, Math.cos(this.phi));
    const Fr = sR - 500 * (0.95 * V2 * clk * kEff + 2.2 * vs * Math.abs(vs)) - 300 * vs;
    const au = Math.abs(u), xs = au / B.hullSpeed, wave = xs < 1 ? 250 * xs ** 6 : 250 * (1 + 2.0 * (xs - 1));
    const sp2 = Math.sin(this.phi) ** 2;
    const res = (20 * au * au * (1 + 1.3 * sp2) * (1 + 0.7 * (this.wearH || 0)) + wave + 500 * 0.95 * V2 * clk * clk * 0.11 + 42 * au * au * this.rudder * this.rudder) * Math.sign(u) + 25 * u;
    const Ff = sF - res - B.mass * G * 0.25 * this.slopeF * this.att;
    this.vx += (fx * Ff / B.mass + rx * Fr / B.massSide) * dt;
    this.vy += (fy * Ff / B.mass + ry * Fr / B.massSide) * dt;

    // --- рыскание: руль работает только в потоке; крен приводит лодку к ветру ---
    const ue = (u < -0.4 ? -1 : 1) * Math.max(au, 0.75);
    const rT = this.rudder * 0.215 * ue * Math.max(0.2, Math.cos(this.phi)) ** 2;
    const sph = Math.sin(Math.abs(this.phi));
    let rd = (rT - this.r) / 0.42;
    rd += sg * 0.5 * (Math.abs(sR) / 1500) * sph * sph * 4; // приводится в порыве
    rd -= sg * 0.03 * aws * (1 - Math.min(1, au / 1.5)) * (absA < 70 * DEG ? 1 : 0); // без хода нос уваливает
    this.r += rd * dt; this.th = wrapPi(this.th + this.r * dt);

    // --- крен ---
    // крутая волна в борт: кроме наклона по склону, гребень бьёт в корпус -- на малом ходу лагом к волне яхту может положить
    const ws = this.slopeR * this.att * (this.wg || 1), wk = Math.max(0, Math.abs(ws) - 0.3) * Math.sign(ws) * 26000 * (1 - Math.min(1, au / 3.5) * 0.6);
    const mh = sR * B.ceH + wk;
    this.crew += clamp(clamp(-mh / B.crewM, -1, 1) - this.crew, -1.3 * dt, 1.3 * dt);
    const pr = this.phi + Math.atan(this.slopeR) * 0.8 * this.att;
    const rm = B.K * Math.sin(Math.PI * clamp(pr, -1.9, 1.9) / B.phiV);
    const pd = (mh + this.crew * B.crewM * Math.cos(this.phi) - rm - B.rollDamp * this.p - B.mass * u * this.r * 0.45) / B.Ix;
    this.p += pd * dt; this.phi += this.p * dt;
    // за 60° вода идёт в кокпит -- лодку уже не удержать
    if (Math.abs(this.phi) > 60 * DEG) { this.capsized = true; this.rightHold = 0; this.righting = 0; ev.push({ type: 'capsize' }); }

    this.X += this.vx * dt; this.Y += this.vy * dt; this.u = u; this.vs = vs;
    if (terrainH && -terrainH(this.X, this.Y) < B.draft) { this.aground = true; this.agT = 0; ev.push({ type: 'aground', speed: this.speed }); }
  }

  stepCapsized(dt, inp, u, vs, fx, fy, rx, ry) {
    const k = Math.exp(-1.6 * dt); this.vx *= k; this.vy *= k; this.r *= k; this.power = 0; this.luff = 0;
    this.X += this.vx * dt; this.Y += this.vy * dt; this.u = u; this.vs = vs;
    if (this.righting > 0) { // лодка встаёт
      this.righting += dt / 1.8; const s = Math.sign(this.phi) || 1;
      this.phi = s * 93 * DEG * (1 - smooth(0, 1, this.righting)); this.p = 0;
      if (this.righting >= 1) { this.capsized = false; this.righting = 0; this.phi = 0; this.ease = 1; this.crew = 0; this.events.push({ type: 'righted' }); }
      return;
    }
    const s = Math.sign(this.phi) || 1;
    this.phi += (s * 93 * DEG - this.phi) * Math.min(1, 3 * dt); this.p = 0;
    this.rightHold = inp.ease ? this.rightHold + dt / 2.2 : Math.max(0, this.rightHold - dt);
    if (this.rightHold >= 1) { this.righting = 0.001; this.rightHold = 0; }
  }

  stepAground(dt, terrainH) {
    // лодку стаскивает на глубину: идём по градиенту дна
    this.agT += dt; this.vx = this.vy = 0; this.r = 0; this.power = 0;
    this.phi += (0.25 * Math.sign(this.phi || 1) - this.phi) * Math.min(1, 2 * dt); this.p = 0;
    if (this.agT < 1.2) return;
    const e = 6, gx = terrainH(this.X + e, this.Y) - terrainH(this.X - e, this.Y), gy = terrainH(this.X, this.Y + e) - terrainH(this.X, this.Y - e);
    const n = Math.hypot(gx, gy) || 1, dx = -gx / n, dy = -gy / n;
    this.X += dx * 5 * dt; this.Y += dy * 5 * dt;
    this.th = wrapPi(this.th + clamp(wrapPi(Math.atan2(dx, dy) - this.th), -1.2 * dt, 1.2 * dt));
    if (-terrainH(this.X, this.Y) > BOAT.draft + 1.4) { this.aground = false; this.phi = 0; this.events.push({ type: 'refloat' }); }
  }
}

export function pointOfSail(twaAbs) {
  const d = twaAbs / DEG;
  return d < 33 ? 'Левентик' : d < 58 ? 'Бейдевинд' : d < 105 ? 'Галфвинд' : d < 160 ? 'Бакштаг' : 'Фордевинд';
}

// ---------- рулевой-автомат для соперников ----------
export function aiControl(b, tx, ty, st, dt) {
  const brg = Math.atan2(tx - b.X, ty - b.Y), rel = wrapPi(brg - b.twd); // 0 = цель точно на ветру
  st.t = (st.t || 0) + dt; if (!st.side) st.side = rel >= 0 ? 1 : -1;
  let want = brg;
  const up = (st.up || 45) * DEG, dn = 152 * DEG;
  if (Math.abs(rel) < up - 3 * DEG) {
    if (st.side * rel < -(up - 6 * DEG) * 0.95 && st.t > 7) { st.side = -st.side; st.t = 0; }
    else if (st.side * rel < -up * 0.6 && st.t > 14) { st.side = -st.side; st.t = 0; }
    want = b.twd + st.side * up;
  } else if (Math.abs(rel) > dn + 4 * DEG) {
    const r2 = wrapPi(brg - (b.twd + Math.PI));
    if (st.side * r2 < -20 * DEG && st.t > 8) { st.side = -st.side; st.t = 0; }
    want = b.twd + Math.PI + st.side * (Math.PI - dn);
  } else st.side = rel >= 0 ? 1 : -1;
  const heel = Math.abs(b.phi) / DEG;
  st.easing = heel > (st.easing ? 24 : 31);
  if (b.capsized) return { steer: 0, ease: (st.capT = (st.capT || 0) + dt) > 4 };
  st.capT = 0;
  return { steer: clamp(wrapPi(want - b.th) * 2.2 - b.r * 0.6, -1, 1), ease: st.easing };
}
