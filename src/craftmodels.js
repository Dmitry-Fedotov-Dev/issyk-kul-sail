// Модели снарядов и судов. Корпуса строятся по обводам (шпангоуты вдоль длины), люди -- с руками, которые
// каждый кадр тянутся к веслу или рулю: гребок виден как гребок, а не как вращение палки.
import * as THREE from 'three';
import { clamp } from './sim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const std = (c, r = 0.6, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: 0.7, ...extra });
const gloss = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3, side: THREE.DoubleSide });
const steel = std(0xdfe4e8, 0.2, 1), black = std(0x15181c, 0.5), rubber = std(0x22252a, 0.9);
const mesh = (g, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
const box = (p, w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, p, x, y, z);
const cyl = (p, r0, r1, h, m, x, y, z, seg = 10) => mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m, p, x, y, z);

// корпус: нос в -z. B -- полуширина, D -- осадка, F -- высота борта. transom: корма обрублена (моторные)
function shell({ L, B, D, F, transom = false, NS = 30, NA = 8, ex = 0.8, crown = 0.04, sheerUp = 0.25, fine = 0.6 }) {
  const pos = [], idx = [], ring = 2 * NA + 1, dp = [], di = [];
  const bm = (s) => (transom ? (s < 0.62 ? B * Math.pow(Math.sin((Math.PI / 2) * (s / 0.62)), fine) : B * (1 - 0.1 * ((s - 0.62) / 0.38) ** 2)) : B * Math.pow(Math.sin(Math.PI * s), fine));
  const kk = (s) => Math.pow(Math.sin(Math.PI * (transom ? Math.min(s * 0.9 + 0.02, 0.5) : clamp(s, 0.02, 0.98))), 0.5);
  const sh = (s) => F * (1 + sheerUp * (1 - s) ** 2 + (transom ? 0 : sheerUp * 0.6 * s ** 2));
  for (let i = 0; i <= NS; i++) { const s = i / NS, b = Math.max(bm(s), 0.004), z = -L / 2 + L * s, ky = -D * kk(s), sy = sh(s);
    for (let j = 0; j < ring; j++) { const a = Math.abs(j - NA) / NA, sd = j < NA ? -1 : 1; pos.push(sd * b * Math.pow(Math.sin((a * Math.PI) / 2), ex), ky + (sy - ky) * Math.pow(a, 1.5), z); }
    for (let k = 0; k <= 6; k++) { const t = (k / 6) * 2 - 1; dp.push(t * b, sy + crown * (1 - t * t) * (b / B), z); } }
  for (let i = 0; i < NS; i++) { for (let j = 0; j < ring - 1; j++) { const p = i * ring + j, q = p + ring; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    for (let k = 0; k < 6; k++) { const p = i * 7 + k, q = p + 7; di.push(p, q, p + 1, p + 1, q, q + 1); } }
  if (transom) { const c = pos.length / 3; pos.push(0, sh(1) * 0.3, L / 2); for (let j = 0; j < ring - 1; j++) idx.push(c, NS * ring + j + 1, NS * ring + j); idx.push(c, NS * ring, NS * ring + ring - 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const d = new THREE.BufferGeometry(); d.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); d.setIndex(di); d.computeVertexNormals();
  return { hull: g, deck: d, sh, bm };
}
const limbGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 7); g.translate(0, 0.5, 0); return g; })();
function limb(m, a, b, r) { m.position.copy(a); const d = b.clone().sub(a), l = d.length() || 1e-3; m.scale.set(r, l, r); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); }
// Человек в настоящих пропорциях (рост около 1.75 м): таз, сужающийся к талии торс с плечами, шея, голова с лицом и
// шлемом, руки и ноги из сужающихся сегментов с локтями, коленями, кистями и стопами. Руки каждый кадр тянутся к веслу
// или рулю (два звена с локтем), корпус может скручиваться и наклоняться.
// сегмент конечности; wr > 0 -- рукав или штанина из ткани: по длине идут складки, гуще к сгибам (локоть, манжета)
const taper = (r0, r1, wr = 0) => { const g = new THREE.CylinderGeometry(r1, r0, 1, 14, 12); g.translate(0, 0.5, 0);
  if (wr) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), e = Math.max(0, 1 - y / 0.3) + Math.max(0, (y - 0.7) / 0.3);
      const k = 1 + wr * (0.5 + e) * (Math.sin(y * 34 + a * 2) * 0.6 + Math.sin(y * 19 - a * 3 + 1.3) * 0.4) + wr * 0.6 * Math.sin(a * 3 + y * 4); p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); } return g; };
