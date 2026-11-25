// Ми-8МТВ-1 -- рабочая лошадь горной авиации: спасработы на Иныльчеке, заброска альпинистов в базовые лагеря.
// Физика -- точечная масса с ориентацией (тангаж, крен, курс), тяга несущего винта -- вдоль его оси.
// Что делает вертолёт «тяжёлым» и горным -- по-настоящему:
//  * Тяга падает с плотностью воздуха: на 4000 м она на треть меньше, чем у моря. Потолок висения вне влияния земли
//    при 11.1 т -- около 4000 м; с грузом у лагеря на 4000 м -- на пределе, выше висеть нельзя.
//  * Влияние земли: ближе половины диаметра винта (~10 м) воздушная подушка добавляет до 18% тяги -- у самой земли
//    вертолёт висит там, где на высоте уже не может.
//  * Косая обдувка: на 15-25 м/с винт получает «свежий» воздух -- тяга растёт (поэтому с места тяжёлый взлетает
//    с разбегом).
//  * Вихревое кольцо: быстрое снижение (> 5 м/с) на малой скорости -- винт садится в собственный вихрь, тяга
//    проваливается, вертолёт трясёт. Выход -- скорость вперёд.
//  * Предел мощности: если просить больше, чем могут двигатели на этой высоте, -- падают обороты винта (звук
//    просаживается, «ОБОРОТЫ!»), тяга не растёт.
//  * Инерция: тяжёлая машина отвечает на ручку с запаздыванием, разгон и торможение -- секунды.
// Управление (как у самолёта: намерение -- у лётчика, рутина -- у автоматики):
//  * Ручка (джойстик / стрелки) -- куда лететь: вперёд-назад -- наклон и скорость, в стороны -- на месте разворот,
//    на скорости -- вираж. Отпустил -- автомат гасит скорость и зависает.
//  * Шаг-газ (кнопки ▲ ▼ / W S) -- вверх-вниз: держит заданную вертикальную скорость, отпустил -- держит высоту
//    (если хватает мощности).
// Мир: X -- восток, Y -- север, Z -- вверх (над озером Иссык-Куль, 1607 м). Ветер -- {x, y, z} м/с.
export const MI8 = {
  empty: 7400, fuel: 1700, crew: 270,             // кг: пустой, топливо, экипаж (3 человека)
  T0: 16600,                                       // тяга у моря на взлётном режиме, кгс: висение 11.1 т -- до ~4000 м
  D: 21.3,                                         // диаметр несущего винта, м
  Vmax: 70, Vcr: 64,                               // м/с: 250 и 230 км/ч
  cd: 0.00065,                                     // вредное сопротивление на массу, 1/м: на наклоне 18° -- ~250 км/ч
  pitchMax: 0.32, rollMax: 0.55, yawRate: 0.7,     // рад, рад, рад/с
  tau: 0.55,                                       // с -- запаздывание ориентации (тяжёлая машина)
};
const g = 9.81, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const sigma = (asl) => Math.pow(Math.max(0.05, 1 - 2.2558e-5 * asl), 4.2559); // плотность по МСА (доля от уровня моря)

