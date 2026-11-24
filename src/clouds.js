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
//  * Расстановка (cloudgeo.js): облачность садится на хребты, зеркало воды остаётся чистым. В ущельях облако рождается
//    первым и вытекает по руслу длинным клубящимся валом -- через прорезь переднего хребта его видно с озера.
//    Непогода приходит либо на всю котловину (тогда и над водой валы слоисто-кучевых), либо на один берег:
//    там свинцовые тучи и кучево-дождевые, а озеро и другой берег -- под солнцем.
//  * Заметность как у гор: вдали ступени тона сближаются, контур тоньше и светлее -- облако не перебивает хребет.
// Каждое облако живёт своей жизнью: растёт, держится, тает (за пару минут -- игровой час идёт минуту),
// и рождается снова в другом месте своей клетки. Облачность в целом -- «поле погоды», плывущее по ветру.
import * as THREE from 'three';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';
import { makeCloudAtlasAsync, AW, AH, PHI, IPHI } from './cloudart.js';
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
  L=vec3(1.); M=vec3(0.40,0.60,0.88); S=vec3(0.11,0.27,0.70); D=vec3(0.05,0.14,0.50); I=vec3(0.006,0.014,0.075);  // день; контур -- тёмно-синий
  L=mix(L,vec3(1.0,0.66,0.30),dusk); M=mix(M,vec3(0.92,0.32,0.26),dusk); S=mix(S,vec3(0.24,0.10,0.42),dusk); D=mix(D,vec3(0.08,0.03,0.22),dusk); I=mix(I,vec3(0.04,0.01,0.07),dusk); // закат
  L=mix(L,vec3(0.14,0.25,0.52),night); M=mix(M,vec3(0.04,0.09,0.25),night); S=mix(S,vec3(0.012,0.025,0.075),night); D=mix(D,vec3(0.004,0.008,0.03),night); I=mix(I,vec3(0.30,0.48,0.85),night); // ночь: кайма -- от луны
  L=mix(L,vec3(0.32,0.37,0.50),storm); M=mix(M,vec3(0.09,0.12,0.24),storm); S=mix(S,vec3(0.025,0.04,0.10),storm); D=mix(D,vec3(0.01,0.016,0.04),storm); I=mix(I,vec3(0.004,0.008,0.02),storm); }
