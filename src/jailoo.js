// Джайлоо -- летние высокогорные пастбища. Летом кыргызские семьи поднимаются со скотом в горы: на пологих зелёных
// плечах хребтов, на 2200-3400 м, стоят юрты (боз үй), вокруг пасутся отары овец, табуны лошадей, повыше -- яки.
// Чабан в белом ак-калпаке объезжает отару верхом. Из тюндюка юрты тянется дымок.
//
// Как устроено:
//  * Стойбища расставляются один раз по карте высот (детерминированно): высота, пологость, не ближе 2 км друг к другу,
//    гуще -- у Чолпон-Аты и над стартами параплана, где игрок чаще всего пролетает низко.
//  * Вблизи -- пиксельные 2D-спрайты в стиле пляжных NPC и Дымка (jailooart.js), всегда лицом к камере; кадры
//    (пасётся, идёт, галоп) листает шейдер, процессор только двигает стадо. Все спрайты -- один вызов отрисовки.
//  * Издали -- точки: отара на дальнем склоне -- россыпь белых точек, как и видно в жизни. Точка не мельче полутора
//    пикселей и тает с расстоянием и в дымке.
//  * Стадо живёт только рядом с камерой (≈2 км), дальние стоят на месте -- их всё равно не разглядеть.
//  * Пролетел низко над отарой -- овцы шарахаются, табун уходит галопом.
import * as THREE from 'three';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';
import { makeJailooAtlas } from './jailooart.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const NAMES = ['Кок-Жайлоо', 'Ак-Булак', 'Кара-Суу', 'Сары-Булак', 'Таш-Төбө', 'Ак-Сай', 'Кашка-Суу', 'Беш-Таш', 'Кой-Сары', 'Тору-Айгыр', 'Ак-Кыя', 'Кызыл-Булак', 'Чон-Таш', 'Жыргал', 'Ала-Бел', 'Көк-Мойнок', 'Түп', 'Ак-Терек', 'Кара-Кыз', 'Уч-Булак', 'Бугу', 'Тегирмен', 'Сары-Жаз', 'Арча-Төр'];

// ---------- спрайты вблизи: один вызов отрисовки на всех ----------
// Каждое животное -- плоская пиксельная картинка, всегда повёрнутая к камере вокруг вертикали (низ на земле).
// Кадр анимации выбирает шейдер по времени: aS.z -- темп смены кадров, aS.w -- сдвиг фазы.
const SP_V = CURVE + `attribute vec4 aP; attribute vec4 aR; attribute vec4 aS; uniform float uTime; varying vec2 vUv; varying vec3 vP;
void main(){ vec3 c=aP.xyz; vec3 dir=c-cameraPosition; vec3 rt=normalize(vec3(-dir.z,0.,dir.x)+1e-4);
  vec3 p=c+rt*position.x*aP.w+vec3(0.,(position.y+0.5)*aS.x,0.); vP=p; p.y-=curve(p);
  float fr=aS.z>0. ? mod(floor(uTime*aS.z+aS.w),2.) : 0., u=position.x+0.5; if(aS.y>0.5) u=1.-u;
  vUv=vec2(aR.x+(u+fr)*aR.z, aR.y+(position.y+0.5)*aR.w);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const SP_F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP;
void main(){ vec4 t=texture2D(uMap,vUv); if(t.a<0.5) discard; vec3 c=t.rgb*(0.42+0.62*uSunI); c=applyFog(c,length(vP-cameraPosition),vP.y); gl_FragColor=vec4(c,1.); ${END} }`;
const U = { uTime: { value: 0 } };
function makeSprites(scene, tex, max) {
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aP', 'aR', 'aS']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); }
  geo.instanceCount = 0; const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex }, uTime: U.uTime }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: SP_V, fragmentShader: SP_F, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh); return { mesh, geo, at, max, n: 0 };
}

// ---------- дальние точки ----------
const PT_V = CURVE + `attribute vec3 aCol; attribute vec2 aSz; uniform float uScale; varying vec3 vC; varying vec3 vP; varying float vA;
void main(){ vec3 p=position; p.y+=aSz.x*0.5; vP=p; float d=length(p-cameraPosition); p.y-=curve(p);
  vec4 mv=viewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
  float px=aSz.x*uScale/max(d,1.); vA=smoothstep(aSz.y*0.85,aSz.y,d)*(1.-smoothstep(aSz.y*7.,aSz.y*9.,d));
  if(vA<0.01) gl_Position=vec4(2.,2.,2.,1.);
  gl_PointSize=clamp(px,1.6,7.); vA*=clamp(px/1.2,0.45,1.); vC=aCol; }`;
