// Жизнь акватории: гребцы и катера (на той же физике, что у игрока, с автоматом вместо рук), туристический пароход,
// промысловое судно и катер береговой милиции. Здесь же правила: нарушения, розыск, погоня, штраф или уход.
import { clamp, wrapPi } from './sim.js';
import { makeCraftBody, aiPaddle, aiMotor, SPECS } from './crafts.js';
import { MODEL, makeMotorboat, makeSteamer, makeFishing } from './craftmodels.js';
import { makeWake } from './fx.js';

const WS = { h: 0, sx: 0, sz: 0 };
const NAMES = { kayak: 'каяк', scull: 'академическая одиночка', sup: 'SUP', jetski: 'гидроцикл', boat: 'катер', steamer: 'пароход', fishing: 'промысловое судно', police: 'катер милиции' };

export function makeTraffic(scene, ctx) {
  const list = [], law = { stars: 0, t: 0, lost: 0, stopT: 0, near: 0, fines: 0, warn: 0, harborT: 0, harborCool: 0, hitCool: 0, zone: null };
  let center = { X: 0, Y: -600 }, active = false, pier = { X: 0, Y: 0 };
  const water = (X, Y, d = 4) => ctx.h(X, Y) < -d;
  function pick(r0, r1, cx = center.X, cy = center.Y, depth = 4) { for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283, r = r0 + Math.random() * (r1 - r0), X = cx + Math.sin(a) * r, Y = cy + Math.cos(a) * r; if (water(X, Y, depth)) return { X, Y }; } return { X: cx, Y: cy }; }
  function addCraft(id, opts, thrMax) { const b = makeCraftBody(id), model = MODEL[id](opts), wake = SPECS[id].cls === 'motor' ? makeWake(70) : null; scene.add(model.root); if (wake) scene.add(wake.mesh);
    const e = { type: id, phys: true, b, model, wake, ai: {}, R: SPECS[id].hl * 0.9, thrMax, home: null, tgt: null, T: 0 }; list.push(e); return e; }
  function addShip(type, model, o) { const b = { X: 0, Y: 0, th: 0, vx: 0, vy: 0, y: 0, pitch: 0, phi: 0, capsized: false, att: 1, rudder: 0, siren: false, hl: o.R };
    const wake = makeWake(90); scene.add(model.root, wake.mesh); const e = { type, phys: false, b, model, wake, v: 0, R: o.R, turn: o.turn, cruise: o.cruise, acc: o.acc, sway: o.sway, home: null, tgt: null, T: 0, police: type === 'police' }; list.push(e); return e; }
  addCraft('kayak', { hull: 0xf2c21b, pfd: 0xe6452b }); addCraft('kayak', { hull: 0x2f8f5a, pfd: 0xf2c21b, hat: 0xf4f3ee }); addCraft('scull', { deck: 0xe6452b });
  addCraft('sup', { deck: 0xe6652b, pfd: 0x1f6fd0 }); addCraft('sup', { deck: 0x8fd16a, pfd: 0xf2c21b });
  addCraft('boat', { hull: 0xb8392e, seat: 0xf4f3ee }, 0.55); addCraft('boat', { hull: 0x1f4f8f }, 0.4); addCraft('jetski', { deck: 0xe6452b }, 0.6);
  const steamer = addShip('steamer', makeSteamer(), { R: 15, turn: 0.06, cruise: 5.2, acc: 0.25, sway: 0.15 }), fishing = addShip('fishing', makeFishing(), { R: 6.5, turn: 0.12, cruise: 3.2, acc: 0.3, sway: 0.5 });
  const patrols = [addShip('police', makeMotorboat({ police: true }), { R: 4.2, turn: 0.7, cruise: 4.5, acc: 4, sway: 0.8 }), addShip('police', makeMotorboat({ police: true }), { R: 4.2, turn: 0.7, cruise: 4.5, acc: 4, sway: 0.8 })];
  patrols[1].reserve = true;

  function place(e, p, th) { const b = e.b; if (e.phys) b.reset(p.X, p.Y, th); else { b.X = p.X; b.Y = p.Y; b.th = th; b.vx = b.vy = 0; e.v = 0; } e.home = { ...p }; e.tgt = null; e.T = 0; if (e.wake) e.wake.reset(); }
  function relocate(cx, cy, px, py) { center = { X: cx, Y: cy }; pier = { X: px, Y: py };
    for (const e of list) { const far = e.type === 'steamer' ? [1500, 3200] : e.type === 'fishing' ? [900, 2200] : e.type === 'police' ? [350, 700] : e.type === 'sup' || e.type === 'kayak' ? [120, 600] : [300, 1200];
      place(e, pick(far[0], far[1], cx, cy, e.phys ? 3 : 8), Math.random() * 6.283); }
    law.stars = 0; law.t = 0; ctx.setWanted(0, ''); }
  function setActive(v) { active = v; for (const e of list) { if (!v && e.model.dispose) e.model.dispose(); e.model.root.visible = v && !(e.reserve && law.stars < 3); if (e.wake) e.wake.mesh.visible = e.model.root.visible; } if (!v) { ctx.audio.siren(false); ctx.setWanted(0, ''); law.stars = 0; } }
  function offence(n, msg) { const was = law.stars; law.stars = Math.min(3, law.stars + n); if (!was) { law.t = 0; law.lost = 0; law.stopT = 0; law.near = 0; law.seen = false; law.call = true; } ctx.toast(msg); ctx.setWanted(law.stars, 'Береговая милиция: заглушите ход'); }
  function clear(msg) { law.stars = 0; ctx.setWanted(0, ''); ctx.audio.siren(false); ctx.toast(msg); for (const p of patrols) p.b.siren = false; }

  function update(dt, t, P) {
    if (!active) return; const pb = P.b, ps = Math.hypot(pb.vx, pb.vy), peers = ctx.peers ? ctx.peers() : [];
    // кого обходить: игрока и онлайн-игроков рядом -- для акватории это такие же суда, как все
    const others = [{ b: pb, r: (pb.hl || 2.6) }, ...peers.map((p) => ({ b: p.b, r: p.b.hl || 2.6 }))];
    law.hitCool -= dt; law.harborCool -= dt;
    for (const e of list) { const b = e.b; if (!e.model.root.visible) continue; e.T -= dt;
      if (e.police && law.stars > 0) { // погоня: идём в упреждённую точку, вблизи уравниваем ход, чтобы подойти к борту
        const d = Math.hypot(pb.X - b.X, pb.Y - b.Y), lead = Math.min(2.5, d / 18); e.tgt = { X: pb.X + pb.vx * lead, Y: pb.Y + pb.vy * lead };
        const cap = [0, 11.5, 13, 14][law.stars]; e.vt = Math.min(cap, d < 10 ? ps : d < 30 ? Math.max(2.5, ps + 2.5) : cap); // катер (17.5 м/с) и гидроцикл уходят по прямой, гребные и яхта -- нет b.siren = true;
      } else { if (e.police) b.siren = false;
        if (!e.tgt || e.T <= 0 || Math.hypot(e.tgt.X - b.X, e.tgt.Y - b.Y) < (e.phys ? 18 : 60)) { const r = e.type === 'steamer' ? [1200, 3500] : e.type === 'fishing' ? [300, 1500] : e.type === 'sup' ? [60, 350] : [150, 900];
          e.tgt = pick(r[0], r[1], e.home.X, e.home.Y, e.phys ? 3 : 8); e.T = e.type === 'fishing' ? 60 + Math.random() * 60 : 90; e.drift = e.type === 'fishing' && Math.random() < 0.4 ? 25 : 0; }
        e.vt = e.cruise; if (e.drift > 0) { e.drift -= dt; e.vt = 0.4; } } // промысловик ложится в дрейф у сетей
      const hx = Math.sin(b.th), hy = Math.cos(b.th), look = e.phys ? 35 : e.R * 5 + 40;
      if (!water(b.X + hx * look, b.Y + hy * look, e.phys ? 1.5 : 5) && !(e.police && law.stars)) { e.tgt = pick(100, 600, e.home.X, e.home.Y, 6); e.T = 40; }
      // расхождение: чужое судно впереди на сходящемся курсе -- забираем в сторону (по правилам -- вправо), большие ещё и сбавляют ход
      let ax = e.tgt.X, ay = e.tgt.Y; if (!(e.police && law.stars)) { const look2 = e.phys ? 28 : e.R * 4 + 40;
        for (const o of others) { const q = o.b, rx = q.X - b.X, ry = q.Y - b.Y, along = rx * hx + ry * hy, side = rx * hy - ry * hx; // side > 0 -- препятствие справа
          if (along < 0 || along > look2 || Math.abs(side) > e.R + o.r + 6) continue; const dir = side > 0 ? -1 : 1;
          ax = b.X + hx * 30 + hy * dir * 26; ay = b.Y + hy * 30 - hx * dir * 26; if (!e.phys) e.vt = Math.min(e.vt, e.cruise * (0.3 + 0.7 * along / look2)); break; } }
      if (e.phys) { const paddle = b.spec.cls === 'paddle', c = paddle ? aiPaddle(b, ax, ay, e.ai, dt, 0.75) : aiMotor(b, ax, ay, e.thrMax);
        b.updatePose(ctx.waves, t, ctx.h); const n = Math.min(4, Math.max(1, Math.round(dt * 120))); for (let i = 0; i < n; i++) b.step(dt / n, c, ctx.wind, ctx.h);
        for (const ev of b.events) if (ev.type === 'land' && b.afterLand) b.afterLand(ev); b.events.length = 0;
      } else { const err = wrapPi(Math.atan2(ax - b.X, ay - b.Y) - b.th), k = Math.min(1, e.v / 3 + 0.2); b.rudder = clamp(err * 2, -1, 1);
        b.th = wrapPi(b.th + clamp(err, -e.turn * dt, e.turn * dt) * k); e.v += clamp(e.vt * (Math.abs(err) > 1.2 ? 0.5 : 1) - e.v, -e.acc * 1.5 * dt, e.acc * dt);
        b.vx = Math.sin(b.th) * e.v; b.vy = Math.cos(b.th) * e.v; b.X += b.vx * dt; b.Y += b.vy * dt;
        const s = ctx.waves.sample(b.X, -b.Y, t, 1, WS); b.y += (s.h * e.sway - b.y) * 0.2; const fx = Math.sin(b.th), fz = -Math.cos(b.th);
        b.pitch += ((s.sx * fx + s.sz * fz) * e.sway - b.pitch) * 0.1; b.phi += (-(s.sx * fz - s.sz * fx) * e.sway * 0.8 + b.rudder * Math.min(1, e.v / 12) * 0.25 - b.phi) * 0.1; }
      e.model.update(b, dt, t); if (e.wake) e.wake.update(b, dt, t, ctx.waves);
      // столкновение с игроком
      const dx = pb.X - b.X, dy = pb.Y - b.Y, d = Math.hypot(dx, dy), R = e.R + (pb.hl || 3.2) * 0.8;
      if (d < R && d > 0.01) { const nx = dx / d, ny = dy / d, rel = (pb.vx - b.vx) * nx + (pb.vy - b.vy) * ny; pb.X += nx * (R - d); pb.Y += ny * (R - d);
        if (rel < 0) { pb.vx -= rel * nx * 1.4; pb.vy -= rel * ny * 1.4; if (e.phys) { b.vx += rel * nx * 0.5; b.vy += rel * ny * 0.5; } }
        if (ctx.onBump) ctx.onBump(e, nx, ny, -rel);
        if (-rel > 1.2 && law.hitCool <= 0) { law.hitCool = 3; ctx.onHit(-rel);
          if (e.police) { ctx.ach('l_ram'); offence(2, 'Навал на катер милиции!'); } else offence(1, `Столкновение: ${NAMES[e.type]}. Нарушение правил плавания`); } }
      // онлайн-игроки: толкаем только своё NPC-судно (большие суда не сдвинуть -- у их владельца наших NPC нет)
      if (e.phys) for (const p of peers) { const q = p.b, ex = b.X - q.X, ey = b.Y - q.Y, dd = Math.hypot(ex, ey), RR = e.R + (q.hl ? q.hl * 0.85 : 2.6); if (dd >= RR || dd < 0.01) continue;
        const nx = ex / dd, ny = ey / dd, rel = (b.vx - q.vx) * nx + (b.vy - q.vy) * ny; b.X += nx * (RR - dd); b.Y += ny * (RR - dd); if (rel < 0) { b.vx -= rel * nx * 1.3; b.vy -= rel * ny * 1.3; }
        if (e.type === 'sup' && -rel > 1.1 && ctx.knock) ctx.knock(e, nx, ny, -rel); } }
    // малый ход у причала: моторным не быстрее 5 узлов
    const motor = pb.spec && pb.spec.cls === 'motor', dp = Math.hypot(pb.X - pier.X, pb.Y - pier.Y), inZone = dp < 230;
    if (motor && inZone) { if (!law.zone) law.zone = { fast: false }; if (ps > 2.7) { law.zone.fast = true; law.harborT += dt; if (law.harborT > 3 && law.harborCool <= 0) { law.harborCool = 40; law.harborT = 0; offence(1, 'У причала — малый ход! Превышение скорости'); } } else law.harborT = Math.max(0, law.harborT - dt); }
    else if (law.zone) { if (motor && !law.zone.fast && pb.spec.id === 'boat') ctx.ach('b_harbor'); law.zone = null; law.harborT = 0; }
    // розыск
    if (law.stars > 0) { let d = 1e9, near = null; for (const p of patrols) if (p.model.root.visible) { const q = Math.hypot(pb.X - p.b.X, pb.Y - p.b.Y); if (q < d) { d = q; near = p; } }
      // патруль далеко -- на вызов выходит ближайший катер: он появляется в 600-800 м, а не идёт через всё озеро
      if (law.call) { law.call = false; if (d > 900) { place(patrols[0], pick(600, 800, pb.X, pb.Y, 8), 0); patrols[0].home = { X: pb.X, Y: pb.Y }; d = 700; } }
      if (d < 350) law.seen = true; // уйти можно только от того, кто вас уже нашёл
      law.t += dt; law.warn -= dt; ctx.audio.siren(true, clamp(d / 400, 0, 1));
      if (patrols[1].reserve && law.stars >= 3 && !patrols[1].model.root.visible) { patrols[1].model.root.visible = true; patrols[1].wake.mesh.visible = true; place(patrols[1], pick(500, 800, pb.X, pb.Y, 8), 0); patrols[1].home = { ...patrols[0].home }; }
      if (d < 130 && law.warn <= 0) { law.warn = 9; ctx.toast(ps > 1 ? 'Береговая милиция! Заглушите ход!' : 'Оставайтесь на месте'); }
      if (ps < 1.8 && d < 60) { law.stopT += dt; if (law.stopT > 2.5) { const f = 500 * law.stars; law.fines += f; ctx.ach('l_stop'); clear(`Протокол составлен. Штраф ${f} сом. Счастливого плавания`); } } else law.stopT = 0;
      // оторваться -- значит уходить: стоящий на месте игрок не «теряется», даже пока патруль ещё в пути
      if (law.stars && d > 380 && ps > 3 && (law.seen || law.t > 25)) { law.lost += dt; if (law.lost > 12) { ctx.ach('l_run'); clear('Оторвались. Милиция потеряла вас из виду'); } } else law.lost = 0;
      if (law.stars && d < 14 && ps < 4.5 && ps >= 1.8) { law.near += dt; if (law.near > 2.5) { const f = 2000 * law.stars; law.fines += f; ctx.ach('l_bust'); clear(`Задержаны. Штраф ${f} сом, судно отбуксировано к причалу`); ctx.onBust(); } } else law.near = Math.max(0, law.near - dt);
      // розыск растёт, только если уходить от катера, который уже рядом; кто заглушил ход -- того не трогают
      law.evade = d < 160 && ps > 3 ? (law.evade || 0) + dt : 0;
      if (law.stars && law.evade > 14 && law.stars < 3) { law.evade = 0; law.stars++; ctx.toast('Неподчинение! Вызвано подкрепление'); }
      if (law.stars) ctx.setWanted(law.stars, d < 380 || !law.seen ? `катер милиции в ${Math.round(d)} м` : 'вас теряют из виду…');
    }
  }
  return { list, law, patrols, update, relocate, setActive, offence };
}
