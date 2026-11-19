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
  // --- зоны: русло режется на продольные отрезки, каждый поперёк -- на 3-5 полос со своим поведением лодки ---
  // 0 тиховодье, 1 струя, 2 улово (обратка), 3 шивера, 4 бочка. Раскладка новая в каждом заезде (regen).
  const ZB = 32, zone = new Uint8Array(n * ZB), zseg = new Float32Array(n), ztex = new THREE.DataTexture(zone, ZB, n, THREE.RedFormat); ztex.magFilter = ztex.minFilter = THREE.NearestFilter; ztex.unpackAlignment = 1;
  function regen(sd = Math.random() * 1e9) { let q = (sd >>> 0) || 7; const r = () => (q = (q * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n;) { const len = Math.max(3, Math.round((25 + r() * 45) / STEP)), rp = rap[Math.min(n - 1, i + (len >> 1))], k = 3 + Math.floor(r() * 3), cut = [-1];
      for (let c = 1; c < k; c++) cut.push(-1 + (2 * c) / k + (r() - 0.5) * (1.4 / k)); cut.push(1);
      const types = [], safe = i < I0s + Math.round(60 / STEP); for (let c = 0; c < k; c++) { const edge = c === 0 || c === k - 1, x = r(); if (safe) { types.push(x < 0.6 ? 1 : 0); continue; } // у старта -- спокойная вода
        types.push(edge ? (x < 0.45 ? 2 : x < 0.8 ? 0 : 3) : rp > 0.3 ? (x < 0.35 ? 3 : x < 0.55 ? 4 : x < 0.9 ? 1 : 0) : (x < 0.5 ? 1 : x < 0.7 ? 3 : x < 0.85 ? 0 : x < 0.95 ? 2 : 4)); }
      for (let a = 0; a < len && i + a < n; a++) { zseg[i + a] = a / len; for (let b = 0; b < ZB; b++) { const u = -1 + (2 * (b + 0.5)) / ZB; let c = 0; while (c < k - 1 && u > cut[c + 1]) c++; zone[(i + a) * ZB + b] = types[c] * 50; } }
      i += len; }
    ztex.needsUpdate = true; }
  const I0s = 32; regen(1);
  const ZN = ['тиховодье', 'струя', 'улово', 'шивера', 'бочка'];
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
  const wm = new THREE.ShaderMaterial({ uniforms: { ...ENV, uT: { value: 0 }, uZ: { value: ztex }, uN: { value: n }, uStep: { value: STEP } }, defines: { FBM_OCT: 3, RIP_OCT: 3, SHN: 6 }, side: THREE.DoubleSide, extensions: { derivatives: true },
    vertexShader: CURVE + `attribute vec4 aw; uniform float uT; varying vec4 vA; varying vec3 vP;
void main(){ vA=aw; vec3 q=position; q.y+=aw.z*(0.22*sin(aw.x*0.85)*cos(aw.y*1.3)+0.06*sin(aw.x*2.3+uT*3.)); vP=q; q.y-=curve(q); gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.); }`,
    fragmentShader: GLSL_COMMON + FOAM_GLSL + `uniform float uT; uniform sampler2D uZ; uniform float uN, uStep; varying vec4 vA; varying vec3 vP;
float zt(float s, float u){ return floor(texture2D(uZ, vec2(clamp(u*0.5+0.5,0.,0.999), (s/uStep+0.5)/uN)).r*255./50.+0.5); }
void main(){ float s=vA.x, u=vA.y, rp=vA.z, v=vA.w, dist=length(vP-cameraPosition); float Z=zt(s,u);
  float vm = Z<0.5 ? 0.45 : Z<1.5 ? 1.45 : Z<2.5 ? -0.4 : Z<3.5 ? 1.05 : 0.8;   // скорость рисунка воды -- как течение в зоне
  vec2 fl=vec2(u*7.2, s-uT*v*0.85*vm);
  float str=fvn(vec2(u*5., fl.y*0.10))*0.6+fvn(vec2(u*11., fl.y*0.32))*0.4;                 // струи вдоль течения
  vec3 col=mix(vec3(0.10,0.33,0.36), vec3(0.36,0.62,0.62), 0.35+0.5*str)*(0.55+0.55*uSunI); // ледниковая вода: мутно-бирюзовая
  col=mix(col, skyBase(normalize(vec3(0.,1.,0.25))), 0.16);
  float edge=smoothstep(0.72,1.0,abs(u)), mfoam=clamp(rp*0.5*(0.55+0.45*sin(s*0.85+1.6))+edge*0.3*(0.4+rp)+rp*str*0.12,0.,1.);
  if(Z<0.5){ col*=0.82; mfoam*=0.2; }                                                   // тиховодье: гладкое, тёмное зеркало
  else if(Z<1.5){ col=mix(col, vec3(0.42,0.72,0.74), 0.3); float ch=fract((s-uT*v*1.25)*0.18 - abs(u)*0.9); col=mix(col, vec3(0.9,0.97,1.), smoothstep(0.9,0.97,ch)*0.55); } // струя: шевроны вниз
  else if(Z<2.5){ col*=0.7; vec2 e2=vec2(u*7.2, s*0.5); float sw=sin(length(fract(e2*0.12)-0.5)*24.-uT*2.4); col=mix(col, vec3(0.7,0.85,0.88), smoothstep(0.85,1.,sw)*0.4); mfoam*=0.4; } // улово: кружит
  else if(Z<3.5){ mfoam=max(mfoam, 0.45+0.25*rp); }                                      // шивера: кипит
  else { float sg=fract(s/uStep/24.); mfoam=max(mfoam, 0.95-smoothstep(0.0,0.25,abs(fract(s*0.08-uT*0.05)-0.5)-0.15)); col*=0.85; } // бочка: белый вал
  // граница зон -- тонкий пунктир тушью
  { float zr=zt(s,u+fwidth(u)*2.), zs=zt(s+fwidth(s)*2.,u); if((zr!=Z||zs!=Z) && fract(s*0.4+u*3.)<0.6) col=mix(col, vec3(0.1,0.16,0.2), 0.55*(1.-smoothstep(40.,120.,dist))); }
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
  const zoneAt = (l) => Math.round(zone[l.i * ZB + Math.max(0, Math.min(ZB - 1, Math.floor((l.d / HW * 0.5 + 0.5) * ZB)))] / 50), perfT = () => performance.now() / 1000;
  const lerp = (a, i, f) => a[i] + (a[Math.min(i + 1, n - 1)] - a[i]) * f;
  return { group, rocks, HW, start: I0, finish: I1, len: (I1 - I0) * STEP, drop: R.z[I0] - R.z[I1], name: R.name,
    show(v) { group.visible = v; }, tick(t) { wm.uniforms.uT.value = t; },
    startPose() { const i = I0; return { X: R.x[i], Y: R.y[i], th: Math.atan2(R.x[i + 2] - R.x[i], R.y[i + 2] - R.y[i]), z: R.z[i] }; },
    progress(X, Y) { const l = locate(X, Y); return { s: l.s - I0 * STEP, d: l.d, rap: lerp(rap, l.i, l.f), v: lerp(spd, l.i, l.f), slope: lerp(slope, l.i, l.f), zone: ZN[zoneAt(l)] }; },
    down(X, Y) { const l = locate(X, Y), i = l.i, dx = R.x[i + 1] - R.x[i], dy = R.y[i + 1] - R.y[i], L0 = Math.hypot(dx, dy); return { x: dx / L0, y: dy / L0 }; },
    regen, zoneAt: (X, Y) => ZN[zoneAt(locate(X, Y))],
    surf(X, Y) { const l = locate(X, Y), rp = lerp(rap, l.i, l.f); return lerp(R.z, l.i, l.f) + 0.02 + rp * 0.22 * Math.sin(l.s * 0.85) * Math.cos((l.d / HW) * 1.3); },
    rough(X, Y) { const l = locate(X, Y), z = zoneAt(l); return Math.min(1.4, lerp(rap, l.i, l.f) * [0.3, 0.7, 0.3, 1.2, 1.4][z] + [0, 0.05, 0.05, 0.45, 0.8][z]); },
    flowAt(X, Y, out) { const l = locate(X, Y), i = l.i, dx = R.x[i + 1] - R.x[i], dy = R.y[i + 1] - R.y[i], z = zoneAt(l), L0 = Math.hypot(dx, dy);
      let m = [0.45, 1.5, -0.4, 1.05, 0.9][z]; const segF = zseg[i]; if (z === 4 && segF < 0.14) m = -0.35; // бочка: у вала течение назад -- держит, но выгрести можно
      const k = lerp(spd, i, l.f) * m * (1 - 0.6 * Math.min(1, (l.d / HW) ** 2)) / L0; out.x = dx * k; out.y = dy * k;
      if (z === 3) { const w = Math.sin(l.s * 0.9 + perfT() * 2.3) * 0.9; out.x += (-dy / L0) * w; out.y += (dx / L0) * w; } // шивера сносит вбок
      if (z === 4 && segF < 0.2) { const w = Math.sign(l.d || 1) * 1.1; out.x += (-dy / L0) * w; out.y += (dx / L0) * w; } // вал выталкивает к краю
      if (z === 2) { const w = -Math.sign(l.d) * 0.5; out.x += (-dy / L0) * w; out.y += (dx / L0) * w; } // улово заворачивает к берегу
      return out; },
    // «дно»: в русле глубина, за урезом -- берег; уклон к середине, чтобы севшую лодку стаскивало обратно
    h(X, Y) { const l = locate(X, Y), a = Math.abs(l.d); return a < HW ? -(0.25 + 1.2 * (1 - (a / HW) ** 2)) : 0.05 + (a - HW) * 0.6; },
    hitRock(b) { for (const k of rocks) { if (Math.abs(k.i - last) > 6) continue; const dx = b.X - k.X, dy = b.Y - k.Y, d = Math.hypot(dx, dy), rr = k.r + 0.42; if (d < rr && d > 0.01) return { nx: dx / d, ny: dy / d, pen: rr - d }; } return null; } };
}
