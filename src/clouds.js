// Рисованные облака: плоские 2D-спрайты в духе остальной графики (заливка без градиентов, тень «полумесяцем»,
// тонкий контур тушью), но живые и многослойные.
//
// Ярусы (у каждого свой характер, высота и скорость):
//  * кучевые -- главные: «барашки» над прогретыми хребтами (над холодным озером днём их почти нет); каждое облако --
//    2-3 спрайта на разной глубине, поэтому при движении камеры части облака смещаются друг относительно друга;
//  * мощные кучевые и грозовые башни -- в грозу и при сильной облачности: высокие, с тёмным основанием и наковальней;
//  * разорванные клочья -- ниже и быстрее, в ветер и непогоду;
//  * полосы и «линзы» над хребтами -- далеко, вдоль гор: дают глубину пейзажу;
//  * перистые -- очень высоко, тонкие пряди, по погоде.
// Свет: атлас хранит не цвет, а маски -- где тень при солнце слева, где при солнце справа, где контур. Цвета
// считает шейдер по солнцу и погоде: днём белые с голубой тенью, на закате -- золото и розовый с сиреневой тенью,
// ночью -- серебро луны, в грозу -- свинец. Облако напротив солнца темнеет, а край его светится (серебряная кайма).
// Облака плывут по ветру (верхние быстрее), рождаются, дышат и тают -- небо всё время немного другое.
// Один вызов отрисовки на всё небо: экземпляры сортируются от дальних к ближним.
import * as THREE from 'three';
import { CURVE, GLSL_COMMON, END, ENV } from './world.js';

