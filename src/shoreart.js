// Берег Чолпон-Аты в стиле комикса по данным OpenStreetMap (shoredata.js).
// Всё -- плоские спрайты, повёрнутые к зрителю вокруг вертикали (2 треугольника на предмет): дома с цветными жестяными
// крышами и окнами (ночью часть окон светится), тополиные аллеи вдоль улиц, круглые кроны во дворах и парках, плодовые
// сады, ели, кусты, пляжные зонтики. Форма каждого спрайта -- набор простых фигур с расстоянием до края, поэтому у всех
// свой тонкий контур пером (тоньше в пикселе, чем обводка силуэтов) и внутренние линии: конёк, окна, ствол.
// Урез озера и дороги -- тушью, тем же пером, что гребни гор (ridges.js): тонкая линия постоянной толщины на экране.
import * as THREE from 'three';
import { HOUSES, TREES, ROADS } from './shoredata.js';
import { ROAD_ASPHALT, ROAD_DIRT } from './roaddata.js';
import { FOREST_PTS } from './forestdata.js';
import { CURVE, END, ENV, GLSL_COMMON } from './world.js';
import { makeInk, inkMaterial, INK_U } from './ridges.js';

export const i16 = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Int16Array(u.buffer); };
// вид: 0 тополь, 1 круглая крона, 2 плодовое, 3 ель, 4 куст, 5 зонтик, 6 дом
const TREE_SHAPE = [[0.3, 16, 4], [0.95, 9, 3], [0.95, 5.5, 2], [0.42, 13, 4], [1.7, 2.2, 1], [1.1, 2.6, 0.3]]; // ширина/высота, высота м, разброс м

