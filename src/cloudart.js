// Заготовки облаков для цел-шейдинга.
//
// Силуэт -- не объединение кругов (оно читается как «башня из шаров»), а гладкое поле из эллипсов разного размера
// (метаболлы): широкое плоское тело, на нём 2-4 неодинаковых купола и мелкие неровности по краю. Выступы плавно
// сливаются в общую массу, основание срезано ровно (уровень конденсации).
// Объём и свет -- по градиенту общего поля: крупные пятна света и тени на всё облако, а не серп на каждом барашке.
// Линии складок -- только у 1-2 главных куполов, где они легли поверх тела.
// В текстуре не цвет, а «тон» (R: 0 -- глубокая тень, 1 -- свет), «кайма» (G: близость к краю -- подсветка
// контражуром и лунный контур) и «глубина» (A: расстояние до края формы -- чёткая вырезка и таяние).
// Цвета подставляет шейдер по времени суток и погоде (clouds.js).
export const AW = 2048, AH = 1024;

export function makeCloudAtlas() {
  const data = new Uint8Array(AW * AH * 4), rects = {}; let seed = 97; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + (b - a) * r();
  const L = (() => { const x = -0.45, y = 0.75, z = 0.5, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })(); // свет сверху-слева

  // lobes: {x, y, rx, ry, crease?}; y -- вверх от низа заготовки. Каждый эллипс -- «подушка» высотой min(rx,ry);
  // облако -- их мягкое объединение (smooth max с плавной перемычкой): выступы сливаются, но рельеф остаётся.
  function blob(name, x0, y0, w, h, lobes, { base = 5, k = 6, grad = 0.42, band = 4, line = 1.4, lift = 0.06 } = {}) {
    const Z = new Float32Array(w * h).fill(-1e9), C = new Uint8Array(w * h);
    const smax = (a, b) => { const hh = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return a + (b - a) * hh + k * hh * (1 - hh); };
    for (const l of lobes) { const xa = Math.max(0, Math.floor(l.x - l.rx)), xb = Math.min(w - 1, Math.ceil(l.x + l.rx)), ya = Math.max(0, Math.floor(l.y - l.ry)), yb = Math.min(h - 1, Math.ceil(l.y + l.ry)), hz = Math.min(l.rx, l.ry);
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const ex = (x - l.x) / l.rx, ey = (y - l.y) / l.ry, e = ex * ex + ey * ey; if (e >= 1) continue; const kk = y * w + x, z = hz * Math.sqrt(1 - e) + (l.dz || 0);
        if (C[kk]) Z[kk] = smax(Z[kk], z); else { Z[kk] = z; C[kk] = 1; } } }
    let top = base + 1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const kk = y * w + x; if (C[kk] && (y < base || x < 2 || x > w - 3 || y > h - 3)) C[kk] = 0; if (C[kk]) top = Math.max(top, y); }
    const T = new Float32Array(w * h), zc = (kk) => (C[kk] ? Z[kk] : 0);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const kk = y * w + x; if (!C[kk]) continue;
      const gx = (zc(kk + 1) - zc(kk - 1)) * 0.5, gy = (zc(kk + w) - zc(kk - w)) * 0.5, nl = Math.hypot(gx, gy, 1), s = (-gx * L[0] - gy * L[1] + L[2]) / nl, g = (y - base) / (top - base);
      let t = (0.5 + 0.5 * s) * (1 - grad) + g * (grad + 0.15) + lift - 0.12; // низ облака -- в голубой тени
      if (y < base + band) t = Math.min(t, y < base + band * 0.45 ? 0.12 : 0.38); // полоса тени по основанию
      T[kk] = t; }
    // складки: контур главного купола поверх тела -- только верхняя-правая дуга
    for (const l of lobes) { if (!l.crease) continue; const xa = Math.max(1, Math.floor(l.x - l.rx)), xb = Math.min(w - 2, Math.ceil(l.x + l.rx)), ya = Math.max(1, Math.floor(l.y - l.ry)), yb = Math.min(h - 2, Math.ceil(l.y + l.ry));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const kk = y * w + x; if (!C[kk]) continue; const ex = (x - l.x) / l.rx, ey = (y - l.y) / l.ry, d = Math.sqrt(ex * ex + ey * ey);
        if (Math.abs(d - 1) < line / Math.min(l.rx, l.ry) && ey < 0 && ey > -0.85 && ex > -0.2) T[kk] = Math.min(T[kk], 0.42); } }
    write(name, x0, y0, w, h, T, C);
  }
  // выступы по верхнему контуру: разного размера, неравномерно, центр чуть ниже контура -- «цветная капуста» без рядов шаров
  function scallop(lo, w, h, base, from, to, size, dens = 1) {
    const topAt = (x) => { let m = -1, who = null; for (const l of lo) { const q = 1 - ((x - l.x) / l.rx) ** 2; if (q > 0) { const y = l.y + l.ry * Math.sqrt(q); if (y > m) { m = y; who = l; } } } return [m, who]; };
    for (let x = from; x < to;) { const [ty, who] = topAt(x); if (!who || ty < base + 6) { x += 4; continue; }
      const rs = Math.max(4, Math.min(who.rx, who.ry) * size * rr(0.35, 1)); lo.push({ x, y: Math.max(base + rs * 0.6, ty - rs * rr(0.45, 0.75)), rx: rs * rr(1, 1.3), ry: rs, dz: Math.min(who.rx, who.ry) * 0.25 });
      x += rs * rr(1.1, 2.2) * dens; }
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

  // ---- кучевое: широкое плоское тело, 1-3 неодинаковых купола, выступы по контуру, асимметрия ----
  function cumulus(w, h, puff = 1) {
    const base = 5, H = h - base - 4, lo = [], cx = w * rr(0.36, 0.64);
    lo.push({ x: cx, y: base + 2, rx: w * rr(0.38, 0.46), ry: H * rr(0.32, 0.42) });                            // тело
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) { const big = i === 0, x = big ? cx + w * rr(-0.1, 0.1) : cx + (r() < 0.5 ? -1 : 1) * w * rr(0.12, 0.26);
      const rx = w * (big ? rr(0.15, 0.22) : rr(0.08, 0.14)), hh = H * (big ? rr(0.7, 0.95) : rr(0.4, 0.65)) * puff, ry = Math.min(hh * 0.6, rx * rr(0.7, 1));
      lo.push({ x, y: base + hh - ry, rx, ry, crease: big }); }
    scallop(lo, w, h, base, w * 0.08, w * 0.92, rr(0.4, 0.6));
    for (const l of lo) { l.rx = Math.min(l.rx, l.x - 3, w - 3 - l.x); l.ry = Math.min(l.ry, h - 3 - l.y); }
    return lo.filter((l) => l.rx > 2 && l.ry > 2);
  }
  // 12 кучевых 256x112 разного характера: от плоских до пышных
  for (let k = 0; k < 12; k++) blob('cu' + k, (k % 8) * 256, Math.floor(k / 8) * 112, 256, 112, cumulus(256, 112, [0.55, 0.75, 0.95][k % 3]));
  // 2 больших кучевых 512x144 -- несколько масс в одном облаке
  for (let k = 0; k < 2; k++) { const lo = []; let x = rr(70, 110);
    while (x < 512 - 70) { const part = cumulus(160, 140, rr(0.6, 1)); for (const l of part) lo.push({ ...l, x: l.x + x - 80 }); x += rr(100, 150); }
    blob('cuL' + k, 1024 + k * 512, 112, 512, 144, lo.filter((l) => l.x - l.rx > 2 && l.x + l.rx < 510)); }
  // ---- грозовая туча 384x256: широкая плоская тёмная подошва далеко в стороны, над ней мощный клубящийся массив
  //      с неровным округлым верхом (без «гриба» и наковальни) ----
  for (let k = 0; k < 2; k++) { const W = 384, H = 256, base = 5, lo = [], cx = W * rr(0.42, 0.55);
    lo.push({ x: W * 0.5, y: base + 4, rx: W * 0.49, ry: 16 });                                                  // подошва
    lo.push({ x: cx, y: base + 20, rx: W * 0.33, ry: 50 });                                                      // нижний массив
    lo.push({ x: cx - W * 0.2, y: base + 40, rx: W * 0.13, ry: 46, crease: true });                              // левое плечо
    lo.push({ x: cx + W * 0.19, y: base + 52, rx: W * 0.14, ry: 52, crease: true });                             // правое плечо
    lo.push({ x: cx - W * 0.03, y: base + 100, rx: W * 0.15, ry: 68, crease: true });                            // башня
    lo.push({ x: cx + W * 0.04, y: base + 150, rx: W * 0.1, ry: 46, crease: true });                             // купол
    lo.push({ x: cx + W * (k ? -0.33 : 0.33), y: base + 18, rx: W * 0.1, ry: 26 });                              // низкий край
    scallop(lo, W, H, base, 20, W - 20, 0.4, 0.9);
    for (const l of lo) { l.rx = Math.min(l.rx, l.x - 3, W - 3 - l.x); l.ry = Math.min(l.ry, H - 3 - l.y); }
    blob('cb' + k, k * 384, 256, W, H, lo.filter((l) => l.rx > 2 && l.ry > 2), { band: 8, grad: 0.5, k: 10 }); }
  // ---- слоисто-кучевые гряды 512x72: волнистые массы с разрывами, не сплошная стена ----
  for (let k = 0; k < 4; k++) { const W = 512, H = 72, lo = []; let x = rr(20, 60);
    while (x < W - 30) { const seg = rr(70, 190), th = rr(14, 30); // кусок гряды
      for (let s = 0; s < seg; s += rr(14, 28)) { const rx = rr(14, 34), ry = th * rr(0.5, 1) * Math.sin(Math.PI * (s + 8) / (seg + 16)) + 5; if (x + s + rx < W - 3) lo.push({ x: x + s, y: 5 + ry * 0.45, rx, ry }); }
      x += seg + rr(30, 90); }
    blob('st' + k, 768 + (k % 2) * 512, 256 + Math.floor(k / 2) * 72, W, H, lo, { band: 4, grad: 0.35, k: 5 }); }
  // ---- перистые 512x96: пучки тонких волокон с загнутыми «когтями», разные углы и длины ----
  for (let k = 0; k < 4; k++) { const W = 512, H = 96, x0 = 768 + (k % 2) * 512, y0 = 400 + Math.floor(k / 2) * 96, T = new Float32Array(W * H), C = new Uint8Array(W * H);
    const bundles = 2 + Math.floor(r() * 3);
    for (let b = 0; b < bundles; b++) { const bx = rr(20, 260), by = rr(25, 70), Lb = rr(140, 300), ang = rr(-0.12, 0.18), hook = rr(-1, 1) * (k % 2 ? 1 : 0.3), nf = 4 + Math.floor(r() * 8);
      for (let f = 0; f < nf; f++) { const off = rr(-9, 9), s0 = rr(0, 0.35), s1 = rr(0.55, 1), th = rr(0.7, 2.4), div = rr(-0.08, 0.08);
        for (let t = s0; t < s1; t += 0.5 / Lb) { const px = bx + t * Lb, py = by + off + t * Lb * (ang + div * t) + hook * 22 * Math.pow(Math.max(0, t - 0.7) / 0.3, 2), taper = Math.sin(Math.PI * (t - s0) / (s1 - s0)), hw = th * taper;
          for (let y = Math.floor(py - hw - 1); y <= py + hw + 1; y++) { if (y < 1 || y >= H - 1 || px < 1 || px >= W - 1) continue; const q = 1 - Math.abs(y - py) / Math.max(hw, 0.3); if (q <= 0) continue; const kk = y * W + Math.round(px); C[kk] = 1; T[kk] = Math.max(T[kk], y > py - 0.3 ? 0.9 : 0.45); } } } }
    write('ci' + k, x0, y0, W, H, T, C, 2); }
  // полосы дождя 128x256 под грозовыми (A -- плотность)
  { const W = 128, H = 256, x0 = 1920, y0 = 600; for (let i = 0; i < 70; i++) { const x = 4 + r() * (W - 8), top = H - r() * 30, len = 80 + r() * 160;
      for (let y = Math.max(0, Math.floor(top - len)); y < top; y++) { const xx = Math.round(x - (top - y) * 0.12); if (xx < 0 || xx >= W) continue; const o = ((y0 + y) * AW + x0 + xx) * 4, a = Math.min(1, (y - (top - len)) / 60);
        data[o] = 128; data[o + 3] = Math.max(data[o + 3], a * 200); } }
    rects.rain = [x0 / AW, y0 / AH, W / AW, H / AH]; }
  return { data, rects };
}
