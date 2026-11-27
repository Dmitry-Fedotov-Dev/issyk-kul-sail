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
// Управление -- аркадное, но с массой (переделано целиком: прежняя схема урезала наклон по запасу мощности, и на 5-6 км
// машина «висела», хотя лётчик давил вперёд; висение тянуло к точке-якорю и залипало):
//  * Ручка вперёд-назад -- желаемое ускорение. Автомат наклоняет машину (тангаж -- пружина ~0.3 с), ускорение даёт уже
//    сам наклон: сначала клюёт нос, потом идёт разгон. Отпустил -- нос выравнивается, машина катится, сопротивление
//    гасит скорость за десятки секунд. На себя -- задирает нос и тормозит.
//  * Ручка вбок -- поворот (курс). На месте -- разворот на педалях, на скорости -- вираж с креном; скорость догоняет нос
//    не сразу (занос: «сцепление» с воздухом растёт со скоростью). Нос и вектор движения -- разные вещи, это видно в HUD.
//  * Q / E (strafe) -- боковое смещение креном, для точного висения над людьми.
//  * Висение -- отдельный режим: ручка отпущена на малой скорости -- автомат гасит путевую скорость и с запаздыванием
//    «учится» держать наклон против ветра (интеграл). Сила автомата ограничена: слабый ветер он парирует сам,
//    сильный -- сносит, и лётчик держит место ручкой.
//  * Шаг-газ (▲ ▼ / Пробел, Shift) -- вертикальная скорость; отпустил -- держит высоту, если хватает мощности.
//    Мощность здесь решает только вертикаль: высоко и тяжело -- медленный набор, выше потолка -- проседает.
//    На скорости 15-25 м/с косая обдувка добавляет тяги -- в горах набирать высоту лучше с разгона.
//  * Удар о склон -- отскок и повреждение корпуса (hp), авария -- если корпус кончился или удар слишком сильный.
// Мир: X -- восток, Y -- север, Z -- вверх (над озером Иссык-Куль, 1607 м). Ветер -- {x, y, z} м/с.
export const MI8 = {
  empty: 7100, fuel: 1200, crew: 270,             // кг: спасательная комплектация (облегчена, топливо на вылет): потолок висения ~6 км, на 5200 м -- впритык
  T0: 16600,                                       // тяга у моря на взлётном режиме, кгс: висение 11.1 т -- до ~4000 м
  D: 21.3,                                         // диаметр несущего винта, м
  Vmax: 72, Vcr: 64,                               // м/с: 260 и 230 км/ч
  aMax: 6.2,                                       // м/с², ускорение от полного наклона вперёд: 0 -> 200 км/ч за ~11 с
  cdq: 0.0012, cdl: 0.075,                         // сопротивление: квадратичное (предел ~260 км/ч) и малое линейное (на месте)
  tiltMax: 0.4, bankMax: 0.62,                     // рад: наклон до 23°, крен до 35°
  yawHover: 1.3, yawFast: 0.62,                    // рад/с: разворот на месте и на полной скорости
  grip: 1.3,                                       // 1/с: как быстро скорость догоняет нос на скорости (занос)
  assist: 1.8,                                     // м/с², предел автомата висения: ветер сильнее ~18 м/с он уже не держит
  tau: 0.3,                                        // с -- запаздывание ориентации: масса чувствуется, но отвечает сразу
};
const g = 9.81, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const sigma = (asl) => Math.pow(Math.max(0.05, 1 - 2.2558e-5 * asl), 4.2559); // плотность по МСА (доля от уровня моря)

