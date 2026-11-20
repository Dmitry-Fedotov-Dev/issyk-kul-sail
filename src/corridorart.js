// Коридор Кургак-Сай -- берег: живые реки и большие камни, 2D в стиле спрайтов города.
// Реки -- ленты по руслам OpenStreetMap, лежат на подробном рельефе; по ним бегут светлые струйки вниз по течению,
// края обведены тушью. Камни -- рисованные валуны (плоская заливка, грань света, контур тушью), всегда лицом
// к камере; стоят на крутых склонах, у подножий осыпей и вдоль рек.
import * as THREE from 'three';
import { RIVERS } from './trails.js';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';
import { smooth } from './sim.js';

// ---------- реки ----------
// Реки не геометрия, а функция координат: русло по OSM (притянутое к дну долины по рельефу) запекается в маленькую
// текстуру на сетке 14 м -- знаковое расстояние до оси в полуширинах русла и направление течения. Шейдер рельефа
// по ней рисует воду прямо на поверхности склона: она ничего не перекрывает и лежит ровно там, где земля.
function makeRivers(dem, h) {
  const lines = [], pts = [];
  for (const w of RIVERS.split(';')) { const a = w.split(',').map(Number); let P = []; for (let i = 0; i + 1 < a.length; i += 2) P.push([a[i] * 4, a[i + 1] * 4]);
    P = P.filter((p) => dem.inside(p[0], p[1]) && dem.raw(p[0], p[1]) > 3); if (P.length < 2) continue;
    if (h(P[0][0], P[0][1]) < h(P[P.length - 1][0], P[P.length - 1][1])) P.reverse(); // течёт вниз
    let Q = []; for (let i = 0; i < P.length - 1; i++) { const [x0, y0] = P[i], [x1, y1] = P[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6)); for (let k = 0; k < n; k++) Q.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); } Q.push(P[P.length - 1]);
    // русло OSM смещено от тальвега карты высот на десятки метров -- ищем дно долины поперёк, сдвиг сглаживаем
    const nrm = (i) => { const q = Q[Math.min(i + 1, Q.length - 1)], o = Q[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    let off = Q.map((p, i) => { const [nx, ny] = nrm(i); let best = 0, bh = 1e9; for (let d = -36; d <= 36; d += 3) { const z = h(p[0] + nx * d, p[1] + ny * d) + Math.abs(d) * 0.03; if (z < bh) { bh = z; best = d; } } return best; });
    for (let pass = 0; pass < 3; pass++) off = off.map((_, i) => { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < off.length) { s += off[j]; n++; } } return s / n; });
    Q = Q.map((p, i) => { const [nx, ny] = nrm(i); return [p[0] + nx * off[i], p[1] + ny * off[i]]; });
    let s = 0; const L = Q.map((p, i) => (i ? (s += Math.hypot(p[0] - Q[i - 1][0], p[1] - Q[i - 1][1])) : 0));
    lines.push({ Q, hw: L.map((l) => 2.2 + Math.min(3, l / 900)) }); for (let i = 0; i < Q.length; i += 5) pts.push(Q[i]); }
  // запекание: R -- знаковое расстояние / полуширина (-4..4), G -- маска «рядом река», BA -- течение
  const S = dem.STEP, VR = 4; let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const { Q } of lines) for (const [x, y] of Q) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const pad = VR * 5.2 + 3 * S; bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
  const W = Math.ceil((bx1 - bx0) / S), H = Math.ceil((by1 - by0) / S), best = new Float32Array(W * H).fill(1e9), data = new Uint8Array(W * H * 4), lid = new Int16Array(W * H).fill(-1), vv = new Float32Array(W * H);
  lines.forEach(({ Q, hw }, li) => { for (let i = 0; i < Q.length - 1; i++) {
    const [ax, ay] = Q[i], [qx, qy] = Q[i + 1], dx = qx - ax, dy = qy - ay, l2 = dx * dx + dy * dy || 1, l = Math.sqrt(l2), R = VR * Math.max(hw[i], hw[i + 1]) + S * 1.5;
    const i0 = Math.max(0, Math.floor((Math.min(ax, qx) - R - bx0) / S)), i1 = Math.min(W - 1, Math.ceil((Math.max(ax, qx) + R - bx0) / S)), j0 = Math.max(0, Math.floor((by1 - Math.max(ay, qy) - R) / S)), j1 = Math.min(H - 1, Math.ceil((by1 - Math.min(ay, qy) + R) / S));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const X = bx0 + (ii + 0.5) * S, Y = by1 - (j + 0.5) * S, t = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / l2));
      const d = Math.hypot(X - ax - dx * t, Y - ay - dy * t), k = j * W + ii; if (d >= best[k]) continue; best[k] = d;
      const sg = (dx * (Y - ay) - dy * (X - ax)) >= 0 ? 1 : -1, v = Math.max(-VR, Math.min(VR, sg * d / (hw[i] + (hw[i + 1] - hw[i]) * t))), o = k * 4;
      data[o] = Math.round((v / VR * 0.5 + 0.5) * 255); data[o + 1] = 255; data[o + 2] = Math.round((dx / l * 0.5 + 0.5) * 255); data[o + 3] = Math.round((dy / l * 0.5 + 0.5) * 255); lid[k] = li; vv[k] = v; } } });
  // между двумя руслами, за концом русла и на крутой излучине знак расстояния скачет -- интерполяция нарисовала бы ложную воду.
  // Такие стыки вне самой воды выключаем маской
  const cut = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (lid[k] < 0) continue;
    for (const n of [i + 1 < W ? k + 1 : -1, j + 1 < H ? k + W : -1]) { if (n < 0 || lid[n] < 0 || Math.sign(vv[n]) === Math.sign(vv[k])) continue;
      if (best[k] + best[n] > S * 1.08) cut.push(k, n); } } // честное пересечение оси: сумма расстояний не больше шага сетки
  for (const k of cut) data[k * 4 + 1] = 0;
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = false; tex.needsUpdate = true;
  ENV.uRiv.value = tex; ENV.uRivT.value.set(bx0, by1, 1 / (W * S), 1 / (H * S)); ENV.uRivOn.value = 1;
  return { pts, tex };
}

