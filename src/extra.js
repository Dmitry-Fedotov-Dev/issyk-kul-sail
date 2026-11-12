// Всё, что выросло вокруг яхты: выбор снаряда, достижения, соревнования для гребных и моторных, сплав по реке,
// движение в акватории и милиция, выбор места старта по карте (включая горы). Главный модуль вызывает отсюда крючки.
import { SPECS, CRAFT_ORDER, YACHT_INFO, ACH, makeCraftBody, aiPaddle, aiMotor, flow } from './crafts.js';
import { MODEL } from './craftmodels.js';
import { makeTraffic } from './traffic.js';
import { makeNet } from './net.js';
import { makeRiver } from './rivermode.js';
import { makeWake } from './fx.js';
import { makeMark } from './world.js';
import { clamp, wrapPi, KN, DEG } from './sim.js';

const WS = { h: 0, sx: 0, sz: 0 };
const RIVALS = [['Ала-Тоо', 0.97, { hull: 0x1f6fd0, deck: 0xf4f3ee, pfd: 0x1f6fd0 }], ['Манас', 0.9, { hull: 0xf2c21b, deck: 0x20242b, pfd: 0xf2c21b }], ['Чайка', 0.84, { hull: 0x2f8f5a, deck: 0xf4f3ee, pfd: 0x8fd16a }]];
const COMPETE = { yacht: ['Регата', 'три соперника, старт по сигналу'], kayak: ['Спринт 500 м', 'четыре дорожки, прямая'], scull: ['Гонка 1000 м', 'академическая классика'], sup: ['Гонка 200 м', 'техника и баланс'], jetski: ['Слалом по буям', 'восемь знаков на время'], boat: ['Фигурное вождение', 'слалом по буям на время'] };
const HOW = { kayak: '<b>← →</b> — гребок левой и правой лопастью. Гребите по очереди и в ритм: частить бесполезно. Гребок слева уводит нос вправо. <b>Пробел</b> — опора на весло, после оверкиля — эскимосский переворот.',
  scull: '<b>Пробел</b> — гребок обоими вёслами: захват, проводка, вынос. Нажмёте раньше, чем вынесли вёсла, — поймаете «краба». <b>← →</b> — одним веслом, чтобы подправить курс.',
  sup: '<b>← →</b> — гребок слева и справа, меняйте борт. <b>Пробел</b> — присесть: устойчивее на волне, но гребок слабее.',
  jetski: '<b>Пробел</b> — газ. <b>← →</b> — руль, но рулится гидроцикл только под газом. На гребне на скорости — прыжок; приводняйтесь ровно.',
  boat: '<b>Пробел</b> — газ, <b>← →</b> — штурвал. После разгона катер выходит на глиссер. У причала — малый ход, не быстрее 5 узлов.' };

