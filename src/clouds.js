// Облака в цел-шейдинге (по референсам: аниме-небо, как у гор и самолёта).
//
// Картинка облака -- не готовый рисунок, а «форма и объём»: заготовки считаются при загрузке пиксель за пикселем
// из набора кругов-«барашков». В каждом пикселе: A -- насколько глубоко внутри формы (0 на краю, 1 в середине
// барашка), RG -- куда смотрит поверхность барашка (он -- полусфера). Шейдер:
//  * режет форму по порогу -- края чёткие, без мыльной полупрозрачности. Порог же растит и растворяет облако:
//    поднимаешь его -- облако тает к сердцевинам барашков, как настоящее (и так же -- когда в него влетаешь);
//  * освещает по направлению солнца в три тона без переходов: белая шапка, светло-голубой средний, синяя плоская
//    тень снизу; тонкий контур -- в цвет тени, не чёрный;
//  * цвета -- от времени суток и погоды: день, закат (персик и розовый на свету, фиолетовая тень), ночь (тёмные
//    силуэты, лунная кайма по краю), гроза (свинцовые башни, тёмно-синее основание, полосы дождя).
// Ярусы: кучевые (кластеры из 3-6 барашков с общим ровным основанием), грозовые башни, низкие гряды у горизонта
// в дымке, высокие перистые штрихи.
// Где быть облакам, решает «поле погоды» -- плавный шум по карте, который плывёт по ветру и медленно меняется:
// облачность отсекает его по порогу, получаются фронты и окна чистого неба, а не ряды. Над хребтами гуще.
// Один вызов отрисовки на всё небо, экземпляры -- от дальних к ближним.
import * as THREE from 'three';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';

