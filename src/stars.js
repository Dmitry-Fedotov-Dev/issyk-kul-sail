// Настоящее звёздное небо над Иссык-Кулём: 5044 звезды каталога Hipparcos до 6-й величины и Млечный Путь на своём месте.
//
// Положение звезды на небе -- по широте и долготе той точки карты, где камера (Балыкчы и Каракол различаются на 1.5° по
// долготе), и по звёздному времени игровой даты (astro.js). Солнце, Луна и планеты -- по эфемеридам на ту же дату,
// поэтому всё согласовано: заря, фаза Луны, сезонное небо (летом -- Лебедь и Стрелец, зимой -- Орион и Телец).
//
// Видимость -- как у настоящего глаза: в сумерках проступают сначала самые яркие (Вега, Арктур, Альтаир), к полной
// темноте -- всё до 6-й величины; у горизонта звёзды тускнеют и мерцают сильнее (толща воздуха); в непогоду -- не видно.
import * as THREE from 'three';
import { STARS_B64, LINES_B64 } from './stardata.js';
import { sky, jdOf, gmst, radec } from './astro.js';
import { ENV } from './world.js';

const LAT0 = 42.65, LON0 = 77.08; // Чолпон-Ата, высота ~1650 м
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
// местное звёздное время (°) по игровой дате/часам и долготе
export const lstAt = (clock, lon, day = 0) => gmst(jdOf(day, clock)) + lon;
// направление на Солнце (x -- восток, y -- зенит, z -- юг) для Чолпон-Аты -- им живёт игровой свет
export function sunDir(day, clock, out) { const jd = jdOf(day, clock), m = eqToThree(LAT0, gmst(jd) + LON0, new THREE.Matrix3()), s = sky(jd).sun, v = radec(s.ra, s.dec);
  return out.set(v[0], v[1], v[2]).applyMatrix3(m); }

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
  const U = { uEq: ENV.uEq, uMoon: ENV.uMoon, uCine: ENV.uCine, uPR: { value: 1 }, uT: { value: 0 }, uDay: ENV.uDay, uStorm: ENV.uStorm, uSunI: ENV.uSunI };
  const mat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform vec4 uMoon; uniform float uPR, uT, uDay, uStorm, uCine; attribute vec2 aMB; varying vec3 vC; varying float vA; varying float vBig;
