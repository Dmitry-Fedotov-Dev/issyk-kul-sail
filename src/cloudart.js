// Заготовки облаков для цел-шейдинга -- как на референсе: «цветная капуста» из барашков с плоским основанием.
//
// Облако рисуется как художник рисует аниме-кучевое: барашки кладутся от дальних (верхних) к ближним (нижним),
// каждый следующий перекрывает низ предыдущего. Свет -- сверху-сбоку, поэтому у каждого барашка белая шапка,
// а внизу -- голубой серп тени; там, где передний барашек лёг на задний, -- тонкая линия. Снизу облако срезано
// ровно (уровень конденсации) с голубой полосой тени.
// В текстуре не цвет, а «тон» (R: 0 -- глубокая тень, 1 -- свет), «кайма» (G: близость к краю -- для подсветки
// контражуром и лунного контура) и «глубина» (A: расстояние до края формы -- для чёткой вырезки и таяния).
// Цвета подставляет шейдер по времени суток и погоде.
export const AW = 2048, AH = 1024;

export function makeCloudAtlas() {
  const data = new Uint8Array(AW * AH * 4), rects = {}; let seed = 71; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const L = (() => { const x = -0.42, y = 0.78, z = 0.46, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })(); // свет: сверху-слева, чуть на нас

  // puffs: [cx, cy, r] (y -- вверх от низа), в порядке рисования; base -- уровень среза; top -- верх облака (для градиента)
  function bake(name, x0, y0, w, h, puffs, { base = 6, band = 5, line = 1.6, grad = 0.4, prof = null } = {}) {
    const T = new Float32Array(w * h), C = new Uint8Array(w * h); let top = base + 1; prof = prof || puffs.prof;
    puffs = puffs.map(([cx, cy, pr]) => { pr = Math.min(pr, cx - 3, w - 3 - cx, h - 3 - cy); return [cx, cy, pr]; }).filter((q) => q[2] > 3);
    for (const [, cy, pr] of puffs) top = Math.max(top, cy + pr);
    // тело облака под барашками -- без дыр; низ -- в тени
    if (prof) for (let x = 10; x < w - 10; x++) { const pt = prof(x) * 0.86; if (pt < 5) continue; for (let y = base; y < base + pt && y < h; y++) { const k = y * w + x; T[k] = 0.25 + 0.5 * (y - base) / (top - base); C[k] = 1; } }
    for (const [cx, cy, pr] of puffs) {
      const xa = Math.max(0, Math.floor(cx - pr)), xb = Math.min(w - 1, Math.ceil(cx + pr)), ya = Math.max(0, Math.floor(cy - pr)), yb = Math.min(h - 1, Math.ceil(cy + pr));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const dx = (x - cx) / pr, dy = (y - cy) / pr, d2 = dx * dx + dy * dy; if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2), s = dx * L[0] + dy * L[1] + nz * L[2], g = (y - base) / (top - base);
        let t = (0.5 + 0.5 * s) * (1 - grad) + g * grad + 0.08; // свой объём барашка + «низ облака темнее»
        const k = y * w + x;
        if (C[k] && Math.sqrt(d2) * pr > pr - line && dy > 0.25 && dx < 0.6) t = Math.min(t, 0.4); // линия, где барашок лёг поверх другого
        T[k] = t; C[k] = 1;
      }
    }
    // ровное основание с полосой тени
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!C[k]) continue;
      if (y < base) { C[k] = 0; continue; } if (y < base + band) T[k] = Math.min(T[k], y < base + band * 0.4 ? 0.12 : 0.36); }
    write(name, x0, y0, w, h, T, C);
  }
  // расстояние до края формы (два прохода) -> A; близость к краю -> G
  function write(name, x0, y0, w, h, T, C, Rn) {
    const D = new Float32Array(w * h); for (let k = 0; k < w * h; k++) D[k] = C[k] ? 1e9 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!D[k]) continue;
      D[k] = Math.min(D[k], x > 0 ? D[k - 1] + 1 : 1, y > 0 ? D[k - w] + 1 : 1, x > 0 && y > 0 ? D[k - w - 1] + 1.414 : 1.414, x < w - 1 && y > 0 ? D[k - w + 1] + 1.414 : 1.414); }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const k = y * w + x; if (!D[k]) continue;
      D[k] = Math.min(D[k], x < w - 1 ? D[k + 1] + 1 : 1, y < h - 1 ? D[k + w] + 1 : 1, x < w - 1 && y < h - 1 ? D[k + w + 1] + 1.414 : 1.414, x > 0 && y < h - 1 ? D[k + w - 1] + 1.414 : 1.414); }
    let mx = 1; for (let k = 0; k < w * h; k++) mx = Math.max(mx, D[k]); const R = Rn || Math.max(6, mx * 0.8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x, o = ((y0 + y) * AW + x0 + x) * 4;
      data[o] = Math.max(0, Math.min(1, T[k])) * 255; data[o + 1] = Math.max(0, 1 - D[k] / 5) * 255; data[o + 2] = 0; data[o + 3] = Math.min(1, D[k] / R) * 255; }
    rects[name] = [x0 / AW, y0 / AH, w / AW, h / AH];
  }
  // кучевое: силуэт -- несколько куполов (главный и плечи), заполняется рядами барашков сверху вниз
  function cumulus(w, h, { domes = 3, flat = 0, tower = 0 } = {}) {
    const base = 6, cx = w * (0.4 + r() * 0.2), D = [{ x: cx, hh: (h - base - 6) * (1 - flat * 0.25), hw: w * (0.22 + r() * 0.08) }];
    for (let i = 1; i < domes; i++) { const side = i % 2 ? -1 : 1, off = w * (0.14 + r() * 0.2) * Math.ceil(i / 2); D.push({ x: cx + side * off, hh: D[0].hh * (0.45 + r() * 0.35) / Math.ceil(i / 2) ** 0.4, hw: w * (0.13 + r() * 0.1) }); }
    // крылья у основания -- облако расползается по уровню конденсации
    D.push({ x: w * 0.5, hh: (h - base) * (0.18 + flat * 0.2), hw: w * 0.46 });
    for (const d of D) { d.hw = Math.min(d.hw, d.x - 12, w - 12 - d.x); d.hh = Math.min(d.hh, h - base - 4); }
    const prof = (x) => { let m = 0; for (const d of D) { const q = 1 - ((x - d.x) / d.hw) ** 2; if (q > 0) m = Math.max(m, d.hh * Math.pow(q, 0.55)); } return m; };
    const p = [], R0 = Math.max(10, (h - base) * (tower ? 0.2 : 0.3));
    // верхний ряд -- барашки по силуэту (дальние, рисуются первыми)
    for (let x = 8; x < w - 8;) { const pt = prof(x); if (pt < 6) { x += 3; continue; } const rr = Math.max(7, Math.min(R0 * (0.7 + r() * 0.5), pt * 0.55 + 6)); p.push([x, base + pt - rr * (0.95 + r() * 0.15), rr]); x += rr * (0.75 + r() * 0.45); }
    // ряды ниже -- всё ближе к зрителю, барашки мельче к основанию
    const rows = tower ? 3 : flat ? 0 : 1;
    for (let k = 1; k <= rows; k++) { const f = k / (rows + 0.6);
      for (let x = 10 + r() * 14; x < w - 10;) { const pt = prof(x); const yc = base + pt * (1 - f) - 4; const rr = Math.max(6, R0 * (0.85 - f * 0.35) * (0.7 + r() * 0.5));
        if (pt > rr * 1.3 && yc - rr > base - rr * 0.8) p.push([x + (r() - 0.5) * 6, Math.max(base + rr * 0.45, yc - rr * 0.6), rr]); x += rr * (1.0 + r() * 0.6); } }
    p.prof = prof; return p;
  }

  // кучевые хорошей погоды (humilis): 8 штук 256x96 -- плоские, широкие
  for (let k = 0; k < 8; k++) bake('cuH' + k, k * 256, 0, 256, 96, cumulus(256, 96, { domes: 2 + (k % 3), flat: 1 }), { grad: 0.3 });
  // средние (mediocris): 8 штук 256x144
  for (let k = 0; k < 8; k++) bake('cuM' + k, k * 256, 96, 256, 144, cumulus(256, 144, { domes: 3 + (k % 2) }), { band: 6 });
  // мощные (congestus): 4 штуки 256x240
  for (let k = 0; k < 4; k++) bake('cuC' + k, k * 256, 240, 256, 240, cumulus(256, 240, { domes: 2 + (k % 3), tower: 1 }), { band: 7, grad: 0.5 });
  // кучево-дождевые 320x400: столб, у двух -- наковальня под тропопаузой
  for (let k = 0; k < 3; k++) { const W = 320, H = 400, p = [], base = 6;
    if (k > 0) for (let i = 0; i < 12; i++) { const t = i / 11; p.push([18 + t * (W - 36), H - 44 - Math.abs(t - 0.5) * 34 + r() * 8, 18 + r() * 12]); }
    for (let j = 9; j >= 0; j--) { const y = 40 + j * 30, rr = 34 + (9 - j) * 1.2 + r() * 10; for (let q = -1; q <= 1; q++) p.push([W / 2 + q * rr * 0.9 + (r() - 0.5) * 26, y + Math.abs(q) * -10, rr * (q ? 0.8 : 1)]); }
    for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, rr = 20 + r() * 14; p.push([20 + t * (W - 40), base + rr * 0.5, rr]); }
    bake('cb' + k, 1024 + k * 320, 240, W, H, p, { band: 10, grad: 0.55 }); }
  // гряды у горизонта 512x72: цепочка плоских барашков, ровный низ
  for (let k = 0; k < 4; k++) { const W = 512, H = 72, p = []; let x = 14;
    while (x < W - 14) { const env = Math.pow(Math.sin(Math.PI * x / W), 0.6), rr = (6 + r() * 16) * (0.4 + 0.6 * env); p.push([x, 6 + rr * (0.5 + r() * 0.5), rr]); x += rr * (0.55 + r() * 0.6); }
    bake('st' + k, (k % 2) * 512, 480 + Math.floor(k / 2) * 72, W, H, p, { band: 4, grad: 0.25 }); }
  // перистые 512x64: острые штрихи-«перья», вытянутые по ветру
  for (let k = 0; k < 4; k++) { const W = 512, H = 64, x0 = (k % 2) * 512, y0 = 624 + Math.floor(k / 2) * 64, strokes = [];
    const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) strokes.push({ sx: 20 + r() * 120, sy: 12 + r() * 38, L: 220 + r() * 260, w: 3 + r() * 4, b: (r() - 0.3) * 18 });
    const T = new Float32Array(W * H), C = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let A = 0, ny = 0;
      for (const s of strokes) { const t = (x - s.sx) / s.L; if (t < 0 || t > 1) continue; const cy = s.sy + s.b * t * t, hw = s.w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8) * (1 - 0.6 * t); if (hw <= 0.5) continue;
        const q = 1 - Math.abs(y - cy) / hw; if (q > A) { A = q; ny = (y - cy) / hw; } }
      if (A > 0) { C[y * W + x] = 1; T[y * W + x] = ny > -0.3 ? 0.9 : 0.45; } }
    write('ci' + k, x0, y0, W, H, T, C, 3); }
  // полосы дождя 128x256 под грозовыми башнями (A -- плотность)
  { const W = 128, H = 256, x0 = 1920, y0 = 640; for (let i = 0; i < 70; i++) { const x = 4 + r() * (W - 8), top = H - r() * 30, len = 80 + r() * 160;
      for (let y = Math.max(0, Math.floor(top - len)); y < top; y++) { const xx = Math.round(x - (top - y) * 0.12); if (xx < 0 || xx >= W) continue; const o = ((y0 + y) * AW + x0 + xx) * 4, a = Math.min(1, (y - (top - len)) / 60);
        data[o] = 128; data[o + 3] = Math.max(data[o + 3], a * 200); } }
    rects.rain = [x0 / AW, y0 / AH, W / AW, H / AH]; }
  return { data, rects };
}