const PT_F = GLSL_COMMON + `varying vec3 vC; varying vec3 vP; varying float vA;
void main(){ vec2 q=gl_PointCoord-0.5; if(dot(q,q)>0.25) discard; vec3 c=vC*(0.5+0.55*uSunI); c=applyFog(c,length(vP-cameraPosition),vP.y); gl_FragColor=vec4(c,vA); ${END} }`;

export function makeJailoo({ G, scene, camera, toast, ach, store }) {
  const hV = G.hVis || G.h;
  // ---- где стоят стойбища: пологие зелёные плечи хребтов ----
  const camps = []; const r = rng(4242), FAR = G.far.userData.grid;
  const cand = [];
  for (let Y = FAR.Y1 - 3000; Y > FAR.Y1 - (FAR.H - 6) * FAR.STEP; Y -= 900) for (let X = FAR.X0 + 3000; X < FAR.X0 + (FAR.W - 6) * FAR.STEP; X += 900) {
    const x = X + (r() - 0.5) * 700, y = Y + (r() - 0.5) * 700, h = G.h(x, y); if (h < 650 || h > 1900) continue;
    const e = 250, sl = Math.hypot(G.h(x + e, y) - G.h(x - e, y), G.h(x, y + e) - G.h(x, y - e)) / (2 * e); if (sl > 0.2) continue;
    if (G.holes && G.holes.some((o) => Math.hypot(x - o.X, y - o.Y) < o.r + 300)) continue;
    const d = Math.hypot(x + 4000, y - 6000), w = (1 - sl / 0.2) * (0.25 + Math.exp(-d / 30000)) * (h > 900 && h < 1600 ? 1 : 0.6); cand.push({ x, y, h, w: w * r() }); }
  cand.sort((a, b) => b.w - a.w);
  for (const c of cand) { if (camps.length >= 90) break; if (camps.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 2600)) continue; camps.push(c); }
  // ---- состав стойбища ----
  // окрасы: номер варианта в атласе спрайтов (jailooart.js) и цвет точки издали
  const COATS = { sheep: ['#f6f1e6', '#efe2c4', '#9a6a45', '#4e3d36'], horse: ['#9a5530', '#b8692f', '#3a2e2c', '#c9c3b8', '#e0bb6e', '#7a4a36'], yak: ['#2c2422', '#5a3e2f', '#e6dccb'] };
  const HERDC = { sheep: [0, 0, 0, 0, 1, 1, 2, 3], yak: [0, 0, 1, 2] }; // у отары -- преобладающий окрас, белых и светлых больше
  const pick = (a, rr) => a[Math.floor(rr() * a.length)];
  const all = []; // все животные и юрты: { k: вид, x, y, th, ci: окрас, herd }
  camps.forEach((c, ci) => { const rr = rng(ci * 977 + 13); c.id = ci; c.name = NAMES[ci % NAMES.length]; c.herds = []; c.yurts = [];
    const ny = rr() < 0.15 ? 0 : 1 + Math.floor(rr() * 3), yaw0 = rr() * 6.28;
    for (let i = 0; i < ny; i++) { const a = yaw0 + i * 1.9, d = i ? 11 + rr() * 6 : 0, y = { k: 'yurt', x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, th: 0, ci: 0, sc: 1 }; c.yurts.push(y); all.push(y); }
    const herd = (kind, n, R, off) => { const a = rr() * 6.28, cx = c.x + Math.cos(a) * off, cy = c.y + Math.sin(a) * off, H = { kind, cx, cy, hx: cx, hy: cy, R, list: [], camp: c };
      const coat = kind === 'horse' ? 0 : pick(HERDC[kind], rr);
      for (let i = 0; i < n; i++) { const rad = R * Math.sqrt(rr()), b = rr() * 6.28, kk = kind === 'sheep' ? (i < 2 ? 'ram' : 'sheep') : kind === 'horse' ? 'horse' : kind;
        const t = kind === 'horse' ? Math.floor(rr() * COATS.horse.length) : rr() < 0.7 ? coat : pick(HERDC[kind], rr);
        const o = { k: kk, x: cx + Math.cos(b) * rad, y: cy + Math.sin(b) * rad, th: rr() * 6.28, ci: t, herd: H, sc: kind === 'horse' && rr() < 0.15 ? 0.62 : 0.9 + rr() * 0.2, ph: rr() * 6.28, st: 0, t: rr() * 8, tx: 0, ty: 0, v: 0, gr: 1, flee: 0 };
        H.list.push(o); all.push(o); }
      c.herds.push(H); return H; };
    const sh = herd('sheep', 25 + Math.floor(rr() * 70), 16 + rr() * 14, 60 + rr() * 140);
    if (rr() < 0.8) herd('horse', 4 + Math.floor(rr() * 12), 22 + rr() * 16, 90 + rr() * 200);
    if (c.h > 1250 && rr() < 0.6) herd('yak', 5 + Math.floor(rr() * 14), 26 + rr() * 14, 120 + rr() * 220);
    const rid = { k: 'rider', x: sh.cx + sh.R * 1.4, y: sh.cy, th: 0, ci: Math.floor(rr() * 3), herd: sh, sc: 1, ph: rr() * 6.28, st: 1, t: 0, tx: 0, ty: 0, v: 0, gr: 0, flee: 0, rider: true, ang: rr() * 6.28 }; sh.rider = rid; all.push(rid); });
  for (const o of all) o.z = hV(o.x, o.y);
  // ---- отрисовка вблизи: пиксельные спрайты ----
  const ART = makeJailooAtlas(), SPR = makeSprites(scene, ART.tex, 1800);
  // дальше LOD -- вместо спрайта точка: спрайт там уже меньше 3-4 пикселей
  const LOD = { sheep: 320, ram: 320, horse: 560, rider: 560, yak: 560, yurt: 2600 }, SZ = { sheep: 1.0, ram: 1.1, horse: 1.9, rider: 2.2, yak: 2.0, yurt: 6.5 };
  const hexc = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const PCOL = (o) => hexc(o.k === 'yurt' ? '#f3ecdc' : o.k === 'yak' ? COATS.yak[o.ci] : o.k === 'horse' || o.k === 'rider' ? COATS.horse[o.ci] : COATS.sheep[o.ci]);
  // ---- точки издали ----
  const N = all.length, pp = new Float32Array(N * 3), pc = new Float32Array(N * 3), ps = new Float32Array(N * 2);
  all.forEach((o, i) => { pc.set(PCOL(o), i * 3); ps.set([SZ[o.k] * (o.sc || 1), LOD[o.k]], i * 2); o.i = i; });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aCol', new THREE.BufferAttribute(pc, 3)); pg.setAttribute('aSz', new THREE.BufferAttribute(ps, 2));
  const uScale = { value: 600 }, pts = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: { ...ENV, uScale }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: PT_V, fragmentShader: PT_F, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  const writeP = () => { for (const o of all) { pp[o.i * 3] = o.x; pp[o.i * 3 + 1] = o.z; pp[o.i * 3 + 2] = -o.y; } pg.attributes.position.needsUpdate = true; }; writeP();
  // ---- дымок из тюндюка ----
  const SM = 48, sg = new THREE.BufferGeometry(), sp = new Float32Array(SM * 3), sa = new Float32Array(SM); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aA', new THREE.BufferAttribute(sa, 1));
  const smoke = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: { uScale }, transparent: true, depthWrite: false,
    vertexShader: CURVE + `attribute float aA; uniform float uScale; varying float vA; void main(){ vec3 p=position; float d=length(p-cameraPosition); p.y-=curve(p); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); vA=aA; gl_PointSize=clamp((0.7+2.2*(1.-aA))*uScale/max(d,1.),1.,70.); if(aA<=0.) gl_Position=vec4(2.,2.,2.,1.); }`,
    fragmentShader: `varying float vA; void main(){ vec2 q=gl_PointCoord-0.5; float r=dot(q,q); if(r>0.25) discard; gl_FragColor=vec4(vec3(0.86,0.86,0.88),vA*vA*0.32*(1.-r*4.)); }` }));
  smoke.frustumCulled = false; scene.add(smoke);

  const seen = new Set(store.get('jailoo') || []); let near = null, sinceP = 0;
  // поведение одного животного: пасётся (голова внизу), иногда переходит; рядом низко пролетели -- бежит прочь
  function sim(o, dt, threat) {
    const H = o.herd, run = o.k === 'sheep' || o.k === 'ram' ? 4.2 : o.k === 'yak' ? 5 : 9, walk = o.k === 'sheep' || o.k === 'ram' ? 0.55 : 0.9;
    if (o.rider) { // чабан объезжает отару по кругу шагом
      o.ang += dt * 0.045; const R = H.R * 1.5 + 6, tx = H.cx + Math.cos(o.ang) * R, ty = H.cy + Math.sin(o.ang) * R; const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
      o.v = Math.min(1.6, d * 0.5); if (d > 0.1) { o.th = Math.atan2(dx, dy); o.x += dx / d * o.v * dt; o.y += dy / d * o.v * dt; } o.gr = 0; return; }
    if (threat) { const dx = o.x - threat.x, dy = o.y - threat.y, d = Math.hypot(dx, dy); if (d < threat.R) { o.flee = 3 + Math.random() * 2; o.fx = dx / (d || 1); o.fy = dy / (d || 1); } }
    if (o.flee > 0) { o.flee -= dt; o.v += (run - o.v) * Math.min(1, dt * 3); o.gr = Math.max(0, o.gr - dt * 4); const tth = Math.atan2(o.fx, o.fy); o.th += Math.atan2(Math.sin(tth - o.th), Math.cos(tth - o.th)) * Math.min(1, dt * 4); }
    else { o.t -= dt;
      if (o.st === 0 && o.t <= 0) { o.st = 1; const a = Math.random() * 6.28, rad = H.R * Math.sqrt(Math.random()); o.tx = H.cx + Math.cos(a) * rad; o.ty = H.cy + Math.sin(a) * rad; o.t = 20; }
      if (o.st === 1) { const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy); o.gr = Math.max(0, o.gr - dt * 2);
        if (d < 0.6 || o.t <= 0) { o.st = 0; o.t = 4 + Math.random() * 14; } else { const tth = Math.atan2(dx, dy); o.th += Math.atan2(Math.sin(tth - o.th), Math.cos(tth - o.th)) * Math.min(1, dt * 2); o.v += (walk - o.v) * Math.min(1, dt * 2); } }
      else { o.v = Math.max(0, o.v - dt * 2); o.gr = Math.min(1, o.gr + dt * 0.8); } }
    if (o.v > 0.01) { o.x += Math.sin(o.th) * o.v * dt; o.y += Math.cos(o.th) * o.v * dt; }
    // стадо не расползается: дальше 2.5 R от центра -- тянет назад
    const ex = o.x - H.cx, ey = o.y - H.cy, ed = Math.hypot(ex, ey); if (ed > H.R * 2.5 && o.flee <= 0) { o.st = 1; o.tx = H.cx; o.ty = H.cy; o.t = 20; }
  }
  const CR = new THREE.Vector3();
  function put(o) { const i = SPR.n; if (i >= SPR.max) return; SPR.n++;
    const sheepL = o.k === 'sheep' || o.k === 'ram', st = o.k === 'yurt' ? 'still' : o.k === 'rider' ? (o.v > 2.5 ? 'run' : 'walk') : o.v > 2.5 && o.k === 'horse' ? 'run' : o.v > 0.12 ? 'walk' : 'graze';
    const R = ART.rects[o.k === 'yurt' ? 'yurt' : o.k + o.ci][st], s = o.sc || 1, rate = st === 'graze' ? 0.5 + (o.ph % 1) * 0.3 : st === 'run' ? 6 + o.v * 0.3 : st === 'still' ? 0 : 2.2 + o.v * (sheepL ? 5 : 2.6);
    const flip = o.k === 'yurt' ? 0 : (Math.sin(o.th) * CR.x - Math.cos(o.th) * CR.z) < 0 ? 1 : 0; // в атласе смотрят вправо: идёт влево на экране -- зеркалим
    SPR.at.aP.setXYZW(i, o.x, o.z - 0.06 * s, -o.y, R[4] * s); SPR.at.aR.setXYZW(i, R[0], R[1], R[2], R[3]); SPR.at.aS.setXYZW(i, R[5] * s, flip, rate, (o.ph || 0) * 3); }
  let smokeT = 0; const puffs = []; for (let i = 0; i < SM; i++) puffs.push({ a: 0 });

  function update(dt, t) {
    U.uTime.value = t; const cx = camera.position.x, cy = -camera.position.z, cz = camera.position.y;
    const fov = camera.fov * Math.PI / 180; uScale.value = (G.bufH || window.innerHeight * (window.devicePixelRatio || 1)) / (2 * Math.tan(fov / 2));
    SPR.n = 0; CR.setFromMatrixColumn(camera.matrixWorld, 0); // правое направление камеры
    // угроза: камера (а с ней параплан или самолёт) низко над землёй
    const gz = hV(cx, cy), agl = cz - gz, threat = agl < 90 ? { x: cx, y: cy, R: 45 + agl * 0.9 } : null;
    let nearC = null, nd = 1e9; sinceP += dt;
    for (const c of camps) { const dc = Math.hypot(c.x - cx, c.y - cy); if (dc < nd) { nd = dc; nearC = c; }
      if (dc > 5200) continue;
      for (const y of c.yurts) if (Math.hypot(y.x - cx, y.y - cy, y.z - cz) < LOD.yurt) put(y);
      for (const H of c.herds) { const live = dc < 2200;
        if (live) { // центр стада медленно бредёт по пастбищу, не уходя далеко от стойбища
          H.cx += Math.sin(t * 0.004 + c.id + H.R) * dt * 0.08; H.cy += Math.cos(t * 0.0033 + c.id * 2) * dt * 0.08; const hx = H.cx - H.hx, hy = H.cy - H.hy, hd = Math.hypot(hx, hy); if (hd > 120) { H.cx -= hx / hd * dt * 0.2; H.cy -= hy / hd * dt * 0.2; } }
        const lst = H.rider ? [...H.list, H.rider] : H.list; let spook = false;
        for (const o of lst) { if (live) { const was = o.flee; sim(o, dt, threat); if (o.flee > 0 && !(was > 0)) spook = true; o.z = hV(o.x, o.y); }
          const dd = Math.hypot(o.x - cx, o.y - cy, o.z - cz); if (dd < LOD[o.k]) put(o); }
        if (spook && !H.spookT) { H.spookT = 1; ach && ach('jl_herd'); if (toast) toast(H.kind === 'horse' ? 'Табун сорвался в галоп!' : H.kind === 'yak' ? 'Яки неуклюже затрусили прочь' : 'Отара шарахнулась врассыпную — чабан будет недоволен'); }
        if (H.spookT && !lst.some((o) => o.flee > 0)) H.spookT = 0; } }
    SPR.geo.instanceCount = SPR.n; SPR.mesh.visible = SPR.n > 0; for (const k in SPR.at) SPR.at[k].needsUpdate = true;
    if (sinceP > 0.5) { sinceP = 0; writeP(); }
    // дымок: из ближайших юрт
    smokeT -= dt; for (const p of puffs) { if (p.a <= 0) continue; p.age += dt; p.z += dt * 1.3; p.x += dt * 0.6 * (G.wind ? G.wind.sx || 0.5 : 0.5); p.y += dt * 0.6 * (G.wind ? G.wind.sy || 0.3 : 0.3); p.a = Math.max(0, 1 - p.age / 7); }
    if (smokeT <= 0) { smokeT = 0.35; for (const c of camps) { if (Math.hypot(c.x - cx, c.y - cy) > 2500) continue; for (const y of c.yurts) { if (Math.random() < 0.5) continue; const p = puffs.find((q) => q.a <= 0); if (!p) break; Object.assign(p, { x: y.x + (Math.random() - 0.5) * 0.3, y: y.y + (Math.random() - 0.5) * 0.3, z: y.z + 3.1, age: 0, a: 1 }); } } }
    puffs.forEach((p, i) => { sp[i * 3] = p.x || 0; sp[i * 3 + 1] = p.z || 0; sp[i * 3 + 2] = -(p.y || 0); sa[i] = p.a; }); sg.attributes.position.needsUpdate = true; sg.attributes.aA.needsUpdate = true; smoke.visible = puffs.some((p) => p.a > 0);
    // знакомство с джайлоо: подлетел ближе 400 м
    near = nearC && nd < 400 && agl < 600 ? nearC : null;
    if (near && !near.met) { near.met = true; const sheep = near.herds.filter((h) => h.kind === 'sheep').reduce((a, h) => a + h.list.length, 0), hor = near.herds.filter((h) => h.kind === 'horse').reduce((a, h) => a + h.list.length, 0), yak = near.herds.filter((h) => h.kind === 'yak').reduce((a, h) => a + h.list.length, 0);
      const parts = [near.yurts.length ? `${near.yurts.length} ${near.yurts.length === 1 ? 'юрта' : 'юрты'}` : 'только чабан', `отара ${sheep}`]; if (hor) parts.push(`табун ${hor}`); if (yak) parts.push(`яки ${yak}`);
      if (toast) toast(`Джайлоо «${near.name}» · ${parts.join(' · ')}`); if (!seen.has(near.id)) { seen.add(near.id); store.set('jailoo', [...seen]); }
      if (ach) { if (near.yurts.length) ach('jl_yurt'); if (yak) ach('jl_yak'); if (seen.size >= 5) ach('jl_five'); } }
  }
  return { update, camps, get count() { return all.length; }, get near() { return near; } };
}
