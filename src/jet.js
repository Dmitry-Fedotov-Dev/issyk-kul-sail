// Як-130 -- учебно-боевой самолёт, на нём учат будущих лётчиков-истребителей (Армавир, Борисоглебск).
// Физика -- точечная масса с ориентацией (базис: f -- вектор скорости, u -- «вверх» кабины, r -- правое крыло).
// Это даёт настоящую петлю, бочку, боевой разворот без особых случаев. Мир: X -- восток, Y -- север, Z -- вверх.
//
// Философия управления та же, что у яхты («паруса подбирает экипаж»): лётчик задаёт намерение, рутину делает
// автоматика, как у настоящей СДУ Як-130:
//  * ← → -- крен. Отпустил -- самолёт сам выводит в горизонт крыла (кроме случая, когда тянешь ручку -- петля
//    не должна разваливаться на вершине).
//  * ↓ -- ручку на себя (перегрузка, нос вверх), ↑ -- от себя. Отпустил -- автомат держит угол наклона траектории,
//    а в крене сам добирает перегрузку на координированный вираж -- высота в развороте не теряется.
//  * Тягу держит автомат (650 км/ч). Пробел -- «максимал», Shift -- малый газ и щитки.
//  * Ограничитель перегрузки (+8/-3) и сваливания -- ручку «до упора» тянуть безопасно, но скорость тает.
export const YAK = {
  m: 7250, Vs: 52, Vr: 58, Vmax: 295, nMax: 8, nMin: -3, // сваливание ~190 км/ч, отрыв ~210, максимум ~1060
  T: 6.9,          // тяга на максимале, м/с^2 (две АИ-222-25 по 2500 кгс)
  cd: 6.9 / (295 * 295), ki: 8000, // сопротивление: вредное ~V^2, индуктивное ~n^2/V^2 -- в глубоком вираже скорость тает
  roll: 3.2,       // предельная угловая скорость крена, рад/с
  cruise: 180,     // автомат тяги: 650 км/ч
};
const g = 9.81, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v); return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)]; };
const W = [0, 0, 1];