const AW = 2048, AH = 1024;
// ---------- атлас масок ----------
// R -- тень при солнце слева, G -- тень при солнце справа, B -- контур, A -- покрытие
function atlas() {
  const rects = {}; let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mk = () => { const c = document.createElement('canvas'); c.width = AW; c.height = AH; return c.getContext('2d'); };
  const A = mk(), I = mk(), SL = mk(), SR = mk(); // покрытие с контуром, внутренность, тени
  // фигура -- набор кругов, по желанию с плоским основанием; рисуется во все маски
  function shape(name, x0, y0, w, h, puffs, { flat = true, lw = 5, shadeK = 1 } = {}) {
    const base = y0 + h - 8, path = (ctx, dx = 0, dy = 0, k = 1) => { ctx.beginPath(); for (const [px, py, pr] of puffs) { ctx.moveTo(x0 + px + dx + pr * k, y0 + py + dy); ctx.arc(x0 + px + dx, y0 + py + dy, pr * k, 0, Math.PI * 2); } };
    for (const ctx of [A, I, SL, SR]) { ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, flat ? base - y0 : h); ctx.clip(); }
    path(A); A.lineWidth = lw; A.strokeStyle = '#fff'; A.lineJoin = 'round'; A.stroke(); A.fillStyle = '#fff'; A.fill();
    path(I); I.fillStyle = '#fff'; I.fill();
    // тень: внутренность минус та же фигура, сдвинутая к солнцу и вверх -- полумесяц на теневой стороне и снизу
    const sx = 0.09 * w * shadeK, sy = 0.16 * h * shadeK;
    for (const [ctx, dir] of [[SL, 1], [SR, -1]]) { path(ctx); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; path(ctx, -dir * sx, -sy, 0.97); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    for (const ctx of [A, I, SL, SR]) ctx.restore();
    if (flat) { A.fillStyle = '#fff'; A.fillRect(x0 + 10, base - 2, w - 20, 3); } // линия основания тушью
    rects[name] = [x0 / AW, 1 - (y0 + h) / AH, w / AW, h / AH];
  }
  // кучевые: 8 вариантов 256x176
  for (let k = 0; k < 8; k++) { const x0 = k * 256, y0 = 0, W = 256, H = 176, base = H - 8, L = 18, R = W - 18, p = [];
    const n0 = 4 + Math.floor(r() * 3); for (let i = 0; i < n0; i++) { const t = (i + 0.5) / n0, rr = 18 + r() * 14; p.push([L + 14 + t * (R - L - 28), base - rr * 0.5, rr]); }
    const n1 = 2 + Math.floor(r() * 3); for (let i = 0; i < n1; i++) { const t = (i + 0.5) / n1 + (r() - 0.5) * 0.15, rr = 28 + r() * 22; p.push([L + 30 + t * (R - L - 60), base - 26 - rr * (0.45 + r() * 0.5), rr]); }
    if (k % 2 === 0) { const rr = 24 + r() * 14; p.push([W / 2 + (r() - 0.5) * 60, base - 70 - rr * 0.6, rr]); }
    shape('cu' + k, x0, y0, W, H, p); }
  // мощные кучевые и грозовые башни: 3 варианта 340x420 (у двух -- наковальня)
  for (let k = 0; k < 3; k++) { const x0 = k * 340, y0 = 180, W = 340, H = 420, base = H - 8, p = [];
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, rr = 26 + r() * 16; p.push([30 + t * (W - 60), base - rr * 0.5, rr]); }
    for (let j = 0; j < 7; j++) { const y = base - 50 - j * 42, rr = 46 - j * 2 + r() * 14, x = W / 2 + (r() - 0.5) * 60; p.push([x, y, rr]); p.push([x + (r() < 0.5 ? -1 : 1) * rr * 0.7, y + 12, rr * 0.7]); }
    if (k > 0) for (let i = 0; i < 9; i++) { const t = i / 8; p.push([40 + t * (W - 80), 60 + Math.abs(t - 0.5) * 30 + r() * 8, 26 + r() * 10]); }
    shape('cb' + k, x0, y0, W, H, p, { shadeK: 0.8 }); }
  // клочья: 8 вариантов 160x80, без плоского основания
  for (let k = 0; k < 8; k++) { const x0 = 1024 + (k % 4) * 160, y0 = 180 + Math.floor(k / 4) * 84, W = 160, H = 80, p = [];
    const n = 5 + Math.floor(r() * 4); for (let i = 0; i < n; i++) { const t = r(), rr = 6 + r() * 13 * Math.sin(Math.PI * (0.15 + 0.7 * t)); p.push([22 + t * (W - 44), H / 2 + (r() - 0.5) * 26, rr]); } // рваный клок: круги вразброс, к краям мельче
    shape('fr' + k, x0, y0, W, H, p, { flat: false, lw: 4 }); }
  // полосы и линзы над хребтами: 4 варианта 1024x100
  for (let k = 0; k < 4; k++) { const x0 = (k % 2) * 1024, y0 = 610 + Math.floor(k / 2) * 104, W = 1024, H = 100, p = [], lens = k >= 2;
    const n = lens ? 30 : 44; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, env = Math.sin(t * Math.PI); p.push([30 + t * (W - 60), lens ? 54 - env * 6 : 62 + (r() - 0.5) * 6, (lens ? 8 + env * 30 : 16 + r() * 10) * (0.55 + 0.45 * env)]); } // круги внахлёст -- гладкий край, а не бусы
    shape('st' + k, x0, y0, W, H, p, { flat: !lens, lw: 4, shadeK: 0.6 }); }
  // перистые: 2 пряди 1024x90 -- штрихи без тени и контура
  for (let k = 0; k < 2; k++) { const x0 = k * 1024, y0 = 820, W = 1024, H = 90;
    for (const ctx of [A, I]) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; }
    for (let i = 0; i < 26; i++) { const sx = 40 + r() * (W - 200), sy = 20 + r() * 50, L = 80 + r() * 160, lw = 2 + r() * 4, b1 = 6 + r() * 10, b2 = 18 + r() * 14;
      for (const ctx of [A, I]) { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0 + sx, y0 + sy); ctx.quadraticCurveTo(x0 + sx + L * 0.6, y0 + sy - b1, x0 + sx + L, y0 + sy - b2); ctx.stroke(); } }
    for (const ctx of [A, I]) ctx.restore(); rects['ci' + k] = [x0 / AW, 1 - (y0 + H) / AH, W / AW, H / AH]; }
  // сборка в одну текстуру
  const out = mk(), o = out.createImageData(AW, AH), a = A.getImageData(0, 0, AW, AH).data, i = I.getImageData(0, 0, AW, AH).data, sl = SL.getImageData(0, 0, AW, AH).data, sr = SR.getImageData(0, 0, AW, AH).data;
  for (let k = 0; k < AW * AH; k++) { const q = k * 4, cov = a[q + 3], ins = i[q + 3]; o.data[q] = sl[q + 3]; o.data[q + 1] = sr[q + 3]; o.data[q + 2] = Math.max(0, cov - ins); o.data[q + 3] = cov; }
  out.putImageData(o, 0, 0);
  const t = new THREE.CanvasTexture(out.canvas); t.anisotropy = 4; return { tex: t, rects };
}

