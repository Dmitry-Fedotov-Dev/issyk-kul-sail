// Живой берег: пляжные NPC по всей береговой линии Иссык-Куля, днём и ночью.
// Берег режется на ячейки сетки маски озера (600 м). Ячейка у камеры заселяется детерминированно (сид -- номер
// ячейки, ночные компании -- ещё и номер ночи), далёкая -- освобождает спрайты в пул. Плотность -- по реальной
// карте: курорты (людно днём, торговцы, зонтики), сёла (пожиже), кемпинги южного берега (палатки, костры ночью),
// дикий берег (почти пусто). Время -- общее игровое (G.clock): днём толпа, вечером редеет, ночью костры.
// Персонажи -- 2D-спрайты с листов (npcart.js), всегда лицом к камере; ночью гаснут в синеву, у костра теплеют.
import * as THREE from 'three';
import { NPCART } from './npcart.js';
import { FAR } from './farmap.js';
import { ENV } from './world.js';

const FR = NPCART.frames, PXM = 1.7 / 64; // 64 px атласа -- рост человека 1.7 м
// посёлки по берегу: [широта, долгота, радиус км, тип]
const PLACES = [[42.648, 77.083, 4.5, 'resort'], [42.646, 77.193, 4, 'resort'], [42.655, 77.0, 3.5, 'resort'], [42.645, 76.95, 3, 'resort'], [42.56, 76.65, 3.5, 'resort'],
  [42.61, 76.77, 3, 'resort'], [42.66, 77.31, 3, 'resort'], [42.66, 77.37, 2, 'village'], [42.7, 77.47, 3, 'village'], [42.75, 77.66, 3, 'village'], [42.46, 76.18, 4, 'village'],
  [42.49, 76.42, 2.5, 'village'], [42.155, 77.548, 4, 'camp'], [42.16, 77.6, 3, 'camp'], [42.14, 77.18, 3.5, 'camp'], [42.12, 76.99, 4, 'camp'], [42.16, 77.35, 3, 'camp'], [42.2, 76.6, 3, 'camp'], [42.34, 78.0, 3, 'village']];
