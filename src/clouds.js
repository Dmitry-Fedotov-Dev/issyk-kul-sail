// Облака в цел-шейдинге -- спрайты по референсу (аниме-небо) с правдоподобной метеорологией Иссык-Куля.
//
// Формы -- cloudart.js: «цветная капуста» из барашков, плоское основание, тон в текстуре; цвета -- здесь, в шейдере.
//
// Где и на какой высоте (высоты игры -- над озером, оно на 1607 м над морем):
//  * Летом над Иссык-Кулём кучевые -- конвективные: утром небо чистое, к 10-11 ч над прогретыми склонами
//    Кунгей- и Терскей-Ала-Тоо вырастают первые плоские облачка (humilis), к 14-17 ч -- самые мощные
//    (mediocris, congestus), к вечеру оседают и тают. Ночью -- почти ясно.
//  * Над озером днём облаков почти нет: вода холоднее суши, дневной бриз с озера гасит восходящие потоки.
//    Ночью наоборот -- тёплое озеро может «подкурить» облачко над водой.
//  * Основание кучевых -- уровень конденсации: ~125 м на каждый градус между температурой и точкой росы.
//    Утром ~3300 м над морем, днём, когда воздух у земли суше и жарче, поднимается к ~4200 м --
//    то есть на уровень гребней: облака садятся на хребты, вершины Терскея (5000+) торчат сквозь них.
//    Над высокими горами основание чуть выше. Толщина: humilis -- 300-600 м, mediocris -- до 1.5 км,
//    congestus -- 2-3 км. В непогоду (низкое давление, фронт) основание опускается до ~2900 м,
//    кучево-дождевые растут до тропопаузы (~12 км) и растекаются наковальней.
//  * Перистые -- 8.5-10.5 км, вытянуты по ветру наверху и бегут быстрее нижних.
//  * Вдали облака сливаются в гряды у горизонта и тонут в дымке, как дальние горы.
// Каждое облако живёт своей жизнью: растёт, держится, тает (за пару минут -- игровой час идёт минуту),
// и рождается снова в другом месте своей клетки. Облачность в целом -- «поле погоды», плывущее по ветру.
import * as THREE from 'three';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';
import { makeCloudAtlas, AW, AH } from './cloudart.js';

const V = CURVE + `attribute vec4 aC; attribute vec4 aS; attribute vec4 aR; attribute vec4 aL;
uniform vec3 uSun; varying vec2 vUv; varying vec3 vP; varying float vThr; varying float vBack; varying float vY; varying vec4 vL; varying float vKind;
void main(){ vec3 c=aC.xyz; vec3 dir=c-cameraPosition; vec3 rt=normalize(vec3(-dir.z,0.,dir.x)+1e-4);
  vec3 up=normalize(mix(vec3(0.,1.,0.), normalize(cross(rt,normalize(dir))), aS.z*smoothstep(0.,600.,cameraPosition.y-c.y))); // сверху облако наклоняется к камере (не «картонка»), снизу стоит, как на референсе
  vec3 p=c+rt*position.x*aS.x+up*(position.y+0.5)*aS.y; vP=p;
  float sr=dot(uSun,rt); float u=position.x+0.5; if(sr>0. && aS.w<1.5) u=1.-u; // светлая сторона облака -- к солнцу
  vUv=vec2(aR.x+u*aR.z, aR.y+(position.y+0.5)*aR.w); vY=position.y+0.5;
  vBack=clamp(dot(uSun,normalize(vec3(dir.x,0.,dir.z)))*1.2,0.,1.)*clamp(1.-uSun.y*1.5,0.,1.); // солнце за облаком
  vThr=aC.w; vL=aL; vKind=aS.w; p.y-=curve(p);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); if(aC.w>0.97) gl_Position=vec4(2.,2.,2.,1.); }`;
