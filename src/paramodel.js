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
