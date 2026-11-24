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
import { makeCloudAtlasAsync, AW, AH } from './cloudart.js';
import { PEAKS } from './peaks.js';

const V = CURVE + `attribute vec4 aC; attribute vec4 aS; attribute vec4 aR; attribute vec4 aL;
uniform vec3 uSun; varying vec2 vUv; varying vec3 vP; varying float vThr; varying float vBack; varying float vY; varying vec4 vL; varying float vKind;
void main(){ vec3 c=aC.xyz; vec3 dir=c-cameraPosition; vec3 rt=normalize(vec3(-dir.z,0.,dir.x)+1e-4);
  vec3 up=normalize(mix(vec3(0.,1.,0.), normalize(cross(rt,normalize(dir))), aS.z*smoothstep(0.,600.,cameraPosition.y-c.y))); // сверху облако наклоняется к камере (не «картонка»), снизу стоит, как на референсе
  vec3 p=c+rt*position.x*aS.x+up*(position.y+0.5)*aS.y; vP=p;
  float sr=dot(uSun,rt); float u=position.x+0.5; if(aL.w<0.5){ if(sr>0. && aS.w<1.5) u=1.-u; } else if(aL.w>1.5) u=1.-u; // светлая сторона -- к солнцу; флаг, шапка, наковальня -- по ветру (решает CPU)
  vUv=vec2(aR.x+u*aR.z, aR.y+(position.y+0.5)*aR.w); vY=position.y+0.5;
  vBack=clamp(dot(uSun,normalize(vec3(dir.x,0.,dir.z)))*1.2,0.,1.)*clamp(1.-uSun.y*1.5,0.,1.); // солнце за облаком
  vThr=aC.w; vL=aL; vKind=aS.w; p.y-=curve(p);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); if(aC.w>0.97) gl_Position=vec4(2.,2.,2.,1.); }`;
const F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vThr; varying float vBack; varying float vY; varying vec4 vL; varying float vKind;
// палитры (линейные): свет, средний, тень, контур
void pal(out vec3 L, out vec3 M, out vec3 S, out vec3 D, out vec3 I, float storm){
  float day=clamp(uDay,0.,1.), dusk=clamp(uDusk*1.15,0.,1.), night=1.-day;
  L=vec3(1.); M=vec3(0.40,0.60,0.88); S=vec3(0.07,0.20,0.66); D=vec3(0.02,0.07,0.36); I=vec3(0.006,0.014,0.075);  // день; контур -- тёмно-синий
  L=mix(L,vec3(1.0,0.66,0.30),dusk); M=mix(M,vec3(0.92,0.32,0.26),dusk); S=mix(S,vec3(0.24,0.10,0.42),dusk); D=mix(D,vec3(0.08,0.03,0.22),dusk); I=mix(I,vec3(0.04,0.01,0.07),dusk); // закат
  L=mix(L,vec3(0.14,0.25,0.52),night); M=mix(M,vec3(0.04,0.09,0.25),night); S=mix(S,vec3(0.012,0.025,0.075),night); D=mix(D,vec3(0.004,0.008,0.03),night); I=mix(I,vec3(0.30,0.48,0.85),night); // ночь: кайма -- от луны
  L=mix(L,vec3(0.32,0.37,0.50),storm); M=mix(M,vec3(0.09,0.12,0.24),storm); S=mix(S,vec3(0.025,0.04,0.10),storm); D=mix(D,vec3(0.01,0.016,0.04),storm); I=mix(I,vec3(0.004,0.008,0.02),storm); }