// ---------- валуны ----------
function rockAtlas() { const N = 4, S = 128, c = document.createElement('canvas'); c.width = S * N; c.height = S; const x = c.getContext('2d'); let seed = 9; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < N; k++) { const cx = k * S + S / 2, pts = [], n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const a = Math.PI + (i / (n - 1)) * Math.PI, rr = (0.36 + r() * 0.12) * S * (1 - 0.15 * Math.abs(Math.cos(a))); pts.push([cx + Math.cos(a) * rr * (0.9 + 0.25 * (k % 2)), S - 6 + Math.sin(a) * rr * (0.75 + 0.25 * r())]); }
    const shape = () => { x.beginPath(); x.moveTo(pts[0][0], S - 6); for (const p of pts) x.lineTo(p[0], p[1]); x.lineTo(pts[pts.length - 1][0], S - 6); x.closePath(); };
    shape(); x.fillStyle = ['#8d8478', '#7f7a74', '#968a7a', '#776f69'][k]; x.fill();
    x.save(); shape(); x.clip(); x.fillStyle = 'rgba(255,240,215,.38)'; x.beginPath(); x.moveTo(cx - S * 0.5, 0); x.lineTo(cx + S * 0.05, 0); x.lineTo(cx - S * 0.1, S); x.lineTo(cx - S * 0.5, S); x.fill(); // освещённая грань
      x.fillStyle = 'rgba(30,30,40,.25)'; x.beginPath(); x.moveTo(cx + S * 0.18, 0); x.lineTo(cx + S * 0.5, 0); x.lineTo(cx + S * 0.5, S); x.lineTo(cx + S * 0.1, S); x.fill(); // тень
      x.strokeStyle = 'rgba(30,26,24,.55)'; x.lineWidth = 2.5; for (let q = 0; q < 2; q++) { x.beginPath(); const sx = cx - S * 0.2 + r() * S * 0.4; x.moveTo(sx, S * 0.35 + r() * 20); x.lineTo(sx + (r() - 0.5) * 30, S * 0.6 + r() * 30); x.stroke(); } // трещины
      x.fillStyle = 'rgba(120,150,90,.45)'; x.fillRect(k * S, S - 16, S, 10); x.restore(); // мох и трава у подножия
    shape(); x.strokeStyle = '#1e1a18'; x.lineWidth = 5; x.lineJoin = 'round'; x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const RK_V = CURVE + `attribute vec4 aI; varying vec2 vUv; varying vec3 vP; void main(){ vec3 c=aI.xyz; float sz=aI.w; float k=floor(fract(sz)*4.+0.5); sz=floor(sz);
  vec3 r=normalize(vec3(cameraPosition.z-c.z,0.,c.x-cameraPosition.x)+1e-5); r=vec3(-r.x,0.,-r.z); vec3 p=c+r*position.x*sz+vec3(0.,(position.y+0.06)*sz*0.8,0.);
  vUv=vec2((k+position.x+0.5)/4., position.y+0.5); vP=p; p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const RK_F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; void main(){ vec4 t=texture2D(uMap,vUv); if(t.a<0.5) discard; vec3 c=t.rgb*(0.55+0.55*uSunI); c=applyFog(c,length(vP-cameraPosition),vP.y); gl_FragColor=vec4(c,1.); ${END} }`;