const AW = 2048, AH = 1024;
// ---------- заготовки ----------
function atlas() {
  const data = new Uint8Array(AW * AH * 4), rects = {}; let seed = 23; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // puffs: [cx, cy, rad] в пикселях, y -- вверх от низа заготовки; base -- высота плоского основания
  function bake(name, x0, y0, w, h, puffs, { base = 8, front = 0.6 } = {}) {
    const mr = puffs.reduce((a, p) => a + p[2], 0) / puffs.length; let gx0 = 1e9, gx1 = -1e9, gy1 = 0; for (const [px, py, pr] of puffs) { gx0 = Math.min(gx0, px - pr); gx1 = Math.max(gx1, px + pr); gy1 = Math.max(gy1, py + pr); }
    const gcx = (gx0 + gx1) / 2, grx = (gx1 - gx0) / 2, gry = Math.max(20, gy1 - base), D = new Float32Array(w * h), NX = new Float32Array(w * h), NY = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = -1e9, inside = false, nx = 0, ny = 0;
      for (const [px, py, pr] of puffs) { const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy; if (d2 >= pr * pr) continue; inside = true;
        const z = Math.sqrt(pr * pr - d2) + (1 - py / h) * mr * front; if (z > best) { best = z; nx = dx / pr; ny = dy / pr; } } // нижние барашки -- ближе к нам
      if (base > 0 && y < base) inside = false; // ровное основание
      // объём всего облака: барашки -- лишь рельеф на общей «шапке», иначе облако распадается на шарики
      const ex = (x - gcx) / grx, ey = (y - base) / gry; nx = nx * 0.28 + ex * 0.72; ny = ny * 0.28 + (ey * 0.9 - 0.15) * 0.72; const nl = Math.hypot(nx, ny); if (nl > 0.95) { nx *= 0.95 / nl; ny *= 0.95 / nl; }
      if (base > 0 && y < base + 9) ny = Math.min(ny, -0.55); // тень под основанием
      const k = y * w + x; D[k] = inside ? 1e9 : 0; NX[k] = nx; NY[k] = ny; }
    // расстояние до края всей формы (два прохода): облако тает равномерно с краёв, а не распадается по стыкам барашков
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!D[k]) continue; let v = D[k];
      v = Math.min(v, x > 0 ? D[k - 1] + 1 : 1, y > 0 ? D[k - w] + 1 : 1, x > 0 && y > 0 ? D[k - w - 1] + 1.414 : 1.414, x < w - 1 && y > 0 ? D[k - w + 1] + 1.414 : 1.414); D[k] = v; }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const k = y * w + x; if (!D[k]) continue; let v = D[k];
      v = Math.min(v, x < w - 1 ? D[k + 1] + 1 : 1, y < h - 1 ? D[k + w] + 1 : 1, x < w - 1 && y < h - 1 ? D[k + w + 1] + 1.414 : 1.414, x > 0 && y < h - 1 ? D[k + w - 1] + 1.414 : 1.414); D[k] = v; }
    const R = Math.max(6, mr * 0.9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x, o = ((y0 + y) * AW + x0 + x) * 4;
      data[o] = (NX[k] * 0.5 + 0.5) * 255; data[o + 1] = (NY[k] * 0.5 + 0.5) * 255; data[o + 2] = 0; data[o + 3] = Math.min(1, D[k] / R) * 255; }
    rects[name] = [x0 / AW, y0 / AH, w / AW, h / AH];
  }
  // кучевые: 8 заготовок 256x160 -- нижний ряд мелких барашков, средний -- крупные, сверху -- 1-3 «башенки»
  for (let k = 0; k < 8; k++) { const W = 256, H = 160, p = [], wide = k >= 5;
    const n0 = 5 + Math.floor(r() * 3); for (let i = 0; i < n0; i++) { const t = (i + 0.3 + r() * 0.4) / n0, rr = 13 + r() * 12; p.push([22 + t * (W - 44), 8 + rr * 0.55, rr]); }
    const n1 = 3 + Math.floor(r() * 3); for (let i = 0; i < n1; i++) { const t = (i + 0.2 + r() * 0.6) / n1, rr = (24 + r() * 20) * (wide ? 0.75 : 1); p.push([44 + t * (W - 88), 26 + rr * 0.5 + r() * 16, rr]); }
    if (!wide) { const n2 = 1 + Math.floor(r() * 3); for (let i = 0; i < n2; i++) { const rr = 20 + r() * 18; p.push([W / 2 + (r() - 0.5) * 90, 70 + r() * 30, rr]); } }
    bake('cu' + k, (k % 8) * 256, 0, W, H, p); }
  // грозовые башни 320x400: широкое основание, столб, у двух -- наковальня
  for (let k = 0; k < 3; k++) { const W = 320, H = 400, p = [];
    for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7, rr = 22 + r() * 16; p.push([24 + t * (W - 48), 8 + rr * 0.55, rr]); }
    for (let j = 0; j < 8; j++) { const y = 50 + j * 34, rr = 44 - j * 1.5 + r() * 14, x = W / 2 + (r() - 0.5) * 70; p.push([x, y, rr]); p.push([x + (r() < 0.5 ? -1 : 1) * rr * 0.75, y - 8, rr * 0.7]); }
    if (k > 0) for (let i = 0; i < 10; i++) { const t = i / 9; p.push([36 + t * (W - 72), H - 50 - Math.abs(t - 0.5) * 30 - r() * 6, 20 + r() * 12]); }
    bake('cb' + k, k * 320, 160, W, H, p); }
  // низкие гряды у горизонта 512x96: барашки разного размера внахлёст -- неровный верх, ровный низ
  for (let k = 0; k < 4; k++) { const W = 512, H = 96, p = []; let x = 20;
    while (x < W - 20) { const env = Math.sin(Math.PI * x / W), rr = (8 + r() * 22) * (0.45 + 0.55 * env); p.push([x, 6 + rr * (0.6 + r() * 0.5), rr]); x += rr * (0.6 + r() * 0.7); }
    bake('st' + k, 960 + (k % 2) * 512, 160 + Math.floor(k / 2) * 96, W, H, p, { front: 0.3 }); }
  // перистые 512x64: острые штрихи-«перья», вытянутые по ветру
  for (let k = 0; k < 4; k++) { const W = 512, H = 64, x0 = 960 + (k % 2) * 512, y0 = 352 + Math.floor(k / 2) * 64, strokes = [];
    const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const sx = 20 + r() * 120, L = 220 + r() * 260, sy = 12 + r() * 38; strokes.push({ sx, sy, L, w: 3 + r() * 4, b: (r() - 0.3) * 18 }); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let A = 0, ny = 0;
      for (const s of strokes) { const t = (x - s.sx) / s.L; if (t < 0 || t > 1) continue; const cy = s.sy + s.b * t * t, hw = s.w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8) * (1 - 0.6 * t); if (hw <= 0) continue;
        const q = 1 - Math.abs(y - cy) / hw; if (q > A) { A = q; ny = (y - cy) / hw; } }
      const o = ((y0 + y) * AW + x0 + x) * 4; data[o] = 128; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 3] = Math.min(1, A * 1.6) * 255; }
    rects['ci' + k] = [x0 / AW, y0 / AH, W / AW, H / AH]; }
  // полосы дождя 128x256 под грозовыми башнями
  { const W = 128, H = 256, x0 = 1920, y0 = 480; for (let i = 0; i < 70; i++) { const x = 4 + r() * (W - 8), top = H - r() * 30, len = 80 + r() * 160;
      for (let y = Math.max(0, Math.floor(top - len)); y < top; y++) { const xx = Math.round(x - (top - y) * 0.12); if (xx < 0 || xx >= W) continue; const o = ((y0 + y) * AW + x0 + xx) * 4, a = Math.min(1, (y - (top - len)) / 60);
        data[o] = 128; data[o + 1] = 128; data[o + 3] = Math.max(data[o + 3], a * 200); } }
    rects.rain = [x0 / AW, y0 / AH, W / AW, H / AH]; }
  const t = new THREE.DataTexture(data, AW, AH, THREE.RGBAFormat); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return { tex: t, rects };
}