export class Heli {
  constructor() { this.reset(0, 0, 0, 0); this.load = 0; }
  // th -- курс (0 -- север, по часовой)
  reset(X, Y, Z, th, ground = true) {
    Object.assign(this, { floor: -1e9, gpws: false, X, Y, Z, th, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, yr: 0, col: ground ? 0 : 0.85, rpm: 1, T: 0, Tmax: 0, power: 0, ground, crash: null,
      vrs: 0, ige: 0, etl: 0, agl: 0, sig: 1, t: 0, fuel: MI8.fuel, warn: '', shake: 0, touch: null, hold: Z, tb: 0 });
    if (!ground) { this.hold = Z; } return this; }
  get mass() { return MI8.empty + MI8.crew + this.fuel + this.load; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  // ctl: { fwd -1..1 (вперёд), side -1..1 (вправо), up -1..1 (шаг-газ) }; h(X, Y) -- рельеф над озером; wind(X, Y, Z) -> {x, y, z}
  step(dt, ctl, h, wind = null) {
    const P = MI8, m = this.mass; this.t += dt; if (this.crash) return;
    const gz = Math.max(h(this.X, this.Y), -1), asl = this.Z + 1607, sig = sigma(asl); this.sig = sig; this.agl = this.Z - gz;
    const w = wind ? wind(this.X, this.Y, this.Z) : { x: 0, y: 0, z: 0 }, ax = this.vx - w.x, ay = this.vy - w.y, az = this.vz - w.z, Vair = Math.hypot(ax, ay);
    const fx = Math.sin(this.th), fy = Math.cos(this.th), u = clamp(ctl.fwd || 0, -1, 1), s = clamp(ctl.side || 0, -1, 1), up = clamp(ctl.up || 0, -1, 1);
    // ---- автоматика ориентации: ручка -- желаемая скорость относительно земли; отпустил -- зависание ----
    const vf = this.vx * fx + this.vy * fy, vs = this.vx * fy - this.vy * fx, Vg = Math.hypot(this.vx, this.vy);
    const steep = this.floor > this.Z + 25 ? Math.min(1, (this.floor - this.Z - 25) / 80) : 0; this.gpws = steep > 0.3; // склон выше, чем успеваем набрать, -- автомат тормозит
    const wantF = u >= 0 ? (steep > 0.75 ? -4 : u * P.Vmax * 1.15 * (1 - steep)) : u * 12, wantS = Vg < 15 ? s * 6 * (1 - Math.abs(u)) : 0;
    let pT = clamp(-(wantF - vf) * 0.035, -P.pitchMax, P.pitchMax * (steep > 0.2 ? 1 : 0.6)), rT = clamp((wantS - vs) * 0.05, -0.3, 0.3);
    // на скорости ручка вбок -- вираж: крен и разворот по курсу; на месте -- педали (разворот на месте)
    const fast = sm(8, 22, Vair); rT = rT * (1 - fast) + s * P.rollMax * fast;
    const yr = s * P.yawRate * (1 - fast) + (fast > 0 ? g * Math.tan(this.roll) / Math.max(Vair, 12) * fast : 0);
    const k = Math.min(1, dt / P.tau); this.pitch += (pT - this.pitch) * k; this.roll += (rT - this.roll) * k; this.yr += (yr - this.yr) * Math.min(1, dt * 2.5);
    if (!this.ground) this.th += this.yr * dt;
    // ---- тяга: что может винт здесь и сейчас ----
    const D = P.D, ige = this.agl < D ? 0.18 * Math.exp(-Math.max(0, this.agl) / (0.45 * D)) : 0;                      // влияние земли
    const etl = 0.16 * sm(8, 22, Vair) - 0.10 * sm(55, 75, Vair);                                                        // косая обдувка
    const vrs = sm(3.5, 7, -az) * (1 - sm(9, 16, Vair)) * sm(0.35, 0.7, this.col); this.vrs += (vrs - this.vrs) * Math.min(1, dt * 1.5); // вихревое кольцо
    const Tcap = P.T0 * g * sig * (1 + ige + etl) * (1 - 0.42 * this.vrs);                                               // Н
    this.ige = ige; this.etl = etl;
    // шаг-газ: автомат держит вертикальную скорость (отпустил -- высоту); тяга, нужная для этого
    const cz = Math.cos(this.pitch) * Math.cos(this.roll);
    if (Math.abs(up) > 0.05) this.hold = this.Z;
    // автомат безопасной высоты: на скорости смотрит на 4 с вперёд и не даёт опуститься ниже 35 м над рельефом (садиться -- ▼ на малой скорости)
    // пробы: по курсу на 150-800 м (склон впереди -- заранее) и кольцом в 60 м -- в повороте сносит боком к стене долины
    if (up >= -0.05 && Vg > 10 && !this.ground) { const ux = this.vx / Vg, uy = this.vy / Vg; let la = gz; for (const r of [150, 300, 500, 800]) la = Math.max(la, h(this.X + ux * r, this.Y + uy * r) - r * 0.04); for (const [a, b] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) la = Math.max(la, h(this.X + a, this.Y + b));this.floor = la + 35; if (this.hold < this.floor) this.hold = this.floor; } else this.floor = -1e9;
    const vzT = Math.abs(up) > 0.05 ? (up > 0 ? up * 8 : up * Math.min(7, 1.3 + Math.max(0, this.agl) * 0.2)) : /* вниз: у земли автомат сам гасит снижение до ~1.5 м/с */ clamp((this.hold - this.Z) * 0.6, -3, this.hold > this.Z + 20 ? 12 : 3);
    let Treq = m * (g + clamp((vzT - this.vz) * 1.4, -6, 6)) / Math.max(0.5, cz);
    if (this.ground && up <= 0.05) Treq = Math.min(Treq, m * g * 0.6);                                                    // на земле без шага -- стоим
    const demand = Treq / Tcap; this.col += (clamp(demand, 0, 1) - this.col) * Math.min(1, dt * 2.2);
    // лётчик долго тянет шаг сверх возможного (больше 1.5 с) -- обороты винта проседают, тяги становится меньше
    this.overT = up > 0.6 && demand > 1.05 ? (this.overT || 0) + dt : Math.max(0, (this.overT || 0) - dt * 2);                // шаг двигается не мгновенно
    // предел мощности: просим больше, чем есть, -- обороты падают, тяга не растёт
    const over = clamp((this.overT - 1.5) / 2, 0, 1); this.rpm += ((1 - over * 0.12) - this.rpm) * Math.min(1, dt * 1.2); this.rpm = clamp(this.rpm, 0.85, 1);
    const T = Math.min(this.col, 1) * Tcap * Math.min(1, this.rpm * this.rpm / 0.94 + 0.06 * (this.rpm > 0.97)); this.T = T; this.Tmax = Tcap; this.power = this.col;
    this.warn = this.rpm < 0.96 ? 'rpm' : this.vrs > 0.4 ? 'vrs' : demand > 0.97 && !this.ground ? 'power' : '';
    // ---- силы ----
    // ось винта: тангаж наклоняет вперёд (pitch < 0 -- нос вниз, тяга вперёд), крен -- вбок
    const tx = -Math.sin(this.pitch) * fx + Math.sin(this.roll) * fy, ty = -Math.sin(this.pitch) * fy - Math.sin(this.roll) * fx, tz = cz;
    const drag = P.cd * sig * Vair, dz = 0.012 * sig * az * Math.abs(az) * 8; // вертикальное сопротивление диска
    let axx = (T * tx) / m - drag * ax, ayy = (T * ty) / m - drag * ay, azz = (T * tz) / m - g - dz;
    // болтанка: толчки от ветра у гребней (w.tb -- сила)
    if (w.tb) { this.tbT = (this.tbT || 0) - dt; if (this.tbT <= 0) { this.tbT = 0.15 + Math.random() * 0.4; this.tbA = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; }
      axx += this.tbA[0] * w.tb * 6; ayy += this.tbA[1] * w.tb * 6; azz += this.tbA[2] * w.tb * 9; this.tb = w.tb; } else this.tb = 0;
    this.shake = Math.max(this.vrs * 0.8, this.tb * 0.6, over * 0.6, sm(60, 75, Vair) * 0.3);
    this.vx += axx * dt; this.vy += ayy * dt; this.vz += azz * dt;
    // ---- земля ----
    if (this.ground) { this.vx *= Math.max(0, 1 - dt * 4); this.vy *= Math.max(0, 1 - dt * 4); if (this.vz < 0) this.vz = 0; this.Z = gz; this.pitch *= 0.9; this.roll *= 0.9;
      if (T > m * g * 1.02) { this.ground = false; this.hold = this.Z + 3; } return; }
    this.X += this.vx * dt; this.Y += this.vy * dt; this.Z += this.vz * dt;
    const g2 = Math.max(h(this.X, this.Y), -1); this.agl = this.Z - g2;
    if (this.agl <= 0) { const hard = -this.vz, side = Math.hypot(this.vx, this.vy), slope = Math.hypot(h(this.X + 5, this.Y) - h(this.X - 5, this.Y), h(this.X, this.Y + 5) - h(this.X, this.Y - 5)) / 10;
      this.Z = g2; this.touch = { vz: hard, V: side, slope };
      if (h(this.X, this.Y) < 0) { this.crash = { water: true, vz: hard }; return; }
      if (hard > 4.5 || side > 9 || slope > 0.28 || Math.abs(this.roll) > 0.35) { this.crash = { vz: hard, V: side, slope }; return; }
      this.ground = true; this.vz = 0; this.hold = this.Z; }
  }
}
// потолок висения вне влияния земли при массе m, кг: где T0*sigma = m
export const hoverCeiling = (m) => { let lo = 0, hi = 9000; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (MI8.T0 * sigma(mid) > m) lo = mid; else hi = mid; } return lo; };