const V = CURVE + `attribute vec4 aC; attribute vec4 aS; attribute vec4 aR; attribute vec4 aL;
uniform vec3 uSun; varying vec2 vUv; varying vec3 vP; varying float vA; varying float vSide; varying float vBack; varying vec4 vL; varying float vY;
void main(){ vec3 c=aC.xyz; vec3 dir=c-cameraPosition; vec3 rt=normalize(vec3(-dir.z,0.,dir.x)+1e-4);
  vec3 p=c+rt*position.x*aS.x+vec3(0.,(position.y+0.5)*aS.y,0.); vP=p; float d=length(p-cameraPosition);
  float u=position.x+0.5; if(aS.z>0.5) u=1.-u; vUv=vec2(aR.x+u*aR.z, aR.y+(position.y+0.5)*aR.w); vY=position.y+0.5;
  vec3 sh=normalize(vec3(uSun.x,0.,uSun.z)+1e-4); float side=dot(rt,sh); if(aS.z>0.5) side=-side; vSide=clamp(0.5+side*0.9,0.,1.); // с какой стороны солнце на экране
  vBack=max(0.,dot(normalize(dir),normalize(uSun))); // облако между нами и солнцем
  vL=aL; vA=aC.w*smoothstep(aS.w*0.5,aS.w,d)*(1.-smoothstep(90000.,120000.,d)); p.y-=curve(p);
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); if(vA<0.003) gl_Position=vec4(2.,2.,2.,1.); }`;
const F = GLSL_COMMON + `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vP; varying float vA; varying float vSide; varying float vBack; varying vec4 vL; varying float vY;
void main(){ vec4 t=texture2D(uMap,vUv); float a=t.a*vA; if(a<0.01) discard;
  float shade=mix(t.r,t.g,vSide), ink=t.b;
  // свет и тень по времени суток и погоде; vL.x -- грозовое облако, vL.y -- тон яруса
  float day=clamp(uDay,0.,1.), dusk=uDusk, storm=clamp(uStorm+vL.x*0.6,0.,1.);
  // цвета -- в линейном пространстве (после гаммы экран светлее): 0.25 тут -- это уже средне-серый
  vec3 lit=mix(vec3(0.20,0.26,0.42), vec3(1.0,0.98,0.95), day);            // ночью -- лунное серебро
  lit=mix(lit, vec3(1.0,0.40,0.15), dusk*0.9);                              // закат: золото и медь
  vec3 sh=mix(vec3(0.05,0.07,0.15), mix(uHor*0.7, vec3(0.50,0.60,0.82), 0.4), day); // тень -- от цвета неба
  sh=mix(sh, vec3(0.40,0.17,0.32), dusk*0.8);                               // закат: сиренево-розовая тень
  lit=mix(lit, vec3(0.24,0.26,0.30), storm*0.92); sh=mix(sh, vec3(0.05,0.06,0.08), storm*0.95); // гроза: свинец
  lit*=0.55+0.45*uSunI; sh*=0.6+0.4*uSunI;
  float baseDark=storm*(1.-smoothstep(0.,0.45,vY))*0.35; shade=clamp(shade+baseDark,0.,1.); // у грозового низ темнее
  vec3 c=mix(lit, sh, shade*(0.85+0.15*vL.y));
  // против солнца: тело в тени, край светится серебром
  c=mix(c, sh*0.9, vBack*vBack*0.55*day); vec3 inkc=mix(sh*0.55, vec3(1.,0.95,0.85)*1.1, vBack*vBack*day*(1.-storm));
  c=mix(c, inkc, ink*0.9);
  c=applyFog(c,length(vP-cameraPosition),vP.y); gl_FragColor=vec4(c,a); ${END} }`;

