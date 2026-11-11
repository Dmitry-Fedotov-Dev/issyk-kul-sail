// Снаряды кроме яхты: гребные (каяк, академическая одиночка, SUP) и моторные (гидроцикл, катер).
// Все наследуют Boat, чтобы остальная игра (камера, звук, приборы, столкновения) работала с ними как с яхтой.
// Управление у каждого -- те же три кнопки: влево, вправо, пробел.
import { Boat, clamp, smooth, wrapPi, DEG } from './sim.js';

const GR = 9.81, W = { x: 0, y: 0, speed: 0, dir: 0 }, S1 = { h: 0, sx: 0, sz: 0 };

export const SPECS = {
  kayak: { id: 'kayak', cls: 'paddle', name: 'Каяк', sub: 'морской каяк · гребок по ритму', key: 'опора', hl: 2.3, hbm: 0.3, draft: 0.14, camD: 7, eye: [0, 0.95, 0.75],
    mass: 95, force: 265, drive: 0.42, period: 0.62, recover: 0.12, turn: 1.05, c1: 4, c2: 14, lat: 5.5, yawDamp: 2.4, stab: 34, rollDamp: 7, waveGain: 1.0, capAngle: 58 * DEG, capPhi: 172 * DEG, rightHold: 1.1, rightT: 0.9, windA: 0.5, surf: 0.55 },
  scull: { id: 'scull', cls: 'paddle', name: 'Академическая одиночка', sub: 'скиф · захват, проводка, вынос', key: 'гребок', hl: 3.8, hbm: 0.16, draft: 0.12, camD: 9, eye: [0, 0.85, -0.4],
    mass: 105, force: 520, drive: 0.75, period: 1.9, recover: 0.75, turn: 0.55, c1: 3, c2: 7, lat: 7, yawDamp: 1.6, stab: 26, rollDamp: 6, waveGain: 1.15, capAngle: 34 * DEG, capPhi: 95 * DEG, rightHold: 2.4, rightT: 1.6, windA: 0.45, surf: 0.3 },
  sup: { id: 'sup', cls: 'paddle', name: 'SUP-доска', sub: 'стоя с веслом · держи баланс', key: 'стойка', hl: 1.6, hbm: 0.4, draft: 0.2, camD: 6.5, eye: [0, 1.65, 0.3],
    mass: 95, force: 150, drive: 0.5, period: 0.9, recover: 0.15, turn: 0.75, c1: 4, c2: 16, lat: 4, yawDamp: 2.0, stab: 11, rollDamp: 1.5, waveGain: 1.3, capAngle: 27 * DEG, capPhi: 80 * DEG, rightHold: 1.4, rightT: 1.0, windA: 0.75, surf: 0.7 },
  jetski: { id: 'jetski', cls: 'motor', name: 'Гидроцикл', sub: 'без газа не рулится · прыжки', key: 'газ', hl: 1.6, hbm: 0.5, draft: 0.3, camD: 8, eye: [0, 1.35, 0.5],
    mass: 380, thrust: 5200, vmax: 23, d1: 20, d2: 13.8, up0: 5, up1: 9, turn: 1.35, yawTau: 0.22, lat: 3.2, lean: 0.55, needThr: 1, windA: 0.6 },
  boat: { id: 'boat', cls: 'motor', name: 'Моторный катер', sub: 'подвесной мотор · выход на глиссер', key: 'газ', hl: 2.9, hbm: 1.0, draft: 0.45, camD: 11, eye: [-0.35, 1.55, 0.7],
    mass: 1100, thrust: 8200, vmax: 18, d1: 40, d2: 35.6, up0: 6, up1: 10, turn: 0.85, yawTau: 0.4, lat: 4.5, lean: 0.3, needThr: 0, windA: 1.6 },
};
export const CRAFT_ORDER = ['yacht', 'kayak', 'scull', 'sup', 'jetski', 'boat'];
export const YACHT_INFO = { id: 'yacht', name: 'Яхта', sub: 'килевой шлюп · ветер и крен', key: 'шкот' };

// течение (для реки): главный модуль подставляет сюда функцию (X, Y, out) -> скорость воды
export const flow = { at: null, surf: null, rough: null };
const CU = { x: 0, y: 0 };

