// Модели для параплана: купол из ячеек (дуга, профиль, клеванты тянут заднюю кромку, подсложение подворачивает
// консоль под крыло, фронтальное -- переднюю кромку), стропы до свободных концов, пилот в коконе с руками на клевантах;
// кучевые облака над термиками, кружащие птицы, цилиндры маршрута, лебёдка с тросом, колдун, мишень и пятно тени.
// Ось модели: нос в -z, вверх +y, правое крыло +x. Начало -- карабины пилота.
import * as THREE from 'three';
import { clamp, smooth } from './sim.js';
import { WING } from './para.js';

const NS = 44, NC = 9, ARC = 0.86, HANG = WING.hang; // ячеек по размаху, точек по хорде, полуугол дуги, длина строп
const std = (c, r = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, envMapIntensity: 0.5, ...extra });
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
function limb(m, a, b, r) { m.position.copy(a).add(b).multiplyScalar(0.5); const d = b.clone().sub(a), l = d.length() || 1e-3; m.scale.set(r, l, r); m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); }
const G_LIMB = new THREE.CylinderGeometry(1, 1, 1, 7);

// ---------- крыло и пилот ----------
// pal: [основной, полоса, кромка], suit -- цвет кокона, helmet -- шлема
export function makeGlider(pal = [0xff6a1a, 0xffffff, 0x1d3f8f], suit = 0x22303f, helmet = 0xf2f2f2) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const pivot = new THREE.Group(); pivot.position.y = 0.45; root.add(pivot); // крыло качается вокруг карабинов
  // профиль: s -- от передней кромки (0) к задней (1); толщина верх/низ в долях хорды
  const prof = (s) => { const t = 0.16 * (1.48 * Math.sqrt(s) - 0.63 * s - 1.76 * s * s + 1.42 * s ** 3 - 0.51 * s ** 4); return [t * 1.0, -t * 0.45]; };
  const nV = (NS + 1) * NC * 2, pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3), base = new Float32Array(nV * 3), meta = new Float32Array(nV * 3); // meta: u, s, сторона (верх 1 / низ -1)
  const cA = new THREE.Color(pal[0]), cB = new THREE.Color(pal[1]), cC = new THREE.Color(pal[2]), dark = new THREE.Color(0x1a1a1a);
  let k = 0;
  for (let side = 0; side < 2; side++) for (let i = 0; i <= NS; i++) for (let j = 0; j < NC; j++) {
    const u = (i / NS) * 2 - 1, s = j / (NC - 1), a = u * ARC, chord = 2.75 * Math.sqrt(1 - 0.72 * u * u), le = -0.52 * chord - 0.25 * (1 - u * u) * 0.2;
    const [tu, tl] = prof(s), t = side === 0 ? tu : tl, rad = HANG + t * chord, x = Math.sin(a) * rad, y = Math.cos(a) * rad, z = le + s * chord;
    base[k * 3] = x; base[k * 3 + 1] = y; base[k * 3 + 2] = z; meta[k * 3] = u; meta[k * 3 + 1] = s; meta[k * 3 + 2] = side === 0 ? 1 : -1;
    const cell = Math.floor(((u + 1) / 2) * 22); let c = cell % 7 === 3 ? cB : Math.abs(u) > 0.78 ? cC : cA; if (side === 1) c = c.clone().multiplyScalar(0.72); if (s < 0.06 && side === 1) c = dark;
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; k++; }
  pos.set(base);
  const idx = []; const at = (side, i, j) => side * (NS + 1) * NC + i * NC + j;
  for (let side = 0; side < 2; side++) for (let i = 0; i < NS; i++) for (let j = 0; j < NC - 1; j++) { const a = at(side, i, j), b = at(side, i + 1, j), c = at(side, i + 1, j + 1), d = at(side, i, j + 1); if (side === 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
  for (let i = 0; i < NS; i++) { const a = at(0, i, 0), b = at(0, i + 1, 0), c = at(1, i + 1, 0), d = at(1, i, 0); idx.push(a, d, c, a, c, b); } // передняя кромка (воздухозаборники)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const canopy = new THREE.Mesh(geo, std(0xffffff, 0.62, { vertexColors: true, side: THREE.DoubleSide })); canopy.castShadow = true; canopy.frustumCulled = false; pivot.add(canopy);
  // стропы: три ряда (A, B, C) в восьми точках по размаху и тормозные к задней кромке
  const att = []; for (const u of [-0.9, -0.66, -0.42, -0.16, 0.16, 0.42, 0.66, 0.9]) { for (const s of [0.08, 0.34, 0.62]) att.push({ u, s, br: false }); }
  for (const u of [-0.85, -0.6, -0.34, 0.34, 0.6, 0.85]) att.push({ u, s: 1, br: true });
  const lpos = new Float32Array(att.length * 6), lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lpos, 3)), new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.45 }));
  lines.frustumCulled = false; pivot.add(lines);
  // пилот: кокон, туловище, шлем, руки к клевантам
  const pilot = new THREE.Group(); root.add(pilot);
  const sm = std(suit, 0.8), pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.05, 4, 10), sm); pod.rotation.x = -(Math.PI / 2 - 0.2); pod.position.set(0, -0.12, -0.42); pilot.add(pod);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), std(0x3b4652, 0.8)); torso.position.set(0, 0.32, 0.12); torso.rotation.x = 0.35; pilot.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), std(helmet, 0.35)); head.position.set(0, 0.74, 0.22); pilot.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, -0.9, 1.8, 1.1, 0.7), std(0x111a22, 0.15, { metalness: 0.3 })); visor.position.copy(head.position); visor.rotation.y = Math.PI; pilot.add(visor);
  const reserve = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.22), std(pal[2], 0.7)); reserve.position.set(0, 0.06, -0.3); pilot.add(reserve);
  const arm = (sx) => { const up = new THREE.Mesh(G_LIMB, sm), lo = new THREE.Mesh(G_LIMB, sm), hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), std(0x1b1b1b)); pilot.add(up, lo, hand); return { up, lo, hand, sx }; };
  const arms = [arm(-1), arm(1)];
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  const tmp = V(0, 0, 0), sh = V(0, 0, 0), el = V(0, 0, 0), hd = V(0, 0, 0), q = new THREE.Vector3();
  // форма купола: клеванты, подсложение, фронтальное, сваливание, подъём с земли
  function shape(g, t) {
    const up = clamp(g.wingUp ?? 1, 0, 1), fl = 0.25 + 0.75 * up, cs = g.colSide || 0, cf = g.col || 0, fr = g.front || 0, st = g.stall ? 1 : 0, flut = (g.turb || 0) * 0.04;
    for (let n = 0; n < nV; n++) { const u = meta[n * 3], s = meta[n * 3 + 1], sd = meta[n * 3 + 2]; let x = base[n * 3], y = base[n * 3 + 1], z = base[n * 3 + 2];
      // клеванта: задняя кромка своей стороны уходит вниз (к пилоту)
      const br = u > 0 ? g.R || 0 : g.L || 0, wgt = smooth(0.05, 0.8, Math.abs(u)) * Math.max(0, (s - 0.55) / 0.45) ** 2, dn = br * 0.9 * wgt + st * 0.5 * s * s;
      const a = u * ARC; x -= Math.sin(a) * dn; y -= Math.cos(a) * dn; z += dn * 0.25;
      // подсложение: консоль за линией сгиба поворачивается вокруг хорды и уходит под крыло
      if (cf > 0 && u * cs > 0) { const uf = 1 - 1.5 * cf, au = Math.abs(u); if (au > uf) { const tt = (au - uf) / Math.max(0.05, 1 - uf), ang = cs * (2.5 * smooth(0, 1, tt) + Math.sin(t * 13 + u * 9) * 0.08); const px = Math.sin(uf * ARC * cs) * HANG, py = Math.cos(uf * ARC) * HANG;
        const dx = x - px, dy = y - py, ca = Math.cos(ang), sa = Math.sin(ang); x = px + dx * ca + dy * sa; y = py - dx * sa + dy * ca; } }
      // фронтальное: передняя кромка подворачивается вниз и назад
      if (fr > 0 && s < 0.5) { const w = (0.5 - s) / 0.5 * fr; y -= w * 1.6 * Math.cos(a); z += w * 1.1; }
      // на земле крыло сплющено и лежит позади; дрожь от болтанки
      y = HANG + (y - HANG) * 1 + (1 - fl) * (HANG - y) * 0.85; x *= 0.85 + 0.15 * fl;
      const f = flut * Math.sin(t * 17 + u * 11 + s * 5); y += f * sd;
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; }
    geo.attributes.position.needsUpdate = true; if ((shape.n = (shape.n || 0) + 1) % 3 === 0) geo.computeVertexNormals();
    // стропы: к нижней поверхности -> к карабину своей стороны; тормозные -- к руке
    let m = 0; const hy = [0.62 + 0.55 * (1 - (g.L || 0)), 0.62 + 0.55 * (1 - (g.R || 0))];
    for (const p of att) { const i = Math.round((p.u + 1) / 2 * NS), j = Math.round(p.s * (NC - 1)), n = at(1, i, j);
      lpos[m++] = pos[n * 3]; lpos[m++] = pos[n * 3 + 1]; lpos[m++] = pos[n * 3 + 2];
      const sx = p.u < 0 ? -1 : 1; if (p.br) { lpos[m++] = sx * 0.3; lpos[m++] = hy[sx < 0 ? 0 : 1] - 0.45; lpos[m++] = 0.15; } else { lpos[m++] = sx * 0.21; lpos[m++] = 0.62; lpos[m++] = 0.02; } }
    lines.geometry.attributes.position.needsUpdate = true;
    for (const A of arms) { const b = A.sx < 0 ? g.L || 0 : g.R || 0; sh.set(A.sx * 0.22, 0.55, 0.12); hd.set(A.sx * 0.32, 0.62 + 0.55 * (1 - b), 0.15 - b * 0.12);
      el.copy(sh).lerp(hd, 0.5); el.x += A.sx * 0.12; el.z += 0.08; limb(A.up, sh, el, 0.055); limb(A.lo, el, hd, 0.047); A.hand.position.copy(hd); }
  }
  return {
    root, pivot, canopy,
    // g -- Glider; положение пилота в мире: (X, Z, -Y)
    update(g, dt, t) { const standing = g.mode === 'landed' || g.mode === 'launch' || (g.mode === 'tow' && g.wingUp < 1);
      root.position.set(g.X, g.Z + (standing ? 1.05 : 0.15), -g.Y); root.rotation.set(0, -g.th, -(g.phi || 0) * 0.92);
      pivot.rotation.set(-(g.pitch || 0), 0, (g.mode === 'air' ? 0 : (g.wingOff || 0) * 0.5) + (g.phi || 0) * 0.08);
      // на земле купол лежит плашмя позади пилота; при подъёме сначала встаёт передняя кромка
      const up = clamp(g.wingUp ?? 1, 0, 1), th = Math.max(0, -(g.pitch || 0)); canopy.rotation.x = -th * (1 - up * 0.6); canopy.position.y = -(1 - up) * 1.1; lines.visible = up > 0.4;
      pilot.rotation.x = standing ? -1.3 : 0; pilot.position.y = standing ? -0.2 : 0;
      shape(g, t); },
    // вид глазами пилота: голову не рисуем
    fp(on) { head.visible = visor.visible = !on; },
  };
}

