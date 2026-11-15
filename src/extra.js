// Всё, что выросло вокруг яхты: выбор снаряда, достижения, соревнования для гребных и моторных, сплав по реке,
// движение в акватории и милиция, выбор места старта по карте (включая горы). Главный модуль вызывает отсюда крючки.
import { SPECS, CRAFT_ORDER, YACHT_INFO, ACH, makeCraftBody, aiPaddle, aiMotor, flow } from './crafts.js';
import { MODEL, FX } from './craftmodels.js';
import { makeTraffic } from './traffic.js';
import { makeNet, radiusOf, encNpc, followNpc } from './net.js';
import { makeRiver } from './rivermode.js';
import { makeWake } from './fx.js';
import { makeMark } from './world.js';
import { clamp, wrapPi, KN, DEG, smooth, PRESETS } from './sim.js';
import { makeHook } from './hook.js';

const WS = { h: 0, sx: 0, sz: 0 };
const NPC_NAME = { kayak: 'каякер', scull: 'гребец', sup: 'сапбордист', boat: 'катер', jetski: 'гидроцикл', steamer: 'теплоход', fishing: 'рыбаки', police: 'милиция' };
// имя по умолчанию -- как товар из шведского мебельного: корень + окончание, по-русски
const NA = ['Бьёрк', 'Флуфф', 'Мальм', 'Хемнэ', 'Лакк', 'Скогс', 'Билли', 'Поэнг', 'Кнопп', 'Стокк', 'Тролль', 'Фрёс', 'Глимт', 'Брумм', 'Снёрк', 'Квакк', 'Пюттс', 'Хюгге', 'Тьёрн', 'Вимле', 'Ёкки', 'Смёрре', 'Блоб', 'Гульд', 'Фликк', 'Мюс', 'Дуфф', 'Плюмп'];
const NB = ['берг', 'ста', 'лунд', 'вик', 'хульт', 'рюд', 'бу', 'сунд', 'фьорд', 'эбю', 'нэс', 'ла', 'гард', 'бэкк', 'ског', 'шё', 'торп', 'рам'];
export const randomName = () => NA[Math.floor(Math.random() * NA.length)] + NB[Math.floor(Math.random() * NB.length)];
const FLING_V = 1.1; // сближение быстрее этого (м/с) -- уже не касание: сапбордист вылетает
const FLY_TXT = ['Уиииии!', 'Полетел!', 'Ласточкой!', 'Сальто с доски!', 'Хоп — и в воду!', 'Катапульта!'];
const WAIT = { yacht: 30, kayak: 20, scull: 25, sup: 15, jetski: 15, boat: 15 }; // столько ждёт лобби (так же на сервере)
const RIVALS = [['Ала-Тоо', 0.97, { hull: 0x1f6fd0, deck: 0xf4f3ee, pfd: 0x1f6fd0 }], ['Манас', 0.9, { hull: 0xf2c21b, deck: 0x20242b, pfd: 0xf2c21b }], ['Чайка', 0.84, { hull: 0x2f8f5a, deck: 0xf4f3ee, pfd: 0x8fd16a }]];
const COMPETE = { yacht: ['Регата', 'три соперника, старт по сигналу'], kayak: ['Спринт 500 м', 'четыре дорожки, прямая'], scull: ['Гонка 1000 м', 'академическая классика'], sup: ['Гонка 200 м', 'техника и баланс'], jetski: ['Слалом по буям', 'восемь знаков на время'], boat: ['Фигурное вождение', 'слалом по буям на время'] };
const HOW = { kayak: '<b>← →</b> — гребок левой и правой лопастью. Гребите по очереди и в ритм: частить бесполезно. Гребок слева уводит нос вправо. <b>Пробел</b> — опора на весло, после оверкиля — эскимосский переворот.',
  scull: '<b>Пробел</b> — гребок обоими вёслами: захват, проводка, вынос. Нажмёте раньше, чем вынесли вёсла, — поймаете «краба». <b>← →</b> — одним веслом, чтобы подправить курс.',
  sup: '<b>← →</b> — гребок слева и справа, меняйте борт. <b>Пробел</b> — присесть: устойчивее на волне, но гребок слабее.',
  jetski: '<b>Пробел</b> — газ. <b>← →</b> — руль, но рулится гидроцикл только под газом. На гребне на скорости — прыжок; приводняйтесь ровно.',
  boat: '<b>Пробел</b> — газ, <b>← →</b> — штурвал. После разгона катер выходит на глиссер. У причала — малый ход, не быстрее 5 узлов.' };

