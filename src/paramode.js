// Режим «Параплан»: свободный полёт и гонка по маршруту. Связывает физику (para.js), модели (paramodel.js), камеру,
// приборы и звук. Главный модуль отдаёт сюда кадр целиком, пока режим включён (tick, camera, hud, sound).
//
// Старт: по умолчанию -- лебёдка на старом аэродроме Чолпон-Аты (полоса 16/34 над городом). Место можно выбрать на
// карте: на склоне -- старт с ног (подъём крыла и разбег), на ровной суше -- снова лебёдка, над озером -- буксировка
// за катером. Управление -- клеванты: держать дольше -- тянуть глубже (крен круче); двойное нажатие -- в пол (спираль);
// обе сразу -- торможение и подрыв у земли; пробел -- акселератор (на буксировке -- отцепка, на склоне -- разбег).
// Гонка -- как на настоящих соревнованиях: все в воздухе над аэродромом, окно старта через 45 с, выход из стартового
// цилиндра, два поворотных цилиндра над предгорьями, цель -- поле у пляжа. Сели раньше -- считается оставшийся путь.
import { rangeTxt } from './minimap.js';
import * as THREE from 'three';
import { Air, Glider, aiPilot, aiLand, WING } from './para.js';
import { makeGlider } from './glidermodel.js';
import { makeClouds, makeBirds, makeCylinder, makeWinch, makeWindsock, makeTarget, makeShadow, makeTowLine, makeAirDust, makeTrail, makeVector, makeStreaks } from './paramodel.js';
import { MODEL } from './craftmodels.js';
import { playToon } from './paratoon.js';
import { SUN, loadLandcover } from './world.js';
import { clamp, smooth, wrapPi, DEG } from './sim.js';

const AIRPORT = { X: -4385, Y: 1809, name: 'старый аэродром' };
// места старта: аэродром (склон над ним), высшая точка над Чолпон-Атой -- пик Кургак-Сай, гора Калитка
const SITES = { airport: { name: 'Аэродром', sub: 'склон над городом', X: AIRPORT.X, Y: AIRPORT.Y, r0: 600, r1: 4500 }, kurgak: { name: 'Кургак-Сай', sub: 'вершина ≈4100 м', X: -7576, Y: 15976, r0: 120, r1: 900 }, kalitka: { name: 'Калитка', sub: 'гора ≈2600 м', X: -7471, Y: 7112, r0: 60, r1: 700 } }; // 42°39′13″ с. ш., 77°03′24″ в. д., полоса 16/34
const RIVALS = [['Беркут', 0.95, [0x9cc6dd, 0xf6e3b4, 0x5d7b91], 0x5d7b91], ['Ак-Шумкар', 0.88, [0xc7e3b8, 0xf2b8c6, 0x6b7f5d], 0x6b7f5d], ['Кара-Куш', 0.8, [0xd8c3ea, 0xa9d8cf, 0x6a5d86], 0x6a5d86], ['Тулпар', 0.72, [0xf6d29b, 0xa7c4e8, 0x8a6a4f], 0x8a6a4f]]; // пастель под Дымка
const TPS = [['Опол-Тоо', -5508, 4286], ['Круглая горка', -6896, 3332], ['Тегерек-Тоо', -5386, 6377], ['Кызыл-Тоо', 3519, 3246], ['Чоң-Таш', 3465, 5495], ['Чолпон-Ата', 0, 1500], ['Ак-Ала-Таш', -4522, 8731]];
const DIRS = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} км` : `${Math.round(m)} м`);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
body.para #speed>b,body.para #speed>small,body.para #pos,body.para #wear{display:none}body.para #speed{top:136px}body.para.feel #speed{top:14px}body.para #tools{margin-top:0} /* кнопки (меню, камера, друзья, труба) остаются под приборами */
body.para.feel #phud,body.para.feel #p_var,body.para.feel #p_brk,body.para.feel #dialwrap{display:none}
#p_mood{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .6s,background .6s}
body.para #brief{left:50%;right:auto;top:50%;bottom:auto;transform:translate(-50%,-50%);width:min(340px,86vw)}body.para #brief canvas{width:100%;height:auto}
#phud{left:max(16px,env(safe-area-inset-left,0px));top:14px}
#p_alt b{font-size:44px;font-weight:300;line-height:1;letter-spacing:-1px}#p_alt small{font-size:13px;color:var(--dim);margin-left:5px}
#p_alt .s{font-size:13px;color:var(--dim);margin-top:3px}#p_alt .s b{font-size:13px;font-weight:600;color:var(--ink);letter-spacing:0}
#p_st{font-size:13px;margin-top:4px;font-weight:600}
#p_var{position:fixed;left:max(16px,env(safe-area-inset-left,0px));top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:10px}
#p_var .bar{position:relative;width:12px;height:min(34vh,240px);border-radius:6px;background:rgba(7,26,58,.35);border:1px solid rgba(255,255,255,.22);overflow:hidden}
#p_var .bar i{position:absolute;left:0;right:0;border-radius:4px}#p_var .bar u{position:absolute;left:-2px;right:-2px;top:50%;height:2px;background:rgba(255,255,255,.7)}
#p_var .bar s{position:absolute;left:-3px;right:-3px;height:3px;background:#fff;border-radius:2px}
#p_var b{display:block;font-size:34px;font-weight:300;line-height:1}#p_var small{font-size:12px;color:var(--dim)}#p_var .avg{font-size:12px;color:var(--dim);margin-top:4px}
#p_brk{position:fixed;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(26px + env(safe-area-inset-bottom,0px));display:flex;gap:6px;align-items:flex-end}
#p_brk i{display:block;width:10px;height:70px;border-radius:5px;background:rgba(7,26,58,.35);border:1px solid rgba(255,255,255,.2);position:relative;overflow:hidden}
#p_brk i b{position:absolute;left:0;right:0;top:0;background:#ff8a2a}#p_brk i.k b{top:auto;bottom:0;background:#7fd0ff}
#p_brk span{font-size:10px;color:var(--dim);writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:.08em}
@media (max-width:760px){#p_coach{right:auto;left:50%;top:auto;transform:translateX(-50%);bottom:calc(118px + env(safe-area-inset-bottom,0px))}}
body.touchdev #p_brk{bottom:calc(122px + env(safe-area-inset-bottom,0px))}
#p_coach{position:fixed;right:max(16px,env(safe-area-inset-right,0px));top:190px;width:min(330px,calc(100vw - 32px));box-sizing:border-box;padding:14px 18px 12px;pointer-events:auto;text-shadow:none;z-index:6}
#p_coach .n{font:700 11px var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--buoy)}#p_coach h3{margin:4px 0 6px;font-size:20px;font-weight:700}
#p_coach p{margin:0;font-size:14px;line-height:1.45;color:#dfe9f7}#p_coach kbd{display:inline-block;min-width:22px;padding:1px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.12);font:700 13px var(--ui);text-align:center;color:#fff}
#p_coach .row{display:flex;justify-content:space-between;align-items:center;margin-top:10px}#p_coach .dots i{display:inline-block;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.25);margin-right:5px}#p_coach .dots i.on{background:var(--buoy)}#p_coach .dots i.ok{background:var(--ok)}
#p_coach button{font:600 12px var(--ui);color:var(--dim);background:none;border:0;cursor:pointer;padding:4px 0}#p_coach.ok{border-color:var(--ok)}#p_coach.ok h3::after{content:' ✓';color:var(--ok)}
#p_brave{left:50%;top:62px;transform:translateX(-50%);text-align:center;transition:transform .15s}#p_brave b{font-size:30px;font-weight:800;color:#ffe9a8}#p_brave i{font-style:normal;font-size:22px;font-weight:800;color:#ff8a2a;margin-left:6px}
#p_brave small{display:block;font-size:12px;color:var(--dim);letter-spacing:.06em}#p_brave.live b{color:#fff}#p_brave.fl{transform:translateX(-50%) scale(1.25)}
#p_cloud{position:fixed;inset:0;background:#e9eef3;opacity:0;pointer-events:none;transition:opacity .4s}
#p_flash{position:fixed;left:50%;top:30%;transform:translateX(-50%);font:800 clamp(22px,5vmin,40px) var(--ui);color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.6);opacity:0;pointer-events:none;white-space:nowrap}
#p_flash.go{animation:pflash 2.2s ease-out}@keyframes pflash{0%{opacity:0;transform:translateX(-50%) scale(.6)}12%{opacity:1;transform:translateX(-50%) scale(1.06)}25%{transform:translateX(-50%) scale(1)}75%{opacity:1}100%{opacity:0}}
`;