class Craft extends Boat {
  constructor(spec) { super(); this.spec = spec; this.kind = spec.id; this.hl = spec.hl; this.hbm = spec.hbm; this.camD = spec.camD; this.eye = spec.eye; this.reset(0, 0, 0); }
  reset(X, Y, th) {
    super.reset(X, Y, th);
    Object.assign(this, { st: null, tSince: 9, endT: 9, prevL: false, prevR: false, prevB: false, streak: 0, cadence: 0, strokes: 0, lastQ: 0, brace: 0, lastSide: 'R', powerN: 0,
      thr: 0, pl: 0, air: false, airT: 0, vyy: 0, poseT: undefined, dist: 0, cx: 0, cy: 0 });
  }
  // поза на волне; у моторных -- ещё и отрыв от гребня
  updatePose(waves, t, terrainH) {
    const fx = Math.sin(this.th), fz = -Math.cos(this.th), rx = Math.cos(this.th), rz = Math.sin(this.th), a = this.hl * 0.85, c = this.hbm;
    if (flow.surf) { // река: уровень воды задаёт русло, а не волны озера
      const ty = flow.surf(this.X, this.Y), yb = flow.surf(this.X + fx * a, this.Y - fz * a), ys = flow.surf(this.X - fx * a, this.Y + fz * a);
      this.base = ty; this.att = 1; this.depth = 2; this.slopeF = 0; this.slopeR = 0; this.y += (ty - this.y) * 0.6; this.pitch += (Math.atan2(yb - ys, 2 * a) - this.pitch) * 0.4; this.poseT = t; return; }
    this.base = 0;
    const x = this.X, z = -this.Y, depth = terrainH ? -terrainH(this.X, this.Y) : 50, att = this.att = smooth(0.2, 5, depth); this.depth = depth;
    const hb = waves.sample(x + fx * a, z + fz * a, t, att, S1).h, hs = waves.sample(x - fx * a, z - fz * a, t, att, S1).h;
    const hr = waves.sample(x + rx * c, z + rz * c, t, att, S1).h, hl = waves.sample(x - rx * c, z - rz * c, t, att, S1).h;
    const ty = (hb + hs + hr + hl) / 4, tp = Math.atan2(hb - hs, 2 * a);
    this.slopeF = (hb - hs) / (2 * a); this.slopeR = (hr - hl) / (2 * c);
    const dt = clamp(t - (this.poseT ?? t), 0, 0.1); this.poseT = t;
    if (this.spec.cls !== 'motor' || dt <= 0) { this.y += (ty - this.y) * 0.5; this.pitch += (tp - this.pitch) * 0.4; return; }
    if (this.air) { this.vyy -= GR * dt; this.y += this.vyy * dt; this.airT += dt; this.pitch += (0.14 - this.pitch) * Math.min(1, dt * 2);
      if (this.y <= ty) { const imp = Math.max(0, -this.vyy); this.air = false; this.y = ty; this.vyy = 0; const k = 1 - Math.min(0.3, imp * 0.035); this.vx *= k; this.vy *= k;
        this.events.push({ type: 'land', impact: imp, air: this.airT }); } }
    else { const nv = (ty - this.y) / dt;
      if (this.pl > 0.5 && this.vyy > 1.3 && nv < this.vyy - GR * dt * 2.5 && !this.capsized) { this.air = true; this.airT = 0; this.y += this.vyy * dt; this.events.push({ type: 'jump' }); }
      else { this.vyy += (nv - this.vyy) * 0.5; this.y = ty; this.pitch += (tp + this.pl * 0.07 - this.pitch) * 0.4; } }
  }
  pre(wind) {
    wind.at(this.X, this.Y, W);
    if (flow.at) { flow.at(this.X, this.Y, CU); this.cx = CU.x; this.cy = CU.y; } else this.cx = this.cy = 0;
    const fx = Math.sin(this.th), fy = Math.cos(this.th), rx = fy, ry = -fx, ax = W.x - this.vx, ay = W.y - this.vy, aws = Math.hypot(ax, ay) || 1e-6;
    this.awa = Math.atan2(-(ax * rx + ay * ry), -(ax * fx + ay * fy)); this.aws = aws; this.tws = W.speed; this.twd = W.dir; this.twa = wrapPi(W.dir - this.th);
    const wx = this.vx - this.cx, wy = this.vy - this.cy; // скорость относительно воды
    return { fx, fy, rx, ry, u: wx * fx + wy * fy, vs: wx * rx + wy * ry, wf: (ax * fx + ay * fy) * aws, wr: (ax * rx + ay * ry) * aws };
  }
  move(dt, terrainH) {
    this.X += this.vx * dt; this.Y += this.vy * dt; this.dist += Math.hypot(this.vx, this.vy) * dt;
    if (terrainH && -terrainH(this.X, this.Y) < this.spec.draft && !this.air) { this.aground = true; this.agT = 0; this.events.push({ type: 'aground', speed: this.speed }); }
  }
  stepCapsizedC(dt, inp) {
    const S = this.spec, k = Math.exp(-1.8 * dt); this.vx = this.cx + (this.vx - this.cx) * k; this.vy = this.cy + (this.vy - this.cy) * k; this.r *= k; this.powerN = 0; this.st = null; this.thr = 0;
    this.X += this.vx * dt; this.Y += this.vy * dt; const s = Math.sign(this.phi) || 1, cp = S.capPhi || 93 * DEG;
    if (this.righting > 0) { this.righting += dt / (S.rightT || 1.6); this.phi = s * cp * (1 - smooth(0, 1, this.righting)); this.p = 0;
      if (this.righting >= 1) { this.capsized = false; this.righting = 0; this.phi = 0; this.events.push({ type: 'righted' }); } return; }
    this.phi += (s * cp - this.phi) * Math.min(1, 3 * dt); this.p = 0;
    this.rightHold = inp.ease ? this.rightHold + dt / (S.rightHold || 2) : Math.max(0, this.rightHold - dt);
    if (this.rightHold >= 1) { this.righting = 0.001; this.rightHold = 0; }
  }
  stepAgroundC(dt, terrainH) {
    this.agT += dt; this.vx = this.vy = 0; this.r = 0; this.powerN = 0; this.st = null; this.thr = 0; this.phi *= Math.exp(-2 * dt);
    if (this.agT < 0.8) return;
    const e = 5, gx = terrainH(this.X + e, this.Y) - terrainH(this.X - e, this.Y), gy = terrainH(this.X, this.Y + e) - terrainH(this.X, this.Y - e), n = Math.hypot(gx, gy) || 1, dx = -gx / n, dy = -gy / n;
    this.X += dx * 3 * dt; this.Y += dy * 3 * dt; this.th = wrapPi(this.th + clamp(wrapPi(Math.atan2(dx, dy) - this.th), -1.5 * dt, 1.5 * dt));
    if (-terrainH(this.X, this.Y) > this.spec.draft + 0.6) { this.aground = false; this.events.push({ type: 'refloat' }); }
  }
}

