import * as THREE from 'three';
import { TRAILS, RIVERS } from './trails.js';
import { makeMinimap, rangeTxt } from './minimap.js';
import { makeFootMode, paraAdapter, boatAdapter } from './footmode.js';
import { makeFinds } from './finds.js';
import { makeJetMode } from './jetmode.js';
import { makeBeach } from './beach.js';
import { Boat, Wind, Waves, PRESETS, DEG, KN, clamp, wrapPi, smooth, pointOfSail, aiControl } from './sim.js';
import { DEM } from './demdata.js';
import { applyQuality, loadHeight, loadDem, makeDemTerrain, makeSky, makeTerrain, makeFarTerrain, makeWater, makeShore, makeMark, SUN, HAZE, ENV, MAP } from './world.js';
import { makeBoat } from './boatmodel.js';
import { makeSpray, makeWake, WAKE_LIGHT } from './fx.js';
import { makeAudio } from './audio.js';
import { installExtra } from './extra.js';
import { makeSpyglass } from './spyglass.js';
import { makeParaMode } from './paramode.js';
import { makeShoreArt } from './shoreart.js';
import { makeCorridorArt } from './corridorart.js';
import { makePost, postSupported } from './post.js';
import { RIVER_HOLES } from './rivermode.js';
import { makeJailoo } from './jailoo.js';
import { FAR_PX } from './corridorart.js';
import { makeSpriteClouds } from './clouds.js';
import { analyzeBasinAsync } from './cloudgeo.js';
import { makeStars, sunDir as astroSun } from './stars.js';
import { loadKhan, khanInside, makeSnow, makePeakLabels } from './khan.js';
import { makeHeliMode } from './helimode.js';
import { makeMerz } from './merz.js';
import { makeRidges, setRidgeRes } from './ridges.js';

const $ = (id) => document.getElementById(id);
const store = { get(k) { try { return JSON.parse(localStorage.getItem('issyk.' + k)); } catch (e) { return null; /* хранилище недоступно -- играем без рекордов */ } },
  set(k, v) { try { localStorage.setItem('issyk.' + k, JSON.stringify(v)); } catch (e) { /* то же: рекорд просто не сохранится */ } } };

// Safari до 16 не знает roundRect у 2D-холста: подсказки параплана рисуются ею, и без замены сборка параплана падала
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
  r = Math.min(typeof r === 'number' ? r : (r && (r[0] && r[0].x !== undefined ? r[0].x : r[0])) || 0, Math.abs(w) / 2, Math.abs(h) / 2);
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
const canvas = $('gl');
// Если устройство умеет комикс-обработку, штатное сглаживание не включаем: контуры сглаживает сама обработка,
// а четыре копии кадра под MSAA -- самая большая статья расхода видеопамяти.
// Проверяем на том же контексте, на котором будет игра: пробный второй контекст стоил полсекунды-секунду на телефоне,
// а при лимите контекстов браузер мог отказать уже основному -- и загрузка навсегда вставала на «Поднимаем паруса».
const GL2 = (() => { try { return canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' }); } catch (e) { return null; } })();
const POST_OK = postSupported(GL2);
const renderer = GL2 ? new THREE.WebGLRenderer({ canvas, context: GL2, antialias: false }) : new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
function resize() { const w = window.innerWidth, h = window.innerHeight; if (G) G.spray.uniforms.uScale.value = (h * pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360)); renderer.setPixelRatio(pixelRatio); if (post) setTimeout(() => post.resize(), 0); renderer.setSize(w, h, false); { const d = renderer.getDrawingBufferSize(new THREE.Vector2()); setRidgeRes(d.x, d.y); if (G) G.bufH = d.y; FAR_PX.value = 1.3 * d.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); } camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);
// Браузер может отобрать у вкладки графику: открыто много вкладок с WebGL, кончилась видеопамять, сбросился драйвер.
// Вернул -- перезапускаем страницу (ссылка друга в адресе сохраняется, если загрузка не дошла до конца). Не вернул за
// 4 секунды -- показываем экран с объяснением; нажатие перезагружает.
let glLost = 0;
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = 1;
  setTimeout(() => { if (!glLost) return; const L = $('load'); L.hidden = false; L.classList.remove('done'); clearInterval(window.__tipTimer);
    $('loadmsg').textContent = 'Браузер сбросил графику: похоже, открыто много вкладок с игрой или 3D. Закройте лишние и нажмите сюда'; L.style.cursor = 'pointer'; L.onclick = () => location.reload(); }, 4000); });
canvas.addEventListener('webglcontextrestored', () => { glLost = 0; location.reload(); });

const audio = makeAudio();
const input = { left: false, right: false, ease: false };
let G = null, X = null, SPY = null, PG = null, FT = null, JM = null, HM = null;
const AIR = () => (JM && JM.on ? JM : HM && HM.on ? HM : null); // воздушный режим: самолёт или вертолёт // G -- всё состояние игры после загрузки; X -- снаряды, режимы и акватория (extra.js)

