// Модель яхты: спортивный килевой шлюп около 7 м. Корпус и палуба строятся как замкнутые поверхности по теоретическим
// обводам (без отдельных «коробок»): нос сходится в форштевень, палуба с рубкой и кокпитом -- одно полотно высот,
// транец закрыт по контуру. Плюс плавниковый киль с бульбом, перо руля, мачта с краспицами, ванты, леера, шкот.
import * as THREE from 'three';
import { clamp, smooth } from './sim.js';
import { makeDeckWater } from './deckwater.js';

const L0 = -3.55, LEN = 7.0, BMAX = 1.16;
const zAt = (s) => L0 + LEN * s;
// полуширина по палубе: острый нос, наибольшая ширина за миделем, к транцу слегка сужается
const beam = (s) => (s < 0.62 ? BMAX * Math.pow(Math.sin((Math.PI / 2) * (s / 0.62)), 0.72) : BMAX * (1 - 0.13 * ((s - 0.62) / 0.38) ** 2));
const sheer = (s) => 0.76 + 0.24 * (1 - s) ** 2;                       // линия борта: нос выше кормы
const keelY = (s) => -(0.05 + 0.27 * Math.pow(Math.sin(Math.PI * clamp((s + 0.03) / 1.06, 0, 1)), 0.75)); // днище
// палуба: погибь, рубка, кокпит, открытый в корму
function deckY(s, x) {
  const ax = Math.abs(x), B = Math.max(beam(s), 1e-3), ys = sheer(s);
  const crown = 0.05 * (1 - (ax / B) ** 2);
  const cabW = 0.5 - 0.1 * smooth(0.42, 0.26, s);
  const cab = 0.31 * smooth(0.235, 0.33, s) * (1 - smooth(0.545, 0.575, s)) * (1 - smooth(cabW, cabW + 0.11, ax));
  const pit = 0.37 * smooth(0.60, 0.625, s) * (1 - smooth(0.60, 0.67, ax));
  return ys + crown + cab - pit;
}

// Геометрия: корпус (гладкий) и палуба с транцем (с чёткими гранями) -- отдельно. Цвета НЕ лежат в вершинах:
// между вершинами они размазывались в «мыло». Раскраску считает шейдер по координатам точки на лодке.
function hullAndDeck() {
  const NS = 48, NA = 14, pos = [], idx = [], ring = 2 * NA + 1;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, B = beam(s), ys = sheer(s), ky = keelY(s), z = zAt(s);
    const ex = 1.05 - 0.6 * smooth(0, 0.4, s); // у носа шпангоут V-образный, к миделю U-образный
    for (let j = 0; j < ring; j++) {
      const a = Math.abs(j - NA) / NA, side = j < NA ? -1 : 1; // a: 1 -- борт у палубы, 0 -- киль
      pos.push(side * B * Math.pow(Math.sin((a * Math.PI) / 2), ex), ky + (ys - ky) * Math.pow(a, 1.75 - 0.5 * smooth(0, 0.4, s)), z + 0.1 * (1 - a) * smooth(0.9, 1, s));
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < ring - 1; j++) { const p = i * ring + j, q = p + ring; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setIndex(idx); hull.computeVertexNormals();
  // палуба: одно полотно высот с рубкой и кокпитом
  const ND = 96, NT = 40, dp = [], di = [];
  for (let i = 0; i <= ND; i++) { const s = i / ND, B = beam(s), z = zAt(s);
    for (let k = 0; k <= NT; k++) { const x = ((k / NT) * 2 - 1) * B; dp.push(x, k === 0 || k === NT ? sheer(s) : deckY(s, x), z); } }
  for (let i = 0; i < ND; i++) for (let k = 0; k < NT; k++) { const p = i * (NT + 1) + k, q = p + NT + 1; di.push(p, q, p + 1, p + 1, q, q + 1); }
  // транец: веер от центра по замкнутому контуру «обвод корпуса + кромка палубы»
  const t0 = dp.length / 3; dp.push(0, 0.12, zAt(1) + 0.06); let n = 0;
  for (let j = 0; j < ring; j++, n++) { const v = (NS * ring + j) * 3; dp.push(pos[v], pos[v + 1], pos[v + 2] + 0.003); }
  for (let k = NT; k >= 0; k--, n++) { const v = (ND * (NT + 1) + k) * 3; dp.push(dp[v], dp[v + 1], dp[v + 2] + 0.003); }
  for (let i = 0; i < n; i++) di.push(t0, t0 + 1 + i, t0 + 1 + ((i + 1) % n));
  const deck = new THREE.BufferGeometry(); deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); deck.setIndex(di); deck.computeVertexNormals();
  return { hull, deck };
}