export function installExtra(A) {
  const { G, scene, $, store, toast, audio, TOUCH } = A, yacht = G.player; yacht.id = 'yacht';
  const crafts = { yacht }, rivalsBy = {}, marks = [], done = new Set(store.get('ach') || []);
  let sel = store.get('craft') || 'yacht', river = null, startAt = null, yachtHow = '';
  if (sel !== 'yacht' && !SPECS[sel]) sel = 'yacht';
  const info = (id) => (id === 'yacht' ? YACHT_INFO : SPECS[id]);

  // ---------- достижения ----------
  function ach(id) { if (done.has(id)) return; const a = ACH.find((x) => x[1] === id); if (!a) return; done.add(id); store.set('ach', [...done]); audio.chime(); toast('★ ' + a[2]); journal(); }
  function journal() { const groups = { yacht: 'Яхта', kayak: 'Каяк', scull: 'Академическая одиночка', sup: 'SUP-доска', jetski: 'Гидроцикл', boat: 'Моторный катер', law: 'Закон и порядок', map: 'География' };
    $('bjournal').textContent = `Журнал · ${done.size}/${ACH.length}`;
    $('jlist').innerHTML = Object.keys(groups).map((g) => `<h4>${groups[g]}</h4>` + ACH.filter((a) => a[0] === g).map((a) => `<div class="ja${done.has(a[1]) ? ' ok' : ''}"><b>${a[2]}</b><span>${a[3]}</span></div>`).join('')).join(''); }

  // ---------- снаряды ----------
  function mkEntity(id, opts, name, skill = 1) { const b = makeCraftBody(id), model = MODEL[id](opts || {}), wake = makeWake(); scene.add(model.root, wake.mesh); return { id, b, model, wake, name, skill, ai: {}, leg: 0, time: 0 }; }
  const show = (e, v) => { e.model.root.visible = v; e.wake.mesh.visible = v && G.mode !== 'river'; };
  function setPlayer(id) { if (!crafts[id]) crafts[id] = mkEntity(id, null, 'Вы'); for (const k in crafts) show(crafts[k], k === id); G.player = crafts[id]; $('ts').textContent = info(id).key; }
  function leaveModes() { setPit(null); for (const k in rivalsBy) for (const e of rivalsBy[k]) e.out = false; if (river) river.show(false); flow.at = flow.surf = flow.rough = null; G.rv = null; if (G.race2) { for (const r of G.race2.rivals) show(r, false); G.race2 = null; } for (const m of marks) m.visible = false; if (traffic) traffic.setActive(false); audio.engine(false); $('wanted').hidden = true; G.gag = null; }

  // ---------- акватория и закон ----------
  // суда акватории (11 моделей) создаются при первом свободном плавании
  let traffic = null; const mkTraffic = () => traffic || (traffic = makeTraffic(scene, { h: G.h, waves: G.waves, wind: G.wind, toast, ach, audio,
    setWanted(n, text) { const el = $('wanted'); el.hidden = !n; if (n) el.innerHTML = `<b>${'★'.repeat(n)}${'☆'.repeat(3 - n)}</b> ${text}`; },
    onHit(rel) { wear(G.player.b, 0, 0.02 + 0.01 * rel); G.shake = Math.max(G.shake, Math.min(1.2, 0.4 + rel * 0.12)); audio.thump(Math.min(1, 0.4 + rel * 0.1)); },
    onBust() { A.placeBoat(G.player, 22, G.shore.pierY - 70, A.openWaterHeading(22, G.shore.pierY - 70), 0); } }));

  // ---------- износ и ремонт ----------
  // wearA -- парус, весло или мотор (падает тяга), wearH -- корпус (растёт сопротивление). Копится от ошибок и нагрузки,
  // восстанавливается у зелёного буя на дистанции или у причала: стоять рядом на малом ходу.
  const pitMark = makeMark(0x35c96a); pitMark.visible = false; scene.add(pitMark); let pit = null, pitTold = false;
  const wear = (b, a, h) => { b.wearA = clamp((b.wearA || 0) + a, 0, 1); b.wearH = clamp((b.wearH || 0) + h, 0, 1); };
  function setPit(p, r, mark) { pit = p ? { ...p, r } : null; pitMark.visible = !!(p && mark); pitTold = false; }
  function wearEvent(ev, b) { const t = ev.type;
    if (t === 'gybe' && ev.power > 0.8) wear(b, 0.05 * ev.power, 0); else if (t === 'capsize') wear(b, 0.05, 0.02); else if (t === 'aground') wear(b, 0, 0.08);
    else if (t === 'crab') wear(b, 0.05, 0); else if (t === 'land' && ev.impact > 5) wear(b, 0, 0.012 * ev.impact / 5); }
  function stepWear(dt, b, sp) { const m = b.spec && b.spec.cls;
    if (!b.capsized) { if (!b.kind) wear(b, dt * (0.0035 * b.luff * b.aws / 8 + 0.0005 * (b.aws / 8) ** 2), dt * 0.0002 * sp); else if (m === 'motor') wear(b, dt * 0.0022 * b.thr * b.thr, dt * 0.0002 * sp / 5); else wear(b, dt * 0.0006 * (b.st ? 1 : 0), dt * 0.0001); }
    if (pit) { if (pitMark.visible) { pitMark.position.set(pit.X, G.waves.sample(pit.X, -pit.Y, G.t, 1, WS).h - 0.25, -pit.Y); }
      if (Math.hypot(b.X - pit.X, b.Y - pit.Y) < pit.r && sp < 3.5 && (b.wearA > 0.01 || b.wearH > 0.01)) { wear(b, -dt * 0.22, -dt * 0.22); if (!pitTold) { pitTold = true; toast('Ремонт… стойте рядом'); } if (b.wearA <= 0.01 && b.wearH <= 0.01) { toast('Ресурс восстановлен'); audio.chime(); } } }
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
    if (net.st.up && net.st.sync) { const R = G.race2, now = net.now(); R.online = true; R.room = `r:${id}:${G.preset}`; R.T0 = Math.ceil((now + 6000) / 30000) * 30000; R.t = (now - R.T0) / 1000; R.beep = 99;
      const l = ((net.st.id % 9) - 4) * lane * 0.8 + lane * 0.4; A.placeBoat(G.player, pt(0, l).X, pt(0, l).Y, wrapPi(th), 0); G.player.course[G.player.course.length - 1] = { X: pt(D, l).X, Y: pt(D, l).Y, line: D, label: 'финиш' };
      toast(`Онлайн-заезд: старт через ${Math.round(-R.t)} с`); }
    G.mode = 'race2'; G.race = null; A.showGame(true); A.setRivals(false); $('race').hidden = false; $('brief').hidden = true; G.camYaw = wrapPi(th); A.resetView(); G.modeT = 0;
  }
  function stepRace2(dt) { const R = G.race2; const was = R.t; if (R.online) R.t = (net.now() - R.T0) / 1000; else R.t += dt;
    if (R.online && was < 0 && R.t >= 0) { const peers = [...net.pups.values()].filter((p) => p.model.root.visible).length, keep = Math.max(0, 3 - peers); // минимум четверо на старте
      R.rivals.forEach((e, i) => { if (i >= keep) { show(e, false); e.out = true; } }); R.all = R.all.filter((e) => !e.out); if (peers) toast(`Марш! Соперников онлайн: ${peers}`); } if (R.t < 0) { const s = Math.ceil(-R.t); if (s !== R.beep) { R.beep = s; audio.beep(false); } return; }
    if (R.beep !== 0) { R.beep = 0; audio.horn(); toast('Марш!'); }
    for (const e of R.all) { if (e.time) continue; const c = e.course[e.leg], b = e.b;
      const hit = c.line !== undefined ? (b.X - R.S.X) * R.dir.x + (b.Y - R.S.Y) * R.dir.y >= c.line : Math.hypot(c.X - b.X, c.Y - b.Y) < c.rad;
      if (hit) { e.leg++; if (e === G.player && e.leg < e.course.length) audio.chime(); if (e.leg >= e.course.length) { e.time = R.t; if (e === G.player) finish2(); } } }
    for (let i = 0; i < R.all.length; i++) for (let j = i + 1; j < R.all.length; j++) { const a = R.all[i].b, b = R.all[j].b, dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy), rr = a.hl * 0.9 + (R.motor ? 0.6 : 0.2);
      if (d < rr && d > 0.01) { const p = (rr - d) / 2 / d; a.X -= dx * p; a.Y -= dy * p; b.X += dx * p; b.Y += dy * p; } } }
  function finish2() { const R = G.race2; R.over = true; audio.horn(); const P = G.player, prog = (e) => (e.time ? 1e6 - e.time : e.leg * 1e4 + (e.b.X - R.S.X) * R.dir.x + (e.b.Y - R.S.Y) * R.dir.y);
    const peers = R.online ? [...net.pups.values()].map((p) => ({ name: `Игрок ${p.id}`, time: p.r[1] || 0, leg: p.r[0] || 0, b: p.b, net: true })) : [];
    const all = [...R.all, ...peers].sort((a, b) => prog(b) - prog(a)), place = all.indexOf(P) + 1, key = 'best2.' + R.id, best = store.get(key), rec = !best || P.time < best; if (rec) store.set(key, P.time);
    ach({ kayak: 'k_sprint', scull: 's_race', sup: 'p_race', jetski: 'j_slalom', boat: 'b_slalom' }[R.id]);
    $('rh').textContent = place === 1 ? 'Победа!' : place + '-е место'; $('rs').textContent = `${R.name}${R.online ? ' · онлайн' : ''} · ваше время ${A.fmt(P.time)}` + (rec ? ' · личный рекорд' : best ? ` · рекорд ${A.fmt(best)}` : '');
    $('rt').innerHTML = all.map((e, i) => `<tr class="${e === P ? 'me' : ''}"><td>${i + 1}</td><td>${e.name}</td><td>${e.time ? A.fmt(e.time) : 'в пути'}</td></tr>`).join('');
    setTimeout(() => { if (G.race2 === R) $('result').hidden = false; }, 1500); }

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
    $('bmap').textContent = startAt ? `Место: ${startAt.label}` : 'Место: Чолпон-Ата'; }
  function buildMenu() { yachtHow = $('how').innerHTML;
    for (const id of CRAFT_ORDER) { const i = info(id), b = document.createElement('button'); b.className = 'chip'; b.dataset.id = id; b.id = 'c_' + id; b.innerHTML = `<b>${i.name}</b><small>${i.sub}</small>`; b.onclick = () => { sel = id; store.set('craft', id); refreshMenu(); }; $('crafts').appendChild(b); }
    $('briver').onclick = () => { audio.start(); startRiver(); }; $('bjournal').onclick = () => { $('journal').hidden = false; }; $('jclose').onclick = () => { $('journal').hidden = true; };
    $('bmap').onclick = openMap; $('mclose').onclick = () => { $('mapdlg').hidden = true; }; $('mreset').onclick = () => { startAt = null; $('mapdlg').hidden = true; refreshMenu(); };
    journal(); refreshMenu(); }
  // карта котловины: клик задаёт место старта
  function openMap() { const g = G.far.userData.grid, cv = $('mapcv'), c = cv.getContext('2d'); cv.width = g.W; cv.height = g.H; const im = c.createImageData(g.W, g.H);
    for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) { const h = g.hs[j * g.W + i], q = (j * g.W + i) * 4, sh = clamp(0.75 + (h - (g.hs[j * g.W + Math.min(i + 1, g.W - 1)])) / 400, 0.45, 1.15); let r, gg, b;
      if (h < 0) { r = 22; gg = 92; b = 170; } else if (h > 2100) { r = gg = b = 245 * sh; } else if (h > 1300) { r = 150 * sh; gg = 140 * sh; b = 130 * sh; } else if (h > 500) { r = 110 * sh; gg = 140 * sh; b = 80 * sh; } else { r = 205 * sh; gg = 185 * sh; b = 130 * sh; }
      im.data[q] = r; im.data[q + 1] = gg; im.data[q + 2] = b; im.data[q + 3] = 255; }
    c.putImageData(im, 0, 0); const px = (X, Y) => [(X - g.X0) / g.STEP, (g.Y1 - Y) / g.STEP], dot = (X, Y, col, r = 4) => { const [x, y] = px(X, Y); c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); };
    dot(0, 0, '#ff7a1a'); if (startAt) dot(startAt.X, startAt.Y, '#ffd21f', 5);
    $('mapinfo').textContent = startAt ? `Выбрано: ${startAt.label}` : 'Нажмите на карту. Оранжевая точка — Чолпон-Ата.'; $('mapdlg').hidden = false;
    cv.onclick = (ev) => { const r = cv.getBoundingClientRect(), X = g.X0 + ((ev.clientX - r.left) / r.width) * g.W * g.STEP, Y = g.Y1 - ((ev.clientY - r.top) / r.height) * g.H * g.STEP, h = G.h(X, Y), d = Math.hypot(X, Y) / 1000;
      const az = (Math.atan2(X, Y) / DEG + 360) % 360, dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'][Math.round(az / 45) % 8];
      startAt = { X, Y, land: h > -2, label: `${d.toFixed(0)} км к ${dirs} · ${h > -2 ? `суша, ${Math.round(h + 1601)} м` : 'озеро'}` }; refreshMenu(); openMap(); }; }

  const net = makeNet(scene, { waves: G.waves, h: G.h, active: () => G.mode !== 'menu' });
  buildMenu();
  return {
    net,
    wearEvent, pit: () => pit, ach, get traffic() { return traffic; }, get sel() { return sel; },
    boats: (P) => (G.mode === 'race' ? [P, ...G.rivals] : G.race2 ? [P, ...G.race2.rivals] : [P]),
    th: () => (G.mode === 'river' && river ? river.h : G.hb), poseTh: () => (G.mode === 'river' && river ? river.h : G.h),
    filterCtl: (c) => ((G.race2 && G.race2.t < 0) ? { steer: 0, ease: false, left: false, right: false } : c),
    aiFor(e, dt) { const R = G.race2; if (R.t < 0 || e.time) return { steer: 0, ease: false, left: false, right: false, thr: 0 }; const c = e.course[e.leg];
      return R.motor ? aiMotor(e.b, c.X, c.Y, 0.72 + 0.28 * e.skill) : aiPaddle(e.b, c.X, c.Y, e.ai, dt, e.skill); },
    toMenuCraft() { leaveModes(); for (const k in crafts) show(crafts[k], k === 'yacht'); G.player = yacht; refreshMenu(); },
    useYacht() { leaveModes(); setPlayer('yacht'); },
    compete() { if (sel === 'yacht') A.startRace(); else startRace2(); },
    onFreePre() { leaveModes(); setPlayer(sel); },
    onFree() { G.modeT = 0; const P = G.player; let cx = 0, cy = -600;
      if (startAt) { A.placeBoat(P, startAt.X, startAt.Y, A.openWaterHeading(startAt.X, startAt.Y), startAt.land ? 0 : 1); G.camYaw = P.b.th; if (!startAt.land) { cx = startAt.X; cy = startAt.Y; } }
      else if (P.b.kind) { P.b.vx *= 0.3; P.b.vy *= 0.3; }
      mkTraffic().relocate(cx, cy, 0, G.shore.pierY - 50); traffic.setActive(true); setPit({ X: 0, Y: G.shore.pierY - 25 }, 45, false); },
    markTarget() { const R = G.race2; if (!R || G.player.time) return null; return G.player.course[G.player.leg]; },
    hud() { const R = G.race2, P = G.player;
      if (R) { const c = P.course[Math.min(P.leg, P.course.length - 1)], all = [...R.all].sort((a, b) => (b.leg - a.leg) || (((b.b.X - R.S.X) * R.dir.x + (b.b.Y - R.S.Y) * R.dir.y) - ((a.b.X - R.S.X) * R.dir.x + (a.b.Y - R.S.Y) * R.dir.y)));
        $('rtime').textContent = A.fmt(R.over ? P.time : R.t); $('rinfo').textContent = R.t < 0 ? 'до старта' : `${c.label} ${Math.hypot(c.X - P.b.X, c.Y - P.b.Y).toFixed(0)} м · ${all.indexOf(P) + 1}/4`; }
      else if (G.rv) { const pr = G.rv.pr; $('rtime').textContent = A.fmt(G.rv.t); $('rinfo').textContent = pr ? `до финиша ${Math.max(0, river.len - pr.s).toFixed(0)} м · уклон ${(pr.slope * 100).toFixed(0)}% · камней: ${G.rv.hits}` : ''; } },
    hint(b, T) { const id = b.kind, key = TOUCH ? `«${SPECS[id].key}»` : 'пробел';
      if (b.capsized) return [b.righting ? '' : { kayak: `Оверкиль! Держите ${key} — эскимосский переворот`, scull: `Перевернулись. Держите ${key} — забираемся в лодку`, sup: `Упали с доски. Держите ${key} — забираемся обратно`, jetski: `Сбросило. Держите ${key} — забираемся на гидроцикл`, boat: `Держите ${key}` }[id], true];
      if (G.gag) return ['', false]; if (b.aground) return ['Мель — стаскивает на глубину', true];
      if (G.race2 && G.race2.t < 0) return ['Приготовиться…', false];
      if (G.rv && G.rv.pr && G.rv.pr.rap > 0.45 && T > 6) return [`Порог! Держите нос по струе, ${key} — опора`, true];
      if (T < 12) return [{ kayak: TOUCH ? 'Касайтесь слева и справа по очереди, в ритм · «опора» держит на волне' : '← → гребок по очереди, в ритм · гребок слева уводит нос вправо · пробел — опора',
        scull: TOUCH ? '«гребок» — оба весла, не частите · касание слева и справа — подправить курс' : 'Пробел — гребок обоими вёслами, не частите · ← → подправить курс',
        sup: TOUCH ? 'Касайтесь слева и справа — гребок · «стойка» — присесть на волне' : '← → гребок слева и справа · пробел — присесть на волне',
        jetski: TOUCH ? 'Держите «газ» · касание слева и справа — руль (только под газом)' : 'Пробел — газ · ← → руль, рулится только под газом',
        boat: TOUCH ? 'Держите «газ» · касание слева и справа — штурвал' : 'Пробел — газ · ← → штурвал' }[id], false];
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
    after(P, dt, boats) { const b = P.b, sp = b.speed; net.tick(dt, P, G.race2 && G.race2.online ? G.race2.room : G.mode === 'river' ? 'river' : 'lake', G.t, G.race2 ? [P.leg, P.time || 0] : null);
      if (G.mode !== 'menu') stepWear(dt, b, sp); if (G.race && !pit) setPit(G.race.pt(G.race.aW * 0.4, 80), 16, true);
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