// экран загрузки: настоящие этапы подготовки, а не крутилка
const loadStep = async (pct, msg) => { $('loadfill').style.width = pct + '%'; $('loadmsg').textContent = msg; await new Promise((r) => setTimeout(r, 40)); };
async function init() {
  await loadStep(18, 'Читаем карту высот…');
  const { h, tex } = await loadHeight();
  const sky = makeSky(); scene.add(sky);
  const stars = makeStars(); scene.add(stars.mesh); // настоящее звёздное небо (stars.js)
  ENV.uCine.value = store.get('skyCine') ?? 1; // режим неба: 1 -- кино (по умолчанию), 0 -- природное
  const dem = await loadDem(DEM, h); // подробный коридор Кургак-Сай -- берег
  const nearT = makeTerrain(h, { x0: dem.X0, x1: dem.X1, y0: dem.Y0, y1: dem.Y1 }); scene.add(nearT);
  const demT = makeDemTerrain(dem, TOUCH); scene.add(demT);
  await loadStep(38, 'Строим берега и хребты…');
  const far = await makeFarTerrain(RIVER_HOLES); scene.add(far);
  // маска озера для карты: заливка от середины Иссык-Куля по клеткам ниже уреза (низины за хребтами в неё не попадают)
  const lake = (() => { const { hs, W, H, X0, Y1, STEP } = far.userData.grid, m = new Uint8Array(W * H), st = [Math.round((Y1 + 25000) / STEP) * W + Math.round((10000 - X0) / STEP)];
    while (st.length) { const k = st.pop(); if (m[k] || hs[k] >= 0) continue; m[k] = 255; const i = k % W, j = (k / W) | 0; if (i > 0) st.push(k - 1); if (i < W - 1) st.push(k + 1); if (j > 0) st.push(k - W); if (j < H - 1) st.push(k + W); }
    { const fh = new Uint16Array(W * H); for (let k = 0; k < W * H; k++) fh[k] = THREE.DataUtils.toHalfFloat(m[k] ? hs[k] : Math.max(hs[k], 6)); // для воды вдали: дно озера, остальное -- суша
      const t = new THREE.DataTexture(fh, W, H, THREE.RedFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; ENV.uFarH.value = t; }
    for (let r = 0; r < 2; r++) { const c = m.slice(); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (c[k]) continue; // расширяем на 2 клетки: береговая полоса целиком внутри
        if ((i > 0 && c[k - 1]) || (i < W - 1 && c[k + 1]) || (j > 0 && c[k - W]) || (j < H - 1 && c[k + W])) m[k] = 255; } }
    const t = new THREE.DataTexture(m, W, H, THREE.RedFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
    ENV.uLakeM.value = t; ENV.uLakeT.value.set(X0 - STEP / 2, Y1 + STEP / 2, 1 / (W * STEP), 1 / (H * STEP)); return m; })();
  const ridges = makeRidges(dem.h, far.userData.grid, RIVER_HOLES); scene.add(ridges); // тушь по гребням гор
  // Высота в любой точке котловины: у Чолпон-Аты -- по подробной карте, дальше -- по грубой (шаг 600 м)
  const hNear = h, NX0 = -MAP.OX * MAP.M, NX1 = (MAP.N - 1 - MAP.OX) * MAP.M, NY0 = (MAP.OY - (MAP.N - 1)) * MAP.M, NY1 = MAP.OY * MAP.M;
  const hA = (x, y) => (x > NX0 && x < NX1 && y > NY0 && y < NY1 ? dem.h(x, y) : far.userData.heightAt(x, y));
  await loadStep(56, 'Наливаем озеро…');
  const water = makeWater(tex, 1); scene.add(water.mesh);
  const before = new Set(scene.children), shore = makeShore(h, scene), shoreObjs = scene.children.filter((o) => !before.has(o));
  const shoreArt = makeShoreArt(scene, hA);
  const hb = (x, y) => Math.max(hA(x, y), shore.pierH(x, y)); // дно + причал: то, обо что можно удариться
  const wind = new Wind(PRESETS.santash, hA), waves = new Waves();
  const spray = makeSpray(); scene.add(spray.mesh);
  const mk = (opts, name, skill) => { const b = new Boat(); b.skill = skill; const model = makeBoat(opts), wake = makeWake(); scene.add(model.root, wake.mesh); return { b, model, wake, name, ai: {}, leg: 0, time: 0, prevA: 0 }; };
  const player = mk({ text: 'KGZ 7', hull: 0x143a6e, accent: '#ff7a1a' }, 'Вы', 1); // тёмно-синий лакированный борт, оранжевая ватерлиния
  // три яхты соперников (модели, паруса, карты мокрой палубы) создаются при первой регате, а не при загрузке
  const rivals = [], ensureRivals = () => { if (!rivals.length) rivals.push(mk({ hull: 0xf4f3ee, accent: '#1f6fd0', text: 'KGZ 21' }, 'Ала-Тоо', 0.95), mk({ hull: 0xe9c33c, accent: '#20242b', text: 'KGZ 4' }, 'Манас', 0.9), mk({ hull: 0x2f8f5a, accent: '#f4f3ee', text: 'KGZ 33' }, 'Чайка', 0.86)); };
  const marks = { W: makeMark(0xff7a1a), L: makeMark(0xffd21f), pin: makeMark(0xff3b30), com: makeMark(0x2f7de2) };
  for (const k in marks) { marks[k].visible = false; scene.add(marks[k]); }
  G = { stars, shoreArt, corridor: null, lake, mapObjs: [nearT, demT, far, ...shoreObjs], ensureRivals, ridges, h: (x, y) => (G.khan && khanInside(x, y) ? G.khan.h(x, y) : hA(x, y)), /* в районе Хан-Тенгри -- его рельеф */ hb, far, sky, water, shore, wind, waves, spray, player, rivals, marks, mode: 'menu', preset: store.get('preset') || 'santash', t: 0, race: null,
    cam: 0, camYaw: 0, orbit: 0, orbitP: 0, zoom: 1, orbitV: 0, shake: 0, hintT: 0, free: null, toastT: 0, frame: 0, slow: 0 };
  if (!PRESETS[G.preset]) G.preset = 'santash';
  X = installExtra({ mapTile, mapTiles: () => { tileQueue.length = 0; tileWant.clear(); }, G, scene, $, store, toast, audio, TOUCH, lens, fmt, placeBoat, showGame, setRivals, resetView, openWaterHeading, startRace: () => startRace(), startFree: () => startFree(),
    setPreset: (id) => { if (PRESETS[id]) { G.preset = id; applyPreset(); } }, para: () => PG, jet: () => JM, heli: () => HM, heliGo: () => heliGo() });
  G.pro = !!store.get('pro'); $('bpro').classList.toggle('on', G.pro);
  G.hMesh = (x, y) => { const v = demT.userData.meshH(x, y); return v === null ? hA(x, y) : v; }; // высота видимой земли -- для персонажей
  // высота нарисованной земли везде: ущелье -- подробная сетка, у Чолпон-Аты -- ближняя, дальше -- грубая (по её треугольникам)
  G.hVis = (x, y) => { let v = demT.userData.meshH(x, y); if (v !== null) return v; if (x > NX0 && x < NX1 && y > NY0 && y < NY1) { v = nearT.userData.meshH(x, y); if (v !== null) return v; } v = far.userData.meshH(x, y); return v === null ? hA(x, y) : v; };
  G.holes = RIVER_HOLES;
  G.clouds = makeSpriteClouds(scene, hA); // разбор котловины (озеро, берега, ущелья) -- уже после показа меню, см. ниже // рисованные кучевые облака (clouds.js)
  G.mini = makeMinimap(hA); G.mmZ = store.get('mmZ') ?? 1; // миникарта в компасе; масштаб -- тапом по компасу
  $('dialwrap').addEventListener('pointerdown', (e) => { e.stopPropagation(); }); $('dialwrap').onclick = (e) => { e.stopPropagation(); G.mmZ = (G.mmZ + 1) % 3; store.set('mmZ', G.mmZ); audio.tick && audio.tick(); };
  G.mmRange = (para) => (para ? [240, 1500, 6000] : [400, 1500, 5000])[G.mmZ];
  buildMenu(); applyPreset(); toMenu(); resize();
  // Шейдеры собираются при первом показе каждого объекта, и это подвешивало меню на несколько секунд. Собираем всё
  // заранее, пока ещё виден экран загрузки, включая соперников и знаки, которые в меню скрыты (иначе фриз был бы
  // на старте регаты). Потом рисуем один кадр -- и только после этого открываем меню.
  // ---- Занавес не открываем, пока сцена не готова ----
  // Всё тяжёлое -- за экраном загрузки: части мира, атлас облаков (в отдельном потоке), разбор котловины (тоже в потоке),
  // сборка всех шейдеров и несколько «прогревочных» кадров. Меню открывается, когда кадры уже идут ровно: первые
  // секунды игры без фризов. Раньше часть работы шла уже в меню -- и первые 3 секунды картинка дёргалась.
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  // каждая часть -- отдельно: если в каком-то браузере одна упадёт, остальные соберутся, а игра всё равно откроется
  G.lateLog = []; const late = async (name, fn) => { await frame(); const t = performance.now(); try { fn(); } catch (e) { console.error('загрузка:', name, e); } G.lateLog.push([name, Math.round(performance.now() - t)]); };
  G.buildCorridor = () => { if (!G.corridor) G.corridor = makeCorridorArt(scene, dem, dem.h); if (!G.jailoo) G.jailoo = makeJailoo({ G, scene, camera, toast, ach: X.ach, store }); }; // река Кургак-Сая и джайлоо: в меню их не видно -- строим при выходе в игру
  const basin = analyzeBasinAsync(far.userData.grid, lake).then((bs) => G.clouds.setBasin(bs)); // облака: озеро, берега, ущелья -- в потоке
  await loadStep(78, 'Готовим берег и снаряды…');
  await late('подзорную трубу', () => { SPY = makeSpyglass({ G, camera, post, audio, store, ach: X.ach, $, extra: X }); SPY.renderAtlas(); });
  await late('пляж', () => { G.beach = makeBeach({ G, scene, camera, audio, toast }); G.finds = makeFinds({ G, scene, camera, beach: G.beach, audio, toast, store, ach: X.ach, onTake: (k) => FT && FT.found(k) }); });
  await late('пеший режим', () => { FT = makeFootMode({ G, scene, camera, $, input, audio, toast, TOUCH, beach: G.beach, store, ach: X.ach, finds: G.finds }); $('bfoot').onclick = () => footKey(); $('rfoot').onclick = () => footKey(); });
  await late('Як-130', () => { JM = makeJetMode({ G, scene, camera, $, store, toast, audio, TOUCH, input, ach: X.ach, showGame, resetView, fmt }); });
  await late('Ми-8', () => { HM = makeHeliMode({ G, scene, camera, post, renderer, $, store, toast, audio, TOUCH, input, ach: X.ach, showGame, resetView, fmt, net: () => X && X.net }); });
  await late('параплан', () => { PG = makeParaMode({ G, scene, camera, $, store, toast, audio, TOUCH, input, ach: X.ach, showGame, resetView, fmt, lens }); });
  await loadStep(86, 'Рисуем облака…');
  const cap = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]); // не ждём вечно, если поток не ответил
  await cap(Promise.all([G.clouds.atlasReady, basin]), 25000);
  // все шейдеры -- разом и параллельно (KHR_parallel_shader_compile), включая скрытых соперников и знаки
  await loadStep(92, 'Прогреваем сцену…');
  setRivals(true); G.player.b.updatePose(G.waves, 0, G.h); for (const e of [G.player, ...G.rivals]) e.model.update(e.b, 0.016, 0);
  try { if (renderer.compileAsync) await cap(renderer.compileAsync(scene, camera), 10000); else renderer.compile(scene, camera); } catch (e) { console.warn('предварительная сборка шейдеров:', e); }
  updateCamera(0.016, G.player.b, 0); if (post) post.render(scene, camera); else renderer.render(scene, camera); setRivals(false);
  // прогрев: игра уже идёт под заставкой (облака встают на места, вода, брызги); ждём 10 ровных кадров подряд, но не дольше 4 с
  G.ready = true; document.body.classList.remove('loading2'); requestAnimationFrame(loop);
  await new Promise((res) => { const t0 = performance.now(); let prev = t0, ok = 0; const f = (t) => { ok = t - prev < 40 ? ok + 1 : 0; prev = t; if (ok >= 10 || t - t0 > 4000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await loadStep(100, 'Отдать швартовы!');
  // снимок растворяется в живой сцене; меню появляется уже поверх неё
  clearInterval(window.__tipTimer); $('load').classList.add('done'); setTimeout(() => { $('load').hidden = true; }, 1500);
  X.openLink(); // открыли ссылку друга -- сразу на воду, к нему
}
// пока догружается остальное: нажатие на старт (или журнал) запоминаем и выполняем, когда всё готово
let waitBtn = null; document.body.classList.add('loading2');
$('menu').addEventListener('click', (e) => { if (G && G.ready) return; const b = e.target.closest('.modes .btn, #bjournal'); if (!b) return;
  e.preventDefault(); e.stopImmediatePropagation(); for (const o of document.querySelectorAll('#menu .wait')) o.classList.remove('wait'); b.classList.add('wait'); waitBtn = b; }, true);

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
  const f = (v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`, XMIN = -34000, XMAX = 30000; // северный берег -- далеко в обе стороны: меню бывает выше экрана
  let s, X0, X1, P, close, Ymin = 1e9, Ymax; const pts = [];
  // грубо -- где берег по Y, затем точная изолиния уреза в полосе вокруг него (с запасом на глубину залива)
  const sample = (n) => { let lo = 1e9, hi = -1e9; for (let i = 0; i <= 40; i++) { const y = coastY(X0 + (X1 - X0) * i / 40); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const Ya = lo - 300, Yb = hi + 2500, line = shoreline(X0 - 60, X1 + 60, Ya, Yb, n, Math.ceil(n * (Yb - Ya) / (X1 - X0 + 120))); for (const v of line) { pts.push(v); Ymin = Math.min(Ymin, v[1]); } };
  const fit = (span) => { span = Math.min(span, XMAX - XMIN); X0 = Math.max(XMIN, Math.min(XMAX - span, -span / 2)); X1 = X0 + span; };
  let HH = H; // высота карты: меню длиннее экрана -- карта (и берег) продолжается вниз на всю прокрутку
  if (!ph) { // колонка управления: её левый край -- граница, правее которой только суша
    const cr = $('card').getBoundingClientRect(), cardL = cr.width ? cr.left : W - Math.min(W * 0.04, 48) - 440, mn0 = $('menu');
    HH = Math.max(H, cr.height ? Math.ceil(cr.bottom + (mn0 ? mn0.scrollTop : 0) + 48) : H); svg.style.height = HH + 'px';
    s = clamp((W - cardL + 90) / 11000, 0.03, 0.09); fit(HH / s); s = HH / (X1 - X0); sample(Math.ceil(HH / 2.5));
    let ym = -1e9; for (const v of pts) ym = Math.max(ym, v[1]); const ox = cardL - 40 - ym * s;
    P = (X, Y) => [ox + Y * s, (X - X0) * s]; Ymax = (W - ox) / s + 300; close = `L${W + 4},${HH + 4} L${W + 4},-4 Z`;
    let mn = 1e9; for (const v of pts) mn = Math.min(mn, P(v[0], v[1])[0]); MENU.lakeW = mn - 60;
  } else { svg.style.height = ''; // телефон: яхта -- в полосе между заголовком и «Ваше имя», берег ниже середины экрана (верх листа -- над водой)
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
  const lines = (L) => { let out = ''; for (const w of L) { const p = w.map((v) => P(v[0], v[1])); if (!p.some((v) => v[0] > -20 && v[0] < W + 20 && v[1] > -20 && v[1] < HH + 20)) continue; out += 'M' + p.map(f).join(' L') + ' '; } return out; };
  q('w').setAttribute('d', lines(MLINES.rv)); q('tr').setAttribute('d', lines(MLINES.tr)); }
function buildMenu() {
  coastMask(); let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(coastMask, 150); });
  if (window.ResizeObserver) { let lastH = 0; new ResizeObserver(() => { const h = $('card').offsetHeight; if (Math.abs(h - lastH) > 4) { lastH = h; clearTimeout(rz); rz = setTimeout(coastMask, 150); } }).observe($('card')); } // меню выросло (ряд «Старт» и т. п.) -- карта вниз
  for (const id in PRESETS) { const p = PRESETS[id], b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'w_' + id;
    b.innerHTML = `<b>${p.name}</b><small class="full">${p.sub}</small><small class="short">${p.sub.split(' · ')[1]}</small>`; b.onclick = () => { G.preset = id; applyPreset(); }; $('winds').appendChild(b); }
  $('how').innerHTML = TOUCH ? 'Касание слева и справа — руль. Кнопка «шкот» сбрасывает ветер из паруса, когда кренит. Против ветра лодка не идёт.' : $('how').innerHTML;
  const GFX = { auto: 'Авто', high: 'Высокая', low: 'Простая' };
  const setGfx = (m) => { qMode = GFX[m] ? m : 'auto'; store.set('gfx', qMode); pixelRatio = PR_MAX; setQuality(qMode === 'high' ? 2 : qMode === 'low' ? 0 : TOUCH ? 1 : 2); resize();
    for (const c of $('gfx').children) c.setAttribute('aria-pressed', c.dataset.id === qMode); };
  for (const id in GFX) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'g_' + id; b.innerHTML = `<b>${GFX[id]}</b>`; b.onclick = () => setGfx(id); $('gfx').appendChild(b); }
  setGfx(store.get('gfx') || 'auto');
  // время суток старта: утро -- пусто и тихо, день -- толпа и торговцы, закат -- мягкий свет, ночь -- костры
  const TOD = { morning: ['Утро', 5.83], day: ['День', 13], sunset: ['Закат', 19.3], night: ['Ночь', 22.3] }, setTod = (id) => { G.tod = TOD[id] ? id : 'day'; store.set('tod', G.tod); for (const c of $('tod').children) c.setAttribute('aria-pressed', c.dataset.id === G.tod);
    if (G.mode === 'menu') { G.clock = TOD[G.tod][1]; dayCycle(0); updateEnv(G.sky); } }; // меню сразу показывает выбранное время суток -- как выбор погоды
  for (const id in TOD) { const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.innerHTML = `<b>${TOD[id][0]}</b>`; b.onclick = () => setTod(id); $('tod').appendChild(b); }
  setTod(store.get('tod') || 'day'); G.todHour = () => TOD[G.tod][1];
  $('bfree').onclick = () => { audio.start(); G.clock = G.todHour(); if ((X.sel === 'para' && !PG) || (X.sel === 'jet' && !JM)) { toast('Этот снаряд не загрузился — выберите другой'); return; } if (X.sel === 'para') PG.startFree(X.startAt); else if (X.sel === 'heli') heliGo(); else if (X.sel === 'jet' && store.get('jetSite') === 'khan' && !X.startAt) startKhan('jet'); else if (X.sel === 'jet') JM.startFree(X.startAt); else startFree(); };
  $('brace').onclick = () => { audio.start(); X.compete(); };
  $('ragain').onclick = () => { if (AIR()) AIR().again(); else if (PG && PG.on) PG.again(); else if (G.mode === 'river') { $('result').hidden = true; $('briver').click(); } else X.compete(); }; $('rmenu').onclick = () => toMenu();
}

// выбрать курс вполветра, уводящий от берега
function openWaterHeading(X, Y) {
  let best = 0, bd = -1e9;
  for (const s of [90, -90, 120, -120, 60, -60]) { const th = G.wind.dir0 + s * DEG; let d = 0; for (const r of [150, 400, 800]) d += -G.h(X + Math.sin(th) * r, Y + Math.cos(th) * r); if (d > bd) { bd = d; best = th; } }
  return wrapPi(best);
}
function placeBoat(e, X, Y, th, v = 1.6) { if (e.model.dispose) e.model.dispose(); e.b.reset(X, Y, th); e.b.vx = Math.sin(th) * v; e.b.vy = Math.cos(th) * v; e.b.trim = 0.6; e.wake.reset(); e.leg = 0; e.time = 0; e.ai = {}; e.prevA = -1; }
function showGame(on) { if (on && G && G.buildCorridor) G.buildCorridor(); $('game').hidden = !on; $('menu').hidden = on; $('result').hidden = true; if (!on) requestAnimationFrame(coastMask); }
function setRivals(v) { for (const r of G.rivals) { const on = v && !r.out; r.model.root.visible = on; r.wake.mesh.visible = on; } for (const k in G.marks) G.marks[k].visible = v; }

function toMenu() {
  if (SPY) SPY.close(); if (FT) FT.stop(); if (PG) PG.stop(); if (JM) JM.stop(); if (HM) HM.stop();
  $('brief').hidden = true; $('mark').hidden = true; if (X) X.toMenuCraft();
  G.mode = 'menu'; G.race = null; showGame(false); setRivals(false); if (G.todHour) { G.clock = G.todHour(); dayCycle(0); }
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
  const key = 'best.' + G.preset, best = store.get(key), rec = !best || G.player.time < best; if (rec) store.set(key, G.player.time); R.fix = X.raceRepair(R.online);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  // в протоколе -- все участники онлайн-заезда; пока остальные финишируют, он перерисовывается
  R.redraw = () => { const all = [G.player, ...G.rivals.filter((r) => !r.out), ...X.onlineRows(R, true)].sort((a, b) => progress(R, b) - progress(R, a)), place = all.indexOf(G.player) + 1;
    $('rh').textContent = place === 1 ? 'Победа!' : place + '-е место';
    $('rs').textContent = `${PRESETS[G.preset].name}${R.online ? ' · онлайн' : ''} · ваше время ${fmt(G.player.time)}` + (rec ? ' · личный рекорд' : best ? ` · рекорд ${fmt(best)}` : '') + R.fix;
    $('rt').innerHTML = all.map((e, i) => `<tr class="${e === G.player ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.leg >= 4 ? fmt(e.time) : e.off ? 'вышел' : 'в пути'}</td></tr>`).join(''); };
  R.redraw();
  setTimeout(() => { if (G.race === R) $('result').hidden = false; }, 1600);
}

// ---------- ввод ----------
const KEY = { ShiftLeft: 'shift', ShiftRight: 'shift', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'ease', ArrowDown: 'ease', KeyS: 'ease', ArrowUp: 'sin', KeyW: 'sin', KeyQ: 'sl', KeyE: 'sr' }; // Q/E -- вертолёт: боковое смещение
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; // печатают имя -- не рулим
  if (e.code === 'Space') input.bar = true; if (e.code === 'ArrowDown' || e.code === 'KeyS') input.flare = true; // параплан: акселератор и обе клеванты
  if (KEY[e.code]) { input[KEY[e.code]] = true; e.preventDefault(); return; }
  if (!G || e.repeat) return;
  if (e.code === 'KeyN') { ENV.uCine.value = ENV.uCine.value > 0.5 ? 0 : 1; store.set('skyCine', ENV.uCine.value); toast(ENV.uCine.value ? 'Небо: кино (выразительнее)' : 'Небо: природное (как глазом)'); }
  else if (e.code === 'KeyC') { G.cLines = !G.cLines; toast(G.cLines ? 'Созвездия: линии включены' : 'Созвездия: линии скрыты'); }
  else if (e.code === 'KeyZ' && G.mode !== 'menu') { if (HM && HM.on && HM.vf) HM.vfToggle(); else SPY.toggle(); } // в вертолёте вместо трубы -- фотоаппарат
  else if (e.code === 'KeyE' && SPY && SPY.on) SPY.holdStart(); // E -- зажать с клавиатуры
  else if (e.code === 'Escape' && SPY && SPY.on) SPY.close();
  else if (e.code === 'Escape' && HM && HM.on && HM.vf && HM.vf.on) HM.vf.close();
  else if (e.code === 'KeyC') { G.cam = (G.cam + 1) % 3; resetView(); }
  else if (e.code === 'KeyF' && G.mode !== 'menu' && (FT.on || (PG && PG.on))) footKey();
  else if (e.code === 'KeyG' && G.mode === 'free' && !(PG && PG.on)) footKey();
  else if (e.code === 'KeyE' && FT && FT.on) { const r = G.beach && G.beach.interact(G.beachHint); if (r) FT.social(r); else FT.interact(); }
  else if (e.code === 'KeyP' && G.mode !== 'menu' && !(PG && PG.on) && !AIR()) togglePro();
  else if (e.code === 'KeyM') toast(audio.toggleMute() ? 'Звук выключен' : 'Звук включён');
  else if (e.code === 'Escape' && G.mode !== 'menu') toMenu();
  else if (e.code === 'KeyF' && G.mode !== 'menu' && !(PG && PG.on) && !AIR()) X.hookPress();
  else if (e.code === 'KeyR' && PG && PG.on) PG.restart();
  else if (e.code === 'KeyR' && JM && JM.on) JM.restart();
  else if (e.code === 'KeyE' && JM && JM.on) JM.eco();
  else if (e.code === 'KeyH' && PG && PG.on) PG.toggleHelp();
  else if (e.code === 'KeyI' && PG && PG.on) PG.toggleInst();
  else if (e.code === 'KeyR' && G.mode === 'race') startRace(); else if (e.code === 'KeyR' && G.mode === 'free') startFree();
});
window.addEventListener('keyup', (e) => { if (e.code === 'KeyE' && SPY && SPY.on) SPY.holdEnd(); if (e.code === 'Space') input.bar = false; if (e.code === 'ArrowDown' || e.code === 'KeyS') input.flare = false; if (KEY[e.code]) { input[KEY[e.code]] = false; e.preventDefault(); } });
window.addEventListener('blur', () => { input.left = input.right = input.ease = input.bar = input.flare = input.sin = input.shift = false; input.sheetT = 0; input.joy = null; });
if (TOUCH) document.body.classList.add('touchdev');
// касание левой половины экрана -- руль влево, правой -- вправо; несколько пальцев учитываются по отдельности
// Обзор и руль делят один экран. Мышь: перетаскивание -- обзор, колесо -- приближение (рулят с клавиатуры).
// Палец: держать на месте -- руль (левая/правая половина), провести -- обзор, два пальца -- щипок приближает и отдаляет.
// Двойной щелчок или двойное касание возвращает камеру за корму.
const held = new Map(), ptr = new Map(); let pinch = 0, lastTap = 0;
const syncTouch = () => { let l = false, r = false; for (const v of held.values()) { if (v === 'left') l = true; else r = true; } input.left = l; input.right = r; };
const resetView = () => { G.orbit = 0; G.orbitP = 0; G.zoom = 1; };
// кто сейчас «смотрит»: подзорная труба или фотоаппарат вертолёта -- палец двигает обзор, два пальца/колесо -- зум
const LK = () => (SPY && SPY.on ? SPY : HM && HM.on && HM.vf && HM.vf.on ? HM.vf : null);
canvas.addEventListener('pointerdown', (e) => { if (!G || G.mode === 'menu') return; audio.start(); e.preventDefault();
  if (LK()) { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, look: true, t: performance.now() }); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* без захвата */ }
    if (ptr.size === 2) { const [a, c] = [...ptr.values()]; pinch = Math.hypot(a.x - c.x, a.y - c.y); LK().holdEnd(); } else LK().holdStart(); return; } // в трубе: палец -- обзор, два -- кратность, руля нет
  const mouse = e.pointerType === 'mouse'; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, look: mouse, t: performance.now() });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* захват недоступен -- обзор просто кончится, когда палец уйдёт с холста */ }
  const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right', other = [...held.values()][0];
  if (ptr.size === 2 && !mouse && PG && PG.on && other && other !== side) { held.set(e.pointerId, side); syncTouch(); } // параплан: пальцы на обеих половинах -- обе клеванты
  else if (ptr.size === 2) { const [a, c] = [...ptr.values()]; pinch = Math.hypot(a.x - c.x, a.y - c.y); for (const q of ptr.values()) q.look = true; held.clear(); syncTouch(); }
  else if (!mouse && !document.body.classList.contains('motor') && !document.body.classList.contains('jet') && !document.body.classList.contains('heli')) { held.set(e.pointerId, e.clientX < window.innerWidth / 2 ? 'left' : 'right'); syncTouch(); } });