function spriteMaterial() {
  return new THREE.ShaderMaterial({ defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4, LOW: 1 }, uniforms: { ...ENV, uRes: INK_U.uRes }, extensions: { derivatives: true },
    vertexShader: CURVE + /* glsl */`uniform vec3 uSun; uniform vec2 uRes; attribute vec4 aK; varying vec2 vU; varying vec4 vK; varying vec3 vW; varying float vSide, vFront, vE, vAsp;
void main(){ vec3 c=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz; float sx=length(instanceMatrix[0].xyz), sy=length(instanceMatrix[1].xyz);
  vec3 d=cameraPosition-c; vec2 h=normalize(d.xz+1e-4); vec3 r=vec3(h.y,0.,-h.x);
  // мельче 1.6 пикселя на экране -- не рисуем: вдали деревья и дома сливаются в полосу берега, а пиксели стоят дорого
  if(sy*projectionMatrix[1][1]*0.5*uRes.y/max(length(d),1.)<1.6){ gl_Position=vec4(2.,2.,2.,1.); return; }
  vec3 p=c+r*position.x*sx+vec3(0.,position.y*sy,0.);
  vU=vec2(position.x*2., position.y); vK=aK; vW=p; vAsp=0.5*sx/sy; // полуширина в долях высоты vSide=dot(r,uSun); vFront=dot(vec3(h.x,0.,h.y),uSun);
  vE=clamp(0.5*sx*abs(d.y)/max(length(d),1.)/sy, 0.012, 0.09);          // основание конуса/кроны в перспективе
  p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: GLSL_COMMON + /* glsl */`varying vec2 vU; varying vec4 vK; varying vec3 vW; varying float vSide, vFront, vE, vAsp;
float hs(float n){ return fract(sin(n*12.9898+vK.y*78.233)*43758.5453); }
float sdBox(vec2 p, vec2 c, vec2 b){ vec2 d=abs(p-c)-b; return length(max(d,0.))+min(max(d.x,d.y),0.); }
float sdCirc(vec2 p, vec2 c, float r){ return length(p-c)-r; }
// равнобедренный треугольник: основание на y0 полушириной w, вершина на y1
float sdTri(vec2 p, float y0, float y1, float w){ float t=clamp((p.y-y0)/(y1-y0),0.,1.); float hw=w*(1.-t); float dx=abs(p.x)-hw; float k=(y1-y0)/w;
  return max(dx/sqrt(1.+1./(k*k)), max(y0-p.y, p.y-y1)); }
vec3 pal(float i, vec3 a, vec3 b, vec3 c, vec3 d){ return i<0.25?a:i<0.5?b:i<0.75?c:d; }
void main(){
  float kind=vK.x, sd=1e9, inner=1e9; vec3 col=vec3(0.), em=vec3(0.); float lam=0.5+0.5*vSide;
  vec2 p=vec2(vU.x*vAsp, vU.y);                                   // в единицах высоты спрайта: x -- от -asp до +asp
  if(kind<0.5){ // тополь: конус и эллиптическое основание
    float yb=0.04, t=(p.y-yb)/(1.-yb), w=vAsp; sd=sdTri(p, yb, 1., w); float base=length(vec2(p.x/w,(p.y-yb)/vE))-1.; if(p.y<yb) sd=min(sd, base*min(w,vE));
    float nx=clamp(p.x/max(w*(1.-max(t,0.)),1e-3),-1.,1.); lam=0.5+0.5*(nx*vSide+sqrt(1.-nx*nx)*max(vFront,-0.3));
    col=mix(vec3(0.12,0.27,0.09),vec3(0.3,0.48,0.15),hs(1.))*(0.55+1.2*lam)*(p.y<yb?0.62:1.); }
  else if(kind<2.5){ // круглая крона (кучевое облако из трёх кругов) и плодовое дерево поменьше
    bool fr=kind>1.5; float R=fr?0.33:0.3; vec2 c0=vec2(0.,fr?0.58:0.62);
    float cr=min(min(sdCirc(p,c0,R), sdCirc(p,c0+vec2(-0.22,-0.08)*(fr?0.9:1.),R*0.72)), sdCirc(p,c0+vec2(0.22,-0.06),R*0.75));
    float tr=sdBox(p,vec2(0.,0.15),vec2(0.045,0.17)); sd=min(cr,tr); inner=cr;
    vec2 q=(p-c0)/R; float nl=0.5+0.5*clamp(q.x*vSide+0.5*q.y+0.3,-1.,1.);
    if(cr<0.){ col=(fr?vec3(0.28,0.5,0.16):mix(vec3(0.14,0.32,0.11),vec3(0.24,0.42,0.13),hs(2.)))*(0.6+1.1*nl)*(0.85+0.3*hs(floor(p.x*9.)+floor(p.y*9.)*7.));
      if(fr && hs(floor(p.x*16.)*3.+floor(p.y*16.)*11.)>0.8) col=mix(vec3(0.95,0.45,0.15),vec3(0.9,0.2,0.15),hs(3.)); }       // урюк и яблоки
    else col=vec3(0.36,0.25,0.16); }
  else if(kind<3.5){ // ель: три яруса треугольников
    sd=min(min(sdTri(p,0.08,0.55,vAsp), sdTri(p,0.3,0.8,vAsp*0.78)), sdTri(p,0.52,1.,vAsp*0.55)); sd=min(sd, sdBox(p,vec2(0.,0.04),vec2(0.04,0.06)));
    col=vec3(0.07,0.2,0.12)*(0.6+1.2*(0.5+0.5*clamp(p.x/vAsp*vSide,-1.,1.))); }
  else if(kind<4.5){ // куст: полуэллипс на земле
    vec2 q=vec2(p.x/vAsp, p.y/0.9); sd=(length(q)-1.)*0.9; if(p.y<0.) sd=max(sd,-p.y);
    col=vec3(0.24,0.38,0.14)*(0.6+1.1*(0.5+0.5*q.x*vSide)); }
  else if(kind<5.5){ // пляжный зонтик: купол в полоску на шесте
    vec2 q=vec2(p.x/vAsp, (p.y-0.72)/0.28); float dome=max(length(q)-1., -q.y)*0.28; float pole=sdBox(p,vec2(0.,0.36),vec2(0.018,0.36));
    sd=min(dome,pole); inner=dome; float st=step(0.5,fract(atan(q.x, max(q.y,0.05)*2.)*1.6+0.5));
    vec3 c1=pal(hs(4.), vec3(0.9,0.2,0.18), vec3(0.15,0.4,0.85), vec3(0.98,0.75,0.15), vec3(0.1,0.6,0.5));
    col= dome<0. ? mix(c1, vec3(0.97,0.95,0.9), st)*(0.75+0.4*(0.5+0.5*q.x*vSide)) : vec3(0.85,0.85,0.8); }
  else { // дом: стены, крыша (двускатная у малых, плоская у больших), окна по этажам; ночью часть окон тёплым светом
    float fl=vK.z, rf=vK.w, wy=1.-rf, w=vAsp; float walls=sdBox(p,vec2(0.,wy*0.5),vec2(w,wy*0.5));
    float roof=rf>0.01 ? sdTri(p, wy-0.02, 1., w*1.08) : 1e9; sd=min(walls,roof); inner=walls;
    vec3 wc=pal(hs(5.), vec3(0.95,0.93,0.87), vec3(0.94,0.87,0.7), vec3(0.9,0.79,0.62), vec3(0.85,0.9,0.93));
    vec3 rc=pal(hs(6.), vec3(0.22,0.42,0.72), vec3(0.18,0.55,0.42), vec3(0.72,0.24,0.2), vec3(0.55,0.57,0.6));
    if(walls<0.){ col=wc*(0.72+0.45*lam);
      // окна: сетка по этажам, шаг ~3.4 м по ширине
      float rows=fl, cols=max(1.,floor(w*2.*(1./(wy/rows))*0.9)); vec2 g=vec2((p.x/w*0.5+0.5)*cols, p.y/wy*rows); vec2 cell=floor(g), f=fract(g)-vec2(0.5,0.45);
      float win=sdBox(f,vec2(0.),vec2(0.24,0.22)); if(win<0. && cell.y<rows){ float lit=step(0.62,hs(cell.x*7.1+cell.y*13.7)); col=vec3(0.16,0.3,0.45)+0.1*step(0.12,f.y); em=vec3(1.,0.78,0.4)*1.3*lit*smoothstep(0.6,0.15,uDay); }
      inner=min(abs(walls), abs(win)+1.); }
    else col=rc*(0.6+0.6*(rf>0.01 ? 0.5+0.5*clamp(p.x/w*vSide*2.,-1.,1.) : lam)); }
  if(sd>0.) discard;
  // контур пером: толщина ~1 пиксель по расстоянию до края; внутренние линии (конёк, окна, ствол) -- бледнее
  float fw=fwidth(sd)*1.1, edge=1.-smoothstep(fw*0.6, fw*1.6, -sd);
  float fi=fwidth(inner)*1.1, ln=inner<1e8 ? (1.-smoothstep(fi*0.4, fi*1.3, abs(inner)))*0.45 : 0.;
  col=mix(col, vec3(0.04,0.05,0.07), max(edge*0.85, ln));
  col*=mix(0.08,1.,uDay)*mix(1.,0.75,uStorm);
  col+=em; // окна светятся сами, ночью их не гасит
  gl_FragColor=vec4(applyFog(col, length(vW-cameraPosition), vW.y),1.);` + END + '}' });
}

function shadowMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { ...ENV, uRes: INK_U.uRes }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: CURVE + /* glsl */`uniform vec3 uSun; uniform vec2 uRes; attribute vec3 aN; varying vec2 vU; varying float vF;
void main(){ vec3 c=(instanceMatrix*vec4(0.,0.,0.,1.)).xyz; float sx=length(instanceMatrix[0].xyz), sy=length(instanceMatrix[1].xyz), dist=length(cameraPosition-c);
  if(sy*projectionMatrix[1][1]*0.5*uRes.y/max(dist,1.)<2.5){ gl_Position=vec4(2.,2.,2.,1.); return; }
  vec3 n=normalize(aN), sd=normalize(vec3(-uSun.x,0.,-uSun.z)+1e-4); vec3 t1=normalize(sd-n*dot(sd,n)), t2=cross(n,t1);
  float L=clamp(sy*0.55*length(uSun.xz)/max(uSun.y,0.12), sx*0.7, sx*3.2);           // длина тени -- от высоты солнца
  vec3 p=c+n*0.12+t1*(position.y*L+L*0.5-sx*0.25)+t2*position.x*sx*0.95;
  vU=position.xy*2.; vF=1.-smoothstep(5000.,14000.,dist);
  p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: /* glsl */`uniform float uSunI, uStorm, uDay; varying vec2 vU; varying float vF;
void main(){ float d=length(vU), a=(1.-smoothstep(0.55,1.,d))*0.32*uSunI*(1.-uStorm)*smoothstep(0.2,0.6,uDay)*vF; if(a<0.01) discard; gl_FragColor=vec4(0.08,0.1,0.18,a); }` });
}

// полотна дорог Чолпон-Аты (OpenStreetMap, tools/town-roads.mjs): асфальт и грунтовки лентами по рельефу. Точки -- через ~8 м,
// чтобы лента повторяла склон; высота -- рельеф + 0.15 м и сдвиг глубины к камере (не тонет в сетке рельефа).
// Кривизна Земли -- та же, что у рельефа и домов (CURVE): вдали полотно не повисает над землёй
function roadSurface(str, h, color, lift) { const pos = [], idx = []; let n = 0;
  for (const s of str.split(';')) { const [w2, rest] = s.split(':'), v = rest.split(',').map(Number), w = +w2 / 4, P = [];
    for (let i = 0; i + 1 < v.length; i += 2) P.push([v[i] * 2, v[i + 1] * 2]); if (P.length < 2) continue;
    const Q = [P[0]]; for (let i = 1; i < P.length; i++) { const [a, b] = Q[Q.length - 1], [c, d] = P[i], L = Math.hypot(c - a, d - b), k = Math.ceil(L / 8); for (let j = 1; j <= k; j++) Q.push([a + (c - a) * j / k, b + (d - b) * j / k]); }
    let prev = false; // над водой (пирсы, ошибки привязки у уреза) полотно не кладём -- иначе «тени» под водой у берега
    for (let i = 0; i < Q.length; i++) { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w, [X, Y] = Q[i];
      const dry = h(X + nx, Y + ny) > 0.3 && h(X - nx, Y - ny) > 0.3; if (!dry) { prev = false; continue; }
      for (const sg of [1, -1]) { const x = X + nx * sg, y = Y + ny * sg; pos.push(x, h(x, y) + lift, -y); }
      if (prev) idx.push(n - 2, n, n - 1, n - 1, n, n + 1); n += 2; prev = true; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  const m = new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = CURVE + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y -= curve(transformed);'); };
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 0; mesh.receiveShadow = true; return mesh; }

export function makeShoreArt(scene, h) {
  const g = new THREE.Group(), H = i16(HOUSES), T = i16(TREES), nH = H.length / 6, nT = T.length / 4;
  const geo = new THREE.PlaneGeometry(1, 1.06); geo.translate(0, 0.47, 0); // по высоте от -0.06 (низ эллипса) до 1
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [];
  for (let i = 0; i < nT; i++) { const X = T[i * 4] / 2, Y = T[i * 4 + 1] / 2, k = T[i * 4 + 2], s = T[i * 4 + 3] / 100, y = h(X, Y); if (k === 5 ? y < 0.25 : y < 0.8) continue;
    const [asp, hh, dv] = TREE_SHAPE[k], ht = (hh + (rnd() - 0.5) * 2 * dv) * s; rows.push([X, y - 0.25, Y, asp * ht, ht, k, rnd(), 0, 0]); }
  // лес и кустарник предгорий (OSM): те же спрайты, что у деревьев города
  { const F = i16(FOREST_PTS); for (let i = 0; i < F.length; i += 4) { const X = F[i] * 2, Y = F[i + 1] * 2, k = F[i + 2], s = F[i + 3] / 100, y = h(X, Y); if (y < 2) continue;
      const [asp, hh, dv] = TREE_SHAPE[k], ht = (hh + (rnd() - 0.5) * 2 * dv) * s * (k === 3 ? 1.35 : 1); rows.push([X, y - 0.25, Y, asp * ht, ht, k, rnd(), 0, 0]); } }
  for (let i = 0; i < nH; i++) { const X = H[i * 6] / 2, Y = H[i * 6 + 1] / 2, w = H[i * 6 + 2] / 10, d = H[i * 6 + 3] / 10, fl = H[i * 6 + 4], y = h(X, Y); if (y < 0.5) continue;
    const face = Math.min(60, (w + d) * 0.55), wallH = fl * 3.1 + 0.8, roofH = fl <= 2 ? Math.min(5, Math.max(1.6, face * 0.32)) : 0, ht = wallH + roofH;
    rows.push([X, y - 0.8, Y, face / 2 * 2, ht, 6, rnd(), fl, roofH / ht]); }
  // участки по 1.5 км -- свои наборы экземпляров: что за спиной и вне кадра, не рисуется вовсе
  const mat = spriteMaterial(), tiles = new Map(), sprites = new THREE.Group();
  for (const r of rows) { const k = Math.floor(r[0] / 1500) * 1000 + Math.floor(r[2] / 1500); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(r); }
  for (const tr of tiles.values()) { const tg = geo.clone(), mesh = new THREE.InstancedMesh(tg, mat, tr.length), aK = new Float32Array(tr.length * 4);
    tr.forEach((r, i) => { pos.set(r[0], r[1], -r[2]); scl.set(r[3], r[4], 1); m4.compose(pos, q, scl); mesh.setMatrixAt(i, m4); aK.set([r[5], r[6] * 100, r[7], r[8]], i * 4); });
    tg.setAttribute('aK', new THREE.InstancedBufferAttribute(aK, 4)); mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 60; sprites.add(mesh); }
  // тени: плоский овал на склоне под каждым предметом, вытянут от солнца (в полдень короткий), гаснет ночью и в шторм.
  // Без них спрайты будто висят над землёй. Свой набор экземпляров на участок, рисуется после рельефа, глубину не пишет
  const smat = shadowMaterial(), N = new THREE.Vector3(), sgeo = new THREE.PlaneGeometry(1, 1);
  for (const tr of tiles.values()) { const mesh = new THREE.InstancedMesh(sgeo.clone(), smat, tr.length), aN = new Float32Array(tr.length * 3);
    tr.forEach((r, i) => { pos.set(r[0], r[1] + (r[5] === 6 ? 0.8 : 0.25), -r[2]); scl.set(r[3], r[4], 1); m4.compose(pos, q, scl); mesh.setMatrixAt(i, m4);
      const e = 3, X = r[0], Y = r[2]; N.set(h(X - e, Y) - h(X + e, Y), 2 * e, -(h(X, Y - e) - h(X, Y + e))).normalize(); aN.set([N.x, N.y, N.z], i * 3); });
    mesh.geometry.setAttribute('aN', new THREE.InstancedBufferAttribute(aN, 3)); mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 60; mesh.renderOrder = 1; sprites.add(mesh); }
  g.add(sprites);
  g.add(roadSurface(ROAD_DIRT, h, 0x8c6a42, 0.12)); g.add(roadSurface(ROAD_ASPHALT, h, 0x4c4f55, 0.16)); // грунтовки, поверх -- асфальт
  // ---- тушь: урез (двойной: берег тёмным, полоса прибоя на воде светлым) и дороги
  const lines = (lv, x0, x1, y0, y1, st) => { const nx = Math.round((x1 - x0) / st), ny = Math.round((y1 - y0) / st), v = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = h(x0 + i * st, y0 + j * st);
    return isolines(v, nx + 1, ny + 1, lv).map((l) => l.map(([i, j]) => [x0 + i * st, y0 + j * st])); };
  const smooth = (l) => { const o = [l[0]]; for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(l[l.length - 1]); return o; };
  const sig = (a) => (l) => l.map(([x, y]) => [x, y, a]);
  const coast = lines(0.15, -15000, 11000, -2500, 3500, 14).filter((l) => l.length > 6).map(smooth).map(sig(1e9));
  const surf = lines(-0.9, -15000, 11000, -2500, 3500, 14).filter((l) => l.length > 6).map(smooth).map(sig(1e9));
  g.add(makeInk(coast.map((pts) => ({ pts, h: () => 0.25 })), inkMaterial({ w: 0.95, a: 1 })));
  g.add(makeInk(surf.map((pts) => ({ pts, h: () => 0.1 })), inkMaterial({ col: [0.85, 0.95, 1.0], w: 0.8, a: 0.55, lift: 1.5 })));
  const RA = [2 ** 7.6, 2 ** 6.8, 2 ** 6.1]; // главные дороги видно дальше, улицы -- вблизи
  const rl = [[], [], []]; for (const s of ROADS.split(';')) { const [c, rest] = s.split(':'), n = rest.split(',').map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 2) { const X = n[i] * 2, Y = n[i + 1] * 2; if (h(X, Y) > 0.3) pts.push([X, Y, RA[+c]]); else if (pts.length) { if (pts.length > 1) rl[+c].push({ pts: pts.splice(0), h: (X2, Y2) => Math.max(0.3, h(X2, Y2)) + 0.3 }); else pts.length = 0; } } /* над водой линию рвём */ if (pts.length > 1) rl[+c].push({ pts, h: (X, Y) => Math.max(0.3, h(X, Y)) + 0.3 }); }
  rl.forEach((l, c) => g.add(makeInk(l, inkMaterial({ col: [0.32, 0.22, 0.12], w: c === 0 ? 1 : 0.8, a: c === 2 ? 0.45 : 0.6, lift: 1 }))));
  g.userData.count = rows.length; scene.add(g); return g;
}

// изолинии (марширующие квадраты), сшитые в линии; v -- сетка W x H, точки -- в индексах сетки
function isolines(v, W, H, lv) { const pos = new Map(), adj = new Map(), HE = (i, j) => 2 * (j * W + i), VE = (i, j) => 2 * (j * W + i) + 1, out = [];
  const cross = (id, v0, v1, i0, j0, i1, j1) => { if ((v0 < lv) === (v1 < lv)) return -1; if (!pos.has(id)) { const t = (lv - v0) / (v1 - v0); pos.set(id, [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t]); } return id; };
  const link = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) { let l = adj.get(x); if (!l) adj.set(x, (l = [])); l.push(y); } };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const A = v[j * W + i], B = v[j * W + i + 1], C = v[(j + 1) * W + i + 1], D = v[(j + 1) * W + i];
    if ((A < lv) === (B < lv) && (B < lv) === (C < lv) && (C < lv) === (D < lv)) continue;
    const e = [cross(HE(i, j), A, B, i, j, i + 1, j), cross(VE(i + 1, j), B, C, i + 1, j, i + 1, j + 1), cross(HE(i, j + 1), D, C, i, j + 1, i + 1, j + 1), cross(VE(i, j), A, D, i, j, i, j + 1)].filter((x) => x >= 0);
    if (e.length === 2) link(e[0], e[1]); else if (e.length === 4) { link(e[0], e[1]); link(e[2], e[3]); } }
  const used = new Set(), walk = (st) => { const pts = [pos.get(st)]; used.add(st); let cur = st; for (;;) { const nx = adj.get(cur).find((q) => !used.has(q)); if (nx === undefined) break; used.add(nx); pts.push(pos.get(nx)); cur = nx; } if (pts.length > 1) out.push(pts); };
  for (const [k, nb] of adj) if (!used.has(k) && nb.length === 1) walk(k); for (const k of adj.keys()) if (!used.has(k)) walk(k);
  return out; }
