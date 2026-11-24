// Сцена: реальный рельеф северного берега Иссык-Куля у Чолпон-Аты, небо, вода, берег.
import * as THREE from 'three';
import { HEIGHTMAP_PNG } from './heightmap.js';
import { FAR, FARMAP_PNG } from './farmap.js';
import { NWAVES, noise2, smooth, clamp } from './sim.js';
import { FOAM_GLSL } from './foam.js';

// Карта высот: 1024x1024, 28.11 м/пиксель (тайлы z12, широта 42.65°). Начало мира -- в бухте.
export const MAP = { N: 1024, M: 28.11, OX: 600, OY: 695 };
export const SUN = new THREE.Vector3(Math.sin(3.55) * 0.78, 0.62, -Math.cos(3.55) * 0.78).normalize(); // ЮЮЗ, высоко: летний день
export const HAZE = new THREE.Color(0.56, 0.76, 0.97);
// Кривизна Земли считается в вершинных шейдерах воды и суши ОДИНАКОВО и от камеры: точка на расстоянии d опущена
// на d^2/2R. Отсюда настоящий горизонт (с высоты 4 м он в 7-8 км) и берега, уходящие под него. Радиус взят
// с поправкой на рефракцию (7/6 R). Одна формула на всё -- иначе берег разойдётся с водой.
export const CURVE = 'float curve(vec3 p){ vec2 d=p.xz-cameraPosition.xz; return dot(d,d)/14866000.; }\n';
// картинка из строки: через onload, а не img.decode() -- в Safari decode() больших встроенных картинок бывает,
// что не завершается вовсе (загрузка молча вставала); ошибка -- понятным сообщением на экране загрузки
function loadImg(src) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('не прочиталась карта рельефа')); img.src = src; if (img.complete && img.naturalWidth) res(img); }); }
export async function loadHeight() {
  const img = await loadImg(HEIGHTMAP_PNG);
  const c = document.createElement('canvas'); c.width = c.height = MAP.N;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, MAP.N, MAP.N).data, H = new Float32Array(MAP.N * MAP.N);
  for (let i = 0; i < H.length; i++) H[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 4 - 64;
  const tex = new THREE.DataTexture(d, MAP.N, MAP.N, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const N = MAP.N;
  const h = (X, Y) => {
    let px = MAP.OX + X / MAP.M, py = MAP.OY - Y / MAP.M;
    if (py > N - 1) return -60;
    px = px < 0 ? 0 : px > N - 1.001 ? N - 1.001 : px; py = py < 0 ? 0 : py > N - 1.001 ? N - 1.001 : py;
    const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, i = y0 * N + x0;
    return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + N] * (1 - fx) + H[i + N + 1] * fx) * fy;
  };
  return { h, tex };
}

// Общее состояние неба и света: одни и те же объекты uniform'ов разделяют небо, рельеф и вода.
export const ENV = {
  uSun: { value: SUN }, uHor: { value: new THREE.Vector3(0.56, 0.76, 0.97) }, uCover: { value: 0.4 }, uCirrus: { value: 0.3 },
  uStorm: { value: 0 }, uCuK: { value: 0.15 }, uDay: { value: 1 }, uDusk: { value: 0 }, uCloudScale: { value: 1 }, uSunI: { value: 1 }, uCloud: { value: new THREE.Vector2() },
  uMap: { value: 0 }, uMapDeep: { value: new THREE.Color(0x1d5ea6) }, uLakeM: { value: null }, uLakeT: { value: new THREE.Vector4() }, uFarH: { value: null },
  uRiv: { value: null }, uRivT: { value: new THREE.Vector4() }, uRivOn: { value: 0 }, uRT: { value: 0 }, // реки коридора -- маской (corridorart)
  uLC: { value: null }, uLCOn: { value: 0 }, uPaint: { value: 1 }, uLCT: { value: new THREE.Vector4(-141000, 63000, 1 / 273600, 1 / 180600) }, // маска зон OSM (по требованию) // съёмка карты сверху: дно плавно уходит в цвет озера на карте
};
export const GLSL_COMMON = /* glsl */`
uniform vec3 uSun, uHor; uniform float uCuK; uniform float uCover, uCirrus, uStorm, uCloudScale, uSunI, uDay, uDusk; uniform vec2 uCloud;
#define HOR uHor
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<FBM_OCT;i++){ s+=a*vnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+17.; a*=.5; } return s; }
// небо высокогорья: тёмно-синий зенит, светлая полоса у горизонта
vec3 skyBase(vec3 d){ float y=max(d.y,0.);
  // высокогорное небо: воздуха над головой меньше, поэтому зенит тёмный, густо-синий с фиолетовым оттенком
  vec3 c=mix(uHor, vec3(0.045,0.235,0.78), smoothstep(0.,0.24,y)); c=mix(c, vec3(0.010,0.085,0.50), smoothstep(0.10,0.55,y)); c=mix(c, vec3(0.006,0.030,0.27), smoothstep(0.40,1.,y));
  c=mix(c, vec3(0.20,0.24,0.30)*(0.75+0.5*y), uStorm*0.85);
  c*=mix(0.025,1.,uDay); // ночь
  { float sg=max(dot(normalize(d.xz+1e-4),normalize(uSun.xz)),0.); c+=vec3(1.,0.42,0.14)*uDusk*(1.-uStorm)*pow(1.-y,5.)*(0.25+0.75*sg*sg); } // заря у горизонта со стороны солнца
  // солнце высокогорья: слепящий диск и широкое сияние вокруг
  float s=max(dot(d,uSun),0.), sunny=uSunI*(1.-uStorm); c+=vec3(1.,.86,.62)*(pow(s,10.)*.16+pow(s,220.)*.55)*uSunI+vec3(1.,.9,.7)*(pow(s,3.)*.10+pow(s,40.)*.35+pow(s,900.)*2.5)*sunny; return c; }
vec2 cloudUV(vec3 d){ return d.xz/(d.y+0.10)*uCloudScale+uCloud; }
float cloudDens(vec2 p){ return fbm(p*0.45+3.1)*0.62+fbm(p*1.9)*0.38; }
float cloudLo(){ return 0.60-uCover*0.2; }
// у кучевых резкий край: узкий переход от неба к облаку
float cloudCov(float n){ float lo=cloudLo(); return smoothstep(lo, lo+0.075, n); }
// дымка: густая у воды, редкая на высоте -- поэтому снежные вершины за 80 км видны над маревом
vec3 applyFog(vec3 c, float dist, float y){ float f=min((1.-exp(-dist/mix(42000.,16000.,uStorm)))*mix(1.,0.34,smoothstep(150.,2600.,y)), mix(0.70,0.93,uStorm));
  // цвет дали задан в линейном пространстве: после тональной обработки он заметно светлеет
  return mix(c, mix(HOR, mix(vec3(0.13,0.26,0.60)*mix(0.04,1.,uDay),HOR*0.8,uStorm), smoothstep(12000.,60000.,dist)), f); }
`;
// Уровни качества. На слабом устройстве выгоднее упростить шейдеры (меньше октав шума, дешевле отражение облаков),
// чем опускать разрешение: при низком разрешении «мылится» и идёт квадратами вообще всё -- тени, брызги, пена.
const QUALITY_DEFS = [{ FBM_OCT: 3, RIP_OCT: 3, SHN: 6, LOW: 1 }, { FBM_OCT: 3, RIP_OCT: 4, SHN: 8, LOW: 1 }, { FBM_OCT: 4, RIP_OCT: 5, SHN: 14 }];
const QMATS = [];
export function applyQuality(q) { for (const m of QMATS) { m.defines = { ...QUALITY_DEFS[q], ...m.userData.defs }; m.needsUpdate = true; } }
export const END = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