canvas.addEventListener('pointermove', (e) => { const q = ptr.get(e.pointerId); if (!q || !G) return; const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (ptr.size === 2 && PG && PG.on && held.size === 2) return;
  if (ptr.size === 2) { const [a, c] = [...ptr.values()], d = Math.hypot(a.x - c.x, a.y - c.y); if (pinch > 0) { if (LK()) LK().zoomBy(d / Math.max(pinch, 1)); else G.zoom = clamp(G.zoom * pinch / Math.max(d, 1), PG && PG.on ? 0.15 : 0.45, 3.2); } pinch = d; return; }
  if (LK()) { if (Math.hypot(e.clientX - q.x0, e.clientY - q.y0) > 9) { LK().holdEnd(); LK().pan(dx, dy); } return; } // сдвинул -- это обзор, а не зажатие
  // палец сдвинулся -- это обзор, а не руль
  if (!q.look && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) > 14) { q.look = true; if (held.delete(e.pointerId)) syncTouch(); }
  if (q.look) { const k = 5.5 / Math.max(window.innerHeight, 320); G.orbit = wrapPi(G.orbit + dx * k); G.orbitP = clamp(G.orbitP + dy * k, AIR() ? -0.6 : -0.22, 1.35); } }); // с вертолёта можно посмотреть и снизу