function makeBoulders(dem, h, rivers) {
  let seed = 31; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const out = [];
  for (let Y = dem.Y0 + 300; Y < dem.Y1 - 200; Y += 36) for (let X = dem.X0 + 200; X < dem.X1 - 200; X += 36) { const x = X + (r() - 0.5) * 30, y = Y + (r() - 0.5) * 30, z = h(x, y); if (z < 30) continue;
    const e = 12, gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e), sl = Math.hypot(gx, gy);
    let p = 0.02 * smooth(0.25, 0.6, sl) + 0.05 * smooth(0.45, 0.9, sl) * (1 - smooth(1.1, 1.6, sl)); // крутые склоны и подножия стен
    const hm = z + 1601; if (hm > 2900) p += 0.04 * smooth(2900, 3300, hm) * (1 - smooth(0.9, 1.3, sl)); // осыпи и морены у вершин
    if (r() < p * 0.15) { const sz = 1.5 + r() ** 2 * 3; out.push(x, z - sz * 0.12, -y, Math.floor(sz) + Math.floor(r() * 4) / 4 + 0.01); } }
  // вдоль рек -- окатанные валуны у воды
  for (const [x, y] of rivers) { if (r() < 0.35) { const a = r() * 6.28, d = 3 + r() * 6, X = x + Math.cos(a) * d, Y = y + Math.sin(a) * d, sz = 1 + r() * 2.5, z = h(X, Y); out.push(X, z - 0.2, -Y, Math.floor(sz) + Math.floor(r() * 4) / 4 + 0.01); } }
  const n = out.length / 4, base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(new Float32Array(out), 4)); geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: rockAtlas() } }, defines: { FBM_OCT: 3, RIP_OCT: 3, SHN: 6 }, vertexShader: RK_V, fragmentShader: RK_F, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return { mesh: m, n };
}