export function makeSky() {
  const mat = new THREE.ShaderMaterial({ defines: { ...QUALITY_DEFS[2] },
    uniforms: { ...ENV, uEnvW: { value: 0 } },
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir=position; vec4 p=modelViewMatrix*vec4(position,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
uniform float uEnvW; varying vec3 vDir;
void main(){ vec3 d=normalize(vDir); vec3 c=skyBase(d); float dk=mix(0.05,1.,uDay); vec3 dt3=mix(vec3(1.),vec3(1.2,0.72,0.5),uDusk)*dk;
  if(uDay<0.7 && d.y>0.){ vec2 sp=d.xz/(d.y+0.3)*110.; float hs=hash(floor(sp)); c+=vec3(0.9,0.95,1.)*step(0.982,hs)*smoothstep(0.4,0.05,length(fract(sp)-0.5))*smoothstep(0.42,0.04,uDay)*(1.-uStorm)*(0.6+2.*fract(hs*57.)); } // звёзды
  c+=vec3(1.,.95,.8)*smoothstep(0.99955,0.9998,dot(d,uSun))*6.*uSunI;
  // перистые: высокий слой, волокна вытянуты вдоль потока
  if(uCirrus>0.01 && d.y>0.02){ vec2 q=d.xz/(d.y+0.35)*0.6+uCloud*0.25; q=mat2(0.8,0.6,-0.6,0.8)*q;
    float w=fbm(q*1.3); float n=fbm(vec2(q.x*0.6+w*1.6, q.y*4.2+w*0.8));
    float a=smoothstep(0.46,0.80,n)*smoothstep(0.30,0.62,fbm(q*0.35+9.))*uCirrus*smoothstep(0.03,0.4,d.y);
    c=mix(c, vec3(1.,0.99,0.97)*dt3, a*0.62); }
  #ifndef LOW
  // тонкая высокая пелена: едва заметные полосы, дают небу глубину
  if(d.y>0.02){ vec2 v=d.xz/(d.y+0.5)*0.35+uCloud*0.12; float vl=fbm(vec2(v.x*0.7+v.y*0.4, v.y*2.6-v.x*0.3)+21.);
    c=mix(c, vec3(0.93,0.96,1.)*dt3, smoothstep(0.45,0.9,vl)*0.20*(1.-uStorm)*uCirrus*smoothstep(0.02,0.3,d.y)); }
  // средний ярус: мелкие высококучевые «барашки», идут быстрее и в другом масштабе -- при движении видна разница высот
  if(d.y>0.03){ vec2 p2=d.xz/(d.y+0.24)*uCloudScale*2.7+uCloud*1.8+vec2(37.,11.); float n=fbm(p2)*0.6+vnoise(p2*3.1)*0.4, gate=smoothstep(0.42,0.62,fbm(p2*0.13+5.));
    float a=smoothstep(0.60-uCover*0.08,0.74,n)*gate*smoothstep(0.03,0.25,d.y)*0.7*clamp(uCirrus*2.+uStorm,0.,1.);
    c=mix(c, mix(mix(vec3(0.80,0.86,0.96),vec3(1.),smoothstep(0.6,0.85,n)), vec3(0.30,0.33,0.38), uStorm)*dt3, a); }
  #endif
  // кучевые: плотность -> покрытие, освещённость -- по перепаду плотности в сторону солнца
  if(d.y>0.004){ vec2 p=cloudUV(d); float n=cloudDens(p), a=cloudCov(n);
    if(a>0.002){ float n2=cloudDens(p+normalize(uSun.xz)*0.2);
      float lit=clamp(0.52+(n-n2)*3.4,0.,1.), core=smoothstep(0.,0.16,n-cloudLo());
      vec3 dark=mix(vec3(0.42,0.49,0.63), vec3(0.085,0.10,0.13), uStorm);
      vec3 bright=mix(vec3(1.,0.985,0.95), vec3(0.50,0.54,0.60), uStorm*0.85);
      vec3 cc=mix(dark, bright, clamp(lit*(1.-0.5*core)+0.22*(1.-core),0.,1.));
      cc*=mix(1.,0.78,smoothstep(0.25,0.9,d.y)*core); // прямо над головой видны тёмные основания
      cc*=dt3; cc=mix(cc, uHor, exp(-d.y*8.)*0.78);
      c=mix(c, cc, a*smoothstep(0.004,0.07,d.y)*uCuK); } } // uCuK: главные облака теперь рисованные (clouds.js), эти -- лишь лёгкая дымка за ними
  c=mix(c,uHor,smoothstep(0.02,-0.01,d.y));
  // для карты отражений: под горизонтом -- вода, иначе борт отражал бы «небо снизу»
  c=mix(c, mix(vec3(0.02,0.14,0.36),vec3(0.03,0.07,0.10),uStorm), uEnvW*smoothstep(0.,-0.06,d.y));
  gl_FragColor=vec4(c,1.); ${END} }`,
  });
  QMATS.push(mat);
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

export function makeTerrain(h, hole = null) {
  const N = 440, P = 1.9, M = MAP.M;
  const xw = -MAP.OX * M, xe = (MAP.N - 1 - MAP.OX) * M, ys = (MAP.OY - (MAP.N - 1)) * M, yn = MAP.OY * M;
  const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), hs = new Float32Array(N * N);
  const warp = (i, lo, hi) => { const s = (i / (N - 1)) * 2 - 1; return s < 0 ? lo * Math.pow(-s, P) : hi * Math.pow(s, P); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const X = warp(i, xw, xe), Y = warp(j, ys, yn), k = j * N + i, e = 20;
    const y = h(X, Y); hs[k] = y;
    pos[k * 3] = X; pos[k * 3 + 1] = y; pos[k * 3 + 2] = -Y;
    const nx = h(X - e, Y) - h(X + e, Y), nz = h(X, Y + e) - h(X, Y - e), l = Math.hypot(nx, 2 * e, nz);
    nor[k * 3] = nx / l; nor[k * 3 + 1] = (2 * e) / l; nor[k * 3 + 2] = nz / l;
  }
  const lists = new Map(), CH = Math.ceil((N - 1) / 8);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -9) continue; // глубокое дно не рисуем
    if (hole) { const xa = pos[a * 3], za = -pos[a * 3 + 2], xd = pos[d * 3], zd = -pos[d * 3 + 2]; if (Math.min(xa, xd) > hole.x0 && Math.max(xa, xd) < hole.x1 && Math.min(za, zd) > hole.y0 && Math.max(za, zd) < hole.y1) continue; } // здесь подробная заплатка
    chunkList(lists, ((j / CH) | 0) * 64 + ((i / CH) | 0) + (Math.min(hs[a], hs[b], hs[c], hs[d]) < 0 ? SHORE : 0)).push(a, b, d, a, d, c);
  }
  const obj = chunked({ position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), aH: new THREE.BufferAttribute(hs, 1) }, lists, terrainMaterial(false), terrainMaterial());
  // высота НАРИСОВАННОЙ поверхности: сетка неравномерная (у берега клетки мелкие, к краям -- по сотне метров), поэтому
  // ищем клетку обратным растяжением и берём тот же треугольник (a-b-d / a-d-c), что рисует видеокарта
  const unwarp = (v, lo, hi) => { const s = v < 0 ? -Math.pow(Math.max(0, v / lo), 1 / P) : Math.pow(Math.max(0, v / hi), 1 / P); return (s + 1) / 2 * (N - 1); };
  obj.userData.meshH = (X, Y) => { const fi = unwarp(X, xw, xe), fj = unwarp(Y, ys, yn), i = Math.floor(fi), j = Math.floor(fj); if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return null;
    const a = j * N + i, x0 = pos[a * 3], x1 = pos[(a + 1) * 3], y0 = -pos[a * 3 + 2], y1 = -pos[(a + N) * 3 + 2], fu = (X - x0) / (x1 - x0 || 1), fv = (Y - y0) / (y1 - y0 || 1);
    const ha = hs[a], hb = hs[a + 1], hc = hs[a + N], hd = hs[a + N + 1]; return fv <= fu ? ha * (1 - fu) + hb * (fu - fv) + hd * fv : ha * (1 - fv) + hc * (fv - fu) + hd * fu; };
  return obj;
}
// Сетка рельефа режется на куски со своими границами: куски вне кадра (за спиной камеры, сбоку) видеокарта
// не обрабатывает вовсе. Раньше обе сетки (~450 тыс. треугольников) целиком проходили через неё каждый кадр.
// Буферы вершин общие, у каждого куска только свой список треугольников. Шейдер опускает дальние точки на кривизну
// Земли -- на это границы куска расширены с запасом, иначе кусок у нижнего края кадра мог бы пропасть раньше времени.
// Суша и урез -- разными материалами. Шейдер уреза сам пишет глубину (дно под водой уходит «в бесконечность»), а
// это выключает у видеокарты раннюю проверку глубины: закрытый передним хребтом склон обсчитывался бы целиком.
// Суше такая запись не нужна (там она всегда равна обычной глубине), поэтому у суши ранняя проверка работает, и
// куски, отсортированные от ближних к дальним, отбрасывают закрытые склоны ещё до расчёта цвета.
const SHORE = 100000, chunkList = (lists, k) => { let l = lists.get(k); if (!l) lists.set(k, (l = [])); return l; };
function chunked(attrs, lists, matLand, matShore = matLand) {
  const g = new THREE.Group(), p = attrs.position.array, box = new THREE.Box3(), v = new THREE.Vector3(); let tris = 0;
  for (const [key, idx] of lists) { if (!idx.length) continue; const mat = key >= SHORE ? matShore : matLand;
    const geo = new THREE.BufferGeometry(); for (const k in attrs) geo.setAttribute(k, attrs[k]); geo.setIndex(idx);
    box.makeEmpty(); for (const i of idx) box.expandByPoint(v.fromArray(p, i * 3));
    const sp = box.getBoundingSphere(new THREE.Sphere()), dd = Math.hypot(sp.center.x, sp.center.z) + 30000; sp.radius += (dd * dd) / 14866000; geo.boundingSphere = sp;
    g.add(new THREE.Mesh(geo, mat)); tris += idx.length / 3; }
  g.userData.tris = tris; return g;
}

// Геометрия гор -- строго по карте высот, без растяжения. Всё «монструозное» делает свет и фактура: рёбра и кулуары
// в нормали, тёмные скальные стены, рваная граница снега, тени облаков, туман на хребтах.
// маска природных зон OSM (лес, ледники, кустарник): грузится один раз, по требованию -- когда открывают подзорную трубу
let lcLoad = false;
export function loadLandcover() { if (lcLoad) return; lcLoad = true; const img = new Image(); img.onload = () => { const t = new THREE.Texture(img); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; ENV.uLC.value = t; ENV.uLCOn.value = 1; }; img.onerror = () => { lcLoad = false; }; img.src = 'landcover.png'; }
// ---------- подробная заплатка: коридор Кургак-Сай -- берег (данные Terrain Tiles, шаг ~14 м) ----------
// Сетка -- через точку (~28 м, на телефоне ~42 м), но свет считается по карте нормалей с полным шагом 14 м:
// гребни, кулуары и осыпи видны чётко. К краям заплатка плавно переходит в обычный рельеф (300 м), над водой --
// дно из обычной карты (в данных рельефа озеро -- ровная гладь).
export async function loadDem(D, hNear) {
  const img = await loadImg(D.png); const c = document.createElement('canvas'); c.width = D.W; c.height = D.H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, D.W, D.H).data, H = new Float32Array(D.W * D.H); for (let i = 0; i < H.length; i++) H[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 4 - 64;
  const { W, STEP, X0, Y1 } = D, Hh = D.H, X1 = X0 + (W - 1) * STEP, Y0 = Y1 - (Hh - 1) * STEP, B = 300;
  const raw = (X, Y) => { const fx = (X - X0) / STEP, fy = (Y1 - Y) / STEP, i = Math.min(W - 2, Math.max(0, fx | 0)), j = Math.min(Hh - 2, Math.max(0, fy | 0)), u = fx - i, v = fy - j, k = j * W + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + W] * (1 - u) + H[k + W + 1] * u) * v; };
  const inside = (X, Y) => X > X0 && X < X1 && Y > Y0 && Y < Y1;
  const h = (X, Y) => { const n = hNear(X, Y); if (!inside(X, Y)) return n; const r = raw(X, Y); if (n < 1 && r < 4) return n; // вода -- из обычной карты (там дно)
    const e = Math.min(X - X0, X1 - X, Y - Y0, Y1 - Y), w = smooth(0, B, e); return n + (r - n) * w; };
  return { h, raw, inside, X0, X1, Y0, Y1, W, H: Hh, STEP, hs: H };
}
export function makeDemTerrain(dem, touch) {
  const S = touch ? 3 : 2, { X0, Y1, STEP } = dem, W = Math.floor((dem.W - 1) / S) + 1, Hn = Math.floor((dem.H - 1) / S) + 1, M = STEP * S;
  // смешанная высота на всей сетке полного разрешения -- один раз (раньше каждая вершина и каждый пиксель карты нормалей
  // спрашивали высоту ещё у четырёх соседей: впятеро больше работы, секунда-две на телефоне)
  const DW = dem.W, DH = dem.H, FH = new Float32Array(DW * DH); for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) FH[j * DW + i] = dem.h(X0 + i * STEP, Y1 - j * STEP);
  const fh = (i, j) => FH[Math.min(DH - 1, Math.max(0, j)) * DW + Math.min(DW - 1, Math.max(0, i))];
  const pos = new Float32Array(W * Hn * 3), nor = new Float32Array(W * Hn * 3), hs = new Float32Array(W * Hn);
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) { const X = X0 + i * M, Y = Y1 - j * M, k = j * W + i, a = i * S, b = j * S, y = fh(a, b), e = M;
    hs[k] = y; pos[k * 3] = X; pos[k * 3 + 1] = y; pos[k * 3 + 2] = -Y;
    const nx = fh(a - S, b) - fh(a + S, b), nz = fh(a, b - S) - fh(a, b + S), l = Math.hypot(nx, 2 * e, nz); nor[k * 3] = nx / l; nor[k * 3 + 1] = (2 * e) / l; nor[k * 3 + 2] = nz / l; }
  const lists = new Map(), CH = 48;
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -9) continue;
    chunkList(lists, ((j / CH) | 0) * 1000 + ((i / CH) | 0) + (Math.min(hs[a], hs[b], hs[c], hs[d]) < 0 ? SHORE : 0)).push(a, d, b, a, c, d); } // строки идут с севера -- обход обратный, чтобы лицо было вверх
  // карта нормалей полного разрешения (по смешанной высоте -- чтобы края совпадали)
  const nm = new Uint8Array(dem.W * dem.H * 4);
  for (let j = 0; j < dem.H; j++) for (let i = 0; i < dem.W; i++) { const e = STEP, o = (j * dem.W + i) * 4;
    const nx = fh(i - 1, j) - fh(i + 1, j), nz = fh(i, j - 1) - fh(i, j + 1), l = Math.hypot(nx, 2 * e, nz); nm[o] = (nx / l * 0.5 + 0.5) * 255; nm[o + 1] = (2 * e / l) * 255; nm[o + 2] = (nz / l * 0.5 + 0.5) * 255; nm[o + 3] = 255; }
  const tex = new THREE.DataTexture(nm, dem.W, dem.H, THREE.RGBAFormat); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.flipY = false; tex.needsUpdate = true;
  const T = new THREE.Vector4(X0, Y1, 1 / ((dem.W - 1) * STEP), 1 / ((dem.H - 1) * STEP));
  const mk = (shore) => { const m = terrainMaterial(shore); m.userData.defs = { ...m.userData.defs, DEMN: 1 }; m.defines = { ...m.defines, DEMN: 1 }; m.uniforms = { ...m.uniforms, uDemN: { value: tex }, uDemT: { value: T } };
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; return m; };
  const obj = chunked({ position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), aH: new THREE.BufferAttribute(hs, 1) }, lists, mk(false), mk(true));
  // высота НАРИСОВАННОЙ поверхности (та же сетка и те же треугольники a-d-b / a-c-d): по ней ставят персонажей,
  // иначе на склоне между узлами 28 м они тонут в земле или висят над ней
  obj.userData.meshH = (X, Y) => { const u = (X - X0) / M, v = (Y1 - Y) / M, i = Math.floor(u), j = Math.floor(v); if (i < 0 || j < 0 || i >= W - 1 || j >= Hn - 1) return null;
    const fu = u - i, fv = v - j, a = hs[j * W + i], b = hs[j * W + i + 1], c = hs[(j + 1) * W + i], d = hs[(j + 1) * W + i + 1];
    return fv <= fu ? a * (1 - fu) + b * (fu - fv) + d * fv : a * (1 - fv) + c * (fv - fu) + d * fu; };
  return obj;
}
export function terrainMaterial(shore = true) {
  const defs = shore ? { FDEPTH: 1 } : {};
  const tm = new THREE.ShaderMaterial({ defines: { ...QUALITY_DEFS[2], ...defs },
    uniforms: { ...ENV }, extensions: { derivatives: true },
    vertexShader: CURVE + `attribute float aH; varying vec3 vP; varying vec3 vN; varying float vH; void main(){ vP=position; vN=normal; vH=aH; vec3 q=position; q.y-=curve(q); gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.); }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
varying vec3 vP; varying vec3 vN; varying float vH; uniform float uMap; uniform vec3 uMapDeep; uniform sampler2D uLakeM; uniform vec4 uLakeT; uniform sampler2D uLC; uniform float uLCOn, uPaint; uniform vec4 uLCT;
// гребневой шум: острые хребты и кулуары, которых нет в карте высот с её шагом в десятки метров
float ridged(vec2 p){ float a=0.5, s=0., w=1.; for(int i=0;i<FBM_OCT;i++){ float r=1.-abs(2.*vnoise(p)-1.); r*=r*w; s+=a*r; w=clamp(r*1.6,0.,1.); p=mat2(1.6,1.2,-1.2,1.6)*p+7.; a*=0.5; } return s; }
#ifdef DEMN
uniform sampler2D uDemN; uniform vec4 uDemT; uniform sampler2D uRiv; uniform vec4 uRivT; uniform float uRivOn, uRT;
#endif
void main(){ vec3 N=normalize(vN); float h=vH;
#ifdef DEMN
  { vec2 du=vec2((vP.x-uDemT.x)*uDemT.z, (uDemT.y+vP.z)*uDemT.w); vec3 t=texture2D(uDemN, du).xyz; vec3 Nd=normalize(vec3(t.x*2.-1., t.y, t.z*2.-1.)); N=normalize(mix(N, Nd, 1.-smoothstep(25., 70., length(fwidth(vP.xz))))); } // свет -- по карте нормалей 14 м
#endif
  // на карте вода -- только сам Иссык-Куль: низины за хребтами ниже уровня озера (Чуйская долина) -- суша
  if(uMap>0. && texture2D(uLakeM, vec2((vP.x-uLakeT.x)*uLakeT.z, (uLakeT.y+vP.z)*uLakeT.w)).r<0.5) h=max(h,3.);
  float mt=smoothstep(70.,600.,h);
  // рельеф в нормали: склоны изрезаны рёбрами, свет ложится жёстко
  float rs=0.0016, e=30.; vec2 rp=vP.xz*rs; float r0=0.45, rx=0.45, rz=0.45;
  // Рябь вдали: когда деталь рисунка становится мельче пикселя, она мерцает при движении камеры. Поэтому каждая
  // фактура плавно гаснет по мере того, как её шаг приближается к размеру пикселя на местности (px, метры).
  float px=length(fwidth(vP.xz)), kR=1.-smoothstep(22.,95.,px), kF=1.-smoothstep(3.,13.,px), kT=1.-smoothstep(0.2,0.9,px);
  // Дальше -- только то, что реально влияет на цвет: на низком берегу (mt=0) гребни, тени облаков и осыпи ни на что
  // не влияют, под водой цвет суши целиком заменяется цветом дна, вне посёлка не нужна застройка. Результат прежний
  if(mt*kR>0.){ r0=ridged(rp); rx=ridged(rp+vec2(e*rs,0.)); rz=ridged(rp+vec2(0.,e*rs)); }
  float RK=1.;
#ifdef DEMN
  RK=0.3; // настоящие гребни уже в карте нормалей -- выдуманных рёбер меньше
#endif
  N=normalize(N+vec3(r0-rx,0.,r0-rz)*(7.5*mt*kR*RK)); float sl=1.-N.y; r0=mix(0.45,r0,kR);
  float kN=1.-smoothstep(10.,45.,px), n=0.5, n2=0.5, n3=0.5;
  if(h>=0.){ n=mix(mix(0.5,vnoise(vP.xz*0.0035),1.-smoothstep(90.,260.,px)), fbm(vP.xz*0.0035), kN); n2=mix(0.5,fbm(vP.xz*0.045),kF); n3=mix(0.5,vnoise(vP.xz*0.6),kT); }
  vec3 sand=vec3(0.93,0.80,0.52), green=vec3(0.24,0.62,0.13), steppe=vec3(0.88,0.62,0.27), forest=vec3(0.06,0.30,0.14),
       meadow=vec3(0.38,0.68,0.18), rock=vec3(0.56,0.42,0.42), snow=vec3(0.98,0.99,1.);
  vec3 c=sand*(0.92+0.12*n3);
  c=mix(c, green*(0.75+0.5*n2), smoothstep(1.6,4.5,h+n2*2.5));
  c=mix(c, steppe*(0.85+0.3*n2), smoothstep(40.,230.,h+n*160.-60.*(1.-N.y)*8.));
  c=mix(c, meadow*(0.8+0.4*n2), smoothstep(650.,1000.,h+n*250.)*0.8);
  float fr=smoothstep(520.,700.,h)*smoothstep(1500.,1250.,h)*smoothstep(0.02,0.25,N.z+0.25*(n-0.5)+0.12);
  c=mix(c, forest*(0.8+0.5*n2), fr*smoothstep(0.35,0.6,n2+0.25));
  c=mix(c, rock*(0.8+0.4*n2), smoothstep(0.22,0.5,sl)*smoothstep(150.,500.,h));
  c=mix(c, rock*(0.9+0.3*n2), smoothstep(1500.,1900.,h+n*200.));
  // тёмные скальные стены и осыпи: крутое -- почти чёрный камень с прожилками
  float crag=smoothstep(0.34,0.66,sl)*mt; c=mix(c, mix(vec3(0.34,0.34,0.37), vec3(0.52,0.49,0.46), n2)*(0.8+0.4*r0), crag*0.6);
  // снег держится на пологом и в кулуарах, с крутых стен осыпается -- граница рваная, языками
  float snowM=smoothstep(1850.,2200.,h+n*380.+(r0-0.45)*520.)*(1.-smoothstep(0.50,0.80,sl)*0.85); c=mix(c, snow, snowM);
  if(h<0.) c=mix(sand*vec3(0.62,0.93,0.88), vec3(0.03,0.30,0.42), smoothstep(0.,7.,-h));
  else c=mix(c*0.72, c, smoothstep(0.,0.9,h));
  // застройка и сады читаются издалека как фактура: тёмные кроны и светлые пятна крыш
  float dc=length(vP-cameraPosition), tw=smoothstep(2.5,6.,h)*smoothstep(150.,60.,h)*(1.-smoothstep(5000.,11000.,dc));
  if(tw>0.){ float can=vnoise(vP.xz*0.075)*0.6+vnoise(vP.xz*0.21)*0.4; c=mix(c, vec3(0.07,0.20,0.07), tw*smoothstep(0.42,0.62,can)*0.85);
    vec2 cell=floor(vP.xz/11.); float rf=step(0.90,hash(cell))*step(can,0.5)*tw*(1.-smoothstep(1500.,5000.,dc));
    c=mix(c, mix(vec3(0.80,0.78,0.74), vec3(0.55,0.22,0.16), step(0.5,hash(cell+7.))), rf*0.8); }
  // ущелья и подножия стен темнее -- рассеянный свет туда не добирается; по склонам ползут тени облаков
  float ao=mix(1., 0.72+0.28*smoothstep(0.15,0.75,r0), mt);
  float cs=1.; if(mt>0.) cs-=0.55*cloudCov(cloudDens(vP.xz*0.00011*uCloudScale+uCloud))*mt;
  float l=max(dot(N,uSun),0.)*uSunI*cs; vec3 amb=vec3(0.22,0.29,0.44)*mix(1.,0.62,uStorm)*ao;
  // живопись светом: солнечные склоны тёплые, золотистые; тени холодные, сине-фиолетовые; цвета гуще
  // погодный фильтр: на солнце краски сочные, в шторм -- выцветшие и холодные, на заре -- тёплые
  float wxS=uSunI*(1.-uStorm); c=mix(vec3(dot(c,vec3(0.3,0.59,0.11))), c, 0.62+0.78*wxS); c=mix(c, c*vec3(0.78,0.86,1.02), uStorm);
  vec3 sunC=mix(mix(vec3(1.08,1.0,0.88), vec3(1.5,0.72,0.38), uDusk), vec3(0.8,0.85,0.9), uStorm), shC=mix(vec3(0.27,0.33,0.50), vec3(0.22,0.25,0.30), uStorm);
  c*=mix(1.,0.88,mt*(1.-snowM)); // камень и трава в горах темнее выгоревшей степи у берега
  float sunny=uSunI*(1.-uStorm); // в ясный день горы залиты светом: солнечные склоны почти слепят, тени наполнены отражённым
#ifdef DEMN
  // подробный коридор: цвет по высоте и крутизне, отмывка по кривизне карты высот -- гребни светлее, кулуары темнее
  { vec2 du=vec2((vP.x-uDemT.x)*uDemT.z, (uDemT.y+vP.z)*uDemT.w), tx=vec2(uDemT.z*28.1,0.), ty=vec2(0.,uDemT.w*28.1);
    vec3 nE=texture2D(uDemN,du+tx).xyz, nW=texture2D(uDemN,du-tx).xyz, nS=texture2D(uDemN,du+ty).xyz, nNn=texture2D(uDemN,du-ty).xyz;
    float cav=clamp(((nE.x-nW.x)+(nS.z-nNn.z))*3.2,-1.,1.), slope=1.-N.y, Hm=h+1601.;
    vec3 dry=vec3(0.52,0.44,0.27), meadow=vec3(0.26,0.38,0.17), scree=vec3(0.42,0.37,0.32), rock=vec3(0.30,0.28,0.29), cliff=vec3(0.18,0.17,0.20), snw=vec3(0.86,0.89,0.95), forest=vec3(0.07,0.17,0.10);
    vec3 a=mix(dry, meadow, smoothstep(1850.,2250.,Hm)); a=mix(a, scree, smoothstep(3150.,3600.,Hm));
    a=mix(a, rock, smoothstep(0.16,0.3,slope)); a=mix(a, cliff, smoothstep(0.36,0.55,slope));
    float fN=smoothstep(0.04,0.22,-N.z)*smoothstep(2050.,2250.,Hm)*(1.-smoothstep(2800.,2950.,Hm))*(1.-smoothstep(0.34,0.5,slope))*(0.55+0.45*vnoise(vP.xz*0.011)); if(uLCOn>0.) fN=texture2D(uLC, vec2((vP.x-uLCT.x)*uLCT.z, (uLCT.y+vP.z)*uLCT.w)).r*(0.75+0.25*vnoise(vP.xz*0.02)); a=mix(a, forest, smoothstep(0.3,0.55,fN)); // ельники: по маске OSM, пока она не загружена -- по северным склонам
    float sn=smoothstep(3880.,4020.,Hm+220.*vnoise(vP.xz*0.004)-cav*160.+max(0.,-N.z)*260.)*(1.-smoothstep(0.30,0.5,slope)); // летом снег -- пятнами у вершин, в кулуарах и на северных склонах a=mix(a, snw, sn);
    c=a*mix(0.5,0.9,sn); snowM=sn; // под яркий свет сцены: иначе склоны выгорают в белое
    float hsh=dot(N, normalize(vec3(-0.55,0.7,-0.45))); ao*=clamp((1.+cav*0.5)*mix(0.72,1.15,hsh),0.45,1.4); l*=clamp(1.+cav*0.25,0.7,1.25); }
#endif
  vec3 col=c*(sunC*l*(1.25+0.75*sunny)+shC*ao*(1.25+0.3*sunny)+snowM*vec3(0.36,0.42,0.60)*mix(1.,0.5,uStorm)*ao);
#ifdef DEMN
  // реки: вода нарисована прямо на склоне по запечённой маске русла -- светлые струйки бегут вниз по течению
  if(uRivOn>0.){ vec2 ru=vec2((vP.x-uRivT.x)*uRivT.z, (uRivT.y+vP.z)*uRivT.w); vec4 rv=texture2D(uRiv, clamp(ru,0.,1.));
    float v=(rv.r*2.-1.)*4., av=abs(v), fw=max(fwidth(v),0.02), ok=step(0.995,rv.g)*step(0.,ru.x)*step(ru.x,1.)*step(0.,ru.y)*step(ru.y,1.);
    if(ok>0. && av<1.8){ vec2 td=normalize(rv.ba*2.-1.+1e-4); float sa=dot(vec2(vP.x,-vP.z),td), px2=length(fwidth(vP.xz));
      vec3 wc=mix(vec3(0.16,0.42,0.50), vec3(0.34,0.62,0.68), 0.5+0.5*sin(v*3.1+sa*0.05))*(0.55+0.55*uSunI);
      float lane=floor(v*3.5+3.5), ph=fract((sa-uRT*(2.+fract(lane*0.53)*1.5))/(7.+3.*fract(lane*0.37))+lane*0.61), dash=smoothstep(0.,0.08,ph)*(1.-smoothstep(0.32,0.45,ph));
      float lw=1.-smoothstep(0.05,0.14,abs(fract(v*3.5+3.5)-0.5)-0.25); wc=mix(wc, vec3(0.95,1.,1.05), dash*lw*0.5*(1.-smoothstep(0.6,3.,px2)));
      wc=mix(wc, vec3(0.10,0.13,0.17), smoothstep(0.80-fw,0.95+fw,av)*(1.-smoothstep(1.,1.2,av))); // контур тушью
      col*=mix(0.72,1.,smoothstep(1.,1.7,av)); // мокрый берег темнее
      col=mix(col, wc, (1.-smoothstep(1.-fw,1.+fw,av))*(1.-smoothstep(4.,9.,px2))); } }
#endif
  // контровой свет по гребням: кромка, обращённая к солнцу, горит
  vec3 Vd=normalize(cameraPosition-vP); col+=sunC*c*pow(1.-max(dot(N,Vd),0.),3.)*max(dot(N,uSun)+0.25,0.)*0.55*mt*uSunI;
  float dist=length(vP-cameraPosition);
  // ---- Дальние горы -- живописью: большие плоскости цвета по поясам высоты, мазки вдоль горизонталей, свет в три тона
  // (тёплое солнце, холодная фиолетовая тень), снег и ледники. Мелкая фактура, которая вдали только рябит, уходит.
  // Лес и ледники -- по данным OSM (маска uLC грузится при первом открытии трубы), до того лес -- по северным склонам.
  // При увеличении (пиксель на местности мельче 30 м) проступают контуры зон пером, кроны точками, скалы с трещинами.
  float pk=smoothstep(3500.,11000.,dist)*(1.-uMap)*uPaint;
  if(pk>0.){ vec3 Ns=normalize(vN); float sl0=1.-Ns.y; vec2 fall=normalize(Ns.xz+1e-4), along=vec2(-fall.y,fall.x);
    float strk=vnoise(vec2(dot(vP.xz,along)*0.0022, dot(vP.xz,fall)*0.00035)+3.);
    vec3 pc=mix(vec3(0.74,0.53,0.30), vec3(0.52,0.56,0.32), smoothstep(150.,700.,h+strk*120.));
    pc=mix(pc, vec3(0.42,0.52,0.30), smoothstep(1000.,1500.,h+strk*200.));
    float rockA=clamp(smoothstep(1700.,2100.,h+strk*200.)*0.9+smoothstep(0.45,0.7,sl0)*0.6*smoothstep(400.,900.,h),0.,1.); pc=mix(pc, vec3(0.47,0.41,0.50), rockA);
    vec3 lc=vec3(0.); if(uLCOn>0.) lc=texture2D(uLC, vec2((vP.x-uLCT.x)*uLCT.z, (uLCT.y+vP.z)*uLCT.w)).rgb;
    float wv=(vnoise(vP.xz*0.011)-0.5)*0.3, fz=uLCOn>0. ? lc.r : fr, fzw=fz+wv*smoothstep(0.02,0.3,fz);   // рваный край леса
    float fwF=max(fwidth(fzw)*1.2,0.015), fM=smoothstep(0.5-fwF,0.5+fwF,fzw);
    float gz=lc.g+wv*0.5*smoothstep(0.02,0.3,lc.g), fwG=max(fwidth(gz)*1.2,0.015), gM=smoothstep(0.5-fwG,0.5+fwG,gz);
    float bz=lc.b+wv*smoothstep(0.02,0.3,lc.b), bM=smoothstep(0.45,0.55,bz);
    pc=mix(pc, vec3(0.45,0.50,0.22), bM*0.7); pc=mix(pc, vec3(0.12,0.29,0.16), fM); float wh=max(snowM,gM); pc=mix(pc, mix(vec3(0.97,0.95,0.92),vec3(0.86,0.93,0.99),gM), wh);
    float L=dot(Ns,uSun)*uSunI, aw=max(fwidth(L)*1.5,0.03), tone=0.45*smoothstep(0.08-aw,0.08+aw,L)+0.55*smoothstep(0.5-aw,0.5+aw,L);
    vec3 shd=mix(vec3(0.50,0.48,0.66), vec3(0.34,0.35,0.41), uStorm), pcol=pc*mix(shd, sunC*1.12, tone)*(0.94+0.12*strk);
    pcol=mix(pcol, pcol*HOR*1.35, 0.14); // палитра в тон неба -- в любое время суток
    float dK=(1.-smoothstep(8.,30.,px))*pk;
    if(dK>0.){ vec3 ink=vec3(0.07,0.08,0.12); float ip=0.;
      ip=max(ip, (1.-smoothstep(0.6,1.6,abs(fzw-0.5)/max(fwidth(fzw),1e-4)))*step(0.02,fz));                // контур леса
      ip=max(ip, (1.-smoothstep(0.6,1.6,abs(gz-0.5)/max(fwidth(gz),1e-4)))*step(0.02,lc.g)*0.8);             // контур ледника
      float tK=(1.-smoothstep(3.,7.,px))*(1.-step(-15000.,vP.x)*step(vP.x,11000.)*step(-7000.,vP.z)*step(vP.z,2500.)); if(tK>0. && fM>0.5){ vec2 cc=floor(vP.xz/32.), fp=fract(vP.xz/32.)-0.5-(vec2(hash(cc),hash(cc+3.))-0.5)*0.4; float dd=length(fp)*32.;
        float tr=1.-smoothstep(6.-px,6.+px,dd); pcol=mix(pcol, pcol*vec3(0.62,0.75,0.72), tr*tK); ip=max(ip, (1.-smoothstep(0.,px*1.3,abs(dd-6.)))*tK*0.7); } // кроны точками
      float rz=sl0+(vnoise(vP.xz*0.02)-0.5)*0.22, fwR=max(fwidth(rz),1e-4), rM=smoothstep(0.52-fwR,0.52+fwR,rz)*smoothstep(500.,900.,h)*(1.-wh);
      pcol=mix(pcol, mix(shd,sunC*1.35,tone)*vec3(0.6,0.56,0.64), rM*0.85); ip=max(ip, (1.-smoothstep(0.6,1.6,abs(rz-0.52)/fwR))*smoothstep(500.,900.,h)*(1.-wh)); // скалы
      float cK=1.-smoothstep(2.5,6.,px); if(cK>0. && rM>0.5){ float cr=abs(fract(dot(vP.xz,along)/13.+vnoise(vP.xz*0.05)*0.6)-0.5)*13.; ip=max(ip, (1.-smoothstep(0.,px,cr))*cK*0.5); } // трещины
      pcol=mix(pcol, ink, ip*dK*0.8); }
    pcol*=0.66; // под экспозицию сцены: краски гуще, без пастельной засветки
    col=mix(col, pcol, pk); }
  // облака цепляются за хребты: полоса тумана на высоте, рваная, плывёт по ветру
  float band=exp(-pow((h-1500.-380.*n)/260.,2.))*smoothstep(6000.,16000.,dist); band=band>0.002 ? band*smoothstep(0.52,0.74,fbm(vP.xz*0.00045+uCloud*0.6+3.)) : 0.; // вне полосы шум не считаем
  col=mix(col, mix(vec3(0.93,0.95,0.99),vec3(0.30,0.33,0.37),uStorm), band*(0.42+0.45*uStorm));
  // в шторм вершины уходят в тучу
  col=mix(col, vec3(0.24,0.27,0.31), uStorm*smoothstep(1300.,2600.,h)*0.8);
  col*=mix(vec3(0.045,0.06,0.11), vec3(1.), uDay); // ночью -- синий полумрак
  // живописная даль: своя лёгкая воздушная перспектива -- планы светлеют и холодеют, но цвет не тонет в дымке
  { vec3 fogd=applyFog(col, dist, h); if(pk>0.){ float f2=min((1.-exp(-dist/100000.))*mix(1.,0.45,smoothstep(150.,2600.,h)),0.17);
      vec3 lay=mix(col, HOR*mix(0.04,1.,uDay)*vec3(0.80,0.84,0.95), f2); fogd=mix(fogd, lay, pk*0.92*(1.-uStorm)); } col=fogd; }
  // дно под водой не должно давать контуров сквозь воду: пишем ему глубину «бесконечность». Заодно кромка берега
  // получает чистую линию ровно по урезу воды
  #ifdef FDEPTH
  gl_FragDepth = h < -0.25 ? 1.0 : gl_FragCoord.z;
  #endif
  if(uMap>0.) col=mix(col, uMapDeep, smoothstep(1.5,8.5,-h)*uMap);
  gl_FragColor=vec4(col,1.); ${END} }`,
  });
  tm.userData.defs = defs; QMATS.push(tm); return tm;
}

// ---------- вся котловина: дальние берега и хребты из настоящей карты высот ----------
// Масштаб высот дальних хребтов. 1 -- как на карте; геометрию гор не искажаем.
export const FAR_EXAGGERATION = 1;
export async function makeFarTerrain(holes = []) {
  const img = await loadImg(FARMAP_PNG);
  const { W, H, X0, Y1, STEP } = FAR, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, hs = new Float32Array(W * H), pos = new Float32Array(W * H * 3), nor = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) hs[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 4 - 64;
  const at = (i, j) => hs[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, X = X0 + i * STEP, Y = Y1 - j * STEP;
    const dd = Math.hypot(X, Y), ex = 1 + (FAR_EXAGGERATION - 1) * smooth(20000, 50000, dd);
    pos[k * 3] = X; pos[k * 3 + 1] = hs[k] * ex - 12; pos[k * 3 + 2] = -Y; // чуть ниже ближней сетки, чтобы не спорили на стыке
    const nx = at(i - 1, j) - at(i + 1, j), nz = at(i, j - 1) - at(i, j + 1), l = Math.hypot(nx, 2 * STEP, nz);
    nor[k * 3] = nx / l; nor[k * 3 + 1] = (2 * STEP) / l; nor[k * 3 + 2] = nz / l; } // выше к северу -> нормаль к югу (+z), как в ближней сетке
  // ближний участок уже нарисован подробной сеткой -- его и открытую воду пропускаем
  const M = MAP.M, pad = 2 * STEP, nx0 = -MAP.OX * M + pad, nx1 = (MAP.N - 1 - MAP.OX) * M - pad, ny0 = (MAP.OY - (MAP.N - 1)) * M + pad, ny1 = MAP.OY * M - pad;
  const inside = (i, j) => { const X = X0 + i * STEP, Y = Y1 - j * STEP; return X > nx0 && X < nx1 && Y > ny0 && Y < ny1; };
  const lists = new Map(), CW = Math.ceil((W - 1) / 8), CHh = Math.ceil((H - 1) / 6);
  // клетки под подробным рельефом ущелья -- выжигаем кругами один раз, а не перебираем все круги в каждой клетке
  const holeC = new Uint8Array(W * H); for (const o of holes) { const i0 = Math.max(0, Math.floor((o.X - o.r - X0) / STEP) - 1), i1 = Math.min(W - 2, Math.ceil((o.X + o.r - X0) / STEP)), j0 = Math.max(0, Math.floor((Y1 - o.Y - o.r) / STEP) - 1), j1 = Math.min(H - 2, Math.ceil((Y1 - o.Y + o.r) / STEP));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(X0 + (i + 0.5) * STEP - o.X, Y1 - (j + 0.5) * STEP - o.Y) < o.r) holeC[j * W + i] = 1; }
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, e = a + W, f = e + 1;
    if (Math.max(hs[a], hs[b], hs[e], hs[f]) < -1) continue;
    if (inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1)) continue;
    if (holeC[a]) continue; // здесь стоит подробный рельеф ущелья
    chunkList(lists, ((j / CHh) | 0) * 64 + ((i / CW) | 0) + (Math.min(hs[a], hs[b], hs[e], hs[f]) < 0 ? SHORE : 0)).push(a, e, b, b, e, f); }
  const mat = terrainMaterial(false), matS = terrainMaterial(); mat.side = matS.side = THREE.DoubleSide;
  const m = chunked({ position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), aH: new THREE.BufferAttribute(hs, 1) }, lists, mat, matS);
  // высота по грубой карте всей котловины (шаг 600 м): для мест за пределами подробной карты у Чолпон-Аты
  m.userData.heightAt = (X, Y) => { const fx = clamp((X - X0) / STEP, 0, W - 1.001), fy = clamp((Y1 - Y) / STEP, 0, H - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
    const a = hs[j * W + i], b = hs[j * W + i + 1], c = hs[(j + 1) * W + i], d = hs[(j + 1) * W + i + 1], y = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; return y < 0 ? y * 5 : y; };
  m.userData.grid = { hs, W, H, X0, Y1, STEP };
  // высота нарисованной поверхности (треугольники a-e-b / b-e-f, на 12 м ниже карты)
  m.userData.meshH = (X, Y) => { const fx = (X - X0) / STEP, fy = (Y1 - Y) / STEP, i = Math.floor(fx), j = Math.floor(fy); if (i < 0 || j < 0 || i >= W - 1 || j >= H - 1) return null;
    const u = fx - i, v = fy - j, a = hs[j * W + i], b = hs[j * W + i + 1], e = hs[(j + 1) * W + i], f = hs[(j + 1) * W + i + 1];
    return (u + v <= 1 ? a + (b - a) * u + (e - a) * v : f + (e - f) * (1 - u) + (b - f) * (1 - v)) - 12; };
  return m;
}

const GN = 128, GS = 20; // карта порывов: 128x128 клеток по 20 м. При 40 м клетки проступали на воде сеткой до горизонта
export function makeWater(heightTex, quality) {
  // полярная сетка вокруг камеры: у лодки ячейки по 0.4 м, к горизонту растут экспоненциально
  // радиус 200 км -- всё озеро из любой точки: раньше сетка кончалась на 34 км, и дальше вместо воды было небо
  const NR = quality > 0 ? 176 : 118, NS = quality > 0 ? 192 : 128, A = 6, Bk = Math.log(200000 / A + 1) / NR;
  const pos = new Float32Array((NR + 1) * NS * 3), idx = [];
  for (let i = 0; i <= NR; i++) for (let s = 0; s < NS; s++) {
    const r = A * (Math.exp(Bk * i) - 1), a = ((s + (i % 2) * 0.5) / NS) * Math.PI * 2, k = (i * NS + s) * 3;
    pos[k] = Math.cos(a) * r; pos[k + 1] = 0; pos[k + 2] = Math.sin(a) * r;
  }
  for (let i = 0; i < NR; i++) for (let s = 0; s < NS; s++) {
    const a = i * NS + s, b = i * NS + ((s + 1) % NS), c = a + NS, d = b + NS;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const gustTex = new THREE.DataTexture(new Uint8Array(GN * GN), GN, GN, THREE.RedFormat);
  gustTex.minFilter = gustTex.magFilter = THREE.LinearFilter; gustTex.needsUpdate = true;
  const uniforms = {
    ...ENV, uTime: { value: 0 }, uQ: { value: 0.7 }, uCenter: { value: new THREE.Vector3() },
    uBoat: { value: new THREE.Vector4(0, 0, 0, 1) }, uBoatV: { value: 0 }, uHull: { value: new THREE.Vector3(3.9, 1.5, 10.6) },
    uTrail: { value: Array.from({ length: 22 }, () => new THREE.Vector4()) }, uTrailN: { value: 0 }, uKelvin: { value: 0 },
    uWave: { value: Array.from({ length: NWAVES }, () => new THREE.Vector4(1, 0, 1, 0)) },
    uHeight: { value: heightTex }, uGust: { value: gustTex }, uGustO: { value: new THREE.Vector2() }, uGustSize: { value: 2560 },
    uWindDir: { value: new THREE.Vector2(1, 0) }, uWind: { value: 5 }, uSpacing: { value: Bk },
  };
  const TERR = /* glsl */`
uniform sampler2D uHeight, uFarH; uniform vec4 uLakeT;
// за подробной картой -- грубая карта всей котловины (600 м); низины вне Иссык-Куля в ней подняты над водой
float farH(vec2 xz){ return texture2D(uFarH, vec2((xz.x-uLakeT.x)*uLakeT.z, (uLakeT.y+xz.y)*uLakeT.w)).r; }
float terrH(vec2 xz){ vec2 uv=(vec2(xz.x,xz.y)/${MAP.M}+vec2(${MAP.OX}.5,${MAP.OY}.5))/${MAP.N}.; if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return farH(xz);
  vec4 t=texture2D(uHeight,uv); return (t.r*65280.+t.g*255.)/4.-64.; }`;
  const mat = new THREE.ShaderMaterial({ defines: { ...QUALITY_DEFS[2] },
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
    vertexShader: CURVE + TERR + /* glsl */`
uniform vec4 uWave[${NWAVES}]; uniform float uTime,uQ,uSpacing; uniform vec3 uCenter;
varying vec3 vW; varying vec2 vO;
void main(){ vec2 o=position.xz+uCenter.xz; float r=length(position.xz), sp=max(uSpacing*(r+6.), r*0.05);
  float att=smoothstep(0.2,5.,-terrH(o)); vec3 p=vec3(o.x,0.,o.y);
  for(int i=0;i<${NWAVES};i++){ vec4 w=uWave[i]; float ph=w.z*dot(w.xy,o)-sqrt(9.81*w.z)*uTime;
    float a=w.w*att*smoothstep(2.2,5.5,6.2832/w.z/sp);
    p.xz+=w.xy*(uQ*a*cos(ph)); p.y+=a*sin(ph); }
  vW=p; vO=o; p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: GLSL_COMMON + TERR + FOAM_GLSL + /* glsl */`
uniform vec4 uWave[${NWAVES}]; uniform float uTime,uQ,uWind,uGustSize,uBoatV; uniform vec2 uGustO,uWindDir; uniform sampler2D uGust; uniform vec4 uBoat; uniform vec3 uHull;
varying vec3 vW; varying vec2 vO;
// шум с аналитической производной: одна выборка даёт и высоту, и уклон
vec3 noised(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f), du=6.*f*(1.-f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y, du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }
// бикубическая (B-сплайн) выборка карты порывов четырьмя билинейными отсчётами: ни изломов, ни ступенек
float gustS(vec2 uv){ vec2 st=uv*${GN}.-0.5, i=floor(st), f=st-i, f2=f*f, f3=f2*f;
  vec2 w0=(1.-3.*f+3.*f2-f3)/6., w1=(4.-6.*f2+3.*f3)/6., w3=f3/6., w2=1.-w0-w1-w3, g0=w0+w1, g1=w2+w3;
  vec2 a=(i-0.5+w1/g0)/${GN}., b=(i+1.5+w3/g1)/${GN}.;
  return g0.y*(g0.x*texture2D(uGust,vec2(a.x,a.y)).r+g1.x*texture2D(uGust,vec2(b.x,a.y)).r)+g1.y*(g0.x*texture2D(uGust,vec2(a.x,b.y)).r+g1.x*texture2D(uGust,vec2(b.x,b.y)).r); }
// Корабельные волны Кельвина -- точное решение линейной теории для тела, идущего по глубокой воде. Клин имеет
// полуугол 19.47 градуса при ЛЮБОЙ скорости; внутри две системы: поперечные (длина 2*pi*U^2/g, гребни поперёк пути)
// и расходящиеся (короткие, «перьями» у краёв клина). Координаты берутся вдоль реально пройденного пути: x -- сколько
// пройдено от форштевня, y -- боковое отклонение, поэтому в повороте клин изгибается вместе со следом.
#define NTR 22
uniform vec4 uTrail[NTR]; uniform float uTrailN, uKelvin;
vec3 kelvin(vec2 o){ if(uKelvin<0.7 || uTrailN<2.) return vec3(0.);
  float best=1e9, bd=0., bl=0.; vec2 bt=vec2(0.,1.);
  for(int i=0;i<NTR-1;i++){ if(float(i)>uTrailN-1.5) break; vec2 a=uTrail[i].xy, ab=uTrail[i+1].xy-a; float L2=max(dot(ab,ab),1e-4), t=clamp(dot(o-a,ab)/L2,0.,1.); vec2 q=o-(a+ab*t); float d2=dot(q,q);
    if(d2<best){ best=d2; bd=mix(uTrail[i].z,uTrail[i+1].z,t); float an=mix(uTrail[i].w,uTrail[i+1].w,t); bt=vec2(cos(an),sin(an)); bl=bt.x*q.y-bt.y*q.x; } }
  float x=bd, y=abs(bl), tt=y/max(x,1e-3); if(x<0.4 || tt>0.3535) return vec3(0.);
  float U=uKelvin, k0=9.81/(U*U), sq=sqrt(max(x*x-8.*y*y,0.)), yy=max(y,1e-3), T1=(-x+sq)/(4.*yy), T2=(-x-sq)/(4.*yy);
  float amp=0.07*min(U*U/9.,1.25)*smoothstep(0.7,2.,U)*exp(-x/60.)/sqrt(1.+k0*x*0.10)*smoothstep(0.4,3.5,x)*smoothstep(0.3535,0.17,tt)*(1.-smoothstep(uTrail[int(uTrailN)-1].z-12.,uTrail[int(uTrailN)-1].z,x));
  vec3 r=vec3(0.);
  { float s=sqrt(1.+T1*T1), k=k0*s*s, ps=k0*s*(x+y*T1), A=amp*1.15*exp(-k*k/90.); r+=A*vec3(cos(ps), -sin(ps)*k*vec2(1.,T1)/s); }      // поперечные
  { float s=sqrt(1.+T2*T2), k=k0*s*s, ps=k0*s*(x+y*T2)+0.785, A=amp*1.2*exp(-k*k/9.); r+=A*vec3(cos(ps), -sin(ps)*k*vec2(1.,T2)/s); } // расходящиеся; сверхкороткие у оси гасит размер корпуса
  return vec3(r.x, bt*r.y+vec2(-bt.y,bt.x)*sign(bl)*r.z); }
void main(){ vec2 o=vO; float dist=length(vW-cameraPosition);
  float th=terrH(o), depth=-th, thick=vW.y-th; if(thick<0.01) discard;
  float att=smoothstep(0.2,5.,depth);
  float g=gustS((o-uGustO)/uGustSize+0.5)*2.; vec2 gu=abs((o-uGustO)/uGustSize); g=mix(g,1.,smoothstep(0.42,0.5,max(gu.x,gu.y)));
  // размер пикселя на воде в метрах. У горизонта взгляд скользит по воде, и один пиксель накрывает сотни метров:
  // волна короче этого уже не видна как волна, а только рябит. Такие волны плавно убираем из нормали.
  float pxw=length(fwidth(o));
  vec2 sl=vec2(0.); float crest=0., hh=0.;
  for(int i=0;i<${NWAVES};i++){ vec4 w=uWave[i]; float L=6.2832/w.z, ph=w.z*dot(w.xy,o)-sqrt(9.81*w.z)*uTime;
    float f=att*(1.-smoothstep(L*180.,L*520.,dist))*clamp(L*3./pxw,0.,1.); float c=cos(ph), s=sin(ph);
    sl+=w.xy*(w.w*w.z*c*f); crest+=w.w*w.z*s*f; hh+=w.w*s*f; }
  // фактура: пять октав ряби, гребни вытянуты поперёк ветра и бегут по нему; в порыве рябь грубее
  float rip=clamp((uWind*g-0.6)/8.,0.08,1.25)*att; vec2 wd=uWindDir, wp=vec2(-wd.y,wd.x);
  vec2 ow=vec2(dot(o,wd), dot(o,wp)); vec2 ds=vec2(0.); float fq=0.23, am=1., nh=0.;
  for(int i=0;i<RIP_OCT;i++){ float fi=float(i), cph=sqrt(9.81/(6.2832*fq))*0.75;
    float ra=fi*2.399+0.6, cr=cos(ra), sr=sin(ra); vec2 bq=vec2((ow.x-cph*uTime)*fq, ow.y*fq*0.42);
    vec3 nd=noised(vec2(cr*bq.x-sr*bq.y, sr*bq.x+cr*bq.y)+fi*19.7+vec2(sin(fi*3.1),cos(fi*2.3))*uTime*0.05);
    vec2 gb=vec2(cr*nd.y+sr*nd.z, -sr*nd.y+cr*nd.z); // градиент обратно в оси ветра
    float f=(1.-smoothstep(90./fq,340./fq,dist))*clamp(3./(fq*pxw),0.,1.); ds+=(wd*gb.x+wp*gb.y*0.42)*am*f; nh+=(nd.x-0.5)*am*f; fq*=2.13; am*=0.86; }
  sl+=ds*0.105*rip;
  // клин за кормой -- только мягкий уклон в нормали: он виден в отражении неба, как на настоящей воде, и не рисует полос
  vec3 kw=kelvin(o)*att; kw.yz*=min(1.,0.16/max(length(kw.yz),1e-3)); sl+=kw.yz;
  // пена: кружево у корпуса, расходящиеся усы и бурун за кормой
  vec2 rel=o-uBoat.xy, bf=uBoat.zw; float bl=dot(rel,bf), bc=dot(rel,vec2(-bf.y,bf.x)), bv=uBoatV;
  float e=length(vec2((bl-0.1)/uHull.x, bc/uHull.y));
  float hullF=(1.-smoothstep(0.95,1.45,e))*(0.35+0.65*bv)*(0.55+0.45*smoothstep(-2.,3.,bl));
  vec3 N=normalize(vec3(-sl.x,1.,-sl.y)); vec3 V=normalize(cameraPosition-vW);
  float F=0.02+0.98*pow(1.-max(dot(N,V),0.),5.); F=min(F,0.55)*mix(1.,0.82,smoothstep(0.,0.6,rip));
  vec3 R=reflect(-V,N); R.y=abs(R.y)*0.8+0.22; R=normalize(R);
  vec3 sky=skyBase(R);
  #ifdef LOW
  float cr=cloudCov(vnoise(cloudUV(R)*0.6+3.1)*0.55+0.2);
  #else
  float cr=cloudCov(fbm(cloudUV(R)*0.45+3.1)*0.62+0.18);
  #endif
  // у горизонта отражения облаков сжаты в полоски тоньше пикселя: там берём среднюю облачность, а не рисунок
  cr=mix(cr, uCover*0.45, smoothstep(0.8,10.,pxw));
  sky=mix(sky, mix(vec3(0.86,0.88,0.90), vec3(0.16,0.18,0.21), uStorm)*mix(0.05,1.,uDay), cr*0.75);
  float sd=max(dot(R,uSun),0.), far=smoothstep(100.,4000.,dist);
  vec3 spec=vec3(1.,.93,.78)*(pow(sd,mix(700.,90.,far))*mix(8.,1.2,far))*uSunI;
  vec3 deep=vec3(0.004,0.075,0.34), turq=vec3(0.0,0.34,0.60), shal=vec3(0.06,0.72,0.70);
  deep=mix(deep, vec3(0.012,0.045,0.07), uStorm*0.85); turq=mix(turq, vec3(0.03,0.16,0.20), uStorm*0.8);
  vec3 body=mix(shal, mix(turq,deep,smoothstep(7.,42.,depth)), smoothstep(0.4,9.,depth));
  // у борта вода взбита и насыщена воздухом -- светло-бирюзовая кайма под пеной
  body=mix(body, mix(vec3(0.16,0.60,0.66),vec3(0.10,0.24,0.26),uStorm), clamp(hullF*0.85,0.,1.)*0.6*uDay);
  // тень лодки и парусов на воде: одна сплошная сужающаяся полоса вдоль луча солнца (расстояние до отрезка
  // «подножие мачты -- тень топа» с радиусом, убывающим к концу). Цепочка отдельных пятен читалась как кружки.
  vec2 sdir=-uSun.xz/max(uSun.y,0.25), sa=bf*0.2, sb=sdir*uHull.z+bf*0.9, sab=sb-sa; float st=clamp(dot(rel-sa,sab)/dot(sab,sab),0.,1.), sr=mix(min(2.4,uHull.y*1.6),0.3,pow(st,0.8));
  float shd=1.-smoothstep(sr*0.45,sr*1.15,length(rel-(sa+sab*st)));
  shd*=uSunI*step(0.02,uBoat.z*uBoat.z+uBoat.w*uBoat.w);
  float sunSide=max(dot(V.xz,-normalize(uSun.xz))*0.5+0.6,0.);
  // волны идут группами: плавная огибающая ломает остатки правильного узора
  #ifdef LOW
  float grp=0.35+1.3*vnoise(o*0.03+uTime*0.012*uWindDir);
  #else
  float grp=0.35+1.3*fbm(o*0.021+uTime*0.012*uWindDir);
  #endif
  body+=mix(vec3(0.,0.22,0.24), vec3(0.03,0.10,0.09), uStorm)*pow(smoothstep(-0.35,1.05,crest*uQ/0.85),2.2)*grp*0.55*sunSide; // просвет гребня: плавно нарастает к вершине. Жёсткий порог давал пятна с резким краем
  // ложбины темнее; мелкая фактура -- через уклон ряби к солнцу. Сам решётчатый шум в цвет не идёт: он давал клетчатые пятна
  body*=clamp(0.94+hh*0.22+dot(ds,normalize(uSun.xz))*0.05*rip,0.72,1.22);
  body*=mix(1.10,0.74,smoothstep(0.80,1.60,g));
  body*=mix(0.07,1.,uDay); body*=1.-0.42*shd;
  vec3 col=mix(body,sky,F*(1.-0.25*shd))+spec*(1.-shd);
  float fn=fvn(o*0.9+uTime*0.05)*0.65+fvn(o*2.6-uTime*0.04)*0.35, lc=0.;
  float wf=clamp((uWind*g-4.)/8.,0.,1.), cth=mix(1.0,0.30,wf);
  float cap=smoothstep(cth,cth+0.22, crest*uQ/0.85+(fn-0.5)*0.35)*(1.-smoothstep(900.,2600.,dist));
  // след от барашка: за гребнем остаётся тающая пенная сетка
  float trail=smoothstep(cth-0.38,cth+0.05, crest*uQ/0.85+(fn-0.5)*0.5)*0.55*(1.-smoothstep(400.,1500.,dist));
  float sh=smoothstep(1.1,0.,thick)*(0.55+0.45*sin(depth*5.-uTime*1.6+fn*4.))*smoothstep(0.02,0.15,thick);
  // пена там, где расчётная волна крутая или высокая: гребень носовой волны, всплеск у борта
  float bm=clamp(hullF*0.62,0.,1.); // пена -- только у самого корпуса
  float m=clamp(cap+trail*(1.-cap)+sh*0.9+bm,0.,1.);
  // рисунок считаем только там, где пена вообще есть; порог размывается на ширину пикселя -- край без «лесенки»
  float foam=0.; if(m>0.02){ lc=foamTex(o,uTime); float v=lc*0.80+fn*0.34, th=1.10-m*1.02, aa=0.10+fwidth(v)*1.2; foam=smoothstep(th-aa, th+aa, v)*smoothstep(0.02,0.2,m); }
  vec3 fcol=mix(vec3(0.97,0.99,1.), vec3(0.70,0.74,0.76), uStorm*0.7)*(0.62+0.42*max(dot(N,uSun),0.)*uSunI+0.12*lc);
  col=mix(col, fcol*mix(0.14,1.,uDay), foam*0.94);
  col=applyFog(col,dist,0.);
  gl_FragColor=vec4(col, smoothstep(0.01,0.75,thick)); ${END} }`,
  });
  QMATS.push(mat);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  const gdata = gustTex.image.data;
  // Ветровая тень берега зависит только от места и направления ветра, а сетка сдвигается за лодкой на клетку-другую.
  // Поэтому тень храним и при сдвиге берём готовые значения, считая заново только новые края. Раньше каждые 6 кадров
  // заново считались 16 тысяч клеток по 3 высоты рельефа в каждой -- на телефоне это рывок кадра
  // Сам расчёт раскладывается на несколько кадров (rows строк за вызов): новая карта собирается в запасном буфере и
  // подменяет текущую целиком, когда готова. Задержка та же, что была (6 кадров), но без пика в одном кадре
  let shel = new Float32Array(GN * GN), shel2 = new Float32Array(GN * GN), shK = null, job = null; const gnext = new Uint8Array(GN * GN);
  return {
    mesh, uniforms,
    // путь для клина Кельвина: форштевень, корма и дальше точки следа через каждые ~3.6 м
    setTrail(b, pts) { const T = uniforms.uTrail.value, fx = Math.sin(b.th), fz = -Math.cos(b.th), sx = b.X - fx * 2.7, sz = -b.Y - fz * 2.7;
      // вершина клина -- впереди кормы ПО НАПРАВЛЕНИЮ ДВИЖЕНИЯ, а не по курсу: лодка идёт с дрейфом, и если брать курс,
      // путь получает излом на корме, а вместе с ним ломается и клин
      const v = Math.hypot(b.vx, b.vy), dx = v > 0.4 ? b.vx / v : fx, dz = v > 0.4 ? -b.vy / v : fz;
      let n = 0, d = 0, px = sx + dx * 6.2, pz = sz + dz * 6.2;
      const add = (x, z) => { d += Math.hypot(x - px, z - pz); px = x; pz = z; T[n++].set(x, z, d, 0); };
      add(px, pz); add(sx, sz);
      for (let i = 3; i < pts.length && n < 22; i += 4) add(pts[i].x, pts[i].z);
      // в каждой точке -- направление пути, усреднённое по соседям; шейдер интерполирует его между точками.
      // Без этого на стыках отрезков клин ломался и давал прямые полосы
      let pa = 0; for (let i = 0; i < n; i++) { const a = T[Math.max(i - 1, 0)], c = T[Math.min(i + 1, n - 1)]; let an = Math.atan2(c.y - a.y, c.x - a.x);
        if (i) { while (an - pa > Math.PI) an -= 2 * Math.PI; while (an - pa < -Math.PI) an += 2 * Math.PI; } T[i].w = an; pa = an; }
      uniforms.uTrailN.value = n; const sp = b.capsized ? 0 : Math.hypot(b.vx, b.vy); uniforms.uKelvin.value += (sp - uniforms.uKelvin.value) * 0.04; }, // скорость сглажена: длина волн не должна дёргаться
    setBoat(b) { if (b.hl) uniforms.uHull.value.set(b.hl * 1.15 + 0.3, b.hbm * 1.35 + 0.25, b.kind === 'sup' ? 1.9 : 1.1); else uniforms.uHull.value.set(3.9, 1.5, 10.6);
      uniforms.uBoat.value.set(b.X, -b.Y, Math.sin(b.th), -Math.cos(b.th)); uniforms.uBoatV.value = b.capsized ? 0 : Math.min(1, b.speed / 3.6); },
    setWaves(waves) { waves.w.forEach((w, i) => uniforms.uWave.value[i].set(w.dx, w.dz, w.k, w.a)); uniforms.uQ.value = waves.qf; },
    // карта порывов вокруг лодки -- тот же расчёт, что двигает лодку
    updateGust(wind, cx, cz, rows = GN) {
      const S = GS, hf = GN / 2 - 0.5;
      if (!job) { const ox = Math.round(cx / S) * S, oz = Math.round(cz / S) * S, ok = shK && shK.w === wind && shK.h === wind.terrainH && shK.sx === wind.sx && shK.sy === wind.sy;
        job = { j: 0, ok, di: ok ? Math.round((ox - shK.ox) / S) : 0, dj: ok ? Math.round((oz - shK.oz) / S) : 0, key: { w: wind, h: wind.terrainH, sx: wind.sx, sy: wind.sy, ox, oz } }; }
      const { ok, di, dj, key } = job, { ox, oz } = key, je = shK ? Math.min(GN, job.j + rows) : GN; // самая первая карта -- сразу целиком
      for (let j = job.j; j < je; j++) for (let i = 0; i < GN; i++) {
        const X = ox + (i - hf) * S, Y = -(oz + (j - hf) * S), i0 = i + di, j0 = j + dj, k = j * GN + i;
        shel2[k] = ok && i0 >= 0 && i0 < GN && j0 >= 0 && j0 < GN ? shel[j0 * GN + i0] : wind.shelter(X, Y);
        gnext[k] = Math.max(0, Math.min(255, wind.gust(X, Y) * shel2[k] * 127.5));
      }
      job.j = je; uniforms.uWindDir.value.set(wind.sx, -wind.sy); uniforms.uWind.value = wind.U;
      if (je < GN) return;
      gdata.set(gnext); [shel, shel2] = [shel2, shel]; shK = key; job = null;
      gustTex.needsUpdate = true; uniforms.uGustO.value.set(ox, oz);
    },
  };
}

// ---------- берег: тополя, дома, пансионаты, причал яхт-клуба ----------
export function makeShore(h, scene) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const scatter = (count, tries, accept) => { const out = []; for (let t = 0; t < tries && out.length < count; t++) { const X = -5200 + rnd() * 11500, Y = 100 + rnd() * 4200, y = h(X, Y); if (accept(X, Y, y)) out.push([X, y, Y]); } return out; };
  const town = (X, Y) => 0.5 + 0.5 * noise2(X / 420, Y / 420);
  const inst = (geo, mat, pts, fn) => { const m = new THREE.InstancedMesh(geo, mat, pts.length); pts.forEach((p, i) => { fn(p, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col); }); m.frustumCulled = false; scene.add(m); return m; };

  // деревья и дома берега -- по данным OpenStreetMap, спрайтами (shoreart.js)
  // причал яхт-клуба: идём от точки старта на север до берега
  let py = 0; while (h(0, py) < -1.6 && py < 3000) py += 4;
  const pier = new THREE.Group(), wood = lam(0xa8845c), L = 150;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, L), wood); deck.position.set(0, 1.25, -(py + L / 2 - 50)); pier.add(deck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5), wood); head.position.set(0, 1.25, -(py - 50)); pier.add(head);
  const pile = new THREE.CylinderGeometry(0.28, 0.28, 6, 6), pm = lam(0x5a4632);
  for (let i = 0; i < 12; i++) for (const sx of [-2, 2]) { const m = new THREE.Mesh(pile, pm); m.position.set(sx, -1.2, -(py - 48 + i * 11)); pier.add(m); }
  // флагшток с флагом -- по нему видно ветер ещё до выхода
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 11, 6), lam(0xf2f2f2)); pole.position.set(15, 6.8, -(py - 50)); pier.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshLambertMaterial({ color: 0xe8112d, side: THREE.DoubleSide })); flag.geometry.translate(1.7, 0, 0); flag.position.set(15, 11.2, -(py - 50)); pier.add(flag);
  // оконечность мыса -- цель в свободном плавании
  let cx = -1900, cy = -500; for (let Y = -900; Y < 600; Y += 20) for (let X = -2600; X < -1200; X += 20) if (h(X, Y) > 1.5 && Y < cy) { cy = Y; cx = X; }
  scene.add(pier);
  // причал как препятствие: «высота» с уклоном наружу, чтобы лодку сталкивало от настила, а не клинило в нём
  const P0 = py - 50, pierH = (X, Y) => { const ax = Math.abs(X);
    const stem = Y > P0 ? 2 - Math.max(0, ax - 2.5) * 1.2 : -99, head = 2 - Math.max(0, Math.abs(Y - P0) - 2.5) * 1.2 - Math.max(0, ax - 17) * 1.2;
    return Math.max(stem, head); };
  return { pierY: P0, pierH, flag, cape: { X: cx, Y: cy } };
}

// ---------- знак дистанции ----------
export function makeMark(color = 0xff7a1a) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 2.6, 14), new THREE.MeshPhongMaterial({ color, shininess: 60 })); b.position.y = 1.0; g.add(b);
  const t = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 8, 0, 6.3, 0, 1.6), b.material); t.position.y = 2.3; g.add(t);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), new THREE.MeshBasicMaterial({ color: 0x222222 })); p.position.y = 4.2; g.add(p);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); f.position.set(0.55, 5.0, 0); g.add(f);
  g.scale.setScalar(1.7); // гоночные знаки крупные: надувной буй в рост человека виден за сотни метров
  return g;
}
export { smooth };