// Роза ветров Чолпон-Аты (повторяемость направлений, %, округлённо): днём -- бриз с озера (Ю, ЮЗ), ночью -- горный
// ветер со склонов Кунгея (С, СВ), Санташ -- с востока, Улан -- с запада
const ROSE = [['С', 14], ['СВ', 10], ['В', 13], ['ЮВ', 7], ['Ю', 18], ['ЮЗ', 12], ['З', 15], ['СЗ', 11]];
function drawRose(cv, fromDeg) { const x = cv.getContext('2d'), Wd = cv.width, Hh = cv.height, c = Wd / 2, cy = 200, Rm = 150; x.clearRect(0, 0, Wd, Hh);
  x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1; for (const r of [50, 100, 150]) { x.beginPath(); x.arc(c, cy, r, 0, 7); x.stroke(); }
  const mx = Math.max(...ROSE.map((r) => r[1])); ROSE.forEach(([n, v], i) => { const a = i * Math.PI / 4, r = 22 + (Rm - 22) * v / mx, w = 0.3;
    x.fillStyle = 'rgba(127,208,255,.55)'; x.beginPath(); x.moveTo(c, cy); x.arc(c, cy, r, a - Math.PI / 2 - w, a - Math.PI / 2 + w); x.closePath(); x.fill();
    x.fillStyle = '#fff'; x.font = '600 18px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, c + Math.sin(a) * (Rm + 22), cy - Math.cos(a) * (Rm + 22)); x.font = '12px sans-serif'; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText(v + '%', c + Math.sin(a) * (r + 12), cy - Math.cos(a) * (r + 12)); });
  const a = fromDeg * Math.PI / 180; x.strokeStyle = x.fillStyle = '#ff8a2a'; x.lineWidth = 6; x.beginPath(); x.moveTo(c + Math.sin(a) * Rm, cy - Math.cos(a) * Rm); x.lineTo(c + Math.sin(a) * 30, cy - Math.cos(a) * 30); x.stroke();
  x.beginPath(); x.arc(c + Math.sin(a) * 30, cy - Math.cos(a) * 30, 8, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = '700 18px sans-serif'; x.fillText('Роза ветров Чолпон-Аты', c, 395); x.font = '13px sans-serif'; x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText('голубое — как часто дует, оранжевое — сейчас', c, 420); }

export function makeParaMode(A) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input } = A;
  let inst = store.get('paraInst') !== 0, gust = 0, uAvg = 0, uPrev = 0, gustHit = 0, mood = 0; // inst -- приборы (компас, высота, вариометр); по умолчанию включены, I -- скрыть
  let helpOn = store.get('paraHelp') !== 0, near = null, bT = 0; // подсказки: видимый воздух, след, вектор, радар потоков
  let on = false, P = null, air = null, rivals = [], R = null, F = null, built = false, W = null, field = null, prevPlayer = null;
  const hold = { L: 0, R: 0, B: 0, F: 0, dL: false, dR: false, lastL: -9, lastR: -9, pl: false, pr: false };
  const lift = []; // ассистент термиков: где на последних кругах был подъём (x, y, vario)
  const done = new Set(store.get('ach') || []), ach = (id) => { if (done.has(id)) return; done.add(id); A.ach(id); if (P && P.model && P.model.happy) P.model.happy(); }; // достижение -- Дымок радуется
  const C3 = new THREE.Vector3(), Q0 = { wx: 0, wy: 0, U: 0 };

  // поле для посадки (и цель гонки): берег западнее города, южнее аэродрома -- первая суша от воды плюс 90 м
  function findField() { const X = AIRPORT.X; let Y = -1500; while (Y < 1500 && G.h(X, Y) < 1) Y += 10; Y += 90;
    let best = { X, Y }, bs = 1e9; for (let dx = -300; dx <= 300; dx += 50) for (let dy = 0; dy <= 300; dy += 50) { const x = X + dx, y = Y + dy, h0 = G.h(x, y); if (h0 < 2) continue; const sl = Math.abs(G.h(x + 20, y) - G.h(x - 20, y)) + Math.abs(G.h(x, y + 20) - G.h(x, y - 20)); if (sl + Math.hypot(dx, dy) * 0.01 < bs) { bs = sl + Math.hypot(dx, dy) * 0.01; best = { X: x, Y: y }; } }
    return { ...best, name: 'пляж у аэродрома' }; }
  function build() { if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.createElement('div'); hud.id = 'phudwrap'; hud.hidden = true;
    hud.innerHTML = `<div id="p_mood"></div><div id="p_cloud"></div><div id="phud" class="hud"><div id="p_alt"><b>0</b><small>м</small><div class="s" id="p_agl"></div><div class="s" id="p_spd"></div><div id="p_st"></div></div></div>
      <div id="p_var" class="hud"><div class="bar"><u></u><i></i><s></s></div><div><b>0.0</b><small>м/с</small><div class="avg"></div></div></div>
      <div id="p_brk" class="hud"><i><b></b></i><i class="k"><b></b></i><i><b></b></i><span>Л · аксель · П</span></div><div id="p_flash" class="hud"></div><div id="p_brave" class="hud" hidden></div><div id="p_coach" class="panel" hidden></div>`;
    $('game').appendChild(hud);
    field = findField(); air = new Air(G.h, G.wind, 11);
    W = { clouds: makeClouds(scene), birds: makeBirds(scene), winch: makeWinch(), sockA: makeWindsock(), sockF: makeWindsock(), target: makeTarget(), shadow: makeShadow(), tow: makeTowLine(), boat: MODEL.boat({}), cyl: [], dust: makeAirDust(scene), streaks: makeStreaks(scene), trail: makeTrail(scene), vec: makeVector(scene) };
    scene.add(W.winch, W.sockA.root, W.sockF.root, W.target, W.shadow, W.tow.line, W.boat.root);
    const gA = G.h(AIRPORT.X + 40, AIRPORT.Y - 120); W.sockA.root.position.set(AIRPORT.X + 40, gA, -(AIRPORT.Y - 120));
    W.sockF.root.position.set(field.X + 28, G.h(field.X + 28, field.Y), -field.Y); W.target.position.set(field.X, G.h(field.X, field.Y) + 0.15, -field.Y);
    P = mkEnt('Вы', [0xf2a58e, 0x9cc6dd, 0x5d6f91], 0x5d6f91, 1, 0xf2f2f2); P.id = 'para'; P.g.feel = true;
    rivals = RIVALS.map((r, i) => mkEnt(r[0], r[2], r[3], r[1], 0xffffff, 100 + i));
    show(false); }
  function mkEnt(name, pal, suit, skill, helmet = 0xffffff, seed = 1) { const g = new Glider(seed), model = makeGlider(pal, suit, helmet); scene.add(model.root); g.eye = [0, 0.95, 0.15];
    return { name, g, b: g, model, skill, mem: {}, leg: 0, time: 0, wake: { mesh: { visible: false }, reset() {}, update() {} }, ai: {} }; }
  function show(v) { if (!W) return; for (const k of ['winch', 'target', 'shadow']) W[k].visible = v; W.sockA.root.visible = W.sockF.root.visible = v; W.tow.line.visible = false; W.boat.root.visible = false; W.clouds.mesh.visible = v; if (!v) { W.dust.points.visible = false; W.streaks.mesh.visible = false; W.trail.mesh.visible = false; W.vec.update({ mode: '' }, air, false); }
    if (P) P.model.root.visible = v; for (const r of rivals) r.model.root.visible = false; for (const c of W.cyl) c.dispose(); W.cyl = []; $('phudwrap').hidden = !v; }

  // ---------- запуск ----------
  let briefHtml = null, briefT = 0;
  function brief() { const b = $('brief'), p = b.querySelector('p'); if (briefHtml === null) briefHtml = p.innerHTML; drawRose($('briefc'), G.wind.p.dir);
    p.innerHTML = 'Днём бриз с озера и прогретый воздух идут <b>вверх по склонам</b> — у южных склонов держит динамика, над отрогами рвутся термики. К вечеру и ночью холодный воздух <b>стекает с гор</b> к озеру — у склонов спуск. <b>Санташ</b> (с востока) и <b>Улан</b> (с запада) забивают местные ветры, за гребнями — ротор и болтанка.'; b.hidden = false; briefT = 9; }
  function begin() { build(); loadLandcover(); /* лес под ельниками -- по маске OSM */ if (!on) prevPlayer = G.player; on = true; for (const k in G.marks || {}) G.marks[k].visible = false;
    if (prevPlayer && prevPlayer.model) prevPlayer.model.root.visible = false; if (prevPlayer && prevPlayer.wake) prevPlayer.wake.mesh.visible = false;
    show(true); G.player = P; G.race = null; G.race2 = null; G.rv = null; R = null; F = null; lift.length = 0; air.list.length = 0; W.trail.reset(); BR.run = 0; BR.total = 0; BR.mult = 1; air.setSky(G.preset); G.clockK = 0.12;
    if (G.clock === undefined || G.clock < 10.5 || G.clock > 16.5) G.clock = 12; // летают днём: термики в силе
    document.body.classList.add('para'); document.body.classList.toggle('feel', !inst); document.body.classList.remove('motor'); $('ts').textContent = 'аксель'; $('mark').hidden = true; $('brief').hidden = true;
    G.mode = 'para'; ctInit = false; A.showGame(true); A.resetView(); G.cam = G.cam === 1 ? 0 : G.cam; G.modeT = 0; hold.L = hold.R = hold.B = hold.F = 0; }
  const sunK = () => (G.wx ? G.wx.sun : 1) * smooth(0.05, 0.45, SUN.y);
  function upwind() { return Math.atan2(-G.wind.sx, -G.wind.sy); } // курс против ветра
  function winchAt(X, Y) { let a = upwind(); for (let k = 0; k < 8; k++) { const t = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35, x = X + Math.sin(t) * 1000, y = Y + Math.cos(t) * 1000; if (G.h(x, y) > 2) { a = t; break; } }
    return { X: X + Math.sin(a) * 1000, Y: Y + Math.cos(a) * 1000, th: a }; }
  // склон для старта с разбега над аэродромом: крутизна 20-45%, вниз -- к озеру и по возможности против ветра
  function findHill(site = SITES.airport) { let best = null; const up = upwind(), wide = site !== SITES.airport;
    for (let r = site.r0; r <= site.r1; r += wide ? 40 : 150) for (let a = wide ? -3.14 : -1.4; a <= (wide ? 3.14 : 1.4); a += 0.1) { const X = site.X + Math.sin(a) * r, Y = site.Y + Math.cos(a) * r, e = 40;
      const gx = (G.h(X + e, Y) - G.h(X - e, Y)) / (2 * e), gy = (G.h(X, Y + e) - G.h(X, Y - e)) / (2 * e), sl = Math.hypot(gx, gy); if (sl < 0.2 || sl > 0.6 || G.h(X, Y) < 60) continue;
      const down = Math.atan2(-gx, -gy), ahead = G.h(X, Y) - G.h(X + Math.sin(down) * 80, Y + Math.cos(down) * 80), far = G.h(X, Y) - Math.max(G.h(X + Math.sin(down) * 500, Y + Math.cos(down) * 500), G.h(X + Math.sin(down) * 300, Y + Math.cos(down) * 300) + 25); const behind = G.h(X - Math.sin(down) * 300, Y - Math.cos(down) * 300) - G.h(X, Y); if (ahead < 12 || far < 90 || behind < 60) continue; // середина склона: выше ещё есть гора -- там держит динамика
      const sc = r / (wide ? 300 : 1000) + Math.abs(wrapPi(down - up)) * 1.2 + Math.abs(wrapPi(down - Math.PI)) * 0.5; if (!best || sc < best.sc) best = { sc, X, Y, grad: [gx, gy] }; }
    return best || (wide ? findHill(SITES.airport) : { X: AIRPORT.X, Y: AIRPORT.Y + 2500, grad: [0, 0.2] }); }
  function startFree(at) { begin(); const g = P.g; F = { t: 0, gain: 0, ridgeT: 0, colT: 0, landT: 0, how: '', maxZ: 0, z0: 0, res: null, again: at };
    let X = AIRPORT.X, Y = AIRPORT.Y, how = 'winch';
    const site = SITES[store.get('paraSite')] || SITES.airport; F.site = site;
    if (!at && store.get('paraSite') === 'winch') { how = 'winch'; F.site = { name: 'буксир на полосе аэродрома' }; } // лебёдка тянет с полосы
    else if (!at) { const h = findHill(site); X = h.X; Y = h.Y; how = 'foot'; F.grad = h.grad; }
    else { X = at.X; Y = at.Y; const e = 60, gx = (G.h(X + e, Y) - G.h(X - e, Y)) / (2 * e), gy = (G.h(X, Y + e) - G.h(X, Y - e)) / (2 * e); how = !at.land ? 'airdrop' : Math.hypot(gx, gy) > 0.16 ? 'foot' : 'winch'; F.grad = [gx, gy]; }
    F.how = how; const gz = Math.max(0, G.h(X, Y));
    if (how === 'winch') { const w = winchAt(X, Y); g.reset(X, Y, gz, w.th, 'tow'); g.startTow({ X: w.X, Y: w.Y, Z: Math.max(0, G.h(w.X, w.Y)), max: 420 }); W.winch.visible = true; W.winch.position.set(w.X, Math.max(0, G.h(w.X, w.Y)), -w.Y); W.winch.rotation.y = -w.th; toast(`Лебёдка: ${at ? at.label : AIRPORT.name}. Держите крыло по тросу`); }
    else if (how === 'airdrop') { const z = 500 + Math.random() * 1500; g.reset(X, Y, z, upwind() + Math.PI, 'air'); W.winch.visible = false; toast(`Над озером, ${Math.round(z)} м над водой — до берега дотянете?`); } // над озером -- сразу в воздухе
    else if (how === 'boat') { const th = upwind(); g.reset(X, Y, 0.5, th, 'tow'); g.startTow({ X: X + Math.sin(th) * 160, Y: Y + Math.cos(th) * 160, Z: 0, vx: Math.sin(th) * 9, vy: Math.cos(th) * 9, max: 300 }); W.winch.visible = false; W.boat.root.visible = true; toast('Буксировка за катером. Держите крыло по тросу'); }
    else { const [gx, gy] = F.grad, down = Math.atan2(-gx, -gy), into = upwind(), th = Math.abs(wrapPi(into - down)) < 0.6 ? into : down; g.reset(X, Y, gz, th, 'launch'); g.startLaunch(); W.winch.visible = false; toast(`Старт: ${F.site.name}, ${Math.round(gz + 1601)} м`); }
    F.z0 = g.Z; P.leg = 0; P.time = 0;
    // в небе ещё трое местных: они кружат в термиках -- по ним видно, где подъём
    const focus = [{ X, Y }]; air.seed(focus, sunK()); rivals.forEach((e, i) => { if (i > 2) { e.model.root.visible = false; e.active = false; return; } placeAI(e, X + (i - 1) * 900, Y + 1200 + i * 400, 450 + i * 120); e.free = true; e.active = true; });
    G.camYaw = g.th; coachStart();
    // мультфильм-инструктаж перед каждым свободным полётом; мир стоит, пока он идёт
    G.freeze = true; playToon({ audio, TOUCH, onDone: () => { G.freeze = false; input.left = input.right = input.bar = input.flare = input.ease = false; } }); }
  function placeAI(e, X, Y, agl) { const z = Math.max(0, G.h(X, Y)) + agl; e.g.reset(X, Y, z, Math.random() * 6.28, 'air'); e.mem = {}; e.leg = 0; e.time = 0; e.done = false; e.out = null; e.model.root.visible = true; e.wp = null; }
  function startRace() { begin(); coach = null; coachDraw(); const S = AIRPORT, g = P.g; R = mkTask(); R.t = -45; R.over = false; R.beep = 99;
    const z = Math.max(0, G.h(S.X, S.Y)) + 480; g.reset(S.X - 300, S.Y - 250, z, upwind(), 'air');
    rivals.forEach((e, i) => { placeAI(e, S.X + Math.cos(i * 1.6) * 500, S.Y + Math.sin(i * 1.6) * 500, 420 + i * 30); e.active = true; e.free = false; });
    R.all = [P, ...rivals]; for (const e of R.all) { e.leg = 0; e.time = 0; e.inS = true; e.out = null; e.done = false; }
    air.seed([S, ...R.tps, R.goal], sunK());
    const top = air.sky.base + 250; W.cyl = [makeCylinder(scene, S.X, S.Y, R.rS, -50, top, 0xffffff), ...R.tps.map((t) => makeCylinder(scene, t.X, t.Y, t.R, -50, top, 0xff8a2a)), makeCylinder(scene, R.goal.X, R.goal.Y, R.goal.R, -50, top, 0x58d68d)];
    W.winch.visible = false; G.camYaw = g.th; R.T0 = G.t;
    brief(); toast(`Маршрут ${km(R.len)}: ${R.tps.map((t) => t.name).join(' → ')} → пляж. Окно старта через 45 с`); flash('Гонка по маршруту'); }
  function mkTask() { const S = AIRPORT, goal = { ...field, R: 300, name: 'цель' }; let best = null;
    // один-два пункта; длина «по цилиндрам» около 5.5 км -- гонка минут на 8-12
    for (let k = 0; k < 80; k++) { const n = Math.random() < 0.45 ? 2 : 1, pick = []; while (pick.length < n) { const t = TPS[Math.floor(Math.random() * TPS.length)]; if (!pick.includes(t)) pick.push(t); }
      let len = 0, x = S.X, y = S.Y; for (const t of pick) { len += Math.hypot(t[1] - x, t[2] - y); x = t[1]; y = t[2]; } len += Math.hypot(goal.X - x, goal.Y - y);
      const eff = len - 1200 - n * 800 - 300, sc = Math.abs(eff - 5500) + Math.random() * 400; if (!best || sc < best.sc) best = { sc, len, eff, tps: pick }; }
    const tps = best.tps.map((t) => ({ name: t[0], X: t[1], Y: t[2], R: 400 })); return { S, rS: 1200, tps, goal, len: best.eff }; }
  function stop() { if (!on) return; on = false; G.freeze = false; const tn = document.getElementById('toon'); if (tn) tn.remove(); coach = null; if ($('p_coach')) $('p_coach').hidden = true; if (briefHtml !== null) { $('brief').querySelector('p').innerHTML = briefHtml; } $('brief').hidden = true; show(false); for (const r of rivals) r.model.root.visible = false; document.body.classList.remove('para', 'feel'); $('mark').hidden = true; G.clockK = 1; audio.vario(0, false); audio.airflow(0, 0, 0, false); audio.winch(false); $('ts').textContent = 'шкот'; R = null; F = null; }

  // ---------- управление игрока ----------
  // Держите клеванту дольше -- тянете глубже: короткое нажатие -- поправка курса, удержание -- вираж около 30°,
  // долгое -- круче. Двойное нажатие -- в пол (спираль). Обе сразу -- торможение, у земли -- подрыв.
  function playerCtl(dt) { const l = input.left, r = input.right, f = input.flare, b = input.bar;
    if (l && !hold.pl) { hold.dL = G.t - hold.lastL < 0.33; hold.lastL = G.t; } if (r && !hold.pr) { hold.dR = G.t - hold.lastR < 0.33; hold.lastR = G.t; } hold.pl = l; hold.pr = r;
    hold.L = l ? hold.L + dt : 0; hold.R = r ? hold.R + dt : 0;
    const lvl = (t, deep) => (t <= 0 ? 0 : deep ? clamp(0.35 + t * 0.7, 0, 1) : 0.58 * (1 - Math.exp(-t / 0.28)) + 0.17 * smooth(3, 8, t));
    let tL = lvl(hold.L, hold.dL), tR = lvl(hold.R, hold.dR);
    const both = f || (l && r); if (both) { hold.F += dt; const v = clamp(0.3 + hold.F * 1.5, 0, 1); tL = Math.max(f ? tL : 0, v); tR = Math.max(f ? tR : 0, v); } else hold.F = 0;
    hold.B = b ? hold.B + dt : 0; return { tL, tR, tBar: b ? clamp(0.2 + hold.B * 1.1, 0, 1) : 0, go: b || both, release: b }; }

  // ---------- кадр ----------
  let acc = 0;
  function tick(dt) { if (BR.slow > 0) { BR.slow -= dt; dt *= 0.35; } const g = P.g, sk = sunK(); air.sun = sk; // замедление на гребне
    const act = [P, ...rivals.filter((e) => e.active)], focus = act.map((e) => e.g);
    air.update(dt, focus, sk); const ctl = playerCtl(dt);
    acc += dt; let n = 0; while (acc >= 1 / 60 && n++ < 6) { acc -= 1 / 60;
      g.step(1 / 60, ctl, air);
      for (const e of act) { if (e === P) continue; const c = aiCtl(e, 1 / 60, focus); e.g.step(1 / 60, c, air); } }
    if (n >= 6) acc = 0;
    // сближение в воздухе: расходимся
    for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) { const a = act[i].g, b = act[j].g; if (a.mode !== 'air' || b.mode !== 'air') continue; const dx = b.X - a.X, dy = b.Y - a.Y, dz = b.Z - a.Z, d = Math.hypot(dx, dy, dz * 2);
      if (d < 18 && d > 0.1) { const k = (18 - d) / d * 0.5 * dt * 2; a.X -= dx * k; a.Y -= dy * k; b.X += dx * k; b.Y += dy * k; if (i === 0 && d < 10 && (G.t - (P.near || 0)) > 3) { P.near = G.t; toast(`Близко к ${act[j].name}!`); } } }
    G.modeT = (G.modeT || 0) + dt; g.base = g.Z; g.y = g.Z; g.aws = g.V; g.awa = 0; g.tws = 0;
    events(P); for (const e of rivals) e.g.events.length = 0;
    braveStep(g, dt); if (R) race(dt); else if (F) { freeStep(dt); coachStep(dt); }
    // модели
    for (const e of act) e.model.update(e.g, dt, G.t, e === P || Math.hypot(e.g.X - camera.position.x, e.g.Z - camera.position.y, -e.g.Y - camera.position.z) < 350);
    W.clouds.update(air, G.t); W.birds.update(air, G.t); // порывы: ветер резко сильнее среднего -- крыло вздрагивает, камеру качает, шорох, по воздуху проносятся полосы
    { const U = g.air && g.air.U || 0; uAvg += (U - uAvg) * Math.min(1, dt * 0.35); const k = clamp((U - uAvg - 0.6) / 2.2, 0, 1) + clamp(g.turb - 0.5, 0, 1) * 0.5; const was = gust; gust += (k - gust) * Math.min(1, dt * 4); g.gustFx = gust; uPrev = U;
      if (gust > 0.45 && was <= 0.45 && G.t - gustHit > 1.5 && g.mode === 'air') { gustHit = G.t; G.shake = Math.max(G.shake, 0.35 + gust * 0.5); audio.gust && audio.gust(0.5 + gust); g.pv -= 0.3 * gust; g.pr += (Math.random() - 0.5) * 0.8 * gust; } }
    const stormy = G.wx ? G.wx.storm : 0; W.streaks.update(air, g, dt, helpOn, { storm: stormy, night: G.night ? 1 : 0, gustBurst: G.t - gustHit < 0.4 });
    W.dust.update(air, g, dt, false); W.trail.update(g, dt, helpOn && inst); W.vec.update(g, air, helpOn && inst);
    if (helpOn && G.frame % 15 === 0) near = nearLift(g); { const a = air.windAt(AIRPORT.X, AIRPORT.Y, Math.max(0, G.h(AIRPORT.X, AIRPORT.Y)) + 6, {}), f = air.windAt(field.X, field.Y, Math.max(0, G.h(field.X, field.Y)) + 6, {}); W.sockA.update(a.wx, a.wy, G.t); W.sockF.update(f.wx, f.wy, G.t); }
    // тень пилота и крыла на земле -- по солнцу: по ней видно высоту на заходе
    { const s = W.shadow, k = SUN.y > 0.12 ? g.agl / SUN.y : 0, sx = g.X - SUN.x * k, sy = g.Y + SUN.z * k, gz = Math.max(0, G.h(sx, sy)); s.position.set(sx, gz + 0.25, -sy); s.scale.setScalar(9 + g.agl * 0.02); s.material.opacity = (1 - smooth(60, 420, g.agl)) * (SUN.y > 0.12 ? 1 : 0); s.visible = s.material.opacity > 0.01; }
    // трос
    const T = g.tow; if (g.mode === 'tow' && T) { C3.set(T.X, T.Z + (T.vx ? 1.2 : 2.3), -T.Y); const pp = new THREE.Vector3(g.X, g.Z + 0.6, -g.Y); W.tow.line.visible = true; W.tow.set(C3, pp);
      if (T.vx) { W.boat.root.position.set(T.X, 0.05, -T.Y); W.boat.root.rotation.set(0, -Math.atan2(T.vx, T.vy), 0); } } else W.tow.line.visible = false;
    if (T && T.vx && T.done) { T.X += T.vx * dt * 0.6; T.Y += T.vy * dt * 0.6; W.boat.root.position.set(T.X, 0.05, -T.Y); }
    if (W.cyl.length && R) { const idx = R.all ? P.leg : 0; W.cyl.forEach((c, i) => { const cur = i === Math.min(idx, W.cyl.length - 1) && !P.time, past = i < idx; c.set(past ? 0x58d68d : cur ? 0xff8a2a : 0xffffff, past ? 0.12 : cur ? 0.55 + 0.15 * Math.sin(G.t * 3) : 0.22, G.t); }); }
    // ассистент термиков
    // ассистент термиков: точки в системе воздушной массы (поток дрейфует с ветром -- и точки с ним)
    air.windAt(g.X, g.Y, g.Z, Q0); P.ax = (P.ax || 0) + Q0.wx * 0.8 * dt; P.ay = (P.ay || 0) + Q0.wy * 0.8 * dt;
    if (g.mode === 'air' && (G.frame % 6 === 0)) { lift.push(g.X - P.ax, g.Y - P.ay, g.vario); if (lift.length > 3 * 90) lift.splice(0, 3); }
    // облако вокруг
    $('p_cloud').style.opacity = String(Math.min(0.92, g.inCloud * 0.95));
    G.spray.update(dt);
  }
  function aiCtl(e, dt, focus) { const g = e.g;
    if (e.free) { if (!e.wp || Math.hypot(e.wp.X - g.X, e.wp.Y - g.Y) < 500 || G.t - e.wpT > 240) { const t = TPS[Math.floor(Math.random() * TPS.length)]; e.wp = { X: t[1], Y: t[2], R: 300 }; e.wpT = G.t; }
      // сели или улетели далеко от игрока -- тихо возвращаем в небо (не на глазах)
      const far = Math.hypot(g.X - P.g.X, g.Y - P.g.Y) > 3500; if ((g.mode === 'landed' && (g.landed.t > 20 || far)) || (far && Math.hypot(g.X - P.g.X, g.Y - P.g.Y) > 7000)) { const a = Math.random() * 6.28; placeAI(e, P.g.X + Math.cos(a) * 2200, P.g.Y + Math.sin(a) * 2200, 500 + Math.random() * 400); }
      if (g.agl < 120 && g.vario < 0.3) return aiLand(g, air, field.X, field.Y);
      return aiPilot(g, air, e.wp, e.mem, dt, e.skill, focus); }
    if (!R) return {}; if (e.time || e.out) return aiLand(g, air, R.goal.X, R.goal.Y);
    const t = R.t < 0 ? { X: R.S.X, Y: R.S.Y, R: 600, pre: true } : e.leg === 0 ? R.tps[0] : e.leg <= R.tps.length ? R.tps[e.leg - 1] : R.goal;
    if (R.t < 0 && Math.hypot(g.X - R.S.X, g.Y - R.S.Y) > R.rS * 0.9) { e.mem.climb = false; return aiPilot(g, air, { X: R.S.X, Y: R.S.Y, R: 0 }, e.mem, dt, e.skill, focus); }
    return aiPilot(g, air, t, e.mem, dt, e.skill, focus); }

  // ближайший хороший поток на нашей высоте (для радара и подсказки): термики и динамика у склонов
  function nearLift(g) { const C = { x: 0, y: 0, R: 0 }, S = {}, out = []; if (g.mode !== 'air') return null;
    for (const o of air.list) { if (air.env(o) < 0.35 || air.top(o) < g.Z + 40) continue; air.center(o, g.Z, C); const d = Math.hypot(C.x - g.X, C.y - g.Y); if (d > 1600) continue; air.sample(C.x, C.y, g.Z, S); const net = S.w - 1.2; if (net > 0.3) out.push({ X: C.x, Y: C.y, d, net, R: C.R }); }
    // динамика: пробуем точки вокруг по кругу
    for (let a = 0; a < 6.28; a += 0.52) for (const r of [200, 450]) { const x = g.X + Math.sin(a) * r, y = g.Y + Math.cos(a) * r; air.sample(x, y, g.Z, S); if ((S.ridge || 0) > 1.4 && S.w - 1.2 > 0.3) out.push({ X: x, Y: y, d: r, net: S.w - 1.2, R: 80, ridge: true }); }
    out.sort((a, b) => a.d / (0.5 + a.net) - b.d / (0.5 + b.net)); return { list: out, best: out[0] || null }; }
  // ---------- события игрока ----------
  function events(e) { const g = e.g;
    for (const ev of g.events) { const t = ev.type;
      if (t === 'collapse') { audio.pop(0.6 + ev.f); G.shake = Math.max(G.shake, 0.5 + ev.f); F && (F.colT = G.t); e.colOk = true; toast(`Подсложение ${ev.side < 0 ? 'слева' : 'справа'}!`); }
      else if (t === 'frontal') { audio.pop(1.2); G.shake = Math.max(G.shake, 1); e.colOk = false; toast(ev.surge ? 'Клевок — фронтальное!' : 'Фронтальное подсложение!'); }
      else if (t === 'reopen') { audio.rustle(0.8); if (e.colOk && !ev.front) ach('p_collapse'); }
      else if (t === 'spin') { e.colOk = false; audio.pop(0.8); G.shake = Math.max(G.shake, 0.8); toast('Штопор! Отпустите клеванты'); }
      else if (t === 'spinExit') { audio.rustle(1); toast('Вышли из штопора'); }
      else if (t === 'stall') { audio.rustle(1.2); G.shake = Math.max(G.shake, 0.9); toast('Сваливание!'); }
      else if (t === 'stallExit') { toast('Крыло наполнилось — гасите клевок'); }
      else if (t === 'spiral') { toast('Спираль!'); e.spiralT = G.t; }
      else if (t === 'spiralExit') { e.spOk = G.t; }
      else if (t === 'release') { audio.thump(0.4); toast(ev.why === 'weaklink' ? 'Лок-аут: слабое звено лопнуло!' : `Отцепка на ${Math.round(ev.agl)} м`); if (ev.agl > 350) ach('p_tow'); audio.winch(false); }
      else if (t === 'inflate') audio.rustle(1);
      else if (t === 'wingDown') { audio.rustle(0.7); toast(`Крыло завалилось. ${TOUCH ? '«аксель»' : 'Пробел'} — ещё раз`); }
      else if (t === 'takeoff') { audio.rustle(0.6); audio.gust && audio.gust(1.1); flash('Взлёт!'); ach('p_foot'); lift0 = 1; BR.slow = 0.7; } // момент отрыва: короткое замедление, порыв в ушах, камера отъезжает
      else if (t === 'touch') landed(e, ev); }
    if (e.spOk && G.t - e.spOk > 2.5) { if (!g.front) ach('p_spiral'); e.spOk = 0; }
    g.events.length = 0; }
  function landed(e, ev) { const g = e.g, d = Math.hypot(g.X - field.X, g.Y - field.Y);
    if (ev.water) { audio.splash(1); for (let i = 0; i < 120; i++) G.spray.emit(g.X, 0.2, -g.Y, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 2, 1); A.lens(16); }
    else { audio.thump(clamp(ev.vz / 3, 0.3, 1.2)); G.shake = Math.max(G.shake, clamp(ev.vz / 4, 0.2, 1.3)); }
    const ok = !ev.water && ev.q !== 'slam'; if (ok && g.airT > 20) ach('p_first'); if (ok && ev.vz < 1) ach('p_soft'); if (ok && d < 5 && ev.q !== 'hard') ach('p_target');
    const head = { soft: 'Мягкая посадка', ok: 'Посадка', hard: 'Жёсткая посадка', water: 'Приводнение!', slam: 'Удар о склон' }[ev.q];
    flash(head); const res = { head, d, q: ev.q, vz: ev.vz, gs: ev.gs, t: g.airT, maxZ: g.maxZ, dist: Math.hypot(g.X - g.X0, g.Y - g.Y0), path: g.dist };
    if (ev.water) toast('Спасатели уже плывут'); else if (ev.q === 'slam') toast('Склон оказался ближе, чем казалось'); else if (d < 30) toast(`В ${d.toFixed(1)} м от креста!`);
    if (F) { F.res = res; setTimeout(() => { if (on && F && F.res === res) showFree(res); }, 1800); }
    if (R) { if (!e.time) e.out = remaining(e); R.land = res; setTimeout(() => { if (on && R) showRace(); }, 1800); } }
  function flash(t) { const el = $('p_flash'); if (!el) return; el.textContent = t; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
  const fmt = A.fmt;
  function showFree(r) { $('rh').textContent = r.head; $('rs').textContent = `${F.how === 'winch' ? 'Лебёдка' : F.how === 'boat' ? 'Буксировка за катером' : 'Старт с ног'} · ${air.sky.name}`;
    const rows = [['Полёт', fmt(r.t)], ['Высота максимум', `${Math.round(r.maxZ + 1601).toLocaleString('ru-RU')} м`], ['Набрано в потоках', `${Math.round(F.gain)} м`], ['От старта', km(r.dist)], ['Путь', km(r.path)], ['Касание', `${r.vz.toFixed(1)} м/с вниз · ${(r.gs * 3.6).toFixed(0)} км/ч`], ['До креста', r.d < 2000 ? `${r.d.toFixed(r.d < 20 ? 1 : 0)} м` : '—']];
    $('rt').innerHTML = rows.map((x) => `<tr><td></td><td>${x[0]}</td><td>${x[1]}</td></tr>`).join(''); $('result').hidden = false; }
  // ---------- гонка ----------
  function remaining(e) { const g = e.g; if (e.time) return 0; const legs = [R.S, ...R.tps, R.goal]; let i = Math.max(1, e.leg), d = Math.max(0, Math.hypot(legs[i].X - g.X, legs[i].Y - g.Y) - (legs[i].R || 0));
    for (let k = i; k < legs.length - 1; k++) d += Math.max(0, Math.hypot(legs[k + 1].X - legs[k].X, legs[k + 1].Y - legs[k].Y) - (legs[k + 1].R || 0)); return d; }
  const prog = (e) => (e.time ? 1e7 - e.time : -remaining(e) - (e.out !== null && e.out !== undefined ? 0.5 : 0));
  function race(dt) { const was = R.t; R.t += dt;
    if (R.t < 0) { const s = Math.ceil(-R.t); if (s !== R.beep && s <= 5) { R.beep = s; audio.beep(false); } }
    else if (was < 0) { audio.horn(); flash('Окно старта открыто!'); toast('Выходите из белого цилиндра — к первому пункту'); }
    for (const e of R.all) { const g = e.g; if (!e.time && g.mode === 'landed' && (e.out === null || e.out === undefined)) e.out = remaining(e); if (e.time || g.mode === 'landed') continue; const dS = Math.hypot(g.X - R.S.X, g.Y - R.S.Y);
      if (e.leg === 0) { if (R.t >= 0 && dS < R.rS) e.inS = true; if (R.t >= 0 && e.inS && dS > R.rS) { e.leg = 1; e.tStart = R.t; if (e === P) { audio.chime(); flash('Старт взят'); } } if (R.t >= 0 && dS > R.rS) e.inS = false; continue; }
      const tg = e.leg <= R.tps.length ? R.tps[e.leg - 1] : R.goal;
      if (Math.hypot(g.X - tg.X, g.Y - tg.Y) < tg.R) { e.leg++; if (e.leg > R.tps.length + 1) { e.time = R.t; if (e === P) goal(); } else if (e === P) { audio.chime(); flash(`${tg.name} взят`); toast(`Пункт ${e.leg - 1} из ${R.tps.length}. Дальше — ${e.leg <= R.tps.length ? R.tps[e.leg - 1].name : 'цель у пляжа'}`); } } }
    if (R.show && G.frame % 30 === 0) showRace(); }
  function goal() { audio.horn(); const place = R.all.filter((e) => e.time).length; flash(place === 1 ? 'ГОЛ! Первое место!' : `ГОЛ! ${place}-е место`); ach('p_goal'); if (place === 1) ach('p_win');
    const key = 'best.para', best = store.get(key); if (!best || P.time < best) { store.set(key, P.time); R.rec = true; } R.best = best; toast(`Время ${fmt(P.time)} — теперь посадка на поле`); }
  function showRace() { R.show = true; const all = [...R.all].sort((a, b) => prog(b) - prog(a)), place = all.indexOf(P) + 1;
    $('rh').textContent = P.time ? (place === 1 ? 'Победа!' : `${place}-е место`) : `Не долетели · ${place}-е место`;
    $('rs').textContent = `Маршрут ${km(R.len)} · ${P.time ? `время ${fmt(P.time)}` : `до цели ${km(P.out || remaining(P))}`}${R.rec ? ' · личный рекорд' : R.best ? ` · рекорд ${fmt(R.best)}` : ''}${R.land ? ` · ${R.land.head.toLowerCase()}` : ''}`;
    $('rt').innerHTML = all.map((e, i) => `<tr class="${e === P ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.time ? fmt(e.time) : e.out !== null && e.out !== undefined ? `сел, ${km(e.out)} до цели` : e.leg ? `в воздухе, ${km(remaining(e))}` : 'не стартовал'}</td></tr>`).join(''); $('result').hidden = false; }

  // ---------- инструктор: первые полёты по шагам ----------
  const K = (d, t) => (TOUCH ? t : d);
  const STEPS = [
    { h: 'Взлёт с разбега', p: () => K('Нажмите <kbd>Пробел</kbd> — крыло поднимется над головой, пилот сам побежит вниз по склону и оторвётся от земли.', 'Нажмите кнопку <kbd>аксель</kbd> внизу экрана — крыло поднимется над головой, пилот сам побежит вниз по склону и оторвётся от земли.'), ok: (g) => g.mode === 'air' },
    { h: 'Отлетите от склона', p: () => 'Вы в воздухе! Пока летите прямо — склон рядом, поворачивать к нему опасно. Подождите несколько секунд, пока склон не уйдёт вниз.', ok: (g) => g.agl > 40 },
    { h: 'Повороты', p: () => K('Держите <kbd>←</kbd> — поворот влево, <kbd>→</kbd> — вправо. Чем дольше держите, тем круче вираж. Отпустили — летит прямо. Развернитесь на четверть круга.', 'Держите палец на левой половине экрана — поворот влево, на правой — вправо. Чем дольше держите, тем круче вираж. Отпустили — летит прямо. Развернитесь на четверть круга.'), ok: (g, c) => c.turn > 1.57 },
    { h: 'Как подняться выше', p: () => `Мотора нет: вне потоков крыло понемногу снижается. Тёплый воздух видно — вверх тянутся жёлто-зелёные полосы, у склона на ветер и под облаками. Попали в поток — края экрана теплеют, Дымок радуется: ${K('держите <kbd>←</kbd> или <kbd>→</kbd>', 'держите палец слева или справа')} и кружите на этом месте. Наберите 30 м.`, ok: () => (F.run || 0) > 30 },
    { h: 'Посадка', p: () => `Летите к метке «поле» — это поле с крестом на пляже. Перед землёй развернитесь против ветра (полосы воздуха летят навстречу), а в 2–3 метрах над землёй ${K('нажмите <kbd>↓</kbd>', 'коснитесь обеих половин экрана')} — крыло затормозит, и касание будет мягким.`, ok: (g) => g.mode === 'landed' },
  ];
  let coach = null;
  function coachStart() { coach = store.get('paraCoach') ? null : { i: 0, turn: 0, okT: 0 }; coachDraw(); }
  function coachDraw() { const el = $('p_coach'); if (!coach) { el.hidden = true; return; } el.hidden = false; const i = Math.min(coach.i, STEPS.length - 1), st = STEPS[i];
    el.className = 'panel' + (coach.okT > 0 ? ' ok' : '');
    el.innerHTML = coach.i >= STEPS.length ? '<div class="n">обучение пройдено</div><h3>Вы умеете летать!</h3><p>Дальше — термики под облаками, высота и гонка по маршруту. Подсказки по ходу полёта останутся внизу экрана.</p><div class="row"><span></span><button id="p_cx">закрыть</button></div>'
      : `<div class="n">шаг ${i + 1} из ${STEPS.length}</div><h3>${st.h}</h3><p>${st.p()}</p><div class="row"><span class="dots">${STEPS.map((_, k) => `<i class="${k < i ? 'ok' : k === i ? 'on' : ''}"></i>`).join('')}</span><button id="p_cx">${i === 3 ? 'пропустить шаг' : 'скрыть обучение'}</button></div>`;
    $('p_cx').onclick = (e) => { e.stopPropagation(); if (!coach) return; if (coach.i === 3) { coach.i++; coachDraw(); return; } store.set('paraCoach', 1); coach = null; coachDraw(); };
    $('p_cx').onpointerdown = (e) => e.stopPropagation(); }
  function coachStep(dt) { if (!coach) return; const g = P.g;
    if (coach.i >= STEPS.length) { coach.endT = (coach.endT || 0) + dt; if (coach.endT > 7) { coach = null; coachDraw(); } return; }
    if (g.mode === 'air') coach.turn += Math.abs(g.yawRate || 0) * dt;
    if (coach.okT > 0) { coach.okT -= dt; if (coach.okT <= 0) { coach.i++; if (coach.i >= STEPS.length) store.set('paraCoach', 1); coachDraw(); } return; }
    // посадка раньше времени (не нашли подъём) -- шаг про подъём не обязателен
    if (coach.i < 3 && g.mode === 'landed') { if (!coach.fail) { coach.fail = true; const el = $('p_coach'); el.className = 'panel'; el.innerHTML = `<div class="n">не страшно</div><h3>Сели раньше времени</h3><p>Так бывает: склон рядом. Нажмите ${K('<kbd>R</kbd>', '«ещё раз» в окне посадки')} — после взлёта летите прямо, пока под вами не станет 40 метров.</p>`; } return; }
    if (coach.i < 4 && g.mode === 'landed') coach.i = 4;
    if (STEPS[coach.i].ok(g, coach)) { coach.okT = 1.4; audio.chime(); coachDraw(); } }

  // ---------- смелость: полёт на бреющем у склона ----------
  // Каждый кадр меряем зазор до рельефа: под собой и по сторонам (лучи вбок и вперёд). Чем ближе и быстрее -- тем
  // больше очков; пока держишься у склона, растёт множитель (до ×5). Перескочил гребень на бреющем -- бонус и
  // замедление на полсекунды. Отошёл от рельефа на 2 с -- серия засчитывается; удар о склон -- серия сгорает.
  const BR = { run: 0, mult: 1, away: 0, best: store.get('paraBrave') || 0, total: 0, slow: 0, lastRidge: -9, flash: 0 };
  function clearance(g) { let c = g.agl; const fx = Math.sin(g.th), fy = Math.cos(g.th), rx = fy, ry = -fx;
    for (const [dx, dy] of [[rx, ry], [-rx, -ry], [fx, fy], [(fx + rx) * 0.7, (fy + ry) * 0.7], [(fx - rx) * 0.7, (fy - ry) * 0.7]]) for (const d of [8, 18, 32, 50]) { const gz = air.ground(g.X + dx * d, g.Y + dy * d); if (gz > g.Z - 3) { c = Math.min(c, d * 0.8); break; } c = Math.min(c, Math.hypot(d, g.Z - gz) * (g.Z - gz < 25 ? 1 : 9)); }
    return c; }
  function braveStep(g, dt) { const el = $('p_brave'); if (BR.flash > 0) BR.flash -= dt;
    if (g.mode !== 'air') { if (BR.run > 0) bank(g.mode === 'landed' && g.landed && g.landed.q === 'slam'); el.hidden = BR.total <= 0; return; }
    const c = clearance(g), near = c < 40 && g.agl > 1.5;
    if (near) { BR.away = 0; const k = (1 - c / 40) ** 1.5; BR.run += k * g.speed * dt * 2 * BR.mult; BR.mult = Math.min(5, BR.mult + k * dt * 0.25);
      // гребень под нами: по обе стороны ниже -- перевалили на бреющем
      const fx = Math.sin(g.th), fy = Math.cos(g.th), gz = air.ground(g.X, g.Y), b1 = air.ground(g.X - fx * 60, g.Y - fy * 60), b2 = air.ground(g.X + fx * 60, g.Y + fy * 60);
      if (g.agl < 30 && gz - b1 > 6 && gz - b2 > 6 && G.t - BR.lastRidge > 3) { BR.lastRidge = G.t; BR.run += 150 * BR.mult; BR.slow = 0.6; BR.flash = 1; flash('Гребень!'); audio.gust && audio.gust(1.2); } }
    else if (BR.run > 0) { BR.away += dt; if (BR.away > 2) bank(false); }
    if (BR.run > 0 || BR.total > 0) { el.hidden = false; const live = BR.run > 0; el.className = 'hud' + (live ? ' live' : '') + (BR.flash > 0 ? ' fl' : '');
      if (G.frame % 3 === 0) el.innerHTML = live ? `<b>+${Math.round(BR.run)}</b> <i>×${BR.mult.toFixed(1)}</i><small>смелость · всего ${Math.round(BR.total)}</small>` : `<b>${Math.round(BR.total)}</b><small>смелость · рекорд ${Math.round(Math.max(BR.best, BR.total))}</small>`;
      if (near && G.frame % 20 === 0) audio.tick && audio.tick(500 + BR.mult * 180, 0.03); } }
  function bank(lost) { if (lost) { toast(`Серия сгорела: −${Math.round(BR.run)}`); } else { BR.total += BR.run; toast(`+${Math.round(BR.run)} смелости`); if (P.model.happy) P.model.happy(); audio.chime(); if (BR.total > BR.best) { BR.best = BR.total; store.set('paraBrave', Math.round(BR.best)); } if (BR.run > 1000) ach('p_brave'); }
    BR.run = 0; BR.mult = 1; BR.away = 0; }
  // ---------- свободный полёт: журнал ----------
  function freeStep(dt) { const g = P.g; F.t += dt; if (g.mode !== 'air') return;
    if (g.vario > 0.3) F.run = (F.run || 0) + g.vz * dt; else if (g.vario < -0.6) F.run = Math.max(0, (F.run || 0) - dt * 3);
    if (g.vz > 0) F.gain += g.vz * dt * (g.vario > 0.2 ? 1 : 0); if ((F.run || 0) > 100) ach('p_thermal');
    if (g.Z > air.sky.base - 60) ach('p_base'); if (g.Z + 1601 > 4000) ach('p_4k'); if (Math.hypot(g.X - g.X0, g.Y - g.Y0) > 10000) ach('p_xc10'); if (g.airT > 900) ach('p_long');
    if ((g.air.ridge || 0) > 0.5 && g.agl < 450 && g.vario > -0.2) { F.ridgeT += dt; if (F.ridgeT > 120) ach('p_ridge'); } else F.ridgeT = Math.max(0, F.ridgeT - dt * 0.5); }

  // ---------- камера ----------
  // камера ведёт точку обзора и дистанцию плавно (пружиной), а взлёт -- событие: отъезд назад и вверх, шире обзор
  const CT = new THREE.Vector3(), CV = new THREE.Vector3(); let ctInit = false, camD = 15, lift0 = 0, ctTo = new THREE.Vector3();
  function cam(dt) { const g = P.g, root = P.model.root; if (lift0 > 0) lift0 = Math.max(0, lift0 - dt / 2.2);
    G.camYaw += wrapPi((g.mode === 'landed' ? G.camYaw + dt * 0.15 : g.th) - G.camYaw) * Math.min(1, dt * 1.5); const yaw = G.camYaw + G.orbit, fx = Math.sin(yaw), fz = -Math.cos(yaw);
    G.shake = Math.max(0, G.shake - dt * 1.6); const tq = (g.turb || 0) * 0.12 + gust * 0.2, sh = G.shake * G.shake, jx = (Math.random() - 0.5) * sh * 0.4 + Math.sin(G.t * 3.1) * Math.sin(G.t * 1.7) * tq, jy = (Math.random() - 0.5) * sh * 0.4 + Math.sin(G.t * 2.3 + 1) * tq * 0.7; // воздух живой: камеру покачивает болтанкой и порывами
    P.model.fp(G.cam === 1);
    if (G.cam === 1) { C3.set(0, 0.92, 0.2); root.localToWorld(C3); camera.position.copy(C3); camera.quaternion.copy(root.quaternion); camera.rotateY(-G.orbit); camera.rotateX(0.32 - G.orbitP * 0.8); camera.rotateZ(jx * 0.05); camera.fov = clamp(78 * G.zoom, 35, 100); }
    else { const top = G.cam === 2, d = (top ? 75 : 15 + g.V * 0.25) * G.zoom, el = clamp((top ? 0.55 : 0.14) + G.orbitP, -0.35, 1.45), ce = Math.cos(el), se = Math.sin(el);
      ctTo.set(g.X, g.Z + (g.mode === 'air' || g.mode === 'tow' ? 0.6 + 2.6 * smooth(0.2, 0.9, G.zoom) : 1.5), -g.Y); // вблизи камера смотрит на пилота, издали -- на всё крыло
      if (!ctInit || CT.distanceTo(ctTo) > 60) { CT.copy(ctTo); CV.set(0, 0, 0); ctInit = true; } // переключение места -- сразу
      else { const k = 9, z = 2 * Math.sqrt(k); CV.addScaledVector(ctTo.clone().sub(CT), k * dt).multiplyScalar(Math.max(0, 1 - z * dt)); CT.addScaledVector(CV, dt); CT.lerp(ctTo, Math.min(1, dt * 1.2)); } // критически задемпфированная пружина
      const pulse = Math.sin(Math.min(1, lift0) * Math.PI) * (lift0 > 0 ? 1 : 0); camD += (d * (1 + 0.35 * pulse) - camD) * Math.min(1, dt * 2.5);
      const tx = CT.x, ty = CT.y, tz = CT.z, dd = camD, el2 = el + 0.12 * pulse, ce2 = Math.cos(el2), se2 = Math.sin(el2);
      camera.position.set(tx - fx * dd * ce2 + jx, ty + dd * se2 + jy, tz - fz * dd * ce2); const gy = Math.max(0, G.h(camera.position.x, -camera.position.z)) + 2.5; if (camera.position.y < gy) camera.position.y = gy;
      camera.lookAt(tx, ty, tz); if (!top) camera.rotateZ(-(g.phi || 0) * (inst ? 0.22 : 0.38) * Math.cos(G.orbit) + jx * 0.04); camera.fov += ((top ? 50 : 60 + 9 * pulse) - camera.fov) * Math.min(1, dt * 3); }
    if (camera.view && camera.view.enabled) camera.clearViewOffset(); camera.updateProjectionMatrix(); }

  // ---------- приборы ----------
  const dial = () => $('dial'), setT = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  let hintKey = '', vAvg = 0;
  // настроение экрана: подъём -- тёплая дымка по краям, спуск -- холодная, штормовой порыв -- тёмная
  function moodFx(g, dt) { const el = $('p_mood'), up = g.mode === 'air' ? clamp((g.vario - 0.3) / 2, 0, 1) : 0, dn = g.mode === 'air' ? clamp((-g.vario - 1.8) / 2.5, 0, 1) : 0, st = (G.wx ? G.wx.storm : 0) * gust;
    const tgt = Math.max(up, dn, st); mood += (tgt - mood) * Math.min(1, dt * 1.5); if (G.frame % 4) return;
    const col = st > Math.max(up, dn) ? '20,26,40' : up > dn ? '255,214,140' : '90,120,180'; el.style.background = `radial-gradient(ellipse at center, rgba(${col},0) 52%, rgba(${col},${(0.55 * mood).toFixed(2)}) 100%)`; el.style.opacity = '1'; }
  // стрелка к полю (или к пункту гонки): над целью, а если вне кадра -- у края экрана
  function pointMark(g) { const mk = $('mark'); let tg = field, lab = 'поле'; if (R) { tg = P.time ? field : P.leg === 0 ? (R.t < 0 ? R.S : R.tps[0]) : P.leg <= R.tps.length ? R.tps[P.leg - 1] : R.goal; lab = tg.name || 'цель'; }
    if (!tg || g.mode === 'launch') { mk.hidden = true; return; } const w = window.innerWidth, hh = window.innerHeight; C3.set(tg.X, Math.max(0, G.h(tg.X, tg.Y)) + 30, -tg.Y).project(camera); const behind = C3.z > 1;
    let mx = (C3.x * 0.5 + 0.5) * w, my = (1 - (C3.y * 0.5 + 0.5)) * hh; if (behind) { mx = w - mx; my = hh * 0.5; mx = mx < w / 2 ? 0 : w; }
    const cx = clamp(mx, 74, w - 74), cy = clamp(my, 150, hh - 150), off = behind || cx !== mx || cy !== my; mk.hidden = false; mk.className = 'hud' + (off ? ' off' : ''); mk.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-100%)`;
    if (G.frame % 6 === 0) setT($('markd'), `${off && cx < w / 2 ? '◀ ' : ''}${lab} · ${km(Math.hypot(tg.X - g.X, tg.Y - g.Y))}${off && cx > w / 2 ? ' ▶' : ''}`); }
  function hud(dt) { const g = P.g, b = $('p_var'); moodFx(g, dt); if (!inst || R) pointMark(g); else $('mark').hidden = true; if (briefT > 0) { briefT -= dt; if (briefT <= 0 || (G.modeT > 3 && (input.left || input.right || input.bar))) { briefT = 0; $('brief').hidden = true; } } vAvg += (g.vario - vAvg) * Math.min(1, dt * 0.05);
    // вариометр: столбик от нуля, засечка -- среднее за круг
    { const v = clamp(g.vario, -5, 5), i = b.querySelector('i'), s = b.querySelector('s'); i.style.top = v >= 0 ? `${50 - v * 10}%` : '50%'; i.style.height = `${Math.abs(v) * 10}%`; i.style.background = v >= 0 ? '#58d68d' : v < -2.5 ? '#ff4b3e' : '#7fd0ff'; s.style.top = `${50 - clamp(vAvg, -5, 5) * 10}%`;
      if (G.frame % 4 === 0) { setT(b.querySelector('b'), `${g.vario >= 0 ? '+' : '−'}${Math.abs(g.vario).toFixed(1)}`); setT(b.querySelector('.avg'), g.mode === 'air' ? `за круг ${vAvg >= 0 ? '+' : '−'}${Math.abs(vAvg).toFixed(1)}` : ''); } }
    { const br = $('p_brk').querySelectorAll('i b'); br[0].style.height = `${g.L * 100}%`; br[2].style.height = `${g.R * 100}%`; br[1].style.height = `${g.bar * 100}%`; }
    if (G.frame % 3 === 0) { setT($('p_alt').querySelector('b'), Math.round(g.Z + 1601).toLocaleString('ru-RU')); setT($('p_agl'), g.ground < 0.5 && g.agl > 0 && air.h(g.X, g.Y) < 0 ? `над озером ${Math.round(g.agl)} м` : `над землёй ${Math.max(0, Math.round(g.agl))} м`);
      const ld = g.vz < -0.2 ? g.speed / -g.vz : 99; setT($('p_spd'), `${Math.round(g.speed * 3.6)} км/ч · качество ${ld > 30 ? '∞' : ld.toFixed(1)}`);
      const st = status(g); setT($('p_st'), st[0]); $('p_st').style.color = st[1]; }
    if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').style.opacity = 0; }
    if (G.frame % 2 === 0) drawDial(g);
    // гонка: время и следующий пункт
    $('race').hidden = !R; if (R && G.frame % 6 === 0) { const all = [...R.all].sort((a, b) => prog(b) - prog(a)), tg = P.leg === 0 ? R.S : P.leg <= R.tps.length ? R.tps[P.leg - 1] : R.goal, d = Math.max(0, Math.hypot(tg.X - g.X, tg.Y - g.Y) - (P.leg === 0 ? 0 : tg.R));
      setT($('rtime'), R.t < 0 ? `старт через ${Math.ceil(-R.t)} с` : A.fmt(P.time || R.t));
      setT($('rinfo'), P.time ? `цель взята · ${all.indexOf(P) + 1}/${all.length}` : P.leg === 0 ? (R.t < 0 ? 'наберите высоту у аэродрома' : 'выйдите из белого цилиндра') : `${tg.name === 'цель' ? 'цель' : tg.name} ${km(d)} · ${all.indexOf(P) + 1}/${all.length}`); }
    hint(g); }
  function status(g) { if (g.mode === 'tow') return [g.tow && g.tow.warn ? 'ЛОК-АУТ — выравнивайте!' : 'буксировка', g.tow && g.tow.warn ? '#ff8a7a' : '']; if (g.mode === 'launch') return [g.launchGo ? (g.wingUp < 1 ? 'подъём крыла' : 'разбег') : 'на старте', ''];
    if (g.mode === 'landed') return ['на земле', ''];
    if (g.spin) return ['ШТОПОР', '#ff4b3e']; if (g.stall) return ['СВАЛИВАНИЕ', '#ff4b3e']; if (g.front) return ['фронтальное', '#ff8a7a']; if (g.col) return [`подсложение ${g.colSide < 0 ? 'слева' : 'справа'} ${Math.round(g.col * 100)}%`, '#ff8a7a'];
    if (g.spiral) return [`спираль ${g.gforce.toFixed(1)} g`, '#ffd04a']; if (g.inCloud > 0.3) return ['в облаке!', '#ffd04a'];
    if (g.vario > 0.4) return [g.air.ridge > 0.6 ? 'динамика у склона' : 'в потоке', '#58d68d']; if (g.bar > 0.3) return [`акселератор ${Math.round(g.bar * 100)}%`, '#7fd0ff']; if (g.turb > 0.7) return ['болтанка', '#ffd04a']; return ['планирование', '']; }
  function hint(g) { let h = '', alert = false; const T = G.modeT || 0, key = TOUCH ? '«аксель»' : 'пробел', L = TOUCH ? 'левой половины' : '←';
    if (g.mode === 'launch') { if (!g.launchGo) h = TOUCH ? 'Кнопка «аксель» — поднять крыло и бежать' : 'Пробел — поднять крыло и бежать'; else if (g.wingUp < 1) { h = Math.abs(g.wingOff) > 0.35 ? `Крыло уходит ${g.wingOff > 0 ? 'вправо — правую клеванту' : 'влево — левую клеванту'}` : 'Держите крыло над головой'; alert = Math.abs(g.wingOff) > 0.6; } else h = 'Разбег! Вниз по склону'; }
    else if (g.mode === 'tow') { if (g.tow.warn) { h = `Лок-аут! Крыло уходит с линии троса — ${g.tow.dev > 0 ? (TOUCH ? 'касание слева' : '←') : (TOUCH ? 'касание справа' : '→')}`; alert = true; } else h = `Буксировка: держите курс по тросу · ${key} — отцепиться`; }
    else if (g.mode === 'landed') h = (F || (R && (P.time || P.out !== null))) ? '' : '';
    else if (g.spin) { h = 'Штопор — отпустите обе клеванты, крыло выйдет само'; alert = true; }
    else if (g.stall) { h = 'Сваливание — плавно отпустите клеванты'; alert = true; }
    else if (g.surge > 0 && g.pitch > 0.22) { h = 'Крыло уходит вперёд — коротко притормозите обеими'; alert = true; }
    else if (g.front) { h = `Фронтальное — ${g.bar > 0.1 ? 'отпустите акселератор!' : 'крыло откроется само'}`; alert = true; }
    else if (g.col) { const s = g.colSide < 0; h = `Подсложение ${s ? 'слева' : 'справа'}: держите курс ${s ? 'правой' : 'левой'}, подкачайте ${s ? 'левой' : 'правой'}`; alert = true; }
    else if (g.spiral) { h = `Спираль ${(-g.vz).toFixed(0)} м/с — отпустите клеванту, выход плавный`; alert = g.vz < -10; }
    else if (g.mode === 'air' && (bT = g.bS > 0.42 && g.agl > 12 && !g.spiral ? bT + 1 / 30 : 0) > 1.5) { h = `Клеванты затянуты — крыло теряет скорость. Отпустите ${TOUCH ? 'экран' : '← →'}`; alert = true; }
    else if (g.inCloud > 0.3) { h = 'Вы в облаке! Прямо и на акселераторе — прочь из-под базы'; alert = true; }
    else if (g.agl < 70 && g.vz < 0) h = g.agl < 6 ? (TOUCH ? 'Обе половины — подрыв!' : '↓ — подрыв!') : `Заход: против ветра, у самой земли — ${TOUCH ? 'обе половины экрана' : '↓ или ← →'} (подрыв)`;
    else if (R && R.t < 0) h = `Окно старта через ${Math.ceil(-R.t)} с — наберите высоту в потоке у аэродрома`;
    else if (g.ground <= 0.5 && air.h(g.X, g.Y) < 0 && g.agl < 300) { h = 'Под вами озеро — тяните к берегу'; alert = g.agl < 120; }
    else if (g.air && g.air.U > g.V + 0.5 && g.bar < 0.5) h = `Ветер сильнее крыла — держите ${key} (акселератор)`;
    else if (T < 14) h = TOUCH ? 'Держать слева/справа — клеванта (дольше — круче) · двойное касание — в пол · обе — тормоз · «аксель»' : '← → клеванты (дольше — круче, двойное — в пол) · ↓ обе · пробел — акселератор';
    else if (helpOn && g.mode === 'air' && g.vario > 0.4) h = `Вы в потоке +${g.vario.toFixed(1)}! Кружите здесь: держите ${TOUCH ? 'палец слева или справа' : '← или →'}`;
    else if (helpOn && near && near.best && g.agl > 40) { const b = near.best, a = wrapPi(Math.atan2(b.X - g.X, b.Y - g.Y) - g.th), side = Math.abs(a) < 0.35 ? 'прямо' : Math.abs(a) > 2.6 ? 'сзади' : a > 0 ? (Math.abs(a) < 1.2 ? 'впереди справа' : 'справа') : (Math.abs(a) < 1.2 ? 'впереди слева' : 'слева'); h = `${b.ridge ? 'Подъём у склона' : 'Тёплый поток'}: ${side}, ${km(b.d)}${inst ? ' — зелёная точка на компасе' : ''}`; }
    else if (vAvg < -1.2 && T > 30 && G.frame % 600 < 300) h = 'Ищите поток: под растущими облаками, над склонами к солнцу, где кружат птицы и пилоты';
    if (coach && !alert) h = '';
    if (h !== hintKey) { hintKey = h; const el = $('hint'); el.hidden = !h; el.textContent = h; el.className = 'hud' + (alert ? ' alert' : ''); } }
  // компас «курс вверх»: ветер, следующий пункт, ассистент термиков (где был подъём на последних кругах)
  function drawDial(g) { const cv = dial(), dc = cv.getContext('2d'), Wd = 352, c = Wd / 2, Rr = 142; dc.clearRect(0, 0, Wd, Wd);
    dc.fillStyle = 'rgba(5,20,45,.30)'; dc.beginPath(); dc.arc(c, c, Rr + 14, 0, 7); dc.fill(); dc.lineWidth = 3; dc.strokeStyle = 'rgba(255,255,255,.28)'; dc.beginPath(); dc.arc(c, c, Rr, 0, 7); dc.stroke();
    const rg = G.mmRange(true); G.mini.draw(dc, c, Rr, g.X, g.Y, g.th, rg); dc.fillStyle = 'rgba(255,255,255,.8)'; dc.font = '600 17px sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle'; dc.fillText(rangeTxt(rg), c, c + 112); // миникарта
    const th = g.th, pol = (a, r) => [c + Math.sin(a) * r, c - Math.cos(a) * r], S = Rr / rg; // точки потоков -- в масштабе миникарты
    for (let i = 0; i < lift.length; i += 3) { const dx = lift[i] - (g.X - (P.ax || 0)), dy = lift[i + 1] - (g.Y - (P.ay || 0)), v = lift[i + 2], a = Math.atan2(dx, dy) - th, d = Math.hypot(dx, dy) * S; if (d > Rr - 8) continue; const [x, y] = pol(a, d);
      const age = (lift.length - i) / lift.length; if (v > 0.2) { dc.fillStyle = `rgba(88,214,141,${(0.25 + 0.6 * (1 - age)).toFixed(2)})`; dc.beginPath(); dc.arc(x, y, 3 + Math.min(10, v * 3), 0, 7); dc.fill(); } else if (v < -1.5) { dc.fillStyle = 'rgba(255,90,70,.35)'; dc.fillRect(x - 2, y - 2, 4, 4); } }
    if (helpOn && near) for (const L of near.list) { const a = Math.atan2(L.X - g.X, L.Y - g.Y) - th, r = (Rr - 14) * Math.min(1, L.d / 1600) ** 0.6, [x, y] = pol(a, r); // радар потоков: дальнее прижато к краю
      dc.fillStyle = L === near.best ? 'rgba(88,214,141,.85)' : 'rgba(88,214,141,.4)'; dc.beginPath(); dc.arc(x, y, 6 + Math.min(12, L.net * 4), 0, 7); dc.fill(); if (L === near.best) { dc.strokeStyle = '#fff'; dc.lineWidth = 2; dc.stroke(); } }
    dc.fillStyle = 'rgba(255,255,255,.75)'; dc.font = '600 22px sans-serif'; dc.textAlign = 'center'; dc.textBaseline = 'middle';
    ['С', 'В', 'Ю', 'З'].forEach((s, i) => { const [x, y] = pol(i * Math.PI / 2 - th, Rr - 20); dc.fillText(s, x, y); });
    const Wn = air.windAt(g.X, g.Y, g.Z, Q0), wa = Math.atan2(-Wn.wx, -Wn.wy) - th; // откуда дует
    { const [x0, y0] = pol(wa, Rr + 12), [x1, y1] = pol(wa, Rr - 46); dc.strokeStyle = dc.fillStyle = '#fff'; dc.lineWidth = 8; dc.beginPath(); dc.moveTo(x0, y0); dc.lineTo(x1, y1); dc.stroke(); const [xa, ya] = pol(wa + 0.12, Rr - 26), [xb, yb] = pol(wa - 0.12, Rr - 26); dc.beginPath(); dc.moveTo(x1, y1); dc.lineTo(xa, ya); dc.lineTo(xb, yb); dc.closePath(); dc.fill(); }
    let tg = null; if (R) tg = P.time ? field : P.leg === 0 ? (R.t < 0 ? R.S : R.tps[0]) : P.leg <= R.tps.length ? R.tps[P.leg - 1] : R.goal; else tg = field;
    if (tg) { const a = Math.atan2(tg.X - g.X, tg.Y - g.Y) - th, [x, y] = pol(a, Rr); dc.fillStyle = '#ff8a2a'; dc.beginPath(); dc.arc(x, y, 13, 0, 7); dc.fill(); dc.strokeStyle = '#fff'; dc.lineWidth = 3; dc.stroke();
      const d = Math.max(0, Math.hypot(tg.X - g.X, tg.Y - g.Y) - (tg.R || 0)), need = d / Math.max(1, g.Z - Math.max(0, G.h(tg.X, tg.Y)) - 30), ld = g.vz < -0.2 ? g.speed / -g.vz : 30;
      dc.fillStyle = '#fff'; dc.font = '600 26px sans-serif'; dc.fillText(km(d), c, c + 52); dc.font = '600 18px sans-serif'; dc.fillStyle = need < 0 || need > 40 ? '#ff8a7a' : need < ld ? '#58d68d' : '#ffd04a'; dc.fillText(need < 0 || need > 40 ? 'не долететь' : `нужно ${need.toFixed(1)}`, c, c + 78); }
    // крыло в центре
    dc.strokeStyle = '#fff'; dc.lineWidth = 6; dc.lineCap = 'round'; dc.beginPath(); dc.arc(c, c + 34, 40, -Math.PI * 0.8, -Math.PI * 0.2); dc.stroke(); dc.lineWidth = 2; dc.beginPath(); dc.moveTo(c - 30, c + 10); dc.lineTo(c, c + 30); dc.lineTo(c + 30, c + 10); dc.stroke();
    if (G.frame % 10 === 0) { const hh = Math.floor(G.clock), mm = Math.floor((G.clock % 1) * 60), wd = ((Math.atan2(-Wn.wx, -Wn.wy) / DEG) + 360) % 360;
      setT($('windtxt'), `ветер ${DIRS[Math.round(wd / 22.5) % 16]} ${Math.round(Wn.U * 3.6)} км/ч · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`); } }

  function sound(dt) { const g = P.g; audio.vario(g.vario || 0, inst && (g.mode === 'air' || g.mode === 'tow')); audio.airflow(((g.mode === 'air' ? g.V : g.mode === 'tow' ? 9 : g.speed) || 0) + gust * 5, (g.turb || 0) + gust, (g.col + g.front) * 0.8 + (g.stall ? 0.5 : 0), true); audio.winch(g.mode === 'tow' && !(g.tow && g.tow.vx), g.tow ? Math.min(1, g.tow.t / 6) : 0); }

  return {
    get on() { return on; }, get player() { return P; }, get air() { return air; }, get race() { return R; }, get field() { return field; },
    startFree, startRace, stop, tick, camera: cam, hud, sound,
    toggleInst() { inst = !inst; store.set('paraInst', inst ? 1 : 0); document.body.classList.toggle('feel', !inst); toast(inst ? 'Приборы включены (I)' : 'Полёт на чувствах: приборы скрыты (I)'); },
    toggleHelp() { helpOn = !helpOn; store.set('paraHelp', helpOn ? 1 : 0); toast(helpOn ? 'Подсказки: воздух, след и радар потоков видны (H)' : 'Подсказки скрыты (H)'); },
    restart() { if (R) startRace(); else startFree(F && F.again); }, again() { $('result').hidden = true; if (R) startRace(); else startFree(F && F.again); },
    _rivals: () => rivals, _ctl: playerCtl, _W: () => W,
  };
}
void WING;