export function installExtra(A) {
  const { G, scene, $, store, toast, audio, TOUCH } = A, yacht = G.player; yacht.id = 'yacht';
  const txt = (id, s) => { const el = $(id); if (el.textContent !== s) el.textContent = s; }; // в DOM -- только изменившееся
  const crafts = { yacht }, rivalsBy = {}, marks = [], done = new Set(store.get('ach') || []);
  let sel = store.get('craft') || 'yacht', river = null, startAt = null, yachtHow = '', name = String(store.get('name') || '').slice(0, 16).trim();
  if (!name) { name = randomName(); store.set('name', name); }
  let flSeq = 0, flVel = [0, 0, 0], bumpCool = 0; // свой полёт: номер и скорость вылета (уходят в сеть)
  // pid -- постоянный номер игрока в этом браузере: по нему сервер держит место в заезде, если связь оборвалась
  let pid = String(store.get('pid') || ''); if (!pid) { pid = Math.random().toString(36).slice(2, 12); store.set('pid', pid); }
  let npcFollow = null, npcHost = 0; // данные NPC от хозяина (если мы ведомые) и его номер
  // fid -- открытый номер для друзей: он попадает в ссылку-приглашение. pid в ссылку не идёт: по нему держится место в заезде
  let fid = String(store.get('fid') || ''); if (!fid) { fid = Math.random().toString(36).slice(2, 12); store.set('fid', fid); }
  let friends = (store.get('friends') || []).filter((x) => x && x.fid && x.fid !== fid).slice(0, 20), fstat = new Map(), pendingTp = null, pendingFriend = null;
  const addFriend = (f, n) => { if (!f || f === fid) return false; const o = friends.find((x) => x.fid === f); if (o) { if (n) o.n = n; } else friends.unshift({ fid: f, n: n || 'Друг' }); friends = friends.slice(0, 20); store.set('friends', friends); return !o; };
  if (sel !== 'yacht' && !SPECS[sel]) sel = 'yacht';
  const info = (id) => (id === 'yacht' ? YACHT_INFO : SPECS[id]);
  const SHORT = { yacht: 'Яхта', kayak: 'Каяк', scull: 'Одиночка', sup: 'SUP-доска', jetski: 'Гидроцикл', boat: 'Катер' }; // на кнопке -- коротко, полное имя в подсказке

  // ---------- достижения ----------
  function ach(id) { if (done.has(id)) return; const a = ACH.find((x) => x[1] === id); if (!a) return; done.add(id); store.set('ach', [...done]); audio.chime(); toast('★ ' + a[2]); journal(); }
  function journal() { const groups = { yacht: 'Яхта', kayak: 'Каяк', scull: 'Академическая одиночка', sup: 'SUP-доска', jetski: 'Гидроцикл', boat: 'Моторный катер', law: 'Закон и порядок', map: 'География' };
    $('bjournal').textContent = `Журнал · ${done.size}/${ACH.length}`;
    $('jlist').innerHTML = Object.keys(groups).map((g) => `<h4>${groups[g]}</h4>` + ACH.filter((a) => a[0] === g).map((a) => `<div class="ja${done.has(a[1]) ? ' ok' : ''}"><b>${a[2]}</b><span>${a[3]}</span></div>`).join('')).join(''); }

  // ---------- снаряды ----------
  function mkEntity(id, opts, name, skill = 1) { const b = makeCraftBody(id), model = MODEL[id](opts || {}), wake = makeWake(); scene.add(model.root, wake.mesh); return { id, b, model, wake, name, skill, ai: {}, leg: 0, time: 0 }; }
  const show = (e, v) => { if (!v && e.model.dispose) e.model.dispose(); e.model.root.visible = v; e.wake.mesh.visible = v && G.mode !== 'river'; };
  function setPlayer(id) { if (!crafts[id]) { crafts[id] = mkEntity(id, null, 'Вы'); loadWear(crafts[id]); } for (const k in crafts) show(crafts[k], k === id); G.player = crafts[id]; $('ts').textContent = info(id).key;
    document.body.classList.toggle('motor', id !== 'yacht' && SPECS[id].cls === 'motor'); }
  function leaveModes() { hook.release(null); setPit(null); for (const k in rivalsBy) for (const e of rivalsBy[k]) e.out = false; if (river) river.show(false); flow.at = flow.surf = flow.rough = null; G.rv = null; if (G.race2) { if (G.race2.online) net.leave(); for (const r of G.race2.rivals) show(r, false); G.race2 = null; } if (G.race && G.race.online) net.leave(); lobbyUI(null); for (const m of marks) m.visible = false; if (traffic) traffic.setActive(false); audio.engine(false); $('wanted').hidden = true; G.gag = null; }

  // ---------- акватория и закон ----------
  // суда акватории (11 моделей) создаются при первом свободном плавании
  let traffic = null; const mkTraffic = () => traffic || (traffic = makeTraffic(scene, { h: G.h, waves: G.waves, wind: G.wind, toast, ach, audio,
    setWanted(n, text) { const el = $('wanted'); el.hidden = !n; if (n) el.innerHTML = `<b>${'★'.repeat(n)}${'☆'.repeat(3 - n)}</b> ${text}`; },
    onHit(rel) { wear(G.player.b, 0, 0.02 + 0.01 * rel); G.shake = Math.max(G.shake, Math.min(1.2, 0.4 + rel * 0.12)); audio.thump(Math.min(1, 0.4 + rel * 0.1)); },
    onBust() { A.placeBoat(G.player, 22, G.shore.pierY - 70, A.openWaterHeading(22, G.shore.pierY - 70), 0); },
    // удар игрока о судно акватории: n -- от судна к игроку, imp -- скорость сближения
    onBump(e, nx, ny, imp) { if (imp < FLING_V) return; if (e.type === 'sup') knock(e, -nx, -ny, imp, false); knock(G.player, nx, ny, imp, true); },
    peers: () => peerList(), knock: (e, nx, ny, imp) => knock(e, nx, ny, imp, false), follow: () => npcFollow }));

  // ---------- столкновения и полёты ----------
  // Сапбордист, в которого въехали быстрее касания, вылетает с доски (модель кувыркается сама, доска ложится на бок,
  // забраться обратно можно, когда он доплыл). Свой полёт уходит в сеть, чтобы его видели все рядом.
  function knock(e, nx, ny, imp, isPlayer) { const b = e.b; if (!b || b.kind !== 'sup' || !e.model.fling || e.model.flying()) return false;
    const k = clamp(imp, 1, 7), hs = 4.5 + k * 2.3, vx = nx * hs + b.vx * 0.4, vz = -(ny * hs + b.vy * 0.4), vy = 7 + k * 1.2 + Math.random() * 2;
    e.model.fling(vx, vy, vz); b.capsized = true; b.righting = 0; b.rightHold = 0; b.st = null; b.phi = (Math.random() < 0.5 ? -1 : 1) * 0.5; b.noRight = (2 * vy) / 7.5 + 2.6; b.vx += nx * k * 0.6; b.vy += ny * k * 0.6;
    e.fseq = (e.fseq || 0) + 1; e.fv = [vx, vy, vz]; // NPC: номер и скорость полёта уходят ведомым
    if (isPlayer) { flSeq++; flVel = [vx, vy, vz]; audio.whee(1); G.shake = Math.max(G.shake, 1); toast(FLY_TXT[Math.floor(Math.random() * FLY_TXT.length)]); }
    else { const d = Math.hypot(b.X - G.player.b.X, b.Y - G.player.b.Y); if (d < 120) audio.whee(clamp(1 - d / 120, 0.2, 0.9)); }
    return true; }
  FX.splash = (x, y, z, p) => { for (let i = 0; i < 90 * p; i++) G.spray.emit(x + (Math.random() - 0.5), y + 0.2, z + (Math.random() - 0.5), (Math.random() - 0.5) * 6, 3 + Math.random() * 5 * p, (Math.random() - 0.5) * 6, 2, 1, Math.random() < 0.25 ? 1 : 0);
    const d = Math.hypot(x - G.player.b.X, z + G.player.b.Y); if (d < 150) audio.splash(p * clamp(1 - d / 150, 0.15, 1)); };
  // онлайн-игроки рядом, которых видно (для столкновений и для того, чтобы их обходили суда акватории)
  const peerList = () => { const out = []; for (const p of net.pups.values()) if (p.model.root.visible) out.push(p); return out; };
  // игрок и чужие лодки: каждый клиент выталкивает только свою лодку, поэтому оба расходятся одинаково
  function bumpPeers(P, dt) { const b = P.b, rb = radiusOf(b); bumpCool -= dt;
    for (const p of peerList()) { const q = p.b, dx = b.X - q.X, dy = b.Y - q.Y, d = Math.hypot(dx, dy), R = rb + radiusOf(q); if (d >= R || d < 0.01) continue;
      const nx = dx / d, ny = dy / d, rel = (b.vx - q.vx) * nx + (b.vy - q.vy) * ny; b.X += nx * (R - d); b.Y += ny * (R - d);
      if (rel < 0) { b.vx -= rel * nx * 1.35; b.vy -= rel * ny * 1.35; } const imp = -rel;
      if (imp > FLING_V && p.k === 'sup' && p.model.fling && !p.model.flying() && !q.capsized) { knock(p, -nx, -ny, imp, false); net.hit(p.id, -nx * imp, -ny * imp, imp); }
      if (imp > FLING_V) knock(P, nx, ny, imp, true);
      if (imp > 0.8 && bumpCool <= 0) { bumpCool = 1.2; G.shake = Math.max(G.shake, Math.min(1, 0.3 + imp * 0.12)); audio.thump(Math.min(1, 0.35 + imp * 0.1)); toast(`Навал: ${p.name}!`); wear(b, 0, 0.01 * imp); } } }
  // суда-NPC и чужие лодки: толкаем только NPC (у владельца той лодки наших NPC нет); NPC-сапбордисты вылетают
  function npcPeers(list) { const peers = peerList(); if (!peers.length || npcFollow) return;
    for (const e of list) { const b = e.b; if (!e.model.root.visible || e.out) continue; const rb = e.R || radiusOf(b);
      for (const p of peers) { const q = p.b, dx = b.X - q.X, dy = b.Y - q.Y, d = Math.hypot(dx, dy), R = rb + radiusOf(q); if (d >= R || d < 0.01) continue;
        const nx = dx / d, ny = dy / d, rel = (b.vx - q.vx) * nx + (b.vy - q.vy) * ny; b.X += nx * (R - d); b.Y += ny * (R - d);
        if (rel < 0) { b.vx -= rel * nx * 1.3; b.vy -= rel * ny * 1.3; } if (-rel > FLING_V) knock(e, nx, ny, -rel, false); } } }
  // удар от чужого игрока: он видел столкновение у себя -- верим и вылетаем (если ещё на доске)
  function onHit(m) { const P = G.player; if (G.mode === 'menu' || !P.b.kind) return; const i = +m.i || 0, d = Math.hypot(m.vx, m.vy) || 1;
    if (i > FLING_V && knock(P, m.vx / d, m.vy / d, i, true) && m.n) toast(`${m.n} сбил вас с доски!`); }

  // ---------- износ и ремонт ----------
  // wearA -- парус, весло или мотор (падает тяга), wearH -- корпус (растёт сопротивление). Копится от ошибок и нагрузки,
  // восстанавливается у зелёного буя на дистанции или у причала: стоять рядом на малом ходу.
  const pitMark = makeMark(0x35c96a); pitMark.visible = false; scene.add(pitMark); let pit = null, pitTold = false;
  const wear = (b, a, h) => { b.wearA = clamp((b.wearA || 0) + a, 0, 1); b.wearH = clamp((b.wearH || 0) + h, 0, 1); };
  // Ресурс помнится между заходами (у каждого снаряда свой). На нуле лодка «сломана»: brkA -- парус/мотор/весло почти не
  // тянут, brkH -- корпус набрал воды: тяжелее, хуже слушается руля, легче ложится на борт. Полностью ресурс
  // возвращает финиш в онлайн-гонке (без сети -- половину) и зелёный буй на дистанции; причал в бухте латает только до 50%.
  const loadWear = (e) => { const w = (store.get('wear') || {})[e.id]; if (Array.isArray(w)) { e.b.wearA = clamp(+w[0] || 0, 0, 1); e.b.wearH = clamp(+w[1] || 0, 0, 1); } };
  const saveWear = () => { const P = G.player, all = store.get('wear') || {}; all[P.id] = [+(P.b.wearA || 0).toFixed(3), +(P.b.wearH || 0).toFixed(3)]; store.set('wear', all); };
  const isBroken = (b) => Math.max(b.wearA || 0, b.wearH || 0) >= 0.995;
  const brokenStored = (id) => { const w = (store.get('wear') || {})[id]; return Array.isArray(w) && Math.max(+w[0] || 0, +w[1] || 0) >= 0.995; };
  loadWear(yacht); let brokeTold = false, wearSaveT = 0;
  // финиш гонки чинит лодку: онлайн -- полностью, без сети -- наполовину. Возвращает строку для протокола
  function raceRepair(online) { const b = G.player.b, before = Math.max(b.wearA || 0, b.wearH || 0); if (before < 0.01) return '';
    const k = online ? 0 : 0.5; b.wearA = (b.wearA || 0) * k; b.wearH = (b.wearH || 0) * k; saveWear(); brokeTold = false; audio.chime();
    return online ? ' · ресурс восстановлен полностью' : ` · ресурс +${Math.round((before - Math.max(b.wearA, b.wearH)) * 100)}% (в онлайн-гонке — полностью)`; }
  function repairRace() { audio.start(); sel = G.player.id || 'yacht'; store.set('craft', sel); refreshMenu(); if (sel === 'yacht') A.startRace(); else startRace2(); }
  function setPit(p, r, mark) { pit = p ? { ...p, r } : null; pitMark.visible = !!(p && mark); pitTold = false; }
  function wearEvent(ev, b) { const t = ev.type;
    if (t === 'gybe' && ev.power > 0.8) wear(b, 0.05 * ev.power, 0); else if (t === 'capsize') wear(b, 0.05, 0.02); else if (t === 'aground') wear(b, 0, 0.08);
    else if (t === 'crab') wear(b, 0.05, 0); else if (t === 'land' && ev.impact > 5) wear(b, 0, 0.012 * ev.impact / 5); }
  function stepWear(dt, b, sp) { const m = b.spec && b.spec.cls;
    if (!b.capsized) { if (!b.kind) wear(b, dt * (0.0035 * b.luff * b.aws / 8 + 0.0005 * (b.aws / 8) ** 2), dt * 0.0002 * sp); else if (m === 'motor') wear(b, dt * 0.0022 * b.thr * b.thr, dt * 0.0002 * sp / 5); else wear(b, dt * 0.0006 * (b.st ? 1 : 0), dt * 0.0001); }
    b.brkA = smooth(0.9, 1, b.wearA || 0); b.brkH = smooth(0.9, 1, b.wearH || 0);
    if (isBroken(b)) { if (!brokeTold) { brokeTold = true; toast('Ресурс 0%: лодка теряет ход и управление. Восстановите его в гонке'); audio.thump(0.5); } } else brokeTold = false;
    if ((wearSaveT -= dt) <= 0) { wearSaveT = 3; saveWear(); }
    if (pit) { if (pitMark.visible) { pitMark.position.set(pit.X, G.waves.sample(pit.X, -pit.Y, G.t, 1, WS).h - 0.25, -pit.Y); }
      const fl = G.mode === 'free' ? 0.5 : 0; // у причала -- только залатать
      if (Math.hypot(b.X - pit.X, b.Y - pit.Y) < pit.r && sp < 3.5 && (b.wearA > fl + 0.01 || b.wearH > fl + 0.01)) { b.wearA = Math.max(Math.min(b.wearA, fl), (b.wearA || 0) - dt * 0.22); b.wearH = Math.max(Math.min(b.wearH, fl), (b.wearH || 0) - dt * 0.22);
        if (!pitTold) { pitTold = true; toast(fl ? 'Латаем у причала… (до 50%, полностью — в гонке)' : 'Ремонт… стойте рядом'); } if (b.wearA <= fl + 0.01 && b.wearH <= fl + 0.01) { toast(fl ? 'Залатали до 50%. Полностью ресурс восстанавливается в гонке' : 'Ресурс восстановлен'); audio.chime(); saveWear(); } } }
    if (G.frame % 20 === 0) { const a = b.wearA || 0, h = b.wearH || 0, el = $('wear'); el.textContent = a > 0.03 || h > 0.03 ? `${!b.kind ? 'парус' : m === 'motor' ? 'мотор' : 'весло'} ${Math.round(100 - a * 100)}% · корпус ${Math.round(100 - h * 100)}%` : ''; el.className = a > 0.5 || h > 0.5 ? 'bad' : ''; } }

  // ---------- соревнования гребных и моторных ----------
  function deepLine(S, dir, len) { for (let a = 0; a <= len; a += 40) if (G.h(S.X + dir.x * a, S.Y + dir.y * a) > -5) return false; return true; }
  function startRace2() {
    leaveModes(); setPlayer(sel); const id = sel, sp = SPECS[id], motor = sp.cls === 'motor', D = motor ? 900 : { kayak: 500, scull: 1000, sup: 200 }[id];
    let S = { X: 250, Y: -900 }, th = G.wind.dir0 + Math.PI / 2, dir = null;
    for (let k = 0; k < 16 && !dir; k++) { const t = th + (k % 8) * (Math.PI / 4), d = { x: Math.sin(t), y: Math.cos(t) }; if (deepLine(S, d, D + 80)) { dir = d; th = t; } else if (k === 7) S = { X: 250, Y: -1800 }; }
    if (!dir) dir = { x: Math.sin(th), y: Math.cos(th) };
    const cr = { x: Math.cos(th), y: -Math.sin(th) }, lane = motor ? 14 : id === 'scull' ? 9 : 6, pt = (a, l) => ({ X: S.X + dir.x * a + cr.x * l, Y: S.Y + dir.y * a + cr.y * l });
    if (!rivalsBy[id]) rivalsBy[id] = RIVALS.map((r) => mkEntity(id, r[2], r[0], r[1]));
    const all = [G.player, ...rivalsBy[id]], gates = [];
    if (motor) for (let i = 0; i < 8; i++) gates.push(pt(110 + i * 95, (i % 2 ? -1 : 1) * 38));
    all.forEach((e, i) => { const l = (i - 1.5) * lane; A.placeBoat(e, pt(0, l).X, pt(0, l).Y, wrapPi(th), 0); e.leg = 0; e.time = 0; e.ai = {}; e.lane = l; show(e, true);
      e.course = motor ? gates.map((g, k) => ({ X: g.X + cr.x * (e === G.player ? 0 : (i - 1.5) * 3), Y: g.Y + cr.y * (e === G.player ? 0 : (i - 1.5) * 3), rad: 17, label: `знак ${k + 1}` })) : [];
      e.course.push({ X: pt(D, l).X, Y: pt(D, l).Y, line: D, label: 'финиш' }); });
    const mp = motor ? gates.concat([pt(D, -lane * 2.3), pt(D, lane * 2.3)]) : [pt(0, -lane * 2.4), pt(0, lane * 2.4), pt(D, -lane * 2.4), pt(D, lane * 2.4), pt(D / 2, -lane * 2.4), pt(D / 2, lane * 2.4)];
    while (marks.length < mp.length) { const m = makeMark(marks.length % 2 ? 0xffd21f : 0xff7a1a); scene.add(m); marks.push(m); }
    marks.forEach((m, i) => { m.visible = i < mp.length; if (mp[i]) m.userData.p = mp[i]; });
    G.race2 = { id, t: -5, S, dir, D, rivals: rivalsBy[id], all, over: false, beep: 9, motor, name: COMPETE[id][0] };
    setPit(pt(D * 0.45, (motor ? 1 : -1) * lane * 3.4), 14, true);
    // Онлайн-заезд: все, кто выбрал тот же снаряд и ту же погоду, попадают в одну комнату и стартуют одновременно --
    // заезды уходят по серверным часам каждые 30 секунд. На старте свободные места до четырёх занимают NPC.
    // Онлайн-заезд: лобби на сервере ждёт игроков WAIT секунд (или 3 секунды после «Старт сейчас»), опоздавшие
    // попадают в следующее. Пока ждём -- все стоят на старте и видят друг друга; дорожка -- по порядку входа в лобби.
    { const R = G.race2, place = (slot) => { const l = ((slot % 9) - 4) * lane * 0.8 + lane * 0.4; A.placeBoat(G.player, pt(0, l).X, pt(0, l).Y, wrapPi(th), 0); G.player.course[G.player.course.length - 1] = { X: pt(D, l).X, Y: pt(D, l).Y, line: D, label: 'финиш' }; };
      if (lobbyStart(R, id, place)) { R.beep = 99; place(0); } }
    G.mode = 'race2'; G.race = null; A.showGame(true); A.setRivals(false); $('race').hidden = false; $('brief').hidden = true; G.camYaw = wrapPi(th); A.resetView(); G.modeT = 0;
  }
  function stepRace2(dt) { const R = G.race2; const was = R.t; if (R.online) R.t = (net.now() - R.T0) / 1000; else R.t += dt;
    if (R.online && was < 0 && R.t >= 0) { const peers = racePeers(R), keep = Math.max(0, 3 - peers); // минимум четверо на старте
      R.rivals.forEach((e, i) => { if (i >= keep) { show(e, false); e.out = true; } }); R.all = R.all.filter((e) => !e.out); if (peers) toast(`Марш! Соперников онлайн: ${peers}`); } if (R.t < 0) { const s = Math.ceil(-R.t); if (s !== R.beep) { R.beep = s; audio.beep(false); } return; }
    if (R.beep !== 0) { R.beep = 0; audio.horn(); toast('Марш!'); }
    for (const e of R.all) { if (e.time) continue; const c = e.course[e.leg], b = e.b;
      const hit = c.line !== undefined ? (b.X - R.S.X) * R.dir.x + (b.Y - R.S.Y) * R.dir.y >= c.line : Math.hypot(c.X - b.X, c.Y - b.Y) < c.rad;
      if (hit) { e.leg++; if (e === G.player && e.leg < e.course.length) audio.chime(); if (e.leg >= e.course.length) { e.time = R.t; if (e === G.player) finish2(); } } }
    for (let i = 0; i < R.all.length; i++) for (let j = i + 1; j < R.all.length; j++) { const a = R.all[i].b, b = R.all[j].b, dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy), rr = a.hl * 0.9 + (R.motor ? 0.6 : 0.2);
      if (d < rr && d > 0.01) { const p = (rr - d) / 2 / d; a.X -= dx * p; a.Y -= dy * p; b.X += dx * p; b.Y += dy * p;
        const nx = dx / d, ny = dy / d, rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // rel < 0 -- сближаются
        if (rel < 0) { a.vx += rel * nx * 0.6; a.vy += rel * ny * 0.6; b.vx -= rel * nx * 0.6; b.vy -= rel * ny * 0.6; }
        if (-rel > FLING_V) { const ea = R.all[i], eb = R.all[j]; knock(ea, -nx, -ny, -rel, ea === G.player); knock(eb, nx, ny, -rel, eb === G.player); } } }
    npcPeers(R.all.filter((e) => e !== G.player)); }
  function finish2() { const R = G.race2; R.over = true; audio.horn(); const P = G.player, prog = (e) => (e.time ? 1e6 - e.time : e.leg * 1e4 + (e.b ? (e.b.X - R.S.X) * R.dir.x + (e.b.Y - R.S.Y) * R.dir.y : -5e3));
    const key = 'best2.' + R.id, best = store.get(key), rec = !best || P.time < best; if (rec) store.set(key, P.time); R.fix = raceRepair(R.online);
    ach({ kayak: 'k_sprint', scull: 's_race', sup: 'p_race', jetski: 'j_slalom', boat: 'b_slalom' }[R.id]);
    // протокол перерисовывается, пока финишируют остальные (сервер шлёт их результаты раз в секунду)
    R.redraw = () => { const all = [...R.all, ...onlineRows(R, false)].sort((a, b) => prog(b) - prog(a)), place = all.indexOf(P) + 1;
      $('rh').textContent = place === 1 ? 'Победа!' : place + '-е место'; $('rs').textContent = `${R.name}${R.online ? ' · онлайн' : ''} · ваше время ${A.fmt(P.time)}` + (rec ? ' · личный рекорд' : best ? ` · рекорд ${A.fmt(best)}` : '') + R.fix;
      $('rt').innerHTML = all.map((e, i) => `<tr class="${e === P ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.time ? A.fmt(e.time) : e.off ? 'вышел' : 'в пути'}</td></tr>`).join(''); };
    R.redraw(); setTimeout(() => { if (G.race2 === R) $('result').hidden = false; }, 1500); }

  // ---------- сплав ----------
  function startRiver() { leaveModes(); G.mode = 'river'; G.race = null; setPlayer('kayak'); if (!river) river = makeRiver(scene, G.far.userData.heightAt); river.show(true);
    flow.at = river.flowAt; flow.surf = river.surf; flow.rough = river.rough; const p = river.startPose(); A.placeBoat(G.player, p.X, p.Y, p.th, 1.5); G.player.b.y = p.z; G.player.b.base = p.z; show(G.player, true);
    A.showGame(true); A.setRivals(false); $('race').hidden = false; $('brief').hidden = true; G.camYaw = p.th; A.resetView(); G.rv = { t: 0, hits: 0, over: false, cool: 0 }; G.modeT = 0;
    toast(`${river.name}: ${Math.round(river.len / 10) * 10} м, перепад ${Math.round(river.drop)} м`); }
  function stepRiver(dt, b) { const rv = G.rv, pr = river.progress(b.X, b.Y); river.tick(G.t); rv.pr = pr; rv.cool -= dt; if (!rv.over) rv.t += dt;
    const hit = !b.capsized && river.hitRock(b);
    // камень всегда выталкивает лодку и гасит встречную скорость (она соскальзывает вбок); «касание» считается не чаще раза в секунду
    if (hit) { b.X += hit.nx * hit.pen; b.Y += hit.ny * hit.pen; const vn = b.vx * hit.nx + b.vy * hit.ny; if (vn < 0) { b.vx -= 1.2 * vn * hit.nx; b.vy -= 1.2 * vn * hit.ny; } }
    if (hit && rv.cool <= 0) { rv.cool = 1; rv.hits++; wear(b, 0, 0.07); b.vx *= 0.75; b.vy *= 0.75; b.p += (Math.random() < 0.5 ? -1 : 1) * 2.0;
      G.shake = Math.max(G.shake, 0.6); audio.thump(0.8); toast('Камень!'); for (let i = 0; i < 24; i++) G.spray.emit(b.X, b.y + 0.2, -b.Y, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5, 1.5, 1); }
    if (pr.rap > 0.25 && Math.random() < dt * 30 * pr.rap) { const fx = Math.sin(b.th), fz = -Math.cos(b.th); G.spray.emit(b.X + fx * 2, b.y + 0.15, -b.Y + fz * 2, b.vx * 0.5 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, -b.vy * 0.5 + (Math.random() - 0.5) * 3, 1.5, 2, Math.random() < 0.3 ? 1 : 0); }
    if (!rv.over && pr.s >= river.len) { rv.over = true; audio.horn(); ach('k_river'); if (!rv.hits) ach('k_clean'); const key = 'best.river', best = store.get(key), rec = !best || rv.t < best; if (rec) store.set(key, rv.t);
      $('rh').textContent = 'Сплав пройден'; $('rs').textContent = `${river.name} · время ${A.fmt(rv.t)} · касаний камней: ${rv.hits}` + (rec ? ' · личный рекорд' : ` · рекорд ${A.fmt(best)}`); $('rt').innerHTML = ''; setTimeout(() => { if (G.rv === rv) $('result').hidden = false; }, 1500); } }

  // ---------- старт в произвольном месте, в том числе на горе ----------
  function nearestWater(X, Y) { for (let r = 300; r < 90000; r += 300) for (let a = 0; a < 6.283; a += 0.2) { const x = X + Math.sin(a) * r, y = Y + Math.cos(a) * r; if (G.h(x, y) < -4) return { X: x, Y: y }; } return { X: 0, Y: -600 }; }
  function stepGag(dt, b) { const ht = G.h(b.X, b.Y); if (!G.gag) { if (ht < 8) return; G.gag = { t: 0, stuck: 0, top: ht }; toast(`Судно на высоте ${Math.round(ht + 1601)} м над морем. Спускаем на воду…`); }
    const g = G.gag; g.t += dt; if (ht < -1.2) { G.gag = null; b.aground = false; b.base = 0; b.phi = 0; ach('m_peak'); toast('На воде!'); audio.splash(1); return; }
    const e = 40, gx = G.h(b.X + e, b.Y) - G.h(b.X - e, b.Y), gy = G.h(b.X, b.Y + e) - G.h(b.X, b.Y - e), n = Math.hypot(gx, gy), sl = n / (2 * e);
    if (sl < 0.004) g.stuck += dt; else g.stuck = 0;
    if (g.stuck > 2.5 || g.t > 45) { const w = nearestWater(b.X, b.Y); b.X = w.X; b.Y = w.Y; toast('Застряли. Вертолёт МЧС доставил судно на воду'); return; }
    const dx = n ? -gx / n : 0, dy = n ? -gy / n : 1, v = clamp(20 + ht * 0.09, 20, 120); b.X += dx * v * dt; b.Y += dy * v * dt; b.vx = b.vy = 0; b.aground = true; b.agT = 0;
    b.th = wrapPi(b.th + clamp(wrapPi(Math.atan2(dx, dy) - b.th), -3 * dt, 3 * dt)); const h2 = G.h(b.X, b.Y); b.base = Math.max(h2, 0); b.y = Math.max(h2, 0) + 0.4; b.pitch = -Math.atan(sl) * 0.8; b.phi = Math.sin(g.t * 9) * 0.06;
    G.shake = Math.max(G.shake, 0.18); if (Math.random() < dt * 30) G.spray.emit(b.X, b.y, -b.Y, (Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6, 2, 1, 1); }

  // ---------- меню ----------
  function refreshMenu() { for (const c of $('crafts').children) c.setAttribute('aria-pressed', c.dataset.id === sel);
    $('brace').innerHTML = `${COMPETE[sel][0]}<small>${COMPETE[sel][1]}</small>`; $('briver').hidden = sel !== 'kayak';
    $('how').innerHTML = sel === 'yacht' ? yachtHow : HOW[sel].replace(/<b>Пробел<\/b>/g, TOUCH ? `кнопка <b>«${SPECS[sel].key}»</b>` : '<b>Пробел</b>').replace(/<b>← →<\/b>/g, TOUCH ? '<b>касание слева и справа</b>' : '<b>← →</b>');
    $('bmap').textContent = startAt ? `Место: ${startAt.label}` : 'Место: Чолпон-Ата';
    const br = brokenStored(sel); $('brace').classList.toggle('pulse', br); $('brace').title = br ? 'Ресурс 0% — финиш в гонке восстановит его' : ''; }
  function buildMenu() { yachtHow = $('how').innerHTML;
    for (const id of CRAFT_ORDER) { const i = info(id), b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'c_' + id; b.innerHTML = `<b>${SHORT[id]}</b><small>${i.sub}</small>`; b.title = i.name; b.onclick = () => { sel = id; store.set('craft', id); refreshMenu(); }; $('crafts').appendChild(b); }
    $('briver').onclick = () => { audio.start(); startRiver(); }; $('bjournal').onclick = () => { $('journal').hidden = false; }; $('jclose').onclick = () => { $('journal').hidden = true; };
    $('bmap').onclick = openMap; $('mclose').onclick = () => { $('mapdlg').hidden = true; }; $('mreset').onclick = () => { startAt = null; $('mapdlg').hidden = true; refreshMenu(); };
    const nm = $('pname'), setName = (v) => { name = v; store.set('name', v); };
    nm.value = name; nm.addEventListener('input', () => { const v = nm.value.replace(/\s+/g, ' ').trim().slice(0, 16); if (v) setName(v); });
    nm.addEventListener('blur', () => { nm.value = name; }); nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    $('pdice').onclick = () => { setName(randomName()); nm.value = name; };
    $('lgo').onclick = () => { net.go(); $('lgo').hidden = true; };
    $('brepair').onclick = repairRace; $('bhook').onclick = () => hook.press(G.player); $('bhook').addEventListener('pointerdown', (e) => e.stopPropagation());
    $('bfriends').onclick = openFriends; $('mfriends').onclick = openFriends; $('fclose').onclick = () => { $('fdlg').hidden = true; };
    $('fshare').onclick = () => shareLink(myLink(), `${name} зовёт вас на Иссык-Куль: «Парус Иссык-Куля»`);
    $('mshare').onclick = () => { if (!startAt) return; const u = baseUrl(); u.searchParams.set('at', `${Math.round(startAt.X)},${Math.round(startAt.Y)}`); u.searchParams.set('pt', '1'); u.searchParams.set('p', G.preset); u.searchParams.set('f', fid); u.searchParams.set('n', name);
      shareLink(u.toString(), `Поплыли отсюда: ${startAt.label} — «Парус Иссык-Куля»`); };
    journal(); refreshMenu(); }
  // карта котловины: клик задаёт место старта
  function openMap() { const g = G.far.userData.grid, cv = $('mapcv'), c = cv.getContext('2d'); cv.width = g.W; cv.height = g.H; const im = c.createImageData(g.W, g.H);
    for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) { const h = g.hs[j * g.W + i], q = (j * g.W + i) * 4, sh = clamp(0.75 + (h - (g.hs[j * g.W + Math.min(i + 1, g.W - 1)])) / 400, 0.45, 1.15); let r, gg, b;
      if (h < 0) { r = 22; gg = 92; b = 170; } else if (h > 2100) { r = gg = b = 245 * sh; } else if (h > 1300) { r = 150 * sh; gg = 140 * sh; b = 130 * sh; } else if (h > 500) { r = 110 * sh; gg = 140 * sh; b = 80 * sh; } else { r = 205 * sh; gg = 185 * sh; b = 130 * sh; }
      im.data[q] = r; im.data[q + 1] = gg; im.data[q + 2] = b; im.data[q + 3] = 255; }
    c.putImageData(im, 0, 0); const px = (X, Y) => [(X - g.X0) / g.STEP, (g.Y1 - Y) / g.STEP], dot = (X, Y, col, r = 4) => { const [x, y] = px(X, Y); c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); };
    dot(0, 0, '#ff7a1a'); if (startAt) dot(startAt.X, startAt.Y, '#ffd21f', 5);
    $('mshare').hidden = !startAt; $('mapinfo').textContent = startAt ? `Выбрано: ${startAt.label}` : 'Нажмите на карту. Оранжевая точка — Чолпон-Ата.'; $('mapdlg').hidden = false;
    cv.onclick = (ev) => { const r = cv.getBoundingClientRect(), X = g.X0 + ((ev.clientX - r.left) / r.width) * g.W * g.STEP, Y = g.Y1 - ((ev.clientY - r.top) / r.height) * g.H * g.STEP, h = G.h(X, Y), d = Math.hypot(X, Y) / 1000;
      const az = (Math.atan2(X, Y) / DEG + 360) % 360, dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(az / 45) % 8];
      startAt = { X, Y, land: h > -2, label: `${d.toFixed(0)} км к ${dirs} · ${h > -2 ? `суша, ${Math.round(h + 1601)} м` : 'озеро'}` }; refreshMenu(); openMap(); }; }

  // ---------- лобби онлайн-заезда ----------
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const curOnline = () => (G.race2 && G.race2.online ? G.race2 : G.race && G.race.online ? G.race : null);
  // начать онлайн-заезд: true -- лобби запрошено, заезд ждёт игроков; place(slot) ставит игрока на его место у старта
  function lobbyStart(R, k, place) { if (!net.ready()) return false; R.online = true; R.room = null; R.lobby = null; R.slot = -1; R.T0 = net.now() + WAIT[k] * 1000; R.t = -WAIT[k]; R.place = place;
    net.join(k, G.preset + (G.ts === 1 ? '' : ':mini')); lobbyUI(R); return true; } // макеты гоняются только с макетами
  function onLobby(m) { const R = curOnline(); if (!R) return; if (R.t >= 0) { if (m.room === R.room) { R.lobby = m; if (R.over && R.redraw) R.redraw(); } return; }
    const t0 = R.T0; R.room = m.room; R.T0 = m.T0; R.lobby = m; // R.t пересчитает шаг заезда: так он сам заметит переход через ноль
    const me = m.list.find((x) => x.id === net.st.id); if (me && me.slot !== R.slot) { R.slot = me.slot; if (R.place) R.place(me.slot); }
    if (R.onT0 && t0 !== R.T0) R.onT0(); if (m.go && t0 - R.T0 > 1000) { toast('Старт через 3 секунды!'); audio.beep(true); } lobbyUI(R); }
  // обрыв связи -- не повод бросать заезд: ждём переподключения минуту (сервер держит место), потом -- без сети
  function onDown() { const R = curOnline(); if (R) toast('Связь потеряна — переподключаемся…'); }
  function goOffline(R) { R.online = false; if (G.race2 && R.t < 0) R.t = -5; lobbyUI(null); toast('Нет связи с сервером — заезд без сети'); }
  // соперники-люди для протокола и места в гонке: все участники лобби (с сервера), даже кого не видно рядом;
  // кого видно -- берём свежие этап, время и положение прямо из его пакетов
  function onlineRows(R, regatta) { if (!R.online) return [];
    const src = R.lobby ? R.lobby.list.filter((x) => x.id !== net.st.id) : peerList().map((p) => ({ id: p.id, n: p.name, r: p.r }));
    return src.map((x) => { const p = net.pups.get(x.id), vis = p && p.model.root.visible && p.w === R.room, r = (vis ? p.r : x.r) || [0, 0], time = r[1] || 0;
      return { name: x.n || 'Игрок', leg: regatta ? (time ? 4 : Math.min(3, r[0] || 0)) : time ? 99 : r[0] || 0, time, b: vis ? p.b : null, off: x.off, net: true }; }); }
  const racePeers = (R) => (R.lobby ? R.lobby.list.length - 1 : peerList().length);
  // кто ведёт NPC за всех. Акватория: хозяин -- игрок с меньшим номером рядом (до 1200 м, отпускаем дальше 2000 м).
  // Заезд: хозяин -- участник лобби с меньшим номером, кто сейчас на связи. Остальные двигают свои модели по его данным.
  function npcRole() { const me = net.st.id, P = G.player.b; npcFollow = null;
    if (!net.st.up) { npcHost = 0; return; }
    const on = curOnline();
    if (G.mode === 'free' && traffic) { let h = npcHost ? net.pups.get(npcHost) : null; const ok = (p, R) => p && p.npc && p.w === G.world && p.model.root.visible && p.id < me && Math.hypot(p.b.X - P.X, p.b.Y - P.Y) < R;
      if (!ok(h, 2000)) { h = null; for (const p of net.pups.values()) if (ok(p, 1200) && (!h || p.id < h.id)) h = p; }
      npcHost = h ? h.id : 0; if (h) npcFollow = h.npc; return; }
    if (on && on.lobby) { let id = me; for (const x of on.lobby.list) if (!x.off && x.id < id) id = x.id; const h = id !== me ? net.pups.get(id) : null;
      npcHost = h && h.npc && h.model.root.visible ? id : 0; if (npcHost) npcFollow = h.npc; return; }
    npcHost = 0; }
  // что шлём сами: NPC, которых ведём (акватория -- если не ведомые; заезд -- если мы хозяин лобби)
  function npcOut() { if (npcFollow) return null; const on = curOnline();
    if (G.mode === 'free' && traffic) return traffic.civ.map(encNpc);
    if (on && on.lobby && on.room) { let id = net.st.id; for (const x of on.lobby.list) if (!x.off && x.id < id) id = x.id; if (id === net.st.id) return (G.race2 ? G.race2.rivals : G.rivals).map(encNpc); }
    return null; }
  // соперники-NPC в заезде у ведомого: не считаем физику, а тянем к положению у хозяина
  function followRivals(dt) { const R = G.race2 || G.race; if (!R || !npcFollow) return; const list = G.race2 ? G.race2.rivals : G.rivals;
    list.forEach((e, i) => { const s = npcFollow[i]; if (!s || e.out || !e.model.root.visible) return; followNpc(e, s, dt); e.b.updatePose(G.waves, G.t, G.h); e.model.update(e.b, dt, G.t); e.wake.update(e.b, dt, G.t, G.waves); e.b.events.length = 0; }); }
  function lobbyUI(R) { const el = $('lobby'); if (!R || !R.online || R.t >= 0) { el.hidden = true; return; } el.hidden = false;
    const L = R.lobby, list = L ? L.list : [{ id: net.st.id, n: name }], left = Math.max(0, Math.ceil(-R.t));
    $('lbt').textContent = !net.st.up ? 'Нет связи — переподключаемся…' : !R.room ? 'Ищем заезд…' : L.go || left <= 3 ? `Старт через ${left}` : `Ждём игроков · ${A.fmt(-R.t)}`;
    $('lbn').innerHTML = `В заезде ${list.length}: ` + list.map((x) => (x.id === net.st.id ? `<b>${esc(x.n || name)}</b>` : x.off ? `<s>${esc(x.n || 'Игрок')}</s>` : esc(x.n || 'Игрок'))).join(', ') + (list.length < 4 ? ` · ещё ${4 - list.length} — NPC` : '');
    $('lgo').hidden = !R.room || (L && L.go) || -R.t <= 3.2; }

  // ---------- друзья: ссылка-приглашение и телепорт ----------
  // Ссылка несёт открытый номер игрока (f), имя и место на озере (at), погоду (p). Открыл -- игра сразу стартует
  // свободным плаванием рядом с другом: сначала в точке из ссылки, а как только сервер скажет, где друг сейчас, --
  // рядом с ним. Пришедший по ссылке и пригласивший записывают друг друга в друзья (сервер передаёт привет).
  // Ссылка на точку с карты (pt=1) просто ставит место старта.
  const baseUrl = () => new URL(location.origin + location.pathname);
  function myLink() { const b = G.player.b, u = baseUrl(); u.searchParams.set('f', fid); u.searchParams.set('n', name); u.searchParams.set('p', G.preset);
    if (G.mode === 'free') u.searchParams.set('at', `${Math.round(b.X)},${Math.round(b.Y)}`); return u.toString(); }
  async function shareLink(url, text) {
    try { if (navigator.share) { await navigator.share({ title: 'Парус Иссык-Куля', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — вставьте её в мессенджер'); return; } catch (e) { /* буфер обмена недоступен -- покажем ссылку */ }
    $('fdlg').hidden = false; $('fnote').innerHTML = `Скопируйте ссылку и отправьте другу:<input id="flink" readonly value="${esc(url)}">`; const el = $('flink'); el.focus(); el.select(); }
  function water(X, Y) { for (const r of [22, 34, 50, 80, 130]) for (let k = 0; k < 12; k++) { const a = k * 0.5236 + r, x = X + Math.sin(a) * r, y = Y + Math.cos(a) * r; if (G.h(x, y) < -3) return { X: x, Y: y }; } return nearestWater(X, Y); }
  function teleportTo(X, Y, th, pr, who) { hook.release(null);
    if (G.mode === 'race' || G.mode === 'race2' || G.mode === 'river') { toast('Телепорт — из свободного плавания. Сначала выйдите из гонки'); return; }
    if (pr && pr !== G.preset && PRESETS[pr]) { A.setPreset(pr); toast(`Погода как у друга: ${PRESETS[pr].name}`); }
    if (G.mode !== 'free') A.startFree();
    const w = water(X, Y), h = Number.isFinite(th) ? th : A.openWaterHeading(w.X, w.Y); A.placeBoat(G.player, w.X, w.Y, h, 0.6); G.gag = null; G.camYaw = h; A.resetView();
    if (traffic) traffic.relocate(w.X, w.Y, 0, G.shore.pierY - 50); if (who) toast(`Вы рядом с ${who}`); $('fdlg').hidden = true; }
  function openFriends() { $('fdlg').hidden = false; $('fnote').textContent = 'Отправьте ссылку другу в мессенджер: откроет её — и его лодка появится рядом с вашей.'; drawFriends(); if (friends.length && net.ready()) net.find(friends.map((x) => x.fid)); }
  function drawFriends() { const el = $('flist');
    if (!friends.length) { el.innerHTML = '<p class="note">Друзей пока нет. Кто откроет вашу ссылку, появится здесь — и вы сможете к нему телепортироваться.</p>'; return; }
    el.innerHTML = friends.map((x) => { const st = fstat.get(x.fid), can = st && st.on && st.w === G.world;
      const t = !net.st.up ? 'нет связи с сервером' : !st ? 'ищем…' : !st.on ? 'не в сети' : st.w === G.world ? 'на озере' : st.w === 'lake' || st.w === 'mini' ? (st.w === 'mini' ? 'в макете (?scale)' : 'в обычном мире') : st.w === 'race' ? 'в гонке' : 'на реке';
      return `<div class="fr"><b>${esc(st && st.n ? st.n : x.n)}</b><span class="${can ? 'on' : ''}">${t}</span><button class="chip" data-fid="${esc(x.fid)}" ${can ? '' : 'disabled'}>Телепорт</button></div>`; }).join('');
    for (const bt of el.querySelectorAll('button[data-fid]')) bt.onclick = () => { const st = fstat.get(bt.dataset.fid); if (st && st.on && st.w === G.world) { audio.start(); teleportTo(st.X, st.Y, st.th, st.pr, st.n); } }; }
  function onFound(list) { for (const x of list) { fstat.set(x.fid, x); if (x.on && x.n) addFriend(x.fid, x.n); }
    if (pendingTp) { const x = list.find((y) => y.fid === pendingTp.fid); if (x) { const n = x.n || pendingTp.n || 'другом'; pendingTp = null;
      if (x.on && x.w === G.world) { if (Math.hypot(x.X - G.player.b.X, x.Y - G.player.b.Y) > 120) teleportTo(x.X, x.Y, x.th, x.pr, n); else toast(`Вы рядом с ${n}`); }
      else toast(x.on ? `${n} сейчас в гонке — вы на его месте старта` : `${n} сейчас не в сети — вы там, где он был`); } }
    if (!$('fdlg').hidden) drawFriends(); }
  function onFriend(m) { if (addFriend(m.fid, m.n)) { toast(`${m.n || 'Друг'} пришёл по вашей ссылке — теперь вы друзья`); audio.chime(); } }
  // сервер отвечает на поиск сразу; спрашиваем, пока не ответит (ссылка разбирается позже, чем открывается связь)
  let askT = -9; function onUp() { askT = G.t; if (pendingFriend) { net.friend(pendingFriend); pendingFriend = null; } if (pendingTp) net.find([pendingTp.fid]); }
  // открыта ссылка-приглашение: разбираем один раз и убираем из адреса, чтобы перезагрузка не повторяла
  function openLink() { const q = new URLSearchParams(location.search), f = (q.get('f') || '').slice(0, 16), at = q.get('at'), p = q.get('p'), n = (q.get('n') || '').replace(/\s+/g, ' ').trim().slice(0, 16), point = q.get('pt') === '1';
    if (!f && !at) return; try { history.replaceState(null, '', location.pathname); } catch (e) { /* адрес не поменять -- не страшно */ }
    if (p && PRESETS[p] && p !== G.preset) A.setPreset(p);
    const xy = at ? at.split(',').map(Number) : null, ok = xy && xy.length === 2 && xy.every((v) => Number.isFinite(v) && Math.abs(v) < 200000);
    if (f && f !== fid) { addFriend(f, n); pendingFriend = f; }
    if (point && ok) { startAt = { X: xy[0], Y: xy[1], land: G.h(xy[0], xy[1]) > -2, label: `от ${n || 'друга'}` }; refreshMenu(); A.startFree(); toast(`${n || 'Друг'} поделился местом на карте`); }
    else { A.startFree(); if (ok) teleportTo(xy[0], xy[1], undefined, null, null); if (f && f !== fid) { pendingTp = { fid: f, n }; toast(`${n || 'Друг'} зовёт вас — плывём к нему`); } }
    if (net.st.up) onUp(); }

  // ---------- абордажный крюк ----------
  const peerTarget = (id) => { const p0 = net.pups.get(id); if (!p0) return null; return { peerId: id, name: p0.name, local: false, body: () => { const p = net.pups.get(id); return p && p.model.root.visible ? p.b : null; } }; };
  function hookTargets() { const out = []; for (const p of peerList()) { const t = peerTarget(p.id); if (t) out.push(t); }
    const ent = (e, nm) => out.push({ name: nm, local: !npcFollow && e.phys !== false, inf: e.phys === false, body: () => (e.model.root.visible && !e.out ? e.b : null) });
    if (G.mode === 'free' && traffic) for (const e of traffic.list) if (e.model.root.visible) ent(e, NPC_NAME[e.type] || 'судно');
    if (G.race2) for (const e of G.race2.rivals) if (!e.out) ent(e, e.name);
    if (G.mode === 'race') for (const e of G.rivals) if (!e.out) ent(e, e.name);
    return out; }
  const hookOk = () => G.mode !== 'menu' && G.mode !== 'river' && !G.gag && !(G.race2 && G.race2.t < 0) && !(G.race && G.race.t < 0) && !G.player.b.capsized;
  function onHook(m) { hook.remote(m, peerTarget(m.from)); }

  const net = makeNet(scene, { ts: () => G.ts, waves: G.waves, h: G.h, active: () => G.mode !== 'menu', name: () => name, pid: () => pid, fid: () => fid, preset: () => G.preset, fling: () => [flSeq, ...flVel], npc: npcOut, onLobby, onHit, onDown, onUp, onFound, onFriend, onHook });
  const hook = makeHook(scene, { toast, audio, net, wear, targets: hookTargets, player: () => G.player, allowed: hookOk, shake: (v) => { G.shake = Math.max(G.shake, v); },
    splash: (b, v) => { for (let i = 0; i < 12 * Math.min(v, 4); i++) G.spray.emit(b.X + (Math.random() - 0.5) * 2, (b.y || 0) + 0.3, -b.Y + (Math.random() - 0.5) * 2, b.vx * 0.4 + (Math.random() - 0.5) * 4, 1.5 + Math.random() * 2.5, -b.vy * 0.4 + (Math.random() - 0.5) * 4, 1.5, 1); } });
  buildMenu();
  return {
    net, lobbyStart, lobbyUI, peerList, npcPeers, knock, onlineRows, racePeers, get name() { return name; }, get npcFollow() { return npcFollow; },
    wearEvent, pit: () => pit, ach, openLink, raceRepair, hookPress: () => hook.press(G.player), get hook() { return hook; }, get traffic() { return traffic; }, get sel() { return sel; },
    boats: (P) => (npcFollow && (G.race || G.race2) ? [P] : G.mode === 'race' ? [P, ...G.rivals.filter((r) => !r.out)] : G.race2 ? [P, ...G.race2.rivals] : [P]),
    th: () => (G.mode === 'river' && river ? river.h : G.hb), poseTh: () => (G.mode === 'river' && river ? river.h : G.h),
    filterCtl: (c) => ((G.race2 && G.race2.t < 0) ? { steer: 0, ease: false, left: false, right: false } : c),
    aiFor(e, dt) { const R = G.race2; if (R.t < 0 || e.time) return { steer: 0, ease: false, left: false, right: false, thr: 0 }; const c = e.course[e.leg];
      return R.motor ? aiMotor(e.b, c.X, c.Y, 0.72 + 0.28 * e.skill) : aiPaddle(e.b, c.X, c.Y, e.ai, dt, e.skill); },
    toMenuCraft() { if (G.mode !== 'menu') saveWear(); leaveModes(); for (const k in crafts) show(crafts[k], k === 'yacht'); G.player = yacht; document.body.classList.remove('motor'); refreshMenu(); },
    useYacht() { leaveModes(); setPlayer('yacht'); },
    compete() { if (sel === 'yacht') A.startRace(); else startRace2(); },
    onFreePre() { leaveModes(); setPlayer(sel); },
    onFree() { G.modeT = 0; const P = G.player; let cx = 0, cy = -600;
      if (startAt) { A.placeBoat(P, startAt.X, startAt.Y, A.openWaterHeading(startAt.X, startAt.Y), startAt.land ? 0 : 1); G.camYaw = P.b.th; if (!startAt.land) { cx = startAt.X; cy = startAt.Y; } }
      else if (P.b.kind) { P.b.vx *= 0.3; P.b.vy *= 0.3; }
      mkTraffic().relocate(cx, cy, 0, G.shore.pierY - 50); traffic.setActive(true); setPit({ X: 0, Y: G.shore.pierY - 25 }, 45, false); },
    markTarget() { const R = G.race2; if (!R || G.player.time) return null; return G.player.course[G.player.leg]; },
    hud() { const R = G.race2, P = G.player;
      if (R) { const c = P.course[Math.min(P.leg, P.course.length - 1)], fw = (e) => (e.b ? (e.b.X - R.S.X) * R.dir.x + (e.b.Y - R.S.Y) * R.dir.y : -5e3), all = [...R.all, ...onlineRows(R, false)].sort((a, b) => (b.leg - a.leg) || (fw(b) - fw(a)));
        txt('rtime', A.fmt(R.over ? P.time : R.t)); txt('rinfo', R.t < 0 ? 'до старта' : `${c.label} ${Math.hypot(c.X - P.b.X, c.Y - P.b.Y).toFixed(0)} м · ${all.indexOf(P) + 1}/${all.length}`); }
      else if (G.rv) { const pr = G.rv.pr; txt('rtime', A.fmt(G.rv.t)); txt('rinfo', pr ? `до финиша ${Math.max(0, river.len - pr.s).toFixed(0)} м · уклон ${(pr.slope * 100).toFixed(0)}% · камней: ${G.rv.hits}` : ''); } },
    hint(b, T) { const id = b.kind, key = TOUCH ? `«${SPECS[id].key}»` : 'пробел';
      const jk = TOUCH && b.spec.cls === 'motor' ? 'джойстик' : key;
      if (b.capsized) return [b.righting || b.noRight > 0 ? '' : { kayak: `Оверкиль! Держите ${key} — эскимосский переворот`, scull: `Перевернулись. Держите ${key} — забираемся в лодку`, sup: `Упали с доски. Держите ${key} — забираемся обратно`, jetski: `Сбросило. Держите ${jk} — забираемся на гидроцикл`, boat: `Держите ${jk}` }[id], true];
      if (G.gag) return ['', false]; if (b.aground) return ['Мель — стаскивает на глубину', true];
      if (G.race2 && G.race2.t < 0) return ['Приготовиться…', false];
      if (G.rv && G.rv.pr && G.rv.pr.rap > 0.45 && T > 6) return [`Порог! Держите нос по струе, ${key} — опора`, true];
      if (T < 12) return [{ kayak: TOUCH ? 'Касайтесь слева и справа по очереди, в ритм · «опора» держит на волне' : '← → гребок по очереди, в ритм · гребок слева уводит нос вправо · пробел — опора',
        scull: TOUCH ? '«гребок» — оба весла, не частите · касание слева и справа — подправить курс' : 'Пробел — гребок обоими вёслами, не частите · ← → подправить курс',
        sup: TOUCH ? 'Касайтесь слева и справа — гребок · «стойка» — присесть на волне' : '← → гребок слева и справа · пробел — присесть на волне',
        jetski: TOUCH ? 'Джойстик: куда тянете — туда и руль, дальше от центра — больше газа' : 'Пробел — газ · ← → руль, рулится только под газом',
        boat: TOUCH ? 'Джойстик: куда тянете — туда и штурвал, дальше от центра — больше газа' : 'Пробел — газ · ← → штурвал' }[id], false];
      if (b.spec.cls === 'paddle' && b.strokes > 5 && b.lastQ < 0.62 && b.tSince < 1.5) return [id === 'scull' ? 'Не частите: дайте вёслам вернуться на захват' : 'Не частите: гребок — пауза — гребок', false];
      return ['', false]; },
    craftEvent(ev, b) { const id = b.kind;
      if (ev.type === 'stroke') { audio.stroke(ev.q); if (id === 'kayak' && ev.streak >= 12) ach('k_cadence'); if (id === 'scull' && ev.streak >= 8) ach('s_run'); if (id === 'sup' && ev.alt >= 10) ach('p_switch'); }
      else if (ev.type === 'crab') { ach('s_crab'); toast('Поймал краба!'); G.shake = 0.6; audio.thump(0.6); }
      else if (ev.type === 'saved') ach(id === 'kayak' ? 'k_brace' : 'p_stance');
      else if (ev.type === 'surf') { if (id === 'kayak') ach('k_surf'); }
      else if (ev.type === 'plane') ach(id === 'jetski' ? 'j_plane' : 'b_plane');
      else if (ev.type === 'land') { b.afterLand(ev); const p = clamp(ev.impact / 6, 0.2, 1.4); audio.slap(p); G.shake = Math.max(G.shake, 0.35 * p); if (p > 0.6) A.lens(p * 8);
        for (let i = 0; i < 60 * p; i++) G.spray.emit(b.X, b.y + 0.2, -b.Y, b.vx * 0.4 + (Math.random() - 0.5) * 9, 2 + Math.random() * 4 * p, -b.vy * 0.4 + (Math.random() - 0.5) * 9, 2, 1, Math.random() < 0.2 ? 1 : 0);
        if (id === 'jetski') { if (ev.air >= 0.5) ach('j_jump'); if (ev.air >= 1) ach('j_big'); } }
      else if (ev.type === 'capsize') { G.shake = 1.2; audio.splash(1); A.lens(18); b.safe0 = b.dist; for (let i = 0; i < 90; i++) G.spray.emit(b.X, b.y + 0.2, -b.Y, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 2, 1); }
      else if (ev.type === 'righted') { audio.chime(); if (id === 'kayak') ach('k_roll'); }
      else if (ev.type === 'aground' && !G.gag) { G.shake = 0.6; audio.thump(0.8); if (G.mode !== 'river') toast('Сели на мель!'); } },
    // раз в кадр после физики
    after(P, dt, boats) { const b = P.b, sp = b.speed; const on = curOnline(); npcRole(); followRivals(dt);
      if (on) { if (net.st.up) on.lostAt = 0; else if (!on.lostAt) on.lostAt = G.t; else if (on.t < 0 && G.t - on.lostAt > 60) goOffline(on); }
      net.tick(dt, P, on ? on.room || 'lobby' : G.mode === 'river' ? (G.ts === 1 ? 'river' : 'mini-river') : G.world, G.t, G.race2 || G.race ? [P.leg, P.time || 0] : null);
      if (G.mode !== 'menu') bumpPeers(P, dt); if (on && G.frame % 6 === 0) lobbyUI(on);
      if (G.mode !== 'menu') { stepWear(dt, b, sp); hook.step(dt, P); }
      if ((pendingTp || pendingFriend) && net.st.up && G.t - askT > 2) onUp();
      if (G.frame % 6 === 0) { const hb = $('bhook'), aimT = !hook.active && hook.ready && hookOk() ? hook.aim(P) : null; hb.hidden = G.mode === 'menu' || !(hook.active || aimT);
        hb.classList.toggle('on', hook.active); txt('bhookt', hook.active ? (hook.mine ? 'отдать' : 'рубить') : 'крюк');
        $('brepair').hidden = !(G.mode === 'free' && isBroken(b)); if (!$('brepair').hidden) txt('brepairs', net.ready() ? 'финиш в онлайн-гонке вернёт 100%' : 'финиш в гонке вернёт ресурс'); } if (G.race && !pit) setPit(G.race.pt(G.race.aW * 0.4, 80), 16, true);
      if (G.frame % 30 === 0) { const el = $('online'); el.hidden = !(net.st.up && G.mode !== 'menu'); if (!el.hidden) el.textContent = `в сети ${net.st.online} · рядом ${net.pups.size}`; } G.modeT = (G.modeT || 0) + dt; for (let i = 1; i < boats.length; i++) boats[i].b.events.length = 0;
      if (G.race2 && !G.race2.over) stepRace2(dt); if (G.mode === 'river') stepRiver(dt, b);
      if (G.mode === 'free') { stepGag(dt, b); traffic.update(dt, G.t, P); }
      for (const m of marks) if (m.visible) { const p = m.userData.p; m.position.set(p.X, G.waves.sample(p.X, -p.Y, G.t, 1, WS).h - 0.25, -p.Y); m.rotation.z = WS.sx * 0.6; m.rotation.x = -WS.sz * 0.6; }
      const motor = b.spec && b.spec.cls === 'motor'; audio.engine(motor && G.mode !== 'menu' && !b.capsized, b.thr || 0, motor ? sp / b.spec.vmax : 0, b.air);
      if (motor && !b.capsized && !b.air && b.thr > 0.15 && sp > 2) { const fx = Math.sin(b.th), fz = -Math.cos(b.th), n = Math.floor(b.thr * sp * 14 * dt + Math.random());
        for (let i = 0; i < n; i++) G.spray.emit(b.X - fx * (b.hl + 0.4), b.y + 0.15, -b.Y - fz * (b.hl + 0.4), b.vx * 0.3 - fx * 2, (b.kind === 'jetski' ? 3.2 : 1.6) + Math.random() * 2 * b.thr, -b.vy * 0.3 - fz * 2, 1.6, 1, Math.random() < 0.25 ? 1 : 0); }
      // достижения, которые копятся со временем
      if (!b.kind || b.capsized || G.mode === 'menu') return; const id = b.kind;
      if (id === 'kayak' && b.dist - (b.safe0 || 0) >= 1000) ach('k_dist'); if (id === 'scull') { if (b.dist >= 2000) ach('s_2k'); b.rateT = b.cadence >= 32 && b.tSince < 3 ? (b.rateT || 0) + dt : 0; if (b.rateT > 10) ach('s_rate'); }
      if (id === 'sup') { b.dw = (b.dw || 0) + (Math.abs(b.twa) > 150 * DEG ? sp * dt : 0); if (b.dw >= 300) ach('p_down'); }
      if (id === 'boat') { if (b.pl > 0.6 && Math.abs(b.r) > 0.15) { if (Math.sign(b.r) !== b.circS) { b.circS = Math.sign(b.r); b.circ = 0; } b.circ += Math.abs(b.r) * dt; if (b.circ >= 6.283) ach('b_circ'); } else if (b.pl < 0.4) b.circ = 0; } },
  };
}
