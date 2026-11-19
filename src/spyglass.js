// Подзорная труба: смотреть с палубы в окуляр, ловить на горизонте суда, вершины и посёлки и собирать их в атлас.
//
// Петля удовольствия:
//   - поднёс трубу -- латунная оправа выезжает, мир за кругом гаснет, картинка «доводится» по резкости;
//   - дрожь рук: на качке видоискатель гуляет, но если не двигать трубу, рука успокаивается (задержал дыхание);
//   - навёл на цель и держишь -- уголки рамки сходятся с тиканьем, цель опознана: имя и дальность;
//   - новая цель -- вспышка, звон и запись в атлас; мелкие и дальние видны только на большой кратности, поэтому
//     их надо «дотянуть» колесом или щипком; пароход и катер милиции попадаются редко.
// Оптика -- в комикс-обработке (post.js): круглая диафрагма, бочка, цветная кайма к краю, виньетка, блик
// просветления, расфокус при смене кратности. Без обработки остаётся круг из CSS -- труба работает и так.
import * as THREE from 'three';
import { RIVER } from './river.js';
import { PEAKS } from './peaks.js';

const R_EARTH = 14866000; // как в шейдерах (curve): видимое опускание дальних предметов из-за кривизны
const NAMES = { kayak: 'Каяк', scull: 'Академическая одиночка', sup: 'SUP-доска', jetski: 'Гидроцикл', boat: 'Моторный катер', steamer: 'Пароход', fishing: 'Промысловое судно', police: 'Катер милиции', yacht: 'Яхта' };
const SIZE = { kayak: 5, scull: 8, sup: 3.5, jetski: 3, boat: 7, steamer: 60, fishing: 25, police: 7, yacht: 11 };
const RARE = { steamer: 3, police: 2, fishing: 2 };
const DIRS = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
const km = (d) => (d >= 1000 ? `${(d / 1000).toFixed(d < 10000 ? 1 : 0).replace('.', ',')} км` : `${Math.round(d / 10) * 10} м`);