// ---------- гребные ----------
// Гребок -- не «газ», а событие: нажал -- лопасть вошла в воду и тянет drive секунд. Сила гребка зависит от ритма:
// попал в свой темп -- полная, частишь или запаздываешь -- слабее. Левая лопасть разворачивает нос вправо, как в жизни.
export class PaddleCraft extends Craft {
  tryStroke(side, auto) {
    const S = this.spec, ev = this.events;
    if (this.st && this.st.t < this.st.T * 0.8) return; // весло ещё в воде
    let q;
    if (this.endT < S.recover) { // не успел вынести весло
      if (S.id === 'scull') { ev.push({ type: 'crab' }); this.vx *= 0.6; this.vy *= 0.6; this.p += (Math.random() < 0.5 ? -1 : 1) * 1.6; this.streak = 0; this.endT = -0.6; return; } // «поймал краба»
      q = 0.35;
    } else if (auto) q = 0.6;
    else q = this.strokes ? 0.55 + 0.45 * Math.exp(-(((this.tSince - S.period) / (0.28 * S.period)) ** 2)) : 0.8;
    if (this.strokes && this.tSince < 4) this.cadence += (60 / Math.max(this.tSince, 0.2) - this.cadence) * 0.35;
    this.streak = q > 0.9 ? this.streak + 1 : 0; this.lastQ = q; this.strokes++; this.tSince = 0;
    if (side !== 'B') { this.alt = this.lastSide !== side ? (this.alt || 0) + 1 : 0; this.lastSide = side; }
    this.st = { side, t: 0, T: S.drive * (side === 'B' || S.id !== 'scull' ? 1 : 0.8), q };
    ev.push({ type: 'stroke', q, side, streak: this.streak, alt: this.alt || 0 });
  }
  step(dt, inp, wind, terrainH) {
    const S = this.spec, c = this.pre(wind);
    if (this.capsized) return this.stepCapsizedC(dt, inp);
    if (this.aground) return this.stepAgroundC(dt, terrainH);
    this.tSince += dt; this.endT += dt;
    const sc = S.id === 'scull', L = !!inp.left, R = !!inp.right, B = sc && !!inp.ease;
    if (L && !this.prevL) this.tryStroke('L'); else if (R && !this.prevR) this.tryStroke('R'); else if (B && !this.prevB) this.tryStroke('B');
    else if (!this.st && this.tSince > S.period * 1.3) { if (B) this.tryStroke('B', true); else if (L && R) this.tryStroke(this.lastSide === 'L' ? 'R' : 'L', true); else if (L) this.tryStroke('L', true); else if (R) this.tryStroke('R', true); }
    this.prevL = L; this.prevR = R; this.prevB = B;
    this.brace += clamp((!sc && inp.ease ? 1 : 0) - this.brace, -dt * 4, dt * 5); // каяк: опора на весло; SUP: присесть
    let F = 0, yaw = 0, kick = 0;
    if (this.st) { const s = this.st; s.t += dt; const w = Math.sin(Math.PI * Math.min(1, s.t / s.T)), sg = s.side === 'L' ? 1 : s.side === 'R' ? -1 : 0;
      F = S.force * s.q * w * (s.side === 'B' ? 1 : sc ? 0.5 : 1) * (1 - 0.4 * this.brace); yaw = sg * S.turn * s.q * w * (sc ? 1.6 : 1); kick = -sg * 0.9 * (1.2 - s.q) * w;
      this.powerN = s.q * w; if (s.t >= s.T) { this.st = null; this.endT = 0; } } else this.powerN = 0;
    if (flow.rough) kick += (Math.sin(this.dist * 1.7) + Math.sin(this.dist * 0.63 + 1.3)) * flow.rough(this.X, this.Y) * 2.4; // пороги раскачивают
    const wA = 0.6 * S.windA, au = Math.abs(c.u);
    const aF = (F - S.c1 * c.u - S.c2 * c.u * au * (1 + 0.35 * this.brace) + wA * c.wf) / S.mass - GR * this.slopeF * S.surf * this.att;
    const aR = -S.lat * c.vs + (wA * c.wr) / S.mass;
    this.vx += (c.fx * aF + c.rx * aR) * dt; this.vy += (c.fy * aF + c.ry * aR) * dt;
    this.r += (yaw - S.yawDamp * this.r) * dt; this.th = wrapPi(this.th + this.r * dt);
    // крен: лодка идёт за склоном волны, гребок не в ритм раскачивает, опора держит
    const K = S.stab * (1 + 1.6 * this.brace) * (sc && this.st ? 1.5 : 1), tgt = Math.atan(this.slopeR) * S.waveGain * this.att - this.r * au * 0.05;
    this.p += (-K * (this.phi - tgt) - S.rollDamp * (1 + this.brace) * this.p + kick * S.stab * 0.25) * dt; this.phi += this.p * dt;
    if (Math.abs(this.phi) > S.capAngle) { this.capsized = true; this.rightHold = 0; this.righting = 0; this.events.push({ type: 'capsize', braced: this.brace > 0.5 }); }
    else if (this.brace > 0.6 && Math.abs(this.phi) > S.capAngle * 0.62 && !this.saved) { this.saved = true; this.events.push({ type: 'saved' }); } else if (Math.abs(this.phi) < S.capAngle * 0.3) this.saved = false;
    if (this.slopeF < -0.06 && c.u > Math.sqrt(S.force / S.c2) * 0.95) this.surfT = (this.surfT || 0) + dt; else this.surfT = 0;
    if (this.surfT > 2.5) { this.surfT = -99; this.events.push({ type: 'surf' }); }
    this.u = c.u; this.vs = c.vs; this.move(dt, terrainH);
  }
  status() { const S = this.spec; if (this.capsized) return S.id === 'kayak' ? 'оверкиль' : 'в воде';
    const r = this.lastQ > 0.9 ? 'в ритме' : this.lastQ > 0.7 ? 'почти' : this.strokes ? 'мимо ритма' : ''; return `темп ${Math.round(this.cadence)} · ${r}${this.brace > 0.5 ? (S.id === 'sup' ? ' · присел' : ' · опора') : ''}`; }
}

