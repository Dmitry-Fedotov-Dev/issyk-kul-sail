// Настоящее звёздное небо над Иссык-Кулём: 5044 звезды каталога Hipparcos до 6-й величины и Млечный Путь на своём месте.
//
// Положение звезды на небе -- по широте и долготе той точки карты, где камера (Балыкчы и Каракол различаются на 1.5° по
// долготе -- небо там повёрнуто на 6 минут), и по звёздному времени. Звёздное время привязано к игровому солнцу:
// в игре склонение солнца +20° и полдень в 13:00 по местному (UTC+6) -- это около 23 июля, когда прямое восхождение
// солнца ~121°. Значит, в полдень местное звёздное время у Чолпон-Аты = 121°, и звёзды точно согласованы с солнцем,
// зарёй и сумерками. Звёздные сутки короче солнечных: небо за час поворачивается на 15.04°.
//
// Видимость -- как у настоящего глаза: в сумерках проступают сначала самые яркие (Вега, Арктур, Альтаир), к полной
// темноте -- всё до 6-й величины; у горизонта звёзды тускнеют и мерцают сильнее (толща воздуха); в непогоду -- не видно.
import * as THREE from 'three';
import { STARS_B64 } from './stardata.js';
import { ENV } from './world.js';

const LAT0 = 42.65, LON0 = 77.08, LST_NOON = 121.0; // Чолпон-Ата; звёздное время в 13:00 местного
const DEG = Math.PI / 180;

// направление «экватор J2000 -> экран three.js» (x -- восток, y -- зенит, z -- юг) для широты lat и звёздного времени lst (°)
export function eqToThree(lat, lst, out = new THREE.Matrix3()) {
  const p = lat * DEG, t = lst * DEG, cp = Math.cos(p), sp = Math.sin(p), ct = Math.cos(t), st = Math.sin(t);
  // q' = Rz(-lst)·q: (cosδ·cosH, -cosδ·sinH, sinδ); восток = q'y, зенит = sinφ·q'z + cosφ·q'x, юг = sinφ·q'x - cosφ·q'z
  const A = [[0, 1, 0], [cp, 0, sp], [sp, 0, -cp]], R = [[ct, st, 0], [-st, ct, 0], [0, 0, 1]], m = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.push(A[i][0] * R[0][j] + A[i][1] * R[1][j] + A[i][2] * R[2][j]);
  return out.set(...m);
}
// где на Земле точка карты (метры мира: X -- восток, Y -- север от Чолпон-Аты)
export const latLon = (X, Y) => { const lat = LAT0 + Y / 110950; return [lat, LON0 + X / (111320 * Math.cos(lat * DEG))]; };
// местное звёздное время (°) по игровым часам (местное время UTC+6) и долготе
export const lstAt = (clock, lon) => LST_NOON + (clock - 13) * 15.0410686 + (lon - LON0);

export function makeStars() {
  const raw = Uint8Array.from(atob(STARS_B64), (c) => c.charCodeAt(0)), a = new Int16Array(raw.buffer), n = a.length / 4;
  const q = new Float32Array(n * 3), mg = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const ra = (a[i * 4] + 16200) / 90 * DEG, de = a[i * 4 + 1] / 300 * DEG, cd = Math.cos(de);
    q[i * 3] = cd * Math.cos(ra); q[i * 3 + 1] = cd * Math.sin(ra); q[i * 3 + 2] = Math.sin(de); mg[i * 2] = a[i * 4 + 2] / 1000; mg[i * 2 + 1] = a[i * 4 + 3] / 1000; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(q, 3)); geo.setAttribute('aMB', new THREE.BufferAttribute(mg, 2));
  // объекты глубокого неба -- редкие акценты на настоящих местах: [RA°, Dec°, видимая величина, вид: 1 галактика, 2 туманность, 3 скопление]
  const DSO = [[10.68, 41.27, 3.4, 1], [56.75, 24.12, 1.6, 3], [83.82, -5.39, 4.0, 2], [270.9, -24.38, 5.0, 2], [270.6, -23.03, 6.0, 2], [34.75, 57.13, 3.7, 3], [250.42, 36.46, 5.8, 3]]; // M31, Плеяды, M42, Лагуна, Трифид, h и χ Персея, M13
  const dq = new Float32Array(DSO.length * 3), dk = new Float32Array(DSO.length * 2);
  DSO.forEach(([ra, de, m, k], i) => { const cd = Math.cos(de * DEG); dq[i * 3] = cd * Math.cos(ra * DEG); dq[i * 3 + 1] = cd * Math.sin(ra * DEG); dq[i * 3 + 2] = Math.sin(de * DEG); dk[i * 2] = m; dk[i * 2 + 1] = k; });
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dq, 3)); dgeo.setAttribute('aMK', new THREE.BufferAttribute(dk, 2));
  const U = { uEq: ENV.uEq, uMoon: ENV.uMoon, uPR: { value: 1 }, uT: { value: 0 }, uDay: ENV.uDay, uStorm: ENV.uStorm, uSunI: ENV.uSunI };
  const mat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform vec4 uMoon; uniform float uPR, uT, uDay, uStorm; attribute vec2 aMB; varying vec3 vC; varying float vA; varying float vBig;