// одежда мешковатая: широкие рукава и штанины
// оверсайз: рукава вдвое толще руки, штаны свободные
const G_UP = taper(0.105, 0.092, 0.07), G_LO = taper(0.095, 0.07, 0.08), G_TH = taper(0.115, 0.095, 0.05), G_SH = taper(0.092, 0.075, 0.06);
// торс худи: спущенная линия плеча, свободный низ с напуском над резинкой; ткань идёт складками
function torsoGeo() { const pts = [[0.0, -0.01], [0.16, -0.01], [0.215, 0.05], [0.225, 0.12], [0.21, 0.24], [0.215, 0.36], [0.235, 0.44], [0.205, 0.5], [0.1, 0.545], [0.0, 0.55]].map((q) => new THREE.Vector2(q[0], q[1]));
  const g = new THREE.LatheGeometry(pts, 28), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), low = Math.max(0, 1 - y / 0.3);
    const k = 1 + 0.035 * Math.sin(a * 6 + y * 9) * (0.4 + low) + 0.03 * Math.sin(y * 42 + a * 2) * low + 0.02 * Math.sin(a * 11 - y * 5); p.setX(i, x * k); p.setZ(i, z * k * 0.74); }
  g.computeVertexNormals(); return g; }
// фактура плотного флиса: мелкий шум + переплетение нитей, идёт в bump-карту
let FLEECE = null;
function fleece() { if (FLEECE) return FLEECE; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), im = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = 128 + (Math.random() - 0.5) * 110 + 26 * Math.sin(x * 1.57) * Math.sin(y * 1.57), q = (y * 128 + x) * 4; im.data[q] = im.data[q + 1] = im.data[q + 2] = v; im.data[q + 3] = 255; }
  g.putImageData(im, 0, 0); FLEECE = new THREE.CanvasTexture(c); FLEECE.wrapS = FLEECE.wrapT = THREE.RepeatWrapping; FLEECE.repeat.set(5, 5); return FLEECE; }
