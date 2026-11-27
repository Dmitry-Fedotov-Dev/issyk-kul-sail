// Мини-игра «Поиск»: поисково-спасательная операция в районе Хан-Тенгри (логика дела -- sar.js).
// Детектив: по плану маршрута, связи и уликам понять, где люди. Средства -- Ми-8 (быстро, но не выше ~5900 м и
// не ниже облаков), дрон (запускается с земли: с базы или из лагеря, куда его забросил вертолёт; видит тепловизором
// и ночью; батареи кончаются), пешие отряды (медленно, зато везде, и рискуют). Снимок (📷) -- обнаружение: всё, что
// попало в кадр, близко и не слишком высоко. Найден живым -- эвакуация лебёдкой или посадкой и на базу.
// Совместно: тот же код операции -- то же дело у всех; улики, находки и заметки на карте -- общие (net.js, server.js).
import * as THREE from 'three';
import { makeCase, newCode, seedOf, aliveAt, walkerPos, pod, scoreOf, ASL, gw, SCEN } from './sar.js';
import { NETHOOK } from './net.js';
import { playSarToon } from './sartoon.js';
import { START } from './astro.js';

const CSS = `
#sarw{position:fixed;inset:0;pointer-events:none;z-index:3}#sarw>*{pointer-events:auto}
#sclock{left:50%;top:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(8,22,48,.62);border-radius:12px;padding:4px 12px;font-size:14px;text-align:center;white-space:nowrap}#sclock b{font-size:17px}
#smini{position:fixed;left:max(10px,env(safe-area-inset-left,0px));top:160px;width:170px;height:170px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.4);cursor:pointer;touch-action:none}body.sardr #smini{top:auto;bottom:calc(220px + env(safe-area-inset-bottom,0px))}
#sbtns{position:fixed;right:calc(108px + env(safe-area-inset-right,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px}
body:not(.touchdev) #sbtns{right:16px;bottom:70px}
#sbtns button{min-width:48px;height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.32);background:rgba(10,30,60,.32);color:#fff;font:700 19px var(--ui);padding:0 6px;touch-action:none;line-height:1}
#sbtns button.on{background:rgba(255,138,42,.8)}#sbtns button.off{opacity:.55}#sbtns .qc{display:block;margin:0 auto}#sbtns button small{display:none;font-size:9px;font-weight:500;opacity:.9;margin-top:2px}body.slearn #sbtns button small,#sact small{display:block}#sact{font-size:13px!important}
#sshoot{left:50%;bottom:calc(76px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#ffd24a;color:#2a1800;border-radius:12px;padding:6px 14px;font:800 15px var(--ui);animation:sblink .7s steps(2) infinite;white-space:nowrap}@keyframes sblink{50%{opacity:.45}}
#sbtns button.pulse{background:#ffd24a;color:#2a1800;border-color:#fff;animation:sblink .7s steps(2) infinite}
@media (max-width:640px){#sshoot{bottom:auto;top:196px;font-size:13px}}
#sflash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s}
#sframe{position:fixed;inset:12% 10%;border:2px solid rgba(255,255,255,.55);border-radius:6px;pointer-events:none;box-shadow:0 0 0 2000px rgba(0,0,0,.12)}#sframe i{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px;border:2px solid rgba(255,255,255,.7);border-radius:50%}
body.sarrun #hscore,body.sardr #hhud,body.sardr #hscore,body.sardr #harr,body.sardr #hland,body.sardr #mark,body.sardr #hcr{display:none!important}
#sgim{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto}#sgim button{width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(10,30,60,.55);color:#fff;font:700 18px var(--ui);touch-action:none}#sgim span{font:700 12px var(--ui);color:#fff;text-shadow:0 1px 4px #000;text-align:center}
#sframe b{position:absolute;left:8px;top:6px;font:700 13px var(--ui);color:#fff;text-shadow:0 1px 4px #000}
.spanel{position:fixed;z-index:20;left:50%;top:50%;transform:translate(-50%,-50%);width:min(620px,94vw);max-height:92vh;overflow:auto;background:#0b1d3a;border:2px solid #ff8a2a;border-radius:18px;padding:14px 16px;color:#fff;font-size:14px;line-height:1.35}
.spanel h2{margin:0 0 4px;font-size:22px}.spanel h3{margin:12px 0 4px;font-size:13px;letter-spacing:.12em;color:#ffb07a;text-transform:uppercase}.spanel p{margin:4px 0}.spanel small{color:#b9c6dc}
.spanel .row{display:flex;gap:8px;flex-wrap:wrap}.spanel .ch{flex:1 1 0;min-width:90px;border-radius:12px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;padding:6px 8px;font:600 14px var(--ui);text-align:center}
.spanel .ch[aria-pressed=true]{border-color:#ff8a2a;background:rgba(255,138,42,.25)}.spanel .ch small{display:block;font-weight:400}
.spanel .go{display:block;width:100%;margin-top:12px;border:0;border-radius:14px;background:#ff8a2a;color:#1b0e00;font:800 18px var(--ui);padding:12px}
.spanel .plan{margin:2px 0;padding-left:18px}.spanel input{font:15px var(--ui);border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;padding:6px 8px;width:7.5em;text-transform:uppercase}
.spanel .x{position:sticky;top:0;float:right;border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:18px}
#smap{width:100%;aspect-ratio:1/1;border-radius:4px;touch-action:none;display:block;margin-top:6px;background:#efe6cc;box-shadow:0 0 0 3px #efe6cc,0 0 0 4px #1d1d1d}
#slog div{border-top:1px solid rgba(255,255,255,.1);padding:4px 0}#slog i{font-style:normal;color:#ffb07a}
#steams{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}#steams button{border-radius:10px;border:2px solid rgba(255,255,255,.35);background:rgba(60,140,255,.18);color:#fff;font:600 13px var(--ui);padding:4px 8px}#steams button.on{border-color:#6cf}
#snoteb{display:flex;gap:6px;margin-top:6px}#snoteb input{flex:1;width:auto;text-transform:none}
.sbad{color:#ff7a5a}.sok{color:#9fe0a0}
#smini.big{width:min(300px,60vmin);height:min(300px,60vmin)}
@media (max-height:440px) and (min-width:641px){#smini{top:96px;width:104px;height:104px}#smini.big{width:200px;height:200px}#sclock{font-size:12px;padding:2px 10px}#sclock b{font-size:14px}.sdet{display:none}#sbtns{gap:6px;bottom:calc(10px + env(safe-area-inset-bottom,0px))}#sbtns button{min-width:52px;height:42px;font-size:12px}#sbtns button small{font-size:9px}#sshoot{bottom:auto;top:60px;font-size:13px}}
@media (max-width:640px){.sdet{display:none}#smini{top:auto;bottom:calc(250px + env(safe-area-inset-bottom,0px));width:100px;height:100px}#smini.big{width:220px;height:220px}#sframe{inset:200px 8px 250px 8px}#sbtns{right:calc(100px + env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));gap:8px}#sbtns button{min-width:54px;height:46px;font-size:13px}#sclock{bottom:auto;top:150px;font-size:12px;padding:3px 10px;white-space:normal;width:max-content;max-width:calc(100vw - 24px)}#sclock b{font-size:14px}#sshoot{top:196px}}
/* HUD v2 (вертолёт): строка операции на телефоне -- по касанию полосы миссии; «СНИМАЙ» -- миганием кнопки 📷; кнопки -- компактный столбик */
#sbtns{right:calc(clamp(54px,15vw,62px) + 30px + env(safe-area-inset-right,0px))!important;bottom:calc(30px + env(safe-area-inset-bottom,0px))!important;gap:8px!important}
body:not(.touchdev) #sbtns{right:16px!important;bottom:70px!important}
#sclock{font-size:12px;padding:2px 10px;background:rgba(6,18,40,.5)}#sclock b{font-size:14px}
@media (max-height:440px) and (min-width:641px){#sbtns{flex-direction:row!important;bottom:calc(24px + env(safe-area-inset-bottom,0px))!important}} /* лёжа: ряд у нижнего края, а не столбик до радара */
@media (max-width:640px),(max-height:440px){body:not(.hdet) #sclock{display:none!important}#sshoot{display:none!important}#sbtns button{min-width:46px!important;height:46px!important}}
#sphotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}#sphotos .ph{margin:0;background:rgba(255,255,255,.06);border-radius:8px;overflow:hidden;cursor:pointer}#sphotos .ph.big{grid-column:1/-1}#sphotos img{display:block;width:100%;aspect-ratio:8/5;object-fit:cover}#sphotos figcaption{font-size:12px;line-height:1.3;padding:4px 6px}#sphotos figcaption i{color:#ffb07a;font-style:normal}#sphotos .nop{aspect-ratio:8/5;display:grid;place-items:center;color:#8fa3c4;font-size:12px}
#sbrief{padding-bottom:0}#sbrief .bh h2{margin:0}#sbrief .bh p{margin:2px 0 0;color:#cfe0ff;font-size:14px}#sbrief .bst{display:inline-block;padding:0 8px;border-radius:8px;background:rgba(255,138,42,.22);color:#ffd0a8;font-size:12px}
#sbrief .bwhat{margin:8px 0 0;font-size:15px}#sbrief .btask{font-size:15px;font-weight:600}#sbrief h3{margin:12px 0 3px}
#sbrief .bplan{margin:0;padding-left:20px}#sbrief .bplan li{margin:2px 0}#sbrief .bcond{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 10px;font-size:13px;color:#dbe5f7}
#sbrief .bnote{margin:4px 0 8px;font-size:12px;color:#b9c6dc}#sbrief .ch small{font-size:11px}
.bmat{margin:10px 0 4px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px}.bmat summary{cursor:pointer;color:#ffb07a;font-size:13px;font-weight:600;list-style:none}.bmat summary::before{content:'▸ '}.bmat[open] summary::before{content:'▾ '}
#sbrief .bgo{position:sticky;bottom:0;display:flex;gap:8px;align-items:stretch;margin:10px -16px 0;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));background:linear-gradient(rgba(11,29,58,0),#0b1d3a 14px)}
#sbrief .bgo .go{flex:1;margin:0}#sbrief .bgo .ch{flex:none;min-width:0;padding:0 12px}
@media (max-height:440px){#sbrief h3{margin:8px 0 2px}#sbrief .bplan li{margin:0}}
`;
const NIGHT = (hr) => hr < 6 || hr > 20.5;
// календарь игры: день 0 -- 23 июля 2026 (astro.js), G.day -- сколько дней прошло. Дело живёт в тех же датах
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'], WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dateOf = (day, wd = false) => { const d = new Date(START + Math.floor(day) * 86400000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${wd ? ', ' + WD[d.getUTCDay()] : ''}`; };
const hhmm = (h) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor(x % 1 * 60)).padStart(2, '0')}`; };
const QC = '<svg class="qc" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><circle cx="5" cy="5" r="3.2"/><circle cx="19" cy="5" r="3.2"/><circle cx="5" cy="19" r="3.2"/><circle cx="19" cy="19" r="3.2"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" fill="currentColor"/></svg>'; // квадрокоптер: X-рама, четыре винта
const CLUEICON = { cairn: '🗿', cairnflag: '🚩', cairnnote: '📜', wandline: '🚩',  wand: '🚩', note: '📝', tent: '⛺', pole: '🦯', glove: '🧤', debris: '❄', rope: '〰', pack: '🎒', axe: '⛏', track: '👣', cave: '🕳', cornice: '⚠', helmet: '⛑', rocks: '🪨', mirror: '✨', wrap: '🍫', bivy: '💤' };

export function makeSar(K) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input, H } = K;
  let S = null, built = false, mapImg = null, drone = null, ping = null;
  const v3 = new THREE.Vector3(), net = () => (K.net ? K.net() : null);
  const fmtT = (m) => `${Math.floor(m / 60)} ч ${String(Math.floor(m % 60)).padStart(2, '0')} мин`;
  const clockNow = () => G.clock || 12, hm = (x) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor(x % 1 * 60)).padStart(2, '0')}`;

  // ---- сборка интерфейса ----
  function build() { if (built) return; built = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'sarw'; w.hidden = true;
    w.innerHTML = `<div id="sclock" class="hud"></div><canvas id="smini" title="Касание -- крупнее/мельче; дело -- кнопка 🗺"></canvas><div id="sframe" hidden><b></b><i></i><div id="sgim"><button id="sgu">▲</button><span></span><button id="sgd">▼</button></div></div><div id="sflash"></div><div id="sshoot" class="hud" hidden>📷 В КАДРЕ ЧТО-ТО ЕСТЬ — СНИМАЙ!</div>
      <div id="sbtns"><button id="sphoto">📷<small>снимок</small></button><button id="sdrone"><svg class="qc" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/><circle cx="5" cy="5" r="3.2"/><circle cx="19" cy="5" r="3.2"/><circle cx="5" cy="19" r="3.2"/><circle cx="19" cy="19" r="3.2"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" fill="currentColor"/></svg><small>дрон</small></button><button id="sjb">🗺<small>дело</small></button><button id="sfast" hidden>⏩<small>к цели</small></button><button id="sact" hidden></button></div>
      <div id="sbrief" class="spanel" hidden></div><div id="sjour" class="spanel" hidden></div>`;
    document.body.appendChild(w);
    const tap = (id, f) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); f(); });
    tap('sphoto', () => (K.camBtn ? K.camBtn() : photo())); tap('smini', () => $('smini').classList.toggle('big')); tap('sdrone', () => (S && S.dr ? recall() : launch())); tap('sjb', () => journal(!$('sjour').hidden ? false : true)); tap('sact', act); tap('sfast', fast);
    // подвес камеры дрона: тянуть пальцем/мышью по картинке вверх-вниз, колесо мыши, Q (к горизонту) / E (вниз), кнопки ▴▾
    let gp = null; const gim = (dg) => { if (!S || !S.dr) return; S.dr.gim = S.gim = Math.max(0, Math.min(90, (S.dr.gim ?? 35) + dg)); };
    window.addEventListener('pointerdown', (e) => { if (S && S.dr && e.target.tagName === 'CANVAS' && !e.target.closest('#sjour')) { gp = { id: e.pointerId, y: e.clientY }; } }, true);
    window.addEventListener('pointermove', (e) => { if (gp && e.pointerId === gp.id) { gim((e.clientY - gp.y) * 0.25); gp.y = e.clientY; } }, true);
    const gu = (e) => { if (gp && e.pointerId === gp.id) gp = null; }; window.addEventListener('pointerup', gu, true); window.addEventListener('pointercancel', gu, true);
    window.addEventListener('wheel', (e) => { if (S && S.dr && e.target.tagName === 'CANVAS') { e.preventDefault(); e.stopImmediatePropagation(); gim(e.deltaY * 0.03); } }, { capture: true, passive: false });
    tap('sgu', () => gim(-10)); tap('sgd', () => gim(10));
    window.addEventListener('keydown', (e) => { if (!S || !S.on || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyT') fast(); else if (e.code === 'KeyQ' && S.dr) gim(-10); else if (e.code === 'KeyE' && S.dr) gim(10); else if (e.code === 'KeyF') (K.camBtn ? K.camBtn() : photo()); else if (e.code === 'KeyG') (S.dr ? recall() : launch()); else if (e.code === 'KeyJ') journal($('sjour').hidden); else if (e.code === 'KeyB') act(); });
    // дрон: корпус, лучи, винты (маленький -- в 3 раза крупнее, чтобы был виден в кадре), мигалка
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 }), o = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), m)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), m); arm.position.set(Math.cos(a) * 0.35, 0.05, Math.sin(a) * 0.35); arm.rotation.y = -a; g.add(arm);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0x9aa4b4, transparent: true, opacity: 0.45 })); r.position.set(Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7); g.add(r); }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), o); led.position.set(0, -0.1, -0.26); g.add(led); g.scale.setScalar(3); g.visible = false; scene.add(g); drone = { g, led };
    ping = new THREE.Mesh(new THREE.CylinderGeometry(200, 200, 30, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x4ab0ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })); ping.visible = false; scene.add(ping); }

  // ---- начало: дело и брифинг ----
  function begin(code) { build(); code = code || store.get('sarJoin'); store.set('sarJoin', '');
    // новое дело: перебираем коды, пока ситуация не из последних четырёх сыгранных (дело зависит только от кода -- у всех участников одинаковое)
    let c = null; if (code) c = makeCase(code, H); else { const rc = (store.get('sarRecent') || []).slice(-4); const first = !store.get('sarDone'); // первое дело -- лёгкое: трекер, простая ситуация (научиться, а не страдать)
      for (let i = 0; i < 80; i++) { c = makeCase(newCode(), H); if (first ? c.diff === 0 && SCEN.find((q) => q.id === c.scen).rank <= 2 && c.victims.some((v) => v.alive0) : !rc.includes(c.scen)) break; } }
    S = { on: true, c, t: 0, run: false, res: { men: 4, drone: 1 }, teams: [], dr: null, bats: 0, droneLost: 0, rescuerLost: 0, found: new Set(), notes: [], log: [], peers: new Map(), onboard: null, kit: 0, selTeam: -1, posT: 0, saved: 0, aliveFound: 0, deadFound: 0, ended: false, sprites: [], nightOn: false };
    // тревога ночью -- Ми-8 в горах ночью не летает: вылет на рассвете, а у пострадавших тают эти часы
    const alarm = (c.clock0 + c.since / 60) % 24, wait = NIGHT(alarm) || alarm > 14 ? Math.round((((6.5 - alarm) + 24) % 24) * 60) : 0; c.alarm = alarm; c.wait = wait; // поиск начинают с утра: на светлое время -- весь день
    // календарь дела: тревога -- сегодня (G.day); происшествие -- раньше на since; это день маршрута legIdx+1 -> дата выхода группы.
    // Вылет утром после ночной тревоги -- календарь игры честно переходит на следующий день
    { const D0 = G.day || 0, alarmAbs = D0 * 24 + alarm, incAbs = alarmAbs - c.since / 60, incDay = Math.floor(incAbs / 24), day1 = incDay - c.legIdx, startAbs = alarmAbs + wait / 60;
      const L = c.last, contactAbs = L.kind === 'ping' ? incAbs : L.kind === 'radio' ? (L.camp ? (day1 + L.camp - 1) * 24 + 19.3 : day1 * 24 + 7) : null;
      c.cal = { day1, alarmAbs, startAbs, contactAbs, incDay }; G.day = Math.floor(startAbs / 24); }
    for (const q of c.clues) if (q.dated && q.t.includes('{date}')) q.t = q.t.replace('{date}', `${dateOf(c.cal.day1 + q.day - 1)}, ${hhmm(q.hr)}`); // записки в турах -- с настоящей датой
    if (wait) { c.since += wait; for (const v of c.victims) { v.left = Math.max(0, v.left - wait); v.alive0 = v.left > 0; } }
    G.clock = wait ? 6.5 : alarm;
    for (const v of c.victims) { v.foundT = undefined; v.saved = false; v.kit = 0; v.dead = false; v.inEvac = false; }
    worldObjects(); mapImg = null; $('sarw').hidden = false; $('sbtns').hidden = false; $('smini').hidden = true; S.view = null; brief(); syncJoin();
    if (!store.get('sarToon')) { store.set('sarToon', 1); film(); } }
  // ролик-инструктаж: время операции на паузе, пока он идёт
  function film() { if (!S) return; S.film = true; playSarToon({ audio, TOUCH, onDone: () => { if (S) S.film = false; } }); }
  // материалы дела: кто пропал, маршрут по дням с датами, хронология, связь, зацепка -- в брифинге (свёрнуто) и в деле
  function materials() { const c = S.c, K0 = c.cal, at = (abs) => `<b>${dateOf(Math.floor(abs / 24))}, ${hhmm(abs)}</b>`, dn = (abs) => Math.floor(abs / 24) - K0.day1 + 1;
    const ppl = c.group.map((p) => `<b>${p.name}</b> <small>${p.age}, ${p.city}</small>`).join(' · '), plan = c.plan.map((d) => `<li>День ${d.day} · <b>${dateOf(K0.day1 + d.day - 1)}</b>: ${d.from} → <b>${d.to}</b> <small>${d.asl} м</small></li>`).join('');
    return `<h3>Пропали</h3><p>${ppl}</p><p>Маршрут: <b>${c.routeName}</b></p><ol class="plan">${plan}</ol>
      <h3>Хронология</h3><ul class="plan" style="list-style:none;padding-left:0"><li>${at(K0.day1 * 24 + 7)} — группа вышла: ${c.plan[0] ? c.plan[0].from : 'база'} (день 1)</li>
      ${K0.contactAbs !== null ? `<li>${at(K0.contactAbs)} — ${c.last.kind === 'ping' ? 'сигнал SOS трекера' : 'последний сеанс связи'}${dn(K0.contactAbs) >= 1 ? ` (день ${dn(K0.contactAbs)} маршрута)` : ''}</li>` : ''}
      <li>${at(K0.alarmAbs)} — ${c.last.kind === 'ping' ? 'тревога: принят SOS' : c.last.kind === 'radio' ? 'тревога: группа не вышла на связь' : `соседи подняли тревогу: группа не пришла в «${c.pts[Math.min(c.pts.length - 1, c.legIdx + 1)].n}»`}</li>
      <li>${at(K0.startAbs)} — вылет${c.wait ? ' (ночью Ми-8 в горах не летает — ждали рассвета)' : ''}</li></ul>
      <h3>Связь: ${c.comm.name}</h3><p>${c.last.txt}</p>${c.hook ? `<p style="background:rgba(255,210,74,.16);border-left:4px solid #ffd24a;padding:6px 10px">🔎 <b>Зацепка:</b> ${c.hook.txt}</p>` : ''}
      <p><small>Ми-8 не висит выше ~5900 м. Пешие отряды проходят везде, но медленно и рискуют: каждый потерянный спасатель — минус к итогу.</small></p>`; }
  function brief() { const c = S.c, el = $('sbrief'); el.hidden = false;
    const K0 = c.cal;
    const chip = (k, v, t, sub) => `<button class="ch" data-k="${k}" data-v="${v}" aria-pressed="${S.res[k] === v}">${t}<small>${sub}</small></button>`;
    // оперативный брифинг: что случилось, задача, план из трёх шагов, условия, силы -- и «Начать» всегда на виду (внизу, липкая).
    // Подробности (кто пропал, маршрут по дням, хронология, связь, зацепка, совместная операция) -- в «Материалах дела» (свёрнуто)
    const names = c.group.map((p) => p.name).join(' и '), day0 = Math.floor(K0.startAbs / 24), dark = Math.max(0, 20.5 - (K0.startAbs % 24)), hi = Math.max(...c.pts.map((p) => p.asl || 0));
    const what = c.last.kind === 'ping' ? `Сигнал SOS трекера ${dateOf(Math.floor(K0.contactAbs / 24))} в ${hhmm(K0.contactAbs)}` : c.last.kind === 'radio' ? 'Группа не вышла на связь' : 'Группа не пришла в лагерь в срок';
    const step1 = c.last.kind === 'ping' ? 'Летите к точке SOS — трекер ошибается до 200 м' : c.hook ? 'Начните с зацепки — последней метки группы на маршруте' : 'Идите по следу группы вдоль маршрута';
    const wx = { breeze: 'ясно, ветер слабый', santash: 'ветрено, на гребнях до 20 м/с', ulan: 'непогода, ветер до 40 м/с' }[G.preset] || 'переменная';
    const cond = [`🌤 ${wx}`, `🌙 до темноты ${Math.floor(dark)} ч${dark % 1 >= 0.5 ? ' 30 мин' : ''}`, hi > 5900 ? '⛰ выше 5900 м Ми-8 не висит — нужны отряды' : '', c.wait ? `⏳ ждали рассвета — люди ${gw(c.group[0], 'провёл', 'провела')} ночь без помощи` : ''].filter(Boolean);
    const menNote = { 0: 'Только с воздуха: выше 5900 м и в трещинах людей не достать', 4: `Отряд уже в лагере «${c.pts[Math.max(0, c.legIdx)].n}» — пошлёте по карте дела`, 8: 'Два отряда — вдвое шире поиск, но и риск потерь вдвое' }[S.res.men];
    const drNote = S.res.drone ? 'Дрон: 3 батареи, тепловизор, взлёт с висения ниже 60 м' : 'Без дрона — ищете только с вертолёта и пешком';
    el.innerHTML = `<header class="bh"><h2>Дело № ${c.code}</h2><p>${dateOf(day0, true)} · вылет <b>${hhmm(K0.startAbs)}</b> · <span class="bst">${c.comm.name}</span></p></header>
      <p class="bwhat">${what}. ${c.group.length > 1 ? 'Пропали' : gw(c.group[0], 'Пропал', 'Пропала')}: <b>${names}</b>, маршрут «${c.routeName}».</p>
      <h3>Задача</h3><p class="btask">Найти ${c.group.length > 1 ? 'их' : gw(c.group[0], 'его', 'её')} живыми и доставить на базу. У каждого свои часы.</p>
      <h3>План</h3><ol class="bplan"><li>${step1}</li><li>Снижайтесь и снимайте 📷 — улики сужают круг поиска</li><li>Нашли живого — посадка или лебёдка, и на базу</li></ol>
      <h3>Условия</h3><ul class="bcond">${cond.map((t) => `<li>${t}</li>`).join('')}</ul>
      <h3>Силы</h3><div class="row">${chip('men', 0, 'Без пеших', 'с воздуха')}${chip('men', 4, '1 отряд', '4 чел.')}${chip('men', 8, '2 отряда', '8 чел.')}</div><p class="bnote">${menNote}</p>
      <div class="row">${chip('drone', 0, 'Без дрона', '')}${chip('drone', 1, 'Дрон', 'тепловизор')}</div><p class="bnote">${drNote}</p>
      <details class="bmat"><summary>Материалы дела — группа, маршрут, хронология, связь</summary>${materials()}
        <h3>Совместная операция</h3><p><small>Друзья вводят код <b>${c.code}</b> — то же дело, общие находки и заметки.</small></p><p><small>Войти в чужую операцию:</small> <input id="sjoin" maxlength="5" placeholder="КОД"> <button class="ch" id="sjoinb" style="flex:none;display:inline-block;min-width:0">Войти</button></p></details>
      <div class="bgo"><button class="go" id="sgo">Начать операцию</button><button class="ch" id="stoon">🎬 Ролик</button></div>`;
    for (const b of el.querySelectorAll('.ch[data-k]')) b.onclick = () => { S.res[b.dataset.k] = +b.dataset.v; brief(); };
    $('sgo').onclick = start; $('stoon').onclick = () => film(); $('sjoinb').onclick = () => { const v = $('sjoin').value.trim().toUpperCase(); if (seedOf(v) === null) { toast('Код — 5 знаков, например K7QZA'); return; } stopWorld(); begin(v); }; }
  function start() { $('sbrief').hidden = true; S.run = true; G.spyMore = spyTargets; document.body.classList.add('sarrun'); S.bats = S.res.drone ? 3 : 0; const b = K.base();
    const lc = S.c.pts[Math.max(0, S.c.legIdx)]; // отряды уже заброшены в последний лагерь группы
    for (let i = 0; i < S.res.men / 4; i++) S.teams.push({ id: i + 1, n: 4, X: lc.X + 20 + i * 12, Y: lc.Y - 25, tgt: null, carry: null, risk: 0, spr: teamSprite() });
    const hk = S.c.hook && S.c.clues[S.c.hook.id]; if (hk) { S.found.add(hk.id); const tx = S.c.last.kind === 'ping' ? S.c.last.X : hk.X, ty = S.c.last.kind === 'ping' ? S.c.last.Y : hk.Y; if (!(K.userAt && K.userAt())) hop(tx, ty, 700, 140, false, true); } // место выбрано на карте -- стартуем там
    say(`Операция «${S.c.code}» началась. ${S.teams.length ? `Отряды уже в лагере «${S.c.pts[Math.max(0, S.c.legIdx)].n}» — цель им можно дать на карте (🗺).` : 'Ищем с воздуха.'}`, false);
    if (S.c.last.kind === 'ping') { ping.visible = true; ping.position.set(S.c.last.X, H(S.c.last.X, S.c.last.Y) + 10, -S.c.last.Y); }
    K.pop('ЗАЦЕПКА', S.c.hook ? 'последняя вешка группы — прямо по курсу' : 'ищите следы'); if (S.c.hook) say(`🔎 ${S.c.hook.txt}`, false); journal(false); objective(); }
  // перелёт: вертолёт -- в воздухе в D м от точки, носом к ней, на высоте A над рельефом (по пути -- не ниже гребней); время операции идёт
  function hop(X, Y, D = 400, A = 120, land = false, free = false) { const h = K.heli(), a0 = Math.atan2(X - h.X, Y - h.Y), dist = Math.hypot(X - h.X, Y - h.Y), sx = X - Math.sin(a0) * D, sy = Y - Math.cos(a0) * D;
    let top = H(sx, sy); for (let k = 1; k <= 8; k++) top = Math.max(top, H(sx + (X - sx) * k / 8, sy + (Y - sy) * k / 8) - 40);
    if (land) h.reset(X + 8, Y - 6, H(X + 8, Y - 6), a0, true); else h.reset(sx, sy, top + A, a0, false); h.load = h.load || 0; K.resetCam();
    if (S.run && !free && dist > 300) { const mins = Math.round(dist / 3300 + 2); S.t += mins; if (G.clock + mins / 60 >= 24) G.day = (G.day || 0) + 1; G.clock = (G.clock + mins / 60) % 24; return mins; } return 0; }
  // кнопка «⏩ к цели»: цель далеко -- перелёт за пару минут операции, без полёта над пустым ледником
  function fastTarget() { const m = K.mission(), g = K.goal(); if (m) return { X: m.to.X, Y: m.to.Y, base: !!m.base, t: m.t }; if (g) return { X: g.X, Y: g.Y, t: S.goalTxt ? S.goalTxt.t : 'цель' }; return null; }
  function fast() { if (!S || !S.run || S.dr) return; const q = fastTarget(), h = K.heli(); if (!q) return; const d = Math.hypot(q.X - h.X, q.Y - h.Y); if (d < 1500) { toast('Цель рядом — долетите сами'); return; }
    const m = hop(q.X, q.Y, q.base ? 350 : 450, q.base ? 80 : 130); K.pop('⏩ ПЕРЕЛЁТ', `${(d / 1000).toFixed(1)} км · ${m} мин операции`); }

  // ---- мир: улики, люди (спрайты), следы ----
  const iconTex = new Map();
  // тур: 3-4 плоских камня горкой ~1.3 м; с флажком группы -- шест с оранжевой лентой (видно сверху и в фотоаппарат)
  const stoneGeo = new THREE.DodecahedronGeometry(0.5, 0), stoneMat = new THREE.MeshLambertMaterial({ color: 0x6b6660, flatShading: true }), poleMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a }), tapeMat = new THREE.MeshBasicMaterial({ color: 0xff6a14, side: THREE.DoubleSide });
  function cairnMesh(flag, seed) { const g = new THREE.Group(); let y = 0; for (let i = 0; i < 4; i++) { const k = 1 - i * 0.2, st = new THREE.Mesh(stoneGeo, stoneMat); st.scale.set(1.4 * k, 0.55 * k, 1.2 * k); st.position.y = y + 0.25 * k; st.rotation.y = (seed * 1.7 + i) % 6; y += 0.42 * k; g.add(st); }
    if (flag) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), poleMat); p.position.y = y + 0.8; const t = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), tapeMat); t.position.set(0.36, y + 1.5, 0); g.add(p, t); } return g; }
  // вешка провешенного пути: тонкий шест 1.6 м с лентой
  function wandMesh() { const g = new THREE.Group(), p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), poleMat), t = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.32), tapeMat); p.position.y = 0.8; t.position.set(0.35, 1.42, 0); g.add(p, t); return g; }
  function clueSprite(q) { let t = iconTex.get(q.k); if (!t) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '46px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(CLUEICON[q.k] || '•', 32, 36); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; iconTex.set(q.k, t); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); const sz = q.big ? 4 : 1.6; s.scale.set(sz, sz, 1); s.center.set(0.5, 0.1); return s; }
  function worldObjects() { stopWorld(); const c = S.c, root = new THREE.Group(); scene.add(root); S.root = root;
    for (const q of c.clues) { if (q.k === 'debris') { // лавинный вынос: комья снега пятном вдоль ската
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); for (let i = 0; i < 260; i++) { const r = 2 + Math.random() * 7, px = 64 + (Math.random() - 0.5) * 110 * Math.random() ** 0.5, py = 64 + (Math.random() - 0.5) * 120; x.fillStyle = `rgba(${200 + Math.random() * 40},${210 + Math.random() * 35},${230 + Math.random() * 25},0.85)`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.strokeStyle = 'rgba(90,110,150,.35)'; x.stroke(); }
        const t = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(150, 260), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(q.dir[0], q.dir[1]); m.rotation.x = -Math.PI / 2; m.position.set(q.X, H(q.X, q.Y) + 2, -q.Y); root.add(m); }
      if (q.path && q.k === 'track') root.add(footprints(q.path));
      if (q.k === 'cairn' || q.k === 'cairnflag' || q.k === 'cairnnote') { const g = cairnMesh(q.k !== 'cairn', q.id); g.scale.setScalar(1.6); g.position.set(q.X, H(q.X, q.Y), -q.Y); root.add(g); q.spr = g; continue; } // тур -- камнями, не значком
      if (q.k === 'wandline' && q.path) { const g = new THREE.Group(); for (const [X, Y] of q.path) { const w = wandMesh(); w.scale.setScalar(1.8); w.position.set(X, H(X, Y), -Y); g.add(w); } root.add(g); q.spr = g; continue; } // цепочка следов -- отпечатки на снегу, а не тёмная линия
      const s = clueSprite(q); s.position.set(q.X, H(q.X, q.Y), -q.Y); root.add(s); q.spr = s; }
    for (const v of c.victims) { const fr = ['goth0', 'goth1', 'goth2', 'goth3', 'goth4', 'blond0', 'blond1', 'blond2', 'blond3', 'blond4'][v.frame % 10], s = K.personSprite(fr);
      if (v.pose === 'lie' || !v.alive0) { s.material.rotation = Math.PI / 2; s.center.set(0.5, 0.5); } if (v.pose === 'sit') s.scale.y *= 0.62; if (!v.alive0) s.material.color.setHex(0x8a96a8);
      s.visible = !(v.pose === 'buried' || v.pose === 'crev'); root.add(s); v.spr = s;
      // живой и в сознании -- машет оранжевой тряпкой на палке: яркая точка, которую видно сверху и в бинокль
      if (v.alive0 && s.visible && v.pose !== 'lie') { const f = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5), new THREE.MeshBasicMaterial({ color: 0x333333 })); pole.position.y = 1.1;
        const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color: 0xff5a14, side: THREE.DoubleSide })); cl.position.set(0.55, 1.85, 0); f.add(pole, cl); f.userData.cl = cl; root.add(f); v.flag = f; }
      placeVictim(v); } }
  // следы: отпечатки парами вдоль пути, плоско на снегу (инстансы)
  let fpTex = null;
  function footprints(path) { if (!fpTex) { const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = 'rgba(60,80,120,.85)'; for (const [cx, cy] of [[10, 18], [22, 46]]) { x.beginPath(); x.ellipse(cx, cy, 6, 11, 0, 0, 7); x.fill(); } fpTex = new THREE.CanvasTexture(cv); }
    const pts = []; for (let i = 1; i < path.length; i++) { const [x0, y0] = path[i - 1], [x1, y1] = path[i], L = Math.hypot(x1 - x0, y1 - y0); for (let d = 0; d < L; d += 2.6) pts.push([x0 + (x1 - x0) * d / L, y0 + (y1 - y0) * d / L, Math.atan2(x1 - x0, y1 - y0)]); }
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ map: fpTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), pts.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    pts.forEach(([X, Y, a], i) => { e.set(-Math.PI / 2, -a, 0, 'YXZ'); e.set(-Math.PI / 2, 0, 0); q4.setFromEuler(new THREE.Euler(0, -a, 0)).multiply(new THREE.Quaternion().setFromEuler(e)); p.set(X, H(X, Y) + 0.15, -Y); m4.compose(p, q4, sc); im.setMatrixAt(i, m4); });
    return im; }
  function placeVictim(v) { const [X, Y] = v.walker && v.foundT === undefined && aliveNow(v) ? walkerPos(v, S.c.since + S.t, S.c.clock0) : [v.X, v.Y]; v.X = X; v.Y = Y; v.spr.position.set(X, H(X, Y) + (v.spr.material.rotation ? 0.3 : 0), -Y); if (v.flag) { v.flag.position.set(X + 0.8, H(X + 0.8, Y), -Y); v.flag.visible = !v.dead && !v.saved && v.spr.visible; v.flag.userData.cl.rotation.y = Math.sin(performance.now() / 180 + v.id) * 0.6; } }
  function stopWorld() { if (S && S.root) { scene.remove(S.root); S.root.traverse((o) => { if (o.material) { if (o.material.map && !o.isSprite) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); S.root = null; } }
  function teamSprite() { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = K.personSprite(['goth3', 'blond3', 'goth1'][i], 1.75); s.material.color.setHex(0xff9a5a); s.position.set(i * 1.3 - 1.3, 0, (i % 2) * 1.2); g.add(s); } const f = K.flagPole(); f.scale.setScalar(0.6); g.add(f); S.root.add(g); return g; }
  const aliveNow = (v) => !v.dead && aliveAt(v, S.t);

  // ---- лог операции и общие события ----
  // хроника дела: всё -- в журнал дела и в сводку операции (сообщения отрядов -- обычные, находки -- важные)
  // pri -- важность для сводки: 1 критично, 2 задача, 3 находка, 4 сведения, 5 мелочь; по умолчанию: сообщение -- 4, находка в хронике -- 3
  function say(txt, me = true, pri) { S.log.unshift({ t: S.t, txt }); if (S.log.length > 60) S.log.pop(); if (K.feed) K.feed(txt, pri || (me ? 4 : 3)); else if (me) toast(txt); refreshJournal(); }
  function share(e) { const n = net(); if (n && n.sar) n.sar(S.c.code, e); }
  function syncJoin() { const n = net(); if (n && n.sarJoin) n.sarJoin(S.c.code); NETHOOK.sar = (m) => { if (!S || !S.on) return;
    const list = m.t === 'sarh' ? m.ev || [] : [m.e]; for (const e of list) remote(e || {}, m.t === 'sarh'); }; }
  function remote(e, quiet) { const c = S.c;
    if (e.k === 'clue' && c.clues[e.id] && !S.found.has(e.id)) { S.found.add(e.id); if (!quiet) say(`${e.n || 'Напарник'}: ${c.clues[e.id].t}`); }
    else if (e.k === 'vic' && c.victims[e.id] && c.victims[e.id].foundT === undefined) { const v = c.victims[e.id]; v.foundT = S.t; v.by = e.n; if (!e.alive) v.dead = true; evacPlan(v); if (!quiet) { K.pop(e.alive ? `${v.name.toUpperCase()} ${gw(v, 'ЖИВ', 'ЖИВА')}!` : `${v.name}: ${gw(v, 'погиб', 'погибла')}`, `нашёл ${e.n || 'напарник'}`); } }
    else if (e.k === 'note') { S.notes.push({ X: e.X, Y: e.Y, txt: String(e.txt || '').slice(0, 80), n: e.n || '' }); if (!quiet) say(`📌 ${e.n || 'Напарник'}: ${e.txt}`, true); }
    else if (e.k === 'pos') S.peers.set(e.n || '?', { X: e.X, Y: e.Y, d: e.d, t: performance.now() });
    else if (e.k === 'saved' && c.victims[e.id]) c.victims[e.id].saved = true; }

  // ---- снимок: всё, что в кадре, близко и не слишком высоко ----
  // снимок: o -- кадр фотоаппарата вертолёта (зум, глаз, миниатюра, «в кадре», «не за склоном»); без o -- снимок с дрона (его вид).
  // Зум приближает: дальность обнаружения растёт как 1 + 0.4·(зум − 1) (24× -- примерно в 10 раз), но сквозь склон не видно.
  // Каждый кадр -- в фотоархив дела: миниатюра, время, зум, высота и подписи ко всему, что в кадре.
  // тип объекта для подписи снимка -- по виду улики (не выдумываем: только то, что есть в деле)
  const CTYPE = { cairn: 'ориентир', cairnflag: 'ориентир', cairnnote: 'записка', wandline: 'следы', track: 'следы', tent: 'лагерь', bivy: 'лагерь', cave: 'укрытие', pack: 'снаряжение', axe: 'снаряжение', rope: 'снаряжение', glove: 'снаряжение', helmet: 'снаряжение', pole: 'снаряжение', mirror: 'снаряжение', wrap: 'снаряжение', wand: 'ориентир', note: 'записка', debris: 'след происшествия', cornice: 'след происшествия', rocks: 'след происшествия' };
  const ctype = (q) => (q.fake ? 'старое снаряжение' : CTYPE[q.k] || 'неизвестный объект');
  function photo(o) { if (!S || !S.run || S.ended) return; if (!o) { const fl = $('sflash'); fl.style.transition = 'none'; fl.style.opacity = 0.85; void fl.offsetWidth; fl.style.transition = 'opacity .35s'; fl.style.opacity = 0; audio.beep && audio.beep(false); }
    const from = o ? o.eye : S.dr ? { X: S.dr.X, Y: S.dr.Y, Z: S.dr.Z } : { X: K.heli().X, Y: K.heli().Y, Z: K.heli().Z }, agl = from.Z - H(from.X, from.Y), kind = S.dr ? 'drone' : 'heli', night = NIGHT(clockNow()), zk = o ? 1 + (o.zoom - 1) * 0.4 : 1; let got = 0, seen = 0, unk = 0; const items = [];
    camera.updateMatrixWorld(); const look = o ? (X, Y, z) => o.inFrame(X, Y, z + 1) && o.visible(X, Y, z + 1) : (X, Y, z) => { v3.set(X, z + 1, -Y).project(camera); return v3.z < 1 && Math.abs(v3.x) < 0.8 && Math.abs(v3.y) < 0.76; };
    for (const q of S.c.clues) { const z = H(q.X, q.Y); if (!look(q.X, q.Y, z)) continue; if (S.found.has(q.id)) { items.push({ type: ctype(q), title: short(q.t, 46), cap: `${CLUEICON[q.k] || '•'} ${short(q.t, 46)} <small>(уже в деле)</small>`, ref: q.id }); continue; } seen++;
      const d = Math.hypot(q.X - from.X, q.Y - from.Y, z - from.Z) / zk; if (Math.random() < pod(q, d, agl, night, kind)) { found(q); got++; items.push({ type: ctype(q), title: short(q.t, 80), cap: `${CLUEICON[q.k] || '•'} ${short(q.t, 80)}`, ref: q.id, isNew: true }); } else unk++; }
    for (const v of S.c.victims) { const z = H(v.X, v.Y); if (!v.spr || (!v.spr.visible && !(v.buried || v.pose === 'crev'))) continue; if (!look(v.X, v.Y, z)) continue; if (v.foundT !== undefined) { items.push({ type: 'пострадавший', title: v.name, cap: `🧍 ${v.name}${v.saved ? ' — спасён' : v.dead ? ' ✖' : ''}`, ref: 'v' + v.id }); continue; } seen++;
      const d = Math.hypot(v.X - from.X, v.Y - from.Y, z - from.Z) / zk; if (Math.random() < pod({ ...v, buried: v.buried || v.pose === 'crev' }, d, agl, night, kind)) { foundV(v, kind); got++; items.push({ type: 'пострадавший', title: v.name, cap: `🧍 ${v.name} — ${v.dead ? gw(v, 'погиб', 'погибла') : gw(v, 'жив', 'жива') + ', машет'}`, ref: 'v' + v.id, isNew: true }); } else unk++; }
    if (unk) items.push({ type: 'неизвестный объект', title: 'Неизвестный объект', cap: `❔ Неизвестный объект${unk > 1 ? ' ×' + unk : ''} — ${o && o.zoom < 6 ? 'подлетите ближе или увеличьте зум' : 'ближе!'}`, ref: null });
    const caps = items.map((it) => it.cap);
    if (!got) K.pop('ПУСТО', o ? (seen ? 'что-то есть — ближе или больше зум' : 'в кадре ничего') : agl > 160 ? 'слишком высоко: снижайтесь до 60-120 м' : seen ? 'что-то есть — ближе!' : 'в кадре ничего');
    const hr = clockNow(), brg = o ? Math.round(((o.yaw * 180 / Math.PI) % 360 + 360) % 360) : null, ph = { id: `${S.c.code}-ф${(S.phN = (S.phN || 0) + 1)}`, X: Math.round(from.X), Y: Math.round(from.Y), brg, items, t: S.t, hh: `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor(hr % 1 * 60)).padStart(2, '0')}`, zoom: o ? o.zoom : 1, thumb: o ? o.thumb : K.snap ? K.snap() : null, caps, drone: !!S.dr, alt: Math.round(from.Z + ASL), range: o && o.range ? Math.round(o.range) : null };
    (S.photos || (S.photos = [])).push(ph); if (S.photos.length > 40) S.photos.shift(); if (!got) say(`📷 Снимок ${ph.hh}${ph.zoom >= 1.5 ? ' · ' + Math.round(ph.zoom) + '×' : ''}: ${caps.length ? caps.join('; ').replace(/<[^>]+>/g, '') : 'пусто'}`, false); else refreshJournal(); }
  // бинокль с борта (Z / 🔭): улики и люди -- цели для опознания. Крупное (палатка, рюкзак, вынос, следы, человек) засчитывается
  // сразу; мелочь (записка, обёртка, перчатка) бинокль только замечает -- «снимите вблизи». Дальность -- 2.5 км, мелкое -- на большой кратности
  const SMALL = { cairnnote: 1, note: 1, wrap: 1, glove: 1, mirror: 1, helmet: 1, axe: 1, pole: 1 }, SIZE = { cairn: 1.5, cairnflag: 2, wandline: 25, debris: 80, tent: 5, bivy: 3, track: 8, cave: 6, cornice: 20, rocks: 10, pack: 1.6, rope: 3, wand: 1.6 };
  function spyTargets() { if (!S || !S.run) return []; const h = K.heli(), out = [];
    for (const q of S.c.clues) { if (Math.hypot(q.X - h.X, q.Y - h.Y) > 2600) continue; const got = S.found.has(q.id), sm = SMALL[q.k];
      out.push({ id: 'sar:' + q.id, cat: 'Поиск', name: q.marker ? '🗿 тур — тропа здесь' : got ? `${CLUEICON[q.k] || ''} уже в деле` : sm ? `${CLUEICON[q.k] || ''} что-то лежит — снимите вблизи 📷` : `${CLUEICON[q.k] || ''} улика!`, X: q.X, Y: q.Y, y: H(q.X, q.Y) + 1, size: SIZE[q.k] || 1.2, far: 2600,
        onLock: () => { if (!got && !sm && !S.found.has(q.id)) found(q); } }); }
    for (const v of S.c.victims) { if (!v.spr || !v.spr.visible || Math.hypot(v.X - h.X, v.Y - h.Y) > 2600) continue;
      out.push({ id: 'sarv:' + v.id, cat: 'Поиск', name: v.foundT !== undefined ? v.name : 'человек!', X: v.X, Y: v.Y, y: H(v.X, v.Y) + 1, size: 2.2, far: 2600, onLock: () => { if (v.foundT === undefined) foundV(v, 'spy'); } }); }
    for (const t of S.teams) if (t.n > 0 && !t.onboard && t.spr) out.push({ id: 'sart:' + t.id, cat: 'Поиск', name: `отряд ${t.id} · ${t.n} чел.`, X: t.X, Y: t.Y, y: H(t.X, t.Y) + 1, size: 4, far: 4000, onLock: () => {} });
    return out; }
  function found(q) { S.found.add(q.id); share({ k: 'clue', id: q.id }); if (q.marker) { say(`${CLUEICON[q.k]} ${q.t}`, false, 5); return; } // тур -- ориентир, не улика
    if (q.fake) K.pop('ЛОЖНЫЙ СЛЕД', 'старьё чужой экспедиции — время потеряно'); else { S.streak = S.t - (S.lastClue ?? -99) < 25 ? Math.min(4, (S.streak || 1) + 1) : 1; S.lastClue = S.t; const b = 40 * (S.streak - 1); S.hot = (S.hot || 0) + b;
      K.pop(S.streak > 1 ? `+${40 + b} ГОРЯЧИЙ СЛЕД ×${S.streak}` : '+40 УЛИКА', q.t.length > 60 ? q.t.slice(0, 58) + '…' : q.t); K.buzz(30); } say(`${CLUEICON[q.k] || ''} ${q.t}`, false); audio.chime && audio.chime(); }
  function foundV(v, how) { const alive = aliveNow(v); v.foundT = S.t; if (!alive) v.dead = true; share({ k: 'vic', id: v.id, alive }); K.buzz(alive ? [60, 40, 60, 40, 120] : 80);
    if (alive) { K.score(600, `${v.name.toUpperCase()} ${gw(v, 'ЖИВ', 'ЖИВА')}!`, how === 'team' ? 'нашёл пеший отряд' : how === 'spy' ? 'в бинокль — машет!' : 'на снимке — машет!'); G.shake = Math.max(G.shake, 0.3); }
    else K.pop(`${v.name}: ${gw(v, 'ПОГИБ', 'ПОГИБЛА')}`, 'опоздали — или шансов не было');
    say(alive ? `✅ ${v.name} ${gw(v, 'найден живым', 'найдена живой')}. ${v.injured ? 'Травмы — нужна эвакуация' : 'Нужна эвакуация'}` : `✖ ${v.name}: ${gw(v, 'найден погибшим', 'найдена погибшей')}`, false); evacPlan(v); }
  // эвакуация: живого -- вертолётом (если высота позволяет) лебёдкой или посадкой и на базу; выше -- пешие спускают
  function evacPlan(v) { if (v.dead || v.inEvac || v.saved) return; const asl = H(v.X, v.Y) + ASL;
    if (asl > 5900) { const t = nearestTeam(v.X, v.Y); if (t) { t.tgt = [v.X, v.Y]; t.carryV = v; say(`Выше 5900 м вертолёт не зависнет. Отряд ${t.id} идёт к ${v.name} — спустит ниже`); } else say(`${v.name} на ${Math.round(asl)} м — вертолёту не достать. Нужен пеший отряд (или дрон с набором — продлит часы)`); return; }
    v.inEvac = true; const sl = Math.hypot(H(v.X + 15, v.Y) - H(v.X - 15, v.Y), H(v.X, v.Y + 15) - H(v.X, v.Y - 15)) / 30;
    K.addMission({ t: 'Эвакуация', d: `${v.name}: ${sl < 0.22 ? 'сесть рядом' : 'склон крутой — лебёдкой'}`, X: v.X, Y: v.Y, how: sl < 0.22 ? 'land' : 'winch', add: 75, sarV: v }); v.spr.visible = false; }
  const nearestTeam = (X, Y) => { let b = null, bd = 1e9; for (const t of S.teams) { if (t.n <= 0 || t.carryV) continue; const d = Math.hypot(t.X - X, t.Y - Y); if (d < bd) { bd = d; b = t; } } return b; };
  // миссия эвакуации выполнена (helimode: complete): человек на борту -> на базу; на базе -- спасён
  function missionDone(m) { if (m.sarV) { m.sarV.onboard = true; S.toBase = true; if (!K.hasMission('base')) K.addMission({ t: 'На базу', d: 'Пострадавших — к врачам в базовый лагерь', base: true, how: 'land' }); }
    else if (m.base) { for (const v of S.c.victims) if (v.onboard && !v.saved) { v.saved = true; v.onboard = false; S.saved++; share({ k: 'saved', id: v.id }); K.score(1500, `${v.name.toUpperCase()} ${gw(v, 'СПАСЁН', 'СПАСЕНА')}!`, gw(v, 'доставлен к врачам', 'доставлена к врачам')); } checkEnd(); } }

  // ---- дрон: запуск с земли, батарея, связь, ветер ----
  // можно ли поднять дрон прямо сейчас: '' -- да, иначе -- короткая причина (её показывает кнопка и всплывашка)
  function droneWhy() { if (!S || !S.run) return 'нет операции'; if (!S.res.drone) return 'нет в операции'; if (S.dr) return ''; if (S.bats <= 0) return 'батареи кончились'; const h = K.heli();
    if (h.ground) return ''; if (h.agl > 60) return 'ниже 60 м'; if (h.speed > 4) return 'сбавь ход'; return ''; }
  function launch() { const why = droneWhy(); if (why) { K.pop('ДРОН НЕ ВЗЛЕТИТ', why === 'ниже 60 м' ? 'дрон — с земли или с висения ниже 60 м' : why === 'сбавь ход' ? 'зависните почти на месте (меньше 15 км/ч)' : why); return; } if (S.dr) return; const h = K.heli(), air = !h.ground; // с вертолёта -- в висении, без посадки
    S.bats--; S.dr = { gim: S.gim ?? 35, X: h.X + 8, Y: h.Y, Z: air ? h.Z - 4 : h.Z + 2, th: h.th, vx: 0, vy: 0, vz: 0, bat: 1, L: { X: h.X, Y: h.Y }, kit: 1, air }; drone.g.visible = true; $('sframe').hidden = false; document.body.classList.add('sardr'); K.pop('ДРОН В ВОЗДУХЕ', `батарея ~3 мин · запасных ${S.bats}`); }
  function recall() { if (!S.dr) return; S.dr.home = true; toast(S.dr.air ? 'Дрон возвращается к вертолёту — держите висение' : 'Дрон возвращается к точке запуска'); }
  function droneTick(dt, c) { const d = S.dr; if (d.air) { const h = K.heli(); d.L = { X: h.X, Y: h.Y }; d.LZ = h.Z; } const wb = K.windAt(d.X, d.Y, d.Z), L = Math.hypot(d.X - d.L.X, d.Y - d.L.Y); // запущен с вертолёта -- «дом» летит вместе с ним
    d.bat -= dt / 190 * (1 + Math.hypot(wb.x, wb.y) / 30); let fwd = c.fwd, side = c.side, up = c.up;
    if (d.home || L > 6000) { const a = Math.atan2(d.L.X - d.X, d.L.Y - d.Y), e = Math.atan2(Math.sin(a - d.th), Math.cos(a - d.th)); side = Math.max(-1, Math.min(1, e * 2)); fwd = Math.abs(e) < 0.6 ? Math.min(1, L / 60) : 0; up = d.air ? Math.max(-1, Math.min(1, ((d.LZ - 4) - d.Z) / 15)) : d.Z - H(d.X, d.Y) < 60 ? 1 : L < 50 ? -1 : 0; }
    d.th += side * 1.6 * dt; const sp = 17, tx = Math.sin(d.th) * fwd * sp + wb.x * 0.45, ty = Math.cos(d.th) * fwd * sp + wb.y * 0.45, k = Math.min(1, dt * 2.5);
    d.vx += (tx - d.vx) * k; d.vy += (ty - d.vy) * k; d.vz += (up * 6 - d.vz) * Math.min(1, dt * 3); d.X += d.vx * dt; d.Y += d.vy * dt; d.Z += d.vz * dt;
    const gz = H(d.X, d.Y); if (d.Z < gz + 1.5) { if (d.vz < -3 || Math.hypot(d.vx, d.vy) > 8) { lostDrone('Дрон разбит о склон'); return; } d.Z = gz + 1.5; d.vz = 0; }
    if (d.Z - (H(d.L.X, d.L.Y)) > 7600 - ASL - H(d.L.X, d.L.Y)) d.Z = 7600 - ASL; // потолок дрона ~7600 м
    if (d.bat <= 0) { if (L < 60) { landDrone(); return; } lostDrone('Батарея села — дрон упал'); return; }
    if (d.air ? (d.home || d.bat < 0.97) && L < 15 && Math.abs(d.Z - (d.LZ - 4)) < 8 : L < 30 && d.Z - gz < 4 && (d.home || d.bat < 0.97)) { landDrone(); return; } // с вертолёта -- подхват на борт
    drone.g.position.set(d.X, d.Z, -d.Y); drone.g.rotation.set(0, -d.th, 0); drone.g.rotateX(-fwd * 0.25); drone.g.rotateZ(-side * 0.15); drone.led.visible = (S.t * 3) % 1 < 0.5;
    if (d.bat < 0.18 && !d.warned) { d.warned = 1; toast('Дрон: батарея 18% — пора домой'); }
    if (L > 5000 && !d.far) { d.far = 1; toast('Дрон: слабый сигнал — дальше 6 км вернётся сам'); } else if (L < 4500) d.far = 0; }
  function landDrone() { document.body.classList.remove('sardr'); drone.g.visible = false; S.dr = null; $('sframe').hidden = true; toast(S.bats ? `Дрон сел. Свежая батарея — ещё ${S.bats}` : 'Дрон сел. Батарей больше нет'); }
  function lostDrone(t) { document.body.classList.remove('sardr'); drone.g.visible = false; S.dr = null; S.droneLost++; $('sframe').hidden = true; K.pop('ДРОН ПОТЕРЯН', t); }
  // сброс спасательного набора с дрона: одеяло, грелки, рация -- найденному живому +6 часов
  function dropKit() { const d = S.dr; if (!d || !d.kit) return; for (const v of S.c.victims) if (v.foundT !== undefined && !v.dead && !v.kit && Math.hypot(v.X - d.X, v.Y - d.Y) < 45) { v.kit = 1; d.kit = 0; K.score(250, 'НАБОР СБРОШЕН', `${v.name}: одеяло, грелки, рация — +6 часов`); share({ k: 'note', X: v.X, Y: v.Y, txt: `Сброшен набор для ${v.name}` }); return; } toast('Набор сбрасывают найденному живому — подлетите ближе (45 м)'); }

  // ---- пешие отряды: идут к цели по рельефу, ищут вокруг, рискуют ----
  function teamsTick(dm) { const wx = { breeze: 1, santash: 1.4, ulan: 2.2 }[G.preset] || 1.2, night = NIGHT(clockNow());
    for (const t of S.teams) { if (t.n <= 0) continue; if (t.onboard) { t.spr.visible = false; continue; } t.spr.visible = true;
      if (t.tgt) { const dx = t.tgt[0] - t.X, dy = t.tgt[1] - t.Y, d = Math.hypot(dx, dy), sl = Math.hypot(H(t.X + 20, t.Y) - H(t.X - 20, t.Y), H(t.X, t.Y + 20) - H(t.X, t.Y - 20)) / 40, asl = H(t.X, t.Y) + ASL;
        const v = 55 / (1 + sl * 4) * (asl > 6000 ? 0.4 : asl > 5000 ? 0.65 : 1) * (night ? 0.5 : 1) * (t.carry ? 0.5 : 1) / (wx > 2 ? 1.6 : 1), step = Math.min(d, v * dm);
        if (d > 5) { t.X += dx / d * step; t.Y += dy / d * step; } else arrive(t);
        // риск: крутизна, высота, лавиноопасная зона, погода, ночь
        const inZone = S.c.zone.kind === 'aval' && Math.hypot(t.X - S.c.zone.X, t.Y - S.c.zone.Y) < 400, p = 0.00025 * dm * (sl > 0.55 ? 3 : 1) * (asl > 6000 ? 2 : 1) * (inZone ? 3 : 1) * wx * (night ? 1.6 : 1);
        if (Math.random() < p) { t.n--; S.rescuerLost++; K.pop('ПОТЕРЯ В ОТРЯДЕ', `отряд ${t.id}: ${['срыв на склоне', 'закрытая трещина', 'обморожение, эвакуация', 'камень с кулуара'][Math.floor(Math.random() * 4)]}`); say(`⚠ Отряд ${t.id} потерял спасателя. Осталось ${t.n}`, true, 1); if (t.n <= 0) { t.spr.visible = false; say(`Отряд ${t.id} выбыл`); } } }
      if (t.carry) { const v = t.carry; v.X = t.X + 2; v.Y = t.Y; v.spr.visible = true; v.spr.position.set(v.X, H(v.X, v.Y) + 0.3, -v.Y); }
      // поиск: прочёсывают вокруг себя ~90 м (засыпанного -- лавинными щупами ~40 м)
      for (const q of S.c.clues) if (!S.found.has(q.id) && Math.hypot(q.X - t.X, q.Y - t.Y) < 90) { found(q); say(`Отряд ${t.id} нашёл: ${q.t}`, false); }
      for (const v of S.c.victims) if (v.foundT === undefined && Math.hypot(v.X - t.X, v.Y - t.Y) < ((v.buried || v.pose === 'crev') ? 40 : 110)) foundV(v, 'team');
      t.spr.position.set(t.X, H(t.X, t.Y), -t.Y); } }
  function arrive(t) { t.tgt = null;
    if (t.carryV && !t.carry && Math.hypot(t.carryV.X - t.X, t.carryV.Y - t.Y) < 30) { t.carry = t.carryV; t.carry.foundT = t.carry.foundT ?? S.t; // взяли пострадавшего -- вниз к ближайшему месту ниже 5600
      let best = null; for (const p of S.c.pts) if (p.asl < 5600) { const d = Math.hypot(p.X - t.X, p.Y - t.Y); if (!best || d < best.d) best = { ...p, d }; } if (best) { t.tgt = [best.X, best.Y]; say(`Отряд ${t.id} спускает ${t.carry.name} к «${best.n}»`); } return; }
    if (t.carry) { const v = t.carry; t.carry = null; t.carryV = null; v.X = t.X + 6; v.Y = t.Y + 4; v.spr.visible = true; placeVictim(v); say(`Отряд ${t.id} спустил ${v.name} — вертолёт может забирать`); evacPlan(v); return; }
    say(`Отряд ${t.id} на месте. Прочёсывают вокруг`, false); }

  // ---- кнопка действия: взять/высадить отряд, сбросить набор ----
  function actLabel() { if (S.dr) return S.dr.kit ? '📦<small>набор</small>' : ''; const h = K.heli(); if (!h.ground) return '';
    const ob = S.teams.find((t) => t.onboard); if (ob) return '🧗<small>высадить</small>'; const near = S.teams.find((t) => t.n > 0 && !t.carry && Math.hypot(t.X - h.X, t.Y - h.Y) < 90); return near ? '🧗<small>на борт</small>' : ''; }
  function act() { if (!S || !S.run) return; if (S.dr) { dropKit(); return; } const h = K.heli(); if (!h.ground) return; const ob = S.teams.find((t) => t.onboard);
    if (ob) { ob.onboard = false; ob.X = h.X + 15; ob.Y = h.Y + 10; h.load = Math.max(0, h.load - ob.n * 90); say(`Отряд ${ob.id} высажен на ${Math.round(H(h.X, h.Y) + ASL)} м. Укажите цель на карте`); return; }
    const t = S.teams.find((q) => q.n > 0 && !q.carry && Math.hypot(q.X - h.X, q.Y - h.Y) < 90); if (t) { t.onboard = true; t.tgt = null; h.load += t.n * 90; say(`Отряд ${t.id} на борту (+${t.n * 90} кг — на высоте это чувствуется)`); } }

  // ---- такт ----
  function tick(dt, c) { if (!S || !S.on) return { lock: false }; if (!S.run || S.ended || S.film) return { lock: !!S.dr };
    const dm = dt; S.t += dm; // секунда -- минута операции
    for (const v of S.c.victims) { if (!v.dead && v.alive0 && !aliveAt(v, S.t) && !v.saved && !v.onboard) { v.dead = true; if (v.foundT !== undefined) { K.pop('ПОТЕРЯЛИ', `${v.name} — не ${gw(v, 'дождался', 'дождалась')}`); say(`✖ ${v.name} ${gw(v, 'умер', 'умерла')}, не дождавшись эвакуации`, true, 1); } }
      if (v.foundT !== undefined && !v.dead && !v.saved && !v.onboard && !v.w60 && Math.max(0, v.left + (v.kit ? 360 : 0) - (v.foundT + (S.t - v.foundT) / 3)) * 3 < 60) { v.w60 = 1; say(`🩺 ${v.name}: меньше часа! Эвакуируйте или сбросьте набор`, true, 1); }
      if (v.walker && v.foundT === undefined) placeVictim(v); else if (v.flag) { v.flag.visible = !v.dead && !v.saved && !v.onboard && v.spr.visible; if (v.flag.visible) v.flag.userData.cl.rotation.y = Math.sin(performance.now() / 180 + (v.id || 0)) * 0.6; } }
    if (S.dr) droneTick(dt, c); teamsTick(dm);
    // вертолёт видит человека сам: низко и близко -- «вижу человека!»
    const h = K.heli(); for (const v of S.c.victims) if (v.foundT === undefined && !(v.buried || v.pose === 'crev') && Math.hypot(v.X - h.X, v.Y - h.Y) < 70 && h.agl < 90) foundV(v, 'heli');
    // ночью дрон смотрит тепловизором
    const nightDr = !!S.dr && NIGHT(clockNow()); if (nightDr !== S.nightOn) { S.nightOn = nightDr; const cv = document.querySelector('canvas'); if (cv) cv.style.filter = nightDr ? 'grayscale(1) brightness(3.2) contrast(1.25)' : ''; }
    S.posT -= dt; if (S.posT <= 0) { S.posT = 2; const p = S.dr || h; share({ k: 'pos', X: Math.round(p.X), Y: Math.round(p.Y), d: S.dr ? 1 : 0 }); }
    if ((S.mapT = (S.mapT || 0) - dt) <= 0) { S.mapT = 0.25; if (!$('sjour').hidden) drawMap();  }
    { const hr = clockNow(); if (hr > 19.4 && hr < 19.6 && !S.duskWarn) { S.duskWarn = 1; K.pop('ДО ТЕМНОТЫ ЧАС', 'садитесь на базе или в лагере: ночью в горах не летают'); say('⚠ До темноты час. Ночной полёт — штраф и риск', true, 1); }
      if (hr > 6 && hr < 7) S.duskWarn = 0;
      if (NIGHT(hr) && !h.ground && !h.crash) { S.nightT = (S.nightT || 0) + dt; if (S.nightT >= 30) { S.nightT = 0; S.nightPen = (S.nightPen || 0) + 150; K.pop('−150 НОЧНОЙ ПОЛЁТ', 'темно: садитесь — дрон ночью видит тепловизором'); K.buzz([60, 40, 60]); } } }
    S.objT = (S.objT || 0) - dt; if (S.objT <= 0) { S.objT = 0.5; objective(); S.shoot = canShoot(); }
    if (S.t > 72 * 60) { say('Прошло трое суток — операция свёрнута'); end(); }
    return { lock: !!S.dr }; }
  function checkEnd() { const c = S.c; if (c.victims.every((v) => v.saved || (v.foundT !== undefined && v.dead))) setTimeout(() => S && S.on && !S.ended && end(), 1500); }

  // ---- камера дрона ----
  // вид с камеры дрона (подвес: от горизонта 0° до «смотрит вниз» 90°; по умолчанию 35°): так видит пилот -- то и попадёт в снимок
  function cam(dt) { if (!S || !S.dr) return false; const d = S.dr, fx = Math.sin(d.th), fy = Math.cos(d.th); drone.g.visible = false;
    camera.position.set(d.X, d.Z - 0.4, -d.Y); camera.up.set(0, 1, 0); const ga = (d.gim ?? 35) * Math.PI / 180, cg = Math.cos(ga) * 10; camera.lookAt(d.X + fx * cg, d.Z - Math.sin(ga) * 10 - 0.4, -(d.Y + fy * cg));
    camera.fov += (64 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); return true; }

  // ---- курс дела: что делать сейчас -- одна цель, маяк и стрелка к ней. Улики сужают круг поиска ----
  const short = (t, n = 70) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  function traces() { const c = S.c; return c.clues.filter((q) => (q.k === 'wand' || q.k === 'cairnflag' || q.k === 'cairnnote' || q.camp) && !q.key && !q.fake).sort((a, b) => a.day - b.day || (a.camp ? 1 : 0) - (b.camp ? 1 : 0)); }
  function goal(t, d, X, Y, R = 0) { S.goalTxt = { t, d }; S.area = R ? { X, Y, R } : null; K.setGoal({ t, d, X, Y, name: t }); }
  function objective() { const c = S.c; if (K.busy()) { K.setGoal(null); S.goalTxt = null; return; }
    const unf = c.victims.filter((v) => v.foundT === undefined), wait = c.victims.find((v) => v.foundT !== undefined && !v.dead && !v.saved && !v.inEvac && !v.onboard);
    if (wait) { const t = S.teams.find((q) => q.carryV === wait || q.carry === wait); return goal('Помощь пострадавшему', `${wait.name} на ${Math.round(H(wait.X, wait.Y) + ASL)} м — Ми-8 там не зависнет. ${t ? `Отряд ${t.id} ${t.carry ? 'несёт вниз' : 'идёт к нему'}.` : 'Нужен пеший отряд (🗺 → отряд → карта).'} Дрон может сбросить набор 📦 (+6 ч)`, wait.X, wait.Y); }
    if (!unf.length) return goal('Все найдены', 'Операция окончена — завершите её в деле 🗺', K.base().X, K.base().Y);
    const keys = c.clues.filter((q) => q.key && S.found.has(q.id));
    if (keys.length) { const kx = keys.reduce((a, q) => a + q.X, 0) / keys.length, ky = keys.reduce((a, q) => a + q.Y, 0) / keys.length; let v = unf[0], bd = 1e18; for (const u of unf) { const d = Math.hypot(u.X - kx, u.Y - ky); if (d < bd) { bd = d; v = u; } }
      const R = [650, 420, 260, 170][Math.min(3, keys.length - 1)], a = (v.id * 2.399 + c.seed % 7) % 6.283, X = v.X + Math.cos(a) * R * 0.45, Y = v.Y + Math.sin(a) * R * 0.45, last = keys[keys.length - 1];
      return goal('Район поиска сужен', `Улика: «${short(last.t, 60)}». Прочешите круг ${R} м: снимайте 📷 низко, 60–120 м над землёй${unf.some((q) => q.buried) ? '. Под лавиной ищут совсем низко — до 60 м' : ''}`, X, Y, R); }
    if (c.last.kind === 'ping') return goal('Точка SOS трекера', 'Летите к сигналу и снимайте 📷 вокруг: трекер ошибается до 200 м', c.last.X, c.last.Y, 250);
    const tr = traces(), knownDay = c.last.kind === 'radio' ? c.last.camp : 0, foundDay = Math.max(knownDay, ...tr.filter((q) => S.found.has(q.id)).map((q) => q.day)), next = tr.find((q) => !S.found.has(q.id) && q.day > knownDay);
    if (next) return goal(`Идём по следу группы · день ${next.day}`, `${foundDay ? `Группа точно прошла день ${foundDay}. ` : ''}Ищите их метки на маршруте дня ${next.day} (оранжевые вешки, записи в лагерях): летите вдоль пунктира низко и снимайте 📷`, next.X, next.Y, 220);
    // след обрывается не в пустоте, а на последней известной метке группы (вешка, запись в лагере); нет меток -- на последнем лагере со связью
    const lastT = tr.filter((q) => S.found.has(q.id)).pop(), camp = c.pts[Math.min(c.pts.length - 1, knownDay)], at = lastT || { X: camp.X, Y: camp.Y, t: `лагерь «${camp.n}»` };
    const nx = c.pts[Math.min(c.pts.length - 1, c.legIdx + 1)], ahead = nx ? `в сторону «${nx.n}»` : 'дальше по маршруту';
    return goal('След обрывается', `Последнее, что знаем о группе: ${lastT ? `«${short(lastT.t, 60)}»` : `${at.t} (день ${c.legIdx + 1})`}. Дальше меток нет — что-то случилось. Осмотрите склоны от этой точки ${ahead}: палатку, следы, снаряжение. Снимайте 📷`, at.X, at.Y, 700); }
  // есть ли что-то в кадре, что снимок, скорее всего, найдёт -- подсказка «СНИМАЙ!»
  function canShoot() { const from = S.dr || K.heli(), agl = from.Z - H(from.X, from.Y), night = NIGHT(clockNow()), kind = S.dr ? 'drone' : 'heli', zk = !S.dr && K.vfOn && K.vfOn() ? 1 + (K.vfZoom() - 1) * 0.4 : 1; camera.updateMatrixWorld();
    const look = (X, Y, z) => { v3.set(X, z + 1, -Y).project(camera); return v3.z < 1 && Math.abs(v3.x) < 0.8 && Math.abs(v3.y) < 0.76; };
    for (const q of S.c.clues) { if (S.found.has(q.id) || q.marker) continue; /* туры -- не повод мигать «снимай» */ const z = H(q.X, q.Y), d = Math.hypot(q.X - from.X, q.Y - from.Y, z - from.Z) / zk; if (d < 400 && pod(q, d, agl, night, kind) > 0.4 && look(q.X, q.Y, z)) return true; }
    for (const v of S.c.victims) { if (v.foundT !== undefined) continue; const z = H(v.X, v.Y), d = Math.hypot(v.X - from.X, v.Y - from.Y, z - from.Z) / zk; if (d < 400 && pod({ ...v, buried: v.buried || v.pose === 'crev' }, d, agl, night, kind) > 0.4 && look(v.X, v.Y, z)) return true; }
    return false; }

  // ---- приборы ----
  function hud() { if (!S || !S.on) return; const el = $('sclock'); if (!S.run) { el.hidden = true; return; } el.hidden = false;
    const sc = scoreOf(tally()), tb = Math.max(0, Math.round(1800 - S.t * 2.5));
    const hurt = S.c.victims.filter((v) => v.foundT !== undefined && !v.dead && !v.saved).map((v) => ({ v, m: Math.max(0, v.left + (v.kit ? 360 : 0) - (v.foundT + (S.t - v.foundT) / 3)) * 3 })).sort((a, b) => a.m - b.m).slice(0, 1).map(({ v, m }) => `🩺 ${v.name} продержится <span class="${m < 120 ? 'sbad' : ''}">${fmtT(m)}</span>`).join('');
    const since = (S.c.since + S.t) / 60, hope = since < 12 ? '<span class="sok">высокий</span>' : since < 30 ? 'средний' : '<span class="sbad">низкий</span>', hr = clockNow();
    const nf = S.c.victims.filter((v) => v.foundT !== undefined).length, hhmm = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor(hr % 1 * 60)).padStart(2, '0')}${NIGHT(hr) ? ' 🌙' : ''}`;
    // коротко: время, очки, находки; вторая строка -- только когда кто-то ждёт помощи (самый срочный). Подробности -- в деле (🗺)
    const t = `<b>Т+ ${fmtT(S.t)}</b> · ${hhmm} · <b style="color:#ffd24a">${sc.total}</b> оч · 🔎${S.found.size} · 👤${nf}/${S.c.victims.length}${S.rescuerLost ? ` · <span class="sbad">−${S.rescuerLost}</span>` : ''}${hurt ? `<br>${hurt}` : `<span class="sdet"><br>шанс найти живыми: ${hope} · за время ещё +${tb}</span>`}`;
    if (el.innerHTML !== t) el.innerHTML = t;
    if (S.dr) { const d = S.dr, L = Math.hypot(d.X - d.L.X, d.Y - d.L.Y), tx = `ДРОН · батарея ${Math.max(0, Math.round(d.bat * 100))}% · ${Math.round(d.Z - H(d.X, d.Y))} м над землёй · ${(L / 1000).toFixed(1)} км${NIGHT(hr) ? ' · ТЕПЛОВИЗОР' : ''}`; const b = $('sframe').firstChild; if (b.textContent !== tx) b.textContent = tx;  const gs = $('sgim').querySelector('span'), gt = `камера\n${Math.round(d.gim ?? 35)}°`; if (gs.textContent !== gt) { gs.textContent = gt; gs.style.whiteSpace = 'pre'; } }
    document.body.classList.toggle('slearn', S.t < 25 || !store.get('sarDone')); // подписи кнопок -- в начале операции и в первом деле
    $('sphoto').classList.toggle('pulse', !!S.shoot); { const sh = $('sshoot'); sh.hidden = !S.shoot; }
    const dl = $('sdrone'); dl.hidden = !S.res.drone; dl.classList.toggle('on', !!S.dr); { const why = S.dr ? '' : droneWhy(), t = S.dr ? `${QC}<small>домой</small>` : `${QC}<small>${why || 'дрон · ' + S.bats}</small>`; dl.classList.toggle('off', !!why); if (dl.innerHTML !== t) dl.innerHTML = t; if (why) dl.querySelector('small').style.display = 'block'; } // недоступен -- видно почему
    { const q = fastTarget(), h = K.heli(), fb = $('sfast'), far = q && !S.dr && Math.hypot(q.X - h.X, q.Y - h.Y) > 1500; fb.hidden = !far; if (far) { const t = `⏩<small>к цели · ${Math.round(Math.hypot(q.X - h.X, q.Y - h.Y) / 3300 + 2)} мин</small>`; if (fb.innerHTML !== t) fb.innerHTML = t; } }
    const a = actLabel(), ab = $('sact'); ab.hidden = !a; if (a && ab.innerHTML !== a) ab.innerHTML = a; }

  // ---- дело: карта (рельеф района), маршрут по дням, улики, люди, отряды, заметки, лог ----
  function bbox() { const c = S.c; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of c.pts) { x0 = Math.min(x0, p.X); x1 = Math.max(x1, p.X); y0 = Math.min(y0, p.Y); y1 = Math.max(y1, p.Y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2 + 4500; return { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R }; }
  // рельеф в духе советской топокарты: бумага, отмывка с северо-запада, горизонтали через 100 м (каждая пятая -- утолщённая с отметкой),
  // ледники и фирн -- белые с синими горизонталями, скалы -- серо-коричневые, ниже 3000 м -- зелень
  function relief(B, N) { const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), img = x.createImageData(N, N), k = (B.x1 - B.x0) / N, M = N + 1, Z = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) Z[j * M + i] = H(B.x0 + i * k, B.y1 - j * k) + ASL;
    const CI = 100, lab = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const z = Z[j * M + i], zr = Z[j * M + i + 1], zd = Z[(j + 1) * M + i], sx = (zr - z) / k, sy = (z - zd) / k, sl = Math.hypot(sx, sy), o = (j * N + i) * 4;
      const ice = z > 4000 && sl < 0.75 || z > 4600 && sl < 1.0, rock = !ice && z > 3300 && sl > 0.55;
      let r = 244, g = 238, bl = 220; // бумага
      if (ice) { r = 246; g = 250; bl = 252; } else if (rock) { r = 226; g = 214; bl = 196; } else if (z < 3000) { r = 222; g = 236; bl = 200; }
      const sh = Math.max(0.72, Math.min(1.06, 0.94 + (-sx - sy) * 0.12)); r *= sh; g *= sh; bl *= sh;
      const c0 = Math.floor(z / CI), c1 = Math.floor(zr / CI), c2 = Math.floor(zd / CI);
      if (c0 !== c1 || c0 !== c2) { const top = Math.max(c0, c1, c2), idx = top % 5 === 0, a = idx ? 0.95 : 0.6; const [cr, cg, cb] = ice ? [40, 110, 190] : [150, 85, 40];
        r = r * (1 - a) + cr * a; g = g * (1 - a) + cg * a; bl = bl * (1 - a) + cb * a; if (idx && (i * 7 + j * 13) % 9973 === 0) lab.push([i, j, top * CI]); }
      if (rock && (i + j) % 6 === 0 && sl > 0.9) { r *= 0.8; g *= 0.78; bl *= 0.76; } // штриховка скал
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = bl; img.data[o + 3] = 255; }
    x.putImageData(img, 0, 0);
    // утолщаем индексные горизонтали вторым проходом -- по отметке 500 м
    x.fillStyle = 'rgba(150,85,40,.55)'; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const z = Z[j * M + i], zr = Z[j * M + i + 1], zd = Z[(j + 1) * M + i]; if (Math.floor(z / 500) !== Math.floor(zr / 500) || Math.floor(z / 500) !== Math.floor(zd / 500)) x.fillRect(i - 0.5, j - 0.5, 1.6, 1.6); }
    // отметки высот на вершинах -- как на топокарте: точка и число
    x.font = 'italic 700 11px Georgia,serif'; x.textAlign = 'left'; let marks = 0; const S2 = 48;
    for (let j = S2 / 2; j < N && marks < 14; j += S2) for (let i = S2 / 2; i < N; i += S2) { let bi = i, bj = j; for (let q = 0; q < 6; q++) { let best = Z[bj * M + bi], ni = bi, nj = bj; for (let dj = -4; dj <= 4; dj += 2) for (let di = -4; di <= 4; di += 2) { const ii = bi + di, jj = bj + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const v = Z[jj * M + ii]; if (v > best) { best = v; ni = ii; nj = jj; } } if (ni === bi && nj === bj) break; bi = ni; bj = nj; }
      const z = Z[bj * M + bi]; let peak = z > 4800; for (let dj = -14; dj <= 14 && peak; dj += 7) for (let di = -14; di <= 14; di += 7) { const ii = bi + di, jj = bj + dj; if (ii >= 0 && jj >= 0 && ii < N && jj < N && Z[jj * M + ii] > z) { peak = false; break; } }
      if (peak && !lab.some((l) => l.pk && Math.hypot(l[0] - bi, l[1] - bj) < 40)) { const t = String(Math.round(z)); lab.push(Object.assign([bi, bj, 0], { pk: 1 })); x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(bi, bj, 1.8, 0, 7); x.fill(); x.strokeStyle = 'rgba(246,240,224,.85)'; x.lineWidth = 3; x.strokeText(t, bi + 4, bj - 3); x.fillText(t, bi + 4, bj - 3); marks++; } }
    x.font = 'italic 9px Georgia,serif'; x.fillStyle = 'rgb(140,80,38)'; for (const [i, j, z] of lab) if (z) { x.save(); x.translate(i, j); x.fillStyle = 'rgba(244,238,220,.9)'; x.fillRect(-11, -6, 22, 10); x.fillStyle = 'rgb(140,80,38)'; x.textAlign = 'center'; x.fillText(String(z), 0, 2); x.restore(); }
    return cv; }
  // вид карты: центр и половина ширины (м); по умолчанию -- весь маршрут. Рельеф рисуется один раз и растягивается по виду
  const homeView = () => { const B = bbox(); return { cx: (B.x0 + B.x1) / 2, cy: (B.y0 + B.y1) / 2, R: (B.x1 - B.x0) / 2 }; };
  // километровая сетка, как на топокарте: тонкие линии каждые 1-2 км, подписи у рамки (только в деле)
  function grid(x, B, P, N, u, mini) { const span = B.x1 - B.x0, st = span > 14000 ? 2000 : span > 5000 ? 1000 : 500; x.strokeStyle = 'rgba(30,40,60,.28)'; x.lineWidth = Math.max(1, 0.8 * u); x.beginPath();
    for (let X = Math.ceil(B.x0 / st) * st; X < B.x1; X += st) { const [a] = P(X, 0); x.moveTo(a, 0); x.lineTo(a, N); }
    for (let Y = Math.ceil(B.y0 / st) * st; Y < B.y1; Y += st) { const [, b] = P(0, Y); x.moveTo(0, b); x.lineTo(N, b); } x.stroke();
    if (mini) return; x.font = `italic ${9 * u}px Georgia,serif`; x.fillStyle = 'rgba(30,40,60,.75)'; x.textAlign = 'left';
    for (let X = Math.ceil(B.x0 / st) * st; X < B.x1; X += st) { const [a] = P(X, 0); x.fillText(String(((Math.round(X / 1000) + 50) % 100 + 100) % 100).padStart(2, '0'), a + 2 * u, 10 * u); }
    for (let Y = Math.ceil(B.y0 / st) * st; Y < B.y1; Y += st) { const [, b] = P(0, Y); x.fillText(String(((Math.round(Y / 1000) + 50) % 100 + 100) % 100).padStart(2, '0'), 2 * u, b - 2 * u); }
    x.strokeStyle = '#1d1d1d'; x.lineWidth = 2 * u; x.strokeRect(u, u, N - 2 * u, N - 2 * u); }
  function drawMap(cv = $('smap'), view = S.view, mini = false) { if (!cv || !S) return; const Wc = cv.clientWidth || cv._w || (mini ? 150 : 360), dpr = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(Wc * dpr)) { cv.width = cv.height = Math.round(Wc * dpr); }
    const HB = bbox(); if (!mapImg) mapImg = relief(HB, 512); view = view || (S.view = homeView());
    const B = { x0: view.cx - view.R, x1: view.cx + view.R, y0: view.cy - view.R, y1: view.cy + view.R }, x = cv.getContext('2d'), N = cv.width, P = (X, Y) => [(X - B.x0) / (B.x1 - B.x0) * N, (B.y1 - Y) / (B.y1 - B.y0) * N], u = N / (mini ? 190 : 360), m2p = N / (B.x1 - B.x0);
    x.fillStyle = '#efe6cc'; x.fillRect(0, 0, N, N); { const [a, b] = P(HB.x0, HB.y1), [c2, d2] = P(HB.x1, HB.y0); x.drawImage(mapImg, a, b, c2 - a, d2 - b); } const c = S.c;
    grid(x, B, P, N, u, mini);
    // маршрут по плану: дни
    x.lineWidth = 3 * u; x.strokeStyle = 'rgba(200,30,40,.85)'; x.setLineDash([8 * u, 6 * u]); x.beginPath(); c.pts.forEach((p, i) => { const [a, b] = P(p.X, p.Y); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); x.setLineDash([]);
    x.font = `italic 700 ${12 * u}px Georgia,serif`; x.textAlign = 'left'; c.pts.forEach((p, i) => { const [a, b] = P(p.X, p.Y); x.fillStyle = '#c81e28'; x.strokeStyle = '#fff8e6'; x.lineWidth = 1.5 * u; x.beginPath(); x.arc(a, b, 4 * u, 0, 7); x.fill(); x.stroke(); if (mini) return; x.fillStyle = '#7a0f16'; x.strokeStyle = 'rgba(246,240,224,.92)'; x.lineWidth = 3 * u; const t = i ? `Д${i} · ${p.n}` : p.n; x.strokeText(t, a + 6 * u, b - 4 * u); x.fillText(t, a + 6 * u, b - 4 * u); });
    if (c.last.kind === 'ping') { const [a, b] = P(c.last.X, c.last.Y); x.strokeStyle = '#1f5fbf'; x.lineWidth = 2 * u; x.beginPath(); x.arc(a, b, Math.max(4 * u, 200 * m2p), 0, 7); x.stroke(); if (!mini) { x.fillStyle = '#1f5fbf'; x.fillText('SOS трекера', a + 6 * u, b + 14 * u); } }
    if (c.last.kind === 'radio' && !mini) { const [a, b] = P(c.last.X, c.last.Y); x.strokeStyle = '#1f5fbf'; x.lineWidth = 2 * u; x.beginPath(); x.arc(a, b, 9 * u, 0, 7); x.stroke(); x.fillStyle = '#1f5fbf'; x.fillText('последняя связь', a + 8 * u, b + 14 * u); }
    if (S.area) { const [a, b] = P(S.area.X, S.area.Y), r = Math.max(5 * u, S.area.R * m2p); x.fillStyle = 'rgba(200,30,40,.08)'; x.strokeStyle = '#c81e28'; x.lineWidth = 2.5 * u; x.setLineDash([6 * u, 5 * u]); x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); x.stroke(); x.setLineDash([]); if (!mini) { x.fillStyle = '#9a0f18'; x.font = `italic 700 ${11 * u}px Georgia,serif`; x.textAlign = 'center'; x.fillText('искать здесь', a, b - r - 4 * u); } }
    else if (S.goalTxt && K.goal()) { const g = K.goal(), [a, b] = P(g.X, g.Y); x.fillStyle = '#ff8a2a'; x.beginPath(); x.arc(a, b, 6 * u, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 2 * u; x.stroke(); }
    x.font = `${14 * u}px serif`; x.textAlign = 'center'; for (const q of c.clues) if (S.found.has(q.id)) { const [a, b] = P(q.X, q.Y); x.globalAlpha = q.fake ? 0.45 : 1; x.fillText(CLUEICON[q.k] || '•', a, b + 5 * u); x.globalAlpha = 1; }
    for (const v of c.victims) if (v.foundT !== undefined) { const [a, b] = P(v.X, v.Y); x.fillStyle = v.saved ? '#2e9a3c' : v.dead ? '#6a6a6a' : '#16c43a'; x.strokeStyle = '#1d1d1d'; x.lineWidth = 1.5 * u; x.beginPath(); x.arc(a, b, 6 * u, 0, 7); x.fill(); x.stroke(); if (!mini) { x.fillStyle = '#1d1d1d'; x.font = `italic 700 ${11 * u}px Georgia,serif`; x.fillText(v.name + (v.dead ? ' ✖' : v.saved ? ' ✓' : ''), a, b - 9 * u); x.font = `${14 * u}px serif`; } }
    for (const n of S.notes) { const [a, b] = P(n.X, n.Y); x.fillStyle = '#ffe14a'; x.strokeStyle = '#3a2a00'; x.lineWidth = 1.5 * u; x.beginPath(); x.moveTo(a, b); x.lineTo(a - 6 * u, b - 14 * u); x.lineTo(a + 6 * u, b - 14 * u); x.closePath(); x.fill(); x.stroke();
      if (!mini) { x.font = `italic 700 ${11 * u}px Georgia,serif`; const t = (n.n && n.n !== 'вы' ? n.n + ': ' : '') + n.txt.slice(0, 28); x.lineWidth = 3 * u; x.strokeStyle = 'rgba(246,240,224,.92)'; x.strokeText(t, a, b - 18 * u); x.fillText(t, a, b - 18 * u); } }
    for (const t of S.teams) if (t.n > 0 && !t.onboard) { const [a, b] = P(t.X, t.Y); if (t.tgt) { const [e, f] = P(t.tgt[0], t.tgt[1]); x.strokeStyle = 'rgba(31,95,191,.9)'; x.lineWidth = 2 * u; x.setLineDash([4 * u, 4 * u]); x.beginPath(); x.moveTo(a, b); x.lineTo(e, f); x.stroke(); x.setLineDash([]); }
      x.fillStyle = S.selTeam === t.id ? '#fff' : '#1f5fbf'; x.fillRect(a - 5 * u, b - 5 * u, 10 * u, 10 * u); if (!mini) { x.fillStyle = '#1d1d1d'; x.font = `italic 700 ${10 * u}px Georgia,serif`; x.fillText(`О${t.id}·${t.n}`, a, b + 16 * u); } }
    for (const [n, p] of S.peers) if (performance.now() - p.t < 8000) { const [a, b] = P(p.X, p.Y); x.fillStyle = '#c78bff'; x.beginPath(); x.arc(a, b, 5 * u, 0, 7); x.fill(); if (!mini) x.fillText(n, a, b - 8 * u); }
    if (S.dr) { const [e, f] = P(S.dr.X, S.dr.Y), [g0, g1] = P(S.dr.L.X, S.dr.L.Y); x.strokeStyle = 'rgba(80,220,255,.5)'; x.lineWidth = 1.5 * u; x.beginPath(); x.arc(g0, g1, 6000 * m2p, 0, 7); x.stroke(); x.fillStyle = '#5df'; x.beginPath(); x.arc(e, f, 5 * u, 0, 7); x.fill(); if (!mini) { x.fillStyle = '#5df'; x.fillText('дрон', e, f - 9 * u); } }
    // вы: вертолёт -- оранжевая стрелка по курсу с пульсом; вне карты -- стрелка у края (на радаре её рисует сам радар, каждый кадр)
    if (mini === 'radar') return;
    const h = K.heli(); let [a, b] = P(h.X, h.Y); const out = a < 0 || b < 0 || a > N || b > N; if (out) { a = Math.max(10 * u, Math.min(N - 10 * u, a)); b = Math.max(10 * u, Math.min(N - 10 * u, b)); }
    const pr = (performance.now() / 1000 % 1.2) / 1.2; x.strokeStyle = `rgba(255,106,26,${1 - pr})`; x.lineWidth = 3 * u; x.beginPath(); x.arc(a, b, (8 + pr * 18) * u, 0, 7); x.stroke();
    x.save(); x.translate(a, b); x.rotate(h.th); x.fillStyle = '#ff6a1a'; x.strokeStyle = '#fff'; x.lineWidth = 2 * u; x.beginPath(); x.moveTo(0, -11 * u); x.lineTo(7 * u, 8 * u); x.lineTo(0, 4 * u); x.lineTo(-7 * u, 8 * u); x.closePath(); x.fill(); x.stroke(); x.restore();
    x.font = `italic 900 ${11 * u}px Georgia,serif`; x.textAlign = 'center'; x.lineWidth = 3 * u; x.strokeStyle = 'rgba(246,240,224,.95)'; x.fillStyle = '#c84a00'; const lab = out ? 'ВЫ ↗' : 'ВЫ'; x.strokeText(lab, a, b + 22 * u); x.fillText(lab, a, b + 22 * u);
    if (mini) { x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.strokeRect(1, 1, N - 2, N - 2); x.fillStyle = '#1d1d1d'; x.font = `italic 700 ${10 * u}px Georgia,serif`; x.textAlign = 'left'; x.fillText('С ↑', 5 * u, 13 * u); x.textAlign = 'right'; x.fillText(`${(view.R * 2 / 1000).toFixed(0)} км`, N - 5 * u, N - 6 * u); } }
  function course() { const c = S.c, tr = traces(), got = tr.filter((q) => S.found.has(q.id)).length, keyF = c.clues.some((q) => q.key && S.found.has(q.id)), fv = c.victims.filter((v) => v.foundT !== undefined).length, n = c.victims.length;
    const li = (ok, t) => `<div>${ok ? '✅' : '⬜'} ${t}</div>`, g = S.goalTxt;
    return `<h3>Курс дела</h3>${g ? `<p style="background:rgba(255,138,42,.18);border-radius:10px;padding:6px 10px"><b>Сейчас: ${g.t}</b><br>${g.d}</p>` : ''}
      ${li(true, `Известно: ${c.last.kind === 'ping' ? 'точка SOS трекера' : c.last.kind === 'radio' ? `связь была из «${c.pts[c.last.camp].n}»` : 'только план маршрута'}`)}${li(got === tr.length && tr.length > 0, `След группы по маршруту: найдено меток ${got} из ${tr.length}`)}${li(keyF, 'Место происшествия: что случилось?')}${li(fv === n, `Люди найдены: ${fv} из ${n}`)}${li(S.saved > 0 && c.victims.every((v) => v.saved || v.dead), `Живые доставлены на базу: ${S.saved}`)}`; }
  // дело: курс, карта (масштаб щипком/колесом, сдвиг перетаскиванием, касание -- заметка или цель отряда), улики, заметки, журнал
  function parts() { const c = S.c;
    const clues = c.clues.filter((q) => S.found.has(q.id)).map((q) => `<div>${CLUEICON[q.k] || ''} ${q.fake ? '<small>' : ''}${q.t}${q.fake ? '</small>' : ''}</div>`).join('') || '<small>Пока ничего. Снимайте 📷 низко над маршрутом — вешки, палатки, следы</small>';
    const notes = S.notes.map((n, i) => `<div data-n="${i}" style="cursor:pointer">📌 ${n.txt} <small>${n.n && n.n !== 'вы' ? '— ' + n.n : ''}</small></div>`).join('') || '<small>Нет заметок. Включите «📌 Заметка» и коснитесь карты</small>';
    const log = S.log.slice(0, 14).map((l) => `<div><i>Т+${fmtT(l.t)}</i> ${l.txt}</div>`).join('');
    const photos = (S.photos || []).slice().reverse().map((p) => `<figure class="ph">${p.thumb ? `<img src="${p.thumb}" alt="">` : '<div class="nop">нет кадра</div>'}<figcaption><i>${p.hh}</i> <small>№${p.id.split('-ф')[1]}</small>${p.brg !== null && p.brg !== undefined ? ` · курс ${p.brg}°` : ''}${p.zoom >= 1.5 ? ` · ${Math.round(p.zoom)}×` : ''}${p.drone ? ' · дрон' : ''} · ${p.alt} м${p.range ? ` · до склона ${p.range} м` : ''}<br>${p.caps.length ? p.caps.join('<br>') : '<small>ничего примечательного</small>'}</figcaption></figure>`).join('') || '<small>Снимков нет. 📷 — фотоаппарат с зумом до 24×: всё в кадре попадёт сюда с подписями</small>';
    return { course: course(), clues, notes, log, photos }; }
  function refreshJournal() { if (!S || $('sjour').hidden) return; const p = parts(); for (const [id, k] of [['scourse', 'course'], ['sclues', 'clues'], ['snotes', 'notes'], ['slog', 'log']]) { const el = $(id); if (el && el.innerHTML !== p[k]) el.innerHTML = p[k]; } const pe = $('sphotos'), pn = (S.photos || []).length; if (pe && pe.dataset.n !== String(pn)) { pe.innerHTML = p.photos; pe.dataset.n = pn; } bindNotes(); } // фотоархив -- только когда прибавился кадр (миниатюры тяжёлые)
  function bindNotes() { for (const d of document.querySelectorAll('#snotes [data-n]')) d.onclick = () => { const n = S.notes[+d.dataset.n]; if (n) { S.view.cx = n.X; S.view.cy = n.Y; S.view.R = Math.min(S.view.R, 1500); drawMap(); } }; }
  function modeHint() { return S.selTeam > 0 ? `Касание карты — <b>отряд ${S.selTeam} пойдёт туда</b>` : 'Касание карты — <b>поставить заметку</b> (видят все участники). Двумя пальцами или колесом — масштаб, перетаскиванием — сдвиг'; }
  function journal(open) { if (!S) return; const el = $('sjour'); if (!open) { el.hidden = true; return; } const c = S.c; el.hidden = false; if (!S.view) S.view = homeView(); const p = parts();
    el.innerHTML = `<button class="x" id="sjx">✕</button><h2>Дело № ${c.code}</h2><p style="margin:0"><small>Сегодня ${dateOf(G.day || 0, true)} · группа вышла ${dateOf(c.cal.day1)} · тревога ${dateOf(Math.floor(c.cal.alarmAbs / 24))}, ${hhmm(c.cal.alarmAbs)}</small></p><p><small>${c.routeName} · ${c.comm.name}. ${c.last.txt}</small></p>
      <div id="scourse">${p.course}</div>
      <div class="row" id="smode" style="margin-top:8px"><button class="ch" data-t="0" aria-pressed="${S.selTeam <= 0}">📌 Заметка</button>${S.teams.map((t) => `<button class="ch" data-t="${t.id}" aria-pressed="${S.selTeam === t.id}">🧗 Отряд ${t.id}<small>${t.n} чел${t.onboard ? ' · на борту' : t.carry ? ' · несут' : t.tgt ? ' · в пути' : ' · ждёт'}</small></button>`).join('')}</div>
      <p style="margin:6px 0 0"><small id="smodeh">${modeHint()}</small></p>
      <div style="position:relative"><canvas id="smap"></canvas>
        <div style="position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:6px">${['＋', '－', '⊙', '⤢'].map((t, i) => `<button class="ch" data-z="${i}" style="flex:none;min-width:0;width:40px;height:40px;padding:0;font-size:20px" title="${['ближе', 'дальше', 'ко мне', 'весь маршрут'][i]}">${t}</button>`).join('')}</div>
        <div id="snoteb" hidden style="position:absolute;left:8px;right:56px;top:8px;background:rgba(8,22,48,.95);border:2px solid #ffd24a;border-radius:12px;padding:8px;display:flex;gap:6px"><input id="snote" maxlength="80" placeholder="заметка: что здесь?" style="flex:1;width:auto;text-transform:none" enterkeyhint="done"><button class="ch" id="snoteok" style="flex:none">OK</button><button class="ch" id="snotex" style="flex:none">✕</button></div></div>
      <details class="bmat"><summary>Материалы дела — группа, маршрут, хронология, связь</summary>${materials()}</details><h3>Заметки</h3><div id="snotes">${p.notes}</div><h3>Улики</h3><div id="sclues">${p.clues}</div><h3>Фотоархив</h3><div id="sphotos">${p.photos}</div><h3>Журнал операции</h3><div id="slog">${p.log}</div>
      <button class="ch" id="stoon2" style="width:100%;margin-top:12px">🎬 Как это работает — ролик с Дымком</button><button class="go" id="send" style="background:#3a4a66;color:#fff;font-size:15px">Завершить операцию</button>`;
    $('sjx').onclick = () => journal(false); $('sphotos').dataset.n = String((S.photos || []).length); $('sphotos').onclick = (e) => { const f = e.target.closest('figure'); if (f) f.classList.toggle('big'); }; $('stoon2').onclick = () => film(); bindNotes();
    for (const b of el.querySelectorAll('#smode button')) b.onclick = () => { S.selTeam = +b.dataset.t || -1; for (const q of el.querySelectorAll('#smode button')) q.setAttribute('aria-pressed', q === b); $('smodeh').innerHTML = modeHint(); drawMap(); };
    $('send').onclick = () => { if (S.confirmEnd) end(); else { S.confirmEnd = 1; $('send').textContent = 'Точно свернуть поиск? Нажмите ещё раз'; } };
    const zoom = (k, fx = 0.5, fy = 0.5) => { const v = S.view, hv = homeView(), R = Math.max(250, Math.min(hv.R * 1.3, v.R * k)), X = v.cx + (fx - 0.5) * 2 * v.R, Y = v.cy - (fy - 0.5) * 2 * v.R; v.cx = X - (fx - 0.5) * 2 * R; v.cy = Y + (fy - 0.5) * 2 * R; v.R = R; drawMap(); };
    for (const b of el.querySelectorAll('[data-z]')) b.onclick = () => { const i = +b.dataset.z; if (i === 0) zoom(0.6); else if (i === 1) zoom(1.6); else if (i === 2) { const h = S.dr || K.heli(); S.view.cx = h.X; S.view.cy = h.Y; S.view.R = Math.min(S.view.R, 2500); drawMap(); } else { S.view = homeView(); drawMap(); } };
    const cv = $('smap'), pts = new Map(); let moved = false, pin = null;
    const at = (e) => { const r = cv.getBoundingClientRect(), v = S.view; return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, X: v.cx + ((e.clientX - r.left) / r.width - 0.5) * 2 * v.R, Y: v.cy - ((e.clientY - r.top) / r.height - 0.5) * 2 * v.R }; };
    cv.onpointerdown = (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* без захвата */ } pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); if (pts.size === 1) moved = false;
      if (pts.size === 2) { const [p1, p2] = [...pts.values()]; pin = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), R: S.view.R }; moved = true; } };
    cv.onpointermove = (e) => { const p = pts.get(e.pointerId); if (!p) return; const r = cv.getBoundingClientRect(), mpp = 2 * S.view.R / r.width;
      if (pts.size === 1) { if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) moved = true; if (moved) { S.view.cx -= (e.clientX - p.x) * mpp; S.view.cy += (e.clientY - p.y) * mpp; drawMap(); } }
      p.x = e.clientX; p.y = e.clientY; if (pts.size === 2 && pin) { const [p1, p2] = [...pts.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y), hv = homeView(); S.view.R = Math.max(250, Math.min(hv.R * 1.3, pin.R * pin.d / Math.max(20, d))); drawMap(); } };
    const upf = (e) => { const was = pts.size, p = pts.get(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) pin = null; if (was === 1 && p && !moved && e.type === 'pointerup') tapMap(at(e)); };
    cv.onpointerup = upf; cv.onpointercancel = upf;
    cv.onwheel = (e) => { e.preventDefault(); const q = at(e); zoom(Math.exp(e.deltaY * 0.0015), q.fx, q.fy); };
    requestAnimationFrame(() => drawMap()); }
  function tapMap({ X, Y }) {
    if (S.selTeam > 0) { const t = S.teams.find((q) => q.id === S.selTeam); if (t && t.n > 0 && !t.onboard) { t.tgt = [X, Y]; say(`Отряд ${t.id} выходит к точке (${(Math.hypot(X - t.X, Y - t.Y) / 1000).toFixed(1)} км)`, false); drawMap(); } else toast(t && t.onboard ? 'Отряд на борту — сядьте и высадите его (🧗)' : 'Отряда нет'); return; }
    const nb = $('snoteb'), inp = $('snote'); nb.hidden = false; inp.value = ''; S.pendNote = { X, Y }; drawMap(); setTimeout(() => inp.focus(), 30);
    const ok = () => { const txt = inp.value.trim(), q = S.pendNote; if (txt && q) { S.notes.push({ X: q.X, Y: q.Y, txt, n: 'вы' }); share({ k: 'note', X: Math.round(q.X), Y: Math.round(q.Y), txt }); toast('Заметка на карте — её видят все участники'); } S.pendNote = null; nb.hidden = true; refreshJournal(); drawMap(); };
    $('snoteok').onclick = ok; $('snotex').onclick = () => { S.pendNote = null; nb.hidden = true; drawMap(); }; inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); }; }

  // ---- итог: правда о происшествии, очки ----
  function tally() { const c = S.c; return { saved: S.saved, alive: c.victims.filter((v) => v.alive0).length, aliveFound: c.victims.filter((v) => v.foundT !== undefined && !v.dead && !v.saved).length, dead: c.victims.filter((v) => v.foundT !== undefined && v.dead).length,
    clues: [...S.found].filter((i) => !c.clues[i].fake).length, minutes: S.t, rescuerLost: S.rescuerLost, droneLost: S.droneLost, heliCrash: !!K.heli().crash, comm: c.comm,
    extra: [[`горячий след`, S.hot || 0], ['ночные полёты', -(S.nightPen || 0)]] }; }
  function end() { if (!S || S.ended) return; S.ended = true; S.run = false; G.spyMore = null; journal(false); if (S.dr) { S.dr = null; drone.g.visible = false; } $('sframe').hidden = true; document.body.classList.remove('sardr', 'sarrun', 'slearn'); $('sbtns').hidden = true; $('sclock').hidden = true; $('smini').hidden = true; const c = S.c;
    const o = tally();
    const sc = scoreOf(o), rec = sc.total > (store.get('sarBest') || 0); if (rec) store.set('sarBest', sc.total); store.set('sarDone', 1); const rc = store.get('sarRecent') || []; rc.push(c.scen); store.set('sarRecent', rc.slice(-6));
    const truth = c.victims.map((v) => `${v.name}: ${v.saved ? gw(v, 'спасён', 'спасена') : v.foundT !== undefined ? (v.dead ? gw(v, 'найден погибшим', 'найдена погибшей') : gw(v, 'найден живым, но не эвакуирован', 'найдена живой, но не эвакуирована')) : v.alive0 && !v.dead ? gw(v, 'не найден — а был ещё жив…', 'не найдена — а была ещё жива…') : gw(v, 'не найден', 'не найдена')}`).join(' · ');
    $('rh').textContent = `${'★'.repeat(sc.stars)}${'☆'.repeat(3 - sc.stars)} ${sc.total} очков${rec ? ' · рекорд!' : ''}`;
    $('rs').innerHTML = `<b>Что случилось:</b> ${c.cause}. <small>${c.real}</small><br>${truth}`;
    $('rt').innerHTML = sc.parts.map(([t, v]) => `<tr><td>${t}</td><td style="text-align:right">${v > 0 ? '+' : ''}${v}</td></tr>`).join('') + (sc.k > 1 ? `<tr><td>сложность: ${c.comm.name}</td><td style="text-align:right">×${sc.k}</td></tr>` : '');
    { const ph = (S.photos || []).filter((p) => p.thumb && p.items.some((it) => it.isNew)).slice(-6); if (ph.length) $('rs').innerHTML += `<div style="display:flex;gap:6px;overflow-x:auto;margin-top:8px">${ph.map((p) => `<figure style="margin:0;flex:none;width:120px;font-size:11px"><img src="${p.thumb}" style="width:120px;border-radius:6px;display:block"><figcaption>${p.hh} · ${p.items.filter((it) => it.isNew).map((it) => it.title).join(', ')}</figcaption></figure>`).join('')}</div><small>Снимки дела — ${(S.photos || []).length}, все в «Фотоархиве»</small>`; } // итог: кадры, на которых были находки
    $('ragain').textContent = 'Новое дело'; setTimeout(() => { if (S && S.on) $('result').hidden = false; }, 600); }
  function stop() { if (!S) return; S.on = false; G.spyMore = null; stopWorld(); if (drone) drone.g.visible = false; if (ping) ping.visible = false; $('sarw').hidden = true; if ($('harr')) $('harr').style.top = ''; const cv = document.querySelector('canvas'); if (cv) cv.style.filter = ''; NETHOOK.sar = null; document.body.classList.remove('sardr', 'sarrun', 'slearn'); const n = net(); if (n && n.sarLeave) n.sarLeave(); S = null; }
  // основа радара (правый верхний угол, рисует helimode): топокарта вокруг точки, без своей стрелки и подписей
  // для полосы миссии: найдено людей / всего и самый срочный найденный (сколько продержится)
  function stripInfo() { if (!S || !S.run) return ''; const c = S.c, nf = c.victims.filter((v) => v.foundT !== undefined).length; let u = '';
    const hurt = c.victims.filter((v) => v.foundT !== undefined && !v.dead && !v.saved).map((v) => Math.max(0, v.left + (v.kit ? 360 : 0) - (v.foundT + (S.t - v.foundT) / 3)) * 3).sort((a, b) => a - b)[0];
    if (hurt !== undefined) u = `<span class="u${hurt < 120 ? ' bad' : ''}">🩺${fmtT(hurt)}</span>`;
    // часы операции -- всегда на виду: «время тикает» -- главное давление режима; за час до темноты -- жёлтые, ночью -- красные
    const hr = clockNow(), hh = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor(hr % 1 * 60)).padStart(2, '0')}`, dk = NIGHT(hr) ? ' bad' : hr > 19.5 ? '' : null;
    const dd = new Date(START + Math.floor(G.day || 0) * 86400000), ds = `${dd.getUTCDate()}.${String(dd.getUTCMonth() + 1).padStart(2, '0')}`;
    return `<span class="c">👤${nf}/${c.victims.length}</span>${u}<span class="${dk === null ? 'k' : 'u' + dk}">${NIGHT(hr) ? '🌙' : '🕘'}${ds} ${hh}</span>`; }
  function miniBase(cv, cx, cy, R) { if (!S || !S.run) return false; drawMap(cv, { cx, cy, R }, 'radar'); return true; }
  // кто-то найден живым и ждёт помощи -- задача «активна» (мигает в сводке)
  const urgent = () => !!(S && S.run && S.c.victims.some((v) => v.foundT !== undefined && !v.dead && !v.saved));
  return { photo, urgent, stripInfo, miniBase, begin, tick, cam, hud, stop, missionDone, end, get on() { return !!(S && S.on); }, get S() { return S; }, get drone() { return !!(S && S.dr); }, get running() { return !!(S && S.run); } };
}