const V = CURVE + `attribute vec4 aC; attribute vec4 aS; attribute vec4 aR; attribute vec4 aL;
uniform vec3 uSun; varying vec2 vUv; varying vec3 vP; varying float vThr; varying vec2 vSun; varying float vY; varying vec4 vL; varying float vKind; varying float vFl;
void main(){ vec3 c=aC.xyz; vec3 dir=c-cameraPosition; vec3 rt=normalize(vec3(-dir.z,0.,dir.x)+1e-4), toCam=normalize(vec3(-dir.x,0.,-dir.z)+1e-4);
  vec3 p=c+rt*position.x*aS.x+vec3(0.,(position.y+0.5)*aS.y,0.); vP=p;
  float u=position.x+0.5; vFl=aS.z; if(aS.z>0.5) u=1.-u; vUv=vec2(aR.x+u*aR.z, aR.y+(position.y+0.5)*aR.w); vY=position.y+0.5;
  vSun=vec2(dot(uSun,rt)*(aS.z>0.5?-1.:1.), dot(uSun,toCam)); vThr=aC.w; vL=aL; vKind=aS.w; p.y-=curve(p);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); if(aC.w>0.97) gl_Position=vec4(2.,2.,2.,1.); }`;
const F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vThr; varying vec2 vSun; varying float vY; varying vec4 vL; varying float vKind; varying float vFl;
// палитры (линейные): свет, средний, тень, контур
void pal(out vec3 L, out vec3 M, out vec3 S, out vec3 I, float storm){
  float day=clamp(uDay,0.,1.), dusk=clamp(uDusk*1.15,0.,1.), night=1.-day;
  L=vec3(1.); M=vec3(0.34,0.56,0.88); S=vec3(0.10,0.24,0.66); I=vec3(0.04,0.12,0.42);                       // день
  L=mix(L,vec3(1.0,0.62,0.26),dusk); M=mix(M,vec3(0.86,0.28,0.24),dusk); S=mix(S,vec3(0.26,0.11,0.40),dusk); I=mix(I,vec3(0.13,0.04,0.22),dusk); // закат
  L=mix(L,vec3(0.13,0.24,0.52),night); M=mix(M,vec3(0.03,0.08,0.24),night); S=mix(S,vec3(0.012,0.025,0.075),night); I=mix(I,vec3(0.30,0.48,0.85),night); // ночь: контур -- лунная кайма
  L=mix(L,vec3(0.50,0.56,0.72),storm); M=mix(M,vec3(0.10,0.15,0.30),storm); S=mix(S,vec3(0.02,0.035,0.09),storm); I=mix(I,vec3(0.008,0.015,0.045),storm); }