void main(){ vec3 d=uEq*position; float alt=d.y;
  // предельная величина: днём не видно ничего, в сумерках -- самые яркие, в темноте -- до 6-й; у горизонта воздух гасит
  float lim=mix(6.2,-1.5,smoothstep(0.02,0.55,uDay))-1.6*uStorm-2.*uMoon.w*smoothstep(-0.05,0.2,uMoon.y), /* яркая Луна гасит слабые звёзды */ ext=0.28/max(alt+0.035,0.02), m=aMB.x+ext;
  float vis=smoothstep(lim+0.2,lim-0.8,m)*smoothstep(-0.01,0.03,alt);
  float tw=1.+(0.08+0.32*smoothstep(0.5,0.05,alt))*sin(uT*(9.+fract(aMB.x*37.)*13.)+aMB.y*91.+position.x*311.); // мерцание
  vA=vis*clamp(1.6-0.21*m,0.3,2.2)*tw*mix(0.85,1.15,uCine); // яркость сжата (как на рисованном небе): слабые звёзды видны, яркие не выжигают
  // цвет по показателю B-V: голубые горячие (Вега, Ригель), белые, жёлтые, оранжевые (Арктур, Альдебаран), красные (Антарес)
  float bv=aMB.y; vC=bv<0.4?mix(vec3(0.70,0.80,1.),vec3(1.,0.98,0.94),smoothstep(-0.3,0.4,bv)):mix(vec3(1.,0.98,0.94),vec3(1.,0.62,0.38),smoothstep(0.4,1.8,bv));
  vBig=smoothstep(1.8,0.,m)*vis; // самые яркие -- с четырьмя лучами
  gl_PointSize=uPR*mix(clamp(5.8-0.8*m,1.6,9.),22.,vBig);
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
  // дальние звёзды 6.5-9-й величины: ~30 тыс., гуще к галактической плоскости и к центру -- глубина неба и зерно Млечного Пути.
  // Каталог до 9-й величины весил бы мегабайты; распределение здесь статистическое (настоящая плотность по галактической
  // широте), а все видимые глазом звёзды -- из Hipparcos
  const NF = 30000, fq = new Float32Array(NF * 3), fm = new Float32Array(NF * 2); let sd = 12345; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const G2E = [[-0.0548756, -0.8734371, -0.483835], [0.4941094, -0.4448296, 0.7469822], [-0.8676661, -0.1980764, 0.4559838]]; // галактика -> экватор J2000
  for (let i = 0, k = 0; k < NF && i < NF * 20; i++) { const l = (rnd() * 2 - 1) * Math.PI, sb = rnd() * 2 - 1, b = Math.asin(sb);
    const dens = 0.18 + Math.exp(-(b * b) / 0.012) * (0.8 + 1.6 * Math.exp(-(l * l) / 0.6)) + 0.6 * Math.exp(-(b * b) / 0.05); if (rnd() * 3.2 > dens) continue;
    const gx = Math.cos(b) * Math.cos(l), gy = Math.cos(b) * Math.sin(l), gz = Math.sin(b);
    for (let r = 0; r < 3; r++) fq[k * 3 + r] = G2E[r][0] * gx + G2E[r][1] * gy + G2E[r][2] * gz;
    fm[k * 2] = 6.3 + 2.7 * Math.pow(rnd(), 0.6); fm[k * 2 + 1] = rnd() < 0.7 ? 0.2 + rnd() * 0.6 : rnd() < 0.5 ? -0.2 + rnd() * 0.3 : 1 + rnd() * 0.6; k++; }
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(fq, 3)); fgeo.setAttribute('aMB', new THREE.BufferAttribute(fm, 2));
  const fmat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform vec4 uMoon; uniform float uPR, uDay, uStorm, uCine; attribute vec2 aMB; varying vec3 vC; varying float vA;