for (const n of ['pointerup', 'pointercancel']) window.addEventListener(n, (e) => { const q = ptr.get(e.pointerId); ptr.delete(e.pointerId); if (LK() && q) LK().holdEnd(); if (ptr.size < 2) pinch = 0; if (held.delete(e.pointerId)) syncTouch();
  if (q && n === 'pointerup' && G && Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < 8 && performance.now() - q.t < 300) { const now = performance.now(); if (now - lastTap < 320) { resetView(); lastTap = 0; } else lastTap = now; } });
canvas.addEventListener('wheel', (e) => { if (!G || G.mode === 'menu') return; e.preventDefault(); if (LK()) { LK().zoomBy(Math.exp(-e.deltaY * 0.0016)); return; } G.zoom = clamp(G.zoom * Math.exp(e.deltaY * 0.0012), PG && PG.on ? 0.15 : 0.45, 3.2); }, { passive: false });
{ const el = $('ts'); let y0 = null; const set = (v) => (e) => { e.preventDefault(); e.stopPropagation(); input.ease = v; input.bar = v; el.classList.toggle('on', v); y0 = v ? e.clientY : null; if (!v) input.sheetT = 0; };
  // Pro: провести по кнопке вверх -- выбрать шкот, вниз -- потравить; просто держать -- как раньше, обезветрить
  el.addEventListener('pointermove', (e) => { if (y0 === null || !G || !G.pro) return; const dy = e.clientY - y0; if (Math.abs(dy) > 10) { input.ease = input.bar = false; el.classList.remove('on'); input.sheetT = clamp(-dy / 50, -1, 1); } });
  el.addEventListener('pointerdown', set(true)); for (const n of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(n, set(false)); }
// джойстик моторных на сенсорном экране: кружок с точкой; точку тянут -- куда тянут, туда и рулит, дальше -- больше газа
{ const el = $('joy'), dot = el.firstElementChild; let id = null;
  const move = (e) => { const r = el.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    input.joy = { x, y }; dot.style.transform = `translate(${x * R * 0.62}px,${y * R * 0.62}px)`; };
  const end = (e) => { if (e.pointerId !== id) return; if (performance.now() - downT < 250) lastUp = performance.now(); id = null; input.joy = null; dot.style.transform = ''; el.classList.remove('on'); };
  let lastUp = 0, downT = 0, taps = 0; // двойной тап по джойстику -- input.joyTap (самолёт: максимал), тройной -- input.joyTap3 (самолёт: эконом)
  el.addEventListener('pointerdown', (e) => { const t = performance.now(); taps = t - lastUp < 320 ? taps + 1 : 1; if (taps === 2) input.joyTap = t; if (taps === 3) input.joyTap3 = t; downT = t; e.preventDefault(); e.stopPropagation(); audio.start(); id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* без захвата -- джойстик отпустится, когда палец уйдёт */ } el.classList.add('on'); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) { e.preventDefault(); move(e); } });
  for (const n of ['pointerup', 'pointercancel']) el.addEventListener(n, end); }
