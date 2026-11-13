import * as THREE from 'three';
import { TRAILS, RIVERS } from './trails.js';
import { Boat, Wind, Waves, PRESETS, DEG, KN, clamp, wrapPi, smooth, pointOfSail, aiControl } from './sim.js';
import { applyQuality, loadHeight, makeSky, makeTerrain, makeFarTerrain, makeWater, makeShore, makeMark, SUN, HAZE, ENV, MAP } from './world.js';
import { makeBoat } from './boatmodel.js';
import { makeSpray, makeWake, WAKE_LIGHT } from './fx.js';
import { makeAudio } from './audio.js';
import { installExtra } from './extra.js';
import { makePost, postSupported } from './post.js';
import { RIVER_HOLES } from './rivermode.js';

const $ = (id) => document.getElementById(id);
const store = { get(k) { try { return JSON.parse(localStorage.getItem('issyk.' + k)); } catch (e) { return null; /* хранилище недоступно -- играем без рекордов */ } },
  set(k, v) { try { localStorage.setItem('issyk.' + k, JSON.stringify(v)); } catch (e) { /* то же: рекорд просто не сохранится */ } } };

const canvas = $('gl');
// Если устройство умеет комикс-обработку, штатное сглаживание не включаем: контуры сглаживает сама обработка,
// а четыре копии кадра под MSAA -- самая большая статья расхода видеопамяти.
const POST_OK = postSupported();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !POST_OK, powerPreference: 'high-performance' });
const post = POST_OK ? makePost(renderer) : null;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// Резкость важнее эффектов. Разрешение держим высоким (до 2 пикселей на точку экрана), а при нехватке мощности сначала
// упрощаем графику ступенями и только потом, понемногу и не ниже 1, снижаем разрешение. Раньше оно падало до 0.55,
// и на телефоне всё разом становилось мыльным и квадратным -- тени, брызги, пена.
const PR_MAX = Math.min(window.devicePixelRatio || 1, 2), PR_MIN = Math.min(PR_MAX, TOUCH ? 1 : 0.85);
let pixelRatio = PR_MAX, quality = TOUCH ? 1 : 2, qHold = 0, qMode = 'auto'; // qMode: авто подстраивается само, остальные держат выбранное
function setQuality(q) { quality = q; applyQuality(q);
  sunL.castShadow = q >= 1; const ms = qMode === 'high' ? 2048 : 1024; if (sunL.shadow.mapSize.x !== ms) { sunL.shadow.mapSize.set(ms, ms); if (sunL.shadow.map) { sunL.shadow.map.dispose(); sunL.shadow.map = null; } } }
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(HAZE, 0.000052);
const camera = new THREE.PerspectiveCamera(56, 1, 0.5, 300000);
const sunL = new THREE.DirectionalLight(0xfff2dc, 3.1); sunL.position.copy(SUN); const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x5a7466, 1.9); scene.add(sunL, sunL.target, hemi);
// тень -- только вокруг лодки игрока: паруса и мачта затеняют палубу и корпус
sunL.castShadow = true; sunL.shadow.mapSize.set(1024, 1024); sunL.shadow.bias = -0.0006; sunL.shadow.normalBias = 0.03;
Object.assign(sunL.shadow.camera, { left: -9, right: 9, top: 13, bottom: -5, near: 1, far: 70 }); sunL.shadow.camera.updateProjectionMatrix();
// карта отражений: небо текущей погоды (и вода под горизонтом) снимается в кубическую текстуру -- её отражают борт, сталь, стекло
const pmrem = new THREE.PMREMGenerator(renderer), envRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), envCam = new THREE.CubeCamera(0.1, 10, envRT), envScene = new THREE.Scene();
let envTex = null;
function updateEnv(sky) { const m = sky.material; envScene.add(sky); m.uniforms.uEnvW.value = 1; sky.position.set(0, 0, 0); envCam.update(renderer, envScene); m.uniforms.uEnvW.value = 0; scene.add(sky);
  const old = envTex; envTex = pmrem.fromCubemap(envRT.texture).texture; scene.environment = envTex; if (old) old.dispose(); }
function resize() { const w = window.innerWidth, h = window.innerHeight; if (G) G.spray.uniforms.uScale.value = (h * pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360)); renderer.setPixelRatio(pixelRatio); if (post) setTimeout(() => post.resize(), 0); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);

const audio = makeAudio();
const input = { left: false, right: false, ease: false };
let G = null, X = null; // G -- всё состояние игры после загрузки; X -- снаряды, режимы и акватория (extra.js)

// экран загрузки: настоящие этапы подготовки, а не крутилка
const loadStep = async (pct, msg) => { $('loadfill').style.width = pct + '%'; $('loadmsg').textContent = msg; await new Promise((r) => setTimeout(r, 40)); };
async function init() {
  await loadStep(18, 'Читаем карту высот…');
  const { h, tex } = await loadHeight();
  const sky = makeSky(); scene.add(sky);
  scene.add(makeTerrain(h));
  await loadStep(38, 'Строим берега и хребты…');
  const far = await makeFarTerrain(RIVER_HOLES); scene.add(far);
  // Высота в любой точке котловины: у Чолпон-Аты -- по подробной карте, дальше -- по грубой (шаг 600 м)
  const hNear = h, NX0 = -MAP.OX * MAP.M, NX1 = (MAP.N - 1 - MAP.OX) * MAP.M, NY0 = (MAP.OY - (MAP.N - 1)) * MAP.M, NY1 = MAP.OY * MAP.M;
  const hA = (x, y) => (x > NX0 && x < NX1 && y > NY0 && y < NY1 ? hNear(x, y) : far.userData.heightAt(x, y));
  await loadStep(56, 'Наливаем озеро…');
  const water = makeWater(tex, 1); scene.add(water.mesh);
  const shore = makeShore(h, scene);
  const hb = (x, y) => Math.max(hA(x, y), shore.pierH(x, y)); // дно + причал: то, обо что можно удариться
  const wind = new Wind(PRESETS.santash, hA), waves = new Waves();
  const spray = makeSpray(); scene.add(spray.mesh);
  const mk = (opts, name, skill) => { const b = new Boat(); b.skill = skill; const model = makeBoat(opts), wake = makeWake(); scene.add(model.root, wake.mesh); return { b, model, wake, name, ai: {}, leg: 0, time: 0, prevA: 0 }; };
  const player = mk({ text: 'KGZ 7', hull: 0x143a6e, accent: '#ff7a1a' }, 'Вы', 1); // тёмно-синий лакированный борт, оранжевая ватерлиния
  // три яхты соперников (модели, паруса, карты мокрой палубы) создаются при первой регате, а не при загрузке
  const rivals = [], ensureRivals = () => { if (!rivals.length) rivals.push(mk({ hull: 0xf4f3ee, accent: '#1f6fd0', text: 'KGZ 21' }, 'Ала-Тоо', 0.95), mk({ hull: 0xe9c33c, accent: '#20242b', text: 'KGZ 4' }, 'Манас', 0.9), mk({ hull: 0x2f8f5a, accent: '#f4f3ee', text: 'KGZ 33' }, 'Чайка', 0.86)); };
  const marks = { W: makeMark(0xff7a1a), L: makeMark(0xffd21f), pin: makeMark(0xff3b30), com: makeMark(0x2f7de2) };
  for (const k in marks) { marks[k].visible = false; scene.add(marks[k]); }
  G = { ensureRivals, h: hA, hb, far, sky, water, shore, wind, waves, spray, player, rivals, marks, mode: 'menu', preset: store.get('preset') || 'santash', t: 0, race: null,
    cam: 0, camYaw: 0, orbit: 0, orbitP: 0, zoom: 1, orbitV: 0, shake: 0, hintT: 0, free: null, toastT: 0, frame: 0, slow: 0 };
  if (!PRESETS[G.preset]) G.preset = 'santash';
  X = installExtra({ G, scene, $, store, toast, audio, TOUCH, lens, fmt, placeBoat, showGame, setRivals, resetView, openWaterHeading, startRace: () => startRace() });
  buildMenu(); applyPreset(); toMenu(); resize();
  // Шейдеры собираются при первом показе каждого объекта, и это подвешивало меню на несколько секунд. Собираем всё
  // заранее, пока ещё виден экран загрузки, включая соперников и знаки, которые в меню скрыты (иначе фриз был бы
  // на старте регаты). Потом рисуем один кадр -- и только после этого открываем меню.
  await loadStep(74, 'Настраиваем свет, воду и небо…');
  setRivals(true); G.player.b.updatePose(G.waves, 0, G.h); for (const e of [G.player, ...G.rivals]) e.model.update(e.b, 0.016, 0);
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { console.warn('предварительная сборка шейдеров не удалась, соберутся по ходу', e); }
  updateCamera(0.016, G.player.b, 0); if (post) post.render(scene, camera); else renderer.render(scene, camera); setRivals(false);
  await loadStep(100, 'Отдать швартовы!');
  // снимок растворяется в живой сцене; меню появляется уже поверх неё
  clearInterval(window.__tipTimer); $('load').classList.add('done'); setTimeout(() => { $('load').hidden = true; }, 1500);
  requestAnimationFrame(loop);
}