// ---------- моторные ----------
// Пробел -- газ. До глиссирования корпус «пашет» воду, после -- выходит на редан, и сопротивление падает.
// Гидроцикл рулится только струёй: сбросил газ -- поехал прямо. На гребне на скорости -- отрыв и полёт.
export class MotorCraft extends Craft {
  step(dt, inp, wind, terrainH) {
    const S = this.spec, c = this.pre(wind);
    if (this.capsized) return this.stepCapsizedC(dt, inp);
    if (this.aground) return this.stepAgroundC(dt, terrainH);
    const want = inp.thr !== undefined ? inp.thr : inp.ease ? 1 : 0;
    this.thr += clamp(want - this.thr, -dt / 0.45, dt / 0.35);
    const st = clamp(inp.steer || 0, -1, 1); this.rudder += clamp(st - this.rudder, -5 * dt, 5 * dt);
    const au = Math.abs(c.u), pl = smooth(S.up0, S.up1, c.u), wasPl = this.pl; this.pl = pl;
    if (pl > 0.6 && wasPl <= 0.6) this.events.push({ type: 'plane' });
    const wet = this.air ? 0 : 1;
    const T = S.thrust * this.thr * Math.max(0.2, 1 - 0.35 * c.u / S.vmax) * wet, D = (S.d1 * c.u + S.d2 * c.u * au * (1 - 0.6 * pl)) * wet + 0.6 * S.windA * 0;
    const aF = (T - D + 0.6 * S.windA * c.wf) / S.mass - GR * this.slopeF * 0.3 * wet, aR = -S.lat * (1 - 0.45 * pl * Math.abs(this.rudder)) * c.vs * wet;
    this.vx += (c.fx * aF + c.rx * aR) * dt; this.vy += (c.fy * aF + c.ry * aR) * dt;
    const grip = S.needThr ? 0.1 + 0.9 * this.thr : clamp(au / 5, 0.18, 1) * (0.55 + 0.45 * this.thr);
    const rT = this.rudder * S.turn * grip * Math.min(1, au / 3 + 0.25) * (1 - 0.3 * pl) * wet;
    this.r += ((rT - this.r) / S.yawTau) * dt * (wet ? 1 : 0.1); this.th = wrapPi(this.th + this.r * dt);
    const pt = this.r * au * 0.035 * S.lean / 0.3 + Math.atan(this.slopeR) * 0.7 * (1 - 0.6 * pl) * this.att;
    this.phi += (clamp(pt, -0.9, 0.9) - this.phi) * Math.min(1, dt * 5); this.powerN = this.thr;
    this.u = c.u; this.vs = c.vs; this.move(dt, terrainH);
  }
  // жёсткое приводнение боком сбрасывает с гидроцикла
  afterLand(ev) { if (this.spec.id === 'jetski' && (ev.impact > 8.5 || (ev.impact > 5 && Math.abs(this.phi) > 0.45))) { this.capsized = true; this.rightHold = 0; this.righting = 0; this.phi = (Math.sign(this.phi) || 1) * 0.5; this.events.push({ type: 'capsize' }); } }
  status() { if (this.capsized) return 'за бортом'; if (this.air) return 'в воздухе'; return (this.pl > 0.6 ? 'на глиссере' : this.u > 1 ? 'водоизмещающий ход' : 'малый ход') + ` · газ ${Math.round(this.thr * 100)}%`; }
}
export const makeCraftBody = (id) => (SPECS[id].cls === 'motor' ? new MotorCraft(SPECS[id]) : new PaddleCraft(SPECS[id]));