const M = 28.11, OX = 2923 * 256 + 600.5, OY = 1508 * 256 + 695.5, Z = 256 * 4096;
const geo = (lat, lon) => { const px = (lon + 180) / 360 * Z, s = Math.sin(lat * Math.PI / 180), py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Z; return [(px - OX) * M, -(py - OY) * M]; };
const ZONES = PLACES.map(([la, lo, r, kind]) => { const [X, Y] = geo(la, lo); return { X, Y, R: r * 1000, kind }; });
// сколько чего на 600 м берега
const DENS = { resort: { day: 9, vend: 0.8, tent: 0.3, fire: 0.25 }, village: { day: 3.5, vend: 0.2, tent: 0.6, fire: 0.3 }, camp: { day: 2, vend: 0, tent: 3, fire: 0.6 }, wild: { day: 0.3, vend: 0, tent: 0.25, fire: 0.08 } };
// ночные сценарии (вероятность выбора, когда компания появилась)
const NIGHT = [['guitar', 25], ['girls', 20], ['lamb', 15], ['pair', 20], ['solo', 10], ['empty', 10]];
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const pickW = (r, L) => { let t = r() * L.reduce((a, b) => a + b[1], 0); for (const [k, w] of L) if ((t -= w) <= 0) return k; return L[0][0]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// роли: кадры по состояниям; walk -- ходит вдоль воды; face -- куда смотрят боковые кадры (1 вправо)
const ROLES = {
  pink: { relax: ['lie0', 'lie1', 'lie2', 'lie3', 'lie4', 'lie5'], sun: ['sun0', 'sun1', 'sun2', 'sun3', 'sun4'], fps: 0.7 },
  goth: { walk: ['goth0', 'goth1', 'goth2', 'goth3'], idle: ['type1'], face: -1, fps: 6, speed: 1.1 },
  blond: { walk: ['blond0', 'blond1', 'blond2', 'blond3', 'blond4'], idle: ['blond5', 'blond6', 'blond7', 'blond8'], face: 1, fps: 7, speed: 1.2 },
  guitar: { idle: ['chill0'], fps: 0.5 }, lounger: { idle: ['chill2'], fps: 0.3 },
  big: { idle: ['gran0', 'gran1', 'gran2'], fps: 0.8 }, deck: { idle: ['gran4'], fps: 0.2 },
  vendor: { walk: ['vend0', 'vend1', 'vend2'], idle: ['vend3', 'vend4', 'vend5'], face: -1, fps: 4, speed: 0.7 },
  nguitar: { idle: ['nguit0', 'nguit1', 'nguit2', 'nguit3', 'nguit4'], fps: 3 }, neat: { idle: ['neat0', 'neat1', 'neat2', 'neat3', 'neat4'], fps: 1.6 },
  ngirl: { idle: ['lie0', 'lie2', 'lie5'], fps: 0.5 }, ngoth: { idle: ['type1'], fps: 0.3 },
};
const PROPS = { umbrella: 'obj1', towel: 'obj4', cooler: 'obj3', radio: 'obj5', deckchair: 'obj6', flamingo: 'obj9', ball: 'obj11', castle: 'obj12', flag: 'obj14', sign: 'obj13',
  fire: 'nobj1', ring: 'nobj2', wood: 'nobj3', lamb: 'nobj4', bowl: 'nobj6', thermos: 'nobj12', bag: 'nobj14', blanket: 'nobj15', tent: 'nobj16', blanket2: 'nobj17', chair: 'nobj18', guitar2: 'nobj19', heart: 'nbig1' };

export function makeBeach({ G, scene, camera, audio, toast }) {
  const tex = new THREE.Texture(); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const IMG = new Image(); IMG.onload = () => { tex.image = IMG; tex.needsUpdate = true; ready = true; }; IMG.src = NPCART.png; let ready = false;
  const AW = () => IMG.width, AH = () => IMG.height;
  const H = (x, y) => (G.hMesh ? G.hMesh(x, y) : G.h(x, y));
  // пул спрайтов: у каждого -- свой клон текстуры (картинка общая, своё окно в атласе)
  const pool = [], live = new Set();
  function getSpr() { let s = pool.pop(); if (!s) { const t = tex.clone(); s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.35, fog: false })); s.userData.t = t; scene.add(s); } s.visible = true; live.add(s); return s; }
  function putSpr(s) { s.visible = false; live.delete(s); pool.push(s); }
  function setFrame(s, key, flip = false) { const f = FR[key]; if (!f || !ready) return; const t = s.userData.t; // картинка общая (source), меняется только окно -- без перезагрузки в видеокарту
    if (s.userData.key === key && s.userData.flip === flip) return; s.userData.key = key; s.userData.flip = flip;
    t.repeat.set((flip ? -f[2] : f[2]) / AW(), f[3] / AH()); t.offset.set((flip ? f[0] + f[2] : f[0]) / AW(), 1 - (f[1] + f[3]) / AH());
    s.scale.set(f[2] * PXM, f[3] * PXM, 1); s.userData.sx = f[2] * PXM; s.userData.sy = f[3] * PXM; s.center.set(flip ? 1 - f[4] / f[2] : f[4] / f[2], 0); }

  // ---- берег: ячейки маски озера, где вода граничит с сушей ----
  const { W, H: HH, X0, Y1, STEP } = FAR, cells = [];
  for (let j = 1; j < HH - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; if (!G.lake[k]) continue;
    if (!G.lake[k - 1] || !G.lake[k + 1] || !G.lake[k - W] || !G.lake[k + W]) cells.push({ id: k, X: X0 + i * STEP, Y: Y1 - j * STEP, on: false, ents: [], night: -1 }); }
  const zoneOf = (X, Y) => { let best = null, bd = 1; for (const z of ZONES) { const d = Math.hypot(X - z.X, Y - z.Y) / z.R; if (d < bd) { bd = d; best = z.kind; } } return best || 'wild'; };
  for (const c of cells) c.zone = zoneOf(c.X, c.Y);

  // места на песке в ячейке: суша 0.3..4 м над водой, полого, вода рядом
  function spots(c) { const out = [], S = 12, R = STEP * 0.75;
    for (let y = c.Y - R; y < c.Y + R; y += S) for (let x = c.X - R; x < c.X + R; x += S) { const h = G.h(x, y); if (h < 0.35 || h > 4) continue;
      const sl = Math.hypot(G.h(x + 4, y) - G.h(x - 4, y), G.h(x, y + 4) - G.h(x, y - 4)) / 8; if (sl > 0.12) continue;
      let wet = null; for (let a = 0; a < 8 && !wet; a++) { const dx = Math.cos(a * 0.785), dy = Math.sin(a * 0.785); if (G.h(x + dx * 35, y + dy * 35) < 0) wet = [dx, dy]; } if (!wet) continue;
      out.push({ x, y, wx: wet[0], wy: wet[1], h }); }
    return out; }
  const day = { n: 0, prev: 10 };
  // ---- заселение ячейки ----
  function populate(c) {
    const r = rng(c.id * 7 + 1), sp = spots(c); c.on = true; c.ents = []; c.sp = sp; if (!sp.length) return;
    const D = DENS[c.zone], used = [];
    const free = (x, y, d = 3) => used.every((u) => Math.hypot(u[0] - x, u[1] - y) > d);
    const place = (cl = null, tries = 12) => { for (let t = 0; t < tries; t++) { const p = cl ? { ...cl, x: cl.x + (r() - 0.5) * 30, y: cl.y + (r() - 0.5) * 30 } : sp[Math.floor(r() * sp.length)]; if (cl && !sp.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 10)) continue; if (free(p.x, p.y)) { used.push([p.x, p.y]); return p; } } return null; };
    const add = (e) => { c.ents.push(e); return e; };
    // дневные компании -- кучками, не сеткой: центры кучек, вокруг -- пледы и люди
    const nDay = Math.round(D.day * (0.5 + r()));
    const clusters = Array.from({ length: Math.max(1, Math.round(nDay / 3)) }, () => sp[Math.floor(r() * sp.length)]);
    for (let i = 0; i < nDay; i++) { const p = place(clusters[Math.floor(r() * clusters.length)]); if (!p) continue;
      const kind = pickW(r, [['pink', 30], ['goth', 14], ['blond', 14], ['guitar', 6], ['lounger', 8], ['big', 6], ['deck', 5], ['family', 10]]);
      const from = 7 + r() * 3, to = 18 + r() * 3.5; // пришли утром, ушли вечером -- каждый в своё время
      if (kind === 'family') { add({ prop: pickW(r, [['castle', 3], ['ball', 3], ['flamingo', 2], ['cooler', 2], ['radio', 2]]), x: p.x, y: p.y, from, to }); continue; }
      if (kind === 'pink') { if (r() < 0.45) add({ prop: 'umbrella', x: p.x + p.wy * 1.6, y: p.y - p.wx * 1.6, from, to }); }
      if (kind === 'deck' && r() < 0.6) add({ prop: 'umbrella', x: p.x - p.wy * 1.8, y: p.y + p.wx * 1.8, from, to });
      const walk = !!ROLES[kind].walk;
      add({ role: kind, x: p.x, y: p.y, hx: p.x, hy: p.y, wx: p.wx, wy: p.wy, from, to: walk ? to + 1.5 : to, t: r() * 10, walk, seq: r() < 0.5 && kind === 'pink' ? 'sun' : null, speed: (ROLES[kind].speed || 1) * (0.8 + r() * 0.4), leg: 0, phase: r() * 100 }); }
    // торговцы -- курорты
    if (r() < D.vend) { const p = place(); if (p) { add({ role: 'vendor', x: p.x, y: p.y, hx: p.x, hy: p.y, wx: p.wx, wy: p.wy, from: 9, to: 20, walk: true, vendor: true, speed: 0.6, t: 0, leg: 0, phase: r() * 100 });
      if (r() < 0.5) { const q = place(); if (q) add({ prop: 'sign', x: q.x, y: q.y, from: 9, to: 20 }); } } }
    // палатки -- кемпинги и дикий берег; стоят сутками
    const nT = Math.floor(D.tent * r() * 2 + (r() < D.tent % 1 ? 1 : 0)); for (let i = 0; i < nT; i++) { const p = place(); if (p) { add({ prop: 'tent', x: p.x - p.wx * 6, y: p.y - p.wy * 6, from: 0, to: 24 }); if (r() < 0.5) add({ prop: r() < 0.5 ? 'bag' : 'chair', x: p.x - p.wx * 4 + 1.5, y: p.y - p.wy * 4, from: 0, to: 24 }); } }
    c.flags = { lastNight: -1 };
  }
  // ночные компании: на каждую ночь своя жеребьёвка ячейки
  function nightCamp(c) {
    const D = DENS[c.zone], r = rng(c.id * 13 + day.n * 977); c.night = day.n; c.camp = null; if (!c.sp || !c.sp.length || r() > D.fire) return;
    const sc = pickW(r, NIGHT); if (sc === 'empty') return; const p = c.sp[Math.floor(r() * c.sp.length)]; if (Math.hypot(camera.position.x - p.x, -camera.position.z - p.y) < 40) return; // не перед носом
    const from = 20.5 + r() * 1.5, to = 24 + 1 + r() * 3, X = p.x - p.wx * 4, Y = p.y - p.wy * 4, ents = [], seat = (k, n) => { const a = (k / n) * 6.283 + r() * 0.5, d = 2.2 + r() * 0.6; return [X + Math.cos(a) * d, Y + Math.sin(a) * d]; };
    const who = { guitar: ['nguitar', 'neat', 'ngirl'], girls: ['ngirl', 'ngoth', 'ngirl'], lamb: ['neat', 'nguitar', 'ngirl', 'neat', 'big'], pair: ['neat', 'ngirl'], solo: ['nguitar'] }[sc];
    ents.push({ prop: sc === 'lamb' ? 'lamb' : 'fire', x: X, y: Y, from, to, fire: true });
    who.forEach((role, k) => { const [x, y] = seat(k, who.length); ents.push({ role, x, y, from: from + r() * 0.4, to: to - r() * 0.5, t: r() * 10, phase: r() * 100 }); if (r() < 0.6) ents.push({ prop: r() < 0.5 ? 'blanket' : 'blanket2', x: x + 0.2, y: y + 0.2, from, to, flat: true }); });
    if (sc !== 'solo') ents.push({ prop: pickW(r, [['bowl', 2], ['thermos', 2], ['guitar2', 1], ['bag', 1]]), x: X + 1.8, y: Y - 1.2, from, to });
    c.camp = { X, Y, ents, sc };
  }
  function release(c) { for (const e of c.ents.concat(c.camp ? c.camp.ents : [])) { if (e.s) { putSpr(e.s); e.s = null; } if (e.emo) { putSpr(e.emo); e.emo = null; } } c.on = false; c.ents = []; c.camp = null; c.night = -1; }

  const present = (e, hr) => (e.to > 24 ? hr >= e.from || hr < e.to - 24 : hr >= e.from && hr < e.to);
  const night = new THREE.Color(), warm = new THREE.Color(1.0, 0.62, 0.32), tmp = new THREE.Color();
  let fires = [], frameN = 0, hintNpc = null;
  // ---- кадр ----
  function update(dt, dym) {
    if (!G.lake || !ready) return; frameN++;
    const hr = G.clock ?? 12; if (hr < day.prev - 12) day.n++; day.prev = hr;
    const cx = camera.position.x, cy = -camera.position.z, agl = camera.position.y - Math.max(0, G.h(cx, cy));
    const R = agl > 900 ? 0 : 1300;
    // заселяем по одной ячейке за кадр (без рывков), освобождаем далёкие
    let n = 0; for (const c of cells) { const d = Math.hypot(c.X - cx, c.Y - cy); if (c.on && d > R + 500) release(c); else if (!c.on && d < R && n < 1) { populate(c); n++; } }
    // день/ночь: свет сцены (ENV.uDay из dayCycle) -- синева на спрайтах; у костров -- тёплый отсвет
    const dayK = clamp(ENV.uDay.value, 0, 1); night.setRGB(0.22 + 0.78 * dayK, 0.24 + 0.76 * dayK, 0.42 + 0.58 * dayK);
    fires = []; hintNpc = null;
    for (const c of cells) { if (!c.on) continue;
      const nightTime = hr >= 20 || hr < 5; if (nightTime && c.night !== day.n) { if (c.camp) for (const e of c.camp.ents) if (e.s) { putSpr(e.s); e.s = null; } nightCamp(c); }
      const all = c.camp ? c.ents.concat(c.camp.ents) : c.ents, near = Math.hypot(c.X - cx, c.Y - cy) < 500 || frameN % 6 === 0;
      for (const e of all) { const on = present(e, hr);
        if (!on) { if (e.s) { putSpr(e.s); e.s = null; } if (e.emo) { putSpr(e.emo); e.emo = null; } continue; }
        if (!e.s) { e.s = getSpr(); e.s.userData.key = null; }
        if (e.fire) fires.push(e);
        if (!near) continue;
        step(e, dt * (frameN % 6 === 0 && !near ? 6 : 1), hr, dym); } }
    // тон: ночная синева на всех, тёплый отсвет у костров, огонь -- сам светится
    for (const c of cells) { if (!c.on) continue; const all = c.camp ? c.ents.concat(c.camp.ents) : c.ents;
      for (const e of all) { if (!e.s) continue; if (e.fire) { e.s.material.color.setRGB(1.3, 1.15, 1); const fl = 1 + Math.sin(G.t * 23 + e.x) * 0.03 + Math.sin(G.t * 37 + e.y) * 0.02; if (e.s.userData.sx) e.s.scale.set(e.s.userData.sx * fl, e.s.userData.sy * (2 - fl), 1); continue; } // пламя дышит
        tmp.copy(night); for (const f of fires) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < 9) tmp.lerp(warm, (1 - d / 9) * (1 - dayK) * 0.85); } e.s.material.color.copy(tmp); } }
    return hintNpc;
  }
  function step(e, dt, hr, dym) {
    const s = e.s; e.t = (e.t || 0) + dt;
    if (e.prop) { setFrame(s, PROPS[e.prop]); s.position.set(e.x, H(e.x, e.y) + (e.flat ? 0.02 : 0), -e.y); return; }
    const role = ROLES[e.role];
    // прогулка: вдоль воды туда-обратно от своего места; торговец -- с остановками «кому кукурузу»
    let moving = false; if (e.walk) { e.stopT = (e.stopT || 0) - dt;
      if (e.stopT <= 0) { const ax = -e.wy, ay = e.wx, L = e.vendor ? 70 : 35, k = Math.sin((e.phase + e.t * e.speed / L) ) * L; const tx = e.hx + ax * k, ty = e.hy + ay * k, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
        if (d > 0.05) { const v = Math.min(d, e.speed * dt * 1.5); const nx = e.x + dx / d * v, ny = e.y + dy / d * v; if (G.h(nx, ny) > 0.2) { e.dirx = dx / d; e.diry = dy / d; e.x = nx; e.y = ny; moving = true; } }
        if (e.vendor && Math.random() < dt / 25) e.stopT = 5 + Math.random() * 3; } }
    // Дымок рядом: оборачиваются и радуются; девушки -- сердечко (фото), у торговца -- предложение
    let react = false; if (dym) { const d = Math.hypot(dym.X - e.x, dym.Y - e.y); if (d < 3.5) { react = true; if (!e.seen) { e.seen = true; e.emoT = 2.2; } if (d < 2.5 && (!hintNpc || d < hintNpc.d)) hintNpc = { e, d }; } else e.seen = false; }
    let seq = (e.seq && role[e.seq]) || role.relax || role.idle || role.walk; if (moving && role.walk) seq = role.walk; else if (role.idle && (react || e.stopT > 0)) seq = role.idle;
    const fps = moving ? role.fps : (role.fps || 1) * 0.6, fi = Math.floor((e.t * fps + e.phase) % seq.length);
    // бок: кадры смотрят в role.face; зеркалим по направлению шага на экране
    let flip = false; if (moving && role.face) { const right = e.dirx * Math.cos(camYaw()) - e.diry * Math.sin(camYaw()); flip = (right >= 0 ? 1 : -1) !== role.face; }
    setFrame(s, seq[fi], flip); s.position.set(e.x, H(e.x, e.y), -e.y);
    if (e.emoT > 0) { e.emoT -= dt; if (!e.emo) { e.emo = getSpr(); setFrame(e.emo, PROPS.heart); } e.emo.position.set(e.x, H(e.x, e.y) + s.scale.y + 0.3 + Math.sin(G.t * 4) * 0.08, -e.y); e.emo.material.color.setRGB(1, 1, 1); if (e.emoT <= 0) { putSpr(e.emo); e.emo = null; } }
  }
  const camYaw = () => { const v = new THREE.Vector3(); camera.getWorldDirection(v); return Math.atan2(v.x, -v.z); };
  // костёр рядом с Дымком (для его поз «у огня»)
  function fireNear(X, Y, R = 4.5) { for (const f of fires) if (Math.hypot(f.x - X, f.y - Y) < R) return f; return null; }
  function interact(h) { if (!h) return false; const e = h.e; e.emoT = 2.5; if (e.vendor) toast(pickW(Math.random, [['Кукуруза — Дымку досталось зёрнышко!', 1], ['Лимонад — Дымок облизнулся', 1], ['Сосиска в тесте — пополам с Дымком', 1]])); else if (e.role === 'pink' || e.role === 'goth' || e.role === 'ngirl') toast('Дымка гладят и фотографируют'); else toast('Дымку подмигнули'); if (audio && audio.chime) audio.chime(); return true; }
  // тон для чужих спрайтов (Дымок): ночная синева и тёплый отсвет ближайшего костра
  function tint(X, Y, out) { const dayK = clamp(ENV.uDay.value, 0, 1); out.setRGB(0.22 + 0.78 * dayK, 0.24 + 0.76 * dayK, 0.42 + 0.58 * dayK); for (const f of fires) { const d = Math.hypot(f.x - X, f.y - Y); if (d < 9) out.lerp(warm, (1 - d / 9) * (1 - dayK) * 0.85); } return out; }
  return { update, fireNear, tint, interact, get count() { return live.size; }, cells };
}