function applyPreset() {
  const p = PRESETS[G.preset]; G.wind.set(p); G.waves.setFromWind(p.speed, p.dir * DEG, p.fetch); G.water.setWaves(G.waves);
  // небо и свет под погоду
  const k = p.sky; ENV.uCover.value = k.cover; ENV.uCirrus.value = k.cirrus; ENV.uStorm.value = k.storm; ENV.uCloudScale.value = k.scale; ENV.uSunI.value = k.sun;
  ENV.uHor.value.set(...k.hor); scene.fog.color.setRGB(...k.hor); sunL.intensity = 3.1 * k.sun; hemi.intensity = 1.9 * (1 - 0.35 * k.storm);
  G.wx = k; dayCycle(0);
  renderer.toneMappingExposure = 1.08 + 0.17 * k.sun * (1 - k.storm); // ясный день ярче
  updateEnv(G.sky); G.spray.uniforms.uLight.value = 0.35 + 0.65 * k.sun;
  store.set('preset', G.preset);
  for (const c of $('winds').children) c.setAttribute('aria-pressed', c.dataset.id === G.preset);
}
// Панель меню -- суша к северу от берега у Чолпон-Аты, нарисованная как топографическая карта по настоящим данным:
// кромка -- урез воды с карты высот, горизонтали через 100 м (каждая пятая толще), реки и ручьи и оранжевым пунктиром --
// тропы и грунтовки в горах из OpenStreetMap (src/trails.js). Масштаб один по обеим осям: берег и горы в настоящих
// пропорциях. На широком экране карта повёрнута: север справа (панель справа, озеро слева). На телефоне панель снизу,
// север вниз. Берег ставится так, чтобы вся колонка управления стояла на «суше» с запасом и ничего не легло на озеро.
const MENU = { lakeW: 600, lakeH: 300, boatT: 80, boatB: 320, phone: false };
let MLINES = null;
const parseLines = (str) => str.split(';').map((w) => { const a = w.split(','), p = []; for (let i = 0; i + 1 < a.length; i += 2) p.push([+a[i] * 4, +a[i + 1] * 4]); return p; });
function coastY(X) { let y = -9000; while (y < 8000 && G.h(X, y) < 0) y += 25; let a = y - 25, b = y; for (let k = 0; k < 9; k++) { const m = (a + b) / 2; if (G.h(X, m) < 0) a = m; else b = m; } return (a + b) / 2; }
// урез воды как изолиния h = 0 («марширующие квадраты»), сшитая в одну линию: проходит и вокруг мыса, и вглубь залива
function shoreline(X0, X1, Ya, Yb, nx, ny) { const gx = (i) => X0 + (X1 - X0) * i / nx, gy = (j) => Ya + (Yb - Ya) * j / ny, v = new Float32Array((nx + 1) * (ny + 1)), at = (i, j) => v[j * (nx + 1) + i];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = G.h(gx(i), gy(j));
  const pos = new Map(), adj = new Map(), H_ = (i, j) => 2 * (j * (nx + 1) + i), V_ = (i, j) => 2 * (j * (nx + 1) + i) + 1;
  const cross = (id, v0, v1, x0, y0, x1, y1) => { if ((v0 < 0) === (v1 < 0)) return null; if (!pos.has(id)) { const t = v0 / (v0 - v1); pos.set(id, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); } return id; };
  const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(q); } };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const e = [cross(H_(i, j), a, b, gx(i), gy(j), gx(i + 1), gy(j)), cross(V_(i + 1, j), b, c, gx(i + 1), gy(j), gx(i + 1), gy(j + 1)), cross(H_(i, j + 1), d, c, gx(i), gy(j + 1), gx(i + 1), gy(j + 1)), cross(V_(i, j), a, d, gx(i), gy(j), gx(i), gy(j + 1))].filter((x) => x !== null);
    if (e.length === 2) link(e[0], e[1]); else if (e.length === 4) { if ((a + b + c + d) / 4 < 0 === a < 0) { link(e[0], e[1]); link(e[2], e[3]); } else { link(e[0], e[3]); link(e[1], e[2]); } } }
  let best = [], used = new Set();
  for (const [st, nb] of adj) { if (used.has(st) || nb.length !== 1) continue; const ch = [st]; used.add(st); let cur = st;
    for (;;) { const nx2 = adj.get(cur).find((q) => !used.has(q)); if (nx2 === undefined) break; used.add(nx2); ch.push(nx2); cur = nx2; } if (ch.length > best.length) best = ch; }
  const out = best.map((id) => pos.get(id)); if (out.length && out[0][0] > out[out.length - 1][0]) out.reverse(); return out; }