// ---------- автоматы ----------
export function aiPaddle(b, tx, ty, st, dt, skill = 1) {
  const S = b.spec, err = wrapPi(Math.atan2(tx - b.X, ty - b.Y) - b.th), out = { left: false, right: false, ease: false, steer: 0 };
  if (b.capsized) { out.ease = true; return out; }
  st.t = (st.t ?? S.period) + dt; st.hold = (st.hold || 0) - dt;
  if (st.hold > 0) { out[st.key] = true; return out; }
  if (st.t >= S.period * (st.k || 1)) { st.t = 0; st.k = 1 + (1 - skill) * 0.5 + (Math.random() - 0.5) * 0.12 * (2 - skill); st.hold = 0.07;
    // нос надо увести вправо -- гребём слева
    if (S.id === 'scull') st.key = Math.abs(err) > 0.09 ? (err > 0 ? 'left' : 'right') : 'ease';
    else st.key = Math.abs(err) > 0.14 ? (err > 0 ? 'left' : 'right') : (st.last === 'left' ? 'right' : 'left');
    st.last = st.key; out[st.key] = true; }
  return out;
}
export function aiMotor(b, tx, ty, thrMax = 1) {
  const err = wrapPi(Math.atan2(tx - b.X, ty - b.Y) - b.th), d = Math.hypot(tx - b.X, ty - b.Y);
  return { steer: clamp(err * 2.2, -1, 1), thr: b.capsized ? 0 : thrMax * (Math.abs(err) > 1 ? 0.45 : 1) * (d < 25 ? 0.6 : 1), ease: b.capsized, left: false, right: false };
}