const F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vThr; varying float vBack; varying float vY; varying vec4 vL; varying float vKind;
// палитры (линейные): свет, средний, тень, контур
void pal(out vec3 L, out vec3 M, out vec3 S, out vec3 I, float storm){
  float day=clamp(uDay,0.,1.), dusk=clamp(uDusk*1.15,0.,1.), night=1.-day;
  L=vec3(1.); M=vec3(0.40,0.60,0.88); S=vec3(0.07,0.20,0.66); I=vec3(0.10,0.25,0.70);                         // день
  L=mix(L,vec3(1.0,0.66,0.30),dusk); M=mix(M,vec3(0.92,0.32,0.26),dusk); S=mix(S,vec3(0.24,0.10,0.42),dusk); I=mix(I,vec3(0.30,0.10,0.34),dusk); // закат
  L=mix(L,vec3(0.14,0.25,0.52),night); M=mix(M,vec3(0.04,0.09,0.25),night); S=mix(S,vec3(0.012,0.025,0.075),night); I=mix(I,vec3(0.30,0.48,0.85),night); // ночь: кайма -- от луны
  L=mix(L,vec3(0.32,0.37,0.50),storm); M=mix(M,vec3(0.09,0.12,0.24),storm); S=mix(S,vec3(0.025,0.04,0.10),storm); I=mix(I,vec3(0.01,0.02,0.05),storm); }