function coastMask() { const W = window.innerWidth, H = window.innerHeight, ph = W <= 640, svg = $('coast'), q = (c) => svg.querySelector('.' + c);
  if (!MLINES) MLINES = { tr: parseLines(TRAILS), rv: parseLines(RIVERS) };
  const f = (v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`, XMIN = -16000, XMAX = 11500;
  let s, X0, X1, P, close, Ymin = 1e9, Ymax; const pts = [];
  // грубо -- где берег по Y, затем точная изолиния уреза в полосе вокруг него (с запасом на глубину залива)
  const sample = (n) => { let lo = 1e9, hi = -1e9; for (let i = 0; i <= 40; i++) { const y = coastY(X0 + (X1 - X0) * i / 40); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const Ya = lo - 300, Yb = hi + 2500, line = shoreline(X0 - 60, X1 + 60, Ya, Yb, n, Math.ceil(n * (Yb - Ya) / (X1 - X0 + 120))); for (const v of line) { pts.push(v); Ymin = Math.min(Ymin, v[1]); } };
  const fit = (span) => { span = Math.min(span, XMAX - XMIN); X0 = Math.max(XMIN, Math.min(XMAX - span, -span / 2)); X1 = X0 + span; };
  if (!ph) { // колонка управления: её левый край -- граница, правее которой только суша
    const cr = $('card').getBoundingClientRect(), cardL = cr.width ? cr.left : W - Math.min(W * 0.04, 48) - 440;
    s = clamp((W - cardL + 90) / 11000, 0.03, 0.09); fit(H / s); s = H / (X1 - X0); sample(Math.ceil(H / 2.5));
    let ym = -1e9; for (const v of pts) ym = Math.max(ym, v[1]); const ox = cardL - 40 - ym * s;
    P = (X, Y) => [ox + Y * s, (X - X0) * s]; Ymax = (W - ox) / s + 300; close = `L${W + 4},${H + 4} L${W + 4},-4 Z`;
    let mn = 1e9; for (const v of pts) mn = Math.min(mn, P(v[0], v[1])[0]); MENU.lakeW = mn - 60;
  } else { // телефон: яхта -- в полосе между заголовком и «Ваше имя», берег ниже середины экрана (верх листа -- над водой)
    const mt = $('mtop').getBoundingClientRect(), mb = $('mbot').getBoundingClientRect(), top = mb.height ? mb.top : H * 0.4;
    MENU.boatT = mt.height ? mt.bottom + 6 : H * 0.1; MENU.boatB = Math.max(MENU.boatT + 120, top - 4);
    const shore = Math.max(H * 0.6, top + 120); // самая северная точка уреза (дно залива)
    s = clamp((H - shore + 220) / 11000, 0.03, 0.12); fit(W / s); s = W / (X1 - X0); sample(Math.ceil(W / 1.5));
    let ym = -1e9; for (const v of pts) ym = Math.max(ym, v[1]); const oy = shore - ym * s;
    P = (X, Y) => [(X1 - X) * s, oy + Y * s]; Ymax = (H - oy) / s + 300; close = `L-4,${H + 4} L${W + 4},${H + 4} Z`;
    let mn = 1e9; for (const v of pts) mn = Math.min(mn, P(v[0], v[1])[1]); MENU.lakeH = mn - 24; }
  MENU.phone = ph; const line = 'M' + pts.map((v) => f(P(v[0], v[1]))).join(' L');
  q('f').setAttribute('d', `${line} ${close}`); q('l').setAttribute('d', line);
  // горизонтали: «марширующие квадраты» по сетке высот, клетка ~7 px
  const Y0 = Ymin - 60, nx = Math.min(240, Math.ceil((X1 - X0) * s / 7)), ny = Math.min(240, Math.ceil((Ymax - Y0) * s / 7)), gx = (i) => X0 + (X1 - X0) * i / nx, gy = (j) => Y0 + (Ymax - Y0) * j / ny, hs = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = G.h(gx(i), gy(j));
  let minor = '', major = ''; const at = (i, j) => hs[j * (nx + 1) + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1), mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d); if (mx < 100) continue;
    for (let lv = Math.max(100, Math.ceil(mn / 100) * 100); lv <= mx; lv += 100) { const e = [], cr = (v0, v1, x0, y0, x1, y1) => { if ((v0 < lv) !== (v1 < lv)) { const t = (lv - v0) / (v1 - v0); e.push(P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)); } };
      cr(a, b, gx(i), gy(j), gx(i + 1), gy(j)); cr(b, c, gx(i + 1), gy(j), gx(i + 1), gy(j + 1)); cr(c, d, gx(i + 1), gy(j + 1), gx(i), gy(j + 1)); cr(d, a, gx(i), gy(j + 1), gx(i), gy(j));
      for (let k = 0; k + 1 < e.length; k += 2) { const sgm = `M${f(e[k])} L${f(e[k + 1])} `; if (lv % 500 === 0) major += sgm; else minor += sgm; } } }
  q('c1').setAttribute('d', minor); q('c2').setAttribute('d', major);
  // реки и тропы: только то, что попадает в кадр
  const lines = (L) => { let out = ''; for (const w of L) { const p = w.map((v) => P(v[0], v[1])); if (!p.some((v) => v[0] > -20 && v[0] < W + 20 && v[1] > -20 && v[1] < H + 20)) continue; out += 'M' + p.map(f).join(' L') + ' '; } return out; };
  q('w').setAttribute('d', lines(MLINES.rv)); q('tr').setAttribute('d', lines(MLINES.tr)); }
function buildMenu() {
  coastMask(); let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(coastMask, 150); });
  for (const id in PRESETS) { const p = PRESETS[id], b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'w_' + id;
    b.innerHTML = `<b>${p.name}</b><small class="full">${p.sub}</small><small class="short">${p.sub.split(' · ')[1]}</small>`; b.onclick = () => { G.preset = id; applyPreset(); }; $('winds').appendChild(b); }
  $('how').innerHTML = TOUCH ? 'Касание слева и справа — руль. Кнопка «шкот» сбрасывает ветер из паруса, когда кренит. Против ветра лодка не идёт.' : $('how').innerHTML;
  const GFX = { auto: 'Авто', high: 'Высокая', low: 'Простая' };
  const setGfx = (m) => { qMode = GFX[m] ? m : 'auto'; store.set('gfx', qMode); pixelRatio = PR_MAX; setQuality(qMode === 'high' ? 2 : qMode === 'low' ? 0 : TOUCH ? 1 : 2); resize();
    for (const c of $('gfx').children) c.setAttribute('aria-pressed', c.dataset.id === qMode); };
  for (const id in GFX) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'g_' + id; b.innerHTML = `<b>${GFX[id]}</b>`; b.onclick = () => setGfx(id); $('gfx').appendChild(b); }
  setGfx(store.get('gfx') || 'auto');
  $('bfree').onclick = () => { audio.start(); startFree(); };
  $('brace').onclick = () => { audio.start(); X.compete(); };
  $('ragain').onclick = () => { if (G.mode === 'river') { $('result').hidden = true; $('briver').click(); } else X.compete(); }; $('rmenu').onclick = () => toMenu();
}

// выбрать курс вполветра, уводящий от берега
function openWaterHeading(X, Y) {
  let best = 0, bd = -1e9;
  for (const s of [90, -90, 120, -120, 60, -60]) { const th = G.wind.dir0 + s * DEG; let d = 0; for (const r of [150, 400, 800]) d += -G.h(X + Math.sin(th) * r, Y + Math.cos(th) * r); if (d > bd) { bd = d; best = th; } }
  return wrapPi(best);
}
function placeBoat(e, X, Y, th, v = 1.6) { if (e.model.dispose) e.model.dispose(); e.b.reset(X, Y, th); e.b.vx = Math.sin(th) * v; e.b.vy = Math.cos(th) * v; e.b.trim = 0.6; e.wake.reset(); e.leg = 0; e.time = 0; e.ai = {}; e.prevA = -1; }
function showGame(on) { $('game').hidden = !on; $('menu').hidden = on; $('result').hidden = true; if (!on) requestAnimationFrame(coastMask); }
function setRivals(v) { for (const r of G.rivals) { const on = v && !r.out; r.model.root.visible = on; r.wake.mesh.visible = on; } for (const k in G.marks) G.marks[k].visible = v; }

function toMenu() {
  $('brief').hidden = true; $('mark').hidden = true; if (X) X.toMenuCraft();
  G.mode = 'menu'; G.race = null; showGame(false); setRivals(false);
  const Y0 = Math.min(G.shore.pierY - 260, -150); placeBoat(G.player, 60, Y0, openWaterHeading(60, Y0), 2.5);
  G.camYaw = G.player.b.th + 2.4;
}
const GOALS = { speed: 'Пять узлов есть', tack: 'Оверштаг выполнен', gybe: 'Фордевинд выполнен', ease: 'Шкот потравлен вовремя', cape: 'Дошли до мыса' };
function startFree() {
  $('brief').hidden = true; $('mark').hidden = true; X.onFreePre();
  G.mode = 'free'; G.race = null; showGame(true); setRivals(false); $('race').hidden = true;
  const Y0 = G.shore.pierY - 70; placeBoat(G.player, 22, Y0, openWaterHeading(22, Y0), 1.2);
  G.free = { done: {}, dist: 0, max: 0, t: 0 }; G.camYaw = G.player.b.th; resetView(); X.onFree();
}
function goal(k) { X.ach(k); }

function startRace() {
  G.ensureRivals(); X.useYacht(); G.modeT = 0;
  const D = G.wind.dir0, up = { x: Math.sin(D), y: Math.cos(D) }, cr = { x: Math.cos(D), y: -Math.sin(D) };
  // в слабый ветер дистанция короче: гонка должна занимать 5-6 минут при любом ветре
  const kc = { breeze: 0.6, santash: 0.9, ulan: 1.0 }[G.preset], aW = 220 * kc, aL = -70 * kc;
  let S = { X: 200, Y: -750 };
  const pt = (a, l) => ({ X: S.X + up.x * a + cr.x * l, Y: S.Y + up.y * a + cr.y * l });
  for (let i = 0; i < 12; i++) { if ([pt(aW + 20, 0), pt(aL - 20, 0), pt(0, 60), pt(0, -60)].every((p) => G.h(p.X, p.Y) < -12)) break; S = { X: S.X, Y: S.Y - 150 }; }
  const R = G.race = { S, up, cr, pt, t: -25, aW, aL, W: pt(aW, 0), L: pt(aL, 0), pin: pt(0, -55), com: pt(0, 55), lastBeep: -99, over: false, ocs: false };
  G.mode = 'race'; showGame(true); setRivals(true); $('race').hidden = false;
  const th = wrapPi(D + 47 * DEG), v0 = { breeze: 2.0, santash: 2.7, ulan: 2.9 }[G.preset];
  // игрок стоит так, чтобы обычный курс в бейдевинд сам вывел его на середину стартовой линии
  placeBoat(G.player, pt(-56, -56).X, pt(-56, -56).Y, th, 1.0); // в стороне от нижнего знака
  // соперники стоят так, чтобы к сигналу подойти к линии: чем больше времени до старта, тем дальше
  const placeRivals = (rem) => G.rivals.forEach((r, i) => { r.out = false; const a = -(v0 * 0.62 * (Math.min(rem, 40) + 1 + i * 1.5)) - 4, p = pt(a, [-96, -26, 0][i]); placeBoat(r, p.X, p.Y, th, v0 * 0.8); });
  placeRivals(25);
  // онлайн: лобби ждёт других яхтсменов; каждый следующий встаёт чуть дальше от линии, чтобы не на одно место
  if (X.lobbyStart(R, 'yacht', (slot) => { const q = pt(-56 - (slot % 4) * 14, -56 - Math.floor(slot / 4) * 12); placeBoat(G.player, q.X, q.Y, th, 1.0); })) { R.onT0 = () => placeRivals((R.T0 - X.net.now()) / 1000); placeRivals(-R.t); }
  setRivals(true); G.camYaw = th; resetView(); drawBrief(R); $('brief').hidden = false;
}
const al = (R, b) => (b.X - R.S.X) * R.up.x + (b.Y - R.S.Y) * R.up.y, lat = (R, b) => (b.X - R.S.X) * R.cr.x + (b.Y - R.S.Y) * R.cr.y;
function target(R, leg, ai) {
  if (leg <= 0) return R.pt(ai ? 14 : 4, ai ? -8 : 0);
  if (leg === 1) return ai ? R.pt(R.aW + 13, 13) : R.W; if (leg === 2) return ai ? R.pt(R.aL - 13, -13) : R.L;
  return R.pt(leg === 3 ? (ai ? 14 : 2) : 400, 0);
}
function advance(R, e) {
  const a = al(R, e.b), l = Math.abs(lat(R, e.b)); let ch = false;
  if (e.leg === 0 && R.t >= 0 && e.prevA <= 0 && a > 0 && l < 58) { e.leg = 1; ch = true; }
  else if (e.leg === 1 && a > R.aW + 3 && l < 55) { e.leg = 2; ch = true; }
  else if (e.leg === 2 && a < R.aL - 3 && l < 55) { e.leg = 3; ch = true; }
  else if (e.leg === 3 && e.prevA <= 0 && a > 0 && l < 58) { e.leg = 4; e.time = R.t; ch = true; }
  e.prevA = a; return ch;
}
const progress = (R, e) => { const t = target(R, e.leg, false); return e.leg >= 4 ? 1e6 - e.time : e.leg * 10000 - (e.b ? Math.hypot(t.X - e.b.X, t.Y - e.b.Y) : 5000); };
const fmt = (t) => { const s = Math.abs(t); return (t < 0 ? '−' : '') + Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };

// схема дистанции: ветер сверху, цифры -- порядок прохождения
function drawBrief(R) {
  const c = $('briefc').getContext('2d'), W = 400, H = 460; c.clearRect(0, 0, W, H);
  const span = R.aW - R.aL, sc = 300 / span, cx = W / 2, y = (a) => 90 + (R.aW - a) * sc, x = (l) => cx + l * sc;
  c.lineCap = 'round'; c.lineJoin = 'round'; c.textAlign = 'center'; c.textBaseline = 'middle';
  // ветер
  c.strokeStyle = c.fillStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx, 12); c.lineTo(cx, 50); c.stroke();
  c.beginPath(); c.moveTo(cx, 62); c.lineTo(cx - 11, 44); c.lineTo(cx + 11, 44); c.closePath(); c.fill();
  c.font = '600 22px sans-serif'; c.textAlign = 'left'; c.fillText('ветер', cx + 20, 34); c.textAlign = 'center';
  // лавировка вверх, прямо вниз, финиш
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 4; c.setLineDash([10, 10]); c.beginPath(); c.moveTo(x(0), y(-6));
  const zig = 5; for (let i = 1; i <= zig; i++) c.lineTo(x((i % 2 ? 1 : -1) * 60 * (1 - i / (zig + 1))), y(R.aW * i / zig)); c.stroke();
  c.strokeStyle = 'rgba(255,208,74,.8)'; c.beginPath(); c.moveTo(x(14), y(R.aW)); c.lineTo(x(22), y(R.aL)); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(x(-14), y(R.aL)); c.lineTo(x(-30), y(R.aL * 0.5)); c.lineTo(x(0), y(2)); c.stroke(); c.setLineDash([]);
  // стартовая линия и знаки
  c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(x(-55), y(0)); c.lineTo(x(55), y(0)); c.stroke();
  const dot = (px, py, col, t) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, 15, 0, 7); c.fill(); if (t) { c.fillStyle = '#10233f'; c.font = '700 20px sans-serif'; c.fillText(t, px, py + 1); } };
  dot(x(-55), y(0), '#ff3b30'); dot(x(55), y(0), '#2f7de2'); dot(x(0), y(R.aW), '#ff7a1a', '1'); dot(x(0), y(R.aL), '#ffd21f', '2');
  c.fillStyle = '#fff'; c.font = '600 20px sans-serif'; c.textAlign = 'left'; c.fillText('старт · финиш 3', Math.min(232, x(55) + 22), y(0) - 22);
}

function stepRace(dt) {
  const R = G.race, P = G.player, was = R.t; if (R.online) R.t = (X.net.now() - R.T0) / 1000; else R.t += dt;
  // онлайн: на старте NPC добирают число яхт до четырёх
  if (R.online && was < 0 && R.t >= 0) { const peers = X.racePeers(R), keep = Math.max(0, 3 - peers); G.rivals.forEach((r, i) => { r.out = i >= keep; }); setRivals(true); if (peers) toast(`Соперников онлайн: ${peers}`); }
  if (R.t < 0) { const s = Math.ceil(-R.t); if (s !== R.lastBeep && s <= 10) { R.lastBeep = s; audio.beep(false); } }
  else if (R.lastBeep !== 0) { R.lastBeep = 0; audio.horn(); R.ocs = al(R, P.b) > 0; toast(R.ocs ? 'Фальстарт! Вернитесь за линию' : 'Старт! Вверх, против ветра'); }
  if (R.t > 12) $('brief').hidden = true;
  if (R.ocs && al(R, P.b) < 0) { R.ocs = false; toast('Чисто. Стартуйте!'); }
  const all = [P, ...G.rivals.filter((r) => !r.out)];
  for (const e of all) { if (e.leg >= 4) continue; if (advance(R, e) && e === P) {
    if (e.leg === 1) { audio.chime(); } else if (e.leg === 2) { audio.chime(); toast('Верхний знак взят — теперь по ветру к жёлтому'); }
    else if (e.leg === 3) { audio.chime(); toast('Нижний знак взят — на финиш, снова против ветра'); } else if (e.leg === 4) finishRace(); } }
  // столкновения лодок и знаков: расталкиваем и гасим только встречную скорость -- лодки соскальзывают, а не липнут
  const kill = (q, nx, ny) => { const vn = q.vx * nx + q.vy * ny; if (vn < 0) { q.vx -= vn * nx * 1.3; q.vy -= vn * ny * 1.3; } };
  const bump = (e, txt) => { if (e === P && G.shake < 0.15) { G.shake = 0.5; audio.thump(0.6); toast(txt); } };
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i].b, b = all[j].b, dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy);
    if (d < 5.2 && d > 0.01) { const nx = dx / d, ny = dy / d, p = (5.2 - d) / 2; a.X -= nx * p; a.Y -= ny * p; b.X += nx * p; b.Y += ny * p; kill(a, -nx, -ny); kill(b, nx, ny); if (i === 0) bump(P, 'Навал!'); } }
  for (const k of ['W', 'L', 'pin', 'com']) for (const e of all) { const m = R[k], dx = e.b.X - m.X, dy = e.b.Y - m.Y, d = Math.hypot(dx, dy);
    if (d < 3 && d > 0.01) { e.b.X = m.X + dx / d * 3; e.b.Y = m.Y + dy / d * 3; kill(e.b, dx / d, dy / d); bump(e, 'Касание знака!'); } }
  X.npcPeers(all.slice(1));
}
function finishRace() {
  X.ach('regatta');
  const R = G.race; R.over = true; audio.horn();
  const key = 'best.' + G.preset, best = store.get(key), rec = !best || G.player.time < best; if (rec) store.set(key, G.player.time);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  // в протоколе -- все участники онлайн-заезда; пока остальные финишируют, он перерисовывается
  R.redraw = () => { const all = [G.player, ...G.rivals.filter((r) => !r.out), ...X.onlineRows(R, true)].sort((a, b) => progress(R, b) - progress(R, a)), place = all.indexOf(G.player) + 1;
    $('rh').textContent = place === 1 ? 'Победа!' : place + '-е место';
    $('rs').textContent = `${PRESETS[G.preset].name}${R.online ? ' · онлайн' : ''} · ваше время ${fmt(G.player.time)}` + (rec ? ' · личный рекорд' : best ? ` · рекорд ${fmt(best)}` : '');
    $('rt').innerHTML = all.map((e, i) => `<tr class="${e === G.player ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.leg >= 4 ? fmt(e.time) : e.off ? 'вышел' : 'в пути'}</td></tr>`).join(''); };
  R.redraw();
  setTimeout(() => { if (G.race === R) $('result').hidden = false; }, 1600);
}

// ---------- ввод ----------
const KEY = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'ease', ArrowDown: 'ease', KeyS: 'ease' };
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // печатают имя -- не рулим
  if (KEY[e.code]) { input[KEY[e.code]] = true; e.preventDefault(); return; }
  if (!G || e.repeat) return;
  if (e.code === 'KeyC') { G.cam = (G.cam + 1) % 3; resetView(); }
  else if (e.code === 'KeyM') toast(audio.toggleMute() ? 'Звук выключен' : 'Звук включён');
  else if (e.code === 'Escape' && G.mode !== 'menu') toMenu();
  else if (e.code === 'KeyR' && G.mode === 'race') startRace(); else if (e.code === 'KeyR' && G.mode === 'free') startFree();
});
window.addEventListener('keyup', (e) => { if (KEY[e.code]) { input[KEY[e.code]] = false; e.preventDefault(); } });
window.addEventListener('blur', () => { input.left = input.right = input.ease = false; input.joy = null; });
if (TOUCH) document.body.classList.add('touchdev');
// касание левой половины экрана -- руль влево, правой -- вправо; несколько пальцев учитываются по отдельности
// Обзор и руль делят один экран. Мышь: перетаскивание -- обзор, колесо -- приближение (рулят с клавиатуры).
// Палец: держать на месте -- руль (левая/правая половина), провести -- обзор, два пальца -- щипок приближает и отдаляет.
// Двойной щелчок или двойное касание возвращает камеру за корму.
const held = new Map(), ptr = new Map(); let pinch = 0, lastTap = 0;
const syncTouch = () => { let l = false, r = false; for (const v of held.values()) { if (v === 'left') l = true; else r = true; } input.left = l; input.right = r; };
const resetView = () => { G.orbit = 0; G.orbitP = 0; G.zoom = 1; };
canvas.addEventListener('pointerdown', (e) => { if (!G || G.mode === 'menu') return; audio.start(); e.preventDefault();
  const mouse = e.pointerType === 'mouse'; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, look: mouse, t: performance.now() });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* захват недоступен -- обзор просто кончится, когда палец уйдёт с холста */ }
  if (ptr.size === 2) { const [a, c] = [...ptr.values()]; pinch = Math.hypot(a.x - c.x, a.y - c.y); for (const q of ptr.values()) q.look = true; held.clear(); syncTouch(); }
  else if (!mouse && !document.body.classList.contains('motor')) { held.set(e.pointerId, e.clientX < window.innerWidth / 2 ? 'left' : 'right'); syncTouch(); } });