void main(){ vec4 t=texture2D(uMap,vUv); float storm=clamp(uStorm*1.2+vL.y,0.,1.);
  vec3 L,M,S,D,I; pal(L,M,S,D,I,storm); vec3 c; float al=1.;
  if(vKind>1.5 && vKind<2.5){ al=t.a*0.5*(1.-vThr); if(al<0.02) discard; c=mix(S,M,0.4); } // полосы дождя
  else { float f=t.a, aa=fwidth(f)*1.2+1e-4, thr=0.03+vThr*0.94;
    al=smoothstep(thr,thr+aa,f); if(al<0.02) discard;
    float h=t.r-vBack*0.32-storm*0.2+(uDay<0.5?-0.1:0.);  // контражур и гроза -- облако темнее
    float w=fwidth(t.r)*0.7+2e-3; float dp=smoothstep(0.17-w,0.17+w,h), mid=smoothstep(0.32-w,0.32+w,h), hi=smoothstep(0.56-w,0.56+w,h);
    c=mix(D,S,dp); c=mix(c,M,mid); c=mix(c,L,hi); // 4 тона: глубокая тень, тень, основной, свет
    float rim=t.g*smoothstep(0.,0.4,f-thr+0.4); c=mix(c,L*1.05,rim*vBack*0.9); // серебряная кайма против солнца
    float edge=1.-smoothstep(thr+aa*1.8,thr+aa*3.,f); c=mix(c,I,edge*(vKind<0.5?0.9:0.)); if(vKind>0.5 && vKind<1.5) al*=0.45*(0.35+0.65*clamp(uDay,0.,1.)); if(vKind>2.5) al*=0.85; }
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
  const MAX = 2400; let rects = null, meta = null; // атлас рисуется по кусочкам между кадрами; до готовности неба нет
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  makeCloudAtlasAsync().then((A) => { const t = new THREE.DataTexture(A.data, AW, AH, THREE.RGBAFormat); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    mat.uniforms.uMap.value = t; tex.dispose(); rects = A.rects; meta = A.meta; });
  tex.needsUpdate = true;
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aC', 'aS', 'aR', 'aL']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); } geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex } }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  const out = []; let ox = 0, oy = 0, T = 0, fr = 0;
  const push = (X, Y, Z, W, H, rc, thr, kind, fog, heavy, d, tilt = 0.6, fd = 1, fl = 0) => out.push({ X, Y, Z, W, H, rc, thr, kind, fog, heavy, d, tilt, fd, fl });
  const hOf = (rc, W) => W * rc[3] / rc[2] * AH / AW; // высота спрайта по пропорциям заготовки
  // слой клеток: в каждой клетке (сетка плывёт с ветром) -- не больше одного облака/кластера
  function layer(cx, cy, C, R0, R, wk, fn) { const sx = ox * wk, sy = oy * wk, i0 = Math.floor((cx - sx - R) / C), i1 = Math.floor((cx - sx + R) / C), j0 = Math.floor((cy - sy - R) / C), j1 = Math.floor((cy - sy + R) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const X0 = (i + 0.5) * C + sx, Y0 = (j + 0.5) * C + sy, d0 = Math.hypot(X0 - cx, Y0 - cy); if (d0 > R + C || d0 < R0 - C) continue; fn(i, j, i * C + sx, j * C + sy, C); } }
  const pick = (pre, n, v) => rects[pre + Math.min(n - 1, Math.floor(v * n))];
  const fwd = new THREE.Vector3();
  // демо для проверки форм: все типы облаков перед камерой (api.demo = {follow: 1} или {x, y, th}); шапка и флаг -- на настоящих вершинах
  function demo(cx, cy, D, Zb, w) { const fx = Math.sin(D.th), fy = Math.cos(D.th), rx = fy, ry = -fx, at = (a, s) => [D.x + fx * a + rx * s, D.y + fy * a + ry * s];
    const wl = Math.hypot(w.wind?.sx || 1, w.wind?.sy || 0), wx = (w.wind?.sx ?? 1) / wl, wy = (w.wind?.sy ?? 0) / wl;
    const side = (X, Y) => { const dX = X - cx, dY = Y - cy, n = Math.hypot(dX, dY) || 1; return Math.sign((wx * dY - wy * dX) / n) || 1; }; // +1: ветер на экране вправо
    const put = (X, Y, Z, W, rc, { kind = 0, fd = 0.25, fog = 0, fl = 0 } = {}) => push(X, Y, Z, W, hOf(rc, W), rc, 0, kind, fog, 0, Math.hypot(X - cx, Y - cy), kind === 1 ? 0.8 : 0.6, fd, fl);
    const P = (a, s, Z, W, rc, o) => { const [X, Y] = at(a, s); put(X, Y, Z, W, rc, o); };
    const byWind = (a, s, Z, W, rc, o = {}) => { const [X, Y] = at(a, s); put(X, Y, Z, W, rc, { ...o, fl: side(X, Y) > 0 ? 1 : 2 }); };
    P(4000, -1600, Zb, 900, rects.hum0); P(6500, 2600, Zb + 150, 700, rects.hum3); P(7500, -300, Zb + 80, 1900, rects.cu1); P(9500, 3800, Zb - 100, 1500, rects.cu4);
    { const [X, Y] = at(6000, -4800); P(6000, -4800, Math.max(0, h(X, Y)) + 40, 3000, rects.fog0, { kind: 3 }); }
    P(13000, 5200, Zb * 0.7, 2200, rects.rot1); P(20000, -7000, Zb - 300, 5200, rects.st2);
    P(18000, -2500, 4200, 7000, rects.ac1); P(24000, 7000, 3800, 6000, rects.len2); P(30000, 0, 8000, 16000, rects.ci1, { kind: 1, fd: 0.5, fog: 0.3 });
    P(32000, -13000, Zb, 7000, rects.cbT0, { fd: 0.2 }); byWind(46000, 15000, Zb, 15000, rects.cbA1, { fd: 0.2 });
    // вершины впереди: самая высокая -- шапка, следующая (не ближе 6 км) -- флаг
    if (!D.pk) { D.pk = PEAKS.map(([, X, Y]) => { const dX = X - D.x, dY = Y - D.y, a = dX * fx + dY * fy, s = dX * rx + dY * ry; return { X, Y, a, s, g: h(X, Y) }; })
        .filter((p) => p.a > 7000 && p.a < 30000 && Math.abs(p.s) < p.a * 0.45).sort((p, q) => q.g - p.g); }
    const pk = D.pk, p1 = pk[0], p2 = pk.find((p) => p1 && Math.hypot(p.X - p1.X, p.Y - p1.Y) > 3000);
    if (p1) { const rc = rects.cap0, W = 3800, H = hOf(rc, W); push(p1.X, p1.Y, p1.g - meta.cap0.ay * H + 40, W, H, rc, 0, 0, 0, 0, Math.hypot(p1.X - cx, p1.Y - cy) - 200, 0.6, 0.25, side(p1.X, p1.Y) > 0 ? 1 : 2); }
    if (p2) { const rc = rects.ban1, W = 4200, H = hOf(rc, W), sd = side(p2.X, p2.Y), dX = p2.X - cx, dY = p2.Y - cy, n = Math.hypot(dX, dY), off = sd * (0.5 - meta.ban1.ax) * W;
      push(p2.X + dY / n * off, p2.Y - dX / n * off, p2.g - meta.ban1.ay * H + 60, W, H, rc, 0, 0, 0, 0, n - 200, 0.6, 0.25, sd > 0 ? 1 : 2); } }
  const api = { mesh, demo: false,
    // w: { cover 0..1, storm 0..1, cirrus 0..1, wind {sx, sy}, clock -- часы }
    update(dt, camera, w) { T += dt; ox += (w.wind ? w.wind.sx : 2) * dt; oy += (w.wind ? w.wind.sy : 1) * dt; if (!rects || (fr++ % 2 && geo.instanceCount)) return; // список -- через кадр: облака еле ползут
      const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y; out.length = 0;
      const storm = w.storm || 0, hr = w.clock ?? 13; ENV.uCuK.value = storm * 0.6; // старые мягкие облака неба -- только фоном в непогоду
      const conv = sm(8.5, 13, hr) * (1 - sm(18, 21.5, hr)), eve = sm(16.5, 18.5, hr) * (1 - sm(21, 22.5, hr)), night = 1 - sm(6, 8, hr) * (1 - sm(20, 22, hr)); // конвекция днём; ночь
      const A = Math.max(w.cover * (0.2 + 0.8 * Math.max(conv, eve)), storm);    // сколько кучевых: днём растут, вечером оседают и догорают закатом
      const Zb = (1700 + 900 * conv) * (1 - storm) + 1300 * storm;                     // основание над озером: 3300 -> 4200 м н.у.м., в грозу ~2900
      const thr = 1 - Math.min(0.62, 0.18 + A * 0.6);                                   // выше порог -- больше чистого неба
      if (api.demo) { const D = api.demo; if (D.x === undefined || D.follow) { camera.getWorldDirection(fwd); const th = Math.atan2(fwd.x, -fwd.z); if (D.th === undefined || Math.abs(th - D.th) > 0.02 || Math.hypot(cx - D.x, cy - D.y) > 500) D.pk = null; Object.assign(D, { x: cx, y: cy, th }); } demo(cx, cy, D, Zb, w); } else {
      // ---- кучевые: клетки 4 км до 64 км (с озера видно облака над обоими хребтами) ----
      layer(cx, cy, 4000, 0, 64000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 31 + k, j * 17 + k * 7);
        // жизнь облака: растёт -- держится -- тает; новое рождается в другом месте клетки
        const per = 90 + rh(1) * 110, q = T / per + rh(2), gen = Math.floor(q), ph = q - gen, rg = (k) => hash(i * 13 + gen * 7 + k, j * 29 + gen * 3 + k * 5);
        const X = x0 + (0.1 + 0.8 * rg(1)) * C, Y = y0 + (0.1 + 0.8 * rg(2)) * C, d = Math.hypot(X - cx, Y - cy); if (d > 64000) return;
        if (rg(11) < 0.3) return; // случайные окна чистого неба -- без ровных цепочек
        const g = h(X, Y), land = g > 0;
        // над прогретыми склонами гуще, над холодным озером днём пусто, ночью -- наоборот чуть-чуть
        const F = field(X - ox, Y - oy, T) + (land ? 0.1 * Math.min(1, g / 1500) * (0.4 + conv) : -0.32 * conv + 0.06 * night) + (rg(3) - 0.5) * 0.14, m = (F - thr) / 0.2; if (m <= 0) return;
        const grow = Math.sin(Math.PI * ph), I = Math.min(1, m) * (0.35 + 0.8 * conv) - eve * (1 - conv) * 0.4; // мощность облака (вечером -- плоские)
        let life = Math.max(1 - Math.min(1, m * 1.5) * sm(0, 0.35, grow), sm(56000, 64000, d), 1 - sm(250, 1300, Math.hypot(d, cz - Zb - 400)));
        const Zg = Math.max(Zb + 0.2 * Math.max(0, g - 1500), g + 150) + (rg(7) - 0.5) * 500; // основание: над горами чуть выше, у каждого облака своё
        // прямо над головой спрайт снизу не нарисовать -- такое облако уходит в мягкий «потолок» неба
        const el = (Zg - cz) / Math.max(d, 1), lifeO = sm(0.35, 0.75, el); if (lifeO >= 0.97) return; life = Math.max(life, lifeO);
        const fz = 0.25 + 0.15 * sm(30000, 64000, d);
        // размер: много мелких, мало крупных; крупные массы -- днём над хребтами и в непогоду
        const sz = rg(4) ** 1.6; let W, rc;
        if (storm > 0.4 && rg(8) < storm * 0.6) { W = 2500 + sz * 6000; rc = pick('st', 4, rg(5)); const Hs = hOf(rc, W) * 1.6; push(X, Y, Zg, W, Hs, rc, life, 0, 0, 0, d, 0.6, fz); return; } // в непогоду -- плоские тяжёлые массы
        W = 500 + sz * 2000 * (0.6 + 0.6 * Math.min(1, I)) * (I > 0.8 && rg(8) < 0.3 ? 1.8 : 1); rc = W < 1100 || I < 0.45 ? pick('hum', 5, rg(5)) : pick('cu', 6, rg(5));
        if (W < d * 0.02) return; // вдали мелочь не видна -- без «крошек» у горизонта
        push(X, Y, Zg, W, hOf(rc, W), rc, life, 0, 0, 0, d, 0.6, fz);
        // спутники -- 0-2 маленьких облачка поодаль, свои размеры и высоты
        const n = W > d * 0.05 ? Math.floor(rg(6) * 3 * Math.min(1, m)) : 0; for (let k = 0; k < n; k++) { const a = rg(10 + k) * 6.28, rr = W * (0.9 + rg(20 + k) * 1.4), Ws = W * (0.18 + rg(30 + k) * 0.3), px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr * 0.7, rc2 = pick('hum', 5, rg(50 + k));
          push(px, py, Zg + (rg(40 + k) - 0.5) * 300, Ws, hOf(rc2, Ws), rc2, Math.min(0.97, life + 0.08), 0, 0, 0, Math.hypot(px - cx, py - cy), 0.6, fz); } });
      // ---- кучево-дождевые: редкие крупные системы, 1-3 на всё небо, только вдали ----
      if (storm > 0.35) layer(cx, cy, 36000, 25000, 130000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 53 + k, j * 37 + k * 11); if (rh(1) > storm * 0.55) return;
        const X = x0 + (0.2 + 0.6 * rh(2)) * C, Y = y0 + (0.2 + 0.6 * rh(3)) * C, d = Math.hypot(X - cx, Y - cy); if (d < 25000 || d > 130000) return;
        const Wt = 10000 + rh(4) * 6000, Zc = Zb + Math.max(0, h(X, Y)) * 0.15, life = Math.max(1 - sm(25000, 32000, d), sm(115000, 130000, d)), fg = 0.05 + sm(40000, 130000, d) * 0.35;
        const rcb = pick(rh(6) < 0.6 ? 'cbA' : 'cbT', 2, rh(5)), Wc = rcb === rects.cbA0 || rcb === rects.cbA1 ? Wt * 1.5 : Wt * 0.7; const dX = X - cx, dY = Y - cy, ws = Math.sign((w.wind?.sx ?? 1) * dY - (w.wind?.sy ?? 0) * dX) || 1;
        push(X, Y, Zc, Wc, hOf(rcb, Wc), rcb, life, 0, fg, 0.15, d, 0.25, 0.3, ws > 0 ? 1 : 2);
        push(X + Wt * 0.05, Y, Zc - Wt * 0.3, Wt * 0.45, Wt * 0.35, rects.rain, Math.max(life, 1 - storm), 2, fg, 0, d - 1, 0, 0.3); });
      // ---- вдали: гряды слоисто-кучевых с разрывами, ниже и в дымке ----
      layer(cx, cy, 9000, 60000, 150000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 19 + k, j * 23 + k * 3); if (rh(8) > 0.35 + A * 0.3) return;
        const X = x0 + (0.1 + 0.8 * rh(1)) * C, Y = y0 + (0.1 + 0.8 * rh(2)) * C, d = Math.hypot(X - cx, Y - cy); if (d < 60000 || d > 150000) return;
        const g = h(X, Y), F = field(X - ox, Y - oy, T) + (g > 0 ? 0.1 : -0.25 * conv) + (rh(3) - 0.5) * 0.14; if (F < thr) return;
        const life = Math.max(1 - sm(60000, 68000, d), sm(135000, 150000, d), 1 - Math.min(1, (F - thr) / 0.12)), Zf = Zb * (0.75 - 0.25 * sm(60000, 150000, d)) + Math.max(0, g) * 0.2 + (rh(9) - 0.5) * 400;
        const fg = 0.1 + sm(60000, 150000, d) * 0.4;
        if (rh(5) < 0.35) { const Wc = 2500 + rh(4) * 4000, rc = pick('cu', 6, rh(6)); push(X, Y, Zf, Wc, hOf(rc, Wc), rc, life, 0, fg, storm * 0.2, d, 0, 0.3); }
        else { const Wb = 5000 + rh(4) * 11000, rs = pick('st', 4, rh(6)); push(X, Y, Zf, Wb, hOf(rs, Wb) * (0.8 + A * 0.6), rs, life, 0, fg, storm * 0.2, d, 0, 0.3); } });
      // ---- перистые: клетки 22 км, высоко, быстро ----
      if (w.cirrus > 0.02) layer(cx, cy, 22000, 0, 100000, 4, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 41 + k, j * 29 + k * 5); if (rh(1) > w.cirrus * 2.5) return;
        const X = x0 + rh(6) * C, Y = y0 + rh(7) * C, d = Math.hypot(X - cx, Y - cy), Wc = 9000 + rh(2) * 14000;
        const rci = pick('ci', 4, rh(4)); push(X, Y, 7000 + rh(3) * 2000, Wc, hOf(rci, Wc) * 0.6, rci, Math.max(0.25, sm(80000, 100000, d)), 1, 0.3, 0, d + 50000, 0.8, 0.5); }); }
      out.sort((a, b) => b.d - a.d); let n = 0;
      for (const q of out) { if (n >= MAX) break; if (q.thr >= 0.97) continue; at.aC.setXYZW(n, q.X, q.Z, -q.Y, q.thr); at.aS.setXYZW(n, q.W, q.H, q.tilt, q.kind); at.aR.setXYZW(n, q.rc[0], q.rc[1], q.rc[2], q.rc[3]); at.aL.setXYZW(n, q.fog, q.heavy, q.fd, q.fl); n++; }
      geo.instanceCount = n; mesh.visible = n > 0; for (const k in at) at[k].needsUpdate = true; } };
  return api;
}