const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
// Борт -- гелькоут под лаком (отражает небо и воду), палуба -- матовая. Оба намокают: у борта тёмная блестящая полоса
// над ватерлинией «дышит» с волной, на палубе после удара волны остаются лужи, которые высыхают.
function paintMaterial(hullColor, accent, isDeck, wet) {
  const m = new THREE.MeshPhysicalMaterial(isDeck ? { roughness: 0.82, metalness: 0, flatShading: true, side: THREE.DoubleSide, envMapIntensity: 0.55 }
    : { roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, envMapIntensity: 1.7 });
  m.customProgramCacheKey = () => `paint-${isDeck}-${hullColor}-${accent}`; // цвета зашиты в текст шейдера: без ключа все лодки делили бы одну программу
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWetT = wet.time; sh.uniforms.uDeckW = { value: wet.dw.tex }; sh.uniforms.uHullW = { value: wet.dw.hullTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLoc; uniform float uWetT; uniform sampler2D uDeckW, uHullW; float gWet=0., gFilm=0.;
float beamF(float s){ return s<0.62 ? 1.16*pow(sin(1.5708*s/0.62),0.72) : 1.16*(1.-0.13*pow((s-0.62)/0.38,2.)); }
float bh(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float bn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(bh(i),bh(i+vec2(1,0)),f.x), mix(bh(i+vec2(0,1)),bh(i+vec2(1,1)),f.x), f.y); }
float sheerF(float s){ return 0.76+0.24*(1.-s)*(1.-s); }
vec3 paint(vec3 p){ float s=clamp((p.z+3.55)/7.,0.,1.), ax=abs(p.x), ys=sheerF(s); vec3 hullC=${lin(hullColor)};
  ${isDeck ? `
  if(p.z>3.447) return p.y<0. ? ${lin(0x10151d)} : hullC;                       // транец
  // вода на палубе берётся из расчётной карты: r -- слой текущей воды, g -- влажность (см. deckwater.js)
  vec2 dw=texture2D(uDeckW, vec2(s, clamp(p.x/max(beamF(s),0.05)*0.5+0.5,0.,1.))).rg; gFilm=dw.r;
  float pud=bn(p.xz*5.)*0.5+bn(p.xz*13.)*0.5; gWet=clamp(max(dw.g*smoothstep(0.75-dw.g*0.75,1.05-dw.g*0.75,pud+0.35), smoothstep(0.02,0.10,dw.r)),0.,1.); // подсыхает пятнами
  if(s>0.612 && ax<0.66 && p.y<ys-0.04){                                         // кокпит
    if(p.y<ys-0.27 && ax<0.40 && s>0.655) return ${lin(0xa98a5e)}*(fract(p.x*13.)<0.09 ? 0.55 : 1.)*(0.93+0.07*fract(sin(floor(p.x*13.)*91.7)*43.)); // тиковый настил с пазами
    return ${lin(0xdcd9cf)}; }
  if(p.y>ys+0.085){                                                              // рубка
    if(s>0.355 && s<0.525 && ax>0.455 && p.y>ys+0.115 && p.y<ys+0.255){ return ${lin(0x06090d)}; } // окна -- тёмное стекло
    return ${lin(0xebe8de)}; }
  float grip=step(0.5,fract(p.x*38.+floor(p.z*38.)*0.5))*0.04;                   // нескользящее покрытие
  return ${lin(0xc4c7c4)}*(0.97+grip);` : `
  if(p.y<0.) return ${lin(0x10151d)};                                            // подводная часть
  // борт мокрый до высоты, куда здесь недавно доставала вода; кромка неровная, с потёками
  float wl=texture2D(uHullW, vec2((s-0.14)/0.76*0.8333+0.0833, p.x<0. ? 0.25 : 0.75)).r*1.1+0.05*(bn(vec2(p.z*9.,3.))-0.5);
  gWet=smoothstep(wl+0.05, wl-0.03, p.y)*0.9;
  if(p.y<0.055) return ${lin(accent)};                                           // ватерлиния
  if(p.y>ys-0.05) return ${lin(0x23262b)};                                       // привальный брус
  if(p.y>ys-0.105 && p.y<ys-0.085 && s>0.06) return ${lin(accent)};              // тонкая декоративная линия вдоль борта
  return hullC;`}
}`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = paint(vLoc);
${isDeck ? `// текущая вода: тонкий слой бликует, толстый несёт пену
if(vLoc.z<3.44 && gFilm>0.01){ float lc=1.-abs(2.*bn(vLoc.xz*7.+uWetT*0.6)-1.), lc2=1.-abs(2.*bn(vLoc.xz*15.-uWetT*0.4)-1.);
  float fm=smoothstep(0.16,0.55,gFilm)*smoothstep(0.35,0.8,lc*0.65+lc2*0.45+gFilm*0.5);
  diffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.62,0.80,0.86), smoothstep(0.03,0.3,gFilm)*0.35); diffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.97,0.99,1.), fm*0.85); gWet*=1.-fm; }` : ''}
diffuseColor.rgb *= mix(vec3(1.), vec3(0.52,0.57,0.62), gWet);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.05, gWet);');
  };
  return m;
}

// крыло (киль, руль): симметричный профиль, сужение книзу
function foil(cTop, cBot, yTop, yBot, thick, zLE) {
  const NP = 14, NSpan = 6, pos = [], idx = [];
  for (let i = 0; i <= NSpan; i++) { const u = i / NSpan, ch = cTop + (cBot - cTop) * u, y = yTop + (yBot - yTop) * u, z0 = zLE + (cTop - ch) * 0.35;
    for (let j = 0; j < NP * 2; j++) { const a = j < NP ? j / (NP - 1) : 1 - (j - NP) / (NP - 1), sd = j < NP ? 1 : -1;
      const t = 5 * thick * (0.2969 * Math.sqrt(a) - 0.126 * a - 0.3516 * a * a + 0.2843 * a ** 3 - 0.1036 * a ** 4);
      pos.push(sd * t * ch, y, z0 + a * ch); } }
  const R = NP * 2; for (let i = 0; i < NSpan; i++) for (let j = 0; j < R; j++) { const p = i * R + j, q = i * R + ((j + 1) % R); idx.push(p, q, p + R, q, q + R, p + R); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function sailTexture(accent, text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d'); g.scale(2, 2);
  const gr = g.createLinearGradient(0, 0, 256, 512); gr.addColorStop(0, '#f4f2ea'); gr.addColorStop(1, '#e6e3d8'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  // силовые нити расходятся из шкотового, галсового и фалового углов -- так кроят гоночные паруса
  g.lineWidth = 0.5;
  for (const [cx, cy, n, col] of [[256, 512, 46, 'rgba(120,105,70,0.20)'], [0, 512, 30, 'rgba(120,105,70,0.14)'], [20, 0, 34, 'rgba(120,105,70,0.16)']]) {
    g.strokeStyle = col; for (let i = 0; i < n; i++) { const a = (i / (n - 1)) * Math.PI * 0.5 + (cx ? Math.PI : cy ? -Math.PI / 2 : 0.15); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 700, cy + Math.sin(a) * 700 * (cy ? 1 : -1) * (cy ? 1 : -1)); g.stroke(); } }
  g.strokeStyle = 'rgba(90,100,120,0.28)'; g.lineWidth = 1;
  for (let i = 1; i < 11; i++) { g.beginPath(); g.moveTo(0, i * 47); g.lineTo(256, i * 47 - 20); g.stroke(); } // швы полотнищ
  g.strokeStyle = 'rgba(40,46,58,0.6)'; g.lineWidth = 3.2; for (const y of [150, 250, 350, 440]) { g.beginPath(); g.moveTo(34, y + 8); g.lineTo(256, y - 14); g.stroke(); } // латы
  g.fillStyle = 'rgba(40,46,58,0.5)'; g.fillRect(0, 0, 5, 512); g.fillRect(250, 0, 6, 512); // ликтрос и усиление задней шкаторины
  g.fillStyle = accent; g.beginPath(); g.moveTo(0, 300); g.lineTo(256, 282); g.lineTo(256, 306); g.lineTo(0, 324); g.fill(); g.beginPath(); g.moveTo(0, 331); g.lineTo(256, 313); g.lineTo(256, 320); g.lineTo(0, 338); g.fill();
  g.fillStyle = '#16233a'; g.font = '800 40px sans-serif'; g.textAlign = 'center'; g.fillText(text, 104, 244);
  g.fillStyle = 'rgba(150,175,200,0.55)'; g.fillRect(60, 462, 110, 26); g.strokeStyle = 'rgba(40,46,58,0.5)'; g.lineWidth = 1; g.strokeRect(60, 462, 110, 26); // окно в нижней части грота
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// ткань паруса: матовая, просвечивает на солнце с обратной стороны
function clothMaterial(tex, rough = 0.78, glow = 0.42) {
  const m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: rough, metalness: 0, envMapIntensity: 0.45 });
  m.customProgramCacheKey = () => 'cloth-' + glow;
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
  reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * (${glow.toFixed(2)} * RECIPROCAL_PI * saturate(dot(-normal, directionalLights[0].direction)));
#endif`); };
  return m;
}