canvas.addEventListener('pointermove', (e) => { const q = ptr.get(e.pointerId); if (!q || !G) return; const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (ptr.size === 2) { const [a, c] = [...ptr.values()], d = Math.hypot(a.x - c.x, a.y - c.y); if (pinch > 0) G.zoom = clamp(G.zoom * pinch / Math.max(d, 1), 0.45, 3.2); pinch = d; return; }
  // палец сдвинулся -- это обзор, а не руль
  if (!q.look && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) > 14) { q.look = true; if (held.delete(e.pointerId)) syncTouch(); }
  if (q.look) { const k = 5.5 / Math.max(window.innerHeight, 320); G.orbit = wrapPi(G.orbit + dx * k); G.orbitP = clamp(G.orbitP + dy * k, -0.22, 1.35); } });
for (const n of ['pointerup', 'pointercancel']) window.addEventListener(n, (e) => { const q = ptr.get(e.pointerId); ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0; if (held.delete(e.pointerId)) syncTouch();
  if (q && n === 'pointerup' && G && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < 8 && performance.now() - q.t < 300) { const now = performance.now(); if (now - lastTap < 320) { resetView(); lastTap = 0; } else lastTap = now; } });
canvas.addEventListener('wheel', (e) => { if (!G || G.mode === 'menu') return; e.preventDefault(); G.zoom = clamp(G.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 3.2); }, { passive: false });
{ const el = $('ts'), set = (v) => (e) => { e.preventDefault(); e.stopPropagation(); input.ease = v; el.classList.toggle('on', v); };
  el.addEventListener('pointerdown', set(true)); for (const n of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(n, set(false)); }
// джойстик моторных на сенсорном экране: кружок с точкой; точку тянут -- куда тянут, туда и рулит, дальше -- больше газа
{ const el = $('joy'), dot = el.firstElementChild; let id = null;
  const move = (e) => { const r = el.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    input.joy = { x, y }; dot.style.transform = `translate(${x * R * 0.62}px,${y * R * 0.62}px)`; };
  const end = (e) => { if (e.pointerId !== id) return; id = null; input.joy = null; dot.style.transform = ''; el.classList.remove('on'); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.start(); id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* без захвата -- джойстик отпустится, когда палец уйдёт */ } el.classList.add('on'); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) { e.preventDefault(); move(e); } });
  for (const n of ['pointerup', 'pointercancel']) el.addEventListener(n, end); }