void main(){ vec3 d=uEq*position; float alt=d.y;
  // предельная величина: днём не видно ничего, в сумерках -- самые яркие, в темноте -- до 6-й; у горизонта воздух гасит
  float lim=mix(6.2,-1.5,smoothstep(0.02,0.55,uDay))-1.6*uStorm-2.*uMoon.w*smoothstep(-0.05,0.2,uMoon.y), /* яркая Луна гасит слабые звёзды */ ext=0.28/max(alt+0.035,0.02), m=aMB.x+ext;
  float vis=smoothstep(lim+0.2,lim-0.8,m)*smoothstep(-0.01,0.03,alt);
  float tw=1.+(0.18+0.5*smoothstep(0.5,0.05,alt))*sin(uT*(9.+fract(aMB.x*37.)*13.)+aMB.y*91.+position.x*311.); // мерцание
  vA=vis*clamp(1.45-0.2*m,0.22,1.8)*tw; // яркость сжата (как на рисованном небе): слабые звёзды видны, яркие не выжигают
  // цвет по показателю B-V: голубые горячие (Вега, Ригель), белые, жёлтые, оранжевые (Арктур, Альдебаран), красные (Антарес)
  float bv=aMB.y; vC=bv<0.4?mix(vec3(0.70,0.80,1.),vec3(1.,0.98,0.94),smoothstep(-0.3,0.4,bv)):mix(vec3(1.,0.98,0.94),vec3(1.,0.62,0.38),smoothstep(0.4,1.8,bv));
  vBig=smoothstep(1.8,0.,m)*vis; // самые яркие -- с четырьмя лучами
  gl_PointSize=uPR*mix(clamp(5.4-0.72*m,1.7,8.),17.,vBig);
  vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; if(vis<=0.001) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vBig;
void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2., c0=mix(0.25,0.1,vBig); float core=1.-smoothstep(c0,c0+0.3*(1.-vBig)+0.06,r), halo=(1.-smoothstep(0.4,1.,r))*mix(0.35,0.18,vBig); // рисованная точка: плотное ядро и мягкий ореол
  float sp=vBig*(1.-r)*(exp(-abs(c.x)*55.)+exp(-abs(c.y)*55.))*0.9; // крест лучей у ярких звёзд
  float a=(core+halo+sp)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a,1.); }` });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = -9; // после неба, до земли и облаков: горы и облака закрывают звёзды
  // объекты глубокого неба: мягкие цветные пятна (галактика -- вытянутая, туманности -- розовые, скопления -- голубые искры)
  const dmat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform vec4 uMoon; uniform float uPR, uDay, uStorm; attribute vec2 aMK; varying float vA; varying float vK;
void main(){ vec3 d=uEq*position; vK=aMK.y; vA=smoothstep(0.25,0.0,uDay)*(1.-uStorm)*(1.-0.85*uMoon.w*smoothstep(-0.05,0.2,uMoon.y))*smoothstep(0.03,0.2,d.y)*clamp(1.2-0.12*aMK.x,0.3,1.);
  gl_PointSize=uPR*(vK<1.5?34.:vK<2.5?22.:20.); vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; if(vA<=0.001) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying float vA; varying float vK;
void main(){ vec2 c=gl_PointCoord-0.5; vec3 col; float a;
  if(vK<1.5){ vec2 e=mat2(0.8,0.6,-0.6,0.8)*c; float r=length(e*vec2(1.,3.2))*2.; a=exp(-r*r*3.)*0.55+exp(-dot(c,c)*400.)*0.5; col=vec3(0.85,0.82,1.); }      // галактика Андромеды
  else if(vK<2.5){ float r=length(c)*2.; a=exp(-r*r*4.)*0.55; col=vec3(1.,0.45,0.75); }                                                     // туманность
  else { float r=length(c)*2.; a=exp(-r*r*5.)*0.35; vec2 g=floor(c*9.); float h=fract(sin(dot(g,vec2(12.9,78.2)))*43758.); a+=step(0.84,h)*(1.-smoothstep(0.,0.9,r))*0.9; col=vec3(0.75,0.85,1.); } // скопление
  a*=vA; if(a<0.004) discard; gl_FragColor=vec4(col*a,1.); }` });
  const dso = new THREE.Points(dgeo, dmat); dso.frustumCulled = false; dso.renderOrder = -9; pts.add(dso);
  // Луна: фаза идёт по игровым суткам (лунный месяц -- 29.5 суток игры), положение -- у эклиптики, к востоку от солнца на угол фазы
  const moon = { day: 0, last: null }, mv = new THREE.Vector3(), eps = 23.44 * DEG, SUN_LON = 120 * DEG;
  return { mesh: pts, moon: ENV.uMoon.value, // moon -- для проверок
    // X, Y -- где камера на карте; clock -- игровые часы; pr -- плотность пикселей экрана
    update(X, Y, clock, pr, t) { const [lat, lon] = latLon(X, Y); eqToThree(lat, lstAt(clock, lon), ENV.uEq.value); U.uPR.value = pr; U.uT.value = t; ENV.uNT.value = t;
      if (moon.last !== null && clock < moon.last - 12) moon.day++; moon.last = clock;
      const ph = ((moon.day + clock / 24) / 29.53 + 0.13) % 1, el = ph * 2 * Math.PI, lm = SUN_LON + el + (clock - 13) / 24 * 0.2299; // 0 -- новолуние, 0.5 -- полнолуние; первая ночь -- молодой серп на западе после заката
      const dec = Math.asin(Math.sin(eps) * Math.sin(lm)), ra = Math.atan2(Math.cos(eps) * Math.sin(lm), Math.cos(lm)), cd = Math.cos(dec);
      mv.set(cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)).applyMatrix3(ENV.uEq.value).normalize();
      ENV.uMoon.value.set(mv.x, mv.y, mv.z, (1 - Math.cos(el)) / 2); } };
}
