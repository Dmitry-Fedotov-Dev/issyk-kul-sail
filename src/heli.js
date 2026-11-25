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
// Управление -- аркадное, «как в San Andreas, только проще»: лётчик сам наклоняет машину, она едет по инерции.
//  * Ручка вперёд-назад -- наклон носа: наклонил -- поехал, на себя -- торможение «задиранием» (как ручник).
//    Отпустил -- выравнивается и долго катится по инерции, слегка подтормаживая.
//  * Ручка в стороны -- на месте разворот, на скорости -- вираж с креном (заносит, пока скорость не догонит нос).
//  * Шаг-газ (▲ ▼ / Пробел, Shift) -- вверх-вниз; отпустил -- держит высоту, если хватает мощности.
//  * Удар о склон -- отскок и повреждение корпуса (hp), авария -- если корпус кончился или удар слишком сильный.
// Мир: X -- восток, Y -- север, Z -- вверх (над озером Иссык-Куль, 1607 м). Ветер -- {x, y, z} м/с.
export const MI8 = {
  empty: 7100, fuel: 1200, crew: 270,             // кг: спасательная комплектация (облегчена, топливо на вылет): потолок висения ~6 км, на 5200 м -- впритык
  T0: 16600,                                       // тяга у моря на взлётном режиме, кгс: висение 11.1 т -- до ~4000 м
  D: 21.3,                                         // диаметр несущего винта, м
  Vmax: 70, Vcr: 64,                               // м/с: 250 и 230 км/ч
  cd: 0.00065,                                     // вредное сопротивление на массу, 1/м: на наклоне 18° -- ~250 км/ч
  pitchMax: 0.38, rollMax: 0.6, yawRate: 1.15,     // рад, рад, рад/с: наклон до 22°, крен до 34° -- машина «ложится» в поворот
  tau: 0.38,                                       // с -- запаздывание ориентации: тяжёлая, но отвечает сразу
};
const g = 9.81, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const sigma = (asl) => Math.pow(Math.max(0.05, 1 - 2.2558e-5 * asl), 4.2559); // плотность по МСА (доля от уровня моря)