void main(){ vec3 d=uEq*position; float lim=mix(8.6+0.6*uCine,-1.,smoothstep(0.0,0.3,uDay))-1.6*uStorm-3.*uMoon.w*smoothstep(-0.05,0.2,uMoon.y), m=aMB.x+0.4/max(d.y+0.04,0.02);
  vA=smoothstep(lim+0.3,lim-1.2,m)*smoothstep(0.,0.05,d.y)*clamp(0.95-0.09*(m-6.),0.25,0.95)*mix(0.7,1.,uCine);
  float bv=aMB.y; vC=bv<0.4?mix(vec3(0.72,0.82,1.),vec3(1.,0.98,0.95),smoothstep(-0.3,0.4,bv)):mix(vec3(1.,0.98,0.95),vec3(1.,0.72,0.5),smoothstep(0.4,1.6,bv));
  gl_PointSize=uPR*1.5; vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; if(vA<=0.002) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5)*2.; float a=(1.-smoothstep(0.2,1.,r))*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a,1.); }` });
  const faint = new THREE.Points(fgeo, fmat); faint.frustumCulled = false; faint.renderOrder = -9; pts.add(faint);
  // планеты: Венера, Марс, Юпитер, Сатурн -- по эфемеридам; ровный немерцающий свет, это и отличает их от звёзд
  const PN = ['venus', 'mars', 'jupiter', 'saturn'], pq = new Float32Array(12), pm = new Float32Array(8), pc = new Float32Array(12);
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pq, 3)); pgeo.setAttribute('aMB', new THREE.BufferAttribute(pm, 2)); pgeo.setAttribute('aCol', new THREE.BufferAttribute(pc, 3));
  const pmat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; uniform vec4 uMoon; uniform float uPR, uDay, uStorm; attribute vec2 aMB; attribute vec3 aCol; varying vec3 vC; varying float vA;
void main(){ vec3 d=uEq*position; float lim=mix(6.,-5.,smoothstep(0.02,0.6,uDay))-1.6*uStorm, m=aMB.x+0.28/max(d.y+0.035,0.02);
  vA=smoothstep(lim+0.2,lim-0.8,m)*smoothstep(-0.01,0.03,d.y)*clamp(1.5-0.2*m,0.5,2.2); vC=aCol; gl_PointSize=uPR*clamp(7.-1.1*m,4.,11.);
  vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; if(vA<=0.001) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5)*2.; float a=((1.-smoothstep(0.3,0.5,r))+(1.-smoothstep(0.4,1.,r))*0.3)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a,1.); }` });
  const planets = new THREE.Points(pgeo, pmat); planets.frustumCulled = false; planets.renderOrder = -9; pts.add(planets);
  // линии созвездий IAU: тонкие, по умолчанию скрыты (клавиша C; в подзорной трубе -- всегда)
  const lraw = Uint8Array.from(atob(LINES_B64), (c) => c.charCodeAt(0)), la = new Int16Array(lraw.buffer), lq = new Float32Array(la.length / 2 * 3);
  for (let i = 0; i < la.length / 2; i++) radec((la[i * 2] + 16200) / 90, la[i * 2 + 1] / 300, lq.subarray(i * 3, i * 3 + 3));
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lq, 3)); U.uLines = { value: 0 };
  const lmat = new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    vertexShader: `uniform mat3 uEq; varying float vY; void main(){ vec3 d=uEq*position; vY=d.y; vec4 p=modelViewMatrix*vec4(d,0.); gl_Position=projectionMatrix*vec4(p.xyz,1.); gl_Position.z=gl_Position.w*0.99999; }`,
    fragmentShader: `uniform float uLines, uDay; varying float vY; void main(){ float a=uLines*0.32*smoothstep(0.3,0.,uDay)*smoothstep(0.,0.06,vY); if(a<0.003) discard; gl_FragColor=vec4(vec3(0.55,0.68,1.)*a,1.); }` });
  const lines = new THREE.LineSegments(lgeo, lmat); lines.frustumCulled = false; lines.renderOrder = -9; pts.add(lines);
  let lastJd = -1, eph = null; const mv = new THREE.Vector3(), tmp = [0, 0, 0];
  return { mesh: pts, moon: ENV.uMoon.value, // moon -- для проверок
    // X, Y -- где камера на карте; clock -- игровые часы; pr -- плотность пикселей экрана
    showLines(v) { U.uLines.value = v ? 1 : 0; },
    update(X, Y, clock, pr, t, day = 0) { const [lat, lon] = latLon(X, Y), jd = jdOf(day, clock); eqToThree(lat, gmst(jd) + lon, ENV.uEq.value); U.uPR.value = pr; U.uT.value = t; ENV.uNT.value = t;
      if (Math.abs(jd - lastJd) > 0.002) { lastJd = jd; eph = sky(jd); // эфемериды -- раз в ~3 игровые минуты, не каждый кадр
        PN.forEach((n, i) => { const p = eph.planets[n]; radec(p.ra, p.dec, tmp); pq.set(tmp, i * 3); pm[i * 2] = p.mag; pc.set(p.col, i * 3); }); pgeo.attributes.position.needsUpdate = true; pgeo.attributes.aMB.needsUpdate = pgeo.attributes.aCol.needsUpdate = true; }
      // Луна: геоцентрическая + суточный параллакс (~1°: у горизонта Луна ниже, чем в эфемериде)
      radec(eph.moon.ra, eph.moon.dec, tmp); mv.set(tmp[0], tmp[1], tmp[2]).applyMatrix3(ENV.uEq.value); mv.y -= 0.0166 * Math.sqrt(Math.max(0, 1 - mv.y * mv.y)); mv.normalize();
      ENV.uMoon.value.set(mv.x, mv.y, mv.z, eph.moon.k); } };
}