// ---------- достижения: профессиональные термины каждого вида ----------
export const ACH = [
  ['yacht', 'tack', 'Оверштаг', 'Поворот носом через ветер'], ['yacht', 'gybe', 'Фордевинд', 'Поворот кормой через ветер без удара гика'],
  ['yacht', 'speed', 'Пять узлов', 'Разогнать яхту до 5 узлов'], ['yacht', 'ease', 'Потравить шкот', 'Сбросить ветер из паруса при крене больше 20°'],
  ['yacht', 'cape', 'Обогнуть мыс', 'Дойти до оконечности мыса'], ['yacht', 'regatta', 'Гонка флота', 'Финишировать в регате'],
  ['kayak', 'k_cadence', 'Каденс', '12 гребков подряд точно в ритм'], ['kayak', 'k_brace', 'Низкая опора', 'Удержаться от оверкиля опорой на весло'],
  ['kayak', 'k_roll', 'Эскимосский переворот', 'Встать после оверкиля, не покидая каяк'], ['kayak', 'k_surf', 'Сёрфинг на попутной', 'Прокатиться на попутной волне'],
  ['kayak', 'k_dist', 'Траверс', 'Пройти километр без оверкиля'], ['kayak', 'k_sprint', 'Спринт 500', 'Финишировать в спринте на 500 метров'],
  ['kayak', 'k_river', 'Сплав', 'Пройти горную реку до финиша'], ['kayak', 'k_clean', 'Чистое прохождение', 'Пройти реку, не коснувшись камней'],
  ['scull', 's_run', 'Захват — проводка — вынос', '8 гребков подряд точно в ритм'], ['scull', 's_rate', 'Темп 32', 'Держать темп не ниже 32 гребков в минуту'],
  ['scull', 's_crab', 'Поймал краба', 'Зацепить весло на выносе (все через это проходят)'], ['scull', 's_2k', 'Двушка', 'Пройти 2000 метров'],
  ['scull', 's_race', 'Финал А', 'Финишировать в гонке на 1000 метров'],
  ['sup', 'p_switch', 'Смена борта', '10 гребков с чередованием бортов'], ['sup', 'p_stance', 'Низкая стойка', 'Устоять на волне, присев'],
  ['sup', 'p_down', 'Даунвинд', 'Пройти 300 метров по ветру'], ['sup', 'p_race', 'Техничная гонка', 'Финишировать в гонке на 200 метров'],
  ['jetski', 'j_plane', 'Выход на глиссирование', 'Разогнаться до режима глиссирования'], ['jetski', 'j_jump', 'Прыжок', 'Продержаться в воздухе полсекунды'],
  ['jetski', 'j_big', 'Большой воздух', 'Продержаться в воздухе больше секунды'], ['jetski', 'j_slalom', 'Слалом', 'Пройти слалом по буям'],
  ['boat', 'b_plane', 'На редане', 'Вывести катер на глиссирование'], ['boat', 'b_circ', 'Циркуляция', 'Описать полный круг на глиссере'],
  ['boat', 'b_harbor', 'Малый ход в гавани', 'Пройти у причала не быстрее 5 узлов'], ['boat', 'b_slalom', 'Фигурное вождение', 'Пройти слалом по буям'],
  ['law', 'l_stop', 'Законопослушный', 'Остановиться по требованию береговой милиции'], ['law', 'l_run', 'Ушёл от погони', 'Оторваться от катера милиции'],
  ['law', 'l_bust', 'Протокол', 'Быть задержанным'], ['law', 'l_ram', 'Навал', 'Столкнуться с катером милиции'],
  ['map', 'm_peak', 'Альпинист поневоле', 'Спустить судно на воду с горы'],
];