$('bmenu').onclick = () => toMenu();
$('bcam').onclick = () => { G.cam = (G.cam + 1) % 3; resetView(); };
let drag = null;

// капли на «объективе»: брызги долетают до зрителя и стекают
function lens(n) { const box = $('lens'); n = Math.min(Math.round(n), 30); if (box.childElementCount > 46) return;
  for (let i = 0; i < n; i++) { const d = document.createElement('i'), sz = 5 + Math.random() ** 2 * 30;
    d.style.cssText = `left:${Math.random() * 100}%;top:${18 + Math.random() * 74}%;width:${sz}px;height:${sz * (1 + Math.random() * 0.5)}px;animation-duration:${1.4 + Math.random() * 2.6}s;--fall:${12 + Math.random() * 90}px`;
    d.addEventListener('animationend', () => d.remove()); box.appendChild(d); } }

function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; G.toastT = 1.9; }

// ---------- события лодки игрока ----------
function playerEvents(e) {
  const b = e.b;
  for (const ev of b.events) {
    X.wearEvent(ev, b);
    if (b.kind) { X.craftEvent(ev, b); continue; }
    if (ev.type === 'gybe') { G.shake = Math.min(1.4, 0.35 + ev.power * 0.5); audio.thump(clamp(ev.power, 0.3, 1.3)); if (ev.power > 0.8) toast('Гик перелетел!'); else goal('gybe'); lens(4 + ev.power * 4); }
    else if (ev.type === 'tack') { if (G.free && !G.free.done.tack) goal('tack'); }
    else if (ev.type === 'capsize') { G.shake = 1.5; audio.splash(1); splash(b, 220); lens(26); }
    else if (ev.type === 'righted') audio.chime();
    else if (ev.type === 'kite') { audio.thump(0.35); if (!G.kiteSeen) { G.kiteSeen = true; toast('Генакер поднят — полный ход!'); } }
    else if (ev.type === 'aground') { G.shake = 0.9; audio.thump(1); toast(G.shore.pierH(b.X, b.Y) > G.h(b.X, b.Y) ? 'Удар о причал!' : 'Сели на мель!'); }
  }
  b.events.length = 0;
}
// Волны и борт -- без сценария. В шести точках вдоль каждого борта каждый кадр сравниваем уровень воды с кромкой палубы
// (с учётом крена, дифферента и качки). Сила удара I -- это скорость, с которой вода поднимается по борту, когда она
// уже близко к кромке. От неё НЕПРЕРЫВНО зависит всё остальное: сколько капель взлетает и как быстро, сколько воды
// попадает на палубу в этой точке, громкость плеска. Вода выше кромки просто льётся на палубу, пока она выше.
const ST = [[0.14, 0.52], [0.28, 0.86], [0.42, 1.07], [0.58, 1.15], [0.74, 1.12], [0.9, 1.04]], stPrev = new Float32Array(12).fill(-9);
let slapAcc = 0, lensAcc = 0;
function waveImpacts(P, dt, sp) {
  const b = P.b, root = P.model.root, dw = P.model.water;
  dw.step(dt, b.phi, b.pitch, ENV.uSunI.value, b.aws, b.capsized);
  if (b.capsized) { stPrev.fill(-9); return; }
  root.updateMatrixWorld(); const rx = Math.cos(b.th), rz = Math.sin(b.th); slapAcc *= Math.exp(-dt * 3); lensAcc *= Math.exp(-dt * 1.5);
  for (let i = 0; i < 12; i++) { const k = i % 6, st = ST[k], sd = i < 6 ? -1 : 1, zl = -3.55 + 7 * st[0];
    tmpV.set(sd * st[1], 0.80, zl); root.localToWorld(tmpV);
    const wy = G.waves.sample(tmpV.x, tmpV.z, G.t, b.att, tmpS).h, rel = wy - tmpV.y, rate = stPrev[i] < -8 ? 0 : (rel - stPrev[i]) / Math.max(dt, 1e-3); stPrev[i] = rel;
    dw.hull(k, sd, 0.80 + rel);
    const u = sd < 0 ? 0.06 : 0.94, over = rel + 0.03;
    if (over > 0) dw.add(st[0], u, Math.min(0.5, over * 4) * dt * 6, 1.6); // вода выше кромки -- льётся на палубу
    const I = Math.max(0, rate - 0.55) * smooth(-0.75, -0.15, rel); if (I <= 0.01) continue;
    const x = tmpV.x, z = tmpV.z, y = Math.max(wy, tmpV.y - 0.5), inX = -sd * rx, inZ = -sd * rz; // inX/inZ -- направление «на палубу»
    let cnt = I * 55 * dt; cnt = Math.floor(cnt) + (Math.random() < cnt % 1 ? 1 : 0);
    for (let q = 0; q < cnt; q++) { const a = Math.random(), up = (1.6 + rate * 1.5) * (0.6 + Math.random() * 0.8);
      G.spray.emit(x + (Math.random() - 0.5) * 1.3, y + 0.1, z + (Math.random() - 0.5) * 1.3, b.vx * 0.5 + inX * a * (0.5 + rate) + G.wind.sx * 1.2, up, -b.vy * 0.5 + inZ * a * (0.5 + rate) - G.wind.sy * 1.2, 1.2, 1, Math.random() < 0.12 ? 1 : 0); }
    dw.add(st[0], u + (sd < 0 ? 0.1 : -0.1), I * dt * 0.5, 1.8); // часть брызг падает на палубу здесь же
    slapAcc += I * dt; lensAcc += I * dt;
  }
  if (slapAcc > 0.22) { audio.slap(Math.min(1, slapAcc * 1.6)); if (slapAcc > 0.4) G.shake = Math.max(G.shake, 0.2); slapAcc = 0; }
  if (lensAcc > 0.5) { if (G.mode !== 'menu' && G.cam !== 2) lens(4 + lensAcc * 5); lensAcc = 0; }
}
function splash(b, n) { const fx = Math.sin(b.th), fz = -Math.cos(b.th); for (let i = 0; i < n; i++) { const s = (Math.random() - 0.5) * 6; G.spray.emit(b.X + fx * s, 0.2, -b.Y + fz * s, (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5, 2, 1); } }

// Время суток, как в GTA: игровая минута идёт одну секунду, сутки -- 24 минуты. Солнце ходит по настоящей дуге для
// широты Чолпон-Аты (42.6 с. ш.) в середине лета; от его высоты зависят свет, цвет неба, заря, звёзды и ночной полумрак.
const LIGHT = new THREE.Vector3().copy(SUN); let envT = 0;
function dayCycle(dt) { if (G.clock === undefined) G.clock = 10; G.clock = (G.clock + dt / 60) % 24; const k = G.wx; if (!k) return;
  const la = 42.6 * DEG, de = 20 * DEG, Hh = (G.clock - 13) * 15 * DEG, sinEl = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(Hh), el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(la) - Math.tan(de) * Math.cos(la)) + Math.PI;
  SUN.set(Math.sin(az) * Math.cos(el), sinEl, -Math.cos(az) * Math.cos(el));
  const day = smooth(-0.1, 0.14, sinEl), dusk = clamp(1 - Math.abs(sinEl - 0.04) / 0.26, 0, 1), sI = k.sun * smooth(-0.02, 0.22, sinEl), st = k.storm;
  ENV.uDay.value = day; ENV.uDusk.value = dusk; ENV.uSunI.value = sI; G.night = day < 0.35;
  const d2 = dusk * 0.55 * (1 - st), m = 0.03 + 0.97 * day; ENV.uHor.value.set((k.hor[0] * (1 - d2) + 0.98 * d2) * m, (k.hor[1] * (1 - d2) + 0.56 * d2) * m, (k.hor[2] * (1 - d2) + 0.36 * d2) * m + 0.012 * (1 - day)); scene.fog.color.setRGB(ENV.uHor.value.x, ENV.uHor.value.y, ENV.uHor.value.z); // Color.copy от вектора дала бы NaN и чёрные лодки
  // ночью светит луна: слабый холодный свет с противоположной стороны неба
  if (sinEl > 0.02) { LIGHT.copy(SUN); sunL.color.setRGB(1, 0.95 - 0.33 * dusk, 0.86 - 0.5 * dusk); sunL.intensity = 3.1 * sI; } else { LIGHT.set(-SUN.x, 0.55, -SUN.z).normalize(); sunL.color.setRGB(0.6, 0.72, 1); sunL.intensity = 0.32 * (1 - st); }
  hemi.intensity = 1.9 * (1 - 0.35 * st) * (0.1 + 0.9 * day); G.spray.uniforms.uLight.value = 0.12 + 0.88 * sI; WAKE_LIGHT.value = 0.1 + 0.9 * day;
  envT -= dt; if (dt > 0 && envT <= 0) { envT = 12; updateEnv(G.sky); } }