export class Heli {
  constructor() { this.reset(0, 0, 0, 0); this.load = 0; }
  // th -- курс (0 -- север, по часовой)
  reset(X, Y, Z, th, ground = true) {
    Object.assign(this, { anc: null, iF: 0, iS: 0, hp: 100, hit: null, cr: 0, heat: 0, hot: 0, crOn: false, floor: -1e9, gpws: false, X, Y, Z, th, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, yr: 0, col: ground ? 0 : 0.85, rpm: 1, T: 0, Tmax: 0, power: 0, ground, crash: null,
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
    // ---- ручка -- прямо наклон машины ----
    const vf = this.vx * fx + this.vy * fy, vs = this.vx * fy - this.vy * fx, Vg = Math.hypot(this.vx, this.vy), fast = sm(6, 20, Vair);
    // отпустил ручку -- нос чуть задирается против скорости: долгий накат, а не стоп-кран; на себя -- тормоз
    const free = Math.abs(u) < 0.05, brake = free ? clamp(vf * 0.004, -0.06, 0.08) : 0;
    // не хватает мощности держать высоту (горы, груз) -- автомат уменьшает наклон вперёд: машина не «ныряет» в лёд
    const sinking = (this.dem || 0) > 0.96 && (this.Z < this.hold - 2 || up > 0.05 || this.vz < -1.5); this.tl = clamp((this.tl ?? 1) + (sinking ? -dt * 2 : dt * 0.35), 0.3, 1);
    // висение: ручка отпущена на малой скорости -- машина сама гасит снос и парирует ветер (с «памятью» -- держит наклон против ветра)
    const hov = free && Vg < 10 && !this.ground ? 1 - sm(6, 10, Vg) : 0;
    // висение держит и место: точка, где отпустили ручку, -- медленно тянет к ней (ветер не сносит от людей)
    if (hov > 0.5) { if (!this.anc) this.anc = { X: this.X, Y: this.Y }; } else this.anc = null;
    let eF = vf, eS = vs; if (this.anc) { const ax2 = clamp((this.anc.X - this.X) * 0.15, -3, 3), ay2 = clamp((this.anc.Y - this.Y) * 0.15, -3, 3); eF -= ax2 * fx + ay2 * fy; eS -= ax2 * fy - ay2 * fx; }
    if (hov) { this.iF = clamp((this.iF || 0) + eF * dt * 0.05 * hov, -0.3, 0.3); this.iS = clamp((this.iS || 0) + eS * dt * 0.05 * hov, -0.3, 0.3); } else { const k = Math.max(0, 1 - dt * 1.5); this.iF = (this.iF || 0) * k; this.iS = (this.iS || 0) * k; }
    const pT = clamp(-u * (u > 0 ? P.pitchMax * this.tl : P.pitchMax * 1.05) + brake * (1 - hov) + hov * (clamp(eF * 0.045, -0.22, 0.22) + this.iF), -P.pitchMax, P.pitchMax * 1.05);
    // крен: на скорости -- вираж; на месте -- ручка вбок крутит нос (педали), а боковой снос гасится сам
    const rT = s * P.rollMax * fast + (1 - fast) * (clamp(-(hov ? eS : vs) * 0.045, -0.22, 0.22) - this.iS * (Math.abs(s) < 0.05 ? 1 : 0.5));
    const yr = s * P.yawRate * (1 - fast * 0.55) + (fast > 0 ? g * Math.tan(this.roll) / Math.max(Vair, 14) * fast * 0.9 : 0);
    // порыв ветра сбоку -- машину дёргает креном
    if (w.gx !== undefined) { const gl = w.gx * fy - w.gy * fx; this.rv = (this.rv || 0) + (gl - (this.glP ?? gl)) * 0.05; this.glP = gl; }
    // ориентация -- пружина с лёгким перехлёстом (ζ 0.62): рванул ручку -- нос клюнул чуть дальше и вернулся
    const om = 1.9 / P.tau, ze = 0.62; this.pv = (this.pv || 0) + ((pT - this.pitch) * om * om - 2 * ze * om * (this.pv || 0)) * dt; this.rv = (this.rv || 0) + ((rT - this.roll) * om * om - 2 * ze * om * (this.rv || 0)) * dt;
    this.pitch += this.pv * dt; this.roll += this.rv * dt; this.yr += (yr - this.yr) * Math.min(1, dt * 2.5);
    if (!this.ground) this.th += this.yr * dt;
    // ---- тяга: что может винт здесь и сейчас ----
    const D = P.D, ige = this.agl < D ? 0.18 * Math.exp(-Math.max(0, this.agl) / (0.45 * D)) : 0;                      // влияние земли
    const etl = 0.16 * sm(8, 22, Vair) - 0.10 * sm(55, 75, Vair);                                                        // косая обдувка
    const vrs = sm(3.5, 7, -az) * (1 - sm(9, 16, Vair)) * sm(0.35, 0.7, this.col); this.vrs += (vrs - this.vrs) * Math.min(1, dt * 1.5); // вихревое кольцо
    // ЧР -- чрезвычайный режим двигателей (как у настоящего ТВ3-117): ▲ до упора на пределе мощности -- +12% тяги,
    // но растёт перегрев; перегрел -- 15 с мощность на 20% меньше. Риск по выбору лётчика
    const wantCR = up > 0.6 && (this.col > 0.97 || this.ground) && this.hot <= 0; this.crOn = wantCR; this.cr += ((wantCR ? 1 : 0) - this.cr) * Math.min(1, dt * 3);
    this.heat = clamp(this.heat + (wantCR ? dt / 9 : -dt / 14), 0, 1); if (this.heat >= 1 && this.hot <= 0) { this.hot = 15; this.heatHit = true; } this.hot = Math.max(0, this.hot - dt);
    const Tcap = P.T0 * g * sig * (1 + ige + etl) * (1 - 0.42 * this.vrs) * (1 + 0.12 * this.cr) * (this.hot > 0 ? 0.8 : 1);                                               // Н
    this.ige = ige; this.etl = etl;
    // шаг-газ: автомат держит вертикальную скорость (отпустил -- высоту); тяга, нужная для этого
    const cz = Math.cos(this.pitch) * Math.cos(this.roll);
    if (Math.abs(up) > 0.05) this.hold = this.Z;
    // ЗЕМЛЯ!: только предупреждение -- рельеф по курсу на 2-6 с выше траектории (рулит лётчик, не автомат)
    this.gpws = false; if (Vg > 10 && !this.ground) for (const t of [2, 4, 6]) if (h(this.X + this.vx * t, this.Y + this.vy * t) > this.Z + Math.min(this.vz, 0) * t - 12) { this.gpws = true; break; }
    const climbMax = clamp((Tcap * cz / m - g) * 2.5, 0.6, 8); // вверх -- на сколько хватает мощности здесь (в горах медленнее, но без «ОБОРОТЫ!»)
    let vzT = Math.abs(up) > 0.05 ? (up > 0 ? up * climbMax : up * Math.min(Vg < 12 ? 6 : 7, 1.2 + Math.max(0, this.agl) * 0.15)) : /* вниз: у земли автомат сам гасит снижение до ~1.5 м/с */ clamp((this.hold - this.Z) * 0.6, -3, this.hold > this.Z + 20 ? 12 : 3);
    let Treq = m * (g + clamp((vzT - this.vz) * 1.4, -6, 6)) / Math.max(0.5, cz);
    if (this.ground && up <= 0.05) Treq = Math.min(Treq, m * g * 0.6);                                                    // на земле без шага -- стоим
    const demand = Treq / Tcap; this.dem = demand; this.col += (clamp(demand, 0, 1) - this.col) * Math.min(1, dt * 2.2);
    // лётчик долго тянет шаг сверх возможного (больше 1.5 с) -- обороты винта проседают, тяги становится меньше
    this.overT = up > 0.6 && demand > 1.15 ? (this.overT || 0) + dt : Math.max(0, (this.overT || 0) - dt * 2);                // шаг двигается не мгновенно
    // предел мощности: просим больше, чем есть, -- обороты падают, тяга не растёт
    const over = clamp((this.overT - 3) / 2, 0, 1); this.rpm += ((1 - over * 0.07) - this.rpm) * Math.min(1, dt * 1.2); this.rpm = clamp(this.rpm, 0.85, 1);
    const T = Math.min(this.col, 1) * Tcap * Math.min(1, this.rpm * this.rpm / 0.94 + 0.06 * (this.rpm > 0.97)); this.T = T; this.Tmax = Tcap; this.power = this.col;
    this.warn = this.hot > 0 ? 'hot' : this.rpm < 0.96 ? 'rpm' : this.vrs > 0.4 ? 'vrs' : demand > 0.97 && !this.ground ? 'power' : '';
    // ---- силы ----
    // ось винта: тангаж наклоняет вперёд (pitch < 0 -- нос вниз, тяга вперёд), крен -- вбок
    const tx = -Math.sin(this.pitch) * fx + Math.sin(this.roll) * fy, ty = -Math.sin(this.pitch) * fy - Math.sin(this.roll) * fx, tz = cz;
    const drag = P.cd * sig * Vair, dz = 0.012 * sig * az * Math.abs(az) * 8; // вертикальное сопротивление диска
    let axx = (T * tx) / m - drag * ax, ayy = (T * ty) / m - drag * ay, azz = (T * tz) / m - g - dz;
    // болтанка: толчки от ветра у гребней (w.tb -- сила)
    if (w.tb) { this.tbT = (this.tbT || 0) - dt; if (this.tbT <= 0) { this.tbT = 0.15 + Math.random() * 0.4; this.tbA = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; }
      axx += this.tbA[0] * w.tb * 6; ayy += this.tbA[1] * w.tb * 6; azz += this.tbA[2] * w.tb * 9; this.tb = w.tb; } else this.tb = 0;
    // порыв толкает машину сильнее, чем ровный ветер (сопротивление фюзеляжа резкому изменению потока)
    if (w.gx !== undefined) { axx += w.gx * 0.09; ayy += w.gy * 0.09; }
    this.shake = Math.max(this.vrs * 0.8, this.tb * 0.6, over * 0.6, sm(60, 75, Vair) * 0.3);
    this.vx += axx * dt; this.vy += ayy * dt; this.vz += azz * dt;
    // ---- земля ----
    if (this.ground) { this.vx *= Math.max(0, 1 - dt * 4); this.vy *= Math.max(0, 1 - dt * 4); if (this.vz < 0) this.vz = 0; this.Z = gz; this.pitch *= 0.9; this.roll *= 0.9;
      if (T > m * g * 1.02) { this.ground = false; this.hold = this.Z + 3; } return; }
    const pX = this.X, pY = this.Y, pZ = this.Z; this.X += this.vx * dt; this.Y += this.vy * dt; this.Z += this.vz * dt;
    const g2 = Math.max(h(this.X, this.Y), -1); this.agl = this.Z - g2;
    if (this.agl <= 0) { const ex = (h(this.X + 5, this.Y) - h(this.X - 5, this.Y)) / 10, ey = (h(this.X, this.Y + 5) - h(this.X, this.Y - 5)) / 10, slope = Math.hypot(ex, ey);
      const nl = Math.hypot(ex, ey, 1), nx = -ex / nl, ny = -ey / nl, nz = 1 / nl, vn = this.vx * nx + this.vy * ny + this.vz * nz, hard = -this.vz, side = Math.hypot(this.vx, this.vy);
      this.Z = g2;
      if (h(this.X, this.Y) < 0) { this.crash = { water: true, vz: hard }; return; }
      if (hard <= 4.5 && side <= 9 && slope <= 0.28 && Math.abs(this.roll) <= 0.35) { this.touch = { vz: hard, V: side, slope }; this.ground = true; this.vz = 0; this.hold = this.Z; return; }
      // удар: отскок от склона, повреждение по силе удара (вдоль нормали полностью, вскользь -- на треть)
      const tang = Math.sqrt(Math.max(0, this.vx * this.vx + this.vy * this.vy + this.vz * this.vz - vn * vn)), imp = Math.max(0, -vn) + 0.3 * tang, dmg = imp > 3.5 ? clamp((imp - 3) * 4, 4, 100) : 0;
      if (dmg) { this.hp -= dmg; this.hit = { dmg, imp }; } this.anc = null; this.iF = 0; this.iS = 0;
      if (this.hp <= 0 || imp > 24) { this.hp = Math.max(0, this.hp); this.crash = { vz: hard, V: side, slope }; return; }
      const k = (1.35) * Math.min(0, vn); this.vx = (this.vx - k * nx) * 0.7; this.vy = (this.vy - k * ny) * 0.7; this.vz = (this.vz - k * nz) * 0.7 + 1.5;
      this.X = pX + nx * 0.8; this.Y = pY + ny * 0.8; this.Z = Math.max(pZ, h(this.X, this.Y) + 1.2); // назад, откуда прилетел (со стены -- не на её верх) this.hold = Math.max(this.hold, this.Z + 4);
      this.pv = (this.pv || 0) + (Math.random() - 0.5) * imp * 0.12; this.rv = (this.rv || 0) + (Math.random() - 0.5) * imp * 0.16; }
  }
}
// потолок висения вне влияния земли при массе m, кг: где T0*sigma = m
export const hoverCeiling = (m) => { let lo = 0, hi = 9000; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (MI8.T0 * sigma(mid) > m) lo = mid; else hi = mid; } return lo; };