$('bmenu').onclick = () => toMenu();
$('bcam').onclick = () => { G.cam = (G.cam + 1) % 3; resetView(); };
$('bspy').onclick = () => { audio.start(); if (HM && HM.on && HM.vf) HM.vfToggle(); else SPY.toggle(); }; $('bpro').onclick = (e) => { e.currentTarget.blur(); togglePro(); }; $('spyx').onclick = () => SPY.close();
$('spyin').onclick = () => SPY.zoomBy(1.5); $('spyout').onclick = () => SPY.zoomBy(1 / 1.5);
let drag = null;

// капли на «объективе»: брызги долетают до зрителя и стекают
function lens(n) { const box = $('lens'); n = Math.min(Math.round(n), 30); if (box.childElementCount > 46) return;
  for (let i = 0; i < n; i++) { const d = document.createElement('i'), sz = 5 + Math.random() ** 2 * 30;
    d.style.cssText = `left:${Math.random() * 100}%;top:${18 + Math.random() * 74}%;width:${sz}px;height:${sz * (1 + Math.random() * 0.5)}px;animation-duration:${1.4 + Math.random() * 2.6}s;--fall:${12 + Math.random() * 90}px`;
    d.addEventListener('animationend', () => d.remove()); box.appendChild(d); } }

function toast(t) { if (G && G.toastHook && G.toastHook(t)) return; const el = $('toast'); el.textContent = t; el.style.opacity = 1; G.toastT = 1.9; }

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
// Цвет солнца -- по толще воздуха на пути луча (воздушная масса, Kasten-Young) и рэлеевскому ослаблению по каналам:
// в зените свет почти белый, к горизонту синее и зелёное рассеиваются -- солнце желтеет, оранжевеет и садится красным.
// Высота 1600 м -- воздух тоньше, но вечером в нём больше пыли после дня (свет краснее), утром воздух чище (розовее).
// uSunCol -- оттенок (максимальный канал = 1), uSunX -- сколько света дошло (для яркости диска)
function sunTint(sinEl, eve, storm) { const hD = Math.max(-0.6, Math.asin(clamp(sinEl, -1, 1)) * 57.2958);
  const am = 1 / (Math.sin(hD / 57.2958) + 0.50572 * Math.pow(hD + 6.07995, -1.6364)), a = Math.max(0, am - 1), q = eve ? 1.25 : 0.95;
  const r = Math.exp(-0.060 * q * a), g = Math.exp(-0.135 * q * a), b = Math.exp(-0.30 * q * a), mx = Math.max(r, g, b);
  let cr = r / mx, cg = Math.max(g / mx, 0.16), cb = Math.max(b / mx, eve ? 0.03 : 0.07); // у горизонта -- алый, не «чистый» красный
  if (!eve) { cb += 0.06 * (1 - cg); } // утренний свет розовее
  const w = storm * 0.8; ENV.uSunCol.value.set(cr + (0.9 - cr) * w, cg + (0.9 - cg) * w, cb + (0.92 - cb) * w); ENV.uSunX.value = clamp(r * 1.06, 0, 1); ENV.uEve.value = eve ? 1 : 0; }
// район Хан-Тенгри: рельеф грузится при первом входе (отдельный файл), дальше -- сразу
async function startKhan(craft, mode = '') { const merzNow = mode === 'merz'; const b = $('bfree'); b.classList.add('wait');
  try { if (!G.khan) { toast('Летим на Хан-Тенгри… грузим рельеф Иныльчека'); G.khan = await loadKhan(scene); G.merz = makeMerz(scene, G.khan); G.snow = makeSnow(scene); G.klabels = makePeakLabels($('game'), G.khan.h); } } catch (e) { toast(e.message); return; } finally { b.classList.remove('wait'); }
  if (craft === 'jet') JM.startZone(G.khan); else if (craft === 'heli') { if (merzNow) G.merz.force(); HM.startFree(mode); } }