// матовая ткань без пластикового блика: шероховатость 0.93, лёгкий ворс (sheen), почти не отражает окружение
const cloth = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.93, metalness: 0, sheen: 0.5, sheenRoughness: 0.85, sheenColor: new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35), bumpMap: fleece(), bumpScale: 2.2, envMapIntensity: 0.15, side: THREE.DoubleSide });
// глубокие матовые тона: графит, олива, тёмно-синий, песочный, бордо, хвоя
const HOODIES = [0x3a3d40, 0x55603a, 0x1f2c44, 0xa8987a, 0x5a2a2e, 0x2f4a40]; let hoodieN = 0;
const G_TORSO = torsoGeo();
// pfd -- цвет худи, suit -- штаны, hat -- каска (helmet: true надевает её поверх капюшона)
function person(parent, { x = 0, y = 0, z = 0, suit = 0x26486e, pfd = 0xf2591b, hat = 0xf4f3ee, standing = false, legs = 'sit', helmet = false }) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); const hc = HOODIES[hoodieN++ % HOODIES.length], skin = std(0xc99a78, 0.85, 0, { envMapIntensity: 0.2 }), su = cloth(new THREE.Color(hc).multiplyScalar(0.45).getHex()), shoe = std(0x1b1d21, 0.9, 0, { envMapIntensity: 0.2 }), hy = standing ? 0.9 : 0.04;
  const body = new THREE.Group(); body.position.y = hy; g.add(body);
  const hoodie = cloth(hc), trim = std(0xd9d2c0, 0.95, 0, { envMapIntensity: 0.1 }); pfd = hc;
  mesh(G_TORSO, hoodie, body);                                                                                                  // свободный худи со складками
  const hem = mesh(new THREE.TorusGeometry(0.168, 0.034, 8, 24), hoodie, body, 0, 0.0, 0); hem.rotation.x = Math.PI / 2; hem.scale.set(1, 0.74, 1); // резинка по низу, над ней напуск
  const pk = box(body, 0.27, 0.12, 0.035, hoodie, 0, 0.13, -0.165); pk.rotation.x = 0.1;                                         // карман-кенгуру
  for (const sd of [-1, 1]) { const shd = mesh(new THREE.SphereGeometry(0.115, 12, 10), hoodie, body, sd * 0.215, 0.445, 0); shd.scale.set(1.05, 0.8, 0.95); // спущенное плечо
    const dr = cyl(body, 0.007, 0.007, 0.2, trim, sd * 0.04, 0.4, -0.172, 5); dr.rotation.z = sd * 0.08; mesh(new THREE.SphereGeometry(0.012, 6, 5), trim, body, sd * 0.048, 0.3, -0.172); }  // шнурки с наконечниками
  cyl(body, 0.045, 0.05, 0.09, skin, 0, 0.58, 0, 10);
  const head = new THREE.Group(); head.position.set(0, 0.71, -0.01); body.add(head);
  const sk = mesh(new THREE.SphereGeometry(0.1, 16, 14), skin, head); sk.scale.set(0.88, 1.12, 1);
  mesh(new THREE.SphereGeometry(0.02, 8, 6), skin, head, 0, -0.012, -0.1);                                                      // нос
  // капюшон: оболочка вокруг головы, открытая спереди, с объёмом на затылке и складкой на плечах
  const hood = mesh(new THREE.SphereGeometry(0.15, 20, 16, 0, Math.PI * 2, 0, 2.45), hoodie, head, 0, 0.0, 0.045);              // объёмный капюшон: закрывает затылок и шею
  hood.rotation.x = 1.0; hood.scale.set(1.0, 1.12, 1.12);
  const roll = mesh(new THREE.TorusGeometry(0.135, 0.062, 10, 20, Math.PI * 1.3), hoodie, body, 0, 0.55, 0.04); roll.rotation.set(Math.PI / 2 + 0.15, 0, Math.PI * 0.85); // складка капюшона на плечах
  box(head, 0.15, 0.03, 0.02, std(0x101418, 0.2), 0, 0.012, -0.094);                                                           // очки
  if (helmet) { const hm = mesh(new THREE.SphereGeometry(0.15, 18, 10, 0, 6.3, 0, 1.45), new THREE.MeshPhysicalMaterial({ color: hat, roughness: 0.3, clearcoat: 1 }), head, 0, 0.035, 0.03); hm.scale.set(0.98, 0.9, 1.1);
    box(head, 0.2, 0.014, 0.07, std(hat, 0.4), 0, 0.06, -0.15); for (const sd of [-1, 1]) box(head, 0.012, 0.16, 0.02, std(0x15181c, 0.8), sd * 0.1, -0.06, -0.03); }  // козырёк и ремешки
  // ноги: бедро, голень, стопа
  const leg = (hip, knee, foot) => { limb(mesh(G_TH, su, g), hip, knee, 1); limb(mesh(G_SH, su, g), knee, foot, 1); const f = box(g, 0.085, 0.06, 0.22, shoe, foot.x, foot.y, foot.z - 0.06); return f; };
  for (const sd of [-1, 1]) { if (standing) leg(V(sd * 0.085, hy + 0.02, 0), V(sd * 0.1, 0.48, sd * 0.05 - 0.03), V(sd * 0.11, 0.05, sd * 0.11));
    else if (legs === 'ride') leg(V(sd * 0.1, hy + 0.03, 0), V(sd * 0.22, hy - 0.05, -0.36), V(sd * 0.24, hy - 0.45, -0.2));
    else leg(V(sd * 0.085, hy + 0.03, 0), V(sd * 0.13, hy + 0.13, -0.4), V(sd * 0.1, hy + 0.0, -0.8)); }
  const cuff = () => { const c = mesh(new THREE.TorusGeometry(0.047, 0.02, 6, 12), hoodie, g); return c; };
  const arms = [-1, 1].map((sd) => ({ sd, up: mesh(G_UP, hoodie, g), lo: mesh(G_LO, hoodie, g), cuff: cuff(), hand: mesh(new THREE.SphereGeometry(0.04, 8, 6), skin, g), sh: V(sd * 0.235, hy + 0.445, 0) }));
  const tmp = V(0, 0, 0), UA = 0.3, FA = 0.27;
  // кисть в координатах parent; плечо учитывает поворот и наклон корпуса
  const reach = (i, hand) => { const a = arms[i], h = tmp.copy(hand).sub(g.position).applyAxisAngle(UP, -g.rotation.y).clone(); h.y /= g.scale.y;
    const sh = a.sh.clone().setY(a.sh.y - hy).applyEuler(body.rotation).setY(0).add(V(0, 0, 0)); sh.copy(a.sh.clone().sub(V(0, hy, 0)).applyEuler(body.rotation).add(V(0, hy, 0)));
    const d = Math.min(h.distanceTo(sh), UA + FA - 0.005), dir = h.clone().sub(sh).normalize(), k = (UA * UA - FA * FA + d * d) / (2 * d), bend = Math.sqrt(Math.max(0, UA * UA - k * k));
    const el = sh.clone().addScaledVector(dir, k).add(V(a.sd * bend * 0.55, -bend * 0.8, bend * 0.25)), hp = sh.clone().addScaledVector(dir, d);
    limb(a.up, sh, el, 1); const wr = hp.clone().addScaledVector(dir, -0.035); limb(a.lo, el, wr, 1); a.cuff.position.copy(wr); a.cuff.quaternion.copy(a.lo.quaternion); a.cuff.rotateX(Math.PI / 2); a.hand.position.copy(hp); };
  return { g, body, reach };
}
function finish(root, tilt, yoff = 0) { root.add(tilt); root.rotation.order = 'YXZ'; root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return (b) => { root.position.set(b.X, b.y + yoff, -b.Y); root.rotation.set(b.pitch * 0.9, -b.th, -b.phi); }; }
const E = new THREE.Euler();
// Плавная поза: каждая величина анимации идёт к цели через критически демпфированную пружину. Цель может скакать
// (начало гребка с другой стороны, конец гребка), а поза -- нет: она догоняет плавно и без перелёта. Без гребка цель --
// поза покоя, и модель сама возвращается в неё.
function springs(init) { const x = { ...init }, v = {}; for (const k in init) v[k] = 0;
  return { x, step(tgt, dt, k = 140) { const c = 2 * Math.sqrt(k), h = Math.min(dt, 0.05); for (const n in tgt) { v[n] += (k * (tgt[n] - x[n]) - c * v[n]) * h; x[n] += v[n] * h; } return x; } }; }