void main(){ vec4 t=texture2D(uMap,vUv); float storm=clamp(vL.y,0.,1.); // непогода -- у каждого облака своя: туча на одном берегу, на другом солнце
  float dist=length(vP-cameraPosition), fk=smoothstep(2500.,45000.,dist); // даль: тон и контур мягче, как у гор -- облако не спорит с хребтом
  vec3 L,M,S,D,I; pal(L,M,S,D,I,storm); vec3 c; float al=1.;
  if(vKind>1.5 && vKind<2.5){ al=t.a*0.5*(1.-vThr); if(al<0.02) discard; c=mix(S,M,0.4); } // полосы дождя
  else { float f=t.a, aa=fwidth(f)*1.2+1e-4, thr=0.03+vThr*0.22; // рождение и таяние -- прозрачностью и лёгким сжатием, а не обгрызанием краёв: силуэт и контур целые
    al=smoothstep(thr,thr+aa,f)*clamp(1.15-vThr*1.25,0.,1.); if(al<0.02) discard;
    float h=t.r-vBack*0.32-storm*0.2+(uDay<0.5?-0.1:0.);  // контражур и гроза -- облако темнее
    float w=fwidth(t.r)*0.7+2e-3; float dp=smoothstep(0.17-w,0.17+w,h), mid=smoothstep(0.32-w,0.32+w,h), hi=smoothstep(0.56-w,0.56+w,h);
    c=mix(D,S,dp); c=mix(c,M,mid); c=mix(c,L,hi); // 4 тона: глубокая тень, тень, основной, свет
    // рефлекс: низ в тени подсвечен отражённым светом -- от бирюзовой воды и прогретых склонов; в тени он светлее
    // собственной тени, но темнее освещённой части (правило живописи: рефлекс никогда не спорит со светом)
    vec3 Rf=mix(mix(S,M,0.55), vec3(0.24,0.62,0.68), 0.45*clamp(uDay,0.,1.)*(1.-storm)); Rf=mix(Rf, mix(S,M,0.35), clamp(uDusk,0.,1.)*0.6);
    c=mix(c, Rf, t.b*(1.-smoothstep(0.32,0.5,h))*0.85);
    c=mix(c, mix(M,L,0.5), fk*0.4);                                                   // воздушная перспектива: ступени тона сближаются
    float rim=t.g*smoothstep(0.,0.4,f-thr+0.4); c=mix(c,L*1.05,rim*vBack*0.9); // серебряная кайма против солнца
    float edge=1.-smoothstep(thr+aa*mix(0.55,0.2,fk),thr+aa*mix(1.5,0.8,fk),f);       // контур как у гор: вблизи ~1 px, вдали -- волосок
    c=mix(c,mix(mix(I,D,0.5),S,fk*0.8),edge*(vKind<0.5?0.75*mix(1.,0.35,fk):0.)); if(vKind>0.5 && vKind<1.5) al*=0.45*(0.35+0.65*clamp(uDay,0.,1.)); if(vKind>2.5) al*=0.85; }
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

export function makeSpriteClouds(scene, h = () => 1000, B = null) { // B -- разбор котловины (cloudgeo.js): озеро, берега, ущелья
  const MAX = 2400; let rects = null, meta = null; // атлас рисуется по кусочкам между кадрами; до готовности неба нет
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  makeCloudAtlasAsync().then((A) => { const t = new THREE.DataTexture(A.data, AW, AH, THREE.RGBAFormat); t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    mat.uniforms.uMap.value = t; tex.dispose(); rects = A.rects; meta = A.meta; });
  tex.needsUpdate = true;
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aC', 'aS', 'aR', 'aL']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); } geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex } }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  const out = []; let ox = 0, oy = 0, T = 0, fr = 0, reg = 1; // reg -- над каким хребтом гроза грозового дня: 1 -- Кунгей (север), -1 -- Терскей (юг)
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
    const put = (X, Y, Z, W, rc, { kind = 0, fd = 0.25, fog = 0, fl = 0 } = {}) => push(X, Y, Z, W, hOf(rc, W), rc, 0, kind, fog, (w.storm || 0) * 1.2, Math.hypot(X - cx, Y - cy), kind === 1 ? 0.8 : 0.6, fd, fl);
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
  const api = { mesh, demo: false, out, B, setBasin(b) { B = b; api.B = b; }, // разбор котловины можно отдать позже (после показа меню); out, B -- для проверок; api.reg = 1 | -1 -- грозовой день над Кунгеем / Терскеем, 0 -- без грозы
    // w: { cover 0..1, storm 0..1, cirrus 0..1, wind {sx, sy}, clock -- часы }
    update(dt, camera, w) { T += dt; ox += (w.wind ? w.wind.sx : 2) * dt; oy += (w.wind ? w.wind.sy : 1) * dt; if (!rects || (fr++ % 2 && geo.instanceCount)) return; // список -- через кадр: облака еле ползут
      const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y; out.length = 0;
      const storm = w.storm || 0, hr = w.clock ?? 13; ENV.uCuK.value = storm * 0.6; // старые мягкие облака неба -- только фоном в непогоду
      const conv = sm(8.5, 13, hr) * (1 - sm(18, 21.5, hr)), eve = sm(16.5, 18.5, hr) * (1 - sm(21, 22.5, hr)), night = 1 - sm(6, 8, hr) * (1 - sm(20, 22, hr)); // конвекция днём; ночь
      const A = Math.max((0.15 + 0.85 * w.cover) * (0.2 + 0.8 * Math.max(conv, eve)), storm); // сколько кучевых: днём растут, вечером оседают и догорают закатом
      const Zb = (1700 + 900 * conv) * (1 - storm) + 1300 * storm;                     // основание над озером: 3300 -> 4200 м н.у.м., в грозу ~2900
      const thr = 1 - Math.min(0.62, 0.18 + A * 0.6);                                   // выше порог -- больше чистого неба
      if (api.demo) { const D = api.demo; if (D.x === undefined || D.follow) { camera.getWorldDirection(fwd); const th = Math.atan2(fwd.x, -fwd.z); if (D.th === undefined || Math.abs(th - D.th) > 0.02 || Math.hypot(cx - D.x, cy - D.y) > 500) D.pk = null; Object.assign(D, { x: cx, y: cy, th }); } demo(cx, cy, D, Zb, w); } else {
      // ---- где непогода -- по климату котловины ----
      //  * Осадков с запада на восток всё больше: Балыкчы ~115 мм в год, Чолпон-Ата и Боконбаево 200-250, Каракол ~415,
      //    склоны Кунгея (Курменты, Тюп) ~570 -- и облаков над восточной половиной и над хребтами больше.
      //  * Лето в основном ясное (~2700 ч солнца в год); днём бриз с озера на берег -- над водой облаков нет, они на склонах.
      //  * Грозы в июне-июле -- 9-10 дней в месяц (у Чолпон-Аты 46 в год): в такой день к вечеру над одним из хребтов
      //    вырастают кучево-дождевые, озеро и другой берег под солнцем.
      //  * «Улан» -- сухой тёплый западный ветер-фён из Боомского ущелья: на западе котловины прояснение, а влага,
      //    набранная над озером, выпадает на востоке -- там сплошная облачность и над водой.
      //  * «Санташ» -- прохладный восточный ветер с восточного края озера: облака на востоке ниже и гуще, запад солнечный.
      const pre = w.preset || '', al = B ? B.along : () => 0, day = Math.floor((T + hr * 60) / 1440);
      const tday = api.reg !== undefined ? api.reg !== 0 : pre !== 'ulan' && hash(day * 3 + 1, 517) < 0.3; reg = api.reg || (hash(day, 91) < 0.5 ? 1 : -1); // грозовой день и над каким хребтом
      const thunder = tday ? 0.9 * sm(11.5, 15.5, hr) * (1 - sm(20, 23, hr)) : 0;             // гроза растёт к вечеру
      const pf = (X, Y) => 0.55 + 0.45 * sm(-70000, 60000, al(X, Y));                         // запад сухой -- восток влажный
      const cool = (X, Y) => (pre === 'santash' ? 0.7 * sm(-30000, 50000, al(X, Y)) : 0);    // санташ: холодный воздух с востока
      const wetL = (X, Y) => storm > 0.3 ? storm * (0.3 + 0.7 * sm(-50000, 30000, al(X, Y)))  // улан: непогода тянется к востоку, запад -- фён
        : thunder * (B ? sm(-7000, 9000, reg * B.side(X, Y)) : 1);
      const lakeD = (X, Y, g) => (B ? B.lakeD(X, Y) : g > 0 ? 5000 : 0);
      // спрайт -- плоскость поперёк взгляда: если склон под самим облаком врезается в его низ, край режется прямой линией
      // по рельефу. Поднимаем облако так, чтобы земля под его шириной заходила не выше нижней четверти -- там её прячет
      // мягкая подошва. Дальние гребни между камерой и облаком по-прежнему закрывают низ (облако выглядывает из-за гор)
      const lift = (X, Y, Z, W, H) => { const dX = X - cx, dY = Y - cy, n = Math.hypot(dX, dY) || 1, rx = dY / n, ry = -dX / n; let gm = -1e9;
        for (const t of [-0.45, -0.22, 0, 0.22, 0.45]) gm = Math.max(gm, h(X + rx * W * t, Y + ry * W * t)); return Math.max(Z, gm - 0.22 * H); };
      // ---- кучевые: «садятся» на хребты. Над зеркалом воды пусто, над склонами густо: в ближнем кольце клетки 4 км,
      //      дальше 6 км -- с озера видно облака над обоими хребтами, до 110 км ----
      const cumulus = (ring, R0, R1) => (i, j, x0, y0, C) => { const rh = (k) => hash(i * 31 + k + ring * 977, j * 17 + k * 7);
        // жизнь облака: растёт -- держится -- тает; новое рождается в другом месте клетки
        // Композиция по золотому сечению. Ритм облаков на небе -- это ряд промежутков: случайные -- шум, равные -- сетка,
        // а красивее всего фибоначчиев ритм, длинный и короткий промежутки в отношении φ без повторов. Его даёт золотая
        // последовательность {n·φ}:
        //  * какие клетки заняты -- {(i + j·φ)·φ}: окна чистого неба ложатся квазикристаллом, а не пятнами и не рядами;
        //  * жизни соседних облаков сдвинуты на золотую долю -- облака рождаются друг за другом, а не пачкой;
        //  * каждое новое облако клетки -- на золотой шаг от прежнего: места не повторяются и ровно заполняют клетку.
        const fr = (x) => x - Math.floor(x), ci = i + j * PHI;
        if (fr(ci * PHI + ring * 0.5) < 0.3) return;                                      // окна чистого неба -- фибоначчиевым ритмом
        const per = 90 + rh(1) * 110, q = T / per + fr(ci * IPHI * IPHI), gen = Math.floor(q), ph = q - gen, rg = (k) => hash(i * 13 + gen * 7 + k + ring * 577, j * 29 + gen * 3 + k * 5);
        const X = x0 + (0.1 + 0.8 * fr(rh(3) + gen * IPHI)) * C, Y = y0 + (0.1 + 0.8 * fr(rh(4) + gen * 0.7548777)) * C, /* по второй оси -- «пластическое» число, двумерный родственник φ: с φ по обеим осям точки легли бы на прямую */ d = Math.hypot(X - cx, Y - cy); if (d > R1 || d < R0) return;
        const g = h(X, Y), lk = lakeD(X, Y, g), sl = wetL(X, Y), water = 1 - sm(500, 2500, lk), pfx = pf(X, Y), cl = cool(X, Y), overcast = storm > 0.3 && sl > 0.5;
        if (water > 0.5 && !overcast) return;                                                // зеркало озера чистое: облачность -- на берегах
        // над склонами гуще (прогретые склоны, подъём воздуха), над прибрежной равниной -- редко, на берегу без непогоды -- ясно
        const mf = sm(500, 2200, g), F = field(X - ox, Y - oy, T) + 0.4 * mf * pfx * (0.4 + 0.6 * conv) - 0.4 * (1 - mf) * (1 - sl) + 0.45 * sl * (storm > 0.3 ? 1 : mf) - 0.25 * storm * (1 - sl) + 0.35 * cl + (overcast ? 0.3 * sl * water : 0) + (rg(3) - 0.5) * 0.14, m = (F - thr) / 0.2; if (m <= 0) return;
        const grow = Math.sin(Math.PI * ph), I = Math.min(1, m) * (0.35 + 0.8 * Math.max(conv, sl)) - eve * (1 - conv) * 0.4; // мощность облака (вечером -- плоские)
        const ZbL = ((1700 + 900 * conv) * (1 - sl) + 1300 * sl) - 600 * cl;                               // основание -- уровень конденсации; в непогоду ниже
        let life = Math.max(1 - Math.min(1, m * 1.5) * sm(0, 0.35, grow), ring ? Math.max(1 - sm(R0, R0 + 8000, d), sm(R1 - 10000, R1, d)) : sm(R1 - 8000, R1, d), 1 - sm(250, 1300, Math.hypot(d, cz - ZbL - 400)));
        const Z0 = Math.max(ZbL + 0.2 * Math.max(0, g - 1500), g + 150) + (rg(7) - 0.5) * 500, Zg = Z0 + (Math.min(Z0, g + 160 + rg(7) * 420) - Z0) * sm(250, 1400, g);
        // над горами облако садится на склон (воздух упирается в хребет и конденсируется у земли): ближний гребень закрывает низ -- облако встаёт из-за гор
        // прямо над головой спрайт снизу не нарисовать -- такое облако уходит в мягкий «потолок» неба
        const el = (Zg - cz) / Math.max(d, 1), lifeO = sm(0.35, 0.75, el); if (lifeO >= 0.97) return; life = Math.max(life, lifeO);
        const fz = 0.45 + 0.35 * sm(30000, 100000, d), hv = sl * 1.2;
        const sz = rg(4) ** 1.6; let W, rc;
        if (water > 0.5) { if ((Zg - cz) / Math.max(d, 1) > 0.12) return; W = (3000 + sz * 4000) * (0.8 + 0.4 * Math.min(1, m)); rc = pick('val', 4, rg(5)); const fl = rg(12) < 0.5 ? 1 : 2; // над водой в сплошную непогоду -- валы слоисто-кучевых внахлёст
          push(X, Y, Zg - water * 300, W, hOf(rc, W) * (1.2 + 0.5 * rg(13)), rc, life, 0, 0, hv, d, 0.6, fz, fl); return; }
        if ((sl > 0.4 && storm > 0.3 || cl > 0.3) && rg(8) < Math.max(sl, cl) * 0.6) { W = 2500 + sz * 6000; rc = pick('st', 4, rg(5)); const Hs = hOf(rc, W) * 1.6; push(X, Y, lift(X, Y, Zg, W, Hs), W, Hs, rc, life, 0, 0, hv, d, 0.6, fz); return; } // в непогоду -- плоские тяжёлые массы
        if (water > 0.5) return;                                                              // над водой -- только сплошная пелена
        const lv = Math.min(4, Math.floor(fr(ci * PHI * PHI + gen * IPHI) ** 0.75 * 5)); W = 3600 * IPHI ** Math.max(0, lv - ring) * (0.6 + 0.6 * Math.min(1, I)) * (1 + 0.4 * mf * conv) * (0.92 + 0.16 * rg(9)); rc = W < 1100 || I < 0.45 ? pick('hum', 5, rg(5)) : pick('cu', 6, rg(5)); // размеры -- ряд золотого сечения: 3600, 2200, 1400, 850, 520 м // крупные и мелкие чередуются тем же фибоначчиевым ритмом
        if (W < d * 0.018) return; // вдали мелочь не видна -- без «крошек» у горизонта
        const Hc = hOf(rc, W) * (1 + 0.5 * mf * conv * Math.min(1, I)); push(X, Y, lift(X, Y, Zg, W, Hc), W, Hc, rc, life, 0, 0, hv, d, 0.6, fz); // над хребтом днём растут ввысь (congestus) -- макушки встают из-за гребня
        // спутники по «подсолнуху»: k-й -- под золотым углом 137.5° к предыдущему, на расстоянии W·φ^(k/2), размером W/φ^(k+1)
        const n = W > d * 0.05 ? Math.floor(rg(6) * 4 * Math.min(1, m)) : 0, a0 = rg(10) * 6.28; for (let k = 1; k <= n; k++) { const a = a0 + k * 2.39996, rr = W * (0.75 + 0.35 * PHI ** (k * 0.5)), Ws = W * IPHI ** (k + 1), px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr * 0.7, rc2 = pick('hum', 5, rg(50 + k));
          if (B && B.lakeD(px, py) < 1500) continue;
          push(px, py, lift(px, py, Zg + (rg(40 + k) - 0.5) * 300, Ws, hOf(rc2, Ws)), Ws, hOf(rc2, Ws), rc2, Math.min(0.97, life + 0.08), 0, 0, hv, Math.hypot(px - cx, py - cy), 0.6, fz); } };
      layer(cx, cy, 4000, 0, 60000, 1, cumulus(0, 0, 60000)); layer(cx, cy, 6000, 52000, 110000, 1, cumulus(1, 52000, 110000));
      // ---- облака ущелий: в ущельях облако рождается первым (утром -- после ночной прохлады, днём -- от прогретых бортов)
      //      и выходит длинным клубящимся валом: голова глубже в ущелье, тело идёт вниз по руслу почти на одной высоте --
      //      дно уходит из-под него, борта закрывают низ, -- а хвост выползает из устья к озеру и тает ----
      const morn = sm(6, 7.5, hr) * (1 - sm(10.5, 12.5, hr)), Av = Math.min(1, (0.15 + 0.85 * w.cover) * (0.25 + 0.75 * Math.max(conv, morn)) + 0.3 * morn * (1 - night) + storm * 0.5);
      if (B && Av > 0.05) B.gorges.forEach((q, gi) => { const rh = (k) => hash(gi * 71 + k, 3 + k * 13), d0 = Math.hypot(q.X - cx, q.Y - cy); if (d0 > 120000) return;
        const sw = wetL(q.X, q.Y), act = Math.min(1, Av * pf(q.X, q.Y) * 1.3 + 0.4 * sw); if (rh(1) > act * 1.2) return;
        const per = 160 + rh(2) * 160, qq = T / per + rh(3), gen = Math.floor(qq), ph = qq - gen, rg = (k) => hash(gi * 19 + gen * 7 + k, gen * 3 + k * 11);
        if (rg(1) > 0.7 + act * 0.3) return;                                                // ущелье то в облаке, то чистое
        const W0 = (2400 + rg(3) * 2000) * (0.75 + 0.5 * Math.min(1, q.v / 500)), grow = Math.sin(Math.PI * ph), sl = sw, born = 1 - sm(0, 0.4, grow);
        const Z0 = q.wall - 150 + rg(5) * 300, P = q.path, n = Math.min(P.length, 3 + Math.floor(rg(4) * P.length));    // как далеко вал вытек к озеру
        let lx = 1e9, ly = 1e9;
        if (rg(2) < 0.5) { const X = q.X - q.dx * 1700, Y = q.Y - q.dy * 1700; put1(X, Y, Math.max(h(X, Y), 0), -1); }         // голова глубже в ущелье
        for (let k = 0; k < n; k++) put1(P[k].X, P[k].Y, P[k].g, k);
        function put1(X, Y, g, k) { const d = Math.hypot(X - cx, Y - cy), j = Math.max(0, k), tail = n > 1 ? k / (n - 1) : 0;
          const W = W0 * IPHI ** (j * 0.3) * (k < 0 ? 1.1 : 1);
          if (Math.abs(((X - cx) * (ly - cy) - (Y - cy) * (lx - cx)) / Math.max(1, Math.hypot(lx - cx, ly - cy))) < W * 0.3 && k < n - 1) return; // вдоль взгляда звенья встали бы стопкой -- лишние пропускаем
          lx = X; ly = Y; const rc = pick('val', 4, rg(16 + k)), Hs = hOf(rc, W) * (1.5 + 0.4 * sl) * (1 - 0.35 * tail);
          const dX = X - cx, dY = Y - cy, rs = (q.dx * dY - q.dy * dX) / (Math.hypot(dX, dY) || 1);    // хвост спрайта -- вниз по ущелью
          const life = Math.max(born, sm(105000, 120000, d), 1 - sm(400, 2000, Math.hypot(d, cz - g)), sm(0.55, 1, tail) * 0.6);
          push(X, Y, lift(X, Y, Math.max(g + 150, Z0 - j * 1500 * 0.07) + rg(26 + k) * 100, W, Hs), W, Hs, rc, Math.min(0.96, life), 0, 0, sl * 1.2, d, 0.6, 0.45 + 0.35 * sm(30000, 100000, d), rs > 0 ? 1 : 2); } });
      // ---- кучево-дождевые: редкие крупные системы, 1-3 на всё небо, только вдали и только там, где непогода, -- над хребтами ----
      const cbK = Math.max(storm > 0.35 ? storm : 0, thunder); if (cbK > 0.3) layer(cx, cy, 36000, 25000, 130000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 53 + k, j * 37 + k * 11); if (rh(1) > cbK * 0.55) return;
        const X = x0 + (0.2 + 0.6 * rh(2)) * C, Y = y0 + (0.2 + 0.6 * rh(3)) * C, d = Math.hypot(X - cx, Y - cy); if (d < 25000 || d > 130000) return;
        const g = h(X, Y), sw = wetL(X, Y); if (sw < 0.45 || g < 1200) return;                // над хребтом, где непогода
        const Wt = 10000 + rh(4) * 6000, Zc = Math.max(Zb, g * 0.85), life = Math.max(1 - sm(25000, 32000, d), sm(115000, 130000, d)), fg = 0.05 + sm(40000, 130000, d) * 0.35;
        const rcb = pick(rh(6) < 0.6 ? 'cbA' : 'cbT', 2, rh(5)), Wc = rcb === rects.cbA0 || rcb === rects.cbA1 ? Wt * 1.5 : Wt * 0.7; const dX = X - cx, dY = Y - cy, ws = Math.sign((w.wind?.sx ?? 1) * dY - (w.wind?.sy ?? 0) * dX) || 1;
        push(X, Y, lift(X, Y, Zc, Wc * 0.6, hOf(rcb, Wc)), Wc, hOf(rcb, Wc), rcb, life, 0, fg, sw * 1.2, d, 0.25, 0.3, ws > 0 ? 1 : 2);
        push(X + Wt * 0.05, Y, Zc - Wt * 0.3, Wt * 0.45, Wt * 0.35, rects.rain, Math.max(life, 1 - sw), 2, fg, sw, d - 1, 0, 0.3); });
      // ---- у горизонта: гряды слоисто-кучевых с разрывами над дальними хребтами, ниже и в дымке ----
      layer(cx, cy, 9000, 100000, 160000, 1, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 19 + k, j * 23 + k * 3); if (rh(8) > 0.35 + A * 0.3) return;
        const X = x0 + (0.1 + 0.8 * rh(1)) * C, Y = y0 + (0.1 + 0.8 * rh(2)) * C, d = Math.hypot(X - cx, Y - cy); if (d < 100000 || d > 160000) return;
        const g = h(X, Y), sw = wetL(X, Y); if (!(storm > 0.3 && sw > 0.5) && lakeD(X, Y, g) < 2500) return;
        const F = field(X - ox, Y - oy, T) + (g > 300 ? 0.1 * pf(X, Y) : -0.1) + 0.4 * sw + 0.35 * cool(X, Y) - 0.25 * storm * (1 - sw) + (rh(3) - 0.5) * 0.14; if (F < thr) return;
        const life = Math.max(1 - sm(100000, 110000, d), sm(145000, 160000, d), 1 - Math.min(1, (F - thr) / 0.12)), Zf = Zb * (0.75 - 0.25 * sm(100000, 160000, d)) + Math.max(0, g) * 0.2 + (rh(9) - 0.5) * 400;
        const fg = 0.1 + sm(100000, 160000, d) * 0.4, hv = sw;
        if (rh(5) < 0.35) { const Wc = 2500 + rh(4) * 4000, rc = pick('cu', 6, rh(6)); push(X, Y, lift(X, Y, Zf, Wc, hOf(rc, Wc)), Wc, hOf(rc, Wc), rc, life, 0, fg, hv, d, 0, 0.5); }
        else { const Wb = 5000 + rh(4) * 11000, rs = pick('st', 4, rh(6)); push(X, Y, lift(X, Y, Zf, Wb, hOf(rs, Wb) * (0.8 + A * 0.6)), Wb, hOf(rs, Wb) * (0.8 + A * 0.6), rs, life, 0, fg, hv, d, 0, 0.5); } });
      // ---- перистые: клетки 22 км, высоко, быстро ----
      if (w.cirrus > 0.02) layer(cx, cy, 22000, 0, 100000, 4, (i, j, x0, y0, C) => { const rh = (k) => hash(i * 41 + k, j * 29 + k * 5); if (rh(1) > w.cirrus * 2.5) return;
        const X = x0 + rh(6) * C, Y = y0 + rh(7) * C, d = Math.hypot(X - cx, Y - cy), Wc = 9000 + rh(2) * 14000;
        const rci = pick('ci', 4, rh(4)); push(X, Y, 7000 + rh(3) * 2000, Wc, hOf(rci, Wc) * 0.6, rci, Math.max(0.25, sm(80000, 100000, d)), 1, 0.3, storm, d + 50000, 0.8, 0.5); }); }
      out.sort((a, b) => b.d - a.d); let n = 0;
      for (const q of out) { if (n >= MAX) break; if (q.thr >= 0.97) continue; at.aC.setXYZW(n, q.X, q.Z, -q.Y, q.thr); at.aS.setXYZW(n, q.W, q.H, q.tilt, q.kind); at.aR.setXYZW(n, q.rc[0], q.rc[1], q.rc[2], q.rc[3]); at.aL.setXYZW(n, q.fog, q.heavy, q.fd, q.fl); n++; }
      geo.instanceCount = n; mesh.visible = n > 0; for (const k in at) at[k].needsUpdate = true; } };
  return api;
}