// ---------- главный цикл ----------
const WSa = { x: 0, y: 0, speed: 0, dir: 0 }, tmpV = new THREE.Vector3(), tmpS = { h: 0, sx: 0, sz: 0 };
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0; const sunDir = new THREE.Vector3();
// Экран 120 Гц и выше на телефоне: рисуем через кадр (60 к/с). Глазу разницы почти нет, а видеокарта работает
// вдвое меньше -- телефон не греется и дольше держит заряд. 90 Гц не трогаем: там через кадр было бы 45 к/с.
let rafPrev = 0, rafIv = 16.7, rafOdd = false;
function loop(now) {
  requestAnimationFrame(loop);
  if (TOUCH) { const iv = now - rafPrev; rafPrev = now; if (iv > 2 && iv < 40) rafIv += (iv - rafIv) * 0.05;
    if (rafIv < 10.5 && (rafOdd = !rafOdd)) return; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.freeze) tick(dt); // freeze -- только для тестов: мир стоит, картинка рисуется
  const b = G.player.b, sp = b.speed;
  updateCamera(dt, b, sp);
  sunL.target.position.set(b.X, b.base || 0, -b.Y); sunL.position.set(b.X + LIGHT.x * 30, (b.base || 0) + LIGHT.y * 30, -b.Y + LIGHT.z * 30);
  audio.update(b);
  if (G.mode !== 'menu') updateHud(dt, b, sp);
  // адаптивное разрешение -- ДО отрисовки: смена размера очищает холст, после неё был бы пустой кадр
  fpsT += dt; fpsN++; if (fpsT > 2) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; qHold--;
    if (qMode !== 'auto') { /* человек выбрал сам -- не трогаем ни ступень, ни разрешение */ }
    else if (fps < 34 && qHold <= 0) { qHold = 2; // после смены ступени даём кадрам устояться
      if (quality > 0) setQuality(quality - 1); else if (pixelRatio > PR_MIN) { pixelRatio = Math.max(PR_MIN, pixelRatio * 0.86); resize(); } }
    else if (fps > 57 && pixelRatio < PR_MAX && ++G.slow > 4) { G.slow = 0; pixelRatio = Math.min(PR_MAX, pixelRatio * 1.1); resize(); } }
  if (post) { // где солнце на экране и насколько оно «в кадре»
    tmpV.copy(camera.position).addScaledVector(SUN, 1e5).project(camera); camera.getWorldDirection(sunDir); const f = sunDir.dot(SUN), sx = tmpV.x * 0.5 + 0.5, sy = tmpV.y * 0.5 + 0.5;
    const off = Math.max(0, Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5), a = f > 0.05 ? ENV.uSunI.value * (1 - ENV.uStorm.value) * smooth(0.05, 0.35, f) * Math.exp(-off * 3.5) : 0;
    post.setSun(sx, sy, G.mode === 'menu' ? a * 0.6 : a); }
  if (post) post.render(scene, camera); else renderer.render(scene, camera);
  G.frame++;
}
// один шаг мира: физика, гонка, эффекты. Без отрисовки -- им же пользуются автотесты для перемотки.
function tick(dt) {
  const P = G.player, b = P.b, R = G.race;
  G.t += dt; G.wind.update(dt); dayCycle(dt);
  const boats = X.boats(P);
  // управление
  let ctl;
  if (G.mode === 'menu') { // заставка: лодка идёт сама
    const th = b.th, ahead = G.hb(b.X + Math.sin(th) * 350, b.Y + Math.cos(th) * 350);
    if (ahead > -6 || Math.hypot(b.X, b.Y) > 2500) G.menuSide = -(G.menuSide || 1);
    const want = G.wind.dir0 + (G.menuSide || 1) * 95 * DEG; ctl = aiControl(b, b.X + Math.sin(want) * 500, b.Y + Math.cos(want) * 500, P.ai, dt);
  } else if (input.joy && b.spec && b.spec.cls === 'motor') { // джойстик моторных: угол от «вверх» -- руль, отклонение -- газ, назад не бывает
    const j = input.joy, m = Math.min(1, Math.hypot(j.x, j.y)), on = m > 0.15, a = Math.atan2(j.x, -j.y);
    ctl = X.filterCtl({ steer: on ? clamp(a / (Math.PI / 2), -1, 1) : 0, thr: on ? (m - 0.15) / 0.85 : 0, ease: on && b.capsized, left: false, right: false });
  } else ctl = X.filterCtl({ steer: (input.right ? 1 : 0) - (input.left ? 1 : 0), ease: input.ease, left: input.left, right: input.right });
  const ctls = boats.map((e, i) => { if (i === 0) return ctl; if (G.race2) return X.aiFor(e, dt);
    const tg = target(R, e.leg, true), c = aiControl(e.b, tg.X, tg.Y, e.ai, dt);
    if (R.t < 0 && al(R, e.b) > -9) c.ease = true;
    // обход препятствий: знак или чужая лодка прямо по курсу -- отворачиваем
    const b2 = e.b, hx = Math.sin(b2.th), hy = Math.cos(b2.th);
    const avoid = (ox, oy, rad) => { const dx = ox - b2.X, dy = oy - b2.Y, d = Math.hypot(dx, dy); if (d > rad || dx * hx + dy * hy < 0) return;
      const side = hx * dy - hy * dx; c.steer = clamp(c.steer + (side > 0 ? 1 : -1) * (1 - d / rad) * 2.5, -1, 1); };
    for (const k of ['W', 'L', 'pin', 'com']) avoid(R[k].X, R[k].Y, 16);
    for (const o of boats) if (o !== e) avoid(o.b.X, o.b.Y, 13);
    return c; });
  const TH = X.th(), PH = X.poseTh();
  for (const e of boats) e.b.updatePose(G.waves, G.t, PH);
  acc += dt; let n = 0;
  while (acc >= 1 / 120 && n++ < 8) { acc -= 1 / 120; boats.forEach((e, i) => e.b.step(1 / 120, ctls[i], G.wind, TH)); }
  if (n >= 8) acc = 0;
  if (G.mode === 'race' && !R.over) stepRace(dt);
  playerEvents(P); for (const r of G.rivals) r.b.events.length = 0;
  X.after(P, dt, boats);

  // модели, след, брызги
  for (const e of boats) { e.model.update(e.b, dt, G.t); e.wake.update(e.b, dt, G.t, G.waves); }
  const sp = b.speed, fx = Math.sin(b.th), fz = -Math.cos(b.th), rx = Math.cos(b.th), rz = Math.sin(b.th), HL = b.hl || 3.1;
  if (!b.capsized && sp > 2.1) { const k = (sp - 2.1) * 26 * dt + Math.max(0, -b.slopeF) * sp * 30 * dt, cnt = Math.floor(k + Math.random());
    const lee = b.phi > 0 ? 1 : -1; for (let i = 0; i < cnt; i++) { const s = Math.random() < 0.5 ? 1 : -1;
      G.spray.emit(b.X + fx * HL + rx * s * 0.3, b.y + 0.25, -b.Y + fz * HL + rz * s * 0.3, b.vx * 0.55 + rx * s * (1.2 + sp * 0.35), 1.3 + sp * 0.42, -b.vy * 0.55 + rz * s * (1.2 + sp * 0.35), 1.2, 1); }
    if (Math.abs(b.phi) > 0.42 && Math.random() < dt * 40) G.spray.emit(b.X + rx * lee * 1.1 + fx * (Math.random() * 4 - 2), b.y + 0.1, -b.Y + rz * lee * 1.1 + fz * (Math.random() * 4 - 2), b.vx * 0.6 + rx * lee * 2, 1.6, -b.vy * 0.6 + rz * lee * 2, 1, 1); }
  // удар носа о волну: веер брызг летит через лодку в камеру
  const dp = (b.pitch - (G.lastPitch ?? b.pitch)) / Math.max(dt, 1e-3); G.lastPitch = b.pitch; G.slamT = (G.slamT || 0) - dt;
  if (!b.capsized && G.slamT <= 0 && dp < -0.16 && sp > 1.8) { const pw = clamp((-dp - 0.1) * 2.2 * (sp / 3), 0.25, 1.6); G.slamT = 0.55;
    for (let i = 0; i < 46 * pw; i++) { const s = Math.random() < 0.5 ? 1 : -1, a = Math.random();
      G.spray.emit(b.X + fx * (3.2 - a) + rx * s * 0.5, b.y + 0.3, -b.Y + fz * (3.2 - a) + rz * s * 0.5, b.vx * 0.3 - fx * (1 + Math.random() * 3) + rx * s * (1 + Math.random() * 3.5), 2.6 + Math.random() * 3.4 * pw, -b.vy * 0.3 - fz * (1 + Math.random() * 3) + rz * s * (1 + Math.random() * 3.5), 1.5, 1); }
    G.spray.emit(b.X + fx * 2.6, b.y + 0.5, -b.Y + fz * 2.6, b.vx * 0.5 - fx * 1.5, 2.2 * pw, -b.vy * 0.5 - fz * 1.5, 3.5, Math.round(10 * pw), 1);
    if (P.model.water) P.model.water.add(0.1, 0.5, 0.35 * pw, 3.2); // нос зарылся -- вода на баке
    audio.slap(pw); if (G.mode !== 'menu' && G.cam !== 2 && pw > 0.45) lens(pw * (b.kind ? 3 : 9)); if (pw > 0.9) G.shake = Math.max(G.shake, 0.3); }
  if (P.model.water) waveImpacts(P, dt, sp);
  // водяная пыль с носа на ходу и с подветренного борта в крен; палуба мокнет и сохнет
  if (!b.capsized && sp > 3 && Math.random() < dt * (sp - 2.5) * 5) G.spray.emit(b.X + fx * 3, b.y + 0.3, -b.Y + fz * 3, b.vx * 0.6, 0.9, -b.vy * 0.6, 2.2, 1, 1);
  G.spray.update(dt);

  // свободное плавание: журнал и «школа рулевого»
  if (G.mode === 'free') { const f = G.free; f.t += dt; f.dist += sp * dt; f.max = Math.max(f.max, sp * KN);
    if (!b.kind) { if (sp * KN >= 5) goal('speed'); if (b.ease > 0.5 && Math.abs(b.phi) > 20 * DEG) goal('ease');
      if (Math.hypot(b.X - G.shore.cape.X, b.Y - G.shore.cape.Y) < 330) goal('cape'); } }

  // знаки дистанции
  if (R) { for (const k in G.marks) { const m = R[k], o = G.marks[k]; o.position.set(m.X, G.waves.sample(m.X, -m.Y, G.t, 1, tmpS).h - 0.25, -m.Y); o.rotation.z = tmpS.sx * 0.6; o.rotation.x = -tmpS.sz * 0.6; }
  }

  // вода, небо, флаг
  G.water.uniforms.uTime.value = G.t; G.water.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
  G.water.updateGust(G.wind, b.X, -b.Y, 22); // карта порывов: по шестой части за кадр
  ENV.uCloud.value.set(-G.t * 0.0035 * G.wind.sx, G.t * 0.0035 * G.wind.sy); G.water.setBoat(b); G.water.setTrail(b, P.wake.pts);
  G.shore.flag.rotation.y = Math.atan2(G.wind.sy, G.wind.sx) + Math.sin(G.t * 7) * 0.12;

}

