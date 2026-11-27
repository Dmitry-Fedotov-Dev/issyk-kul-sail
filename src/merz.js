// Озеро Мерцбахера: ледниково-подпрудное озеро в устье Северного Иныльчека, запертое льдом Южного Иныльчека.
// Как в статьях (Ng, Liu 2009; Kingslake, Ng 2013; Hagg et al. 2008): летом талая вода наполняет озеро (до 2 м в сутки),
// с айсбергами от фронта ледника; достигнув порога, вода поднимает и размывает ледяную плотину и уходит под ледник --
// озеро пустеет за дни, расход до 1000 м³/с, на дне остаются глыбы льда; вал воды идёт вниз по Иныльчеку к Тариму.
// В игре цикл сжат: час «кипит» (прорыв: воронка у плотины, пена, обвалы льда, грохот, уровень падает), час отдыхает
// (наполняется). Цикл -- по общим часам, у всех игроков одинаковый. force -- прорыв «сейчас» (старт «Мерцбахер»).
import * as THREE from 'three';
import { ENV, GLSL_COMMON, END } from './world.js';
import { makeIcebergs } from './icebergs.js';

const PERIOD = 7200; // с: час прорыва + час покоя
export function merzPhase(now = Date.now(), force0 = 0) { const t = force0 ? (now - force0) / 1000 : (now / 1000) % PERIOD; return { active: t < 3600, k: (t % 3600) / 3600 }; }

// Чаша озера по карте высот: заливка от точки озера всем, что ниже уровня полного озера (+45 м над нынешней гладью
// в данных), в радиусе 4.5 км. carve -- прорезать дно: в данных рельефа на месте озера -- плоская гладь, и вода с ней
// совпадала бы (мерцание); дно делаем чашей до 60 м глубиной к середине.
export function lakeBowl(grid, X, Y, carve = false, top0 = null) { const { hs, W, H, X0, Y1, STEP } = grid, i0 = Math.round((X - X0) / STEP), j0 = Math.round((Y1 - Y) / STEP);
  // контур озера из OSM (128 в маске), расширенный на 2 клетки: полное озеро чуть больше снимка
  const osm = grid.osm, near = osm ? new Uint8Array(W * H) : null; if (near) for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) if (osm[j * W + i] === 128) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) near[(j + b) * W + i + a] = 1;
  const top = top0 ?? hs[j0 * W + i0] + 45, R = 45, cells = new Uint8Array(W * H), q = [j0 * W + i0]; cells[q[0]] = 1;
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % W, j = (k / W) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b, kk = jj * W + ii;
    if (ii < 0 || jj < 0 || ii >= W || jj >= H || cells[kk] || Math.hypot(ii - i0, jj - j0) > R || hs[kk] > top) continue; if (near && !near[kk]) continue; cells[kk] = 1; q.push(kk); } }
  if (carve) { const dist = new Float32Array(W * H).fill(1e9), b = []; // расстояние до берега (в клетках)
    for (const k of q) { const i = k % W, j = (k / W) | 0; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells[(j + c) * W + i + a]) { dist[k] = 1; b.push(k); break; } }
    for (let h = 0; h < b.length; h++) { const k = b[h], i = k % W, j = (k / W) | 0; for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (j + c) * W + i + a; if (cells[kk] && dist[kk] > dist[k] + 1) { dist[kk] = dist[k] + 1; b.push(kk); } } }
    for (const k of q) hs[k] = Math.min(hs[k], top - 4 - 58 * Math.pow(Math.min(1, (dist[k] - 1) / 6), 0.7)); }
  return { top, cells, q, W }; }