// ---------- облака над термиками ----------
// Кучевое -- шапка из 9-13 шаров с плоским основанием на базе. Растёт, пока термик жив, потом тает и редеет.
export function makeClouds(scene, max = 64) {
  const PER = 12, geo = new THREE.IcosahedronGeometry(1, 2), mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x4d5866 });
  const im = new THREE.InstancedMesh(geo, mat, max * PER); im.frustumCulled = false; im.count = 0; scene.add(im);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = { x: 0, y: 0, R: 0 };
  const rr = (id, k) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { mesh: im,
    update(air, t) { let n = 0; const base = air.sky.base;
      for (const o of air.list) { if (o.cloud <= 0.01 || n >= max) continue; air.center(o, base, C); const dying = o.age >= o.life, c = o.cloud, sz = (130 + o.w0 * 70) * (0.35 + 0.65 * c);
        for (let k = 0; k < PER; k++) { const a = rr(o.id, k) * 6.283, d = Math.sqrt(rr(o.id, k + 20)) * sz * 0.9, r = sz * (0.32 + 0.4 * rr(o.id, k + 40)) * (k < 3 ? 1.25 : 1), lift = r * 0.55 + rr(o.id, k + 60) * sz * 0.45 * c;
          P.set(C.x + Math.cos(a) * d + Math.sin(t * 0.03 + k) * 6, base + lift + (dying ? (1 - c) * 120 : 0), -(C.y + Math.sin(a) * d)); S.set(r, r * (0.62 + 0.25 * c), r).multiplyScalar(dying ? 0.6 + 0.4 * c : 1);
          M.compose(P, Q, S); im.setMatrixAt(n * PER + k, M); } n++; }
      im.count = n * PER; im.instanceMatrix.needsUpdate = true; } };
}

