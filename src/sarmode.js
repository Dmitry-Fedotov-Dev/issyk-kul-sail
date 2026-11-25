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

const CSS = `
#sarw{position:fixed;inset:0;pointer-events:none;z-index:3}#sarw>*{pointer-events:auto}
#sclock{left:50%;top:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(8,22,48,.62);border-radius:12px;padding:4px 12px;font-size:14px;text-align:center;white-space:nowrap}#sclock b{font-size:17px}
#sbtns{position:fixed;right:calc(108px + env(safe-area-inset-right,0px));bottom:calc(40px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px}
body:not(.touchdev) #sbtns{right:16px;bottom:70px}
#sbtns button{min-width:62px;height:54px;border-radius:14px;border:2px solid rgba(255,255,255,.6);background:rgba(10,30,60,.6);color:#fff;font:700 14px var(--ui);padding:0 10px;touch-action:none}
#sbtns button.on{background:rgba(255,138,42,.8)}#sbtns button small{display:block;font-size:10px;font-weight:400;opacity:.85}
#sshoot{left:50%;bottom:calc(76px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#ffd24a;color:#2a1800;border-radius:12px;padding:6px 14px;font:800 15px var(--ui);animation:sblink .7s steps(2) infinite;white-space:nowrap}@keyframes sblink{50%{opacity:.45}}
#sbtns button.pulse{background:#ffd24a;color:#2a1800;border-color:#fff;animation:sblink .7s steps(2) infinite}
@media (max-width:640px){#sshoot{bottom:auto;top:196px;font-size:13px}}
#sflash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s}
#sframe{position:fixed;inset:12% 10%;border:2px solid rgba(255,255,255,.55);border-radius:6px;pointer-events:none;box-shadow:0 0 0 2000px rgba(0,0,0,.12)}#sframe i{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px;border:2px solid rgba(255,255,255,.7);border-radius:50%}
body.sardr #hhud,body.sardr #hscore,body.sardr #harr,body.sardr #hland,body.sardr #mark,body.sardr #hcr{display:none!important}
#sgim{position:absolute;left:8px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto}#sgim button{width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(10,30,60,.55);color:#fff;font:700 18px var(--ui);touch-action:none}#sgim span{font:700 12px var(--ui);color:#fff;text-shadow:0 1px 4px #000;text-align:center}
#sframe b{position:absolute;left:8px;top:6px;font:700 13px var(--ui);color:#fff;text-shadow:0 1px 4px #000}
.spanel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(620px,94vw);max-height:92vh;overflow:auto;background:rgba(8,22,48,.94);border:2px solid #ff8a2a;border-radius:18px;padding:14px 16px;color:#fff;font-size:14px;line-height:1.35}
.spanel h2{margin:0 0 4px;font-size:22px}.spanel h3{margin:12px 0 4px;font-size:13px;letter-spacing:.12em;color:#ffb07a;text-transform:uppercase}.spanel p{margin:4px 0}.spanel small{color:#b9c6dc}
.spanel .row{display:flex;gap:8px;flex-wrap:wrap}.spanel .ch{flex:1 1 0;min-width:90px;border-radius:12px;border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;padding:6px 8px;font:600 14px var(--ui);text-align:center}
.spanel .ch[aria-pressed=true]{border-color:#ff8a2a;background:rgba(255,138,42,.25)}.spanel .ch small{display:block;font-weight:400}
.spanel .go{display:block;width:100%;margin-top:12px;border:0;border-radius:14px;background:#ff8a2a;color:#1b0e00;font:800 18px var(--ui);padding:12px}
.spanel .plan{margin:2px 0;padding-left:18px}.spanel input{font:15px var(--ui);border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;padding:6px 8px;width:7.5em;text-transform:uppercase}
.spanel .x{position:sticky;top:0;float:right;border:0;background:rgba(255,255,255,.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:18px}
#smap{width:100%;aspect-ratio:1/1;border-radius:12px;touch-action:none;display:block;margin-top:6px;background:#203050}
#slog div{border-top:1px solid rgba(255,255,255,.1);padding:4px 0}#slog i{font-style:normal;color:#ffb07a}
#steams{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}#steams button{border-radius:10px;border:2px solid rgba(255,255,255,.35);background:rgba(60,140,255,.18);color:#fff;font:600 13px var(--ui);padding:4px 8px}#steams button.on{border-color:#6cf}
#snoteb{display:flex;gap:6px;margin-top:6px}#snoteb input{flex:1;width:auto;text-transform:none}
.sbad{color:#ff7a5a}.sok{color:#9fe0a0}
@media (max-width:640px){#sframe{inset:200px 8px 250px 8px}#sbtns{right:calc(100px + env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));gap:8px}#sbtns button{min-width:54px;height:46px;font-size:13px}#sclock{bottom:auto;top:150px;font-size:12px}}
`;
const NIGHT = (hr) => hr < 6 || hr > 20.5;
const CLUEICON = { wand: '🚩', note: '📝', tent: '⛺', pole: '🦯', glove: '🧤', debris: '❄', rope: '〰', pack: '🎒', axe: '⛏', track: '👣', cave: '🕳', cornice: '⚠', helmet: '⛑', rocks: '🪨', mirror: '✨', wrap: '🍫', bivy: '💤' };

