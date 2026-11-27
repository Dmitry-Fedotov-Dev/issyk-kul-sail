// Озеро Мерцбахера: ледниково-подпрудное озеро в устье Северного Иныльчека, запертое льдом Южного Иныльчека.
// Как в статьях (Ng, Liu 2009; Kingslake, Ng 2013; Hagg et al. 2008): летом талая вода наполняет озеро (до 2 м в сутки),
// с айсбергами от фронта ледника; достигнув порога, вода поднимает и размывает ледяную плотину и уходит под ледник --
// озеро пустеет за дни, расход до 1000 м³/с, на дне остаются глыбы льда; вал воды идёт вниз по Иныльчеку к Тариму.
// В игре цикл сжат: час «кипит» (прорыв: воронка у плотины, пена, обвалы льда, грохот, уровень падает), час отдыхает
// (наполняется). Цикл -- по общим часам, у всех игроков одинаковый. force -- прорыв «сейчас» (старт «Мерцбахер»).
import * as THREE from 'three';
import { ENV, GLSL_COMMON, END } from './world.js';
import { makeIcebergs } from './icebergs.js';
import { makeMerzFx } from './merzfx.js';
import { MERZSIM, MERZFLOW } from './merzsim.js';

const PERIOD = 7200; // с: час прорыва + час покоя
export function merzPhase(now = Date.now(), force0 = 0) { const t = force0 ? (now - force0) / 1000 : (now / 1000) % PERIOD; if (t < 0) return { active: false, k: 1, wait: -t }; if (force0 && t >= PERIOD) return merzPhase(now, 0); return { active: t < 3600, k: (t % 3600) / 3600, tg: t < 3600 ? t : 0 }; } // force0 в будущем -- ждём полным

export { lakeBowl } from './lakebowl.js';
import { lakeBowl } from './lakebowl.js';

export function makeMerz(scene, zone) {
  const { hs, W, H, X0, Y1, STEP } = zone.grid, p = zone.poi.merz, B = lakeBowl(zone.grid, p.X, p.Y, false, zone.merzTop), top = B.top, bed = top - 88, cells = B.cells, q = B.q; // пустое озеро -- до дна чаши (Ng & Liu 2009: опустошается целиком)
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
  const U = { ...ENV, uLevel: { value: top }, uBed: { value: tex }, uB: { value: new THREE.Vector4(bx0, by1, 1 / bw, 1 / bh) }, uT: { value: 0 }, uBoil: { value: 0 }, uOut: { value: new THREE.Vector2(oX, oY) }, uOrg: { value: org }, uRing: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -1, 0)) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, defines: { FBM_OCT: 2, RIP_OCT: 2, SHN: 4 }, transparent: true, depthWrite: true, extensions: { derivatives: true },
    // кольцевые волны от обвалов: uRing[i] = (X, Y, возраст с, амплитуда м); фронт идёт ~14 м/с, гребень гаснет с расстоянием
    vertexShader: `uniform float uLevel; uniform vec3 uOrg; uniform vec4 uRing[8]; varying vec3 vP; varying float vWave;
float rw(vec2 w){ float s=0.; for(int i=0;i<8;i++){ vec4 r=uRing[i]; if(r.z<0.) continue; float d=length(w-r.xy), R=r.z*14., x=(d-R)/18.; s+=r.w*exp(-x*x)*cos(x*2.4)/sqrt(1.+d/40.)*exp(-r.z/40.); } return s; }
void main(){ vec3 p=position; vec2 w=vec2(p.x+uOrg.x,-(p.z+uOrg.z)); vWave=rw(w); p.y=uLevel+vWave; vP=p+uOrg; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
    fragmentShader: GLSL_COMMON + `uniform sampler2D uBed; uniform vec4 uB; uniform float uLevel, uT, uBoil; uniform vec2 uOut; varying vec3 vP; varying float vWave;