function heliGo() { if (!HM) { toast('Вертолёт не загрузился — выберите другой снаряд'); return; } audio.start(); G.clock = G.todHour(); if (store.get('heliSite') === 'rwy') HM.startFree(); else startKhan('heli', ['merz', 'sar', 'school'].includes(store.get('heliSite')) ? store.get('heliSite') : ''); }
function dayCycle(dt) { if (G.clock === undefined) G.clock = 10; { const c = G.clock + (G.mode === 'menu' ? 0 : dt / 60 * (G.clockK || 1)); if (c >= 24) G.day = (G.day || 0) + 1; G.clock = c % 24; } const k = G.wx; if (!k) return; // G.day -- игровые сутки от 23 июля: идут сезоны; в меню время стоит на выбранном
  astroSun(G.day || 0, G.clock, SUN); const sinEl = SUN.y; // Солнце -- по эфемериде на игровую дату (astro.js): долгота дня и заря меняются с сезоном
  sunTint(sinEl, G.clock > 12, k.storm);
  const day = smooth(-0.16, 0.08, sinEl), dusk = sinEl > 0.02 ? 1 - smooth(0.02, 0.30, sinEl) : smooth(-0.17, 0.02, sinEl), sI = k.sun * smooth(-0.02, 0.22, sinEl), st = k.storm;
  ENV.uDay.value = day; ENV.uDusk.value = dusk; ENV.uSunI.value = sI; G.night = day < 0.35;
  // дымка у горизонта: на заре тёплая (вечером -- персиковая, пыльная после дня; утром -- чище и розовее)
  const d2 = dusk * 0.55 * (1 - st), m = 0.03 + 0.97 * day, ev = G.clock > 12, hz = ev ? [1.0, 0.55, 0.32] : [0.94, 0.62, 0.56];
  ENV.uHor.value.set((k.hor[0] * (1 - d2) + hz[0] * d2) * m, (k.hor[1] * (1 - d2) + hz[1] * d2) * m, (k.hor[2] * (1 - d2) + hz[2] * d2) * m + 0.012 * (1 - day)); scene.fog.color.setRGB(ENV.uHor.value.x, ENV.uHor.value.y, ENV.uHor.value.z); // Color.copy от вектора дала бы NaN и чёрные лодки
  if (sinEl > 0.02) { LIGHT.copy(SUN); { const c = ENV.uSunCol.value; sunL.color.setRGB(c.x, 0.08 + 0.92 * c.y, 0.06 + 0.94 * c.z); } sunL.intensity = 3.1 * sI; } else { const M = ENV.uMoon.value; if (M.y > 0.02) { LIGHT.set(M.x, M.y, M.z); sunL.intensity = (0.06 + 0.4 * M.w) * (1 - st); } else { LIGHT.set(0.2, 1, 0.1).normalize(); sunL.intensity = 0.05 * (1 - st); } sunL.color.setRGB(0.6, 0.72, 1); } // ночью светит настоящая Луна (stars.js): ярче в полнолуние, без Луны -- только свет неба
  hemi.intensity = 1.9 * (1 - 0.35 * st) * (0.1 + 0.9 * day) * (0.5 + 0.5 * smooth(-0.04, 0.32, sinEl) + 0.5 * (1 - day)); G.spray.uniforms.uLight.value = 0.12 + 0.88 * sI; WAKE_LIGHT.value = 0.1 + 0.9 * day;
  envT -= dt; if (dt > 0 && envT <= 0) { envT = 12; updateEnv(G.sky); } }
// ---------- топографическая карта: квадраты, снятые сверху с настоящего 3D-мира ----------
// Ортокамера над квадратом смотрит вниз (север -- вверх) и видит только рельеф, берег с посёлками и тушь хребтов (слои
// 1 и 2): ни неба, ни лодок, ни воды -- озеро даёт цвет фона, мелководье -- цвет дна из шейдера рельефа. Свет единый
// картографический: солнце с северо-запада, полдень, без облаков, -- как отмывка на топокарте, в любое время суток.
// Квадрат 256 пикселей; на уровне l котловина -- 2^l квадратов в ширину (l=8 -- около 4 м на пиксель). Снимаются по
// запросу карты, по нескольку за кадр, и хранятся последние 120.
// подложка озера на карте: плоскость под дном (её видит только камера карты), того же цвета, что и уход дна
let mapLake = null;
function makeMapLake() { const { W, H, X0, Y1, STEP } = G.far.userData.grid, pos = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (G.lake[j * W + i]) { const x0 = X0 + (i - 0.5) * STEP, x1 = x0 + STEP, z0 = -(Y1 - (j - 0.5) * STEP), z1 = z0 + STEP; pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mapLake = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ENV.uMapDeep.value, fog: false, side: THREE.DoubleSide }));
  mapLake.position.y = -16; mapLake.layers.set(1); mapLake.frustumCulled = false; scene.add(mapLake); }