export function makeSar(K) {
  const { G, scene, camera, $, store, toast, audio, TOUCH, input, H } = K;
  let S = null, built = false, mapImg = null, drone = null, ping = null;
  const v3 = new THREE.Vector3(), net = () => (K.net ? K.net() : null);
  const fmtT = (m) => `${Math.floor(m / 60)} ч ${String(Math.floor(m % 60)).padStart(2, '0')} мин`;
  const clockNow = () => G.clock || 12, hm = (x) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor(x % 1 * 60)).padStart(2, '0')}`;

  // ---- сборка интерфейса ----
  function build() { if (built) return; built = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'sarw'; w.hidden = true;
    w.innerHTML = `<div id="sclock" class="hud"></div><div id="sframe" hidden><b></b><i></i><div id="sgim"><button id="sgu">▲</button><span></span><button id="sgd">▼</button></div></div><div id="sflash"></div><div id="sshoot" class="hud" hidden>📷 В КАДРЕ ЧТО-ТО ЕСТЬ — СНИМАЙ!</div>
      <div id="sbtns"><button id="sphoto">📷<small>снимок</small></button><button id="sdrone">🛸<small>дрон</small></button><button id="sjb">🗺<small>дело</small></button><button id="sact" hidden></button></div>
      <div id="sbrief" class="spanel" hidden></div><div id="sjour" class="spanel" hidden></div>`;
    document.body.appendChild(w);
    const tap = (id, f) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); f(); });
    tap('sphoto', photo); tap('sdrone', () => (S && S.dr ? recall() : launch())); tap('sjb', () => journal(!$('sjour').hidden ? false : true)); tap('sact', act);
    // подвес камеры дрона: тянуть пальцем/мышью по картинке вверх-вниз, колесо мыши, Q (к горизонту) / E (вниз), кнопки ▴▾
    let gp = null; const gim = (dg) => { if (!S || !S.dr) return; S.dr.gim = S.gim = Math.max(0, Math.min(90, (S.dr.gim ?? 35) + dg)); };
    window.addEventListener('pointerdown', (e) => { if (S && S.dr && e.target.tagName === 'CANVAS' && !e.target.closest('#sjour')) { gp = { id: e.pointerId, y: e.clientY }; } }, true);
    window.addEventListener('pointermove', (e) => { if (gp && e.pointerId === gp.id) { gim((e.clientY - gp.y) * 0.25); gp.y = e.clientY; } }, true);
    const gu = (e) => { if (gp && e.pointerId === gp.id) gp = null; }; window.addEventListener('pointerup', gu, true); window.addEventListener('pointercancel', gu, true);
    window.addEventListener('wheel', (e) => { if (S && S.dr && e.target.tagName === 'CANVAS') { e.preventDefault(); e.stopImmediatePropagation(); gim(e.deltaY * 0.03); } }, { capture: true, passive: false });
    tap('sgu', () => gim(-10)); tap('sgd', () => gim(10));
    window.addEventListener('keydown', (e) => { if (!S || !S.on || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.code === 'KeyQ' && S.dr) gim(-10); else if (e.code === 'KeyE' && S.dr) gim(10); else if (e.code === 'KeyF') photo(); else if (e.code === 'KeyG') (S.dr ? recall() : launch()); else if (e.code === 'KeyJ') journal($('sjour').hidden); else if (e.code === 'KeyB') act(); });
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
    const alarm = (c.clock0 + c.since / 60) % 24, wait = NIGHT(alarm) ? Math.round((((6 - alarm) + 24) % 24) * 60) : 0; c.alarm = alarm; c.wait = wait;
    if (wait) { c.since += wait; for (const v of c.victims) { v.left = Math.max(0, v.left - wait); v.alive0 = v.left > 0; } }
    G.clock = wait ? 6 : alarm;
    for (const v of c.victims) { v.foundT = undefined; v.saved = false; v.kit = 0; v.dead = false; v.inEvac = false; }
    worldObjects(); mapImg = null; $('sarw').hidden = false; $('sbtns').hidden = false; brief(); syncJoin();
    if (!store.get('sarToon')) { store.set('sarToon', 1); film(); } }
  // ролик-инструктаж: время операции на паузе, пока он идёт
  function film() { if (!S) return; S.film = true; playSarToon({ audio, TOUCH, onDone: () => { if (S) S.film = false; } }); }
  function brief() { const c = S.c, el = $('sbrief'); el.hidden = false;
    const ppl = c.group.map((p) => `<b>${p.name}</b> <small>${p.age}, ${p.city}</small>`).join(' · ');
    const plan = c.plan.map((d) => `<li>День ${d.day}: ${d.from} → <b>${d.to}</b> <small>${d.asl} м</small></li>`).join('');
    const chip = (k, v, t, sub) => `<button class="ch" data-k="${k}" data-v="${v}" aria-pressed="${S.res[k] === v}">${t}<small>${sub}</small></button>`;
    el.innerHTML = `<h2>Дело № ${c.code}</h2>
      <p style="background:rgba(255,138,42,.2);border-radius:10px;padding:8px 10px"><b>Задача: найти пропавших живыми и доставить на базу.</b> Время идёт — у каждого свои часы.<br>
      1) Летите туда, куда ведёт <b>курс дела</b> (надпись наверху, оранжевый столб дыма, стрелка).<br>2) Снижайтесь и снимайте 📷 — вешки, палатки, следы. Улики сужают круг поиска.<br>3) Нашли живого — эвакуируйте (посадка или лебёдка) и везите на базу.</p>
      <p><small>Совместная операция: друзья вводят код <b>${c.code}</b> — то же дело, общие находки и заметки</small></p>
      <h3>Пропали</h3><p>${ppl}</p><p>Маршрут: <b>${c.routeName}</b></p><ol class="plan">${plan}</ol>
      <h3>Связь: ${c.comm.name}</h3><p>${c.last.txt}</p><p><small>Погода: ${{ breeze: 'ясно, ветер слабый', santash: 'ветрено — на гребнях до 20 м/с', ulan: 'буран: ветер до 40 м/с, видимость плохая' }[G.preset] || 'переменная'}. Тревога — в ${hm(c.alarm)}${c.wait ? `, ночью: Ми-8 в горах ночью не летает — вылет на рассвете, в 06:00` : ''}. Темнеет в 20:30</small></p>
      <h3>Силы</h3><div class="row">${chip('men', 0, 'Без пеших', 'только с воздуха')}${chip('men', 4, '1 отряд', '4 спасателя')}${chip('men', 8, '2 отряда', '8 — быстрее, но риск')}</div>
      <div class="row" style="margin-top:6px">${chip('drone', 0, 'Без дрона', '')}${chip('drone', 1, 'Дрон', '3 батареи · тепловизор')}</div>
      <p><small>Ми-8 не висит выше ~5900 м. Дрон запускается с земли — с базы или из лагеря, куда его закинет вертолёт. Пешие отряды проходят везде, но медленно и рискуют: каждый потерянный спасатель — минус к итогу.</small></p>
      <button class="go" id="sgo">Начать операцию</button><button class="ch" id="stoon" style="width:100%;margin-top:8px">🎬 Как это работает — ролик с Дымком</button>
      <p style="margin-top:10px"><small>Присоединиться к чужой операции:</small> <input id="sjoin" maxlength="5" placeholder="КОД"> <button class="ch" id="sjoinb" style="flex:none;display:inline-block;min-width:0">Войти</button></p>`;
    for (const b of el.querySelectorAll('.ch[data-k]')) b.onclick = () => { S.res[b.dataset.k] = +b.dataset.v; brief(); };
    $('sgo').onclick = start; $('stoon').onclick = () => film(); $('sjoinb').onclick = () => { const v = $('sjoin').value.trim().toUpperCase(); if (seedOf(v) === null) { toast('Код — 5 знаков, например K7QZA'); return; } stopWorld(); begin(v); }; }
  function start() { $('sbrief').hidden = true; S.run = true; S.bats = S.res.drone ? 3 : 0; const b = K.base();
    for (let i = 0; i < S.res.men / 4; i++) S.teams.push({ id: i + 1, n: 4, X: b.X + 20 + i * 12, Y: b.Y - 25, tgt: null, carry: null, risk: 0, spr: teamSprite() });
    say(`Операция «${S.c.code}» началась. ${S.teams.length ? `Отряды на базе: укажите им цель на карте (🗺) или возьмите на борт.` : 'Ищем с воздуха.'}`);
    if (S.c.last.kind === 'ping') { ping.visible = true; ping.position.set(S.c.last.X, H(S.c.last.X, S.c.last.Y) + 10, -S.c.last.Y); }
    K.pop('ОПЕРАЦИЯ', S.c.diff === 2 ? 'связи нет — ищите следы' : S.c.diff === 1 ? 'начните с последнего лагеря' : 'есть точка трекера'); journal(false); }

  // ---- мир: улики, люди (спрайты), следы ----
  const iconTex = new Map();
  function clueSprite(q) { let t = iconTex.get(q.k); if (!t) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '46px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(CLUEICON[q.k] || '•', 32, 36); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; iconTex.set(q.k, t); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); const sz = q.big ? 4 : 1.6; s.scale.set(sz, sz, 1); s.center.set(0.5, 0.1); return s; }
  function worldObjects() { stopWorld(); const c = S.c, root = new THREE.Group(); scene.add(root); S.root = root;
    for (const q of c.clues) { if (q.k === 'debris') { // лавинный вынос: комья снега пятном вдоль ската
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); for (let i = 0; i < 260; i++) { const r = 2 + Math.random() * 7, px = 64 + (Math.random() - 0.5) * 110 * Math.random() ** 0.5, py = 64 + (Math.random() - 0.5) * 120; x.fillStyle = `rgba(${200 + Math.random() * 40},${210 + Math.random() * 35},${230 + Math.random() * 25},0.85)`; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.strokeStyle = 'rgba(90,110,150,.35)'; x.stroke(); }
        const t = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(150, 260), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 })); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(q.dir[0], q.dir[1]); m.rotation.x = -Math.PI / 2; m.position.set(q.X, H(q.X, q.Y) + 2, -q.Y); root.add(m); }
      if (q.path && q.k === 'track') { const pts = q.path.map(([X, Y]) => new THREE.Vector3(X, H(X, Y) + 0.6, -Y)), l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x334055, dashSize: 3, gapSize: 4 })); l.computeLineDistances(); root.add(l); }
      const s = clueSprite(q); s.position.set(q.X, H(q.X, q.Y), -q.Y); root.add(s); q.spr = s; }
    for (const v of c.victims) { const fr = ['goth0', 'goth1', 'goth2', 'goth3', 'goth4', 'blond0', 'blond1', 'blond2', 'blond3', 'blond4'][v.frame % 10], s = K.personSprite(fr);
      if (v.pose === 'lie' || !v.alive0) { s.material.rotation = Math.PI / 2; s.center.set(0.5, 0.5); } if (v.pose === 'sit') s.scale.y *= 0.62; if (!v.alive0) s.material.color.setHex(0x8a96a8);
      s.visible = !(v.pose === 'buried' || v.pose === 'crev'); root.add(s); v.spr = s; placeVictim(v); } }
  function placeVictim(v) { const [X, Y] = v.walker && v.foundT === undefined && aliveNow(v) ? walkerPos(v, S.c.since + S.t, S.c.clock0) : [v.X, v.Y]; v.X = X; v.Y = Y; v.spr.position.set(X, H(X, Y) + (v.spr.material.rotation ? 0.3 : 0), -Y); }
  function stopWorld() { if (S && S.root) { scene.remove(S.root); S.root.traverse((o) => { if (o.material) { if (o.material.map && !o.isSprite) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); S.root = null; } }
  function teamSprite() { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = K.personSprite(['goth3', 'blond3', 'goth1'][i], 1.75); s.material.color.setHex(0xff9a5a); s.position.set(i * 1.3 - 1.3, 0, (i % 2) * 1.2); g.add(s); } const f = K.flagPole(); f.scale.setScalar(0.6); g.add(f); S.root.add(g); return g; }
  const aliveNow = (v) => !v.dead && aliveAt(v, S.t);

  // ---- лог операции и общие события ----
  function say(txt, me = true) { S.log.unshift({ t: S.t, txt }); if (S.log.length > 60) S.log.pop(); if (me) toast(txt); if (!$('sjour').hidden) journal(true); }
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
  function photo() { if (!S || !S.run || S.ended) return; const fl = $('sflash'); fl.style.transition = 'none'; fl.style.opacity = 0.85; void fl.offsetWidth; fl.style.transition = 'opacity .35s'; fl.style.opacity = 0; audio.beep && audio.beep(false);
    const from = S.dr ? { X: S.dr.X, Y: S.dr.Y, Z: S.dr.Z } : { X: K.heli().X, Y: K.heli().Y, Z: K.heli().Z }, agl = from.Z - H(from.X, from.Y), kind = S.dr ? 'drone' : 'heli', night = NIGHT(clockNow()); let got = 0, seen = 0;
    camera.updateMatrixWorld(); const look = (X, Y, z) => { v3.set(X, z + 1, -Y).project(camera); return v3.z < 1 && Math.abs(v3.x) < 0.8 && Math.abs(v3.y) < 0.76; };
    for (const q of S.c.clues) { if (S.found.has(q.id)) continue; const d = Math.hypot(q.X - from.X, q.Y - from.Y, H(q.X, q.Y) - from.Z); if (!look(q.X, q.Y, H(q.X, q.Y))) continue; seen++;
      if (Math.random() < pod(q, d, agl, night, kind)) { found(q); got++; } }
    for (const v of S.c.victims) { if (v.foundT !== undefined) continue; const z = H(v.X, v.Y), d = Math.hypot(v.X - from.X, v.Y - from.Y, z - from.Z); if (!look(v.X, v.Y, z)) continue;
      if (Math.random() < pod({ ...v, buried: v.buried || v.pose === 'crev' }, d, agl, night, kind)) { foundV(v, kind); got++; } }
    if (!got) K.pop('ПУСТО', agl > 160 ? 'слишком высоко: снижайтесь до 60-120 м' : seen ? 'что-то есть — ближе!' : 'в кадре ничего'); }
  function found(q) { S.found.add(q.id); share({ k: 'clue', id: q.id });
    if (q.fake) K.pop('ЛОЖНЫЙ СЛЕД', 'старьё чужой экспедиции — время потеряно'); else { S.streak = S.t - (S.lastClue ?? -99) < 25 ? Math.min(4, (S.streak || 1) + 1) : 1; S.lastClue = S.t; const b = 40 * (S.streak - 1); S.hot = (S.hot || 0) + b;
      K.pop(S.streak > 1 ? `+${40 + b} ГОРЯЧИЙ СЛЕД ×${S.streak}` : '+40 УЛИКА', q.t.length > 60 ? q.t.slice(0, 58) + '…' : q.t); K.buzz(30); } say(`${CLUEICON[q.k] || ''} ${q.t}`, false); audio.chime && audio.chime(); }
  function foundV(v, how) { const alive = aliveNow(v); v.foundT = S.t; if (!alive) v.dead = true; share({ k: 'vic', id: v.id, alive }); K.buzz(alive ? [60, 40, 60, 40, 120] : 80);
    if (alive) { K.score(600, `${v.name.toUpperCase()} ${gw(v, 'ЖИВ', 'ЖИВА')}!`, how === 'team' ? 'нашёл пеший отряд' : 'на снимке — машет!'); G.shake = Math.max(G.shake, 0.3); }
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
  function launch() { if (!S || !S.run) return; if (!S.res.drone) { toast('Дрона в этой операции нет'); return; } if (S.dr) return; const h = K.heli();
    if (!h.ground) { toast('Дрон запускает расчёт с земли — сядьте (на базе или в лагере)'); return; } if (S.bats <= 0) { toast('Батареи дрона кончились'); return; }
    S.bats--; S.dr = { gim: S.gim ?? 35, X: h.X + 8, Y: h.Y, Z: h.Z + 2, th: h.th, vx: 0, vy: 0, vz: 0, bat: 1, L: { X: h.X, Y: h.Y }, kit: 1 }; drone.g.visible = true; $('sframe').hidden = false; document.body.classList.add('sardr'); K.pop('ДРОН В ВОЗДУХЕ', `батарея ~3 мин · запасных ${S.bats}`); }
  function recall() { if (!S.dr) return; S.dr.home = true; toast('Дрон возвращается к точке запуска'); }
  function droneTick(dt, c) { const d = S.dr, wb = K.windAt(d.X, d.Y, d.Z), L = Math.hypot(d.X - d.L.X, d.Y - d.L.Y);
    d.bat -= dt / 190 * (1 + Math.hypot(wb.x, wb.y) / 30); let fwd = c.fwd, side = c.side, up = c.up;
    if (d.home || L > 6000) { const a = Math.atan2(d.L.X - d.X, d.L.Y - d.Y), e = Math.atan2(Math.sin(a - d.th), Math.cos(a - d.th)); side = Math.max(-1, Math.min(1, e * 2)); fwd = Math.abs(e) < 0.6 ? Math.min(1, L / 60) : 0; up = d.Z - H(d.X, d.Y) < 60 ? 1 : L < 50 ? -1 : 0; }
    d.th += side * 1.6 * dt; const sp = 17, tx = Math.sin(d.th) * fwd * sp + wb.x * 0.45, ty = Math.cos(d.th) * fwd * sp + wb.y * 0.45, k = Math.min(1, dt * 2.5);
    d.vx += (tx - d.vx) * k; d.vy += (ty - d.vy) * k; d.vz += (up * 6 - d.vz) * Math.min(1, dt * 3); d.X += d.vx * dt; d.Y += d.vy * dt; d.Z += d.vz * dt;
    const gz = H(d.X, d.Y); if (d.Z < gz + 1.5) { if (d.vz < -3 || Math.hypot(d.vx, d.vy) > 8) { lostDrone('Дрон разбит о склон'); return; } d.Z = gz + 1.5; d.vz = 0; }
    if (d.Z - (H(d.L.X, d.L.Y)) > 7600 - ASL - H(d.L.X, d.L.Y)) d.Z = 7600 - ASL; // потолок дрона ~7600 м
    if (d.bat <= 0) { if (L < 60) { landDrone(); return; } lostDrone('Батарея села — дрон упал'); return; }
    if (L < 30 && d.Z - gz < 4 && (d.home || d.bat < 0.97)) { landDrone(); return; }
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
        if (Math.random() < p) { t.n--; S.rescuerLost++; K.pop('ПОТЕРЯ В ОТРЯДЕ', `отряд ${t.id}: ${['срыв на склоне', 'закрытая трещина', 'обморожение, эвакуация', 'камень с кулуара'][Math.floor(Math.random() * 4)]}`); say(`⚠ Отряд ${t.id} потерял спасателя. Осталось ${t.n}`); if (t.n <= 0) { t.spr.visible = false; say(`Отряд ${t.id} выбыл`); } } }
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
    for (const v of S.c.victims) { if (!v.dead && v.alive0 && !aliveAt(v, S.t) && !v.saved && !v.onboard) { v.dead = true; if (v.foundT !== undefined) { K.pop('ПОТЕРЯЛИ', `${v.name} — не ${gw(v, 'дождался', 'дождалась')}`); say(`✖ ${v.name} ${gw(v, 'умер', 'умерла')}, не дождавшись эвакуации`); } }
      if (v.walker && v.foundT === undefined) placeVictim(v); }
    if (S.dr) droneTick(dt, c); teamsTick(dm);
    // вертолёт видит человека сам: низко и близко -- «вижу человека!»
    const h = K.heli(); for (const v of S.c.victims) if (v.foundT === undefined && !(v.buried || v.pose === 'crev') && Math.hypot(v.X - h.X, v.Y - h.Y) < 70 && h.agl < 90) foundV(v, 'heli');
    // ночью дрон смотрит тепловизором
    const nightDr = !!S.dr && NIGHT(clockNow()); if (nightDr !== S.nightOn) { S.nightOn = nightDr; const cv = document.querySelector('canvas'); if (cv) cv.style.filter = nightDr ? 'grayscale(1) brightness(3.2) contrast(1.25)' : ''; }
    S.posT -= dt; if (S.posT <= 0) { S.posT = 2; const p = S.dr || h; share({ k: 'pos', X: Math.round(p.X), Y: Math.round(p.Y), d: S.dr ? 1 : 0 }); }
    if (!$('sjour').hidden && (S.mapT = (S.mapT || 0) - dt) <= 0) { S.mapT = 0.5; drawMap(); }
    { const hr = clockNow(); if (hr > 19.4 && hr < 19.6 && !S.duskWarn) { S.duskWarn = 1; K.pop('ДО ТЕМНОТЫ ЧАС', 'садитесь на базе или в лагере: ночью в горах не летают'); say('⚠ До темноты час. Ночной полёт — штраф и риск'); }
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
  function traces() { const c = S.c; return c.clues.filter((q) => (q.k === 'wand' || q.camp) && !q.key && !q.fake).sort((a, b) => a.day - b.day || (a.camp ? 1 : 0) - (b.camp ? 1 : 0)); }
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
    const P = [c.leg[0][0] + (c.leg[1][0] - c.leg[0][0]) * 0.55, c.leg[0][1] + (c.leg[1][1] - c.leg[0][1]) * 0.55];
    return goal('След обрывается', `Последняя метка группы — на маршруте дня ${c.legIdx + 1}. Дальше их нет: что-то случилось. Осмотрите склоны вокруг — палатку, следы, снаряжение. Снимайте 📷`, P[0], P[1], 900); }
  // есть ли что-то в кадре, что снимок, скорее всего, найдёт -- подсказка «СНИМАЙ!»
  function canShoot() { const from = S.dr || K.heli(), agl = from.Z - H(from.X, from.Y), night = NIGHT(clockNow()), kind = S.dr ? 'drone' : 'heli'; camera.updateMatrixWorld();
    const look = (X, Y, z) => { v3.set(X, z + 1, -Y).project(camera); return v3.z < 1 && Math.abs(v3.x) < 0.8 && Math.abs(v3.y) < 0.76; };
    for (const q of S.c.clues) { if (S.found.has(q.id)) continue; const z = H(q.X, q.Y), d = Math.hypot(q.X - from.X, q.Y - from.Y, z - from.Z); if (d < 400 && pod(q, d, agl, night, kind) > 0.4 && look(q.X, q.Y, z)) return true; }
    for (const v of S.c.victims) { if (v.foundT !== undefined) continue; const z = H(v.X, v.Y), d = Math.hypot(v.X - from.X, v.Y - from.Y, z - from.Z); if (d < 400 && pod({ ...v, buried: v.buried || v.pose === 'crev' }, d, agl, night, kind) > 0.4 && look(v.X, v.Y, z)) return true; }
    return false; }

  // ---- приборы ----
  function hud() { if (!S || !S.on) return; const el = $('sclock'); if (!S.run) { el.hidden = true; return; } el.hidden = false;
    const sc = scoreOf(tally()), tb = Math.max(0, Math.round(1800 - S.t * 2.5));
    const hurt = S.c.victims.filter((v) => v.foundT !== undefined && !v.dead && !v.saved).map((v) => { const m = Math.max(0, v.left + (v.kit ? 360 : 0) - (v.foundT + (S.t - v.foundT) / 3)) * 3; return ` · 🩺 ${v.name}: <span class="${m < 120 ? 'sbad' : ''}">${fmtT(m)}</span>`; }).join('');
    const since = (S.c.since + S.t) / 60, hope = since < 12 ? '<span class="sok">высокий</span>' : since < 30 ? 'средний' : '<span class="sbad">низкий</span>', hr = clockNow();
    const t = `<b>Т+ ${fmtT(S.t)}</b> · ${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor(hr % 1 * 60)).padStart(2, '0')}${NIGHT(hr) ? ' 🌙' : ''} · шанс найти живыми: ${hope}<br><b style="color:#ffd24a">${sc.total}</b> очков · за время ещё +${tb}${hurt}<br>улик ${S.found.size} · найдено ${S.c.victims.filter((v) => v.foundT !== undefined).length}/${S.c.victims.length}${S.saved ? ` · спасено ${S.saved}` : ''}${S.rescuerLost ? ` · <span class="sbad">потери ${S.rescuerLost}</span>` : ''}`;
    if (el.innerHTML !== t) el.innerHTML = t;
    if (S.dr) { const d = S.dr, L = Math.hypot(d.X - d.L.X, d.Y - d.L.Y), tx = `ДРОН · батарея ${Math.max(0, Math.round(d.bat * 100))}% · ${Math.round(d.Z - H(d.X, d.Y))} м над землёй · ${(L / 1000).toFixed(1)} км${NIGHT(hr) ? ' · ТЕПЛОВИЗОР' : ''}`; const b = $('sframe').firstChild; if (b.textContent !== tx) b.textContent = tx;  const gs = $('sgim').querySelector('span'), gt = `камера\n${Math.round(d.gim ?? 35)}°`; if (gs.textContent !== gt) { gs.textContent = gt; gs.style.whiteSpace = 'pre'; } }
    $('sphoto').classList.toggle('pulse', !!S.shoot); { const sh = $('sshoot'); sh.hidden = !S.shoot; }
    const dl = $('sdrone'); dl.hidden = !S.res.drone; dl.classList.toggle('on', !!S.dr); dl.innerHTML = S.dr ? '🛸<small>домой</small>' : `🛸<small>дрон · ${S.bats}</small>`;
    const a = actLabel(), ab = $('sact'); ab.hidden = !a; if (a && ab.innerHTML !== a) ab.innerHTML = a; }

  // ---- дело: карта (рельеф района), маршрут по дням, улики, люди, отряды, заметки, лог ----
  function bbox() { const c = S.c; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of c.pts) { x0 = Math.min(x0, p.X); x1 = Math.max(x1, p.X); y0 = Math.min(y0, p.Y); y1 = Math.max(y1, p.Y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2 + 4500; return { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R }; }
  function relief(B, N) { const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), img = x.createImageData(N, N), k = (B.x1 - B.x0) / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const X = B.x0 + i * k, Y = B.y1 - j * k, z = H(X, Y) + ASL, sx = H(X + k, Y) - H(X - k, Y), sy = H(X, Y + k) - H(X, Y - k), sh = Math.max(0, Math.min(1, 0.62 + (-sx + sy) / (4 * k) * 0.9)), o = (j * N + i) * 4;
      const snow = z > 4300 ? 1 : z > 3700 ? (z - 3700) / 600 : 0, r = (120 + 120 * snow) * sh, g = (112 + 128 * snow) * sh, b = (104 + 146 * snow) * sh; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
    x.putImageData(img, 0, 0); return cv; }
  function drawMap() { const cv = $('smap'); if (!cv) return; const W = cv.clientWidth || 360, dpr = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(W * dpr)) { cv.width = cv.height = Math.round(W * dpr); }
    const B = bbox(); if (!mapImg) mapImg = relief(B, 260); const x = cv.getContext('2d'), N = cv.width, P = (X, Y) => [(X - B.x0) / (B.x1 - B.x0) * N, (B.y1 - Y) / (B.y1 - B.y0) * N], u = N / 360;
    x.drawImage(mapImg, 0, 0, N, N); const c = S.c;
    // маршрут по плану: дни
    x.lineWidth = 3 * u; x.strokeStyle = 'rgba(255,138,42,.9)'; x.setLineDash([8 * u, 6 * u]); x.beginPath(); c.pts.forEach((p, i) => { const [a, b] = P(p.X, p.Y); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke(); x.setLineDash([]);
    x.font = `700 ${11 * u}px sans-serif`; x.textAlign = 'left'; c.pts.forEach((p, i) => { const [a, b] = P(p.X, p.Y); x.fillStyle = '#ff8a2a'; x.beginPath(); x.arc(a, b, 4 * u, 0, 7); x.fill(); x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 3 * u; const t = i ? `Д${i} · ${p.n}` : p.n; x.strokeText(t, a + 6 * u, b - 4 * u); x.fillText(t, a + 6 * u, b - 4 * u); });
    if (c.last.kind === 'ping') { const [a, b] = P(c.last.X, c.last.Y); x.strokeStyle = '#4ab0ff'; x.lineWidth = 2 * u; x.beginPath(); x.arc(a, b, 200 / (B.x1 - B.x0) * N, 0, 7); x.stroke(); x.fillStyle = '#4ab0ff'; x.fillText('SOS трекера', a + 6 * u, b + 14 * u); }
    if (c.last.kind === 'radio') { const [a, b] = P(c.last.X, c.last.Y); x.strokeStyle = '#4ab0ff'; x.lineWidth = 2 * u; x.beginPath(); x.arc(a, b, 9 * u, 0, 7); x.stroke(); x.fillStyle = '#4ab0ff'; x.fillText('последняя связь', a + 8 * u, b + 14 * u); }
    if (S.area) { const [a, b] = P(S.area.X, S.area.Y), r = S.area.R / (B.x1 - B.x0) * N; x.fillStyle = 'rgba(255,210,74,.16)'; x.strokeStyle = '#ffd24a'; x.lineWidth = 2.5 * u; x.setLineDash([6 * u, 5 * u]); x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); x.stroke(); x.setLineDash([]); x.fillStyle = '#ffd24a'; x.font = `700 ${11 * u}px sans-serif`; x.textAlign = 'center'; x.fillText('искать здесь', a, b - r - 4 * u); }
    x.font = `${14 * u}px serif`; x.textAlign = 'center'; for (const q of c.clues) if (S.found.has(q.id)) { const [a, b] = P(q.X, q.Y); x.globalAlpha = q.fake ? 0.45 : 1; x.fillText(CLUEICON[q.k] || '•', a, b + 5 * u); x.globalAlpha = 1; }
    for (const v of c.victims) if (v.foundT !== undefined) { const [a, b] = P(v.X, v.Y); x.fillStyle = v.saved ? '#9fe0a0' : v.dead ? '#8a96a8' : '#3cff6a'; x.beginPath(); x.arc(a, b, 6 * u, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = `700 ${11 * u}px sans-serif`; x.fillText(v.name + (v.dead ? ' ✖' : v.saved ? ' ✓' : ''), a, b - 9 * u); x.font = `${14 * u}px serif`; }
    for (const n of S.notes) { const [a, b] = P(n.X, n.Y); x.fillStyle = '#ffe14a'; x.beginPath(); x.moveTo(a, b); x.lineTo(a - 5 * u, b - 12 * u); x.lineTo(a + 5 * u, b - 12 * u); x.fill(); x.font = `600 ${10 * u}px sans-serif`; x.fillText((n.n ? n.n + ': ' : '') + n.txt.slice(0, 24), a, b - 15 * u); }
    for (const t of S.teams) if (t.n > 0 && !t.onboard) { const [a, b] = P(t.X, t.Y); if (t.tgt) { const [e, f] = P(t.tgt[0], t.tgt[1]); x.strokeStyle = 'rgba(100,200,255,.8)'; x.setLineDash([4 * u, 4 * u]); x.beginPath(); x.moveTo(a, b); x.lineTo(e, f); x.stroke(); x.setLineDash([]); }
      x.fillStyle = S.selTeam === t.id ? '#fff' : '#6cf'; x.fillRect(a - 5 * u, b - 5 * u, 10 * u, 10 * u); x.fillStyle = '#fff'; x.font = `700 ${10 * u}px sans-serif`; x.fillText(`О${t.id}·${t.n}`, a, b + 16 * u); }
    for (const [n, p] of S.peers) if (performance.now() - p.t < 8000) { const [a, b] = P(p.X, p.Y); x.fillStyle = '#c78bff'; x.beginPath(); x.arc(a, b, 5 * u, 0, 7); x.fill(); x.fillText(n, a, b - 8 * u); }
    const h = K.heli(), [a, b] = P(h.X, h.Y); x.save(); x.translate(a, b); x.rotate(h.th); x.fillStyle = '#ff6a1a'; x.beginPath(); x.moveTo(0, -9 * u); x.lineTo(6 * u, 7 * u); x.lineTo(-6 * u, 7 * u); x.fill(); x.restore();
    if (S.dr) { const [e, f] = P(S.dr.X, S.dr.Y), [g0, g1] = P(S.dr.L.X, S.dr.L.Y); x.strokeStyle = 'rgba(80,220,255,.5)'; x.beginPath(); x.arc(g0, g1, 6000 / (B.x1 - B.x0) * N, 0, 7); x.stroke(); x.fillStyle = '#5df'; x.beginPath(); x.arc(e, f, 4 * u, 0, 7); x.fill(); } }
  function course() { const c = S.c, tr = traces(), got = tr.filter((q) => S.found.has(q.id)).length, keyF = c.clues.some((q) => q.key && S.found.has(q.id)), fv = c.victims.filter((v) => v.foundT !== undefined).length, n = c.victims.length;
    const li = (ok, t) => `<div>${ok ? '✅' : '⬜'} ${t}</div>`, g = S.goalTxt;
    return `<h3>Курс дела</h3>${g ? `<p style="background:rgba(255,138,42,.18);border-radius:10px;padding:6px 10px"><b>Сейчас: ${g.t}</b><br>${g.d}</p>` : ''}
      ${li(true, `Известно: ${c.last.kind === 'ping' ? 'точка SOS трекера' : c.last.kind === 'radio' ? `связь была из «${c.pts[c.last.camp].n}»` : 'только план маршрута'}`)}${li(got === tr.length && tr.length > 0, `След группы по маршруту: найдено меток ${got} из ${tr.length}`)}${li(keyF, 'Место происшествия: что случилось?')}${li(fv === n, `Люди найдены: ${fv} из ${n}`)}${li(S.saved > 0 && c.victims.every((v) => v.saved || v.dead), `Живые доставлены на базу: ${S.saved}`)}`; }
  function journal(open) { if (!S) return; const el = $('sjour'); if (!open) { el.hidden = true; return; } const c = S.c; el.hidden = false;
    const clues = c.clues.filter((q) => S.found.has(q.id)).map((q) => `<div>${CLUEICON[q.k] || ''} ${q.fake ? '<small>' : ''}${q.t}${q.fake ? '</small>' : ''}</div>`).join('') || '<small>Пока ничего. Снимайте (📷) низко над маршрутом — вешки, палатки, следы</small>';
    const log = S.log.slice(0, 14).map((l) => `<div><i>Т+${fmtT(l.t)}</i> ${l.txt}</div>`).join('');
    el.innerHTML = `<button class="x" id="sjx">✕</button><h2>Дело № ${c.code}</h2><p><small>${c.routeName} · ${c.comm.name}. ${c.last.txt}</small></p>
      ${course()}<canvas id="smap"></canvas><div id="steams">${S.teams.map((t) => `<button data-t="${t.id}" class="${S.selTeam === t.id ? 'on' : ''}">Отряд ${t.id} · ${t.n} чел${t.onboard ? ' · на борту' : t.carry ? ' · несут' : ''}</button>`).join('')}<button data-t="0" class="${S.selTeam === -1 ? 'on' : ''}">📌 Заметка</button></div>
      <p><small>${S.selTeam > 0 ? 'Коснитесь карты — отряд пойдёт туда' : 'Коснитесь карты — оставить заметку для всех'}</small></p><div id="snoteb" hidden><input id="snote" maxlength="80" placeholder="что здесь?"><button class="ch" id="snoteok" style="flex:none">OK</button></div>
      <h3>Улики</h3><div id="sclues">${clues}</div><h3>Журнал операции</h3><div id="slog">${log}</div>
      <button class="ch" id="stoon2" style="width:100%;margin-top:12px">🎬 Как это работает — ролик с Дымком</button><button class="go" id="send" style="background:#3a4a66;color:#fff;font-size:15px">Завершить операцию</button>`;
    $('sjx').onclick = () => journal(false); $('stoon2').onclick = () => film(); for (const b of el.querySelectorAll('#steams button')) b.onclick = () => { S.selTeam = +b.dataset.t || -1; journal(true); };
    $('send').onclick = () => { if (S.confirmEnd) end(); else { S.confirmEnd = 1; $('send').textContent = 'Точно свернуть поиск? Нажмите ещё раз'; } };
    const cv = $('smap'); cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(), B = bbox(), X = B.x0 + (e.clientX - r.left) / r.width * (B.x1 - B.x0), Y = B.y1 - (e.clientY - r.top) / r.height * (B.y1 - B.y0);
      if (S.selTeam > 0) { const t = S.teams.find((q) => q.id === S.selTeam); if (t && t.n > 0 && !t.onboard) { t.tgt = [X, Y]; say(`Отряд ${t.id} выходит к точке (${(Math.hypot(X - t.X, Y - t.Y) / 1000).toFixed(1)} км)`, false); drawMap(); } else toast('Отряд на борту — высадите его (🧗)'); return; }
      const nb = $('snoteb'); nb.hidden = false; $('snote').focus(); $('snoteok').onclick = () => { const txt = $('snote').value.trim(); if (txt) { S.notes.push({ X, Y, txt, n: 'вы' }); share({ k: 'note', X: Math.round(X), Y: Math.round(Y), txt }); } nb.hidden = true; drawMap(); }; };
    requestAnimationFrame(drawMap); }

  // ---- итог: правда о происшествии, очки ----
  function tally() { const c = S.c; return { saved: S.saved, alive: c.victims.filter((v) => v.alive0).length, aliveFound: c.victims.filter((v) => v.foundT !== undefined && !v.dead && !v.saved).length, dead: c.victims.filter((v) => v.foundT !== undefined && v.dead).length,
    clues: [...S.found].filter((i) => !c.clues[i].fake).length, minutes: S.t, rescuerLost: S.rescuerLost, droneLost: S.droneLost, heliCrash: !!K.heli().crash, comm: c.comm,
    extra: [[`горячий след`, S.hot || 0], ['ночные полёты', -(S.nightPen || 0)]] }; }
  function end() { if (!S || S.ended) return; S.ended = true; S.run = false; journal(false); if (S.dr) { S.dr = null; drone.g.visible = false; } $('sframe').hidden = true; document.body.classList.remove('sardr'); $('sbtns').hidden = true; $('sclock').hidden = true; const c = S.c;
    const o = tally();
    const sc = scoreOf(o), rec = sc.total > (store.get('sarBest') || 0); if (rec) store.set('sarBest', sc.total); store.set('sarDone', 1); const rc = store.get('sarRecent') || []; rc.push(c.scen); store.set('sarRecent', rc.slice(-6));
    const truth = c.victims.map((v) => `${v.name}: ${v.saved ? gw(v, 'спасён', 'спасена') : v.foundT !== undefined ? (v.dead ? gw(v, 'найден погибшим', 'найдена погибшей') : gw(v, 'найден живым, но не эвакуирован', 'найдена живой, но не эвакуирована')) : v.alive0 && !v.dead ? gw(v, 'не найден — а был ещё жив…', 'не найдена — а была ещё жива…') : gw(v, 'не найден', 'не найдена')}`).join(' · ');
    $('rh').textContent = `${'★'.repeat(sc.stars)}${'☆'.repeat(3 - sc.stars)} ${sc.total} очков${rec ? ' · рекорд!' : ''}`;
    $('rs').innerHTML = `<b>Что случилось:</b> ${c.cause}. <small>${c.real}</small><br>${truth}`;
    $('rt').innerHTML = sc.parts.map(([t, v]) => `<tr><td>${t}</td><td style="text-align:right">${v > 0 ? '+' : ''}${v}</td></tr>`).join('') + (sc.k > 1 ? `<tr><td>сложность: ${c.comm.name}</td><td style="text-align:right">×${sc.k}</td></tr>` : '');
    $('ragain').textContent = 'Новое дело'; setTimeout(() => { if (S && S.on) $('result').hidden = false; }, 600); }
  function stop() { if (!S) return; S.on = false; stopWorld(); if (drone) drone.g.visible = false; if (ping) ping.visible = false; $('sarw').hidden = true; const cv = document.querySelector('canvas'); if (cv) cv.style.filter = ''; NETHOOK.sar = null; document.body.classList.remove('sardr'); const n = net(); if (n && n.sarLeave) n.sarLeave(); S = null; }
  return { begin, tick, cam, hud, stop, missionDone, end, get on() { return !!(S && S.on); }, get S() { return S; }, get drone() { return !!(S && S.dr); }, get running() { return !!(S && S.run); } };
}