void main(){ vec2 w=vec2(vP.x,-vP.z), uv=vec2((w.x-uB.x)*uB.z, (uB.y-w.y)*uB.w); float bed=texture2D(uBed, uv).r, dep=uLevel-bed; if(dep<0.3) discard;
  // ледниковая вода: мутно-бирюзовая, у берега светлее; айсберговая шуга
  vec3 c=mix(vec3(0.42,0.66,0.70), vec3(0.16,0.40,0.50), smoothstep(1.,25.,dep));
  float n=vnoise(w*0.02+uT*0.03), n2=vnoise(w*0.11-uT*0.05); c=mix(c, vec3(0.78,0.86,0.88), smoothstep(0.62,0.8,n*0.6+n2*0.4)*0.5);
  // прорыв: к стоку -- воронка, вода кипит: спиральная пена, рябь, белые гребни
  vec2 d=w-uOut; float r=length(d), a=atan(d.y,d.x), wob=vnoise(w*0.012+uT*0.2)*3.1, sp=sin(a*3.+r*0.045+wob-uT*3.4/(0.4+r/300.)), cl=exp(-r/300.)*uBoil;
  float foam=smoothstep(0.6,0.95,sp*0.45+0.5+(vnoise(w*0.05+uT*0.5)-0.5)*0.9)*cl*1.7+smoothstep(0.72,0.95,vnoise(w*0.07+uT*0.6)+exp(-r/900.)*0.25)*uBoil*0.45*exp(-r/700.); // воронка у стока -- рваная спираль; по озеру -- кипящие пятна пены
  foam+=smoothstep(0.35,1.4,abs(vWave))*0.8; // гребни волн от обвалов -- пена
  c=mix(c, vec3(0.93,0.96,0.97), clamp(foam,0.,0.9)); c*=1.-0.25*exp(-r/140.)*uBoil;
  float l=max(uSun.y,0.)*uSunI; c*=0.55+0.6*l; c=mix(c, uHor, 0.18);
  c=applyFog(c, length(vP-cameraPosition), vP.y);
  gl_FragColor=vec4(c, smoothstep(0.3,2.,dep)*0.95); ${END} }` });
  const water = new THREE.Mesh(geo, mat); water.position.copy(org); water.renderOrder = 1; water.frustumCulled = false; scene.add(water); // вершины поднимаются на уровень в шейдере -- границы по плоскости на нуле врали: у воды озеро «выпадало из кадра»
  // айсберги с физикой (icebergs.js): мелкие плавают, сталкиваются, переворачиваются; большие -- неподвижные глыбы
  const ice = makeIcebergs(scene, { cells: q, grid: zone.grid, h: zone.h, front: { X: X0 + (out % W) * STEP, Y: Y1 - ((out / W) | 0) * STEP }, mid: { X: X0 + (deep % W) * STEP, Y: Y1 - ((deep / W) | 0) * STEP } });
  const fx = makeMerzFx(scene, { h: zone.h, ice });
  // ---- проигрывание расчёта (merzsim.js): уровень, расход, течения, обвалы -- по времени прорыва tg (0..3600 с) ----
  const SIM = MERZSIM, simAt = (arr, tg) => { const T = SIM.t; if (tg <= T[0]) return arr[0]; if (tg >= T[T.length - 1]) return arr[arr.length - 1]; let i = 1; while (T[i] < tg) i++; const a = (tg - T[i - 1]) / (T[i] - T[i - 1]); return arr[i - 1] + (arr[i] - arr[i - 1]) * a; };
  const FL = MERZFLOW.map((b) => { const s2 = atob(b), u = new Int8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = (s2.charCodeAt(i) << 24) >> 24; return u; }), G2 = SIM.grid;
  let flowK = 0; const flowAt = (X, Y) => { const i = Math.round((X - X0) / STEP) - G2.i0, j = Math.round((Y1 - Y) / STEP) - G2.j0; if (i < 0 || j < 0 || i >= G2.nx || j >= G2.ny) return null; const k = (j * G2.nx + i) * 2, f0 = FL[Math.floor(flowK)], f1 = FL[Math.min(FL.length - 1, Math.floor(flowK) + 1)], a = flowK % 1; return { u: (f0[k] * (1 - a) + f1[k] * a) * 0.05, v: (f0[k + 1] * (1 - a) + f1[k + 1] * a) * 0.05 }; };
  ice.setFlow((X, Y) => (U.uBoil.value > 0.02 ? flowAt(X, Y) : null));
  const oS = SIM.out; U.uOut.value.set(oS.X, oS.Y); let evI = 0, lastTg = -1, Qnow = 0;
  const ringAdd = (X, Y, A) => { const r = U.uRing.value; let k = 0; for (let i = 1; i < 8; i++) if (r[i].z < 0 || r[i].z > r[k].z) { if (r[k].z < 0) break; k = i; } r[k].set(X, Y, 0, A); };
  let level = top, force0 = 0, boomT = 0;
  const cX = X0 + (deep % W) * STEP, cY = Y1 - ((deep / W) | 0) * STEP;
  return { iceStep(dt, boat, wind, bump) { this.iceExt = true; ice.update(dt, level, wind, boat, bump); if (boat && U.uBoil.value > 0.02) { const f = flowAt(boat.X, boat.Y); if (f) { boat.X += f.u * dt; boat.Y += f.v * dt; } } }, /* лодку несёт течением прорыва */ ice, top, bed, out: { X: oX, Y: oY }, center: { X: cX, Y: cY }, water,
    force() { force0 = Date.now(); }, startIn(sec) { force0 = Date.now() + sec * 1000; }, get phase() { return merzPhase(Date.now(), force0); }, get level() { return level; }, get Q() { return Qnow; }, flowAt, events: SIM.events, fxLive: () => fx.live.length,
    // dt -- шаг; cam -- позиция камеры (мир); audio -- для грохота
    update(dt, camW, audio, spray, boat = null, wind = null, bump = null) { const ph = merzPhase(Date.now(), force0); U.uT.value += dt;
      // уровень: прорыв -- по расчёту (медленный разгон, обвальный конец), после -- дно; покой -- наполнение (в жизни -- за лето)
      const tg = ph.active ? ph.k * 3600 : -1; if (tg < lastTg) evI = 0; lastTg = tg;
      Qnow = tg >= 0 ? (tg > SIM.dur ? Math.max(0, simAt(SIM.Q, SIM.dur) * (1 - (tg - SIM.dur) / 60)) : simAt(SIM.Q, tg)) : 0;
      const want = this.hold ? top : tg >= 0 ? (tg > SIM.dur ? bed : top + simAt(SIM.level, tg)) : bed + (top - bed) * Math.min(1, ph.k * 1.25);
      level += (want - level) * Math.min(1, dt * 2); U.uLevel.value = level; U.uBoil.value += ((this.hold ? 0 : Math.min(1, Qnow / SIM.Qpk * 1.3)) - U.uBoil.value) * Math.min(1, dt);
      if (tg >= 0) flowK = Math.min(FL.length - 1.001, simAt(SIM.t.map((_, i) => i), Math.min(tg, SIM.dur)));
      // кольцевые волны стареют
      for (const r of U.uRing.value) if (r.z >= 0) { r.z += dt; ice.wave(r.x, r.y, r.z * 14, r.w * 0.6 * dt * 10); if (r.z > 90) r.z = -1; }
      // события расчёта: обвалы берегов и отколы плотины
      const camD = (X, Y) => (camW ? Math.hypot(camW.X - X, camW.Y - Y) : 1e9);
      while (tg >= 0 && evI < SIM.events.length && SIM.events[evI].t <= tg) { const e = SIM.events[evI++]; if (tg - e.t > 30) continue; const r = fx.event(e, level), dd = camD(e.X, e.Y), k = Math.max(0, 1 - dd / 7000);
        if (k > 0) { setTimeout(() => audio && audio.thump && audio.thump(Math.min(2, (0.5 + r.boom) * (0.3 + k))), Math.min(6000, dd / 340 * 1000)); if (this.onQuake) this.onQuake(k * Math.min(1, r.boom)); } } // звук идёт со скоростью звука
      fx.step(dt, level, spray, (X, Y, sz, E) => { ringAdd(X, Y, Math.min(4, 0.6 + sz * 0.12) * (0.5 + E)); // всплеск: столб брызг по энергии удара
        if (spray) { const n = Math.round(20 + sz * 6 * (0.5 + E)); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 4 + Math.random() * (6 + sz * 0.8); spray.emit(X + Math.cos(a) * sz * 0.4, level + 0.5, -(Y + Math.sin(a) * sz * 0.4), Math.cos(a) * v * 0.6, 6 + Math.random() * (10 + sz * 1.2) * (0.5 + E), -Math.sin(a) * v * 0.6, 5, 1, 1); } }
        const dd = camD(X, Y); if (dd < 5000 && this.onQuake) this.onQuake(Math.max(0, 1 - dd / 5000) * Math.min(1, sz / 20)); });
      if (!this.iceExt) ice.update(dt, level, wind, boat, bump); this.iceExt = false; // на озере лёд считает шаг физики (iceStep)
      // устье туннеля: вода уходит под лёд -- кипящая воронка, рёв и фонтаны брызг по расходу
      const d = camD(oS.X, oS.Y), near = Math.max(0, 1 - d / 9000) * U.uBoil.value;
      if (U.uBoil.value > 0.05) { boomT -= dt; if (boomT <= 0) { boomT = 0.3 + Math.random() * (2.5 - 2 * U.uBoil.value); if (near > 0.02 && audio && audio.thump) audio.thump(0.3 + near * 1.2);
          if (spray) for (let i = 0; i < 10 + U.uBoil.value * 40; i++) spray.emit(oS.X + (Math.random() - 0.5) * 160, level + 1, -(oS.Y + (Math.random() - 0.5) * 160), (Math.random() - 0.5) * 10, 4 + Math.random() * 14 * U.uBoil.value, (Math.random() - 0.5) * 10, 5, 1, 1); } }
      return near; } };
}
