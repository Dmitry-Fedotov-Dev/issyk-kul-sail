// Заготовки облаков для цел-шейдинга: десять типов горной облачности Иссык-Куля, у каждого -- свой генератор силуэта
// и 2-6 вариантов. Художественный ориентир -- атлас «Issyk-Sail Living Atmosphere»: плоское основание, неодинаковые
// купола, сливающиеся в одну массу, 3-4 тона, тёмный контур.
//
// Силуэт -- поле высоты «подушки» (каждая часть -- эллипс или своя функция профиля), части сливаются мягким максимумом.
// Объём и свет -- по градиенту поля, тень у основания -- по нижнему краю каждого столбца (повторяет и плоское дно,
// и вырез под вершину, и рваный низ роторного облака). Отдельные массы (хлопья высококучевых, линзы в стопке, соседние
// башни) рисуются по очереди -- между ними ложится тёмная линия, как у художника.
// В текстуре не цвет, а «тон» (R: 0 -- глубокая тень, 1 -- свет), «кайма» (G: близость к краю -- подсветка
// контражуром) и «глубина» (A: расстояние до края формы -- чёткая вырезка и таяние). Цвета -- в шейдере (clouds.js).
//
// Типы (имя -- число вариантов): hum -- Cumulus humilis, cu -- Cumulus mediocris, ac -- Altocumulus, ci -- Cirrus,
// len -- Lenticularis, cap -- шапка на вершине, ban -- флаговое, rot -- роторное, st -- Stratocumulus,
// fog -- туман и низкая облачность в долинах, cbT -- мощная кучевая / молодая грозовая, cbA -- грозовая с наковальней.
export const AW = 2048, AH = 2048;
export const PHI = (1 + Math.sqrt(5)) / 2, IPHI = PHI - 1; // золотое сечение
export const CLOUD_KINDS = { hum: 5, cu: 6, ac: 4, ci: 4, len: 4, cap: 4, ban: 4, rot: 4, st: 4, fog: 3, cbT: 2, cbA: 2, val: 4 };

// синхронно (экспорт PNG, тесты)
export function makeCloudAtlas() { const g = atlasJobs(); let st; while (!(st = g.next()).done); return st.value; }
// по кусочкам между кадрами: генерация ~1 с не подвешивает загрузку игры
// в отдельном потоке, если сборка его встроила; иначе -- по кусочкам между кадрами
/* global __CLOUD_WORKER__ */
export function makeCloudAtlasWorker() { try { if (typeof __CLOUD_WORKER__ === 'string' && typeof Worker !== 'undefined') {
    const url = URL.createObjectURL(new Blob([__CLOUD_WORKER__], { type: 'text/javascript' })), w = new Worker(url);
    return new Promise((res) => { const done = (A) => { w.terminate(); URL.revokeObjectURL(url); res(A); };
      w.onmessage = (e) => done(e.data); w.onerror = (e) => { e.preventDefault && e.preventDefault(); makeCloudAtlasAsync().then(done); }; w.postMessage(1); }); } } catch (e) { /* без потоков */ }
  return makeCloudAtlasAsync(); }
export function makeCloudAtlasAsync(budget = 10) { return new Promise((res) => { const g = atlasJobs();
  const step = () => { const t = performance.now(); let st; while (!(st = g.next()).done) if (performance.now() - t > budget) { setTimeout(step, 0); return; } res(st.value); }; step(); }); }

