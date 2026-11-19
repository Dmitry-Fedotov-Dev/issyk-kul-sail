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

// ---------- подсказки полёта: видимый воздух, след, вектор ----------
// Пух в воздухе вокруг пилота: в восходящем потоке летит вверх (светлый, зелёный), в нисходящем -- вниз (красноватый),
// в ровном воздухе почти не виден. Так в настоящем небе поток выдают пух тополя, насекомые и пыль.
export function makeAirDust(scene, N = 900) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), w = new Float32Array(N), life = new Float32Array(N), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const dc = document.createElement('canvas'); dc.width = dc.height = 32; { const x = dc.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); }
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4.5, map: new THREE.CanvasTexture(dc), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, fog: false }));
  pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts); const S = {}; let k = 0;
  const seed = (i, cx, cy, cz) => { const a = Math.random() * 6.283, r = 15 + Math.sqrt(Math.random()) * 260; pos[i * 3] = cx + Math.cos(a) * r; pos[i * 3 + 1] = cz + (Math.random() - 0.5) * 170; pos[i * 3 + 2] = cy + Math.sin(a) * r; life[i] = 4 + Math.random() * 6; w[i] = 0; };
  for (let i = 0; i < N; i++) seed(i, 0, 0, -1e5);
  return { points: pts,
    update(air, g, dt, on) { pts.visible = on; if (!on) return; const cx = g.X, cy = -g.Y, cz = g.Z;
      for (let n = 0; n < 110; n++) { const i = k++ % N, X = pos[i * 3], Y = -pos[i * 3 + 2], Z = pos[i * 3 + 1]; // по 70 пушинок за кадр спрашиваем воздух
        if (Math.hypot(X - g.X, Y - g.Y) > 300 || Math.abs(Z - cz) > 110 || life[i] <= 0) { seed(i, cx, cy, cz); continue; }
        air.sample(X, Y, Z, S); w[i] = S.w; const gz = air.ground(X, Y); if (Z < gz + 3) life[i] = 0; }
      for (let i = 0; i < N; i++) { life[i] -= dt; const v = w[i]; pos[i * 3 + 1] += v * dt * 2.2; // ускорено вдвое: движение заметно издали
        const a = smooth(0.35, 1.6, Math.abs(v)) * Math.min(1, life[i]);
        const o = i * 4; if (v > 0) { col[o] = 0.2; col[o + 1] = 0.95; col[o + 2] = 0.45; } else { col[o] = 1.0; col[o + 1] = 0.3; col[o + 2] = 0.22; } col[o + 3] = a * 0.9; }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; } };
}
// след за пилотом: лента, цвет по вариометру (зелёный -- набор, синий -- обычное снижение, красный -- сильный спуск)
export function makeTrail(scene, N = 240) {
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3), geo = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })); m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
  const P = []; let acc = 0;
  return { mesh: m, reset() { P.length = 0; },
    update(g, dt, on) { m.visible = on && P.length > 1; if (!on) return; acc += dt; if (g.mode === 'air' && acc > 0.25) { acc = 0; P.push([g.X, g.Z + 0.2, -g.Y, g.vario]); if (P.length > N) P.shift(); }
      for (let i = 0; i < N; i++) { const p = P[Math.min(i, P.length - 1)] || [g.X, g.Z, -g.Y, 0], f = i / N, h = 0.12 + 0.1 * f, v = p[3];
        const c = v > 0.2 ? [0.25, 0.95, 0.45] : v < -2 ? [1, 0.3, 0.25] : [0.35, 0.7, 1]; const a = (P.length > i ? 1 : 0) * (0.2 + 0.8 * (i / Math.max(1, P.length)));
        for (let q = 0; q < 2; q++) { const o = (i * 2 + q) * 3; pos[o] = p[0]; pos[o + 1] = p[1] + (q ? h : -h); pos[o + 2] = p[2]; col[o] = c[0] * a; col[o + 1] = c[1] * a; col[o + 2] = c[2] * a; } }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; } };
}
// вектор полёта: куда реально несёт (с ветром и снижением) и где коснёмся земли, если лететь прямо
export function makeVector(scene) {
  const lp = new Float32Array(6), line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lp, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  line.frustumCulled = false; scene.add(line);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })); scene.add(head);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 7, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6 })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const d = new THREE.Vector3(), Q = new THREE.Quaternion(), UPv = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  return { update(g, air, on) { const vis = on && g.mode === 'air'; line.visible = head.visible = ring.visible = vis; if (!vis) return;
    const k = 2.2; d.set(g.gx, g.vz, -g.gy); const L = d.length() || 1; col.set(g.vz > 0.2 ? 0x58d68d : g.vz < -2.5 ? 0xff5a46 : 0xffffff); line.material.color.copy(col); head.material.color.copy(col); ring.material.color.copy(col);
    lp[0] = g.X; lp[1] = g.Z + 0.3; lp[2] = -g.Y; lp[3] = g.X + d.x * k; lp[4] = g.Z + 0.3 + d.y * k; lp[5] = -g.Y + d.z * k; line.geometry.attributes.position.needsUpdate = true;
    head.position.set(lp[3], lp[4], lp[5]); Q.setFromUnitVectors(UPv, d.clone().multiplyScalar(1 / L)); head.quaternion.copy(Q);
    // точка касания по прямой (с нынешним снижением и ветром)
    let x = g.X, y = g.Y, z = g.Z, hit = false; if (g.vz < -0.05) for (let i = 0; i < 400; i++) { x += g.gx * 2; y += g.gy * 2; z += g.vz * 2; if (z <= air.ground(x, y)) { hit = true; break; } }
    ring.visible = hit; if (hit) { ring.position.set(x, air.ground(x, y) + 0.4, -y); const s = 1 + Math.hypot(x - g.X, y - g.Y) / 900; ring.scale.setScalar(s); } } };
}

