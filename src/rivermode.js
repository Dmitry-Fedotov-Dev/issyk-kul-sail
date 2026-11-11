// Сплав по Чон-Ак-Суу. Геометрия -- из river.js (русло и борта ущелья по карте высот). Здесь из неё строятся рельеф
// коридора, наклонная лента воды, камни, а для физики -- течение, уровень воды и берега.
import * as THREE from 'three';
import { RIVER } from './river.js';
import { CURVE, GLSL_COMMON, END, terrainMaterial, ENV } from './world.js';
import { FOAM_GLSL } from './foam.js';
import { clamp, smooth } from './sim.js';

export const RIVER_HOLES = (() => { const o = []; for (let i = 0; i < RIVER.x.length; i += 12) o.push({ X: RIVER.x[i], Y: RIVER.y[i], r: 1500 }); return o; })();
export function makeRiver(scene, farH) {
  const R = RIVER, n = R.x.length, offs = R.offs, m = offs.length, STEP = R.step, HW = 7.2;
  const slope = new Float32Array(n), spd = new Float32Array(n), rap = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(i - 3, 0), b = Math.min(i + 3, n - 1), s = (R.z[a] - R.z[b]) / ((b - a) * STEP); slope[i] = s; spd[i] = clamp(1.3 + 15 * Math.sqrt(Math.max(s, 0)), 1.6, 6.2); rap[i] = smooth(0.035, 0.085, s); }
  // --- рельеф коридора ---
  const pos = new Float32Array(n * m * 3), aH = new Float32Array(n * m), idx = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const o = offs[j], ao = Math.abs(o), k = smooth(40, 300, ao); let nx = R.nlx[i] * (1 - k) + R.nsx[i] * k, ny = R.nly[i] * (1 - k) + R.nsy[i] * k; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    const X = R.x[i] + nx * o, Y = R.y[i] + ny * o; let h = R.h[i * m + j]; if (ao >= 1200) { const fh = farH(X, Y) - 12; h = ao >= 1700 ? fh : (h + fh) / 2; }
    const q = i * m + j; pos[q * 3] = X; pos[q * 3 + 1] = h; pos[q * 3 + 2] = -Y; aH[q] = h; }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + 1, c = a + m, d = c + 1; idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('aH', new THREE.BufferAttribute(aH, 1)); tg.setIndex(idx); tg.computeVertexNormals();
  const na = tg.attributes.normal; for (let i = 0; i < na.count; i++) if (na.getY(i) < 0) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i));
  const tm = terrainMaterial(); tm.side = THREE.DoubleSide; const terrain = new THREE.Mesh(tg, tm); terrain.frustumCulled = false;
  // --- вода: наклонная лента по руслу ---
  const cols = [-HW - 2, -HW * 0.55, 0, HW * 0.55, HW + 2], wp = [], wa = [], wi = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < 5; j++) { const o = cols[j]; wp.push(R.x[i] + R.nlx[i] * o, R.z[i] + 0.02, -(R.y[i] + R.nly[i] * o)); wa.push(i * STEP, o / HW, rap[i], spd[i]); }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 1, c = a + 5, d = c + 1; wi.push(a, b, c, b, d, c); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('aw', new THREE.Float32BufferAttribute(wa, 4)); wg.setIndex(wi);
  const wm = new THREE.ShaderMaterial({ uniforms: { ...ENV, uT: { value: 0 } }, defines: { FBM_OCT: 3, RIP_OCT: 3, SHN: 6 }, side: THREE.DoubleSide, extensions: { derivatives: true },
    vertexShader: CURVE + `attribute vec4 aw; uniform float uT; varying vec4 vA; varying vec3 vP;
void main(){ vA=aw; vec3 q=position; q.y+=aw.z*(0.22*sin(aw.x*0.85)*cos(aw.y*1.3)+0.06*sin(aw.x*2.3+uT*3.)); vP=q; q.y-=curve(q); gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.); }`,
    fragmentShader: GLSL_COMMON + FOAM_GLSL + `uniform float uT; varying vec4 vA; varying vec3 vP;
void main(){ float s=vA.x, u=vA.y, rp=vA.z, v=vA.w, dist=length(vP-cameraPosition); vec2 fl=vec2(u*7.2, s-uT*v*0.85);
  float str=fvn(vec2(u*5., fl.y*0.10))*0.6+fvn(vec2(u*11., fl.y*0.32))*0.4;                 // струи вдоль течения
  vec3 col=mix(vec3(0.10,0.33,0.36), vec3(0.36,0.62,0.62), 0.35+0.5*str)*(0.55+0.55*uSunI); // ледниковая вода: мутно-бирюзовая
  col=mix(col, skyBase(normalize(vec3(0.,1.,0.25))), 0.16);
  float edge=smoothstep(0.72,1.0,abs(u)), mfoam=clamp(rp*0.5*(0.55+0.45*sin(s*0.85+1.6))+edge*0.3*(0.4+rp)+rp*str*0.12,0.,1.);
  if(mfoam>0.03){ float t=foamTex(fl*0.9,uT)*0.8+str*0.3, th=1.08-mfoam, aa=0.1+fwidth(t)*1.2; col=mix(col, vec3(0.96,0.98,1.)*(0.7+0.3*uSunI), smoothstep(th-aa,th+aa,t)*0.92); }
  col=applyFog(col,dist,vP.y); gl_FragColor=vec4(col,1.); ${END} }` });
  const water = new THREE.Mesh(wg, wm); water.frustumCulled = false;
  // --- камни: гуще на порогах ---
  let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, rocks = [];
  for (let i = 34; i < n - 34; i++) if (rnd() < 0.035 + 0.2 * rap[i]) { const o = (rnd() * 2 - 1) * (HW - 1.2), r = 0.4 + rnd() * 0.6; rocks.push({ X: R.x[i] + R.nlx[i] * o, Y: R.y[i] + R.nly[i] * o, z: R.z[i], r, i }); }
  const rm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.95, flatShading: true }), rocks.length), dm = new THREE.Object3D();
  rocks.forEach((k, i) => { dm.position.set(k.X, k.z - k.r * 0.25, -k.Y); dm.scale.set(k.r * (0.95 + rnd() * 0.2), k.r * (0.7 + rnd() * 0.3), k.r * (0.95 + rnd() * 0.2)); dm.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); dm.updateMatrix(); rm.setMatrixAt(i, dm.matrix); });
  rm.frustumCulled = false; rm.castShadow = true;
  // ворота старта и финиша
  const gate = (i, c) => { const g = new THREE.Group(); for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.5, 8), new THREE.MeshStandardMaterial({ color: c })); p.position.set(R.x[i] + R.nlx[i] * sd * (HW + 0.8), R.z[i] + 2.2, -(R.y[i] + R.nly[i] * sd * (HW + 0.8))); g.add(p); }
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW + 1.6, 0.7), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); bn.position.set(R.x[i], R.z[i] + 4.2, -R.y[i]); bn.rotation.y = Math.atan2(R.nlx[i], -R.nly[i]) + Math.PI / 2; g.add(bn); return g; };
  const I0 = 32, I1 = n - 34, group = new THREE.Group(); group.add(terrain, water, rm, gate(I0 + 3, 0x2f7de2), gate(I1, 0xff7a1a)); group.visible = false; scene.add(group);
  // --- геометрия для физики ---
  let last = I0; const L = { i: 0, f: 0, d: 0, s: 0 };
  function locate(X, Y) { let best = 1e18, bi = last, bf = 0, bd = 0; const scan = (a, b) => { for (let i = Math.max(0, a); i < Math.min(n - 1, b); i++) { const ax = R.x[i], ay = R.y[i], dx = R.x[i + 1] - ax, dy = R.y[i + 1] - ay, l2 = dx * dx + dy * dy, f = clamp(((X - ax) * dx + (Y - ay) * dy) / l2, 0, 1), px = X - ax - dx * f, py = Y - ay - dy * f, d2 = px * px + py * py;
      if (d2 < best) { best = d2; bi = i; bf = f; bd = (px * dy - py * dx) / Math.sqrt(l2); } } };
    scan(last - 20, last + 21); if (best > 3600) scan(0, n - 1); last = bi; L.i = bi; L.f = bf; L.d = bd; L.s = (bi + bf) * STEP; return L; }
  const lerp = (a, i, f) => a[i] + (a[Math.min(i + 1, n - 1)] - a[i]) * f;
  return { group, rocks, HW, start: I0, finish: I1, len: (I1 - I0) * STEP, drop: R.z[I0] - R.z[I1], name: R.name,
    show(v) { group.visible = v; }, tick(t) { wm.uniforms.uT.value = t; },
    startPose() { const i = I0; return { X: R.x[i], Y: R.y[i], th: Math.atan2(R.x[i + 2] - R.x[i], R.y[i + 2] - R.y[i]), z: R.z[i] }; },
    progress(X, Y) { const l = locate(X, Y); return { s: l.s - I0 * STEP, d: l.d, rap: lerp(rap, l.i, l.f), v: lerp(spd, l.i, l.f), slope: lerp(slope, l.i, l.f) }; },
    surf(X, Y) { const l = locate(X, Y), rp = lerp(rap, l.i, l.f); return lerp(R.z, l.i, l.f) + 0.02 + rp * 0.22 * Math.sin(l.s * 0.85) * Math.cos((l.d / HW) * 1.3); },
    rough(X, Y) { const l = locate(X, Y); return lerp(rap, l.i, l.f); },
    flowAt(X, Y, out) { const l = locate(X, Y), i = l.i, dx = R.x[i + 1] - R.x[i], dy = R.y[i + 1] - R.y[i], k = lerp(spd, i, l.f) * (1 - 0.6 * Math.min(1, (l.d / HW) ** 2)) / Math.hypot(dx, dy); out.x = dx * k; out.y = dy * k; return out; },
    // «дно»: в русле глубина, за урезом -- берег; уклон к середине, чтобы севшую лодку стаскивало обратно
    h(X, Y) { const l = locate(X, Y), a = Math.abs(l.d); return a < HW ? -(0.25 + 1.2 * (1 - (a / HW) ** 2)) : 0.05 + (a - HW) * 0.6; },
    hitRock(b) { for (const k of rocks) { if (Math.abs(k.i - last) > 6) continue; const dx = b.X - k.X, dy = b.Y - k.Y, d = Math.hypot(dx, dy), rr = k.r + 0.42; if (d < rr && d > 0.01) return { nx: dx / d, ny: dy / d, pen: rr - d }; } return null; } };
}