// ---------- скалы: прямоугольные плиты на склоне ----------
// Плита стоит на склоне лицом вниз по нему и наклонена как склон (чем круче -- тем отвеснее). Рисунок -- слои породы
// поперёк, штриховка вдоль падения, трещины, контур тушью; свет в три тона по наклону плиты к солнцу.
function slabAtlas() { const N = 4, S = 128, c = document.createElement('canvas'); c.width = S * N; c.height = S; const x = c.getContext('2d'); let seed = 17; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < N; k++) { const X0 = k * S, base = ['#87837f', '#77757a', '#8e877e', '#6c6a6c'][k];
    x.fillStyle = base; x.fillRect(X0 + 3, 3, S - 6, S - 6);
    // слои: горизонтальные пласты разной толщины, через один светлее
    let y = 10; while (y < S - 10) { const t = 14 + r() * 26; if (r() < 0.5) { x.fillStyle = 'rgba(255,245,225,.14)'; x.fillRect(X0 + 3, y, S - 6, t); } x.strokeStyle = 'rgba(25,22,22,.5)'; x.lineWidth = 2;
      let q = X0 + 3; while (q < X0 + S - 3) { const L = 10 + r() * 30; x.beginPath(); x.moveTo(q, y + (r() - 0.5) * 3); x.lineTo(Math.min(X0 + S - 3, q + L), y + (r() - 0.5) * 5); x.stroke(); q += L + 4 + r() * 14; } y += t; } // пласты -- ломаными отрезками
    for (let q = 0; q < 160; q++) { x.fillStyle = r() < 0.5 ? 'rgba(20,18,20,.18)' : 'rgba(255,250,235,.16)'; x.fillRect(X0 + 4 + r() * (S - 8), 4 + r() * (S - 8), 2 + r() * 3, 2 + r() * 3); } // крапины породы
    x.fillStyle = 'rgba(130,160,100,.35)'; for (let q = 0; q < 5; q++) x.fillRect(X0 + 4 + r() * (S - 30), 4 + r() * 10, 8 + r() * 20, 4); // трава на уступах
    // штриховка вдоль падения (диагональ)
    x.save(); x.beginPath(); x.rect(X0 + 3, 3, S - 6, S - 6); x.clip(); x.strokeStyle = 'rgba(30,28,30,.22)'; x.lineWidth = 1.5;
    for (let q = -S; q < S; q += 7) { x.beginPath(); x.moveTo(X0 + q, S); x.lineTo(X0 + q + S * 0.55, 0); x.stroke(); }
    // вертикальные трещины-отдельности
    x.strokeStyle = 'rgba(20,18,18,.6)'; x.lineWidth = 2.5; for (let q = 0; q < 3; q++) { const sx = X0 + 15 + r() * (S - 30); x.beginPath(); x.moveTo(sx, 3); x.lineTo(sx + (r() - 0.5) * 14, S * (0.4 + r() * 0.6)); x.stroke(); }
    x.restore();
    x.strokeStyle = '#1e1a18'; x.lineWidth = 5; x.strokeRect(X0 + 4, 4, S - 8, S - 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const SL_V = CURVE + `uniform vec3 uSun; attribute vec4 aC; attribute vec4 aN; varying vec2 vUv; varying vec3 vP; varying float vL; varying float vDip;
void main(){ vec3 dn=vec3(aN.x,0.,aN.z); float sl=aN.y; // вниз по склону (горизонталь) и крутизна
  vec3 c=aC.xyz; vec3 u=normalize(vec3(cameraPosition.z-c.z,0.,c.x-cameraPosition.x)+1e-5); u=-u; // поперёк взгляда
  float side=dot(dn,u); vec3 v=normalize(vec3(0.,1.,0.)+dn*min(0.6,sl*0.35)); // заваливается вниз по склону
  vDip=clamp(side*sl,-1.2,1.2); // как наклон склона виден с этого ракурса
  vec3 p=c+u*position.x*aC.w*aN.w+v*(position.y+0.5)*aC.w*0.9; float k=floor(fract(aC.w*7.31)*4.);
  vUv=vec2((k+position.x+0.5)/4., position.y+0.5); vP=p; vec3 nn=normalize(cross(u,v)); vL=dot(normalize(dn*0.8+vec3(0.,0.6,0.)), normalize(uSun)); p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const SL_F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vL; varying float vDip;
void main(){ float lx=fract(vUv.x*4.)-0.5; vec2 uv=vec2(vUv.x, clamp(vUv.y+lx*vDip*0.9,0.02,0.98)); // пласты идут по наклону склона
  vec4 t=texture2D(uMap,uv); float edge=max(step(0.47,abs(lx)), step(0.965,vUv.y)+step(vUv.y,0.035));
  float tone=vL>0.45?1.12:vL>0.1?0.82:0.55; vec3 c=t.rgb*tone*(0.55+0.55*uSunI); c=mix(c, c*vec3(0.78,0.82,1.05), step(vL,0.1)*0.6);
  c=mix(c, vec3(0.12,0.1,0.1), edge); c=applyFog(c,length(vP-cameraPosition),vP.y); gl_FragColor=vec4(c,1.); ${END} }`;
function makeSlabs(dem, h) { let seed = 53; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const C = [], Nn = [];
  const put = (x, y, sz0) => { const z = h(x, y), e = 10, gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e), sl = Math.hypot(gx, gy); if (sl < 0.35) return;
    const dxh = -gx / sl, dyh = -gy / sl, sz = sz0 * (0.75 + r() * 0.5); C.push(x, z - sz * 0.25, -y, sz); Nn.push(dxh, Math.min(2, sl), -dyh, 0.75 + r() * 0.55); };
  for (let Y = dem.Y0 + 300; Y < dem.Y1 - 200; Y += 45) for (let X = dem.X0 + 200; X < dem.X1 - 200; X += 45) { const x = X + (r() - 0.5) * 40, y = Y + (r() - 0.5) * 40, z = h(x, y); if (z < 40) continue;
    const e = 10, gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e), sl = Math.hypot(gx, gy);
    const p = 0.32 * smooth(0.5, 0.9, sl) + 0.08 * smooth(0.35, 0.55, sl) * smooth(2700, 3200, z + 1601); if (r() >= p) continue;
    // скальный пояс: несколько плит подряд вдоль горизонтали, ступенькой
    const sz = 9 + r() ** 1.4 * 22, cx = gy / sl, cy = -gx / sl, n2 = 1 + Math.floor(r() * 4); for (let q = 0; q < n2; q++) { const o = (q - (n2 - 1) / 2) * sz * 0.85; put(x + cx * o + (r() - 0.5) * 4, y + cy * o + (r() - 0.5) * 4, sz); } }
  const n = C.length / 4, base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(new Float32Array(C), 4)); geo.setAttribute('aN', new THREE.InstancedBufferAttribute(new Float32Array(Nn), 4)); geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: slabAtlas() } }, defines: { FBM_OCT: 3, RIP_OCT: 3, SHN: 6 }, vertexShader: SL_V, fragmentShader: SL_F, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return { mesh: m, n }; }

export function makeCorridorArt(scene, dem, h) {
  const rv = makeRivers(dem, h), bo = makeBoulders(dem, h, rv.pts), sl = makeSlabs(dem, h); scene.add(bo.mesh, sl.mesh);
  return { rivers: rv.tex, riverPts: rv.pts, boulders: bo.mesh, slabs: sl.n, n: bo.n, tick(t) { ENV.uRT.value = t; } };
}