// ---------- птицы: орлы кружат в сильных термиках ----------
export function makeBirds(scene, max = 18) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, -1.6, 0.25, 0.25, 0, 0, 0.35, 0, 0, -0.5, 0, 0, 0.35, 1.6, 0.25, 0.25], 3)); g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x2a2018, side: THREE.DoubleSide }), max); im.frustumCulled = false; im.count = 0; scene.add(im);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), S = new THREE.Vector3(), P = new THREE.Vector3(), C = { x: 0, y: 0, R: 0 };
  return { update(air, t) { let n = 0;
    for (const o of air.list) { if (o.id % 3 !== 0 || o.w0 < 2.2 || air.env(o) < 0.5) continue; for (let k = 0; k < 2 && n < max; k++) { const z = air.top(o) - 260 - k * 180 - ((o.id * 37) % 200); if (z < o.zg + 80) continue;
        air.center(o, z, C); const a = t * (0.32 + 0.05 * k) * (k ? -1 : 1) + o.id + k * 2.1, r = 26 + k * 9; P.set(C.x + Math.cos(a) * r, z + Math.sin(t * 0.4 + k) * 4, -(C.y + Math.sin(a) * r));
        E.set(0.0, -a + (k ? 0 : Math.PI), (k ? 0.45 : -0.45)); Q.setFromEuler(E); const fl = 1 + 0.15 * Math.sin(t * 2 + k); S.set(fl, 1, 1).multiplyScalar(1.15); M.compose(P, Q, S); im.setMatrixAt(n++, M); } }
    im.count = n; im.instanceMatrix.needsUpdate = true; } };
}

