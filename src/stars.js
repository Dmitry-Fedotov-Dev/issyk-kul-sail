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
  const U = { uEq: ENV.uEq, uPR: { value: 1 }, uT: { value: 0 }, uDay: ENV.uDay, uStorm: ENV.uStorm, uSunI: ENV.uSunI };
  const mat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform float uPR, uT, uDay, uStorm; attribute vec2 aMB; varying vec3 vC; varying float vA;
void main(){ vec3 d=uEq*position; float alt=d.y;
  // предельная величина: днём не видно ничего, в сумерках -- самые яркие, в темноте -- до 6-й; у горизонта воздух гасит
  float lim=mix(6.2,-1.5,smoothstep(0.02,0.55,uDay))-1.6*uStorm, ext=0.28/max(alt+0.035,0.02), m=aMB.x+ext;
  float vis=smoothstep(lim+0.2,lim-0.8,m)*smoothstep(-0.01,0.03,alt);
  float tw=1.+(0.18+0.5*smoothstep(0.5,0.05,alt))*sin(uT*(9.+fract(aMB.x*37.)*13.)+aMB.y*91.+position.x*311.); // мерцание
  vA=vis*clamp(1.45-0.2*m,0.22,1.8)*tw; // яркость сжата (как на рисованном небе): слабые звёзды видны, яркие не выжигают
  // цвет по показателю B-V: голубые горячие (Вега, Ригель), белые, жёлтые, оранжевые (Арктур, Альдебаран), красные (Антарес)
  float bv=aMB.y; vC=bv<0.4?mix(vec3(0.70,0.80,1.),vec3(1.,0.98,0.94),smoothstep(-0.3,0.4,bv)):mix(vec3(1.,0.98,0.94),vec3(1.,0.62,0.38),smoothstep(0.4,1.8,bv));
  gl_PointSize=uPR*clamp(5.4-0.72*m,1.7,8.);
  vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; if(vis<=0.001) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying vec3 vC; varying float vA;
void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.; float core=1.-smoothstep(0.25,0.55,r), halo=(1.-smoothstep(0.4,1.,r))*0.35; // рисованная точка: плотное ядро и мягкий ореол
  float a=(core+halo)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a,1.); }` });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = -9; // после неба, до земли и облаков: горы и облака закрывают звёзды
  return { mesh: pts,
    // X, Y -- где камера на карте; clock -- игровые часы; pr -- плотность пикселей экрана
    update(X, Y, clock, pr, t) { const [lat, lon] = latLon(X, Y); eqToThree(lat, lstAt(clock, lon), ENV.uEq.value); U.uPR.value = pr; U.uT.value = t; } };
}