const NU = 10, NV = 15;
function sailMesh(mat) {
  const g = new THREE.BufferGeometry(), n = NU * NV, uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { uv[(j * NU + i) * 2] = i / (NU - 1); uv[(j * NU + i) * 2 + 1] = j / (NV - 1); }
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) { const a = j * NU + i; idx.push(a, a + 1, a + NU, a + 1, a + NU + 1, a + NU); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; return m;
}

export function makeBoat(opts = {}) {
  const hullColor = opts.hull ?? 0xf4f3ee, accent = opts.accent ?? '#c8372d';
  const wet = { time: { value: 0 }, dw: makeDeckWater() };
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt); root.rotation.order = 'YXZ';
  const lam = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, envMapIntensity: 0.5 }), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const steel = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.16, metalness: 1 });                       // полированная нержавейка
  const spar = new THREE.MeshPhysicalMaterial({ color: 0x121417, roughness: 0.38, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.2 }); // углепластик под лаком
  const hd = hullAndDeck(); tilt.add(new THREE.Mesh(hd.hull, paintMaterial(hullColor, accent, false, wet)), new THREE.Mesh(hd.deck, paintMaterial(hullColor, accent, true, wet)));
  // плавниковый киль с бульбом, перо руля
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.45, side: THREE.DoubleSide });
  tilt.add(new THREE.Mesh(foil(0.78, 0.5, -0.24, -1.36, 0.11, -0.55), dark));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), dark); bulb.scale.set(0.15, 0.14, 0.7); bulb.position.set(0, -1.42, -0.05); tilt.add(bulb);
  const rudder = new THREE.Group(); rudder.position.set(0, 0, 2.95); tilt.add(rudder);
  rudder.add(new THREE.Mesh(foil(0.34, 0.2, -0.05, -1.08, 0.12, -0.09), new THREE.MeshStandardMaterial({ color: 0xe4e4e0, roughness: 0.3, side: THREE.DoubleSide })));
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.75, 8), steel); stock.position.y = 0.3; rudder.add(stock);
  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 1.25, 8), new THREE.MeshPhysicalMaterial({ color: 0x8a5a2b, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.1 })); // лакированный ясень tiller.rotation.x = Math.PI / 2 + 0.1; tiller.position.set(0, 0.74, -0.62); rudder.add(tiller);
  // мачта, гик, краспицы
  const MZ = -0.75, MH = 10.2, MB = 1.1;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.062, MH, 10), spar); mast.position.set(0, MH / 2 + MB, MZ); tilt.add(mast);
  const boomG = new THREE.Group(); boomG.position.set(0, 1.95, MZ); tilt.add(boomG);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 3.45, 8), spar); boom.rotation.x = Math.PI / 2; boom.position.z = 1.74; boomG.add(boom);
  for (const sd of [-1, 1]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.62, 6), spar); sp.rotation.z = Math.PI / 2; sp.rotation.y = -sd * 0.28; sp.position.set(sd * 0.3, 6.1, MZ + 0.08); tilt.add(sp); }
  // стоячий такелаж
  const cp = (sd) => V(sd * 1.04, sheer(0.42), MZ + 0.32), tip = (sd) => V(sd * 0.6, 6.1, MZ + 0.17);
  const rig = [V(0, 9.35, MZ - 0.03), V(0, sheer(0) + 0.02, L0 + 0.06), V(0, MH + MB - 0.05, MZ + 0.04), V(0, sheer(1) + 0.02, zAt(1) - 0.02)];
  for (const sd of [-1, 1]) rig.push(cp(sd), tip(sd), tip(sd), V(0, 9.35, MZ), cp(sd), V(0, 5.9, MZ));
  tilt.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rig), new THREE.LineBasicMaterial({ color: 0x4a5058 })));
  // носовой и кормовые релинги, леерные стойки и леера
  const tube = (pts, r = 0.013) => tilt.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6), steel));
  const sb = sheer(0.07);
  tube([V(-0.42, sheer(0.13), zAt(0.13)), V(-0.36, sb + 0.52, zAt(0.09)), V(-0.1, sb + 0.58, zAt(0.015)), V(0.1, sb + 0.58, zAt(0.015)), V(0.36, sb + 0.52, zAt(0.09)), V(0.42, sheer(0.13), zAt(0.13))]);
  const life = [];
  for (const sd of [-1, 1]) {
    const xs = sd * (beam(0.97) - 0.04), ys = sheer(0.95);
    tube([V(sd * (beam(0.86) - 0.05), sheer(0.86), zAt(0.86)), V(sd * (beam(0.87) - 0.05), ys + 0.52, zAt(0.875)), V(xs, ys + 0.54, zAt(0.985)), V(xs, sheer(0.99), zAt(0.99))]);
    const tops = [V(sd * 0.36, sb + 0.52, zAt(0.09))];
    for (const s of [0.3, 0.5, 0.7]) { const p = V(sd * (beam(s) - 0.05), sheer(s), zAt(s)); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.54, 6), steel); st.position.set(p.x, p.y + 0.27, p.z); tilt.add(st); tops.push(V(p.x, p.y + 0.53, p.z)); }
    tops.push(V(sd * (beam(0.87) - 0.05), ys + 0.52, zAt(0.875)));
    for (let i = 0; i < tops.length - 1; i++) { life.push(tops[i], tops[i + 1]); life.push(tops[i].clone().setY(tops[i].y - 0.25), tops[i + 1].clone().setY(tops[i + 1].y - 0.25)); }
    // лебёдки на комингсах кокпита
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.13, 12), steel); w.position.set(sd * 0.8, sheer(0.68) + 0.1, zAt(0.68)); tilt.add(w);
  }
  tilt.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(life), new THREE.LineBasicMaterial({ color: 0xaab2ba })));
  // носовой люк и сдвижной люк рубки
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x0c1117, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }); // дымчатое стекло
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.46), smoke); hatch.position.set(0, deckY(0.17, 0) + 0.012, zAt(0.17)); hatch.rotation.x = -0.05; tilt.add(hatch);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.62), lam(0xd8d5cb)); slide.position.set(0, deckY(0.5, 0) + 0.012, zAt(0.5)); tilt.add(slide);
  // гика-шкот: живая снасть от нока гика к погону в кокпите
  const sheetG = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
  tilt.add(new THREE.Line(sheetG, new THREE.LineBasicMaterial({ color: 0xd9d2c0 })));
  // флюгарка на топе мачты показывает вымпельный ветер
  const vane = new THREE.Group(); vane.position.set(0, MH + MB + 0.12, MZ); tilt.add(vane);
  const va = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); va.rotation.x = Math.PI / 2; va.position.z = 0.25; vane.add(va);
  // приборы на переборке рубки
  for (const sd of [-1, 1]) { const pod = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.03), spar); pod.position.set(sd * 0.27, sheer(0.575) + 0.19, zAt(0.582)); tilt.add(pod);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: sd < 0 ? 0x9df2c0 : 0xffc56b })); scr.position.set(sd * 0.27, sheer(0.575) + 0.19, zAt(0.582) + 0.017); tilt.add(scr); }
  // кормовой флаг на ахтерштаге и колдунчики на вантах -- живые, по вымпельному ветру
  const flagTex = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#e8112d'; g.fillRect(0, 0, 96, 64); g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(48, 32, 13, 0, 7); g.fill();
    for (let i = 0; i < 20; i++) { const a = (i / 20) * 6.283; g.beginPath(); g.moveTo(48 + Math.cos(a - 0.1) * 15, 32 + Math.sin(a - 0.1) * 15); g.lineTo(48 + Math.cos(a) * 23, 32 + Math.sin(a) * 23); g.lineTo(48 + Math.cos(a + 0.1) * 15, 32 + Math.sin(a + 0.1) * 15); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flagG = new THREE.Group(); flagG.position.set(0, 2.25, zAt(1) - 0.32); tilt.add(flagG);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3, 8, 3), clothMaterial(flagTex, 0.7, 0.6)); flag.geometry.translate(0.25, 0, 0); flag.rotation.y = -Math.PI / 2; flagG.add(flag);
  const fp = flag.geometry.attributes.position, fz0 = Float32Array.from(fp.array);
  const tellG = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)]);
  tellG.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.15, 0.1, 1, 0.15, 0.1, 1, 0.15, 0.1, 1, 0.15, 0.1, 0.1, 0.9, 0.3, 0.1, 0.9, 0.3, 0.1, 0.9, 0.3, 0.1, 0.9, 0.3], 3));
  tilt.add(new THREE.LineSegments(tellG, new THREE.LineBasicMaterial({ vertexColors: true }))); const tp = tellG.attributes.position;
  const tex = sailTexture(accent, opts.text ?? 'KGZ 7'), cloth = clothMaterial(tex);
  const main = sailMesh(cloth), jib = sailMesh(cloth); tilt.add(main, jib);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const mp = main.geometry.attributes.position, jp = jib.geometry.attributes.position, shp = sheetG.attributes.position;
  let ft = Math.random() * 10;

  function update(b, dt, t) {
    root.position.set(b.X, b.y - 0.02 + (b.capsized ? -0.25 : 0), -b.Y);
    root.rotation.set(b.pitch * 0.9, -b.th, -b.phi);
    rudder.rotation.y = b.rudder * 0.6;
    boomG.rotation.y = b.boom; // гик: + на правый борт
    vane.rotation.y = -b.awa + Math.PI; // остриём к ветру
    shp.setXYZ(0, Math.sin(b.boom) * 2.9, 1.9, MZ + Math.cos(b.boom) * 2.9); shp.setXYZ(1, 0, sheer(0.8) - 0.3, zAt(0.8)); shp.needsUpdate = true;
    ft += dt * (14 + b.aws * 1.6);
    const luff = b.capsized ? 0 : b.luff, side = b.boom >= 0 ? 1 : -1, pw = clamp(b.aws / 9, 0.25, 1.2);
    const camber = (0.115 * (1 - luff) + 0.02) * side;
    for (let j = 0; j < NV; j++) { const v = j / (NV - 1), ang = b.boom * (1 + 0.28 * v), ch = 3.35 * Math.pow(1 - v, 0.72) * (1 + 0.1 * Math.sin(Math.PI * v)) + 0.14; // серп по задней шкаторине
      const sx = Math.sin(ang), cz = Math.cos(ang), y = 1.98 + v * 8.9;
      for (let i = 0; i < NU; i++) { const u = i / (NU - 1), d = u * ch;
        const bel = camber * ch * Math.sin(Math.PI * Math.pow(u, 0.8)) * pw + luff * 0.14 * ch * u * Math.sin(ft + u * 7 + v * 9);
        mp.setXYZ(j * NU + i, sx * d + cz * bel, y, MZ + 0.06 + cz * d - sx * bel); } }
    mp.needsUpdate = true; main.geometry.computeVertexNormals();
    // стаксель кончается перед мачтой, поэтому на повороте не проходит сквозь неё
    const ja = clamp(b.boom * 0.85, -0.62, 0.62), jsx = Math.sin(ja), jcz = Math.cos(ja), jy0 = sheer(0) + 0.12, jz0 = L0 + 0.12;
    for (let j = 0; j < NV; j++) { const v = j / (NV - 1), ly = jy0 + v * (9.2 - jy0), lz = jz0 + v * (MZ - 0.05 - jz0), ch = 2.5 * (1 - v) + 0.05;
      for (let i = 0; i < NU; i++) { const u = i / (NU - 1), d = u * ch;
        const bel = camber * 1.2 * ch * Math.sin(Math.PI * Math.pow(u, 0.75)) * pw + luff * 0.16 * ch * u * Math.sin(ft * 1.15 + u * 6 + v * 8 + 2);
        jp.setXYZ(j * NU + i, jsx * d + jcz * bel, ly + u * 0.1 * (1 - v), lz + jcz * d - jsx * bel); } }
    jp.needsUpdate = true; jib.geometry.computeVertexNormals();
    // флаг и колдунчики тянутся по вымпельному ветру и трепещут
    flagG.rotation.y = -b.awa; const fa = clamp(b.aws / 8, 0.15, 1);
    for (let i = 0; i < fp.count; i++) { const x = fz0[i * 3]; fp.setZ(i, Math.sin(ft * 1.3 - x * 11) * 0.05 * (x / 0.46) * (0.4 + fa)); fp.setY(i, fz0[i * 3 + 1] - (1 - fa) * x * 0.5); }
    fp.needsUpdate = true; flag.geometry.computeVertexNormals();
    const dx = -Math.sin(b.awa), dz = Math.cos(b.awa);
    for (let k = 0; k < 2; k++) { const sd = k ? 1 : -1, bx = sd * 0.86, by = 3.1, bz = MZ + 0.27, w1 = Math.sin(ft * 1.7 + k * 2) * 0.05, w2 = Math.sin(ft * 2.3 + k) * 0.09, dr = (1 - fa) * 0.3;
      tp.setXYZ(k * 4, bx, by, bz); tp.setXYZ(k * 4 + 1, bx + dx * 0.2 + dz * w1, by - dr * 0.2, bz + dz * 0.2 - dx * w1); tp.setXYZ(k * 4 + 2, bx + dx * 0.2 + dz * w1, by - dr * 0.2, bz + dz * 0.2 - dx * w1); tp.setXYZ(k * 4 + 3, bx + dx * 0.42 + dz * w2, by - dr * 0.5, bz + dz * 0.42 - dx * w2); }
    tp.needsUpdate = true; wet.time.value = t;
  }
  return { root, update, water: wet.dw };
}