export function makeSpyglass({ G, camera, post, audio, store, ach, $, extra }) {
  const s = { hold: false, holdT: 0, show: 0, on: false, a: 0, yaw: 0, pitch: 0, zoom: 6, zoomT: 6, f: 0, fv: 0, still: 0, panV: 0, t: 0, lock: null, prog: 0, cand: null, tick: 0, info: 0 };
  const found = new Set(store.get('atlas') || []);
  let fixed = null; // неподвижные цели: вершины, посёлки, ущелье -- считаются один раз
  const v3 = new THREE.Vector3(), eye = new THREE.Vector3();

  function fixedTargets() {
    if (fixed) return fixed; fixed = [];
    // вершины: именованные пики OpenStreetMap (peaks.js) в пределах карты; высота -- верх рельефа в радиусе 400 м
    const { W, H, X0, Y1, STEP } = G.far.userData.grid;
    PEAKS.forEach(([name, X, Y], k) => { if (X < X0 || X > X0 + (W - 1) * STEP || Y > Y1 || Y < Y1 - (H - 1) * STEP) return; let y = -1e9, bx = X, by = Y;
      for (const [dx, dy] of [[0, 0], [300, 0], [-300, 0], [0, 300], [0, -300], [200, 200], [-200, -200], [200, -200], [-200, 200]]) { const hh = G.h(X + dx, Y + dy); if (hh > y) { y = hh; bx = X + dx; by = Y + dy; } }
      if (y < 300) return; fixed.push({ id: 'pk:' + name, cat: 'Вершины', name: `${name} · ≈${(Math.round((y + 1601) / 50) * 50).toLocaleString('ru-RU')} м`, X: bx, Y: by, y, size: 700, rare: y + 1601 > 5000 ? 2 : 1, peak: true }); });
    const mid = RIVER.x.length >> 1;
    for (const [id, name, X, Y, size] of [['t_cholpon', 'Чолпон-Ата', 0, 1500, 900], ['t_balykchy', 'Балыкчы', -73700, -21000, 1500], ['t_karakol', 'Каракол', 107300, -17800, 1500], ['gorge', 'Ущелье Чон-Ак-Суу', RIVER.x[mid], RIVER.y[mid], 900]])
      fixed.push({ id, cat: 'Берега', name, X, Y, y: Math.max(0, G.h(X, Y)) + 20, size, rare: 1 });
    return fixed;
  }
  // все цели в этот момент: неподвижные + суда (трафик, соперники, другие игроки) + флаг клуба и мыс
  function targets() {
    const out = fixedTargets().slice(), tr = extra.traffic;
    if (tr) for (const e of tr.list) if (e.model.root.visible) out.push({ id: 'v_' + e.type, cat: 'Суда', name: NAMES[e.type] || e.type, obj: e.model.root, size: SIZE[e.type] || 6, rare: RARE[e.type] || 1 });
    if (G.mode === 'race') for (const e of G.rivals) if (!e.out && e.model.root.visible) out.push({ id: 'v_yacht', cat: 'Суда', name: `Яхта «${e.name}»`, obj: e.model.root, size: 11, rare: 1 });
    const net = extra.net; if (net) for (const p of net.pups.values()) if (p.model.root.visible && !p.npc) out.push({ id: 'player', cat: 'Люди', name: `Игрок ${p.name}`, obj: p.model.root, size: 8, rare: 2 });
    if (G.shore.flag) out.push({ id: 'flag', cat: 'Берега', name: 'Флаг яхт-клуба', obj: G.shore.flag, size: 3, rare: 1 });
    if (G.shore.cape) out.push({ id: 'cape', cat: 'Берега', name: 'Мыс', X: G.shore.cape.X, Y: G.shore.cape.Y, y: Math.max(0, G.h(G.shore.cape.X, G.shore.cape.Y)) + 4, size: 120, rare: 1 });
    return out;
  }
  const TOTAL = () => fixedTargets().length + Object.keys(NAMES).length + 3; // типы судов с яхтой + игрок, флаг, мыс

  // ---------- вид ----------
  function open() { if (s.on || G.mode === 'menu') return; s.on = true; s.a = s.a || 0; s.lock = null; s.prog = 0; s.f = 1.3; s.fv = 0; s.still = 0;
    camera.getWorldDirection(v3); s.yaw = Math.atan2(v3.x, -v3.z); s.pitch = 0.01; s.zoom = s.zoomT;
    document.body.classList.add('spy'); $('spy').hidden = false; audio.spy && audio.spy(true); counter();
    if (!store.get('spyHelp')) { store.set('spyHelp', 1); $('spyhelp').hidden = false; setTimeout(() => { $('spyhelp').hidden = true; }, 6500); } }
  // опознание -- только пока зажат палец или кнопка мыши (без сдвига): через полсекунды выезжают уголки
  function holdStart() { if (!s.on) return; s.hold = true; s.holdT = 0; s.prog = 0; s.lock = null; s.cand = null; s.tick = 0; }
  function holdEnd() { if (!s.hold) return; s.hold = false; s.show = s.lock ? 2.2 : 0; if (!s.lock) { $('spybr').hidden = true; $('spylab').hidden = true; } }
  function close() { if (!s.on) return; s.on = false; s.hold = false; s.show = 0; camera.near = 0.5; camera.updateProjectionMatrix(); document.body.classList.remove('spy'); $('spy').hidden = true; $('spybr').hidden = true; $('spylab').hidden = true; if (post && post.setSpy) post.setSpy(0, 0); audio.spy && audio.spy(false); }
  function pan(dx, dy) { const fov = fovRad(), k = fov / Math.max(240, window.innerHeight); s.yaw -= dx * k; s.pitch = Math.max(-0.35, Math.min(0.6, s.pitch + dy * k)); s.panV += Math.hypot(dx, dy) * k; s.still = 0; }
  function zoomBy(f) { const z0 = s.zoomT; s.zoomT = Math.max(2, Math.min(24, s.zoomT * f)); for (const d of [4, 8, 12, 16, 20]) if ((z0 - d) * (s.zoomT - d) < 0) { audio.tick && audio.tick(1400 + d * 30); s.f = Math.max(s.f, 0.55); } s.still = 0; }
  const fovRad = () => 2 * Math.atan(Math.tan((56 * Math.PI) / 360) / s.zoom);

  // видимое положение точки мира в окуляре; null -- за спиной
  function project(X, y, Y, W, H) { const d2 = (X - eye.x) ** 2 + (-Y - eye.z) ** 2; v3.set(X, y - d2 / R_EARTH, -Y); const dist = Math.sqrt(d2 + (y - eye.y) ** 2);
    const c = v3.clone().applyMatrix4(camera.matrixWorldInverse); if (c.z > -1) return null; v3.project(camera); return { x: (v3.x + 1) * W / 2, y: (1 - v3.y) * H / 2, dist }; }
  // закрыт ли рельефом: луч от глаза к цели (в «изогнутом» мире -- рельеф опускается так же, как цель)
  function hidden(X, y, Y, dist) { const n = 28; for (let i = 1; i < n; i++) { const t = i / n; if (t * dist > dist - 400) break; const x = eye.x + (X - eye.x) * t, zz = eye.z + (-Y - eye.z) * t, d = t * dist;
      const line = eye.y + (y - dist * dist / R_EARTH - eye.y) * t, ground = Math.max(0, G.h(x, -zz)) - d * d / R_EARTH; if (ground > line + 2) return true; } return false; }
  // дальномер: где луч из центра упирается в рельеф (или в воду)
  function range() { camera.getWorldDirection(v3); let d = 30; for (let i = 0; i < 90; i++, d *= 1.09) { const x = eye.x + v3.x * d, y = eye.y + v3.y * d, z = eye.z + v3.z * d, drop = d * d / R_EARTH;
      if (y - drop < Math.max(0, G.h(x, -z))) return d; if (d > 150000) break; } return null; }

  function place(dt, b) {
    s.t += dt; s.a = Math.min(1, s.a + dt * 3.2);
    const root = G.player.model.root; if (b.eye) eye.set(b.eye[0], b.eye[1] + 0.25, b.eye[2]); else eye.set(-b.crew * 0.35, 2.4, 3.3); root.localToWorld(eye);
    // кратность доводится плавно; при смене -- расфокус, который возвращается с лёгким перелётом (пружина)
    const z0 = s.zoom; s.zoom += (s.zoomT - s.zoom) * Math.min(1, dt * 7); if (Math.abs(s.zoom - z0) > 0.02) s.f = Math.max(s.f, 0.35);
    s.fv += (-38 * s.f - 7.5 * s.fv) * dt; const f0 = s.f; s.f += s.fv * dt; if (f0 > 0.04 && s.f <= 0.04 && s.fv < 0) audio.tick && audio.tick(2600, 0.012);
    // дрожь: качка и волна передаются в руку, спокойная рука через секунду дрожит втрое меньше
    s.still += dt; s.panV *= Math.exp(-dt * 6); const calm = 1 - 0.68 * Math.min(1, Math.max(0, s.still - 0.6) / 1.2);
    const amp = (0.0006 + 0.012 * Math.min(1, Math.abs(b.p || 0) * 0.5 + Math.abs(b.phi) * 0.15)) * calm, T = s.t;
    const jy = amp * (Math.sin(T * 4.3) * 0.6 + Math.sin(T * 7.9 + 1.3) * 0.3 + Math.sin(T * 1.7 + 0.4) * 0.6), jp = amp * (Math.sin(T * 5.1 + 2.1) * 0.6 + Math.sin(T * 2.3) * 0.5 + Math.sin(T * 9.7) * 0.2);
    const yaw = s.yaw + jy, pit = s.pitch + jp, cp = Math.cos(pit);
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.x + Math.sin(yaw) * cp, eye.y + Math.sin(pit), eye.z - Math.cos(yaw) * cp); camera.rotateZ(-b.phi * 0.12);
    // ближняя плоскость отодвинута: своя палуба в окуляр не видна, а точность глубины на 40 км -- метры, а не 190 м
    // (иначе дальняя и ближняя сетки рельефа «спорят» и на южном берегу всё мерцает)
    camera.near = 20; camera.fov = (fovRad() * 180) / Math.PI; if (camera.view && camera.view.enabled) camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if (post && post.setSpy) post.setSpy(s.a, Math.min(1.4, Math.abs(s.f)));
    hud(dt, amp);
  }

  // ---------- опознание целей ----------
  function hud(dt, amp) {
    info(dt); const br0 = $('spybr'), lab0 = $('spylab');
    if (!s.hold) { if (s.show > 0) { s.show -= dt; if (s.show <= 0) { br0.hidden = true; lab0.hidden = true; s.lock = null; } else lab0.style.opacity = String(Math.min(1, s.show / 0.6)); } return; }
    s.holdT += dt; lab0.style.opacity = '1'; if (s.holdT < 0.5) return; // полсекунды тишины: случайное касание ничего не показывает
    const W = window.innerWidth, H = window.innerHeight, Rpx = Math.min(W, H) * 0.46, f = (H / 2) / Math.tan(fovRad() / 2);
    let best = null;
    for (const t of targets()) { let X, Y, y; if (t.obj) { t.obj.getWorldPosition(v3); X = v3.x; Y = -v3.z; y = v3.y + (t.size > 20 ? t.size * 0.15 : 1.2); } else { X = t.X; Y = t.Y; y = t.y; }
      const dist = Math.hypot(X - eye.x, -Y - eye.z); if (dist < 25 || dist > (t.peak ? 110000 : 14000)) continue;
      const p = project(X, y, Y, W, H); if (!p) continue; const off = Math.hypot(p.x - W / 2, p.y - H / 2); if (off > Rpx * 0.95) continue;
      const px = (t.size / dist) * f; // размер цели в окуляре, пикселей
      const score = off / Math.max(30, Math.min(px * 0.6, Rpx * 0.3));
      if (score < (t.peak ? 0.6 : 1) && (!best || score < best.score) && !hidden(X, y, Y, dist)) best = { t, p, px, dist, score, X, Y, y }; }
    const br = $('spybr'), lab = $('spylab');
    if (!best) { s.cand = null; s.prog = Math.max(0, s.prog - dt * 2); br.hidden = true; if (!s.lock) lab.hidden = true; }
    else {
      const same = s.cand && s.cand.t.id === best.t.id && s.cand.t.name === best.t.name; s.cand = best; if (!same) { s.prog = 0; s.lock = null; s.tick = 0; }
      const small = best.px < 13; // не разглядеть: надо больше кратности
      const steady = Math.max(0, 1 - amp / 0.006) * Math.max(0, 1 - s.panV * 25);
      if (!small && !s.lock) { s.prog = Math.min(1, s.prog + dt * (0.6 + 1.4 * steady)); const q = Math.floor(s.prog * 6); if (q > s.tick) { s.tick = q; audio.tick && audio.tick(800 + q * 160, 0.03); } }
      if (s.prog >= 1 && !s.lock) lockOn(best);
      const sz = Math.max(26, Math.min(Rpx * 0.7, best.px * 1.15)) * (s.lock ? 1 : 1 + 0.9 * (1 - s.prog));
      br.hidden = false; br.className = s.lock ? 'lock' : small ? 'far' : ''; Object.assign(br.style, { left: `${best.p.x}px`, top: `${best.p.y}px`, width: `${sz}px`, height: `${sz}px` });
      lab.hidden = false; lab.style.left = `${best.p.x}px`; lab.style.top = `${best.p.y + sz / 2 + 8}px`;
      lab.textContent = s.lock ? `${best.t.name} · ${km(best.dist)}` : small ? 'приблизьте' : '';
      lab.hidden = !lab.textContent;
    }
  }
  // пеленг, дальность, кратность
  function info(dt) {
    s.info -= dt; if (s.info <= 0) { s.info = 0.15; const brg = ((s.yaw * 180) / Math.PI % 360 + 360) % 360, d = range();
      $('spyinfo').textContent = `${Math.round(s.zoom)}× · ${DIRS[Math.round(brg / 22.5) % 16]} ${Math.round(brg)}°${d ? ' · ' + km(d) : ''}`; }
  }
  function lockOn(c) { s.lock = c.t.id; const isNew = !found.has(c.t.id); const r = c.t.rare || 1;
    if (isNew) { found.add(c.t.id); store.set('atlas', [...found]); audio.spyFound && audio.spyFound(r); flash(r);
      $('spynew').textContent = `${r >= 3 ? 'Редкая находка! ' : r === 2 ? 'Ценная находка! ' : 'Новое в атласе: '}${c.t.name}`; $('spynew').classList.remove('go'); void $('spynew').offsetWidth; $('spynew').classList.add('go');
      counter(); ach('spy_first'); if (c.t.id === 'v_steamer') ach('spy_steamer'); if (c.t.id === 'v_police') ach('spy_police'); if (c.dist > 30000) ach('spy_far');
      if ([...found].filter((k) => k.startsWith('pk:')).length >= 5) ach('spy_peaks'); if (found.size >= TOTAL()) ach('spy_all'); renderAtlas(); }
    else audio.spyKnown && audio.spyKnown(); }
  function flash(r) { const el = $('spyflash'); el.className = ''; void el.offsetWidth; el.className = r >= 2 ? 'go rare' : 'go'; }
  function counter() { $('spycnt').textContent = `Атлас ${found.size}/${TOTAL()}`; }
  // атлас в журнале: найденные -- по именам, ненайденные -- «???»
  function renderAtlas() { const el = $('atlas'); if (!el) return; const all = [...fixedTargets(), ...Object.keys(NAMES).filter((k) => k !== 'yacht').map((k) => ({ id: 'v_' + k, cat: 'Суда', name: NAMES[k] })),
      { id: 'v_yacht', cat: 'Суда', name: 'Яхта соперника' }, { id: 'player', cat: 'Люди', name: 'Другой игрок' }, { id: 'flag', cat: 'Берега', name: 'Флаг яхт-клуба' }, { id: 'cape', cat: 'Берега', name: 'Мыс' }];
    const cats = {}; for (const t of all) (cats[t.cat] = cats[t.cat] || []).push(t);
    const chips = (c, l) => { if (c !== 'Вершины') return l.map((t) => `<span class="${found.has(t.id) ? 'on' : ''}">${found.has(t.id) ? t.name : '???'}</span>`).join(''); const got = l.filter((t) => found.has(t.id));
      return got.map((t) => `<span class="on">${t.name}</span>`).join('') + `<span>ещё ${l.length - got.length} — ищите в трубу</span>`; };
    el.innerHTML = `<h3>Атлас подзорной трубы · ${all.filter((t) => found.has(t.id)).length}/${all.length}</h3>` + Object.entries(cats).map(([c, l]) => `<div class="acat">${c}</div><div class="achips">${chips(c, l)}</div>`).join(''); }

  return { _s: s, targets, holdStart, holdEnd, get on() { return s.on; }, open, close, toggle() { if (s.on) close(); else open(); }, pan, zoomBy, place, renderAtlas };
}