void main(){ vec4 t=texture2D(uMap,vUv); float storm=clamp(uStorm*1.2+vL.y,0.,1.);
  vec3 L,M,S,I; pal(L,M,S,I,storm); vec3 c; float al=1.;
  if(vKind>1.5){ al=t.a*0.5*(1.-vThr); if(al<0.02) discard; c=mix(S,M,0.4); } // полосы дождя
  else { float f=t.a, aa=fwidth(f)*1.2+1e-4, thr=0.03+vThr*0.94;
    al=smoothstep(thr,thr+aa,f); if(al<0.02) discard;
    float h=t.r-vBack*0.32-storm*0.2+(uDay<0.5?-0.1:0.);  // контражур и гроза -- облако темнее
    float w=fwidth(t.r)*0.7+2e-3; float mid=smoothstep(0.3-w,0.3+w,h), hi=smoothstep(0.55-w,0.55+w,h);
    c=mix(S,M,mid); c=mix(c,L,hi);
    float rim=t.g*smoothstep(0.,0.4,f-thr+0.4); c=mix(c,L*1.05,rim*vBack*0.9); // серебряная кайма против солнца
    float edge=1.-smoothstep(thr+aa,thr+aa*2.4,f); c=mix(c,I,edge*(vKind<0.5?0.85:0.)); if(vKind>0.5) al*=0.35+0.65*clamp(uDay,0.,1.); }
  c*=0.78+0.22*uSunI;
  vec3 fogd=applyFog(c,length(vP-cameraPosition)*vL.z,vP.y); c=mix(fogd,uHor,vL.x); // дальние -- в дымке, как горы
  gl_FragColor=vec4(c,al); ${END} }`;

// ---------- поле погоды ----------
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = (q) => q * q * (3 - 2 * q), a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a + (b - a) * s(u)) * (1 - s(v)) + (c + (d - c) * s(u)) * s(v); };
// плавное поле 0..1, медленно меняется со временем (две карты шума перетекают друг в друга)
const field = (x, y, t) => { const k = t * 0.002, f = k - Math.floor(k), n = Math.floor(k), g = (m) => vnoise(x / 24000 + m * 7.3, y / 24000) * 0.6 + vnoise(x / 8000 + m * 3.1, y / 8000) * 0.4;
  const a = g(n), b = g(n + 1); return a + (b - a) * f; };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function makeSpriteClouds(scene, h = () => 1000) {
  const { data, rects } = makeCloudAtlas(), MAX = 2400;
  const tex = new THREE.DataTexture(data, AW, AH, THREE.RGBAFormat); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aC', 'aS', 'aR', 'aL']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); } geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex } }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  const out = []; let ox = 0, oy = 0, T = 0, fr = 0;
  const push = (X, Y, Z, W, H, rc, thr, kind, fog, heavy, d, tilt = 0.6, fd = 1) => out.push({ X, Y, Z, W, H, rc, thr, kind, fog, heavy, d, tilt, fd });
  // слой клеток: в каждой клетке (сетка плывёт с ветром) -- не больше одного облака/кластера
  function layer(cx, cy, C, R0, R, wk, fn) { const sx = ox * wk, sy = oy * wk, i0 = Math.floor((cx - sx - R) / C), i1 = Math.floor((cx - sx + R) / C), j0 = Math.floor((cy - sy - R) / C), j1 = Math.floor((cy - sy + R) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const X0 = (i + 0.5) * C + sx, Y0 = (j + 0.5) * C + sy, d0 = Math.hypot(X0 - cx, Y0 - cy); if (d0 > R + C || d0 < R0 - C) continue; fn(i, j, i * C + sx, j * C + sy, C); } }
  const pick = (pre, n, v) => rects[pre + Math.min(n - 1, Math.floor(v * n))];
  return { mesh,
    // w: { cover 0..1, storm 0..1, cirrus 0..1, wind {sx, sy}, clock -- часы }
    update(dt, camera, w) { T += dt; ox += (w.wind ? w.wind.sx : 2) * dt; oy += (w.wind ? w.wind.sy : 1) * dt; if (fr++ % 2 && geo.instanceCount) return; // список -- через кадр: облака еле ползут
      const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y; out.length = 0;
      const storm = w.storm || 0, hr = w.clock ?? 13; ENV.uCuK.value = storm * 0.6; // старые мягкие облака неба -- только фоном в непогоду
      const conv = sm(8.5, 13, hr) * (1 - sm(18, 21.5, hr)), eve = sm(16.5, 18.5, hr) * (1 - sm(21, 22.5, hr)), night = 1 - sm(6, 8, hr) * (1 - sm(20, 22, hr)); // конвекция днём; ночь
      const A = Math.max(w.cover * (0.2 + 0.8 * Math.max(conv, eve * 0.75)), storm);    // сколько кучевых: днём растут, вечером оседают и догорают закатом
      const Zb = (1700 + 900 * conv) * (1 - storm) + 1300 * storm;                     // основание над озером: 3300 -> 4200 м н.у.м., в грозу ~2900
      const thr = 1 - Math.min(0.66, 0.12 + A * 0.7);
      // ---- кучевые: клетки 4 км до 64 км (с озера видно облака над обоими хребтами) ----
      layer(cx, cy, 4000, 0, 64000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 31 + k, j * 17 + k * 7);
        // жизнь облака: растёт -- держится -- тает; новое рождается в другом месте клетки
        const per = 90 + rh(1) * 110, q = T / per + rh(2), gen = Math.floor(q), ph = q - gen, rg = (k) => hash(i * 13 + gen * 7 + k, j * 29 + gen * 3 + k * 5);
        const X = x0 + (0.15 + 0.7 * rg(1)) * C, Y = y0 + (0.15 + 0.7 * rg(2)) * C, d = Math.hypot(X - cx, Y - cy); if (d > 64000) return;
        const g = h(X, Y), land = g > 0;
        // над прогретыми склонами гуще, над холодным озером днём пусто, ночью -- наоборот чуть-чуть
        const F = field(X - ox, Y - oy, T) + (land ? 0.1 * Math.min(1, g / 1500) * (0.4 + conv) : -0.32 * conv + 0.06 * night) + (rg(3) - 0.5) * 0.1, m = (F - thr) / 0.2; if (m <= 0) return;
        const grow = Math.sin(Math.PI * ph), I = Math.min(1, m) * (0.35 + 0.8 * conv) + storm * 0.3 - eve * (1 - conv) * 0.4; // мощность облака (вечером -- плоские)
        let life = Math.max(1 - Math.min(1, m * 1.5) * sm(0, 0.35, grow), sm(56000, 64000, d), 1 - sm(250, 1300, Math.hypot(d, cz - Zb - 600)));
        const Zg = Math.max(Zb + 0.2 * Math.max(0, g - 1500), g + 150);                // над высокими горами основание чуть выше
        // прямо над головой спрайт снизу не нарисовать -- такое облако уходит в мягкий «потолок» неба
        const el = (Zg - cz) / Math.max(d, 1); const lifeO = sm(0.35, 0.75, el); if (lifeO >= 0.97) return;
        life = Math.max(life, lifeO);
        if (storm > 0.35 && rh(4) < storm * 0.2 && m > 0.4 && d > 18000) {           // кучево-дождевое до тропопаузы
          const Wt = 6000 + rh(5) * 3500; push(X, Y, Zg, Wt, Wt * 1.25, pick('cb', 3, rh(6)), life, 0, 0, 0.2, d, 0.25);
          if (rh(7) < 0.7) push(X, Y, Zg - Wt * 0.45, Wt * 0.5, Wt * 0.5, rects.rain, Math.max(life, 1 - storm), 2, 0, 0, d - 1, 0);
          return; }
        let W, H, rc; const sz = rg(4);
        if (I < 0.55) { W = 700 + sz * 900; H = W * 96 / 256; rc = pick('cuH', 8, rg(5)); }            // плоские хорошей погоды
        else if (I < 1.0) { W = 1100 + sz * 1400; H = W * 144 / 256; rc = pick('cuM', 8, rg(5)); }    // средние
        else { W = 1700 + sz * 1600; H = W * 240 / 256; rc = pick('cuC', 4, rg(5)); }                 // мощные, башнями
        const fz = 0.25 + 0.15 * sm(30000, 64000, d); push(X, Y, Zg, W, H, rc, life, 0, 0, 0, d, 0.6, fz);
        // спутники -- мелкие плоские рядом, на том же уровне конденсации (кластер, как на референсе)
        const n = Math.floor(rg(6) * (1 + 3 * Math.min(1, m)) * (1 - storm * 0.7)); for (let k = 0; k < n; k++) { const a = rg(10 + k) * 6.28, rr = W * (0.55 + rg(20 + k) * 0.6), Ws = W * (0.3 + rg(30 + k) * 0.3), px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr * 0.7;
          push(px, py, Zg + (rg(40 + k) - 0.5) * 60, Ws, Ws * 96 / 256, pick('cuH', 8, rg(50 + k)), Math.min(0.97, life + 0.08), 0, 0, 0, Math.hypot(px - cx, py - cy), 0.6, fz); } });
      // ---- вдали: гряды у горизонта, ниже и в дымке ----
      layer(cx, cy, 9000, 60000, 150000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 19 + k, j * 23 + k * 3);
        const X = x0 + (0.15 + 0.7 * rh(1)) * C, Y = y0 + (0.15 + 0.7 * rh(2)) * C, d = Math.hypot(X - cx, Y - cy); if (d < 60000 || d > 150000) return;
        const g = h(X, Y), F = field(X - ox, Y - oy, T) + (g > 0 ? 0.1 : -0.25 * conv) + (rh(3) - 0.5) * 0.1; if (F < thr - 0.05) return;
        const life = Math.max(1 - sm(60000, 68000, d), sm(135000, 150000, d), 1 - Math.min(1, (F - thr + 0.05) / 0.12)), Wb = 7000 + rh(4) * 9000, big = A > 0.5 && rh(5) < 0.4;
        const Zf = Zb * (0.75 - 0.25 * sm(60000, 150000, d)) + Math.max(0, g) * 0.2;  // вдали -- ниже, к горизонту
        if (big) push(X, Y, Zf, Wb * 0.45, Wb * 0.45 * 144 / 256, pick('cuM', 8, rh(6)), life, 0, 0.1 + sm(60000, 150000, d) * 0.4, storm * 0.2, d, 0, 0.3);
        else push(X, Y, Zf, Wb, Wb * 72 / 512 * (1 + A), pick('st', 4, rh(6)), life, 0, 0.1 + sm(60000, 150000, d) * 0.4, storm * 0.2, d, 0, 0.3); });
      // ---- перистые: клетки 22 км, высоко, быстро ----
      if (w.cirrus > 0.02) layer(cx, cy, 22000, 0, 100000, 4, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 41 + k, j * 29 + k * 5); if (rh(1) > w.cirrus * 3.5) return;
        const X = x0 + rh(6) * C, Y = y0 + rh(7) * C, d = Math.hypot(X - cx, Y - cy), Wc = 14000 + rh(2) * 16000;
        push(X, Y, 7000 + rh(3) * 2000, Wc, Wc / 13, pick('ci', 4, rh(4)), Math.max(0.3, sm(80000, 100000, d)), 1, 0.3, 0, d + 50000, 0.8, 0.5); });
      out.sort((a, b) => b.d - a.d); let n = 0;
      for (const q of out) { if (n >= MAX) break; if (q.thr >= 0.97) continue; at.aC.setXYZW(n, q.X, q.Z, -q.Y, q.thr); at.aS.setXYZW(n, q.W, q.H, q.tilt, q.kind); at.aR.setXYZW(n, q.rc[0], q.rc[1], q.rc[2], q.rc[3]); at.aL.setXYZW(n, q.fog, q.heavy, q.fd, 0); n++; }
      geo.instanceCount = n; mesh.visible = n > 0; for (const k in at) at[k].needsUpdate = true; } };
}
