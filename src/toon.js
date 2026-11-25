// Плёночный движок мультфильмов-инструктажей: ретро учебных фильмов 1960-х -- кремовая бумага, жирный чёрный контур,
// солнечные лучи, плашки-ленты, зерно, царапины, дрожание кадра и виньетка. Ведёт Дымок -- котёнок из дыма (атлас dymok.js).
// playFilm({ scenes: (B) => [{ t: секунд, draw(t) }...] }) -- сцены рисуются кистями B на холсте 960x600;
// «дальше» / пробел -- следующая сцена, «пропустить» / Esc -- выход. Любую сцену можно перелистать назад (← / «назад»).
import { DYMOK } from './dymok.js';
const IMG = typeof Image !== 'undefined' ? new Image() : { complete: false }; if (IMG.src !== undefined) IMG.src = DYMOK.png;
export const INK = '#1c1712', PAPER = '#f1e4c3', RED = '#d6402b', TEAL = '#2f8f8a', ORANGE = '#f08a24', GREEN = '#4fae55', SKY = '#bfe0dc', NAVY = '#24395e', SNOW = '#fbf6ea', ROCK = '#b9a98a';
export const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

export function playFilm({ audio, TOUCH, onDone, scenes, last: lastLabel = 'поехали! ▶' }) {
  const wrap = document.createElement('div'); wrap.id = 'toon';
  wrap.innerHTML = `<style>#toon{position:fixed;inset:0;z-index:60;background:#0b0906;display:flex;align-items:center;justify-content:center;pointer-events:auto}
#toon canvas{display:block;max-width:100vw;max-height:100vh}#toon .b{position:absolute;bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;gap:10px;right:max(18px,env(safe-area-inset-right,0px))}
#toon button{font:800 15px 'Arial Black',Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:10px 16px;border-radius:10px;border:3px solid ${INK};background:${PAPER};color:${INK};cursor:pointer;box-shadow:3px 3px 0 ${INK}}
#toon button.go{background:${RED};color:#fff8e6}@media (max-width:640px){#toon button{padding:8px 10px;font-size:12px}}</style><canvas></canvas><div class="b"><button class="sk">пропустить</button><button class="bk">◀</button><button class="go">дальше ▶</button></div>`;
  document.body.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), x = cv.getContext('2d'), goB = wrap.querySelector('.go'), skB = wrap.querySelector('.sk'), bkB = wrap.querySelector('.bk');
  const W = 960, H = 600; let dpr = 1;
  const fit = () => { dpr = Math.min(2, window.devicePixelRatio || 1); const k = Math.min(window.innerWidth / W, window.innerHeight / H); cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W * k}px`; cv.style.height = `${H * k}px`; };
  fit(); window.addEventListener('resize', fit);
  const K = (d, t) => (TOUCH ? t : d);
  // ---------- кисти ----------
  const lw = (w) => { x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = INK; };
  const fs = (f, w = 4) => { if (f) { x.fillStyle = f; x.fill(); } lw(w); x.stroke(); };
  function sunburst(cx, cy, t, c1 = '#f6d98f', c2 = PAPER) { x.save(); x.translate(cx, cy); x.rotate(t * 0.15); for (let i = 0; i < 24; i++) { x.fillStyle = i % 2 ? c1 : c2; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 900, (i / 24) * 6.283, ((i + 1) / 24) * 6.283); x.closePath(); x.fill(); } x.restore(); }
  function banner(text, y = 40, c = RED) { x.save(); x.font = "900 32px 'Arial Black',Arial,sans-serif"; const w = x.measureText(text).width + 70, X0 = W / 2 - w / 2;
    for (const s of [-1, 1]) { x.beginPath(); const e = s < 0 ? X0 : X0 + w; x.moveTo(e, y + 6); x.lineTo(e + s * 40, y + 6); x.lineTo(e + s * 26, y + 30); x.lineTo(e + s * 40, y + 54); x.lineTo(e, y + 54); x.closePath(); fs('#9b2a1c', 3); }
    x.beginPath(); x.rect(X0, y, w, 52); fs(c, 4); x.fillStyle = '#fff8e6'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, y + 28); x.restore(); }
  function caption(text) { x.save(); x.font = "700 19px Georgia,'Times New Roman',serif"; const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > 760) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur);
    const h = 20 + lines.length * 25, y0 = H - 74 - h; x.beginPath(); x.roundRect(W / 2 - 400, y0, 800, h, 12); fs('rgba(255,250,235,.94)', 3);
    x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'top'; lines.forEach((l, i) => x.fillText(l, W / 2, y0 + 10 + i * 25)); x.restore(); }
  function key(cx, cy, label, on, w = 64, h = 52, font = 22) { x.save(); const d = on ? 4 : 0; x.beginPath(); x.roundRect(cx - w / 2 + 4, cy - h / 2 + 6, w, h, 9); x.fillStyle = INK; x.fill();
    x.beginPath(); x.roundRect(cx - w / 2 + d, cy - h / 2 + d, w, h, 9); fs(on ? ORANGE : '#fffaf0', 4); x.fillStyle = INK; x.font = `900 ${font}px 'Arial Black',Arial,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, cx + d, cy + d + 1); x.restore(); }
  function arrow(x0, y0, x1, y1, c = RED, w = 10) { const a = Math.atan2(y1 - y0, x1 - x0); x.save(); lw(w + 6); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    x.beginPath(); x.moveTo(x1 + Math.cos(a) * 18, y1 + Math.sin(a) * 18); x.lineTo(x1 + Math.cos(a + 2.4) * 26, y1 + Math.sin(a + 2.4) * 26); x.lineTo(x1 + Math.cos(a - 2.4) * 26, y1 + Math.sin(a - 2.4) * 26); x.closePath(); fs(c, 4); x.restore(); }
  function cloud(cx, cy, s, a = 1) { x.save(); x.globalAlpha = a; x.translate(cx, cy); x.scale(s, s); x.beginPath(); for (const [px, py, r] of [[-50, 0, 30], [-15, -22, 38], [28, -12, 32], [55, 4, 24], [0, 8, 30]]) { x.moveTo(px + r, py); x.arc(px, py, r, 0, 6.283); } fs('#fffdf6', 4 / s); x.restore(); }
  function bubble(cx, cy, text, c = '#fffaf0', size = 22) { x.save(); x.font = `900 ${size}px 'Arial Black',Arial,sans-serif`; const w = x.measureText(text).width + 30; x.beginPath(); x.roundRect(cx - w / 2, cy - 24, w, 44, 14); x.moveTo(cx - 10, cy + 20); x.lineTo(cx - 22, cy + 38); x.lineTo(cx + 6, cy + 20); fs(c, 3.5);
    x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, cx, cy - 2); x.restore(); }
  function text(t, cx, cy, size = 18, c = INK, al = 'center') { x.save(); x.font = `900 ${size}px 'Arial Black',Arial,sans-serif`; x.fillStyle = c; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(t, cx, cy); x.restore(); }
  function kit(name, cx, cy, px, flip = false, alpha = 1) { const f = DYMOK.frames[name]; if (!f || !IMG.complete) return; x.save(); x.globalAlpha *= alpha; x.imageSmoothingEnabled = false; x.translate(cx, cy); if (flip) x.scale(-1, 1);
    x.drawImage(IMG, f[0], f[1], f[2], f[3], -f[4] * px, -f[5] * px, f[2] * px, f[3] * px); x.restore(); }
  const anim = (base, n, fps) => `${base}_${Math.floor(performance.now() / 1000 * fps) % n}`;
  // Дымок стоит лапами на (cx, cy): mood -- 'joy' | 'sad' | 'idle' | 'run'
  function dymok(cx, cy, s = 1, mood = 'idle', flip = false) { const px = 4.4 * s, name = mood === 'run' ? anim('run', 2, 10) : mood === 'joy' ? 'emo_joy' : mood === 'sad' ? 'emo_sad' : mood === 'ok' ? 'emo_content' : anim('idle', 4, 5); kit(name, cx, cy, px, flip); }
  // горы: зубчатая гряда со снежными шапками
  function peaks(y, pts, c = ROCK) { x.beginPath(); x.moveTo(0, H); x.lineTo(0, y); for (const [px, py] of pts) x.lineTo(px, py); x.lineTo(W, y); x.lineTo(W, H); x.closePath(); fs(c, 4);
    for (let i = 0; i < pts.length; i++) { const [px, py] = pts[i]; if (py > y - 120) continue; x.beginPath(); x.moveTo(px - 38, py + 46); x.lineTo(px, py); x.lineTo(px + 38, py + 46); x.lineTo(px + 14, py + 36); x.lineTo(px, py + 50); x.lineTo(px - 14, py + 36); x.closePath(); fs(SNOW, 3); } }
  // вертолёт Ми-8 МЧС: оранжевый, винт крутится; rope -- длина троса лебёдки
  function heli(cx, cy, s = 1, t = 0, rope = 0, tilt = 0) { x.save(); x.translate(cx, cy); x.rotate(tilt); x.scale(s, s);
    if (rope > 0) { lw(3); x.beginPath(); x.moveTo(18, 24); x.lineTo(18, 24 + rope); x.stroke(); x.beginPath(); x.arc(18, 28 + rope, 6, 0, 6.283); fs(ORANGE, 3); }
    x.beginPath(); x.moveTo(60, -6); x.lineTo(150, -14); x.lineTo(156, -36); x.lineTo(166, -36); x.lineTo(162, 0); x.lineTo(60, 10); x.closePath(); fs(ORANGE, 4); // хвост
    x.beginPath(); x.ellipse(0, 0, 76, 30, 0, 0, 6.283); fs(ORANGE, 4.5); x.beginPath(); x.ellipse(-44, -6, 22, 15, 0, 0, 6.283); fs('#bfe3f0', 3.5); // корпус, стекло
    x.fillStyle = '#fff8e6'; x.fillRect(-20, -6, 64, 8); x.font = "900 14px 'Arial Black',Arial"; x.fillStyle = INK; x.textAlign = 'center'; x.fillText('МЧС', 12, 20);
    lw(3); x.beginPath(); x.moveTo(-30, 30); x.lineTo(-30, 40); x.moveTo(30, 30); x.lineTo(30, 40); x.moveTo(-50, 40); x.lineTo(50, 40); x.stroke(); // шасси
    x.beginPath(); x.rect(-6, -44, 12, 14); fs(NAVY, 3); const r = 120 * Math.abs(Math.cos(t * 30)); lw(6); x.beginPath(); x.moveTo(-r, -46); x.lineTo(r, -46); x.stroke(); // винт
    x.save(); x.translate(160, -18); x.rotate(t * 40); lw(4); x.beginPath(); x.moveTo(-18, 0); x.lineTo(18, 0); x.stroke(); x.restore(); x.restore(); }
  function drone(cx, cy, s = 1, t = 0) { x.save(); x.translate(cx, cy); x.scale(s, s); lw(4); x.beginPath(); x.moveTo(-40, 0); x.lineTo(40, 0); x.stroke(); for (const px of [-40, 40]) { const r = 22 * Math.abs(Math.cos(t * 25 + px)); lw(4); x.beginPath(); x.moveTo(px - r, -8); x.lineTo(px + r, -8); x.stroke(); }
    x.beginPath(); x.roundRect(-16, -8, 32, 16, 5); fs(NAVY, 3); x.beginPath(); x.arc(0, 12, 6, 0, 6.283); fs('#222', 2); x.fillStyle = (t * 3) % 1 < 0.5 ? RED : '#550'; x.beginPath(); x.arc(0, -14, 4, 0, 6.283); x.fill(); x.restore(); }
  function tent(cx, cy, s = 1, c = ORANGE) { x.save(); x.translate(cx, cy); x.scale(s, s); x.beginPath(); x.moveTo(-34, 0); x.quadraticCurveTo(-20, -44, 0, -44); x.quadraticCurveTo(20, -44, 34, 0); x.closePath(); fs(c, 4); x.beginPath(); x.moveTo(-8, 0); x.quadraticCurveTo(0, -20, 8, 0); x.closePath(); fs(INK, 2); x.restore(); }
  function wand(cx, cy, s = 1, t = 0) { x.save(); x.translate(cx, cy); x.scale(s, s); lw(4); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -60); x.stroke(); x.beginPath(); x.moveTo(0, -60); x.quadraticCurveTo(14, -54 + Math.sin(t * 6) * 4, 26, -52); x.lineTo(0, -46); x.closePath(); fs(ORANGE, 3); x.restore(); }
  function man(cx, cy, s = 1, c = '#3a7fd6', wave = 0, lying = false) { x.save(); x.translate(cx, cy); x.scale(s, s); if (lying) x.rotate(-Math.PI / 2);
    lw(5); x.beginPath(); x.moveTo(0, -30); x.lineTo(-10, 0); x.moveTo(0, -30); x.lineTo(10, 0); x.stroke(); x.beginPath(); x.roundRect(-12, -62, 24, 34, 8); fs(c, 4);
    lw(5); x.beginPath(); x.moveTo(-10, -54); x.lineTo(-22, -36); x.moveTo(10, -54); x.lineTo(22 + wave * 6, -78 + wave * 4); x.stroke(); x.beginPath(); x.arc(0, -74, 12, 0, 6.283); fs('#f3d2b0', 4); x.restore(); }
  function clock(cx, cy, r, t) { x.beginPath(); x.arc(cx, cy, r, 0, 6.283); fs('#fffaf0', 6); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; lw(4); x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); x.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); x.stroke(); }
    lw(7); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(t * 0.5 - 1.57) * r * 0.5, cy + Math.sin(t * 0.5 - 1.57) * r * 0.5); x.stroke(); lw(4); x.strokeStyle = RED; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(t * 6 - 1.57) * r * 0.78, cy + Math.sin(t * 6 - 1.57) * r * 0.78); x.stroke(); }
  function panel(px, py, w, h, c = 'rgba(36,57,94,.92)') { x.beginPath(); x.roundRect(px, py, w, h, 14); fs(c, 4); }
  function sky(c = SKY) { x.fillStyle = c; x.fillRect(0, 0, W, H); }
  const wobble = (t, a = 1) => Math.sin(t * 2.1) * a;
  const B = { x, W, H, K, lw, fs, sunburst, banner, caption, key, arrow, cloud, bubble, text, kit, dymok, peaks, heli, drone, tent, wand, man, clock, panel, sky, wobble, ease, INK, PAPER, RED, TEAL, ORANGE, GREEN, SKY, NAVY, SNOW, ROCK };
  const SC = scenes(B);
  // ---------- плёнка ----------
  let i = 0, raf = 0, done = false, st = 0, last = performance.now(); const grain = Array.from({ length: 140 }, () => Math.random());
  function frame(now) { if (done) return; raf = requestAnimationFrame(frame); st += Math.min(0.1, (now - last) / 1000); last = now; const sc = SC[i];
    if (st > sc.t && i < SC.length - 1) { next(); return; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    x.save(); x.translate((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6); sc.draw(st); x.restore();
    x.fillStyle = 'rgba(40,28,10,.35)'; for (const g of grain) if (Math.random() < 0.5) x.fillRect(Math.random() * W, Math.random() * H, 1.5 + g * 2, 1.5 + g * 2);
    if (Math.random() < 0.25) { x.strokeStyle = 'rgba(40,28,10,.25)'; x.lineWidth = 1; const sx = Math.random() * W; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + Math.random() * 6, H); x.stroke(); }
    const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(40,25,5,${0.42 + Math.random() * 0.05})`); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    for (let k = 0; k < SC.length; k++) { x.beginPath(); x.arc(W / 2 - (SC.length - 1) * 9 + k * 18, H - 22, 5, 0, 6.283); x.fillStyle = k === i ? RED : 'rgba(28,23,18,.35)'; x.fill(); } }
  function go(k) { i = Math.max(0, Math.min(SC.length - 1, k)); st = 0; audio && audio.tick && audio.tick(1400, 0.04); goB.textContent = i === SC.length - 1 ? lastLabel : 'дальше ▶'; }
  function next() { if (i >= SC.length - 1) return close(); go(i + 1); }
  function close() { if (done) return; done = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); wrap.remove(); audio && audio.chime && audio.chime(); onDone && onDone(); }
  function onKey(e) { e.stopImmediatePropagation(); e.preventDefault(); if (e.type !== 'keydown' || e.repeat) return; if (e.code === 'Escape') close(); else if (e.code === 'ArrowLeft') go(i - 1); else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') next(); }
  goB.onclick = next; skB.onclick = close; bkB.onclick = () => go(i - 1); for (const b of [goB, skB, bkB]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
  window.addEventListener('keydown', onKey, true); raf = requestAnimationFrame(frame);
  return { close };
}
