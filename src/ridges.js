// Чернильные линии хребтов: горы рисуются как в комиксе, штрихами по гребням и отрогам.
// Гребни ищутся по настоящей карте высот: «вода», текущая вверх по склону (по самому крутому подъёму), собирается
// на гребнях так же, как обычная вода собирается в долинах. Чем больше склона «стекает» на гребень, тем он значимее.
// Линии -- ленты постоянной толщины в пикселях экрана, не толще обводки силуэтов; вдали тоньше и бледнее, мелкие отроги вдали
// гаснут, остаются главные хребты. Штрих сужается и тает к началу отрога -- как росчерк пером.
// Закрытые передним склоном гребни не видны: работает обычная проверка глубины, а лента чуть выдвинута к камере
// вдоль луча зрения (на экране она от этого не сдвигается), чтобы не тонуть в собственном склоне.
import * as THREE from 'three';
import { CURVE, END, MAP, exag, WS } from './world.js';

const U = { uRes: { value: new THREE.Vector2(1280, 720) }, uK: { value: 1 } };
export function setRidgeRes(w, h) { U.uRes.value.set(w, h); U.uK.value = Math.max(0.75, h / 720); }

// гребни на регулярной сетке высот hs (W x H, шаг step м); mask -- какие клетки рассматривать
function extract(hs, W, H, step, mask, minHa, toXY, out) {
  const n = W * H, rec = new Int32Array(n).fill(-1), acc = new Float32Array(n), cells = [];
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DL = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!mask(i, j, hs[k])) continue; cells.push(k); acc[k] = 1;
    let best = 0; for (let d = 0; d < 8; d++) { const a = i + DI[d], b = j + DJ[d]; if (a < 0 || b < 0 || a >= W || b >= H) continue; const q = b * W + a;
      if (!mask(a, b, hs[q])) continue; const s = (hs[q] - hs[k]) / DL[d]; if (s > best) { best = s; rec[k] = q; } } }
  cells.sort((a, b) => hs[a] - hs[b]); // подъём всегда к более высокой клетке: снизу вверх накопление готово
  for (const k of cells) if (rec[k] >= 0) acc[rec[k]] += acc[k];
  const ha = (step * step) / 1e4, thr = minHa / ha, nd = new Uint8Array(n);
  for (const k of cells) if (acc[k] >= thr && rec[k] >= 0) nd[rec[k]]++;
  for (const k of cells) { if (acc[k] < thr || nd[k] === 1 || rec[k] < 0) continue;
    const line = []; let c = k; for (;;) { const [X, Y] = toXY(c % W, (c / W) | 0); line.push([X, Y, acc[c] * ha]); if (rec[c] < 0 || (c !== k && nd[c] !== 1)) break; c = rec[c]; }
    if (line.length > 1) out.push(line); }
}
// сглаживание Чайкина: ступеньки сетки (шаг в 45 градусов) превращаются в плавный росчерк
function chaikin(l) { const o = [l[0]]; for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1];
  o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]); }
  o.push(l[l.length - 1]); return o; }