const TILE = 256, mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 12000), tileCache = new Map(), tileQueue = [], tileWant = new Set(); let mapReady = false;
mapCam.up.set(0, 0, -1); mapCam.layers.set(1);
function mapTile(l, i, j) { const k = l + '/' + i + '/' + j, t = tileCache.get(k); if (t) { tileCache.delete(k); tileCache.set(k, t); return t; } if (!tileWant.has(k)) { tileWant.add(k); tileQueue.push([k, l, i, j]); } return null; }
function mapWork() { if (!G) return; if (!mapReady) { mapReady = true; makeMapLake(); const en = (o, l) => o.traverse((c) => c.layers.enable(l)); for (const o of G.mapObjs) en(o, 1); en(G.ridges, 2); for (const o of scene.children) if (o.isLight) o.layers.enable(1); }
  const g = G.far.userData.grid, size = (g.W * g.STEP), pr = renderer.getPixelRatio(), buf = renderer.getDrawingBufferSize(new THREE.Vector2()), cc = new THREE.Color(), ca = renderer.getClearAlpha(); renderer.getClearColor(cc);
  const keep = { sc: ENV.uSunCol.value.clone(), sun: SUN.clone(), day: ENV.uDay.value, dusk: ENV.uDusk.value, si: ENV.uSunI.value, st: ENV.uStorm.value, cov: ENV.uCover.value, hor: ENV.uHor.value.clone() };
  SUN.set(-0.55, 0.72, -0.42).normalize(); Object.assign(ENV.uDay, { value: 1 }); ENV.uDusk.value = 0; ENV.uSunI.value = 1; ENV.uStorm.value = 0; ENV.uCover.value = -1; ENV.uHor.value.set(0.56, 0.76, 0.97); ENV.uSunCol.value.set(1, 0.97, 0.9); ENV.uMap.value = 1;
  renderer.shadowMap.autoUpdate = false; renderer.setClearColor(0xd9cfb2, 1); // дыры сетки -- низины за хребтами: суша renderer.setRenderTarget(null); renderer.setScissorTest(true);
  const t0 = performance.now();
  while (tileQueue.length && performance.now() - t0 < 10) { const [k, l, i, j] = tileQueue.pop(); tileWant.delete(k); const ts = size / 2 ** l, cx = g.X0 + (i + 0.5) * ts, cy = g.Y1 - (j + 0.5) * ts;
    Object.assign(mapCam, { left: -ts / 2, right: ts / 2, top: ts / 2, bottom: -ts / 2 }); mapCam.position.set(cx, 5000, -cy); mapCam.lookAt(cx, 0, -cy); mapCam.updateProjectionMatrix();
    if (l >= 4) mapCam.layers.enable(2); else mapCam.layers.disable(2); // тушь хребтов -- когда она различима
    setRidgeRes(TILE, TILE); renderer.setViewport(0, 0, TILE / pr, TILE / pr); renderer.setScissor(0, 0, TILE / pr, TILE / pr); renderer.render(scene, mapCam);
    const c = document.createElement('canvas'); c.width = c.height = TILE; c.getContext('2d').drawImage(renderer.domElement, 0, buf.y - TILE, TILE, TILE, 0, 0, TILE, TILE);
    tileCache.set(k, c); if (tileCache.size > 120) tileCache.delete(tileCache.keys().next().value); }
  SUN.copy(keep.sun); ENV.uDay.value = keep.day; ENV.uDusk.value = keep.dusk; ENV.uSunI.value = keep.si; ENV.uStorm.value = keep.st; ENV.uCover.value = keep.cov; ENV.uHor.value.copy(keep.hor); ENV.uSunCol.value.copy(keep.sc); ENV.uMap.value = 0;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, buf.x / pr, buf.y / pr); renderer.setClearColor(cc, ca); renderer.shadowMap.autoUpdate = true; setRidgeRes(buf.x, buf.y);
  if (G.onTiles) G.onTiles(); }
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
  if (tileQueue.length) mapWork(); // квадраты карты снимаем ДО кадра игры: он потом целиком перерисует холст
  if (!G.freeze) tick(dt); // freeze -- только для тестов: мир стоит, картинка рисуется
  const b = G.player.b, sp = b.speed;
  updateCamera(dt, b, sp);
  { const nr = G.inKhan && G.cam !== 1 ? 2.5 : 0.5; if (camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); } } // в горах камера далеко от земли: ближняя плоскость дальше -- точнее глубина, нет мерцания
  G.stars.update(camera.position.x, -camera.position.z, G.clock ?? 13, renderer.getPixelRatio(), now / 1000, G.day || 0); G.stars.showLines(G.cLines || (SPY && SPY.on)); // звёзды -- для той точки карты, где камера
  { const k = PG && PG.on ? 0 : Math.min(0.88, G.clouds.inside * 1.05), el = $('cfog'); if (Math.abs(k - (G.cfogK || 0)) > 0.01) { G.cfogK = k; el.style.opacity = k.toFixed(2); // внутри облака -- мгла (у параплана своя)
    el.style.background = ENV.uDay.value > 0.3 ? 'rgba(236,241,248,1)' : 'rgba(40,46,70,1)'; } }
  G.inKhan = !!(G.khan && khanInside(camera.position.x, -camera.position.z));
  // метель в районе: ветрено -- позёмка, буран -- снег стеной
  if (G.snow) { const U = HM && HM.on && HM.F ? HM.F.wU || 0 : { breeze: 10, santash: 22, ulan: 40 }[G.preset] || 0, d = 265 * Math.PI / 180; G.snow.update(dt, camera.position, { x: -Math.sin(d) * U, y: -Math.cos(d) * U }, G.inKhan ? Math.max(0, (U - 10) / 16) : 0); }
  if (G.klabels) G.klabels.update(camera, G.inKhan && G.mode !== 'menu'); // подписи вершин района
  if (G.merz && G.inKhan) G.merz.update(dt, { X: camera.position.x, Y: -camera.position.z }, audio, G.spray); // озеро Мерцбахера: прорыв по часам // камера в районе Хан-Тенгри: облака выше и реже
  lodTick(dt);   if (G.jailoo) G.jailoo.update(dt, G.t); G.clouds.update(dt, camera, { cover: Math.min(1, Math.max(0, (ENV.uCover.value + 0.62) / 1.48)) * (G.inKhan ? 0.55 : 1), storm: ENV.uStorm.value, cirrus: ENV.uCirrus.value, wind: G.wind, clock: G.clock, preset: G.preset, baseUp: G.inKhan ? 2300 : 0 }); // облачность погоды (-0.62..0.86) -> 0..1; пресет -- какой ветер (улан, санташ, бриз)
  if (G.beach) G.beachHint = G.beach.update(dt, FT && FT.on ? FT.state : null);
  if (G.finds && G.mode !== 'menu') G.finds.update(dt, FT && FT.on && !FT.state.swim && FT.state.st !== 'dis' ? FT.state : null, G.beach.dayN, FT ? FT.magnet : 1.2);
  beachSound(dt, b);
  sunL.target.position.set(b.X, b.base || 0, -b.Y); sunL.position.set(b.X + LIGHT.x * 30, (b.base || 0) + LIGHT.y * 30, -b.Y + LIGHT.z * 30);
  if (FT && FT.on) { audio.vario(0, false); audio.airflow(0, 0, 0, false); } else if (AIR()) AIR().sound(dt); else if (PG && PG.on) PG.sound(dt); else audio.update(b);
  if (G.mode !== 'menu') updateHud(dt, b, sp);
  // адаптивное разрешение -- ДО отрисовки: смена размера очищает холст, после неё был бы пустой кадр
  fpsT += dt; fpsN++; if (fpsT > 2) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; qHold--;
    if (qMode !== 'auto') { /* человек выбрал сам -- не трогаем ни ступень, ни разрешение */ }
    else if (fps < 34 && qHold <= 0) { qHold = 2; // после смены ступени даём кадрам устояться
      if (quality > 0) setQuality(quality - 1); else if (pixelRatio > PR_MIN) { pixelRatio = Math.max(PR_MIN, pixelRatio * 0.86); resize(); } }
    else if (fps > 57 && pixelRatio < PR_MAX && ++G.slow > 4) { G.slow = 0; pixelRatio = Math.min(PR_MAX, pixelRatio * 1.1); resize(); } }
  if (post) { // где солнце на экране и насколько оно «в кадре»
    // матрицы камеры -- этого кадра (иначе солнце на экране «отстаёт» на кадр и уезжает при поворотах)
    camera.updateMatrixWorld(); tmpV.copy(camera.position).addScaledVector(SUN, 1e5).project(camera); camera.getWorldDirection(sunDir); const f = sunDir.dot(SUN), sx = tmpV.x * 0.5 + 0.5, sy = tmpV.y * 0.5 + 0.5;
    const off = Math.max(0, Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5)) - 0.5), a = f > 0.05 ? ENV.uSunI.value * (1 - ENV.uStorm.value) * smooth(0.05, 0.35, f) * Math.exp(-off * 3.5) : 0;
    // блик объектива -- по силе солнца: в зените ярче, к горизонту, когда свет проходит толщу воздуха, почти гаснет
    const X = ENV.uSunX.value; post.setSun(sx, sy, (G.mode === 'menu' ? a * 0.6 : a) * X * X * 0.25, ENV.uSunCol.value);
  }
  if (post) post.render(scene, camera); else renderer.render(scene, camera);
  G.frame++;
}
// Мелкие детали вдали: у лодок, катеров, парохода -- по 20-45 отдельных деталей (леера, лебёдки, фигурки). За сотни
// метров большинство из них меньше пикселя, но каждая всё равно -- отдельный вызов отрисовки. Раз в несколько кадров
// такие детали снимаются со слоя камеры (их собственная видимость не трогается -- ею управляет игра), а когда снова
// становятся крупнее пикселя (подошли ближе, подзорная труба) -- возвращаются. Картинка та же, вызовов -- меньше.
const LODV = new THREE.Vector3(); let lodList = [], lodScanT = 0, lodFov = 0, lodN = 0;
function lodTick(dt) {
  lodScanT -= dt; if (lodScanT <= 0) { lodScanT = 2; lodList = []; // список мелких деталей обновляется раз в 2 с: суда появляются по ходу игры
    scene.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || !o.frustumCulled || !o.geometry) return; if (!o.userData.lodR) { if (o.layers.mask !== 1) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingSphere) return; o.userData.lodR = g.boundingSphere.radius; }
      if (o.userData.lodR < 3) lodList.push(o); }); }
  if (++lodN % 4 && camera.fov === lodFov) return; lodFov = camera.fov;
  const K = 2 * (G.bufH || window.innerHeight) / (2 * Math.tan(camera.fov * Math.PI / 360)), cp = camera.position;
  for (const o of lodList) { const s = o.matrixWorld.getMaxScaleOnAxis(); LODV.setFromMatrixPosition(o.matrixWorld); const px = o.userData.lodR * s * K / (LODV.distanceTo(cp) + 1e-3);
    if (px < 0.8) o.layers.disable(0); else o.layers.enable(0); } // меньше 0.8 пикселя в поперечнике -- не рисуем
}
// один шаг мира: физика, гонка, эффекты. Без отрисовки -- им же пользуются автотесты для перемотки.
function tick(dt) {
  const P = G.player, b = P.b, R = G.race;
  G.t += dt; G.wind.update(dt); dayCycle(dt);
  if (FT && FT.on) { FT.tick(dt); envTick(G.player.b); return; } // Дымок пешком: снаряд стоит, где оставили
  if (PG && PG.on) { PG.tick(dt); envTick(G.player.b); return; } // параплан: свой мир в воздухе
  if (AIR()) { AIR().tick(dt); envTick(G.player.b); return; } // Як-130, Ми-8
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
  } else if (G.pro && !b.kind) ctl = X.filterCtl({ steer: (input.right ? 1 : 0) - (input.left ? 1 : 0), ease: input.bar, sheet: clamp((input.sin ? 1 : 0) - (input.flare ? 1 : 0) + (input.sheetT || 0), -1, 1), left: input.left, right: input.right }); // Pro: ↑ выбрать, ↓ потравить, пробел -- обезветрить
  else ctl = X.filterCtl({ steer: (input.right ? 1 : 0) - (input.left ? 1 : 0), ease: input.ease, left: input.left, right: input.right });
  b.pro = !!G.pro && !b.kind;
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

  envTick(b);
}
// вода, небо, флаг
function envTick(b) {
  if (G.corridor) G.corridor.tick(G.t);
  G.water.uniforms.uTime.value = G.t; G.water.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
  G.water.updateGust(G.wind, b.X, -b.Y, 22); // карта порывов: по шестой части за кадр
  ENV.uCloud.value.set(-G.t * 0.0035 * G.wind.sx, G.t * 0.0035 * G.wind.sy); if (!(PG && PG.on) && !AIR()) { G.water.setBoat(b); G.water.setTrail(b, G.player.wake.pts); } else G.water.setBoat({ X: 1e7, Y: 1e7, th: 0, speed: 0 }); // в воздухе лодки на воде нет
  G.shore.flag.rotation.y = Math.atan2(G.wind.sy, G.wind.sx) + Math.sin(G.t * 7) * 0.12;

}