// ---------- воздух полосами ----------
// Тонкие пастельные полосы вдоль движения воздуха: появляются, тянутся и тают. Цвет -- «температура»: тёплый подъём --
// блёкло-жёлтый и блёкло-зелёный, ровный воздух -- серо-голубой, холодный спуск -- синева; штормовой мокрый ветер у
// нуля градусов -- сине-чёрные полосы. Вертикальное движение показано втрое крупнее: термик виден как струи вверх.
const ST_V = `attribute vec3 iPos; attribute vec4 iDir; attribute vec4 iCol; varying vec4 vCol; varying vec2 vUv;
void main(){ vec3 d = iDir.xyz; vec3 p = iPos + d * (position.y - 0.5) * iDir.w; vec3 vw = normalize(cameraPosition - p);
  vec3 sd = normalize(cross(d, vw) + 1e-5); float w = max(0.06, distance(cameraPosition, p) * 0.0036); p += sd * position.x * w;
  vCol = iCol; vUv = vec2(position.x, position.y); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const ST_F = `varying vec4 vCol; varying vec2 vUv; void main(){ float a = vCol.a * pow(sin(3.14159 * vUv.y), 1.5) * (1.0 - abs(vUv.x) * 1.2); gl_FragColor = vec4(vCol.rgb, a); }`;
export function makeStreaks(scene, N = 760) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1); base.translate(0, 0.5, 0); const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const iPos = new Float32Array(N * 3), iDir = new Float32Array(N * 4), iCol = new Float32Array(N * 4);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3)); geo.setAttribute('iDir', new THREE.InstancedBufferAttribute(iDir, 4)); geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 4)); geo.instanceCount = N;
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: ST_V, fragmentShader: ST_F, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = 6; scene.add(m);
  const S = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N), a: new Float32Array(N), r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N) }, A = {};
  const mix = (a, b, t) => a + (b - a) * t;
  function spawn(i, air, g, env) { const ang = Math.random() * 6.283, rr = 8 + Math.random() ** 1.6 * 220, X = g.X + Math.sin(ang) * rr, Y = g.Y + Math.cos(ang) * rr, Z = g.Z + (Math.random() - 0.45) * 120;
    const gz = air.ground(X, Y); if (Z < gz + 4) { S.life[i] = 0; S.a[i] = 0; return; } air.sample(X, Y, Z, A); const w = A.w, U = Math.hypot(A.wx, A.wy);
    S.x[i] = X; S.y[i] = Z; S.z[i] = -Y; S.vx[i] = A.wx; S.vy[i] = w * 3; S.vz[i] = -A.wy; S.max[i] = S.life[i] = 2.5 + Math.random() * 3.5;
    // цвет и видимость
    const cold = Math.min(1, env.storm * 0.8 + smooth(900, 2400, Z) * 0.35 + env.night * 0.3), wind = smooth(4.5, 10, U) * (0.4 + 0.6 * env.storm);
    let r, gg, b, a;
    if (w > 0.25) { const k = smooth(0.3, 3, w); r = mix(0.99, 0.6, k); gg = mix(0.86, 0.86, k); b = mix(0.42, 0.46, k); a = 0.45 + 0.4 * smooth(0.3, 2, w); }
    else if (w < -0.4) { const k = smooth(0.4, 3, -w); r = mix(0.66, 0.36, k); gg = mix(0.76, 0.48, k); b = mix(0.9, 0.78, k); a = 0.3 + 0.4 * k; }
    else { if (U < 6 && Math.random() < 0.7) { S.life[i] = 0; S.a[i] = 0; return; } r = 0.74; gg = 0.8; b = 0.86; a = 0.1 + 0.25 * smooth(3, 9, U); } // ровный воздух -- редкие бледные штрихи
    const dk = Math.min(1, cold * smooth(4, 9, U) * 2.2); if (dk > 0) { r = mix(r, 0.06, dk); gg = mix(gg, 0.08, dk); b = mix(b, 0.15, dk); a = Math.max(a, 0.6 * dk); } void wind; // пронизывающий мокрый холод -- чёрные полосы
    S.r[i] = r; S.g[i] = gg; S.b[i] = b; S.a[i] = a * (1 - (env.gustBurst ? 0 : 0)); }
  let k = 0;
  return { mesh: m,
    update(air, g, dt, on, env) { m.visible = on; if (!on) return; const n = env.gustBurst ? 70 : 34;
      for (let q = 0; q < n; q++) { const i = k++ % N; if (S.life[i] <= 0 || q < 6) spawn(i, air, g, env); }
      for (let i = 0; i < N; i++) { S.life[i] -= dt; const L = S.life[i]; if (L <= 0) { iCol[i * 4 + 3] = 0; continue; }
        S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt * 0.6; S.z[i] += S.vz[i] * dt; const sp = Math.hypot(S.vx[i], S.vy[i], S.vz[i]) || 1, f = L / S.max[i];
        iPos[i * 3] = S.x[i]; iPos[i * 3 + 1] = S.y[i]; iPos[i * 3 + 2] = S.z[i]; iDir[i * 4] = S.vx[i] / sp; iDir[i * 4 + 1] = S.vy[i] / sp; iDir[i * 4 + 2] = S.vz[i] / sp; iDir[i * 4 + 3] = clamp(sp * 1.1, 3, 18) * (0.5 + 0.5 * Math.sin(Math.PI * f));
        iCol[i * 4] = S.r[i]; iCol[i * 4 + 1] = S.g[i]; iCol[i * 4 + 2] = S.b[i]; iCol[i * 4 + 3] = S.a[i] * Math.sin(Math.PI * f); }
      for (const a of ['iPos', 'iDir', 'iCol']) geo.attributes[a].needsUpdate = true; } };
}