// ярусы: n -- сколько, alt -- высота основания над озером, w -- ширина, hw -- высота/ширина, wk -- скорость от ветра,
// parts -- из скольких спрайтов облако (глубина), near -- ближе этого облако тает (в него можно влететь)
const TIERS = [
  { id: 'cu', n: 130, alt: [2700, 3500], w: [1400, 5200], kinds: ['cu0', 'cu1', 'cu2', 'cu3', 'cu4', 'cu5', 'cu6', 'cu7'], hw: 176 / 256, wk: 3, parts: 3, near: 700 },
  { id: 'cb', n: 16, alt: [2300, 2700], w: [5000, 9000], kinds: ['cb0', 'cb1', 'cb2'], hw: 420 / 340, wk: 2, parts: 1, near: 1500 },
  { id: 'fr', n: 80, alt: [1500, 2500], w: [250, 900], kinds: ['fr0', 'fr1', 'fr2', 'fr3', 'fr4', 'fr5', 'fr6', 'fr7'], hw: 0.5, wk: 5, parts: 1, near: 250 },
  { id: 'st', n: 8, alt: [3000, 3900], w: [9000, 22000], kinds: ['st0', 'st1', 'st2', 'st3'], hw: 100 / 1024 * 1.6, wk: 2.5, parts: 1, near: 6000 },
  { id: 'ci', n: 12, alt: [7500, 9000], w: [12000, 26000], kinds: ['ci0', 'ci1'], hw: 90 / 1024, wk: 8, parts: 1, near: 8000 },
];
export function makeSpriteClouds(scene, h = () => 1000) {
  const { tex, rects } = atlas(), MAX = TIERS.reduce((a, t) => a + t.n * t.parts, 0);
  const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.attributes.position = base.attributes.position;
  const at = {}; for (const k of ['aC', 'aS', 'aR', 'aL']) { at[k] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); at[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, at[k]); } geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...ENV, uMap: { value: tex } }, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; scene.add(mesh);
  let seed = 99; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647, SPAN = 100000, lerp = (a, b, t) => a + (b - a) * t;
  // облако: место в квадрате вокруг камеры, жизнь (рождение -- зрелость -- распад), части на разной глубине
  const list = [];
  const born = (o, T, first) => { o.x = (r() - 0.5) * SPAN; o.y = (r() - 0.5) * SPAN; o.z = lerp(T.alt[0], T.alt[1], r()); o.w = lerp(T.w[0], T.w[1], r() ** 1.5); o.life = 600 + r() * 1400; o.age = first ? r() * o.life : 0; o.rank = r();
    o.parts = []; for (let i = 0; i < T.parts; i++) o.parts.push({ k: T.kinds[Math.floor(r() * T.kinds.length)], dx: i ? (r() - 0.5) * 0.9 : 0, dd: i ? (r() < 0.5 ? -1 : 1) * (0.15 + r() * 0.3) : 0, dz: i ? (r() - 0.3) * 0.25 : 0, s: i ? 0.45 + r() * 0.35 : 1, fl: r() < 0.5 ? 1 : 0 }); };
  for (const T of TIERS) for (let i = 0; i < T.n; i++) { const o = { T, a: 0 }; born(o, T, true); list.push(o); }
  const tmp = []; let ox = 0, oy = 0, first = true;
  return { mesh,
    // w: { cover 0..1, storm 0..1, cirrus 0..1, wind {sx, sy} }
    update(dt, camera, w) { const cx = camera.position.x, cy = -camera.position.z, wsx = w.wind ? w.wind.sx : 2, wsy = w.wind ? w.wind.sy : 1;
      ox += wsx * dt; oy += wsy * dt; tmp.length = 0;
      const fx = camera.matrixWorld.elements[8], fz = camera.matrixWorld.elements[10]; // ось взгляда: вдоль неё разнесены части облака
      for (const o of list) { const T = o.T; o.age += dt * (1 + w.storm * 2); if (o.age > o.life) born(o, T, false);
        let X = o.x + ox * T.wk - cx, Y = o.y + oy * T.wk - cy; X -= Math.round(X / SPAN) * SPAN; Y -= Math.round(Y / SPAN) * SPAN;
        const land = h(X + cx, Y + cy) > 150;
        let want = 0; // какая доля облаков яруса нужна при этой погоде
        if (T.id === 'cu') want = land ? w.cover * 1.05 : w.cover * 0.3; else if (T.id === 'cb') want = Math.max(0, w.storm * 1.2 - 0.1) + Math.max(0, w.cover - 0.8) * 1.5;
        else if (T.id === 'fr') want = 0.1 + w.storm * 0.9 + w.cover * 0.3; else if (T.id === 'st') want = land ? 0.3 + w.cover * 0.5 : 0; else if (T.id === 'ci') want = w.cirrus * 4;
        const life = Math.min(1, o.age / 120, (o.life - o.age) / 160); // рождается и тает за пару минут
        const tgt = o.rank < want ? Math.max(0, life) : 0; o.a = first ? tgt : o.a + (tgt - o.a) * Math.min(1, dt * 0.2);
        if (o.a < 0.01) continue; const grow = 0.75 + 0.25 * Math.min(1, o.age / 200), breathe = 1 + 0.03 * Math.sin(o.age * 0.02 + o.rank * 40);
        for (const p of o.parts) { const rc = rects[p.k], W = o.w * p.s * grow * breathe, H = W * T.hw * (T.id === 'cb' ? 1 + w.storm * 0.4 : 1);
          const px = X + cx + p.dx * o.w * 0.5 * Math.cos(o.rank * 9) + fx * p.dd * o.w * 0.5, py = Y + cy + p.dx * o.w * 0.5 * Math.sin(o.rank * 9) - fz * p.dd * o.w * 0.5;
          tmp.push({ X: px, Y: py, Z: o.z + p.dz * o.w * 0.3, W, H, rc, fl: p.fl, a: o.a * (T.id === 'ci' ? 0.55 : T.id === 'st' ? 0.8 : 1), near: T.near, heavy: T.id === 'cb' ? 1 : 0, tone: p.s < 1 ? 1 : 0.8, d: Math.hypot(px - cx, py - cy) }); } }
      first = false; tmp.sort((a, b) => b.d - a.d); let n = 0;
      for (const q of tmp) { if (n >= MAX) break; at.aC.setXYZW(n, q.X, q.Z, -q.Y, q.a); at.aS.setXYZW(n, q.W, q.H, q.fl, q.near); at.aR.setXYZW(n, q.rc[0], q.rc[1], q.rc[2], q.rc[3]); at.aL.setXYZW(n, q.heavy, q.tone, 0, 0); n++; }
      geo.instanceCount = n; mesh.visible = n > 0; for (const k in at) at[k].needsUpdate = true; } };
}