// ---------- цилиндры маршрута ----------
const CYL_V = `varying vec2 vU; varying float vY; void main(){ vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CYL_F = `uniform vec3 uCol; uniform float uA, uT; varying vec2 vU; varying float vY;
void main(){ float stripe = step(0.5, fract(vU.x * 48.0 + vU.y * 6.0 - uT * 0.15)); float band = smoothstep(0.0, 0.04, vU.y) * (1.0 - smoothstep(0.82, 1.0, vU.y));
  float a = uA * band * (0.35 + 0.35 * stripe); gl_FragColor = vec4(uCol, a); }`;
export function makeCylinder(scene, X, Y, R, z0, z1, color = 0xff8a2a) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: 0.5 }, uT: { value: 0 } }, vertexShader: CYL_V, fragmentShader: CYL_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, z1 - z0, 96, 1, true), mat); m.position.set(X, (z0 + z1) / 2, -Y); m.renderOrder = 5; scene.add(m);
  return { mesh: m, set(col, a, t) { mat.uniforms.uCol.value.set(col); mat.uniforms.uA.value = a; mat.uniforms.uT.value = t; }, dispose() { scene.remove(m); m.geometry.dispose(); mat.dispose(); } };
}

// ---------- земля: лебёдка, колдун, мишень, тень ----------
export function makeWinch() { const g = new THREE.Group(), body = std(0xe8e3d6, 0.6), dk = std(0x2a2d31, 0.8);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  box(2.2, 1.6, 4.6, body, 0, 1.25, 0.6); box(2.1, 1.3, 1.6, std(0x2c6fb8, 0.5), 0, 1.15, -2.3); box(1.9, 0.5, 1.2, std(0x9fc4e8, 0.1), 0, 1.55, -2.35);
  for (const [x, z] of [[-1.05, -1.9], [1.05, -1.9], [-1.05, 1.6], [1.05, 1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), dk); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w); }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 14), std(0xb7372c, 0.5)); drum.rotation.z = Math.PI / 2; drum.position.set(0, 2.3, 2.4); g.add(drum); return g; }
export function makeWindsock() { const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6), std(0xdddddd, 0.4)); pole.position.y = 3; g.add(pole);
  const sock = new THREE.Group(); sock.position.y = 5.8; g.add(sock);
  for (let i = 0; i < 5; i++) { const r0 = 0.32 - i * 0.04, r1 = 0.32 - (i + 1) * 0.04, m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.5, 12, 1, true), std(i % 2 ? 0xffffff : 0xff5a1a, 0.7, { side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.z = -(0.25 + i * 0.5); sock.add(m); }
  return { root: g, update(wx, wy, t) { const U = Math.hypot(wx, wy); sock.rotation.order = 'YXZ'; sock.rotation.y = Math.atan2(wx, wy) + Math.PI + Math.sin(t * 3.1) * 0.08 * Math.min(1, U / 4); sock.rotation.x = -(1 - smooth(0.5, 7, U)) * 1.2; } }; }
export function makeTarget() { const g = new THREE.Group(); const ring = (r0, r1, c) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color: c, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true })); m.rotation.x = -Math.PI / 2; g.add(m); };
  ring(0, 1.0, 0xff5a1a); ring(1.0, 5, 0xffffff); ring(5, 5.6, 0xff5a1a); ring(10, 10.6, 0xffffff); ring(20, 20.8, 0xff5a1a);
  const x = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.5), new THREE.MeshBasicMaterial({ color: 0xff5a1a, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); x.rotation.x = -Math.PI / 2; x.rotation.z = Math.PI / 4; g.add(x); const x2 = x.clone(); x2.rotation.z = -Math.PI / 4; g.add(x2); return g; }
export function makeShadow() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 4; return m; }
export function makeTowLine() { const pos = new Float32Array(6), l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: 0xffe14a })); l.frustumCulled = false;
  return { line: l, set(a, b) { pos[0] = a.x; pos[1] = a.y; pos[2] = a.z; pos[3] = b.x; pos[4] = b.y; pos[5] = b.z; l.geometry.attributes.position.needsUpdate = true; } }; }