export class Jet {
  constructor() { this.reset(0, 0, 0, 0, 'ground'); }
  // th -- курс (0 -- на север, по часовой), mode: 'ground' (на полосе) или 'air'
  reset(X, Y, Z, th, mode = 'ground', V = 0) {
    Object.assign(this, { X, Y, Z, V, mode, thr: 0, n: 1, gear: mode === 'ground', brake: false, max: false, t: 0, stall: false, pull: false, gpws: false, nPeak: 0, onRwy: mode === 'ground' });
    this.f = [Math.sin(th), Math.cos(th), 0]; this.u = [0, 0, 1]; this.r = cross(this.f, this.u);
  }
  get th() { return Math.atan2(this.f[0], this.f[1]); }                       // курс
  get gamma() { return Math.asin(clamp(this.f[2], -1, 1)); }                  // наклон траектории
  get phi() { return Math.atan2(-dot(this.r, W), dot(this.u, W)); }
  get vz() { return this.V * this.f[2]; }
  get mach() { return this.V / 335; }
  // ctl: { roll -1..1, pitch -1..1 (+ на себя), max, brake, auto: {Vset, gear} }; h(X,Y) -- рельеф; rwy(X,Y) -- на полосе ли
  step(dt, ctl, h, rwy = () => false) {
    const P = YAK; this.t += dt; const roll = clamp(ctl.roll || 0, -1, 1), pitch = clamp(ctl.pitch || 0, -1, 1);
    this.max = !!ctl.max; this.brake = !!ctl.brake;
    // тяга: максимал -- кнопкой, иначе автомат держит скорость; на земле без газа стоим
    const Vset = ctl.Vset || P.cruise, auto = clamp(0.35 + (Vset - this.V) * 0.03, 0.05, 1);
    const thrW = this.brake ? 0.02 : this.max ? 1 : this.mode === 'ground' ? (this.V > 3 || ctl.go ? 1 : 0) : auto;
    this.thr += (thrW - this.thr) * Math.min(1, dt * (thrW > this.thr ? 0.9 : 1.6)); // двигатель раскручивается не мгновенно
    if (this.mode === 'ground') return this.ground(dt, roll, pitch, h, rwy);
    if (this.mode !== 'air') return;
    // ---- в воздухе ----
    const sig = Math.exp(-(this.Z + 1601) / 9500); this.sig = sig; // плотность воздуха: Иссык-Куль -- 1601 м над морем, на 12 км её меньше трети
    const cg = Math.sqrt(Math.max(0, 1 - this.f[2] * this.f[2])), uw = dot(this.u, W);
    // автомат: держит наклон траектории, в крене добирает перегрузку на вираж (до 75° крена)
    let n0 = uw > 0.26 * cg ? (cg * cg) / uw : uw; n0 = clamp(n0, -1, 4);
    // автомат выравнивания: шасси выпущено, до земли меньше 12 м, ручку не трогают -- гасит снижение к касанию ~1 м/с
    if (this.gear && (this.agl ?? 99) < 12 && Math.abs(pitch) < 0.05 && this.f[2] < 0) { const want = -0.8 - (this.agl ?? 0) * 0.15; n0 += clamp((want - this.vz) * 0.25, -0.5, 1.2); }
    // защита по скорости: держать набор, когда скорость тает к сваливанию, автомат не станет -- плавно опустит нос
    if (this.f[2] > 0 && this.V < P.Vs * 1.6 && Math.abs(pitch) < 0.05) n0 -= (P.Vs * 1.6 - this.V) / P.Vs * 1.2 * cg;
    let n = pitch >= 0 ? n0 + pitch * (P.nMax - n0) : n0 + -pitch * (P.nMin - n0);
    const nAero = (this.V / P.Vs) ** 2 * sig / 0.84; this.stall = nAero < Math.abs(n0) * 0.95 && this.V < P.Vs * 1.05; // меньше скорости сваливания -- крыло не держит
    n = clamp(n, -nAero * 0.6, nAero); n = clamp(n, P.nMin, P.nMax); this.n = n; this.nPeak = Math.max(this.nPeak, n); this.pull = pitch > 0.5;
    // крен: ручкой -- до 3.2 рад/с; отпустил -- автомат выводит крылья в горизонт (если не тянешь петлю)
    let p; const phi = this.phi;
    if (Math.abs(roll) > 0.05) p = roll * P.roll; else if (pitch > 0.4 || cg < 0.3) p = 0; else p = clamp(-phi * 2.2, -1.6, 1.6);
    this.u = rot(this.u, this.f, p * dt); this.p = p;
    // силы: тяга и сопротивление -- по скорости, подъёмная -- по u, вес -- вниз
    const ind = P.ki * n * n / Math.max(this.V * this.V * sig / 0.84, 400), drag = P.cd * sig / 0.84 * this.V * this.V * (this.brake ? 2.6 : 1) + ind + (this.gear ? 0.0012 * this.V * this.V * 0.06 : 0);
    const al = P.T * Math.pow(sig / 0.84, 0.7) * this.thr - drag, v = [this.f[0] * this.V, this.f[1] * this.V, this.f[2] * this.V];
    for (let k = 0; k < 3; k++) v[k] += (this.f[k] * al + this.u[k] * n * g - W[k] * g) * dt;
    this.V = Math.hypot(v[0], v[1], v[2]); this.f = norm(v);
    // сваливание: нос опускается сам (флюгер), крылья покачивает
    if (this.stall) { this.f = norm([this.f[0], this.f[1], this.f[2] - dt * 0.6]); }
    this.u = norm(this.u.map((x, k) => x - this.f[k] * dot(this.u, this.f))); this.r = cross(this.f, this.u);
    this.X += v[0] * dt; this.Y += v[1] * dt; this.Z += v[2] * dt;
    // земля: шасси выпущено, снижение мягкое, крылья ровно -- касание; иначе -- столкновение
    const gz = Math.max(h(this.X, this.Y), 0), agl = this.Z - gz; this.agl = agl;
    // СРПБЗ: земля близко по курсу -- «Вывод!»
    const ahead = 6; this.gpws = false; if (this.f[2] < 0.05) { const tz = this.Z + v[2] * ahead, hx = Math.max(h(this.X + v[0] * ahead, this.Y + v[1] * ahead), 0); this.gpws = tz < hx + 30 && agl < 1500; }
    if (agl <= 0) {
      const soft = this.gear && this.vz > -4.5 && Math.abs(phi) < 0.25 && this.f[2] > -0.12 && h(this.X, this.Y) > 0.5;
      if (soft) { this.mode = 'ground'; this.Z = gz; this.f = norm([this.f[0], this.f[1], 0]); this.u = [0, 0, 1]; this.r = cross(this.f, this.u); this.touch = { vz: this.vz, rwy: rwy(this.X, this.Y), V: this.V }; this.onRwy = this.touch.rwy; }
      else { this.mode = 'crash'; this.Z = gz; this.crash = { water: h(this.X, this.Y) < 0, V: this.V }; }
    }
  }
  ground(dt, roll, pitch, h, rwy) {
    const P = YAK, f = this.f, onR = rwy(this.X, this.Y); this.onRwy = onR;
    // разбег: тяга против трения; на малой скорости ← → -- поворот передней стойкой
    const fr = (this.brake || this.thr < 0.1 ? 2.2 : 0.25) + (onR ? 0 : 1.2) + P.cd * this.V * this.V * 2;
    this.V = Math.max(0, this.V + (P.T * this.thr - fr) * dt);
    const steer = roll * clamp(9 / Math.max(this.V, 4), 0.02, 0.6); this.f = norm(rot(f, W, -steer * dt)); this.u = [0, 0, 1]; this.r = cross(this.f, this.u);
    this.X += this.f[0] * this.V * dt; this.Y += this.f[1] * this.V * dt; this.Z = Math.max(h(this.X, this.Y), 0); this.agl = 0; this.n = 1; this.stall = false; this.gpws = false;
    if (h(this.X, this.Y) < -0.3) { this.mode = 'crash'; this.crash = { water: true, V: this.V }; return; } // укатились в воду
    // отрыв: на скорости отрыва ручку на себя
    if (this.V > P.Vr && pitch > 0.2) { this.mode = 'air'; this.f = norm([this.f[0], this.f[1], 0.14]); this.Z += 0.5; this.liftoff = true; }
  }
}