void main(){ vec4 t=texture2D(uMap,vUv); float storm=clamp(uStorm*0.9+vL.y,0.,1.);
  vec3 L,M,S,I; pal(L,M,S,I,storm); vec3 c; float al=1.;
  if(vKind>1.5){ // дождь: полупрозрачные косые полосы цвета тени
    al=t.a*0.55*(1.-vThr); if(al<0.02) discard; c=mix(S,M,0.4); }
  else { float f=t.a, aa=fwidth(f)*1.3+1e-4, thr=0.04+vThr*0.92;
    al=smoothstep(thr,thr+aa,f); if(al<0.02) discard;
    vec3 N=vec3(t.r*2.-1., t.g*2.-1., 0.); if(vFl>0.5) N.x=-N.x; N.z=sqrt(max(0.,1.-dot(N.xy,N.xy)));
    vec3 Ld=normalize(vec3(vSun.x, max(uSun.y,-0.2)*0.8+0.35, vSun.y*0.8+0.25));
    float h=dot(N,Ld)*0.85+(vY-0.42)*0.75-storm*0.25; // свет плюс «низ темнее»
    if(vKind>0.5) h=0.25+N.y*0.6; // перистые: светлый верх, голубой низ
    float w=fwidth(h)*0.8+1e-3; float mid=smoothstep(0.08-w,0.08+w,h), hi=smoothstep(0.52-w,0.52+w,h);
    c=mix(S,M,mid); c=mix(c,L,hi);
    float edge=1.-smoothstep(thr+aa,thr+aa*2.6,f); if(vKind<0.5) c=mix(c,I,edge*0.9); } // тонкий контур в цвет тени
  c*=0.75+0.25*uSunI;
  vec3 fogd=applyFog(c,length(vP-cameraPosition),vP.y); c=mix(fogd, uHor, vL.x); // дальние гряды -- в дымке, как горы
  gl_FragColor=vec4(c,al); ${END} }`;

// ---------- поле погоды ----------
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = (q) => q * q * (3 - 2 * q), a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * s(u)) * (1 - s(v)) + (c + (d - c) * s(u)) * s(v); };
// плавное поле 0..1, медленно меняется со временем (две карты шума перетекают друг в друга)
const field = (x, y, t) => { const k = t * 0.0015, f = k - Math.floor(k), n = Math.floor(k), a = vnoise(x / 26000 + n * 7.3, y / 26000) * 0.65 + vnoise(x / 9000 + n * 3.1, y / 9000) * 0.35,
  b = vnoise(x / 26000 + (n + 1) * 7.3, y / 26000) * 0.65 + vnoise(x / 9000 + (n + 1) * 3.1, y / 9000) * 0.35; return a + (b - a) * f; };

export function makeSpriteClouds(scene, h = () => 1000) {
  const { tex, rects } = atlas(), MAX = 2200;
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aC', 'aS', 'aR', 'aL']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); } geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex } }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  const out = []; let ox = 0, oy = 0, T = 0;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const push = (X, Y, Z, W, H, rc, fl, thr, kind, fog, heavy, d) => out.push({ X, Y, Z, W, H, rc, fl, thr, kind, fog, heavy, d });
  // слой клеток: в каждой клетке (сетка сдвинута ветром) -- не больше одного кластера
  function layer(cx, cy, C, R, wk, fn) { const sx = ox * wk, sy = oy * wk, i0 = Math.floor((cx - sx - R) / C), i1 = Math.floor((cx - sx + R) / C), j0 = Math.floor((cy - sy - R) / C), j1 = Math.floor((cy - sy + R) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const X = (i + 0.2 + 0.6 * hash(i * 7 + 1, j * 13 + C)) * C + sx, Y = (j + 0.2 + 0.6 * hash(i * 11 + 3, j * 5 + C)) * C + sy, d = Math.hypot(X - cx, Y - cy); if (d > R) continue; fn(i, j, X, Y, d); } }
  return { mesh,
    // w: { cover 0..1, storm 0..1, cirrus 0..1, wind {sx, sy} }
    update(dt, camera, w) { const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y; T += dt; ox += (w.wind ? w.wind.sx : 2) * dt; oy += (w.wind ? w.wind.sy : 1) * dt; out.length = 0;
      const storm = w.storm || 0, thrC = 1 - Math.min(0.72, 0.2 + w.cover * 0.6 + storm * 0.2); // порог поля: чем облачнее, тем больше клеток «включено»
      // кучевые и грозовые: клетки 6 км, до 60 км
      layer(cx, cy, 6000, 60000, 3, (i, j, X, Y, d) => { const rh = (k) => hash(i * 31 + k, j * 17 + k * 7);
        const land = h(X, Y) > 150, F = field(X - ox * 3, Y - oy * 3, T) + (land ? 0.08 : -0.18) + (rh(9) - 0.5) * 0.12, m = (F - thrC) / 0.18; if (m <= 0) return;
        const tower = storm > 0.35 && rh(1) < storm * 0.45 && m > 0.6 && d > 6000, far = sm(48000, 60000, d), near = 1 - sm(300, 1600, Math.hypot(d, cz - 3000));
        const life = Math.max((1 - Math.min(1, m)) * 0.55, far, near); // край поля: облако «тает» к сердцевинам барашков
        if (tower) { const Wt = 3000 + rh(2) * 2800, Ht = Wt * 400 / 320 * (1 + storm * 0.3), Z = 2300 + rh(3) * 300; push(X, Y, Z, Wt, Ht, rects['cb' + Math.floor(rh(4) * 3)], rh(5) < 0.5 ? 1 : 0, life, 0, 0, 0.25, d);
          if (storm > 0.5 && rh(25) < 0.6) for (let q = 0; q < 1; q++) push(X + (rh(20 + q) - 0.5) * Wt * 0.5, Y + (rh(30 + q) - 0.5) * Wt * 0.3, Z - Wt * 0.55, Wt * 0.45, Wt * 0.6, rects.rain, q, Math.max(life, 1 - storm), 2, 0, 0, d + 1);
          return; }
        // кластер: главный барашек и 2-5 спутников с общим основанием
        const W0 = 1300 + rh(6) ** 1.4 * 3800 * (0.7 + 0.5 * w.cover), Z = 2600 + rh(7) * 700, n = 1 + Math.floor(rh(8) * 3), a0 = rh(10) * 6.28;
        push(X, Y, Z, W0, W0 * 160 / 256, rects['cu' + Math.floor(rh(11) * 8)], rh(12) < 0.5 ? 1 : 0, life, 0, 0, 0, d);
        for (let q = 0; q < n; q++) { const a = a0 + q * 2.1 + rh(40 + q), rr = W0 * (0.28 + rh(50 + q) * 0.2), s = 0.5 + rh(60 + q) * 0.3, px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr * 0.6;
          push(px, py, Z + (rh(70 + q) - 0.5) * 40, W0 * s, W0 * s * 160 / 256, rects['cu' + Math.floor(rh(80 + q) * 8)], rh(90 + q) < 0.5 ? 1 : 0, Math.min(0.97, life + (1 - s) * 0.05), 0, 0, 0, Math.hypot(px - cx, py - cy)); } });
      // низкие гряды у горизонта: клетки 16 км, только дальше 26 км, в дымке
      layer(cx, cy, 16000, 110000, 2, (i, j, X, Y, d) => { const rh = (k) => hash(i * 19 + k, j * 23 + k * 3); if (d < 26000) return;
        const F = field(X * 0.7, Y * 0.7, T * 0.5) + (h(X, Y) > 150 ? 0.1 : -0.1); if (F < thrC - 0.12) return;
        const Wb = 9000 + rh(1) * 9000, life = Math.max(1 - sm(26000, 34000, d), sm(95000, 110000, d), 1 - Math.min(1, (F - thrC + 0.12) / 0.1));
        push(X, Y, 1900 + rh(2) * 700, Wb, Wb * 96 / 512 * 1.2, rects['st' + Math.floor(rh(3) * 4)], rh(4) < 0.5 ? 1 : 0, life, 0, 0.25 + sm(30000, 90000, d) * 0.4, 0, d); });
      // перистые: клетки 22 км, высоко, быстро
      if (w.cirrus > 0.02) layer(cx, cy, 22000, 90000, 7, (i, j, X, Y, d) => { const rh = (k) => hash(i * 41 + k, j * 29 + k * 5); if (rh(1) > w.cirrus * 5) return;
        const Wc = 14000 + rh(2) * 16000; push(X, Y, 8000 + rh(3) * 1500, Wc, Wc / 8, rects['ci' + Math.floor(rh(4) * 4)], rh(5) < 0.5 ? 1 : 0, Math.max(0.15, sm(70000, 90000, d)), 1, 0.15, 0, d + 50000); });
      out.sort((a, b) => b.d - a.d); let n = 0;
      for (const q of out) { if (n >= MAX) break; if (q.thr >= 0.97) continue; at.aC.setXYZW(n, q.X, q.Z, -q.Y, q.thr); at.aS.setXYZW(n, q.W, q.H, q.fl, q.kind); at.aR.setXYZW(n, q.rc[0], q.rc[1], q.rc[2], q.rc[3]); at.aL.setXYZW(n, q.fog, q.heavy, 0, 0); n++; }
      geo.instanceCount = n; mesh.visible = n > 0; for (const k in at) at[k].needsUpdate = true; } };
}
