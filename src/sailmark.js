// Знак игры: яхта сверху ходит по кругу, ветер дует сверху вниз. Минимализм в стиле игры: плоские цвета, чернильный
// контур, озёрная синева, оранжевый акцент. Это и спиннер загрузки, и кадры превью ссылки (tools/og.mjs).
// Видно, что ветер настоящий: струйки и пятна порывов бегут по ветру; против ветра яхта идёт медленнее, а прямо
// в ветер парус полощет; на курсе в бакштаг гик перелетает на другой борт (с запаздыванием -- как при повороте
// фордевинд); лодку кренит под ветер -- это видно по тени и по смещению топа мачты; за кормой тает след.
// Функция без состояния: кадр зависит только от времени t, поэтому анимация закольцована точно (период -- sailmark.T).
(function () {
  const TAU = Math.PI * 2, D = Math.PI / 180;
  // скорость по курсу к ветру (поляра): носом в ветер почти стоит, быстрее всего -- в галфвинд-бакштаг
  const vOf = (twa) => { const a = Math.abs(twa); return a < 32 * D ? 0.22 + 0.25 * (a / (32 * D)) : 0.55 + 0.45 * Math.sin(Math.min(a, 120 * D) * 0.75 + 0.3); };
  // один круг: таблица «время -> угол на круге», чтобы скорость менялась по поляре, а анимация замыкалась
  const N = 720, phiAt = new Float32Array(N + 1), T = 6; let tot = 0; const dt = [];
  const twaOf = (phi) => Math.atan2(Math.sin(phi), -Math.cos(phi)); // курс по кругу (по часовой) против ветра, дующего сверху; 0 -- носом в ветер
  for (let i = 0; i < N; i++) { const phi = (i / N) * TAU, d = 1 / vOf(twaOf(phi)); dt.push(d); tot += d; }
  { let acc = 0; phiAt[0] = 0; const tt = [0]; for (let i = 0; i < N; i++) { acc += dt[i] / tot; tt.push(acc); }
    for (let k = 0; k <= N; k++) { const u = k / N; let j = 0; while (j < N && tt[j + 1] < u) j++; const f = (u - tt[j]) / Math.max(1e-9, tt[j + 1] - tt[j]); phiAt[k] = ((j + f) / N) * TAU; } }
  const phiOf = (t) => { const u = (((t / T) % 1) + 1) % 1, x = u * N, i = Math.floor(x), f = x - i; return phiAt[i] + (phiAt[Math.min(N, i + 1)] - phiAt[i]) * f; };
  // гик: под ветер, тем дальше, чем полнее курс; сглаживание по прошлому -- перекидка видна как движение, а не скачок
  const boomTarget = (twa) => { const a = Math.abs(twa), s = twa > 0 ? -1 : 1; return s * Math.max(6 * D, Math.min(82 * D, (a - 22 * D) * 0.62)); };
  function boomAt(t) { let s = 0, w = 0; for (let k = 0; k < 10; k++) { const q = Math.exp(-k * 0.45), tw = twaOf(phiOf(t - k * 0.07)); s += boomTarget(tw) * q; w += q; } return s / w; }

  function sailmark(g, t, W, H, o) {
    o = o || {}; const cx = o.cx != null ? o.cx : W / 2, cy = o.cy != null ? o.cy : H / 2, R = o.R || Math.min(W, H) * 0.3, L = o.L || R * 0.42, ink = '#0b1d3a';
    const ws = o.wind || 1, rot = o.rot || 0;
    g.save();
    if (o.disk) { g.beginPath(); g.arc(cx, cy, o.disk, 0, TAU); g.clip(); }
    // вода
    const bg = g.createRadialGradient(cx, cy - R * 0.4, R * 0.2, cx, cy, Math.max(W, H) * 0.75); bg.addColorStop(0, '#1f78d6'); bg.addColorStop(1, '#0a2f72');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // порывы: тёмные пятна, сносимые ветром
    for (let i = 0; i < 6; i++) { const sp = H * 0.12 * ws, y = ((i * 0.37 + (t * sp) / H) % 1.3 - 0.15) * H, x = W * ((i * 0.618) % 1);
      const gr = g.createRadialGradient(x, y, 0, x, y, R * 0.9); gr.addColorStop(0, 'rgba(4,22,64,.28)'); gr.addColorStop(1, 'rgba(4,22,64,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
    // струйки ветра: тонкие штрихи с тающим хвостом, бегут по ветру сверху вниз
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) { const sp = H * 0.55 * ws * (0.8 + ((i * 7) % 5) * 0.1), y = ((i * 0.173 + (t * sp) / H) % 1.25 - 0.15) * H, x = W * ((i * 0.382 + 0.05) % 1) + Math.sin(t * 1.3 + i) * R * 0.02, len = H * (0.09 + ((i * 3) % 4) * 0.03);
      const lg = g.createLinearGradient(x, y, x + len * 0.06, y + len), al = 0.22 + ((i * 5) % 4) * 0.07; lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${al})`);
      g.strokeStyle = lg; g.lineWidth = Math.max(1, R * 0.014); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.06, y + len); g.stroke(); }
    // след: лента пены за кормой -- широкая и тающая к хвосту
    const P = (tt) => { const phi = phiOf(tt) + rot; return [cx + R * Math.cos(phi), cy + R * Math.sin(phi), phi]; }, K = 30;
    for (let k = K; k >= 1; k--) { const p0 = P(t - k * 0.055), p1 = P(t - (k - 1) * 0.055), f = k / K;
      g.strokeStyle = `rgba(235,248,255,${(1 - f) * 0.5})`; g.lineWidth = L * (0.12 + 0.3 * f); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
    const [x, y, phi] = P(t), th = phi + Math.PI, twa = twaOf(phi - rot), a = Math.abs(twa), boom = boomAt(t);
    const heel = Math.sin(Math.min(a, 100 * D)) * (a > 32 * D ? 1 : a / (32 * D)) * 0.22, lee = twa > 0 ? -1 : 1; // крен под ветер
    g.translate(x, y); g.rotate(th);
    // мачта, гик и грот; против ветра парус полощет; пузо паруса -- под ветер; топ мачты смещён креном
    const mx = 0, my = -L * 0.1, bl = L * 0.92, bx = mx + Math.sin(boom) * bl, by = my + Math.cos(boom) * bl, luff = a < 32 * D ? 1 - a / (32 * D) : 0;
    const belly = (1 - luff) * L * 0.3, tx = mx + lee * heel * L * 1.2;
    let nx = -(by - my), ny = bx - tx; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; if (nx * lee < 0) { nx = -nx; ny = -ny; }
    const sail = (ox, oy) => { g.beginPath(); g.moveTo(tx + ox, my + oy); g.lineTo(bx + ox, by + oy);
      for (let i = 10; i >= 0; i--) { const u = i / 10, px = tx + (bx - tx) * u, py = my + (by - my) * u;
        const off = belly * Math.sin(Math.PI * u) + luff * L * 0.08 * Math.sin(u * 14 - t * 30) * Math.sin(Math.PI * u); g.lineTo(px + nx * off + ox, py + ny * off + oy); }
      g.closePath(); };
    // тени: лодку кренит -- тень корпуса и паруса уходит под ветер
    g.fillStyle = 'rgba(2,14,40,.32)'; g.save(); g.translate(lee * heel * L * 0.9, L * 0.06); hull(g, L * 1.02); g.fill(); g.restore();
    sail(lee * (heel * 1.6 + 0.2) * L, L * 0.12); g.fill();
    // корпус: тёмно-синий лак, светлая палуба, оранжевая полоса -- как у яхты игрока
    hull(g, L); g.fillStyle = '#143a6e'; g.fill(); g.lineWidth = Math.max(1.5, L * 0.07); g.strokeStyle = ink; g.lineJoin = 'round'; g.stroke();
    g.save(); g.scale(0.78, 0.86); hull(g, L); g.fillStyle = '#efe9dc'; g.fill(); g.restore();
    g.beginPath(); g.moveTo(-L * 0.19, L * 0.39); g.lineTo(L * 0.19, L * 0.39); g.strokeStyle = '#ff8a2a'; g.lineWidth = Math.max(1.2, L * 0.07); g.stroke();
    sail(0, 0); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = ink; g.lineWidth = Math.max(1.2, L * 0.05); g.stroke();
    g.beginPath(); g.moveTo(mx, my); g.lineTo(bx, by); g.lineWidth = Math.max(1.5, L * 0.07); g.stroke(); // гик
    g.beginPath(); g.arc(tx, my, Math.max(1.6, L * 0.065), 0, TAU); g.fillStyle = '#ff8a2a'; g.fill(); g.lineWidth = Math.max(1, L * 0.03); g.stroke(); // топ мачты
    g.restore();
    if (o.disk) { g.beginPath(); g.arc(cx, cy, o.disk - 1, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke(); }
  }
  function hull(g, L) { g.beginPath(); g.moveTo(0, -L * 0.62); g.bezierCurveTo(L * 0.3, -L * 0.3, L * 0.28, L * 0.25, L * 0.2, L * 0.42); g.lineTo(-L * 0.2, L * 0.42); g.bezierCurveTo(-L * 0.28, L * 0.25, -L * 0.3, -L * 0.3, 0, -L * 0.62); g.closePath(); }
  sailmark.T = T;
  if (typeof window !== 'undefined') window.sailmark = sailmark;
})();
