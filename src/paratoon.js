// Мультфильм-инструктаж перед свободным полётом: ретро-стиль учебных фильмов 1950-х -- кремовая бумага, жирный
// чёрный контур, солнечные лучи, плашки-ленты, зерно и дрожание плёнки. Ведёт Дымок -- котёнок из дыма, маскот
// одноимённой игры (его пиксельные кадры -- из атласа dymok.js). Девять коротких сцен рисуются на холсте;
// пробел или «дальше» -- следующая, Esc -- пропустить.
import { DYMOK } from './dymok.js';
const IMG = typeof Image !== 'undefined' ? new Image() : { complete: false }; if (IMG.src !== undefined) IMG.src = DYMOK.png;
const INK = '#1c1712', PAPER = '#f1e4c3', RED = '#d6402b', TEAL = '#2f8f8a', ORANGE = '#f08a24', GREEN = '#4fae55', SKY = '#bfe0dc', NAVY = '#24395e';
const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

export function playToon({ audio, TOUCH, onDone }) {
  const wrap = document.createElement('div'); wrap.id = 'toon';
  wrap.innerHTML = `<style>#toon{position:fixed;inset:0;z-index:50;background:#0b0906;display:flex;align-items:center;justify-content:center;pointer-events:auto}
#toon canvas{display:block;max-width:100vw;max-height:100vh}#toon .b{position:absolute;bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;gap:10px;right:max(18px,env(safe-area-inset-right,0px))}
#toon button{font:800 15px 'Arial Black',Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:10px 18px;border-radius:10px;border:3px solid ${INK};background:${PAPER};color:${INK};cursor:pointer;box-shadow:3px 3px 0 ${INK}}
#toon button.go{background:${RED};color:#fff8e6}</style><canvas></canvas><div class="b"><button class="sk">пропустить</button><button class="go">дальше ▶</button></div>`;
  document.body.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), x = cv.getContext('2d'), goB = wrap.querySelector('.go'), skB = wrap.querySelector('.sk');
  let W = 960, H = 600, dpr = 1;
  const fit = () => { dpr = Math.min(2, window.devicePixelRatio || 1); const k = Math.min(window.innerWidth / 960, window.innerHeight / 600); W = 960; H = 600; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W * k}px`; cv.style.height = `${H * k}px`; };
  fit(); window.addEventListener('resize', fit);
  const K = (d, t) => (TOUCH ? t : d);

  // ---------- кисти ----------
  const lw = (w) => { x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = INK; };
  const fillStroke = (f, w = 4) => { if (f) { x.fillStyle = f; x.fill(); } lw(w); x.stroke(); };
  function sunburst(cx, cy, t, c1 = '#f6d98f', c2 = PAPER) { x.save(); x.translate(cx, cy); x.rotate(t * 0.15); for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? c1 : c2; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 900, (i / 24) * 6.283, ((i + 1) / 24) * 6.283); x.closePath(); x.fill(); } x.restore(); }
  function banner(text, y = 60, c = RED) { x.save(); x.font = "900 34px 'Arial Black',Arial,sans-serif"; const w = x.measureText(text).width + 70; const X0 = W / 2 - w / 2;
    x.fillStyle = '#9b2a1c'; for (const s of [-1, 1]) { x.beginPath(); const e = s < 0 ? X0 : X0 + w; x.moveTo(e, y + 6); x.lineTo(e + s * 40, y + 6); x.lineTo(e + s * 26, y + 30); x.lineTo(e + s * 40, y + 54); x.lineTo(e, y + 54); x.closePath(); fillStroke('#9b2a1c', 3); }
    x.beginPath(); x.rect(X0, y, w, 52); fillStroke(c, 4); x.fillStyle = '#fff8e6'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, y + 28); x.restore(); }
  function caption(text) { x.save(); x.font = "700 19px Georgia,'Times New Roman',serif"; const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > 760) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur);
    const h = 20 + lines.length * 25, y0 = H - 74 - h; x.beginPath(); x.roundRect(W / 2 - 400, y0, 800, h, 12); fillStroke('rgba(255,250,235,.93)', 3);
    x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'top'; lines.forEach((l, i) => x.fillText(l, W / 2, y0 + 10 + i * 25)); x.restore(); }
  function key(cx, cy, label, on, w = 64) { x.save(); const d = on ? 4 : 0; x.beginPath(); x.roundRect(cx - w / 2 + 4, cy - 26 + 6, w, 52, 9); x.fillStyle = INK; x.fill();
    x.beginPath(); x.roundRect(cx - w / 2 + d, cy - 26 + d, w, 52, 9); fillStroke(on ? ORANGE : '#fffaf0', 4); x.fillStyle = INK; x.font = "900 22px 'Arial Black',Arial,sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx + d, cy + d + 1); x.restore(); }
  function arrow(x0, y0, x1, y1, c = RED, w = 10) { const a = Math.atan2(y1 - y0, x1 - x0); x.save(); lw(w + 6); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    x.beginPath(); x.moveTo(x1 + Math.cos(a) * 18, y1 + Math.sin(a) * 18); x.lineTo(x1 + Math.cos(a + 2.4) * 26, y1 + Math.sin(a + 2.4) * 26); x.lineTo(x1 + Math.cos(a - 2.4) * 26, y1 + Math.sin(a - 2.4) * 26); x.closePath(); fillStroke(c, 4); x.restore(); }
  function cloud(cx, cy, s, a = 1) { x.save(); x.globalAlpha = a; x.translate(cx, cy); x.scale(s, s); x.beginPath(); for (const [px, py, r] of [[-50, 0, 30], [-15, -22, 38], [28, -12, 32], [55, 4, 24], [0, 8, 30]]) { x.moveTo(px + r, py); x.arc(px, py, r, 0, 6.283); } fillStroke('#fffdf6', 4 / s); x.restore(); }
  function sun(cx, cy, t) { x.save(); x.translate(cx, cy); x.rotate(t * 0.6); lw(4); for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); x.beginPath(); x.moveTo(44, 0); x.lineTo(64, 0); x.stroke(); } x.restore(); x.beginPath(); x.arc(cx, cy, 36, 0, 6.283); fillStroke('#ffd447', 4);
    x.fillStyle = INK; x.beginPath(); x.arc(cx - 12, cy - 6, 4, 0, 6.283); x.arc(cx + 12, cy - 6, 4, 0, 6.283); x.fill(); lw(3); x.beginPath(); x.arc(cx, cy + 2, 16, 0.3, 2.84); x.stroke(); }
  // ведущий -- Дымок, котёнок из дыма (пиксельные кадры из его атласа, крупно и без сглаживания)
  function kit(name, cx, cy, px, flip = false, alpha = 1) { const f = DYMOK.frames[name]; if (!f || !IMG.complete) return; x.save(); x.globalAlpha *= alpha; x.imageSmoothingEnabled = false; x.translate(cx, cy); if (flip) x.scale(-1, 1);
    x.drawImage(IMG, f[0], f[1], f[2], f[3], -f[4] * px, -f[5] * px, f[2] * px, f[3] * px); x.restore(); }
  const anim = (base, n, fps) => `${base}_${Math.floor(performance.now() / 1000 * fps) % n}`;
  // pilot(...) -- прежнее имя: так Дымок встаёт на место героя во всех сценах. Начало координат -- у его груди, стропы -- к лапкам
  function pilot(cx, cy, s = 1, { thumb = false, run = 0, mood = 1, fly = false } = {}) { const px = 4.4 * s;
    if (fly) for (let k = 0; k < 5; k++) { const ph = (performance.now() / 1000 * 1.4 + k / 5) % 1; kit(`smoke_${Math.min(5, Math.floor(ph * 6))}`, cx - 30 * s - ph * 120 * s, cy + 22 * s - ph * 30 * s, px * (0.8 + ph * 0.6), false, 0.75 * (1 - ph)); } // дымный след
    const name = run ? anim('run', 2, 10) : thumb ? 'emo_joy' : mood < 0 ? 'emo_sad' : fly ? 'emo_content' : anim('idle', 4, 5);
    const f = DYMOK.frames[name]; kit(name, cx, cy - 34 * s + (f ? f[5] : 24) * px, px, false); } // макушка -- там, где сходятся стропы
  // крыло: дуга с ячейками и стропами к пилоту; bank -- крен, sag -- просадка задней кромки (клеванты)
  function wing(cx, cy, s = 1, { bank = 0, up = 1, sag = 0 } = {}) { x.save(); x.translate(cx, cy); x.rotate(bank); x.scale(s, s);
    const span = 170, top = -150 * up - 40 * (1 - up), drop = 46; x.save(); lw(2.2); x.strokeStyle = 'rgba(28,23,18,.75)';
    for (let i = -4; i <= 4; i++) { const u = i / 4, px = u * span * 0.92, py = top + drop * u * u + 18; x.beginPath(); x.moveTo(px, py); x.lineTo(u < 0 ? -10 : 10, -30); x.stroke(); } x.restore();
    x.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 20 - 1, px = u * span, py = top + drop * u * u - 20 * Math.sqrt(1 - u * u); i ? x.lineTo(px, py) : x.moveTo(px, py); }
    for (let i = 40; i >= 0; i--) { const u = i / 20 - 1, px = u * span * 0.97, py = top + drop * u * u + 18 + sag * 22 * Math.abs(u); x.lineTo(px, py); } x.closePath(); fillStroke(ORANGE, 4.5);
    lw(2); for (let i = 1; i < 14; i++) { const u = i / 7 - 1; x.beginPath(); x.moveTo(u * span, top + drop * u * u - 20 * Math.sqrt(1 - u * u)); x.lineTo(u * span * 0.97, top + drop * u * u + 18 + sag * 22 * Math.abs(u)); x.stroke(); }
    x.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 20 - 1, px = u * span, py = top + drop * u * u - 20 * Math.sqrt(1 - u * u); i ? x.lineTo(px, py) : x.moveTo(px, py); } lw(9); x.strokeStyle = NAVY; x.stroke();
    x.restore(); }
  function ground(y, c = '#d9c48e') { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); fillStroke(c, 4); }
  function fluff(cx, cy, w, h, t, c = GREEN, dir = 1) { x.save(); for (let i = 0; i < 26; i++) { const ph = (i * 0.37 + t * 0.35 * dir) % 1, px = cx + (Math.sin(i * 12.9) * 0.5) * w, py = cy + h / 2 - ((ph + 1) % 1) * h * (dir > 0 ? 1 : -1) * (dir > 0 ? 1 : 1);
    const yy = dir > 0 ? cy + h / 2 - ph * h : cy - h / 2 + ph * h; x.globalAlpha = Math.sin(ph * Math.PI); x.beginPath(); x.arc(px, yy, 5, 0, 6.283); fillStroke(c, 2); void py; } x.restore(); }
  function bubble(cx, cy, text, c = '#fffaf0') { x.save(); x.font = "900 22px 'Arial Black',Arial,sans-serif"; const w = x.measureText(text).width + 30; x.beginPath(); x.roundRect(cx - w / 2, cy - 24, w, 44, 14); x.moveTo(cx - 10, cy + 20); x.lineTo(cx - 22, cy + 38); x.lineTo(cx + 6, cy + 20); fillStroke(c, 3.5);
    x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, cx, cy - 2); x.restore(); }
  const wobble = (t, a = 1) => Math.sin(t * 2.1) * a;

  // ---------- сцены ----------
  const SC = [
    { t: 6, draw(t) { sunburst(W / 2, 330, t); banner('ДЫМОК УЧИТ ЛЕТАТЬ', 48); pilot(W / 2, 330 + wobble(t * 2, 4), 2.2, { thumb: true }); caption('Мяу! Я Дымок. За минуту покажу, как взлететь на параплане, набрать высоту и мягко сесть. Смотри!'); } },
    { t: 7, draw(t) { x.fillStyle = SKY; x.fillRect(0, 0, W, H); ground(470); cloud(170, 120, 1); cloud(760, 90, 0.8); banner('МОТОРА НЕТ', 40);
      const k = (t % 7) / 7, px = 200 + k * 560, py = 200 + k * 160; x.save(); x.setLineDash([12, 12]); lw(4); x.beginPath(); x.moveTo(200, 210); x.lineTo(760, 370); x.stroke(); x.restore();
      wing(px, py, 0.55); pilot(px, py, 0.55, { fly: true }); bubble(px + 70, py - 120, '−1 м/с'); arrow(px - 80, py + 30, px - 80, py + 90, RED, 8);
      caption('Крыло — это планер без мотора. Вне потоков оно всегда плавно снижается: примерно метр в секунду. Поэтому высоту надо искать в воздухе!'); } },
    { t: 7, draw(t) { x.fillStyle = SKY; x.fillRect(0, 0, W, H); banner('ВЗЛЁТ', 40); x.beginPath(); x.moveTo(0, 230); x.quadraticCurveTo(420, 260, 960, 560); x.lineTo(960, 600); x.lineTo(0, 600); x.closePath(); fillStroke('#c9b77e', 4);
      const k = t / 7, up = ease((k - 0.12) / 0.3), run = Math.max(0, k - 0.35) * 2.2, px = 170 + Math.min(1.2, run) * 330, py = 250 + Math.min(1.2, run) * 110 - Math.max(0, run - 0.75) * 120;
      wing(px, py, 0.6, { up }); pilot(px, py, 0.6, { run: run > 0 && run < 0.8 ? t : 0 });
      key(760, 130, K('ПРОБЕЛ', 'АКСЕЛЬ'), k < 0.4 && Math.sin(t * 10) > 0, 170); if (run > 0.85) bubble(px + 60, py - 130, 'ВЗЛЁТ!');
      caption(K('Нажмите ПРОБЕЛ: крыло поднимется над головой, пилот сам разбежится вниз по склону и оторвётся от земли.', 'Нажмите кнопку «аксель»: крыло поднимется над головой, пилот сам разбежится вниз по склону и оторвётся от земли.')); } },
    { t: 8, draw(t) { sunburst(W / 2, 600, t, '#cfe7e3', SKY); banner('ПОВОРОТЫ', 40); const ph = Math.floor(t / 2.6) % 3, b = ph === 0 ? -0.35 : ph === 1 ? 0.35 : 0, bank = b * ease((t % 2.6) / 0.8);
      wing(W / 2, 360, 1.05, { bank }); x.save(); x.translate(W / 2, 360); x.rotate(bank); pilot(0, 0, 1.05, { fly: true }); x.restore();
      key(120, 330, '←', ph === 0); key(840, 330, '→', ph === 1);
      if (ph < 2) arrow(W / 2 + (ph ? 140 : -140), 140, W / 2 + (ph ? 260 : -260), 210, TEAL, 8);
      caption(K('Держите ← или →: крыло кренится и поворачивает. Держите дольше — вираж круче. Отпустили — летит прямо.', 'Держите палец на левой или правой половине экрана: крыло кренится и поворачивает. Дольше — круче. Отпустили — прямо.')); } },
    { t: 9, draw(t) { x.fillStyle = SKY; x.fillRect(0, 0, W, H); sun(110, 110, t); banner('ВОСХОДЯЩИЙ ПОТОК', 40); ground(450);
      x.save(); x.globalAlpha = 0.18; x.fillStyle = GREEN; x.beginPath(); x.moveTo(420, 450); x.lineTo(560, 450); x.lineTo(610, 190); x.lineTo(370, 190); x.closePath(); x.fill(); x.restore();
      fluff(490, 340, 190, 300, t); cloud(490, 170, 0.85 * (0.6 + 0.4 * ease(t / 3)));
      for (let i = 0; i < 3; i++) { lw(3); x.beginPath(); x.arc(440 + i * 50, 462, 10, Math.PI, 0); x.stroke(); } // жар от земли
      const a = t * 1.6, py = 400 - (t % 9) * 22, px = 490 + Math.cos(a) * 80; x.save(); lw(3); x.setLineDash([8, 10]); x.beginPath(); x.ellipse(490, py + 10, 80, 20, 0, 0, 6.283); x.stroke(); x.restore();
      wing(px, py, 0.45, { bank: -Math.sin(a) * 0.25 }); pilot(px, py, 0.45, { fly: true }); bubble(px + 80, py - 90, `пи-пи-пи! +${(1.5 + Math.sin(t) * 0.5).toFixed(1)}`, '#e9f8de');
      x.save(); x.font = "900 18px 'Arial Black',Arial"; x.fillStyle = INK; x.fillText('ТЕПЛО ОТ ЗЕМЛИ', 640, 405); x.restore(); arrow(660, 412, 590, 440, ORANGE, 6);
      caption('Солнце греет землю — тёплый воздух пузырём уходит вверх, над ним растёт облако. Ищите зелёный пух, облака и зелёные пятна на компасе. Запищал вариометр — держите стрелку и кружите на месте!'); } },
    { t: 7, draw(t) { x.fillStyle = SKY; x.fillRect(0, 0, W, H); banner('ВЕТЕР НА СКЛОН', 40); x.beginPath(); x.moveTo(380, 600); x.lineTo(760, 230); x.lineTo(960, 210); x.lineTo(960, 600); x.closePath(); fillStroke('#c9b77e', 4);
      for (let i = 0; i < 4; i++) { const o = ((t * 120 + i * 120) % 480), y = 300 + i * 60; const xx = 20 + o; const bend = xx > 330 - i * 60 ? (xx - (330 - i * 60)) : 0; arrow(xx - 60, y - bend * 0.9 + 20, xx, y - bend * 1.1, TEAL, 6); }
      const px = 560 + Math.sin(t * 0.8) * 60, py = 270 + Math.sin(t * 1.3) * 8; wing(px, py, 0.5); pilot(px, py, 0.5, { fly: true }); bubble(px - 110, py - 100, 'ДЕРЖИТ!', '#e9f8de');
      caption('Ветер, дующий на склон, поднимает воздух вверх. Летайте вдоль такого склона — это «динамика». А за гребнем, с подветренной стороны, наоборот тянет вниз.'); } },
    { t: 7, draw(t) { sunburst(W / 2, 330, t, '#f3c7b8', PAPER); banner('НЕ ТОРМОЗИ ЗРЯ', 40, '#8a1f14'); const sag = 0.5 + 0.5 * Math.sin(t * 2);
      wing(W / 2 - 170, 380, 0.9, { sag: 1 }); pilot(W / 2 - 170, 380 + 10, 0.9, { mood: -1 }); bubble(W / 2 - 170, 150, 'СКОРОСТЬ ↓', '#fbd7cf'); key(70, 260, '←', true); key(70, 335, '→', true);
      wing(W / 2 + 190, 380, 0.9); pilot(W / 2 + 190, 380, 0.9, { thumb: true }); bubble(W / 2 + 190, 150, 'ЛЕТИТ!', '#e9f8de'); void sag;
      caption('Долго держите клеванты — крыло тормозит, теряет скорость и проседает. Отпустите их — и оно снова полетит быстро и ровно.'); } },
    { t: 8, draw(t) { x.fillStyle = SKY; x.fillRect(0, 0, W, H); banner('ПОСАДКА', 40); ground(390);
      x.save(); x.translate(640, 405); x.scale(1, 0.3); x.beginPath(); x.arc(0, 0, 70, 0, 6.283); fillStroke('#fff', 5); x.beginPath(); x.arc(0, 0, 40, 0, 6.283); fillStroke(ORANGE, 5); lw(12); x.strokeStyle = RED; x.beginPath(); x.moveTo(-40, -40); x.lineTo(40, 40); x.moveTo(40, -40); x.lineTo(-40, 40); x.stroke(); x.restore();
      for (let i = 0; i < 3; i++) arrow(960 - ((t * 140 + i * 160) % 480), 180 + i * 40, 900 - ((t * 140 + i * 160) % 480), 180 + i * 40, TEAL, 5);
      x.save(); x.font = "900 16px 'Arial Black',Arial"; x.fillStyle = INK; x.fillText('ВЕТЕР', 820, 150); x.restore();
      const k = Math.min(1, t / 6), px = 150 + k * 490, py = 190 + k * 170, fl = k > 0.86; wing(px, py - (fl ? 8 : 0), 0.5, { sag: fl ? 1 : 0 }); pilot(px, py, 0.5, { thumb: k >= 1 });
      key(330, 300, '↓', fl, 70); if (k >= 1) { bubble(px + 30, py - 120, 'МЯГКО!', '#e9f8de'); for (let i = 0; i < 6; i++) { const a = i + t * 3; x.fillStyle = '#ffd447'; x.beginPath(); x.arc(px + Math.cos(a) * 70, py - 40 + Math.sin(a) * 30, 6, 0, 6.283); x.fill(); } }
      caption(K('Летите к кресту на пляже (оранжевая точка на компасе), развернитесь против ветра. В двух метрах над землёй нажмите ↓ — крыло затормозит, и касание будет мягким.', 'Летите к кресту на пляже (оранжевая точка на компасе), развернитесь против ветра. У самой земли коснитесь обеих половин экрана — касание будет мягким.')); } },
    { t: 99, draw(t) { sunburst(W / 2, 330, t); banner('ГОТОВЫ? ПОЕХАЛИ!', 48); pilot(W / 2, 330 + wobble(t * 3, 5), 2.2, { thumb: true });
      x.save(); x.font = "700 20px Georgia,serif"; x.fillStyle = INK; x.textAlign = 'center'; x.fillText(K('H — показать или скрыть подсказки потоков · R — новый старт', 'Удачного полёта!'), W / 2, 540); x.restore(); } },
  ];

  // ---------- плёнка ----------
  let i = 0, t0 = performance.now(), raf = 0, done = false, st = 0, last = performance.now(); const grain = Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random()]);
  function frame(now) { if (done) return; raf = requestAnimationFrame(frame); st += Math.min(0.1, (now - last) / 1000); last = now; const t = st, sc = SC[i]; void t0;
    if (t > sc.t && i < SC.length - 1) { next(); return; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const jx = (Math.random() - 0.5) * 1.6, jy = (Math.random() - 0.5) * 1.6; x.save(); x.translate(jx, jy); sc.draw(t); x.restore();
    // зерно, царапины, виньетка, мерцание
    x.fillStyle = 'rgba(40,28,10,.35)'; for (const g of grain) { if (Math.random() < 0.5) x.fillRect(Math.random() * W, Math.random() * H, 1.5 + g[2] * 2, 1.5 + g[2] * 2); }
    if (Math.random() < 0.25) { x.strokeStyle = 'rgba(40,28,10,.25)'; x.lineWidth = 1; const sx = Math.random() * W; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + Math.random() * 6, H); x.stroke(); }
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(40,25,5,${0.42 + Math.random() * 0.05})`); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    // точки сцен
    for (let k = 0; k < SC.length; k++) { x.beginPath(); x.arc(W / 2 - (SC.length - 1) * 9 + k * 18, H - 22, 5, 0, 6.283); x.fillStyle = k === i ? RED : 'rgba(28,23,18,.35)'; x.fill(); } }
  function next() { if (i >= SC.length - 1) return close(); i++; st = 0; audio && audio.tick && audio.tick(1400, 0.04); goB.textContent = i === SC.length - 1 ? 'полетели! ▶' : 'дальше ▶'; }
  function close() { if (done) return; done = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); wrap.remove(); audio && audio.chime && audio.chime(); onDone && onDone(); }
  function onKey(e) { e.stopImmediatePropagation(); e.preventDefault(); if (e.type !== 'keydown' || e.repeat) return; if (e.code === 'Escape') close(); else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') next(); }
  goB.onclick = next; skB.onclick = close; for (const b of [goB, skB]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true); raf = requestAnimationFrame(frame);
  return { close };
}