function* atlasJobs() {
  const data = new Uint8Array(AW * AH * 4), rects = {}, px = {}, meta = {}, items = [];
  let seed = 97; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + (b - a) * r(), pr = (a, b, p = 1.6) => a + (b - a) * r() ** p; // pr -- чаще мелкие
  const memo = (f) => { const c = []; return (x) => { if (!Number.isInteger(x) || x < 0 || x > 4096) return f(x); if (!(x in c)) c[x] = f(x); return c[x]; }; }; // по целому x -- один раз
  const L = (() => { const x = -0.45, y = 0.75, z = 0.5, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })(); // свет сверху-слева

  // ---------- поле высоты ----------
  // часть: эллипс {x, y, rx, ry, dz?, crease?} (y -- вверх от низа заготовки) или функция {fn(x, y) -> z | -1, box: [xa, xb, ya, yb]}
  function each(p, w, h, cb) {
    if (p.fn) { const xa = Math.max(0, Math.floor(p.box[0])), xb = Math.min(w - 1, Math.ceil(p.box[1])), ya = Math.max(0, Math.floor(p.box[2])), yb = Math.min(h - 1, Math.ceil(p.box[3])), bw = xb - xa + 1;
      if (!p.zc) { p.zc = new Float32Array(Math.max(0, bw * (yb - ya + 1))); for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) p.zc[(y - ya) * bw + x - xa] = p.fn(x, y); } // профиль считается один раз
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const z = p.zc[(y - ya) * bw + x - xa]; if (z >= 0) cb(x, y, z); } return; }
    const xa = Math.max(0, Math.floor(p.x - p.rx)), xb = Math.min(w - 1, Math.ceil(p.x + p.rx)), ya = Math.max(0, Math.floor(p.y - p.ry)), yb = Math.min(h - 1, Math.ceil(p.y + p.ry)), hz = Math.min(p.rx, p.ry);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const ex = (x - p.x) / p.rx, ey = (y - p.y) / p.ry, e = ex * ex + ey * ey; if (e < 1) cb(x, y, hz * Math.sqrt(1 - e) + (p.dz || 0)); }
  }
  function maskOf(parts, w, h) { const M = new Uint8Array(w * h); for (const p of parts) each(p, w, h, (x, y) => { M[y * w + x] = 1; }); return M; }
  const topProf = (M, w, h) => { const t = new Int16Array(w).fill(-1); for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) if (M[y * w + x]) { t[x] = y; break; } return t; };
  const botProf = (M, w, h) => { const t = new Int16Array(w).fill(-1); for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (M[y * w + x]) { t[x] = y; break; } return t; };
  // выступы по верхнему (или нижнему) контуру: разного размера, через неравные промежутки, центр чуть внутри контура
  // rel: размер -- доля местной толщины облака над base (у вершины -- крупные купола, к краям -- мелочь)
  function lumps(parts, w, h, { x0, x1, r0, r1, ymin = 0, ymax = 1e9, dz = 0, gap = [1, 2], sink = [0.35, 0.7], crease = 0, skip = 0, down = false, rel = null, base = 0 }) {
    const M = maskOf(parts, w, h), t = down ? botProf(M, w, h) : topProf(M, w, h);
    for (let x = Math.max(2, x0); x < Math.min(w - 2, x1);) { const ty = t[Math.round(x)]; if (ty < 0 || ty < ymin || ty > ymax) { x += 3; continue; }
      let rad = rel ? Math.max(r0, Math.min(r1, (ty - base) * rr(...rel))) : pr(r0, r1); const sk = rr(...sink); if (down) rad = Math.min(rad, (ty - 3) / Math.max(0.05, 1 - sk)); // доля снизу не уходит за край
      if (r() >= skip && rad > 1.5) parts.push({ x, y: down ? ty + rad * sk : ty - rad * sk, rx: rad * rr(1, 1.35), ry: rad, dz: dz < 0 ? rad * -dz : dz, crease: r() < crease });
      x += Math.max(2, rad * rr(gap[0], gap[1])); }
  }
  // выступы по боковому контуру (крутые бока башен): размер -- доля местной полуширины
  function lumpsSide(parts, w, h, { side, y0, y1, rel, r0, r1, gap = [1, 1.9], sink = [0.3, 0.6], crease = 0, skip = 0, dz = -0.3 }) {
    const M = maskOf(parts, w, h), Lp = new Int16Array(h).fill(-1), Rp = new Int16Array(h).fill(-1);
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) if (M[y * w + x]) { Lp[y] = x; break; } for (let x = w - 1; x >= 0; x--) if (M[y * w + x]) { Rp[y] = x; break; } }
    for (let y = Math.max(2, y0); y < Math.min(h - 2, y1);) { const yi = Math.round(y); if (Lp[yi] < 0) { y += 3; continue; } const hw = (Rp[yi] - Lp[yi]) / 2, ex = side < 0 ? Lp[yi] : Rp[yi];
      const rad = Math.max(r0, Math.min(r1, hw * rr(...rel))); if (r() >= skip) parts.push({ x: ex - side * rad * rr(...sink), y, rx: rad * rr(1, 1.3), ry: rad, dz: rad * -dz, crease: r() < crease });
      y += rad * rr(...gap); }
  }
  // «горка» -- общая масса облака: суперэллипс |u|^a + v^b < 1 с плоским дном; b < 1.5 -- холм-пирамида, b > 2.5 -- колонна с плоским верхом
  // v0 -- срез купола выше «экватора»: бока подходят к плоскому дну наклонно, без отвесной стенки
  const mound = ({ cx, base, wl, wr, hm, a = 2, b = 2, lean = 0, zk = 0.6, v0 = 0.3, rb = 0.3 }) => ({ fn: (x, y) => { const v1 = (y - base) / hm; if (v1 < 0 || v1 >= 1) return -1; const dx1 = x - cx - lean * v1 * hm, u1 = Math.min(1, Math.abs(dx1) / (dx1 < 0 ? wl : wr)), v = v1 - rb * u1 ** 2.5; if (v < 0) return -1; // подошва к краям приподнята -- углы круглые
    const dx = x - cx - lean * v * hm, u = Math.abs(dx) / (dx < 0 ? wl : wr), e = u ** a + (v0 + (1 - v0) * v) ** b;
    return e >= 1 ? -1 : Math.min(wl, wr, hm) * zk * Math.sqrt(1 - e); }, box: [cx - wl - Math.abs(lean) * hm - 1, cx + wr + Math.abs(lean) * hm + 1, base, base + hm] });
  const clampParts = (P, w, h) => { for (const l of P) if (!l.fn) { l.rx = Math.min(l.rx, l.x - 3, w - 3 - l.x); l.ry = Math.min(l.ry, h - 3 - l.y, l.y - 3); } return P.filter((l) => l.fn || (l.rx > 1.5 && l.ry > 1.5)); }; // в пределах заготовки -- иначе край срежет прямой

  // одна масса: поле -> тон в T, маска в C. sep -- тёмная линия там, где масса легла поверх уже нарисованной
  function paint(T, C, w, h, parts, { k = 6, grad = 0.42, band = 4, line = 1.4, lift = 0.06, base = 0, cut = null, sep = true } = {}) {
    const Z = new Float32Array(w * h), M = new Uint8Array(w * h);
    const smax = (a, b) => { const q = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return a + (b - a) * q + k * q * (1 - q); };
    let bx0 = w, bx1 = 0, by0 = h, by1 = 0; // рамка массы -- дальше считаем только в ней
    for (const p of parts) each(p, w, h, (x, y, z) => { const kk = y * w + x; if (M[kk]) Z[kk] = smax(Z[kk], z); else { Z[kk] = z; M[kk] = 1; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; } });
    bx0 = Math.max(1, bx0 - 1); bx1 = Math.min(w - 2, bx1 + 1); by0 = Math.max(1, by0 - 1); by1 = Math.min(h - 2, by1 + 1);
    let y0 = h, y1 = 0;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const kk = y * w + x; if (!M[kk]) continue;
      if (y < base || y < 2 || y > h - 3 || x < 2 || x > w - 3 || (cut && cut(x, y))) { M[kk] = 0; continue; } y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (y1 <= y0) return;
    const run = new Uint16Array(w), zc = (kk) => (M[kk] ? Z[kk] : 0), on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && M[y * w + x];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const kk = y * w + x; run[x] = M[kk] ? run[x] + 1 : 0; if (!M[kk]) continue;
      const gx = (zc(kk + 1) - zc(kk - 1)) * 0.5, gy = (zc(kk + w) - zc(kk - w)) * 0.5, nl = Math.hypot(gx, gy, 1), s = (-gx * L[0] - gy * L[1] + L[2]) / nl, g = (y - y0) / (y1 - y0);
      let t = (0.5 + 0.5 * s) * (1 - grad) + g * (grad + 0.15) + lift - 0.12;       // низ облака -- в голубой тени
      if (band && run[x] <= band) t = Math.min(t, 0.2 + 0.1 * run[x] / band); // собственная тень низа -- мягкая, тоном тени, а не глубокой тени; у самого края её подсветит рефлекс
      if (sep && C[kk]) { let e = false; for (let d = 1; d <= 2 && !e; d++) e = !on(x - d, y) || !on(x + d, y) || !on(x, y - d) || !on(x, y + d); if (e) t = 0.06; }
      T[kk] = t; C[kk] = 1; }
    // складки: дуга купола, лёгшего поверх массы, -- только верх-право (по свету)
    for (const l of parts) { if (!l.crease || l.fn) continue; const xa = Math.max(1, Math.floor(l.x - l.rx)), xb = Math.min(w - 2, Math.ceil(l.x + l.rx)), ya = Math.max(1, Math.floor(l.y - l.ry)), yb = Math.min(h - 2, Math.ceil(l.y + l.ry));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const kk = y * w + x; if (!M[kk]) continue; const ex = (x - l.x) / l.rx, ey = (y - l.y) / l.ry, d = Math.sqrt(ex * ex + ey * ey);
        if (Math.abs(d - 1) < line / Math.min(l.rx, l.ry) && ey < 0 && ey > -0.85 && ex > -0.2) T[kk] = Math.min(T[kk], 0.42); } }
  }
  const sprite = (name, w, h, fill, Rn) => items.push({ name, w, h, fill, Rn }); // рисуется позже, по одной заготовке за шаг

  // ================= Cumulus: широкое плоское тело, 1-3 неодинаковых купола, выступы двух масштабов =================
  // Пропорции по золотому сечению φ: ширина силуэта к высоте -- φ (развитые) или φ² (плоские); вершина стоит в золотой
  // точке ширины (0.382 от края); плечо на длинной стороне -- в её золотой точке, высотой hm/φ; выступы -- фрактал:
  // каждый следующий ярус в φ раз мельче (0.382, 0.236, 0.146 местной толщины), шаг между ними -- от r до φ·r.
  function cumulus(w, h, o) {
    const base = 4, H = h - base - 3, hm = H * rr(...o.hm), Wt = Math.min(w - 18, hm * o.asp * rr(0.94, 1.06)), lf = r() < 0.5;
    const wl = Wt * (lf ? IPHI * IPHI : IPHI), wr = Wt - wl, cx = (w - Wt) / 2 + wl + rr(-4, 4), s = lf ? 1 : -1, wlong = Math.max(wl, wr), wsh = Math.min(wl, wr);
    const P = [mound({ cx, base, wl, wr, hm, a: rr(1.8, 2.4), b: rr(...o.b), v0: rr(0.6, 0.72) })];
    P.push(mound({ cx: cx + s * wlong * IPHI, base, wl: wlong * IPHI * IPHI * 1.3, wr: wlong * IPHI * IPHI * 1.3, hm: hm * IPHI * rr(0.9, 1.05), b: rr(1.4, 2), v0: 0.5 }));   // плечо -- hm/φ
    if (r() < 0.6) P.push(mound({ cx: cx - s * wsh * IPHI, base, wl: wsh * IPHI, wr: wsh * IPHI, hm: hm * IPHI * IPHI * rr(0.9, 1.1), b: rr(1.4, 2), v0: 0.5 }));       // и hm/φ² с короткой стороны
    faceBumps(P, P[0], o.face, { x0: cx - wl * 0.6, x1: cx + wr * 0.6, y0: base + hm * 0.3, y1: base + hm * 0.75, r0: hm * IPHI ** 4, r1: hm * IPHI ** 3, crease: 0.7 });
    for (const sd of [-1, 1]) lumpsSide(P, w, h, { side: sd, y0: base + hm * 0.18, y1: base + hm * 0.55, rel: [IPHI ** 5, IPHI ** 4], r0: 3, r1: 20, sink: [IPHI * IPHI, IPHI], gap: [1, PHI] }); // бока -- тоже клубами
    lumps(P, w, h, { x0: w * 0.06, x1: w * 0.94, r0: 4, r1: 12, ymin: 0, dz: -0.3, down: true, sink: [0.5, 0.72], gap: [1, 1.7], skip: 0.15 }); // подошва -- мягкими долями, не линейкой
    for (let k = 1; k <= 2; k++) { const q = IPHI ** (k + 1); // фрактал выступов: два яруса; второй утоплен глубже -- без «пипок» клуб на клубе
      lumps(P, w, h, { x0: w * 0.03, x1: w * 0.97, r0: k === 1 ? 5 : 4, r1: 60, rel: [q * 0.85, q * 1.15], base, ymin: base + 3, dz: -0.4, gap: [1, PHI], sink: k === 1 ? [IPHI * IPHI, IPHI] : [IPHI, 0.78], crease: k === 1 ? 0.35 : 0.1, skip: [0, 0.3][k - 1] }); }
    return clampParts(P, w, h);
  }
  // humilis: плоские, ширина к высоте -- φ²
  for (let k = 0; k < 5; k++) sprite('hum' + k, 192, 72, (T, C) => paint(T, C, 192, 72, cumulus(192, 72, { hm: [0.52, 0.64], asp: PHI * PHI, b: [1.6, 2.4], face: 1 }), { grad: 0.4, band: 5, k: 3 }));
  // mediocris: пышные, ширина к высоте -- φ
  for (let k = 0; k < 6; k++) sprite('cu' + k, 256, 128, (T, C) => paint(T, C, 256, 128, cumulus(256, 128, { hm: [0.66, 0.76], asp: PHI * rr(1, 1.15), b: [1.3, 2], face: 3 }), { grad: 0.45, band: 7, k: 4 }));

  // ================= Altocumulus: поле мелких хлопьев рядами, по диагонали, с разрывами =================
  for (let k = 0; k < 4; k++) { const w = 512, h = 128;
    sprite('ac' + k, w, h, (T, C) => { const slope = rr(-0.07, 0.1), rows = 2 + Math.floor(r() * 2), sz = rr(1, 1.3) * (k === 3 ? 0.75 : 1), dy = (h - 30) / rows, fl = [];
      for (let j = 0; j < rows; j++) { let x = rr(8, 40); const yr = 12 + j * dy + rr(-3, 3);
        while (x < w - 16) { const t = x / w, env = Math.pow(Math.sin(Math.PI * t), 0.6), fw = rr(30, 56) * sz * (0.6 + 0.4 * env) * (0.75 + 0.35 * Math.sin(j * 1.7 + t * 5));
          const y = yr + slope * (x - w / 2) + rr(-3, 3); if (r() > 0.22 + 0.45 * (1 - env) && y > 6 && y < h - fw * 0.45) fl.push({ x, y, fw }); x += fw * rr(1.05, 1.6); } }
      fl.sort((a, b) => b.y - a.y); // дальние (выше) -- первыми
      for (const f of fl) { const P = [{ x: f.x, y: f.y + f.fw * 0.12, rx: f.fw * 0.5, ry: f.fw * rr(0.26, 0.34) }], nb = 1 + Math.floor(r() * 2);
        for (let b = 0; b < nb; b++) P.push({ x: f.x + f.fw * rr(-0.25, 0.22), y: f.y + f.fw * rr(0.22, 0.34), rx: f.fw * rr(0.18, 0.3), ry: f.fw * rr(0.16, 0.24) });
        paint(T, C, w, h, clampParts(P, w, h), { base: Math.round(f.y), grad: 0.35, band: 2, k: 3, line: 1 }); } }); }

  // ================= Cirrus: пучки тонких волокон с загнутыми «когтями», разные углы и длины =================
  for (let k = 0; k < 4; k++) { const W = 512, H = 96;
    sprite('ci' + k, W, H, (T, C) => { const bundles = 2 + Math.floor(r() * 3);
      for (let b = 0; b < bundles; b++) { const bx = rr(20, 260), by = rr(25, 70), Lb = rr(140, 300), ang = rr(-0.12, 0.18), hook = rr(-1, 1) * (k % 2 ? 1 : 0.3), nf = 4 + Math.floor(r() * 8);
        for (let f = 0; f < nf; f++) { const off = rr(-9, 9), s0 = rr(0, 0.35), s1 = rr(0.55, 1), th = rr(0.7, 2.4), div = rr(-0.08, 0.08);
          for (let t = s0; t < s1; t += 0.5 / Lb) { const x = bx + t * Lb, py = by + off + t * Lb * (ang + div * t) + hook * 22 * Math.pow(Math.max(0, t - 0.7) / 0.3, 2), ed = Math.min(py - 4, H - 5 - py, x - 4, W - 5 - x), hw = th * Math.sin(Math.PI * (t - s0) / (s1 - s0)) * Math.max(0, Math.min(1, ed / 8)); // у края заготовки волокно сходит на нет
            if (hw <= 0.05) continue;
            for (let y = Math.floor(py - hw - 1); y <= py + hw + 1; y++) { if (y < 1 || y >= H - 1 || x < 1 || x >= W - 1) continue; if (1 - Math.abs(y - py) / Math.max(hw, 0.3) <= 0) continue; const kk = y * W + Math.round(x); C[kk] = 1; T[kk] = Math.max(T[kk], y > py - 0.3 ? 0.9 : 0.45); } } } } }, 2); }

  // ================= Lenticularis: гладкие линзы, иногда стопкой «тарелок», верхние уже =================
  for (let k = 0; k < 4; k++) { const w = 384, h = 112;
    sprite('len' + k, w, h, (T, C) => { const nL = [1, 2, 3, 2][k]; let yb = 5, a = w * rr(0.34, 0.44); const cx0 = w * rr(0.46, 0.54);
      for (let i = 0; i < nL; i++) { const t = rr(20, 30) * (1 - i * 0.15), b = rr(5, 9), yc = yb + b, cxi = cx0 + w * rr(-0.05, 0.05), ai = Math.min(a, cxi - 6, w - 6 - cxi), wav = rr(0, 1.6), ph = rr(0, 6);
        const fn = (x, y) => { const u = (x - cxi) / ai; if (Math.abs(u) >= 1) return -1; const q = 1 - u * u, tp = yc + t * Math.pow(q, 0.6) + wav * Math.sin(x * 0.05 + ph) * q, bt = yc - b * Math.pow(q, 0.9);
          return y > tp || y < bt ? -1 : Math.sqrt((tp - y) * (y - bt)) * 1.3; };
        paint(T, C, w, h, [{ fn, box: [cxi - ai, cxi + ai, yc - b - 1, yc + t + 3] }], { grad: 0.5, band: 2, k: 4 });
        yb = yc + t * rr(0.45, 0.65); a *= rr(0.6, 0.82); } }); }

  // ================= Cap cloud: колпак на вершине -- вырез снизу под пик, наветренный край тупой, подветренный стекает вниз =================
  for (let k = 0; k < 4; k++) { const w = 320, h = 144, base = 4, cx = w * rr(0.42, 0.5), nh = h * rr(0.14, 0.22), nw = w * rr(0.18, 0.26), lumpy = k % 2 === 0;
    sprite('cap' + k, w, h, (T, C) => { const P = [{ x: cx + w * 0.04, y: h * 0.36, rx: w * rr(0.32, 0.38), ry: h * rr(0.27, 0.33) }, { x: cx - w * 0.2, y: h * 0.24, rx: w * rr(0.13, 0.18), ry: h * rr(0.15, 0.21) }];
      const sx0 = cx + w * 0.1, sy0 = h * 0.34, sx1 = w * rr(0.88, 0.96), sy1 = h * rr(0.07, 0.15);
      P.push({ fn: (x, y) => { const t = (x - sx0) / (sx1 - sx0); if (t <= 0 || t >= 1) return -1; const yc = sy0 + (sy1 - sy0) * t, hw = h * 0.22 * Math.pow(1 - t, 0.6) + 1.5, d = y - yc; return Math.abs(d) >= hw ? -1 : Math.sqrt(hw * hw - d * d); }, box: [sx0, sx1, 0, h * 0.6] });
      if (lumpy) { lumps(P, w, h, { x0: cx - w * 0.34, x1: cx + w * 0.34, r0: 6, r1: 16, ymin: h * 0.4, dz: 4, crease: 0.3 }); lumps(P, w, h, { x0: cx - w * 0.38, x1: cx + w * 0.4, r0: 3, r1: 7, ymin: h * 0.35, dz: 2, gap: [1.4, 3], skip: 0.3 }); }
      else P.push({ x: cx + w * 0.02, y: h * 0.48, rx: w * rr(0.26, 0.32), ry: h * rr(0.16, 0.2) });             // гладкий, почти линзовидный верх
      paint(T, C, w, h, clampParts(P, w, h), { grad: 0.5, band: 5, k: 8, cut: (x, y) => y < base + nh * Math.max(0, 1 - Math.abs(x - cx) / nw) }); });
    meta['cap' + k] = { ax: cx / w, ay: (base + nh) / h }; }

  // ================= Banner cloud: флаг с подветренной стороны пика -- толстый у вершины, тонкий хвост рвётся на пряди =================
  for (let k = 0; k < 4; k++) { const w = 512, h = 112, x0 = 6, Ln = w * rr(0.82, 0.96), y0 = h * rr(0.45, 0.6), slope = rr(-0.07, 0.04), Tm = h * rr(0.24, 0.32), ph = rr(0, 6);
    const yc = memo((x) => y0 + slope * (x - x0) + 3 * Math.sin((x - x0) * 0.02 + ph)), th = memo((x) => { const t = (x - x0) / Ln; return t <= 0 || t >= 1 ? 0 : (Tm * Math.pow(t, 0.3) * Math.pow(1 - t, 1.1)) / 0.48; });
    const ns = 2 + Math.floor(r() * 3), lines = [], ends = []; for (let j = 0; j < ns; j++) lines.push({ b: rr(-0.6, 0.6), s: rr(0.3, 0.6) }); for (let j = 0; j <= ns; j++) ends.push(rr(0.7, 1));
    lines.sort((a, b) => a.b - b.b);
    const cut = (x, y) => { const t = (x - x0) / Ln, hw = th(x); if (hw <= 0) return false; const rel = (y - yc(x)) / hw; let i = 0;
      for (const l of lines) { if (t > l.s && Math.abs(rel - l.b) * hw < 0.7 + (t - l.s) * 2) return true; if (rel > l.b) i++; } return t > ends[i]; };
    sprite('ban' + k, w, h, (T, C) => { const P = [{ fn: (x, y) => { const hw = th(x); if (hw <= 0.5) return -1; const d = y - yc(x); return Math.abs(d) >= hw ? -1 : Math.sqrt(hw * hw - d * d); }, box: [x0, x0 + Ln, 0, h - 1] }];
      lumps(P, w, h, { x0: x0 + Ln * 0.02, x1: x0 + Ln * 0.5, r0: 4, r1: 11, dz: 2, crease: 0.25 }); lumps(P, w, h, { x0: x0 + Ln * 0.05, x1: x0 + Ln * 0.7, r0: 2, r1: 5, dz: 1, gap: [1.3, 3], skip: 0.3 });
      paint(T, C, w, h, clampParts(P, w, h), { grad: 0.45, band: 3, k: 5, cut }); });
    meta['ban' + k] = { ax: x0 / w, ay: y0 / h }; }

  // ================= Rotor: рваный вал за хребтом -- клочья без ровного основания, обрывки рядом =================
  for (let k = 0; k < 4; k++) { const w = 320, h = 112;
    sprite('rot' + k, w, h, (T, C) => { const nf = 2 + Math.floor(r() * 3);
      for (let f = 0; f < nf; f++) { const fx = rr(20, w - 20), fy = r() < 0.5 ? rr(10, 30) : rr(h - 40, h - 18), P = [];
        for (let i = 0, m = 2 + Math.floor(r() * 2); i < m; i++) P.push({ x: fx + rr(-12, 12), y: fy + rr(-4, 4), rx: rr(5, 11), ry: rr(4, 8) });
        paint(T, C, w, h, clampParts(P, w, h), { grad: 0.5, band: 2, k: 3 }); }
      const P = [], yc = h * rr(0.42, 0.55), ph = rr(0, 6); let x = rr(16, 30);
      while (x < w - 24) { const rad = rr(9, 22); P.push({ x, y: yc + rr(-9, 9) + 7 * Math.sin(x * 0.03 + ph), rx: rad * rr(1, 1.5), ry: rad }); x += rad * rr(0.9, 1.7); }
      lumps(P, w, h, { x0: 10, x1: w - 10, r0: 4, r1: 9, dz: 2, crease: 0.2 }); lumps(P, w, h, { x0: 10, x1: w - 10, r0: 3, r1: 7, dz: 1, down: true, sink: [0.2, 0.5], gap: [1.2, 2.5] });
      paint(T, C, w, h, clampParts(P, w, h), { grad: 0.5, band: 3, k: 6 }); }); }

  // ================= Stratocumulus: низкие широкие гряды из кусков с мягкими волнами, с разрывами =================
  for (let k = 0; k < 4; k++) { const w = 512, h = 88;
    sprite('st' + k, w, h, (T, C) => { let x = rr(10, 50);
      while (x < w - 40) { const seg = rr(90, 220), th = rr(16, 34), base = 4 + Math.floor(rr(0, 6)), P = [];
        for (let s = 0; s < seg; s += rr(12, 22)) { const rx = rr(18, 36), ry = th * rr(0.7, 1) * Math.sin(Math.PI * (s + 8) / (seg + 16)) + 6; P.push({ x: x + s, y: base + ry * 0.45, rx, ry }); }
        // без мелких клубов сверху: на тонкой гряде они торчали «пипками»; верх -- плавные волны самих частей
        paint(T, C, w, h, clampParts(P, w, h), { base, grad: 0.38, band: 4, k: 5 }); x += seg + rr(-20, 70); } }); }

  // ================= Туман / низкая облачность в долинах: тонкий плоский слой с мягкими буграми =================
  for (let k = 0; k < 3; k++) { const w = 512, h = 80, base = 4, Tm = rr(22, 36), ph = rr(0, 6), Ln0 = rr(10, 40), Ln1 = w - rr(10, 40);
    const top = (x) => { const t = (x - Ln0) / (Ln1 - Ln0); return t <= 0 || t >= 1 ? 0 : base + Tm * Math.pow(Math.sin(Math.PI * t), 0.5) * (0.65 + 0.35 * Math.sin(x * 0.021 + ph) * Math.sin(x * 0.007 + ph * 2)); };
    sprite('fog' + k, w, h, (T, C) => { const P = [{ fn: (x, y) => { const tp = top(x); return tp <= base + 1 || y > tp || y < base ? -1 : Math.sqrt((tp - y) * (y - base + 2)); }, box: [Ln0, Ln1, base, base + Tm + 2] }];
      lumps(P, w, h, { x0: Ln0 + 10, x1: Ln1 - 10, r0: 3, r1: 8, ymin: base + 4, dz: 1, gap: [1.3, 3], skip: 0.25 });
      paint(T, C, w, h, clampParts(P, w, h), { base, grad: 0.25, band: 0, lift: 0.14, k: 4 }); }); }

  // ================= Кучево-дождевые =================
  // масса -- «горы» из суперэллипсов: широкий холм-пирамида внизу, не колонна; по бокам и верху -- клубы, размер которых
  // следует за местной толщиной (у основания крупные, к краям мелочь), на лице -- выпуклые клубы со складками.
  // К наковальне клубы пропадают: обледеневшая вершина гладкая.
  function faceBumps(P, env, n, { x0, x1, y0, y1, r0, r1, crease = 0.6 }) {
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) { const x = rr(x0, x1), y = rr(y0, y1), z = env.fn(x, y); if (z < 4) continue;
      const rad = rr(r0, r1); P.push({ x, y, rx: rad * rr(1, 1.3), ry: rad, dz: z * 0.85, crease: r() < crease }); i++; }
  }
  function cauli(P, w, h, base, { y0, y1, side = [0.14, 0.3], top = [0.1, 0.22], rmax = 34, ymaxTop = 1e9, x0 = 4, x1 = w - 4 }) {
    for (const sd of [-1, 1]) lumpsSide(P, w, h, { side: sd, y0, y1, rel: side, r0: 5, r1: rmax, crease: sd < 0 ? 0.35 : 0.1 });
    lumps(P, w, h, { x0, x1, r0: 5, r1: rmax, rel: top, base, ymin: base + 8, ymax: ymaxTop, dz: -0.35, gap: [0.9, 1.6], sink: [0.45, 0.75], crease: 0.3 });
    lumps(P, w, h, { x0, x1, r0: 3, r1: 9, ymin: base + 6, ymax: ymaxTop, dz: -0.3, gap: [1.2, 2.6], skip: 0.3 });
    for (const sd of [-1, 1]) lumpsSide(P, w, h, { side: sd, y0, y1, rel: [0.03, 0.07], r0: 3, r1: 9, skip: 0.3, gap: [1.3, 2.6] });
  }
  // соседняя башня-ступень (рисуется первой, позади главной)
  function flank(T, C, w, h, base, fx, fw, fh) { fx = Math.max(fw * 1.25 + 6, Math.min(w - fw * 1.25 - 6, fx)); const env = mound({ cx: fx, base, wl: fw * rr(0.9, 1.1), wr: fw * rr(0.9, 1.1), hm: fh, a: rr(1.8, 2.4), b: rr(1.3, 1.8) }), F = [env];
    faceBumps(F, env, 3, { x0: fx - fw * 0.5, x1: fx + fw * 0.5, y0: base + fh * 0.2, y1: base + fh * 0.7, r0: fw * 0.15, r1: fw * 0.3 });
    cauli(F, w, h, base, { y0: base + fh * 0.15, y1: base + fh * 0.9, rmax: fw * 0.35, x0: fx - fw * 1.2, x1: fx + fw * 1.2 });
    paint(T, C, w, h, clampParts(F, w, h), { base, grad: 0.5, band: 6, k: 6 }); }
  // мощная кучевая / молодая грозовая без наковальни: широкий клубящийся холм, плоская тёмная подошва, ступени сбоку
  for (let k = 0; k < 2; k++) { const w = 384, h = 352, base = 6, cx = w * rr(0.46, 0.54), hm = h - base - rr(44, 64), side = k ? 1 : -1;
    sprite('cbT' + k, w, h, (T, C) => {
      for (let f = 0, nf = 1 + k; f < nf; f++) flank(T, C, w, h, base, cx + side * w * rr(0.3, 0.36) * (1 + f * 0.45), w * rr(0.09, 0.12) / (1 + f * 0.3), hm * rr(0.28, 0.42) / (1 + f * 0.5));
      const env = mound({ cx, base, wl: w * rr(0.28, 0.34), wr: w * rr(0.28, 0.34), hm, a: rr(1.7, 2.2), b: rr(1.15, 1.5), lean: rr(-0.08, 0.08) });
      const P = [{ x: cx + w * rr(-0.04, 0.06), y: base + 3, rx: w * rr(0.43, 0.47), ry: h * 0.035 }, env];
      faceBumps(P, env, 11, { x0: cx - w * 0.22, x1: cx + w * 0.22, y0: base + hm * 0.12, y1: base + hm * 0.8, r0: 12, r1: 30 });
      cauli(P, w, h, base, { y0: base + hm * 0.06, y1: base + hm * 0.92 });
      paint(T, C, w, h, clampParts(P, w, h), { base, grad: 0.5, band: 8, k: 10 }); }); }
  // зрелая грозовая с наковальней. Как у настоящей: тело -- одна масса, которая от широкого клубящегося низа слегка
  // сужается («талия»), а выше плавно и всё быстрее расширяется в наковальню -- вогнутая дуга снизу, ровный плоский верх
  // под тропопаузой. Наковальня несимметрична: далеко по ветру (вправо), коротко против. Над башней -- купол
  // «перескока», конец наковальни тонкий и рвётся на волокна; у второго варианта -- вымя (mammatus) под наковальней.
  for (let k = 0; k < 2; k++) { const w = 704, h = 400, base = 6, cx = w * rr(0.3, 0.36), yT = h - 16, W0 = w * rr(0.12, 0.14), ph = rr(0, 6);
    const yw = base + (yT - base) * rr(0.5, 0.6), yR = yT - h * rr(0.05, 0.08), yL = yT - h * rr(0.07, 0.1), R = w - 14 - cx, Lx = Math.min(cx - 14, W0 * rr(1.9, 2.4)), pw = rr(2.2, 3);
    const half0 = (y, side) => { const ext = side > 0 ? R : Lx, yt = side > 0 ? yR : yL, v = (y - base) / (yw - base);
      if (y <= yw) return W0 * (1 - 0.16 * Math.sin(Math.PI * Math.min(1, v * 0.9)) + 0.25 * Math.max(0, 0.35 - v)) * (side > 0 ? 1.06 : 1);
      const q = Math.min(1, (y - yw) / (yt - yw)); return W0 * (1 - 0.16 * Math.sin(Math.PI * 0.9)) * (side > 0 ? 1.06 : 1) + (ext - W0) * q ** pw; };
    const hl = memo((y) => half0(y, -1)), hr = memo((y) => half0(y, 1)), half = (y, side) => (side > 0 ? hr(y) : hl(y));
    const topAt = memo((x) => { const dx = x - cx, u = Math.abs(dx) / (dx > 0 ? R : Lx), yt = dx > 0 ? yR : yL; return yT - 6 * u * u - (yT - yt - 1) * Math.max(0, (u - 0.55) / 0.45) ** 1.6 + 1.2 * Math.sin(x * 0.05 + ph); });
    const body = { fn: (x, y) => { if (y < base || y > topAt(x)) return -1; const xl = cx - half(y, -1), xr = cx + half(y, 1); if (x <= xl || x >= xr) return -1;
      return Math.sqrt((x - xl) * (xr - x)) * 0.55 * Math.sqrt(Math.min(1, (topAt(x) - y) / 30)); }, box: [cx - Lx - 2, cx + R + 2, base, yT + 2] };
    const ns = 3 + Math.floor(r() * 3), lines = []; for (let j = 0; j < ns; j++) lines.push({ y: rr(yR - 2, yT - 6), s: rr(0.5, 0.75) });
    const cut = (x, y) => { const u = (x - cx) / R; if (u < 0.5 || y < yw) return false; for (const l of lines) if (u > l.s && Math.abs(y - l.y - (u - l.s) * 10) < 0.6 + (u - l.s) * 2.2) return true; return false; };
    sprite('cbA' + k, w, h, (T, C) => {
      if (k === 0) for (let f = 0; f < 2; f++) flank(T, C, w, h, base, Math.max(w * 0.1, cx - w * rr(0.17, 0.2) * (1 + f * 0.4)), w * rr(0.06, 0.08) / (1 + f * 0.3), (yT - base) * rr(0.22, 0.32) / (1 + f * 0.5));
      const hm1 = (yw - base) * rr(0.55, 0.7), low = mound({ cx: cx + W0 * 0.1, base, wl: W0 * rr(1.4, 1.6), wr: W0 * rr(1.5, 1.8), hm: hm1, a: rr(1.8, 2.2), b: rr(1.2, 1.5) });
      const P = [{ x: cx + w * 0.04, y: base + 3, rx: w * rr(0.25, 0.3), ry: h * 0.03 }, low, body];
      P.push({ x: cx + W0 * 0.2, y: yT - 4, rx: W0 * rr(0.6, 0.8), ry: h * 0.04, dz: W0 * 0.3 }); // купол перескока над башней
      if (k === 1) for (let i = 0; i < 22; i++) { const x = cx + R * rr(0.25, 0.65); let yb = yw; while (yb < yT && !(body.fn(x, yb) >= 0)) yb++; if (yb >= yR) continue; const rad = rr(4, 9); P.push({ x, y: yb - rad * rr(0.15, 0.45), rx: rad * rr(1, 1.3), ry: rad, dz: 2 }); }
      faceBumps(P, low, 9, { x0: cx - W0, x1: cx + W0 * 1.2, y0: base + hm1 * 0.15, y1: base + hm1 * 0.85, r0: 12, r1: 28 });
      faceBumps(P, body, 7, { x0: cx - W0 * 0.6, x1: cx + W0 * 0.7, y0: base + hm1, y1: yw + (yT - yw) * 0.3, r0: 10, r1: 22, crease: 0.5 });
      cauli(P, w, h, base, { y0: base + 8, y1: yw + (yT - yw) * 0.25, ymaxTop: yw, x0: cx - W0 * 2, x1: cx + W0 * 2 });
      paint(T, C, w, h, clampParts(P, w, h), { base, grad: 0.5, band: 16, k: 10, cut }); }); }

  // полосы дождя 128x256 под грозовыми (A -- плотность)
  { const w = 128, h = 256, raw = new Uint8Array(w * h * 4);
    for (let i = 0; i < 70; i++) { const x = 4 + r() * (w - 8), top = h - r() * 30, len = 80 + r() * 160;
      for (let y = Math.max(0, Math.floor(top - len)); y < top; y++) { const xx = Math.round(x - (top - y) * 0.12); if (xx < 0 || xx >= w) continue; const o = (y * w + xx) * 4; raw[o] = 128; raw[o + 3] = Math.max(raw[o + 3], Math.min(1, (y - (top - len)) / 60) * 200); } }
    items.push({ name: 'rain', w, h, raw }); }

  // ================= Облако ущелья: длинный клубящийся вал -- голова (глубже в ущелье) выше всего, к выходу тает хвостом =================
  // по золотому сечению: голова -- в точке 0.382 длины (или 0.236), каждый следующий клуб ниже прежнего, в хвосте -- отставшие клочья
  for (let k = 0; k < 4; k++) { const w = 600, h = 120, base = 4;
    sprite('val' + k, w, h, (T, C) => { const hm = (h - base - 8) * rr(0.66, 0.82), x0 = rr(10, 24), x1 = w - rr(70, 120), pk = k % 2 ? IPHI * IPHI : IPHI * IPHI * IPHI * PHI, P = [];
      const env = (t) => (t < pk ? Math.pow(Math.sin((Math.PI / 2) * t / pk), 0.55) : Math.pow(1 - (t - pk) / (1 - pk), 0.75) * 0.82 + 0.18);
      for (let x = x0; x < x1;) { const t = (x - x0) / (x1 - x0), hh = Math.max(9, hm * env(t) * rr(0.82, 1.04)), ww = hh * PHI * rr(0.85, 1.1);
        P.push(mound({ cx: x + ww * 0.45, base, wl: ww * 0.62, wr: ww * 0.72, hm: hh, a: rr(1.8, 2.3), b: rr(1.4, 2), v0: rr(0.45, 0.6) })); x += ww * rr(0.5, 0.72); }
      for (const sd of [-1, 1]) lumpsSide(P, w, h, { side: sd, y0: base + 3, y1: base + hm * 0.6, rel: [IPHI ** 4, IPHI ** 3], r0: 3, r1: 14, sink: [IPHI * IPHI, IPHI], gap: [1, PHI] });
      lumps(P, w, h, { x0: 8, x1: w - 8, r0: 4, r1: 10, ymin: 0, dz: -0.3, down: true, sink: [0.5, 0.72], gap: [1, 1.7], skip: 0.15 });
      for (let q = 1; q <= 2; q++) { const f = IPHI ** (q + 1); lumps(P, w, h, { x0: 6, x1: w - 6, r0: q === 1 ? 5 : 4, r1: 40, rel: [f * 0.85, f * 1.15], base, ymin: base + 3, dz: -0.4, gap: [1, PHI], sink: q === 1 ? [IPHI * IPHI, IPHI] : [IPHI, 0.78], crease: q === 1 ? 0.35 : 0.1, skip: [0, 0.3][q - 1] }); }
      paint(T, C, w, h, clampParts(P, w, h), { grad: 0.42, band: 6, k: 5 });
      let x = x1 + rr(4, 14); for (let f = 0; f < 3 && x < w - 16; f++) { const rad = rr(5, 10) * IPHI ** (f * 0.5), y = base + rad * rr(0.6, 1.2) + rr(0, 8), Q = [{ x, y, rx: rad * rr(1.3, 1.8), ry: rad }, { x: x + rad * rr(-0.5, 0.6), y: y + rad * 0.55, rx: rad * 0.8, ry: rad * 0.7 }];
        paint(T, C, w, h, clampParts(Q, w, h), { grad: 0.4, band: 2, k: 3 }); x += rad * rr(2.6, 4.2); } }); }
  for (const it of items) if (it.fill) { it.T = new Float32Array(it.w * it.h); it.C = new Uint8Array(it.w * it.h); it.fill(it.T, it.C); yield; }
  // ---------- упаковка полками (по убыванию высоты) и запись: тон, кайма, расстояние до края ----------
  items.sort((a, b) => b.h - a.h); let sx = 0, sy = 0, sh = 0;
  for (const it of items) { yield; if (sx + it.w > AW) { sx = 0; sy += sh + 4; sh = 0; } if (sy + it.h > AH) throw new Error('атлас облаков переполнен');
    const x0 = sx, y0 = sy; sx += it.w + 4; sh = Math.max(sh, it.h); const { w, h } = it; // зазор 4 px: на мелких мипах соседние заготовки не просвечивают обрывками
    rects[it.name] = [x0 / AW, y0 / AH, w / AW, h / AH]; px[it.name] = [x0, y0, w, h];
    if (it.raw) { for (let y = 0; y < h; y++) data.set(it.raw.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * AW + x0) * 4); continue; }
    const { T, C } = it;
    // оторванные мелкие кусочки (меньше 6% главной массы) убираем: вдали они читаются «пузырьками» над облаком
    // «пипки»: кругляш на тонкой шейке. Морфологическое открытие (сжать на 2 px и расширить обратно) режет шейки
    // уже 5 px; отрезанный кругляш дальше уходит как оторванный кусочек. Тон под срезом не трогаем -- только маску
    if (!it.name.startsWith('ci')) { const R = 2, er = new Uint8Array(w * h), op = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let ok = C[y * w + x]; for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R && ok; dx++) { if (dx * dx + dy * dy > R * R + 1) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !C[Y * w + X]) ok = 0; } er[y * w + x] = ok; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!er[y * w + x]) continue; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R + 1) continue; const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) op[Y * w + X] = 1; } }
      for (let k = 0; k < w * h; k++) if (C[k] && !op[k]) C[k] = 0; }
    if (!it.name.startsWith('ci')) { const lab = new Int32Array(w * h).fill(-1), sz = [];
      for (let k0 = 0; k0 < w * h; k0++) { if (!C[k0] || lab[k0] >= 0) continue; const id = sz.length, st = [k0]; let c = 0; lab[k0] = id;
        while (st.length) { const k = st.pop(); c++; const i = k % w; for (const n of [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, k - w, k + w]) if (n >= 0 && n < w * h && C[n] && lab[n] < 0) { lab[n] = id; st.push(n); } } sz.push(c); }
      const big = Math.max(0, ...sz); for (let k = 0; k < w * h; k++) if (C[k] && sz[lab[k]] < big * 0.06) C[k] = 0; }
    const D = new Float32Array(w * h); for (let k = 0; k < w * h; k++) D[k] = C[k] ? 1e9 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (!D[k]) continue;
      D[k] = Math.min(D[k], x > 0 ? D[k - 1] + 1 : 1, y > 0 ? D[k - w] + 1 : 1, x > 0 && y > 0 ? D[k - w - 1] + 1.414 : 1.414, x < w - 1 && y > 0 ? D[k - w + 1] + 1.414 : 1.414); }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const k = y * w + x; if (!D[k]) continue;
      D[k] = Math.min(D[k], x < w - 1 ? D[k + 1] + 1 : 1, y < h - 1 ? D[k + w] + 1 : 1, x < w - 1 && y < h - 1 ? D[k + w + 1] + 1.414 : 1.414, x > 0 && y < h - 1 ? D[k + w - 1] + 1.414 : 1.414); }
    let mx = 1; for (let k = 0; k < w * h; k++) mx = Math.max(mx, D[k]); const Rn = it.Rn || Math.max(6, mx * 0.8);
    // рефлекс: низ облака подсвечен снизу светом, отражённым от воды и земли -- самая светлая полоса тени у нижнего края
    const RF = new Float32Array(w * h); for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y < h; y++) { const k = y * w + x; run = C[k] ? run + 1 : 0; if (C[k]) RF[k] = Math.max(0, 1 - (run - 1) / 3.2) ** 1.2; } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x, o = ((y0 + y) * AW + x0 + x) * 4;
      data[o] = Math.max(0, Math.min(1, T[k])) * 255; data[o + 1] = Math.max(0, 1 - D[k] / 5) * 255; data[o + 2] = RF[k] * 255; data[o + 3] = Math.min(1, D[k] / Rn) * 255; } }
  return { data, rects, px, meta, used: sy + sh };
}