// ---------- каяк ----------
export function makeKayak(o = {}) {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 4.7, B: 0.3, D: 0.13, F: 0.17, crown: 0.07, sheerUp: 0.5, fine: 0.55 });
  mesh(s.hull, gloss(o.hull ?? 0xe6452b), t); mesh(s.deck, gloss(o.deck ?? 0xf3f1ea), t);
  const rim = mesh(new THREE.TorusGeometry(0.27, 0.025, 8, 24), black, t, 0, 0.245, 0.2); rim.rotation.x = Math.PI / 2; rim.scale.set(0.85, 1.5, 1);
  for (const z of [-1.1, -1.45, 1.15]) for (const sd of [-1, 1]) cyl(t, 0.006, 0.006, 0.36, rubber, sd * 0.1, 0.25, z).rotation.z = Math.PI / 2; // палубная оснастка
  const pe = person(t, { y: 0.02, z: 0.22, suit: o.suit ?? 0x26486e, pfd: o.pfd ?? 0xf2c21b, hat: o.hat ?? 0xd9342b, helmet: true });
  const P = new THREE.Group(); t.add(P); const shaft = cyl(P, 0.015, 0.015, 2.15, black, 0, 0, 0, 8); shaft.rotation.z = Math.PI / 2;
  for (const sd of [-1, 1]) { const bl = box(P, 0.46, 0.17, 0.015, std(o.blade ?? 0xf4f3ee, 0.4), sd * 0.86, 0, 0); bl.rotation.x = sd * 0.5; }
  const base = finish(root, t, 0.0), h = V(0, 0, 0);
  // от первого лица корпус и голова не рисуются (иначе закрывают обзор), руки и весло остаются в кадре
  const S = springs({ yaw: 0, roll: 0, tw: 0, py: 0.6, lean: -0.12 }), T = { yaw: 0, roll: 0, tw: 0, py: 0.6, lean: -0.12 };
  return { root, fp(on) { pe.body.visible = !on; }, update(b, dt = 1 / 60) { base(b); const st = b.st, sg = (st ? st.side : b.lastSide) === 'L' ? -1 : 1;
    if (st) { const ph = Math.min(1, st.t / st.T); // широкий гребок: лопасть входит у ног и выходит у бедра
      T.yaw = sg * (1.0 - 2.0 * ph) * (1 - b.brace); T.roll = -sg * (0.36 + 0.78 * Math.sin(Math.PI * ph)); T.tw = -sg * 0.75 * Math.cos(Math.PI * ph); }
    else { const r = Math.min(1, (b.endT || 0) / 0.6); T.yaw = -sg * 0.45 * (1 - r); T.roll = -sg * 0.3 * (1 - r) ; T.tw = sg * 0.3 * (1 - r); } // вынос и возврат в покой: весло поперёк, корпус прямо
    if (b.capsized) { T.yaw = 0; T.roll = 0; T.tw = 0; }
    T.roll += -sg * 0.25 * b.brace; T.py = 0.6 - 0.1 * b.brace; T.lean = -0.12 - 0.1 * b.brace;
    const x = S.step(T, dt, st ? 160 : 70);
    P.position.set(0, x.py, -0.12); P.rotation.set(0, x.yaw, x.roll); pe.body.rotation.y = x.tw; pe.body.rotation.x = x.lean; E.copy(P.rotation);
    for (let i = 0; i < 2; i++) pe.reach(i, h.set((i ? 1 : -1) * 0.36, 0, 0).applyEuler(E).add(P.position)); } };
}
// ---------- академическая одиночка ----------
export function makeScull(o = {}) {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 7.9, B: 0.15, D: 0.11, F: 0.1, crown: 0.03, sheerUp: 0.2, fine: 0.5, NS: 40 });
  mesh(s.hull, gloss(o.hull ?? 0xf4f3ee), t); mesh(s.deck, gloss(o.deck ?? 0xf7d24a), t);
  const lock = [-1, 1].map((sd) => V(sd * 0.8, 0.26, 0.05)), wing = cyl(t, 0.018, 0.018, 1.62, steel, 0, 0.24, 0.05, 8); wing.rotation.z = Math.PI / 2;
  for (const sd of [-1, 1]) { const st = cyl(t, 0.012, 0.012, 0.85, steel, sd * 0.42, 0.2, 0.3, 6); st.rotation.set(0.25, 0, Math.PI / 2 - sd * 0.25); }
  const seat = box(t, 0.26, 0.04, 0.24, black, 0, 0.14, 0.2), pe = person(t, { y: 0.14, z: 0.2, suit: o.suit ?? 0x1c2f52, pfd: o.pfd ?? 0x1c2f52, hat: o.hat ?? 0xf4f3ee }); pe.g.rotation.y = Math.PI; // гребец сидит спиной вперёд
  const oars = [-1, 1].map((sd, i) => { const g = new THREE.Group(); g.position.copy(lock[i]); t.add(g); const sh = cyl(g, 0.017, 0.02, 2.85, black, sd * 0.55, 0, 0, 8); sh.rotation.z = Math.PI / 2;
    box(g, 0.5, 0.2, 0.015, std(o.blade ?? 0x1f6fd0, 0.4), sd * 1.9, 0, 0); return { g, sd, a: 0.7, lift: 0 }; });
  const base = finish(root, t, 0.0), h = V(0, 0, 0);
  // от первого лица корпус и голова не рисуются (иначе закрывают обзор), руки и весло остаются в кадре
  return { root, fp(on) { pe.g.visible = !on; }, update(b, dt) { base(b); const st = b.st, per = b.spec.period;
    for (const oa of oars) { const act = st && (st.side === 'B' || (st.side === 'L') === (oa.sd < 0)), ph = act ? Math.min(1, st.t / st.T) : 0;
      const tgt = act ? 0.75 - 1.4 * ph : 0.75 - 1.4 * (1 - clamp(b.endT / (per * 0.55), 0, 1)); const k = act ? 170 : 75, h2 = Math.min(dt, 0.05); oa.va = (oa.va || 0) + (k * (tgt - oa.a) - 2 * Math.sqrt(k) * (oa.va || 0)) * h2; oa.a += oa.va * h2; oa.lift += ((act ? -0.07 : 0.1) - oa.lift) * Math.min(1, dt * 8);
      oa.g.rotation.set(0, oa.sd * oa.a, oa.sd * oa.lift); }
    const sl = 0.2 + 0.3 * (0.75 - oars[1].a) / 1.4; seat.position.z = sl; pe.g.position.z = sl; pe.body.rotation.x = -0.3 + 0.55 * (0.75 - oars[1].a) / 1.4;
    oars.forEach((oa, i) => { E.copy(oa.g.rotation); pe.reach(i ? 0 : 1, h.set(-oa.sd * 0.78, 0, 0).applyEuler(E).add(oa.g.position)); }); } };
}
// ---------- SUP ----------
export function makeSup(o = {}) {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 3.3, B: 0.4, D: 0.05, F: 0.07, crown: 0.01, sheerUp: 0.5, fine: 0.42, ex: 0.3 });
  mesh(s.hull, gloss(o.hull ?? 0xf4f3ee), t); mesh(s.deck, gloss(o.deck ?? 0x18a7b5), t); box(t, 0.6, 0.012, 1.1, rubber, 0, 0.085, 0.25); box(t, 0.012, 0.2, 0.22, black, 0, -0.14, 1.35);
  const pe = person(t, { y: 0.09, z: 0.2, suit: o.suit ?? 0x20242b, pfd: o.pfd ?? 0xe6452b, hat: o.hat ?? 0xf2c21b, standing: true });
  const P = new THREE.Group(); t.add(P); cyl(P, 0.014, 0.014, 1.85, black, 0, 0, 0, 8); box(P, 0.19, 0.42, 0.015, std(o.blade ?? 0xf2c21b, 0.4), 0, -1.1, 0);
  const base = finish(root, t, 0.0), h = V(0, 0, 0);
  // от первого лица корпус и голова не рисуются (иначе закрывают обзор), руки и весло остаются в кадре
  const S = springs({ px: 0.36, pr: 0.55, pz: -0.1, lean: -0.12, tw: -0.25, cr: 1 }), T = { px: 0.36, pr: 0.55, pz: -0.1, lean: -0.12, tw: -0.25, cr: 1 };
  return { root, fp(on) { pe.body.visible = !on; }, update(b, dt = 1 / 60) { base(b); const st = b.st, sg = (st ? st.side : b.lastSide) === 'L' ? -1 : 1;
    if (st) { const ph = Math.min(1, st.t / st.T); T.pr = 0.95 - 1.8 * ph; T.lean = -0.12 - 0.25 * Math.sin(Math.PI * ph); }
    else { const r = Math.min(1, (b.endT || 0) / 0.7); T.pr = -0.85 + 1.4 * r; T.lean = -0.12; } // после гребка весло выносится вперёд, в готовность
    T.px = sg * 0.36; T.tw = -sg * 0.25; T.cr = 1 - 0.28 * b.brace; T.lean -= 0.35 * b.brace;
    const x = S.step(T, dt, st ? 150 : 60), cr = x.cr;
    pe.g.scale.y = cr; pe.body.rotation.x = x.lean; pe.body.rotation.y = x.tw; P.position.set(x.px, 1.3 * cr - 0.1, -0.15); P.rotation.set(x.pr, 0, -x.px / 0.36 * 0.1); E.copy(P.rotation);
    const sgv = x.px >= 0 ? 1 : -1;
    pe.reach(sgv > 0 ? 0 : 1, h.set(0, 0.9, 0).applyEuler(E).add(P.position)); pe.reach(sgv > 0 ? 1 : 0, h.set(0, 0.3, 0).applyEuler(E).add(P.position)); } };
}
// ---------- гидроцикл ----------
export function makeJetski(o = {}) {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 3.2, B: 0.56, D: 0.24, F: 0.32, transom: true, crown: 0.1, fine: 0.75 });
  mesh(s.hull, gloss(o.hull ?? 0xf4f3ee), t); mesh(s.deck, gloss(o.deck ?? 0x1f6fd0), t);
  const cowl = mesh(new THREE.SphereGeometry(0.42, 16, 12), gloss(o.deck ?? 0x1f6fd0), t, 0, 0.5, -0.5); cowl.scale.set(1, 0.7, 1.9);
  box(t, 0.36, 0.2, 1.25, rubber, 0, 0.58, 0.55); box(t, 0.9, 0.05, 1.5, black, 0, 0.34, 0.6);
  const bar = new THREE.Group(); bar.position.set(0, 0.92, -0.22); t.add(bar); const hb = cyl(bar, 0.016, 0.016, 0.66, black, 0, 0, 0, 8); hb.rotation.z = Math.PI / 2; cyl(t, 0.03, 0.04, 0.3, black, 0, 0.78, -0.24, 8);
  const pe = person(t, { y: 0.62, z: 0.45, suit: o.suit ?? 0x20242b, pfd: o.pfd ?? 0xe6452b, hat: o.hat ?? 0x20242b, legs: 'ride' }); pe.body.rotation.x = -0.3;
  const base = finish(root, t, 0.02), h = V(0, 0, 0);
  // от первого лица корпус и голова не рисуются (иначе закрывают обзор), руки и весло остаются в кадре
  return { root, fp(on) { pe.body.visible = !on && true; }, update(b) { base(b); bar.rotation.y = -b.rudder * 0.5; E.copy(bar.rotation); for (let i = 0; i < 2; i++) pe.reach(i, h.set((i ? 1 : -1) * 0.3, 0, 0).applyEuler(E).add(bar.position)); pe.g.visible = !b.capsized; } };
}
// ---------- моторный катер (и на его основе -- катер милиции) ----------
function plate(text, w, h, bg, fg) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 96); g.fillStyle = fg; g.font = '800 62px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 52);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6 })); }
export function makeMotorboat(o = {}) {
  const pol = !!o.police, L = pol ? 8.6 : 5.8, B = pol ? 1.35 : 1.05, F = pol ? 0.75 : 0.55, root = new THREE.Group(), t = new THREE.Group();
  const s = shell({ L, B, D: pol ? 0.5 : 0.38, F, transom: true, crown: 0.05, fine: 0.72, sheerUp: 0.35 });
  mesh(s.hull, gloss(o.hull ?? (pol ? 0x8a949e : 0xf4f3ee)), t); mesh(s.deck, std(o.deck ?? 0xd9d6cc, 0.8), t);
  box(t, 2 * B - 0.25, 0.04, L * 0.5, std(0x9aa0a3, 0.9), 0, F * 0.55, L * 0.2); // кокпит
  const zc = -L * 0.06; let lights = null;
  if (pol) { box(t, 1.9, 1.15, 2.6, std(0xe8ebee, 0.5), 0, F + 0.6, zc); box(t, 1.92, 0.42, 2.0, std(0x10161d, 0.1, 0, { envMapIntensity: 1.5 }), 0, F + 0.82, zc - 0.25);
    for (const sd of [-1, 1]) { const p = plate('МИЛИЦИЯ', 2.6, 0.5, '#1d4f9e', '#ffffff'); p.position.set(sd * (B + 0.012), F * 0.55, 0.6); p.rotation.y = sd * Math.PI / 2; t.add(p); }
    cyl(t, 0.02, 0.02, 1.1, steel, 0, F + 1.7, zc + 0.6, 6); lights = [mesh(new THREE.BoxGeometry(0.34, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: 0x1640ff }), t, -0.22, F + 1.26, zc - 0.5), mesh(new THREE.BoxGeometry(0.34, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: 0xff2020 }), t, 0.22, F + 1.26, zc - 0.5)];
  } else { box(t, 1.5, 0.3, 0.5, gloss(o.hull ?? 0xf4f3ee), 0, F + 0.14, zc); const ws = box(t, 1.5, 0.42, 0.04, new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, transparent: true, opacity: 0.45 }), 0, F + 0.48, zc - 0.22); ws.rotation.x = -0.45;
    for (const sd of [-1, 1]) { box(t, 0.5, 0.12, 0.5, std(o.seat ?? 0x8c2f2a, 0.8), sd * 0.42, F * 0.55 + 0.34, zc + 0.75); box(t, 0.5, 0.5, 0.1, std(o.seat ?? 0x8c2f2a, 0.8), sd * 0.42, F * 0.55 + 0.62, zc + 1.02); } }
  const wheel = mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 16), black, t, -0.42, F + (pol ? 0.2 : 0.3), zc + 0.3); wheel.rotation.x = -1.0;
  const pe = person(t, { x: -0.42, y: F * 0.55 + 0.4, z: zc + 0.78, suit: o.suit ?? (pol ? 0x1d2b45 : 0x26486e), pfd: o.pfd ?? (pol ? 0x1d2b45 : 0xf2591b), hat: o.hat ?? (pol ? 0x1d2b45 : 0xf4f3ee) }); if (pol) pe.g.visible = false;
  const ob = new THREE.Group(); ob.position.set(0, F * 0.5, L / 2 + 0.08); t.add(ob); box(ob, 0.42, 0.62, 0.55, black, 0, 0.42, 0.22); box(ob, 0.1, 0.9, 0.22, std(0x30343a, 0.5), 0, -0.3, 0.2); cyl(ob, 0.02, 0.12, 0.2, steel, 0, -0.7, 0.34, 8).rotation.x = Math.PI / 2;
  for (const sd of [-1, 1]) { const r = cyl(t, 0.014, 0.014, L * 0.34, steel, sd * (s.bm(0.3) - 0.03), F * 1.22 + 0.2, -L * 0.2, 6); r.rotation.x = Math.PI / 2 - 0.05; r.rotation.y = -sd * 0.16; }
  const base = finish(root, t, 0.05), h = V(0, 0, 0);
  return { root, lights, fp(on) { if (!pol) pe.body.visible = !on; }, update(b, dt, tm) { base(b); ob.rotation.y = b.rudder * 0.5; wheel.rotation.z = -b.rudder * 1.5; if (!pol) for (let i = 0; i < 2; i++) pe.reach(i, h.set(wheel.position.x + (i ? 0.15 : -0.15), wheel.position.y, wheel.position.z + 0.05));
    if (lights) { const on = b.siren, f = Math.floor(tm * 5) % 2; lights[0].material.color.setHex(on && f ? 0x4a78ff : 0x0c1c55); lights[1].material.color.setHex(on && !f ? 0xff4040 : 0x4a1010); } } };
}
// ---------- туристический пароход ----------
function winTex(rows, cols, wall, glass) { const c = document.createElement('canvas'); c.width = 512; c.height = 64 * rows; const g = c.getContext('2d'); g.fillStyle = wall; g.fillRect(0, 0, c.width, c.height); g.fillStyle = glass;
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) g.fillRect(8 + i * (496 / cols), r * 64 + 16, 496 / cols - 8, 30);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; }
export function makeSteamer() {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 36, B: 3.4, D: 1.1, F: 1.7, crown: 0.1, sheerUp: 0.3, fine: 0.42, NS: 36, ex: 0.55 });
  mesh(s.hull, std(0xf1efe8, 0.5), t); mesh(s.deck, std(0x9a7a52, 0.8), t); box(t, 6.82, 0.5, 30, std(0x16202c, 0.6), 0, 0.15, 0.5).scale.set(1, 1, 1);
  const w1 = new THREE.MeshStandardMaterial({ map: winTex(1, 16, '#f6f4ee', '#1d2c3c'), roughness: 0.5 }), w2 = new THREE.MeshStandardMaterial({ map: winTex(1, 12, '#f6f4ee', '#1d2c3c'), roughness: 0.5 });
  box(t, 5.6, 2.3, 22, w1, 0, 2.95, 1); box(t, 6.4, 0.12, 24, std(0xe9e6dc, 0.6), 0, 4.16, 1); box(t, 4.6, 2.1, 15, w2, 0, 5.25, 0); box(t, 5.4, 0.12, 17, std(0xe9e6dc, 0.6), 0, 6.35, 0);
  box(t, 3.6, 1.7, 3.4, new THREE.MeshStandardMaterial({ map: winTex(1, 4, '#f6f4ee', '#1d2c3c'), roughness: 0.5 }), 0, 7.25, -5.2);
  const fn = cyl(t, 0.9, 1.05, 3.6, std(0xb8392e, 0.5), 0, 8.1, 2.5, 16); fn.rotation.x = -0.12; cyl(t, 0.93, 0.93, 0.5, black, 0, 9.75, 2.72, 16).rotation.x = -0.12;
  for (const sd of [-1, 1]) for (const z of [-3, 4]) { const lb = mesh(new THREE.CapsuleGeometry(0.42, 2.2, 3, 8), std(0xe6652b, 0.6), t, sd * 3.0, 4.9, z); lb.rotation.x = Math.PI / 2; }
  cyl(t, 0.06, 0.09, 6, std(0xe9e6dc, 0.5), 0, 9.3, -6, 8);
  const base = finish(root, t, 0.2); return { root, update: base };
}
// ---------- промысловое судно ----------
export function makeFishing() {
  const root = new THREE.Group(), t = new THREE.Group(), s = shell({ L: 15, B: 2.2, D: 0.9, F: 1.25, crown: 0.08, sheerUp: 0.6, fine: 0.5, ex: 0.6 });
  mesh(s.hull, std(0x1f4a3a, 0.6), t); mesh(s.deck, std(0x7d6a4c, 0.9), t); box(t, 4.45, 0.3, 11, std(0x7a1f1a, 0.7), 0, 0.02, 0.4);
  box(t, 2.9, 2.2, 3.2, new THREE.MeshStandardMaterial({ map: winTex(1, 3, '#e9e6dc', '#152330'), roughness: 0.6 }), 0, 2.55, 3.6); box(t, 3.3, 0.14, 3.7, std(0x8c2f2a, 0.6), 0, 3.72, 3.6);
  cyl(t, 0.09, 0.12, 6.4, std(0xd9d6cc, 0.5), 0, 4.6, 1.6, 8); const bm = cyl(t, 0.06, 0.06, 5.6, std(0xd9d6cc, 0.5), 0, 4.2, -1.1, 8); bm.rotation.x = 1.15;
  const drum = cyl(t, 0.55, 0.55, 2.2, std(0x30343a, 0.7), 0, 1.95, -3.2, 12); drum.rotation.z = Math.PI / 2; mesh(new THREE.TorusGeometry(0.5, 0.2, 6, 14), std(0xd27a1e, 0.9), t, 0, 1.95, -3.2).rotation.y = Math.PI / 2;
  for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(0.17, 8, 6), std(0xe6652b, 0.7), t, -1.7 + i * 0.28, 1.5, -5.2 + (i % 2) * 0.2); box(t, 1.6, 0.6, 1.1, std(0x2a6fb5, 0.8), 1.0, 1.6, 0.2);
  const base = finish(root, t, 0.15); return { root, update: base };
}
export const MODEL = { kayak: makeKayak, scull: makeScull, sup: makeSup, jetski: makeJetski, boat: makeMotorboat };