export class Heli {
  constructor() { this.reset(0, 0, 0, 0); this.load = 0; }
  // th -- курс (0 -- север, по часовой)
  reset(X, Y, Z, th, ground = true) {
    Object.assign(this, { holdA: null, prec: 0, anc: null, iF: 0, iS: 0, pv: 0, sv: 0, rollS: 0, bank: 0, jolt: 0, hov: 0, slip: 0, assistA: 0, overT: 0, dem: 0, ax: 0, ay: 0, hp: 100, hit: null, cr: 0, heat: 0, hot: 0, crOn: false, floor: -1e9, gpws: false, X, Y, Z, th, vx: 0, vy: 0, vz: 0, pitch: 0, roll: 0, yr: 0, col: ground ? 0 : 0.85, rpm: 1, T: 0, Tmax: 0, power: 0, ground, crash: null,
      vrs: 0, ige: 0, etl: 0, agl: 0, sig: 1, t: 0, fuel: MI8.fuel, warn: '', shake: 0, touch: null, hold: Z, tb: 0 });
    if (!ground) { this.hold = Z; } return this; }
  get mass() { return MI8.empty + MI8.crew + this.fuel + this.load; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  // ctl: { fwd -1..1 (вперёд), side -1..1 (поворот вправо), strafe -1..1 (вбок вправо), up -1..1 (шаг-газ) }; h(X, Y) -- рельеф над озером; wind(X, Y, Z) -> {x, y, z}
  step(dt, ctl, h, wind = null) {
    const P = MI8, m = this.mass; this.t += dt; if (this.crash) return;
    const gz = Math.max(h(this.X, this.Y), -1), asl = this.Z + 1607, sig = sigma(asl); this.sig = sig; this.agl = this.Z - gz;
    const w = wind ? wind(this.X, this.Y, this.Z) : { x: 0, y: 0, z: 0 }, ax = this.vx - w.x, ay = this.vy - w.y, az = this.vz - w.z, Vair = Math.hypot(ax, ay);
    const u = clamp(ctl.fwd || 0, -1, 1), s = clamp(ctl.side || 0, -1, 1), st = clamp(ctl.strafe || 0, -1, 1), up = clamp(ctl.up || 0, -1, 1);
    const Vg = Math.hypot(this.vx, this.vy), fast = sm(5, 35, Vg);
    // точный режим: у земли на малой скорости ручка мягче -- можно подкрасться к склону и встать над людьми по метру
    const prec = (1 - sm(40, 100, this.agl)) * (1 - sm(8, 22, Vg)); this.prec = prec;
    // ---- курс: разворот на месте быстрый, на скорости -- плавный вираж; рысканье с инерцией ----
    const yrT = this.ground ? 0 : s * (P.yawHover + (P.yawFast - P.yawHover) * fast) * (1 - 0.45 * prec);
    this.yr += (yrT - this.yr) * Math.min(1, dt * 3.2); this.th += this.yr * dt;
    const fx = Math.sin(this.th), fy = Math.cos(this.th); // нос; правый борт -- (fy, -fx)
    const vf = this.vx * fx + this.vy * fy, vs = this.vx * fy - this.vy * fx;
    // ---- желаемое ускорение (по носу и вбок): лётчик + автомат висения ----
    const free = Math.abs(u) < 0.05 && Math.abs(st) < 0.05;
    let dF = u * P.aMax * (u < 0 ? 1.1 : 1) * (1 - 0.5 * prec), dS = st * P.aMax * 0.55 * (1 - 0.4 * prec);
    // точное зависание (у людей): ручка задаёт путевую скорость в мире (ctl.pvx, ctl.pvy -- по экрану, до ~5 м/с), автомат её
    // выдерживает с интегралом против ветра; сам автомат сильнее обычного висения (×2), но не всесилен -- шквал сносит, а ручка добавляет
    // полный наклон машины: лётчик парирует порыв сам (контроль у игрока, а не «автомат за меня»)
    if (ctl.pvx !== undefined && !this.ground) { const evx = ctl.pvx - this.vx, evy = ctl.pvy - this.vy; this.ipx = clamp((this.ipx || 0) + evx * dt * 0.7, -4, 4); this.ipy = clamp((this.ipy || 0) + evy * dt * 0.7, -4, 4);
      let ax = evx * 1.5 + this.ipx * 0.9, ay = evy * 1.5 + this.ipy * 0.9; const A = Math.hypot(ax, ay), cap = Math.hypot(ctl.pvx, ctl.pvy) > 0.5 ? P.aMax : P.assist * 2; if (A > cap) { ax *= cap / A; ay *= cap / A; } // сам -- до ~25 м/с ветра; ручка (против ветра) -- полный наклон
      dF = ax * fx + ay * fy; dS = ax * fy - ay * fx; this.hov = 1; this.assistA = Math.min(A, cap); this.iF *= 0.9; this.iS *= 0.9; }
    else { this.ipx = (this.ipx || 0) * 0.95; this.ipy = (this.ipy || 0) * 0.95; }
    // висение: ручка отпущена на малой скорости -- гасим путевую скорость; интеграл «запоминает» наклон против ветра
    const hov = ctl.pvx === undefined && free && !this.ground ? 1 - sm(9, 15, Vg) : 0; if (ctl.pvx === undefined) this.hov = hov;
    if (hov > 0) { this.iF = clamp(this.iF + vf * dt * 0.5 * hov, -4, 4); this.iS = clamp(this.iS + vs * dt * 0.5 * hov, -4, 4);
      let aF = -(vf * 0.9 + this.iF * 0.8) * hov, aS = -(vs * 0.9 + this.iS * 0.8) * hov; const A = Math.hypot(aF, aS), k = A > P.assist ? P.assist / A : 1; dF += aF * k; dS += aS * k; this.assistA = A * k; }
    else { const k = Math.max(0, 1 - dt * 1.2); this.iF *= k; this.iS *= k; this.assistA = 0; }
    // отпустил ручку на скорости -- лёгкое подтормаживание задиранием носа (иначе катится вечно)
    if (free && !hov && ctl.pvx === undefined) dF -= clamp(vf * 0.006, -0.3, 0.35);
    // ---- ориентация: целевой наклон из желаемого ускорения, плюс крен виража ----
    const K = Math.tan(P.tiltMax) / P.aMax; // перевод ускорения в наклон: полный наклон -- aMax
    const pT = -Math.atan(dF * K), rS = Math.atan(dS * K);
    const bank = clamp(Math.atan(Math.max(0, vf) * this.yr / g) * 0.95, -P.bankMax, P.bankMax);
    const om = 1.9 / P.tau, ze = 0.72;
    this.pv += ((clamp(pT, -P.tiltMax * 1.1, P.tiltMax * 1.1) - this.pitch) * om * om - 2 * ze * om * this.pv) * dt; this.pitch += this.pv * dt;
    this.sv += ((clamp(rS, -P.tiltMax, P.tiltMax) - this.rollS) * om * om - 2 * ze * om * this.sv) * dt; this.rollS += this.sv * dt;
    this.bank += (bank - this.bank) * Math.min(1, dt * 3);
    // порыв сбоку -- машину дёргает креном (видимый толчок)
    if (w.gx !== undefined) { const gl = w.gx * fy - w.gy * fx; this.jolt = clamp((this.jolt || 0) + (gl - (this.glP ?? gl)) * 0.04, -0.25, 0.25); this.glP = gl; }
    this.jolt = (this.jolt || 0) * Math.max(0, 1 - dt * 2.5);
    this.roll = clamp(this.rollS + this.bank + this.jolt, -P.bankMax - 0.1, P.bankMax + 0.1);
    // ---- тяга: что может винт здесь и сейчас (решает вертикаль) ----
    const D = P.D, ige = this.agl < D ? 0.18 * Math.exp(-Math.max(0, this.agl) / (0.45 * D)) : 0;                      // влияние земли
    const etl = 0.16 * sm(8, 22, Vair) - 0.10 * sm(55, 75, Vair);                                                        // косая обдувка
    const vrs = sm(4.5, 8, -az) * (1 - sm(9, 16, Vair)) * sm(0.35, 0.7, this.col); this.vrs += (vrs - this.vrs) * Math.min(1, dt * 1.5); // вихревое кольцо
    // ЧР -- чрезвычайный режим двигателей: ▲ до упора на пределе мощности -- +12% тяги, но перегрев (15 с -- минус 20%)
    const wantCR = up > 0.6 && (this.col > 0.97 || this.ground) && this.hot <= 0; this.crOn = wantCR; this.cr += ((wantCR ? 1 : 0) - this.cr) * Math.min(1, dt * 3);
    this.heat = clamp(this.heat + (wantCR ? dt / 9 : -dt / 14), 0, 1); if (this.heat >= 1 && this.hot <= 0) { this.hot = 15; this.heatHit = true; } this.hot = Math.max(0, this.hot - dt);
    const Tcap = P.T0 * g * sig * (1 + ige + etl) * (1 - 0.42 * this.vrs) * (1 + 0.12 * this.cr) * (this.hot > 0 ? 0.8 : 1) * (0.93 + 0.07 * this.rpm);
    this.ige = ige; this.etl = etl;
    const cz = Math.cos(this.pitch) * Math.cos(this.rollS + this.bank);
    // высота: ниже 250 м над рельефом автомат держит высоту НАД ЗЕМЛЁЙ (как по радиовысотомеру) и смотрит вперёд по курсу на 1-3 с --
    // вдоль склона и над моренами машина сама поднимается перед бугром; выше -- держит отметку (барометрически)
    if (Math.abs(up) > 0.05) { this.hold = this.Z; this.holdA = this.agl; } else if (this.holdA !== null && this.agl > 320) this.holdA = null; else if (this.holdA === null && this.agl < 250 && Math.abs(this.vz) < 1.5) this.holdA = this.agl;
    let zHold = this.hold;
    if (this.holdA !== null && !this.ground) { let gA = gz; if (Vg > 3) for (const t of [0.8, 1.6, 2.6]) gA = Math.max(gA, h(this.X + this.vx * t, this.Y + this.vy * t)); zHold = gA + Math.max(2, this.holdA); this.hold = zHold; }
    // ЗЕМЛЯ!: рельеф по курсу на 2-6 с выше, чем машина успеет подняться (автомат над рельефом тянет вверх сам -- кричим, только если не успеет)
    this.gpws = false; { const cm = this.holdA !== null && up >= 0 ? clamp((Tcap * cz / m - g) * 2.2, 1.2, 9) * 0.8 : Math.min(this.vz, 0); if (Vg > 10 && !this.ground) for (const t of [2, 4, 6]) if (h(this.X + this.vx * t, this.Y + this.vy * t) > this.Z + cm * t - 12) { this.gpws = true; break; } }
    const azMax = Tcap * cz / m - g, climbMax = clamp(azMax * 2.2, 1.2, 9);
    const vzT = Math.abs(up) > 0.05 ? (up > 0 ? up * climbMax : up * Math.min(9, 1.5 + Math.max(0, this.agl) * 0.12)) : clamp((zHold - this.Z) * 0.7, -4, zHold > this.Z + 15 ? 9 : 4);
    let azW = clamp((vzT - this.vz) * 1.8, -6, 6); const azC = Math.min(azW, azMax); // выше, чем может винт, -- нельзя
    const Treq = m * (g + azW) / Math.max(0.5, cz), demand = Treq / Tcap; this.dem = demand;
    this.col += (clamp(demand, 0, 1) - this.col) * Math.min(1, dt * 2.5);
    // долго тянуть шаг сверх возможного -- обороты проседают (звук), тяги чуть меньше
    this.overT = up > 0.6 && demand > 1.15 ? this.overT + dt : Math.max(0, this.overT - dt * 2);
    const over = clamp((this.overT - 3) / 2, 0, 1); this.rpm += ((1 - over * 0.07) - this.rpm) * Math.min(1, dt * 1.2); this.rpm = clamp(this.rpm, 0.85, 1);
    this.T = Math.min(Treq, Tcap); this.Tmax = Tcap; this.power = this.col;
    this.warn = this.hot > 0 ? 'hot' : this.rpm < 0.96 ? 'rpm' : this.vrs > 0.4 ? 'vrs' : demand > 1.0 && !this.ground && azW > 0 ? 'power' : '';
    // ---- силы по горизонтали: ускорение даёт фактический наклон (с запаздыванием пружины) ----
    const aF = -Math.tan(this.pitch) / K, aSd = Math.tan(this.rollS) / K;
    const pw = clamp(0.75 + 0.25 * Tcap / (m * g), 0.75, 1.05); // высоко и тяжело -- разгон чуть вялее
    let axx = (aF * fx + aSd * fy) * pw, ayy = (aF * fy - aSd * fx) * pw;
    // сопротивление -- по воздушной скорости (ветер сносит)
    const dq = P.cdq * Math.sqrt(sig) * Vair + P.cdl * (1 - 0.85 * sm(6, 25, Vg)); axx -= dq * ax; ayy -= dq * ay;
    // «сцепление» с воздухом на скорости: боковое скольжение относительно воздуха переходит в путевую скорость по носу (вираж, занос)
    // поворачиваем вектор воздушной скорости к носу (модуль почти сохраняется, на резком вираже чуть теряется) -- только в движении
    const asd = ax * fy - ay * fx, afd = ax * fx + ay * fy; this.slip = Math.atan2(asd, Math.max(1, Math.abs(afd))); // угол скольжения: нос и движение -- в разные стороны
    const gr = P.grip * sm(8, 30, Vg) * sm(8, 30, Vair);
    if (gr > 0 && afd > 0) { const da = Math.atan2(asd, afd) * Math.min(1, gr * dt), c = Math.cos(da), sn = Math.sin(da), keep = 1 - Math.abs(da) * 0.12;
      const nx = (ax * c - ay * sn) * keep, ny = (ax * sn + ay * c) * keep; axx += (nx - ax) / dt; ayy += (ny - ay) / dt; }
    let azz = azC - 0.01 * sig * az * Math.abs(az) * 4;
    // болтанка: толчки от ветра у гребней (w.tb -- сила)
    if (w.tb) { this.tbT = (this.tbT || 0) - dt; if (this.tbT <= 0) { this.tbT = 0.15 + Math.random() * 0.4; this.tbA = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; }
      axx += this.tbA[0] * w.tb * 5; ayy += this.tbA[1] * w.tb * 5; azz += this.tbA[2] * w.tb * 7; this.tb = w.tb; } else this.tb = 0;
    // порыв толкает машину сильнее, чем ровный ветер (сопротивление фюзеляжа резкому изменению потока)
    if (w.gx !== undefined) { axx += w.gx * 0.08; ayy += w.gy * 0.08; }
    this.shake = Math.max(this.vrs * 0.8, this.tb * 0.6, over * 0.6, sm(60, 75, Vair) * 0.3);
    this.ax = axx; this.ay = ayy;
    this.vx += axx * dt; this.vy += ayy * dt; this.vz += azz * dt;
    // ---- земля ----
    if (this.ground) { this.vx *= Math.max(0, 1 - dt * 4); this.vy *= Math.max(0, 1 - dt * 4); if (this.vz < 0) this.vz = 0; this.Z = gz; this.pitch *= 0.9; this.rollS *= 0.9; this.bank *= 0.9; this.roll = this.rollS + this.bank;
      if (up > 0.05 && azMax > 0.3) { this.ground = false; this.hold = this.Z + 3; this.vz = 0.5; } return; }
    const pX = this.X, pY = this.Y, pZ = this.Z; this.X += this.vx * dt; this.Y += this.vy * dt; this.Z += this.vz * dt;
    const g2 = Math.max(h(this.X, this.Y), -1); this.agl = this.Z - g2;
    if (this.agl <= 0) { const ex = (h(this.X + 5, this.Y) - h(this.X - 5, this.Y)) / 10, ey = (h(this.X, this.Y + 5) - h(this.X, this.Y - 5)) / 10, slope = Math.hypot(ex, ey);
      const nl = Math.hypot(ex, ey, 1), nx = -ex / nl, ny = -ey / nl, nz = 1 / nl, vn = this.vx * nx + this.vy * ny + this.vz * nz, hard = -this.vz, side = Math.hypot(this.vx, this.vy);
      this.Z = g2;
      if (h(this.X, this.Y) < 0) { this.crash = { water: true, vz: hard }; return; }
      if (hard <= 4.5 && side <= 9 && slope <= 0.28 && Math.abs(this.roll) <= 0.35) { this.touch = { vz: hard, V: side, slope }; this.ground = true; this.vz = 0; this.hold = this.Z; this.iF = this.iS = 0; return; }
      // удар: отскок от склона, повреждение по силе удара (вдоль нормали полностью, вскользь -- на треть)
      const tang = Math.sqrt(Math.max(0, this.vx * this.vx + this.vy * this.vy + this.vz * this.vz - vn * vn)), imp = Math.max(0, -vn) + 0.3 * tang, dmg = imp > 3.5 ? clamp((imp - 3) * 4, 4, 100) : 0;
      if (dmg) { this.hp -= dmg; this.hit = { dmg, imp }; } this.iF = 0; this.iS = 0;
      if (this.hp <= 0 || imp > 24) { this.hp = Math.max(0, this.hp); this.crash = { vz: hard, V: side, slope }; return; }
      const k = (1.35) * Math.min(0, vn); this.vx = (this.vx - k * nx) * 0.7; this.vy = (this.vy - k * ny) * 0.7; this.vz = (this.vz - k * nz) * 0.7 + 1.5;
      this.X = pX + nx * 0.8; this.Y = pY + ny * 0.8; this.Z = Math.max(pZ, h(this.X, this.Y) + 1.2); this.hold = Math.max(this.hold, this.Z + 4); // назад, откуда прилетел (со стены -- не на её верх)
      this.pv += (Math.random() - 0.5) * imp * 0.12; this.sv += (Math.random() - 0.5) * imp * 0.16; }
  }
}
// потолок висения вне влияния земли при массе m, кг: где T0*sigma = m
export const hoverCeiling = (m) => { let lo = 0, hi = 9000; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (MI8.T0 * sigma(mid) > m) lo = mid; else hi = mid; } return lo; };