export function makeMerz(scene, zone) {
  const { hs, W, H, X0, Y1, STEP } = zone.grid, p = zone.poi.merz, B = lakeBowl(zone.grid, p.X, p.Y, false, zone.merzTop), top = B.top, bed = top - 50, cells = B.cells, q = B.q;
  let mi = W, ma = 0, mj = H, mb = 0, deep = q[0]; for (const k of q) { const i = k % W, j = (k / W) | 0; mi = Math.min(mi, i); ma = Math.max(ma, i); mj = Math.min(mj, j); mb = Math.max(mb, j); if (hs[k] < hs[deep]) deep = k; }
  mi = Math.max(0, mi - 1); mj = Math.max(0, mj - 1); ma = Math.min(W - 1, ma + 1); mb = Math.min(H - 1, mb + 1);
  // сток -- край чаши, ближайший к Южному Иныльчеку (самая низкая клетка на краю): там воронка
  let out = deep; { let best = 1e9; for (const k of q) { const i = k % W, j = (k / W) | 0; let edge = false; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells[(j + b) * W + i + a]) edge = true; if (edge && hs[k] < best) { best = hs[k]; out = k; } } }
  const oX = X0 + (out % W) * STEP, oY = Y1 - ((out / W) | 0) * STEP;
  // текстура дна чаши: высота рельефа (для отсечения воды)
  const tw = ma - mi + 1, th = mb - mj + 1, bedT = new Uint16Array(tw * th); // половинная точность: линейная фильтрация есть на всех WebGL2 (float -- не везде)
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) bedT[j * tw + i] = THREE.DataUtils.toHalfFloat(cells[(mj + j) * W + mi + i] ? hs[(mj + j) * W + mi + i] : 60000);
  const tex = new THREE.DataTexture(bedT, tw, th, THREE.RedFormat, THREE.HalfFloatType); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const bx0 = X0 + mi * STEP, by1 = Y1 - mj * STEP, bw = (tw - 1) * STEP, bh = (th - 1) * STEP;
  const geo = new THREE.PlaneGeometry(bw, bh, Math.min(160, tw * 2), Math.min(160, th * 2)); geo.rotateX(-Math.PI / 2); const org = new THREE.Vector3(bx0 + bw / 2, 0, -(by1 - bh / 2)); // вершины -- от середины озера (точность)
  const U = { ...ENV, uLevel: { value: top }, uBed: { value: tex }, uB: { value: new THREE.Vector4(bx0, by1, 1 / bw, 1 / bh) }, uT: { value: 0 }, uBoil: { value: 0 }, uOut: { value: new THREE.Vector2(oX, oY) }, uOrg: { value: org } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, transparent: true, depthWrite: true, extensions: { derivatives: true },
    vertexShader: `uniform float uLevel; uniform vec3 uOrg; varying vec3 vP; void main(){ vec3 p=position; p.y=uLevel; vP=p+uOrg; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: GLSL_COMMON + `uniform sampler2D uBed; uniform vec4 uB; uniform float uLevel, uT, uBoil; uniform vec2 uOut; varying vec3 vP;
void main(){ vec2 w=vec2(vP.x,-vP.z), uv=vec2((w.x-uB.x)*uB.z, (uB.y-w.y)*uB.w); float bed=texture2D(uBed, uv).r, dep=uLevel-bed; if(dep<0.3) discard;
  // ледниковая вода: мутно-бирюзовая, у берега светлее; айсберговая шуга
  vec3 c=mix(vec3(0.42,0.66,0.70), vec3(0.16,0.40,0.50), smoothstep(1.,25.,dep));
  float n=vnoise(w*0.02+uT*0.03), n2=vnoise(w*0.11-uT*0.05); c=mix(c, vec3(0.78,0.86,0.88), smoothstep(0.62,0.8,n*0.6+n2*0.4)*0.5);
  // прорыв: к стоку -- воронка, вода кипит: спиральная пена, рябь, белые гребни
  vec2 d=w-uOut; float r=length(d), a=atan(d.y,d.x), wob=vnoise(w*0.012+uT*0.2)*3.1, sp=sin(a*3.+r*0.045+wob-uT*3.4/(0.4+r/300.)), cl=exp(-r/300.)*uBoil;
  float foam=smoothstep(0.6,0.95,sp*0.45+0.5+(vnoise(w*0.05+uT*0.5)-0.5)*0.9)*cl*1.7+smoothstep(0.72,0.95,vnoise(w*0.07+uT*0.6)+exp(-r/900.)*0.25)*uBoil*0.45; // воронка у стока -- рваная спираль; по озеру -- кипящие пятна пены
  c=mix(c, vec3(0.93,0.96,0.97), clamp(foam,0.,0.9)); c*=1.-0.25*exp(-r/140.)*uBoil;
  float l=max(uSun.y,0.)*uSunI; c*=0.55+0.6*l; c=mix(c, uHor, 0.18);
  c=applyFog(c, length(vP-cameraPosition), vP.y);
  gl_FragColor=vec4(c, smoothstep(0.3,2.,dep)*0.95); ${END} }` });
  const water = new THREE.Mesh(geo, mat); water.position.copy(org); water.renderOrder = 1; water.frustumCulled = false; scene.add(water); // вершины поднимаются на уровень в шейдере -- границы по плоскости на нуле врали: у воды озеро «выпадало из кадра»
  // айсберги с физикой (icebergs.js): мелкие плавают, сталкиваются, переворачиваются; большие -- неподвижные глыбы
  const ice = makeIcebergs(scene, { cells: q, grid: zone.grid, h: zone.h, front: { X: X0 + (out % W) * STEP, Y: Y1 - ((out / W) | 0) * STEP }, mid: { X: X0 + (deep % W) * STEP, Y: Y1 - ((deep / W) | 0) * STEP } });
  let level = top, force0 = 0, boomT = 0;
  const cX = X0 + (deep % W) * STEP, cY = Y1 - ((deep / W) | 0) * STEP;
  return { iceStep(dt, boat, wind, bump) { this.iceExt = true; ice.update(dt, level, wind, boat, bump); }, ice, top, bed, out: { X: oX, Y: oY }, center: { X: cX, Y: cY }, water,
    force() { force0 = Date.now(); }, get phase() { return merzPhase(Date.now(), force0); },
    // dt -- шаг; cam -- позиция камеры (мир); audio -- для грохота
    update(dt, camW, audio, spray, boat = null, wind = null, bump = null) { const ph = merzPhase(Date.now(), force0); U.uT.value += dt;
      // уровень: прорыв -- быстрый спад в первые 20 минут, потом остатки; покой -- наполнение
      const want = this.hold ? top : ph.active ? bed + (top - bed) * Math.max(0, 1 - Math.pow(ph.k * 3, 0.8)) : bed + (top - bed) * Math.min(1, ph.k * 1.2);
      level += (want - level) * Math.min(1, dt * (this.hold ? 3 : 0.3)); U.uLevel.value = level; const boil = this.hold ? 0 : ph.active ? Math.max(0.25, 1 - ph.k * 1.5) : 0; U.uBoil.value += (boil - U.uBoil.value) * Math.min(1, dt);
      if (!this.iceExt) ice.update(dt, level, wind, boat, bump); this.iceExt = false; // на озере лёд считает шаг физики (iceStep)
      // рядом с прорывом -- грохот и обвалы: чем ближе, тем громче
      const d = camW ? Math.hypot(camW.X - oX, camW.Y - oY) : 1e9, near = Math.max(0, 1 - d / 9000) * U.uBoil.value;
      if (near > 0.02) { boomT -= dt; if (boomT <= 0) { boomT = 0.6 + Math.random() * 3.5; audio && audio.thump && audio.thump(0.4 + near * 1.2); // обрушение льда
          if (spray) for (let i = 0; i < 18; i++) spray.emit(oX + (Math.random() - 0.5) * 300, level + 2, -(oY + (Math.random() - 0.5) * 300), (Math.random() - 0.5) * 14, 8 + Math.random() * 16, (Math.random() - 0.5) * 14, 6, 1, 1); } }
      return near; } };
}