function updateCamera(dt, b, sp) {
  if (SPY && SPY.on && G.mode !== 'menu') { SPY.place(dt, G.spyAir && AIR() && AIR().spyEye ? AIR().spyEye() : b); G.sky.position.copy(camera.position); return; } // вид в подзорную трубу
  if (FT && FT.on) { FT.camera(dt); G.sky.position.copy(camera.position); return; }
  if (PG && PG.on) { PG.camera(dt); G.sky.position.copy(camera.position); return; }
  if (AIR()) { AIR().camera(dt); G.sky.position.copy(camera.position); return; }
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
  if (G.dbgLook) { const L = G.dbgLook; camera.position.set(...L.p); camera.lookAt(...L.t); camera.fov = 50; } // для автотестов: камера в точку
  if (G.mode !== 'menu' && camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateProjectionMatrix();
  G.sky.position.copy(camera.position);
}

// ---------- приборы ----------
const dial = $('dial'), dc = dial.getContext('2d');
function drawDial(b) {
  const W = 352, c = W / 2, R = 142; dc.clearRect(0, 0, W, W);
  dc.fillStyle = 'rgba(5,20,45,.30)'; dc.beginPath(); dc.arc(c, c, R + 14, 0, 7); dc.fill();
  { const rg = G.mmRange(false); G.mini.draw(dc, c, R, b.X, b.Y, b.th, rg); dc.fillStyle = 'rgba(255,255,255,.8)'; dc.font = '600 17px sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(rangeTxt(rg), c, c + 112); }
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
  if (b.pro && !b.capsized) drawTell(b, c);
}
// Колдунчики Pro: две ленточки на парусе, по обе стороны. Обе ровно струятся назад -- шкот настроен.
// Наветренная (зелёная) задирается и полощет -- шкот недобран; подветренная (красная) падает и пляшет -- перебран
function drawTell(b, c) { const t = G.t, ux = Math.sin(b.boom), uy = Math.cos(b.boom), lee = b.boom >= 0 ? 1 : -1, nx = uy * lee, ny = -ux * lee; // n -- к подветренной стороне
  const px = c + ux * 26, py = c - 12 + uy * 26;
  const tape = (side, k, col, ph) => { const lift = side < 0 ? k : -k * 0.6; dc.strokeStyle = col; dc.lineWidth = 7; dc.lineCap = 'round'; dc.beginPath();
    for (let i = 0; i <= 8; i++) { const s = i / 8, along = s * 60 * (1 - 0.35 * k), w = (Math.sin(t * (6 + 16 * k) + s * 7 + ph) * (1.2 + 13 * k) + lift * 26) * s, ox = nx * side * 14, oy = ny * side * 14;
      const x = px + ox + ux * along + nx * side * w, y = py + oy + uy * along + ny * side * w; if (i) dc.lineTo(x, y); else dc.moveTo(x, y); } dc.stroke(); };
  tape(-1, b.ttW, '#58d68d', 0); tape(1, b.ttL, '#ff6b5b', 2.1); }
let hintKey = '', hintT = 0;
// спешиться / вернуться: снаряд подключается адаптером (параплан -- после посадки, лодка -- у самого берега)
// звук пляжа: слушатель -- Дымок или лодка; до кромки воды меряем кольцами раз в полсекунды
let bsT = 0, bsP = null;
function beachSound(dt, b) { if (!G.beach || G.mode === 'menu') return; bsT -= dt; const foot = FT && FT.on;
  if (!foot && ((PG && PG.on) || AIR())) { audio.beach({ on: false }); return; }
  const X = foot ? FT.state.X : b.X, Y = foot ? FT.state.Y : b.Y;
  if (bsT <= 0 || !bsP) { bsT = 0.5; const wet = G.h(X, Y) < 0; let water = 99;
    for (let r = 3; r <= 45 && water > 90; r += 6) for (let a = 0; a < 8; a++) { const hh = G.h(X + Math.cos(a * 0.785) * r, Y + Math.sin(a * 0.785) * r); if ((hh < 0) !== wet) { water = r; break; } }
    bsP = Object.assign(G.beach.sound(X, Y), { water, day: Math.min(1, Math.max(0, ENV.uDay.value)), on: true }); }
  if (foot) audio.foot(b.tws || 4); audio.beach(bsP); }
function footAdapter() { if (!G || G.mode === 'menu') return null; if (PG && PG.on) return paraAdapter(PG); if (G.mode === 'free' && G.player && G.player.b) return boatAdapter(G); return null; }
function footKey() { if (FT.on) { FT.mount(); return; } const ad = footAdapter(); if (!ad) return; const q = ad.canExit(); if (!q.ok) { toast(q.why || 'Сейчас не выйти'); return; } FT.start(ad); }
// Режим Pro для яхты: шкот без автоподбора, по колдунчикам на компасе. Обычная игра не меняется
function togglePro() { G.pro = !G.pro; store.set('pro', G.pro); $('bpro').classList.toggle('on', G.pro); G.proT = 0;
  toast(G.pro ? 'Pro: шкот вручную — следите за колдунчиками' : 'Обычный режим: шкот подбирается сам'); }
// Приборы обновляются много раз в секунду, а меняются редко. Запись в DOM того же значения всё равно заставляет
// браузер пересчитывать стили и раскладку, поэтому пишем только изменившееся
const setT = (el, s) => { if (el.textContent !== s) el.textContent = s; };
const setP = (el, k, v) => { if (el[k] !== v) el[k] = v; };
const setSt = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
// на лавировке: знак ушёл за траверз, значит другим галсом он уже достаётся
function tackNow(R, b) { const tg = target(R, G.player.leg, false), brg = Math.atan2(tg.X - b.X, tg.Y - b.Y);
  return Math.abs(wrapPi(brg - b.th)) > 92 * DEG && Math.abs(wrapPi(brg - b.twd)) < 120 * DEG && Math.hypot(tg.X - b.X, tg.Y - b.Y) > 25; }
function updateHud(dt, b, sp) {
  if (FT && FT.on) { if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; } FT.hud(dt); return; }
  if (AIR()) { AIR().hud(dt); return; }
  if (G.frame % 10 === 0) { const ad = footAdapter(), ok = !!ad && ad.canExit().ok; setP($('bfoot'), 'hidden', !ok); if (ok) setT($('bfoot'), 'выйти'); setP($('rfoot'), 'hidden', !(ok && PG && PG.on)); }
  if (PG && PG.on) { setP($('bpro'), 'hidden', true); PG.hud(dt); return; }
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
  const heel = Math.abs(b.phi) / DEG, R = G.race; G.proT = (G.proT ?? 99) + dt; setP($('bpro'), 'hidden', !!b.kind || G.mode === 'menu'); // Pro -- только у яхты
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
  else if (b.pro && b.ttL > 0.6) h = TOUCH ? 'Красный колдунчик пляшет — шкот перебран: проведите по «шкоту» вниз' : 'Красный колдунчик пляшет — шкот перебран: ↓ потравить';
  else if (b.pro && b.ttW > 0.6 && b.ease < 0.3) h = TOUCH ? 'Зелёный колдунчик полощет — шкот недобран: проведите по «шкоту» вверх' : 'Зелёный колдунчик полощет — шкот недобран: ↑ выбрать';
  else if (b.pro && (G.proT ?? 99) < 9) h = TOUCH ? 'Pro: по «шкоту» вверх — выбрать, вниз — потравить · держать — обезветрить' : 'Pro: ↑ выбрать шкот · ↓ потравить · пробел — обезветрить';
  else if (b.ease > 0.6 && heel < 12 && twa < 120) h = 'Шкот потравлен — парус не тянет';
  else if (T < 9) h = TOUCH ? 'Держать слева или справа — руль · провести — обзор' : '← → руль · пробел — травить шкот · мышь — обзор';
  else if (G.mode === 'race' && R.t < 0) h = 'К сигналу — к линии между красным и синим знаком';
  else if (G.mode === 'race' && R.t < 14 && G.player.leg <= 1) h = 'Знак 1 — против ветра: идите зигзагом, под 45° к ветру';
  if (h !== hintKey) { hintKey = h; const el = $('hint'); el.hidden = !h; el.textContent = h; el.className = 'hud' + (alert ? ' alert' : ''); }
}

window.__setQ = (q) => setQuality(q); window.__wx = (id, clock) => { if (id) { G.preset = id; applyPreset(); } if (clock !== undefined) { G.clock = clock; dayCycle(0); } }; /* для автотестов: погода и время */ window.__spy = () => SPY; window.__para = () => PG; window.__jet = () => JM; window.__heli = () => HM; window.__foot = () => FT; window.__footKey = () => footKey(); window.__gfx = () => ({ renderer, scene, camera, post, sunL, ENV }); window.__game = () => { if (G) G.__X = X; return G; }; window.__tick = (sec, inp) => { Object.assign(input, inp || {}); for (let i = 0; i < sec * 60; i++) tick(1 / 60); }; // для автотестов
init().catch((e) => { $('loadmsg').textContent = 'Не удалось запустить: ' + e.message; console.error(e); });