export function makeRidges(hNear, farGrid, holes = []) {
  const lines = [];
  // ближний рельеф: подробная карта через клетку (шаг ~56 м)
  { const S = 2, M = MAP.M * S, W = Math.floor((MAP.N - 1) / S) + 1, X0 = -MAP.OX * MAP.M, Y1 = MAP.OY * MAP.M, hs = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) hs[j * W + i] = hNear(X0 + i * M, Y1 - j * M);
    const near = []; extract(hs, W, W, M, (i, j, h) => h > 25, 30, (i, j) => [X0 + i * M, Y1 - j * M], near);
    for (const l of near) lines.push({ pts: chaikin(chaikin(l)), h: (X, Y) => exag(hNear(X, Y), X, Y) }); }
  // вся котловина: грубая карта (шаг 600 м) за пределами подробной и не там, где стоит рельеф ущелья
  { const { hs, W, H, X0, Y1, STEP } = farGrid, M = MAP.M, pad = 2 * STEP;
    const nx0 = -MAP.OX * M + pad, nx1 = (MAP.N - 1 - MAP.OX) * M - pad, ny0 = (MAP.OY - (MAP.N - 1)) * M + pad, ny1 = MAP.OY * M - pad;
    const mask = (i, j, h) => { if (h < 40) return false; const X = X0 + i * STEP, Y = Y1 - j * STEP; if (X > nx0 && X < nx1 && Y > ny0 && Y < ny1) return false;
      return !holes.some((o) => Math.hypot(X - o.X, Y - o.Y) < o.r + STEP); };
    const at = (X, Y) => { const fx = Math.min(Math.max((X - X0) / STEP, 0), W - 1.001), fy = Math.min(Math.max((Y1 - Y) / STEP, 0), H - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
      return (hs[j * W + i] * (1 - u) + hs[j * W + i + 1] * u) * (1 - v) + (hs[(j + 1) * W + i] * (1 - u) + hs[(j + 1) * W + i + 1] * u) * v; }, atE = (X, Y) => exag(at(X, Y), X, Y) - 12; // дальняя сетка лежит на 12 м ниже
    const far = []; extract(hs, W, H, STEP, mask, 400, (i, j) => [X0 + i * STEP, Y1 - j * STEP], far);
    for (const l of far) lines.push({ pts: chaikin(l), h: atE }); } // вдали хватает одного сглаживания: вдвое меньше вершин

  // каждый отрезок -- четыре вершины ленты; отрезки раскладываются по клеткам 8 км, чтобы невидимые отсекались
  const tiles = new Map();
  for (const { pts, h } of lines) { const P = pts.map(([X, Y, a]) => [X, h(X, Y), -Y, Math.log2(a)]);
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], key = Math.floor((a[0] + b[0]) / 16000) * 1000 + Math.floor((a[2] + b[2]) / 16000);
      let t = tiles.get(key); if (!t) tiles.set(key, (t = [])); t.push(a, b); } }
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: CURVE + /* glsl */`
uniform vec2 uRes; uniform float uK; attribute vec3 aQ; attribute vec3 aSE; varying float vSide, vW, vAl;
void main(){ float aS=aSE.x, aE=aSE.y, aA=aSE.z; vec3 p=(modelMatrix*vec4(position,1.)).xyz, q=(modelMatrix*vec4(aQ,1.)).xyz; p.y-=curve(p); q.y-=curve(q); // мировые: группа масштабирована
  float dist=length(p-cameraPosition);
  p+=normalize(cameraPosition-p)*(2.+dist*0.004); q+=normalize(cameraPosition-q)*(2.+length(q-cameraPosition)*0.004);
  vec4 cp=projectionMatrix*viewMatrix*vec4(p,1.), cq=projectionMatrix*viewMatrix*vec4(q,1.);
  if(cp.w<0.5 || cq.w<0.5){ gl_Position=vec4(2.,2.,2.,1.); vAl=0.; vW=1.; vSide=0.; return; }
  // вдали остаются только крупные хребты; отрог тает к началу (там на него «стекает» меньше склона)
  float need=log2(30.)+0.8*log2(1.+dist/3000.), sig=smoothstep(need, need+1., aA);
  // толщина -- не больше обводки силуэтов (post.js): штрих лишь подсказывает форму рельефа, а не рисует его заново
  float wpx=uK*mix(1.5,1.0,smoothstep(400.,20000.,dist))*(0.6+0.4*sig);
  vec2 sp=cp.xy/cp.w*uRes, sq=cq.xy/cq.w*uRes, d=(sq-sp)*(aE>0.5?-1.:1.); d=d/max(length(d),1e-4);
  float hw=wpx*0.5+1.; cp.xy+=vec2(-d.y,d.x)*aS*hw*2./uRes*cp.w;
  gl_Position=cp; vSide=aS*hw; vW=wpx*0.5;
  vAl=sig*mix(0.85,0.5,smoothstep(3000.,45000.,dist))*(1.-smoothstep(70000.,120000.,dist)); }`,
    fragmentShader: /* glsl */`varying float vSide, vW, vAl;
void main(){ float a=vAl*(1.-smoothstep(vW-0.6,vW+0.6,abs(vSide))); if(a<0.01) discard; gl_FragColor=vec4(0.012,0.016,0.03,a); ${END} }` });
  const g = new THREE.Group(); let segs = 0;
  for (const pts of tiles.values()) { const n = pts.length / 2, pos = new Float32Array(n * 12), q = new Float32Array(n * 12), se = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    for (let s = 0; s < n; s++) { const a = pts[s * 2], b = pts[s * 2 + 1];
      for (let v = 0; v < 4; v++) { const end = v >= 2, me = end ? b : a, ot = end ? a : b, o = (s * 4 + v) * 3;
        pos[o] = me[0]; pos[o + 1] = me[1]; pos[o + 2] = me[2]; q[o] = ot[0]; q[o + 1] = ot[1]; q[o + 2] = ot[2]; se[o] = v % 2 ? 1 : -1; se[o + 1] = end ? 1 : 0; se[o + 2] = me[3]; }
      const b0 = s * 4; idx.set([b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2], s * 6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aQ', new THREE.BufferAttribute(q, 3)); geo.setAttribute('aSE', new THREE.BufferAttribute(se, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); const sp = geo.boundingSphere, dd = Math.hypot(sp.center.x, sp.center.z) * WS + 30000; sp.radius += (dd * dd) / 14866000 / WS + 50;
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; g.add(m); segs += n; }
  g.userData.segs = segs; g.userData.lines = lines.length;
  return g;
}
