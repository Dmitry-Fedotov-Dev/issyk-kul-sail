// Брызги и кильватерный след.
import * as THREE from 'three';
import { FOAM_GLSL } from './foam.js';
const WS = { h: 0, sx: 0, sz: 0 };

// Брызги двух видов. Капли: мелкие, тяжёлые, летят по баллистике и блестят бликом. Водяная пыль: крупные мягкие
// клубы, которые ветер и сопротивление воздуха быстро тормозят, они висят и тают -- именно она даёт «объём» удару волны.
export function makeSpray(n = 1600) {
  const pos = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n), vel = new Float32Array(n * 3), life = new Float32Array(n), life0 = new Float32Array(n), kind = new Uint8Array(n);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const uniforms = { uScale: { value: 700 }, uLight: { value: 1 } };
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms,
    vertexShader: `attribute float alpha, size; uniform float uScale; varying float vA, vS; void main(){ vA=alpha; vS=size; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*uScale/-mv.z, 2., 420.); }`,
    fragmentShader: `varying float vA, vS; uniform float uLight;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){ vec2 pc=gl_PointCoord-0.5; float d=length(pc);
  if(vS>0.3){ // пыль: мягкий неровный клуб
    // гладкий клуб без «кирпичиков»: неровность -- плавный шум по углу, а не клетки
    float ang=atan(pc.y,pc.x), wob=0.035*sin(ang*3.+vS*40.)+0.025*sin(ang*5.-vS*17.);
    float a=pow(smoothstep(0.5,0.02,d+wob),2.0)*vA*0.22; if(a<0.004) discard;
    gl_FragColor=vec4(vec3(0.93,0.96,1.)*(0.75+0.25*uLight),a); }
  else { // капля: плотное ядро, тёмный край и блик со стороны солнца
    float a=smoothstep(0.5,0.34,d)*vA; if(a<0.02) discard;
    float hl=smoothstep(0.2,0.0,length(pc-vec2(-0.13,-0.15)));
    gl_FragColor=vec4(mix(vec3(0.74,0.86,0.95),vec3(1.),0.45+0.55*hl)*(0.7+0.3*uLight), a*(0.55+0.45*hl)); } }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5; let next = 0;
  return { mesh: pts, uniforms,
    // kind: 0 капли, 1 водяная пыль
    emit(x, y, z, vx, vy, vz, spread, count, kd = 0) { for (let i = 0; i < count; i++) { const k = next; next = (next + 1) % n; kind[k] = kd;
      pos[k * 3] = x + (Math.random() - 0.5) * 0.6; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      vel[k * 3] = vx + (Math.random() - 0.5) * spread; vel[k * 3 + 1] = vy * (0.5 + Math.random()); vel[k * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      life0[k] = life[k] = kd ? 1.1 + Math.random() * 1.3 : 0.7 + Math.random() * 0.8; sz[k] = kd ? 0.5 + Math.random() * 0.7 : 0.035 + Math.random() ** 2 * 0.11; } },
    update(dt) { for (let k = 0; k < n; k++) { if (life[k] <= 0) { al[k] = 0; continue; } life[k] -= dt; const q = k * 3;
      if (kind[k]) { const dr = Math.exp(-2.2 * dt); vel[q] *= dr; vel[q + 1] = vel[q + 1] * dr - 1.4 * dt; vel[q + 2] *= dr; sz[k] += 0.9 * dt; al[k] = Math.min(1, life[k] / life0[k] * 1.4) * Math.min(1, (life0[k] - life[k]) * 6); }
      else { vel[q + 1] -= 9.8 * dt; al[k] = Math.max(0, Math.min(1, life[k] * 2.2)); }
      pos[q] += vel[q] * dt; pos[q + 1] += vel[q + 1] * dt; pos[q + 2] += vel[q + 2] * dt; if (pos[q + 1] < -0.3) life[k] = 0; }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; } };
}

// Кильватерный след: лента по РЕАЛЬНО пройденному пути. Точка ставится каждые 0.9 м хода и остаётся на воде там, где
// прошла корма, поэтому в повороте след изгибается дугой, а не тянется прямой за лодкой. Ширина растёт с пройденным
// расстоянием под углом Кельвина (~19.5 градуса): в середине бурун, по краям расходящиеся усы.
// общая для всех следов освещённость: ночью пена и взбитая вода не должны светиться
export const WAKE_LIGHT = { value: 1 };
export function makeWake(N = 110) {
  const pos = new Float32Array(N * 2 * 3), wk = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  for (let i = 0; i < N; i++) { uv[i * 4] = 0; uv[i * 4 + 2] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('wk', new THREE.BufferAttribute(wk, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true }, uniforms: { uT: { value: 0 }, uL: WAKE_LIGHT },
    vertexShader: `attribute vec3 wk; varying vec3 vK; varying vec2 vU; varying vec3 vP; void main(){ vK=wk; vU=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: FOAM_GLSL + `uniform float uT, uL; varying vec3 vK; varying vec2 vU; varying vec3 vP;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){ float w=vK.x, d=vK.y, e=abs(vU.x-0.5)*2.*w; // e -- метры от оси следа
  float cw=0.75+d*0.09, core=(1.-smoothstep(cw*0.3,cw,e))*exp(-d/(8.+34.*vK.z));
  float m=clamp(core*0.70,0.,1.)*vK.z*smoothstep(w,w-0.25,e)*(1.-smoothstep(60.,98.,d));
  vec2 o=vP.xz; float fn=fvn(o*0.9+uT*0.05)*0.65+fvn(o*2.6-uT*0.04)*0.35, a=0.;
  if(m>0.02){ float v=foamTex(o,uT)*0.80+fn*0.34, th=1.10-m*1.02, aa=0.10+fwidth(v)*1.2; a=smoothstep(th-aa,th+aa,v)*smoothstep(0.02,0.2,m); }
  // под пеной -- взбитая вода: воздух в толще делает её светло-бирюзовой, и это пятно живёт дольше самой пены
  // подложка обязана сойти на нет ДО края ленты и к её хвосту, иначе за кормой видна резкая граница «след / чистая вода»
  float un=(1.-smoothstep(cw*0.5,cw*2.4+0.6,e))*smoothstep(w,w*0.45,e)*exp(-d/(16.+46.*vK.z))*(1.-smoothstep(55.,95.,d))*smoothstep(0.,3.,d)*vK.z*0.46*(0.75+0.25*fn);
  float al=max(a*0.92,un); if(al<0.01) discard;
  gl_FragColor=vec4(mix(vec3(0.30,0.80,0.84),vec3(0.95,0.975,1.),clamp(a*0.92/max(al,1e-3),0.,1.))*uL, al); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
  const pts = [], vis = new Uint8Array(N + 1);
  return { mesh, pts,
    reset() { pts.length = 0; },
    update(b, dt, t, waves) {
      const fx = Math.sin(b.th), fz = -Math.cos(b.th), sx = b.X - fx * 2.7, sz = -b.Y - fz * 2.7;
      const s = b.capsized ? 0 : Math.min(1, Math.hypot(b.vx, b.vy) / 3.6), live = { x: sx, z: sz, rx: Math.cos(b.th), rz: Math.sin(b.th), t, s };
      if (!pts.length || Math.hypot(sx - pts[0].x, sz - pts[0].z) > 0.9) { pts.unshift({ ...live }); if (pts.length > N - 1) pts.pop(); }
      if (!mesh.visible) return; // скрытый след не рисуется -- и волну под ним считать незачем (точки пути копятся выше)
      // Высота волны под каждой точкой ленты -- самое дорогое в кадре для процессора (220 расчётов волн на лодку).
      // Точка, вокруг которой лента целиком прозрачна (след старше 26 с или дальше 98 м), на картинку не влияет:
      // её не пересчитываем. Шейдер гасит ленту ровно по этим двум условиям, так что картинка та же
      let dist = 0, px = sx, pz = sz, lp = live;
      for (let i = 0; i < N; i++) { const p = i === 0 ? live : pts[i - 1]; let st = 0;
        if (p) { dist += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; lp = p; st = p.s * Math.max(0, 1 - (t - p.t) / 26); }
        const w = Math.min(1.5 + 0.05 * dist, 5); // турбулентная струя за кормой расширяется медленно; клин волн считает сетка
        vis[i] = st > 0 && dist < 98 ? 1 : 0;
        for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1, q = (i * 2 + k) * 3; pos[q] = lp.x + lp.rx * w * sg; pos[q + 2] = lp.z + lp.rz * w * sg; wk[q] = w; wk[q + 1] = dist; wk[q + 2] = st; } }
      for (let i = 0; i < N; i++) { if (!vis[i] && !(i && vis[i - 1]) && !vis[i + 1]) continue;
        for (let q = i * 6; q < i * 6 + 6; q += 3) pos[q + 1] = waves.sample(pos[q], pos[q + 2], t, b.att, WS).h + 0.05; }
      m.uniforms.uT.value = t; g.attributes.position.needsUpdate = true; g.attributes.wk.needsUpdate = true; } };
}