function updateCamera(dt, b, sp) {
  if (G.mode === 'menu') G.camYaw += dt * 0.07; else G.camYaw += wrapPi(b.th - G.camYaw) * Math.min(1, dt * 2.4);
  G.shake = Math.max(0, G.shake - dt * 1.6);
  const sh = G.shake * G.shake, jx = (Math.random() - 0.5) * sh * 0.5, jy = (Math.random() - 0.5) * sh * 0.5;
  const yaw = G.camYaw + G.orbit, fx = Math.sin(yaw), fz = -Math.cos(yaw);
  if (G.player.model.fp) G.player.model.fp(G.cam === 1 && G.mode !== 'menu');
  let bx = b.X, bz = -b.Y, fly = 0;
  // сапбордиста выбросило с доски: камера отъезжает и держит в кадре и доску, и летящего
  const fp = G.mode !== 'menu' && G.player.model.flyPos && G.player.model.flyPos();
  if (fp && G.cam !== 1) { fly = Math.hypot(fp.x - bx, fp.z - bz) * 0.7 + Math.max(0, fp.y - b.y) * 0.6; bx = (bx + fp.x) / 2; bz = (bz + fp.z) / 2; }
  G.flyCam = (G.flyCam || 0) + (fly - (G.flyCam || 0)) * Math.min(1, dt * 3);
  if (G.cam === 1 && G.mode !== 'menu') {
    const root = G.player.model.root; if (b.eye) tmpV.set(b.eye[0], b.eye[1], b.eye[2]); else tmpV.set(-b.crew * 0.35, 2.15, 3.3); root.localToWorld(tmpV); camera.position.copy(tmpV);
    camera.quaternion.copy(root.quaternion); camera.rotateY(-G.orbit); camera.rotateX(-0.1 - G.orbitP * 0.8 + 0.25); camera.fov = clamp(68 * G.zoom, 30, 95);
  } else if (G.mode === 'menu') {
    // лодка стоит по центру свободной части экрана (озера) с запасом: от носа, кормы и топа мачты до краёв -- не меньше 5 см
    const W = window.innerWidth, H = window.innerHeight, cm = 37.8, tan = Math.tan(27 * DEG);
    const need = MENU.phone ? Math.max(19, 8.5 * H / (2 * tan * Math.max(60, W - 2.4 * cm)), 13.5 * H / (2 * tan * Math.max(60, MENU.boatB - MENU.boatT - 0.6 * cm)))
      : Math.max(19, 8.5 * H / (2 * tan * Math.max(80, MENU.lakeW - 10 * cm)), 13.5 * H / (2 * tan * Math.max(80, H - 10 * cm)));
    const d = Math.min(need, 90); camera.position.set(bx - fx * d, Math.max(4.2 + b.y * 0.5 + d * 0.05, G.h(bx - fx * d, -(bz - fz * d)) + 2.5), bz - fz * d);
    camera.lookAt(bx, 5.2 + b.y * 0.5, bz); camera.fov += (54 - camera.fov) * Math.min(1, dt * 3);
    if (MENU.phone) camera.setViewOffset(W, H, 0, H / 2 - (MENU.boatT + MENU.boatB) * 0.5, W, H); else camera.setViewOffset(W, H, W / 2 - MENU.lakeW / 2, 0, W, H);
  } else {
    // камера ходит по сфере вокруг лодки: orbit -- вокруг, orbitP -- вверх-вниз, zoom -- ближе-дальше
    const top = G.cam === 2, d = (top ? 40 : (b.camD || 13) + sp * (b.kind ? 0.22 : 0.55) + G.flyCam) * G.zoom, el = clamp((top ? 1.2 : 0.14) + G.orbitP, -0.06, 1.45), ce = Math.cos(el), se = Math.sin(el);
    const by = b.base || 0, ty = by + (top ? 1 : (b.kind ? 1.3 : 2.2) + (b.y - by) * 0.5), ahead = top ? 0 : 4.5 * Math.cos(G.orbit) * ce; // за кормой смотрим чуть вперёд лодки, сбоку -- на неё
    const hx = Math.sin(b.th), hz = -Math.cos(b.th), tx = bx + hx * ahead, tz = bz + hz * ahead;
    camera.position.set(tx - fx * d * ce - hx * ahead * 1.0 + jx, ty + d * se + 1.4 + jy, tz - fz * d * ce - hz * ahead * 1.0);
    const gy = Math.max(G.waves.sample(camera.position.x, camera.position.z, G.t, 1, tmpS).h + 0.9, G.h(camera.position.x, -camera.position.z) + 2); if (G.mode !== 'river' && camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(tx, ty, tz);
    if (!top) camera.rotateZ(-b.phi * 0.2 * Math.cos(wrapPi(b.th - yaw)) * ce + jx * 0.06);
    camera.fov += ((top ? 50 : 54 + Math.min(14, sp * 1.7)) - camera.fov) * Math.min(1, dt * 3);
  }
  if (G.dbgCam) { const c = G.dbgCam, hx = Math.sin(b.th), hz = -Math.cos(b.th); // крупный план для автотестов
    camera.position.set(bx - hx * c.back + hz * -c.side, c.up, bz - hz * c.back + hx * c.side); camera.lookAt(bx, 1.2, bz); camera.fov = 45; }
  if (G.mode !== 'menu' && camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateProjectionMatrix();
  G.sky.position.copy(camera.position);
}

// ---------- приборы ----------
const dial = $('dial'), dc = dial.getContext('2d');
function drawDial(b) {
  const W = 352, c = W / 2, R = 142; dc.clearRect(0, 0, W, W);
  dc.fillStyle = 'rgba(5,20,45,.30)'; dc.beginPath(); dc.arc(c, c, R + 14, 0, 7); dc.fill();
  // тяга: дуга по ободу компаса растёт от шести часов по кругу; сглажена, чтобы не дрожала на волне. Полощет парус -- дуга голубая
  G.pow = (G.pow || 0) + ((b.capsized ? 0 : b.kind ? b.powerN : clamp(b.power / 900, 0, 1)) - (G.pow || 0)) * 0.3;
  dc.lineCap = 'round'; dc.lineWidth = 9; dc.strokeStyle = 'rgba(255,255,255,.16)'; dc.beginPath(); dc.arc(c, c, R + 20, 0, 7); dc.stroke();
  if (G.pow > 0.01) { dc.strokeStyle = b.luff > 0.5 ? '#7fd0ff' : '#ff8a2a'; dc.beginPath(); dc.arc(c, c, R + 20, Math.PI / 2, Math.PI / 2 + G.pow * Math.PI * 2 * 0.999); dc.stroke(); }
  const pol = (a, r) => [c + Math.sin(a) * r, c - Math.cos(a) * r];
  dc.lineWidth = 3; dc.strokeStyle = 'rgba(255,255,255,.28)'; dc.beginPath(); dc.arc(c, c, R, 0, 7); dc.stroke();
  // мёртвая зона -- против ветра не пойдёшь
  const tw = b.twa; dc.fillStyle = 'rgba(255,75,62,.34)'; dc.beginPath(); dc.moveTo(c, c); dc.arc(c, c, R, tw - 40 * DEG - Math.PI / 2, tw + 40 * DEG - Math.PI / 2); dc.closePath(); dc.fill();
  // стороны света
  dc.fillStyle = 'rgba(255,255,255,.75)'; dc.font = '600 22px sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle';
  ['С', 'В', 'Ю', 'З'].forEach((s, i) => { const [x, y] = pol(i * Math.PI / 2 - b.th, R - 20); dc.fillText(s, x, y); });
  // стрелка истинного ветра: от края к лодке
  const arrow = (a, r0, r1, col, w) => { const [x0, y0] = pol(a, r0), [x1, y1] = pol(a, r1); dc.strokeStyle = dc.fillStyle = col; dc.lineWidth = w; dc.beginPath(); dc.moveTo(x0, y0); dc.lineTo(x1, y1); dc.stroke();
    const [xa, ya] = pol(a + 0.16, r1 + 22), [xb, yb] = pol(a - 0.16, r1 + 22); dc.beginPath(); dc.moveTo(x1, y1); dc.lineTo(xa, ya); dc.lineTo(xb, yb); dc.closePath(); dc.fill(); };
  arrow(tw, R + 12, 78, '#ffffff', 9); arrow(b.awa, R - 4, 96, 'rgba(127,208,255,.9)', 4);
  // цель в регате
  if (G.race && G.player.leg < 4) { const t = target(G.race, G.player.leg, false), a = Math.atan2(t.X - b.X, t.Y - b.Y) - b.th, [x, y] = pol(a, R); dc.fillStyle = '#ff8a2a'; dc.beginPath(); dc.arc(x, y, 13, 0, 7); dc.fill(); dc.strokeStyle = '#fff'; dc.lineWidth = 3; dc.stroke(); }
  // лодка и гик
  dc.fillStyle = '#fff'; dc.beginPath(); dc.moveTo(c, c - 52); dc.quadraticCurveTo(c + 26, c - 8, c + 17, c + 44); dc.lineTo(c - 17, c + 44); dc.quadraticCurveTo(c - 26, c - 8, c, c - 52); dc.fill();
  dc.strokeStyle = b.luff > 0.5 ? '#7fd0ff' : '#ff8a2a'; dc.lineWidth = 8; dc.lineCap = 'round'; dc.beginPath(); dc.moveTo(c, c - 12); dc.lineTo(c + Math.sin(b.boom) * 62, c - 12 + Math.cos(b.boom) * 62); dc.stroke();
}
let hintKey = '', hintT = 0;
// Приборы обновляются много раз в секунду, а меняются редко. Запись в DOM того же значения всё равно заставляет
// браузер пересчитывать стили и раскладку, поэтому пишем только изменившееся
const setT = (el, s) => { if (el.textContent !== s) el.textContent = s; };
const setP = (el, k, v) => { if (el[k] !== v) el[k] = v; };
const setSt = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
// на лавировке: знак ушёл за траверз, значит другим галсом он уже достаётся
function tackNow(R, b) { const tg = target(R, G.player.leg, false), brg = Math.atan2(tg.X - b.X, tg.Y - b.Y);
  return Math.abs(wrapPi(brg - b.th)) > 92 * DEG && Math.abs(wrapPi(brg - b.twd)) < 120 * DEG && Math.hypot(tg.X - b.X, tg.Y - b.Y) > 25; }
function updateHud(dt, b, sp) {
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
  const heel = Math.abs(b.phi) / DEG, R = G.race;
  setSt($('vign'), 'opacity', String(+smooth(32, 58, heel).toFixed(2)));
  const hold = b.capsized && !b.righting && !(b.noRight > 0); setP($('ring'), 'hidden', !hold); if (hold) $('ringarc').setAttribute('stroke-dashoffset', String(314 * (1 - b.rightHold)));
  // метка цели: висит над знаком, а если он вне кадра -- прижата к краю экрана с той стороны, где он есть
  const mk = $('mark');
  const tgM = R ? (G.player.leg < 4 ? target(R, G.player.leg, false) : null) : X.markTarget();
  if (tgM) { const tg = tgM, w = window.innerWidth, hh = window.innerHeight;
    tmpV.set(tg.X, 4.5, -tg.Y).project(camera); const behind = tmpV.z > 1; let mx = (tmpV.x * 0.5 + 0.5) * w, my = (1 - (tmpV.y * 0.5 + 0.5)) * hh;
    if (behind) { mx = w - mx; my = hh * 0.5; mx = mx < w / 2 ? 0 : w; }
    const cxm = clamp(mx, 74, w - 74), cym = clamp(my, 150, hh - 150), off = behind || cxm !== mx || cym !== my;
    setP(mk, 'hidden', false); setP(mk, 'className', 'hud' + (off ? ' off' : '')); mk.style.transform = `translate(${cxm}px,${cym}px) translate(-50%,-100%)`;
    if (G.frame % 6 === 0) setT($('markd'), `${off ? (cxm < w / 2 ? '◀ ' : '') : ''}${tg.label || ['старт', 'знак 1', 'знак 2', 'финиш'][G.player.leg]} · ${Math.hypot(tg.X - b.X, tg.Y - b.Y).toFixed(0)} м${off && cxm > w / 2 ? ' ▶' : ''}`);
  } else setP(mk, 'hidden', true);
  if (G.frame % 3) return;
  setT($('kn'), (sp * KN).toFixed(1));
  setT($('pos'), b.kind ? b.status() : (b.capsized ? 'оверкиль' : pointOfSail(Math.abs(b.twa)).toLowerCase()) + (heel > 12 ? ` · крен ${heel.toFixed(0)}°` : ''));
  setSt($('pos'), 'color', heel > 34 ? '#ff8a7a' : '');
  { const hh = Math.floor(G.clock), mm = Math.floor((G.clock % 1) * 60); setT($('windtxt'), `${(b.tws * KN).toFixed(0)} уз · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`); }
  drawDial(b);
  if (R) { const P = G.player, all = [P, ...G.rivals.filter((r) => !r.out), ...X.onlineRows(R, true)].sort((x, y) => progress(R, y) - progress(R, x)), tg = target(R, P.leg, false), d = Math.hypot(tg.X - b.X, tg.Y - b.Y);
    setT($('rtime'), fmt(R.over ? P.time : R.t));
    setT($('rinfo'), R.t < 0 ? 'до старта' : `${['старт', 'верхний знак', 'нижний знак', 'финиш', 'финиш'][P.leg]} ${d.toFixed(0)} м · ${all.indexOf(P) + 1}/${all.length}`); } else X.hud();
  // подсказка: одна, самая важная; спокойные гаснут сами
  let h = '', alert = false; const twa = Math.abs(b.twa) / DEG, T = G.modeT ?? 99;
  if (b.kind) { const q = X.hint(b, T); h = q[0]; alert = q[1]; }
  else if (b.capsized) { h = b.righting ? '' : (TOUCH ? 'Держите «шкот» — поднимаем лодку' : 'Держите пробел — поднимаем лодку'); alert = true; }
  else if (b.aground) { h = 'Мель — лодку стаскивает на глубину'; alert = true; }
  else if (heel > 36) { h = TOUCH ? 'Кренит — держите «шкот»' : 'Кренит — пробел, травить шкот'; alert = true; }
  else if (R && R.ocs) { h = 'Фальстарт — вернитесь за линию'; alert = true; }
  else if (R && R.t > 3 && G.player.leg === 0 && al(R, b) > 6) { h = 'Старт не взят — вернитесь и пройдите между красным и синим знаком'; alert = true; }
  else if (twa < 34 && sp < 1.6) h = (R && R.t >= 0 && G.player.leg !== 2 && G.player.leg < 4) ? 'Знак против ветра — прямо не дойти. Отверните к краю красного сектора и идите зигзагом' : 'Нос в ветер, парус не тянет — отверните от красного сектора';
  else if (R && R.t >= 0 && (G.player.leg === 1 || G.player.leg === 3) && tackNow(R, b)) h = 'Пора поворачивать через ветер — знак остался сбоку';
  else if (b.ease > 0.6 && heel < 12 && twa < 120) h = 'Шкот потравлен — парус не тянет';
  else if (T < 9) h = TOUCH ? 'Держать слева или справа — руль · провести — обзор' : '← → руль · пробел — травить шкот · мышь — обзор';
  else if (G.mode === 'race' && R.t < 0) h = 'К сигналу — к линии между красным и синим знаком';
  else if (G.mode === 'race' && R.t < 14 && G.player.leg <= 1) h = 'Знак 1 — против ветра: идите зигзагом, под 45° к ветру';
  if (h !== hintKey) { hintKey = h; const el = $('hint'); el.hidden = !h; el.textContent = h; el.className = 'hud' + (alert ? ' alert' : ''); }
}

window.__setQ = (q) => setQuality(q); window.__gfx = () => ({ renderer, scene, camera, post, sunL }); window.__game = () => { if (G) G.__X = X; return G; }; window.__tick = (sec, inp) => { Object.assign(input, inp || {}); for (let i = 0; i < sec * 60; i++) tick(1 / 60); }; // для автотестов
init().catch((e) => { $('loadmsg').textContent = 'Не удалось запустить: ' + e.message; console.error(e); });
