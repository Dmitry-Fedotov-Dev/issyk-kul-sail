// Где в котловине Иссык-Куля «живут» облака: разбор карты высот один раз при загрузке.
//  * lakeD(X, Y) -- расстояние до воды, м (0 над зеркалом). Над озером днём облаков нет: вода холоднее склонов,
//    бриз с озера гасит подъём воздуха -- облачность садится на хребты, зеркало воды остаётся чистым.
//  * side(X, Y) -- по какую сторону от оси озера: >0 -- северный берег (Кунгей), <0 -- южный (Терскей).
//    Непогода приходит либо на всю котловину, либо на один берег, а озеро и другой берег остаются под солнцем.
//  * gorges -- устья и русла ущелий на склонах: в ущельях облака рождаются первыми и вытекают из них
//    длинными клубами; склоны по бокам закрывают их низ, и облако «выходит» из-за гор.
// grid: { hs (высоты над озером, шаг STEP), W, H, X0, Y1 }, lake: Uint8Array (255 -- вода).
export function analyzeBasin(grid, lake) {
  const { hs, W, H, X0, Y1, STEP } = grid, N = W * H;
  // расстояние до воды: волна по клеткам (8 соседей)
  const dist = new Float32Array(N).fill(1e9), q = [];
  for (let k = 0; k < N; k++) if (lake[k]) { dist[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if ((!di && !dj) || a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = b * W + a, d = dist[k] + (di && dj ? 1.414 : 1) * STEP; if (d < dist[n]) { dist[n] = d; q.push(n); } } }
  // ось озера: центр и главное направление водной глади
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (lake[j * W + i]) { const X = X0 + i * STEP, Y = Y1 - j * STEP; n++; sx += X; sy += Y; sxx += X * X; syy += Y * Y; sxy += X * Y; }
  const cx = sx / n, cy = sy / n, th = 0.5 * Math.atan2(2 * (sxy / n - cx * cy), sxx / n - cx * cx - (syy / n - cy * cy)), nx = -Math.sin(th), ny = Math.cos(th);
  const bil = (A, X, Y, out) => { const fx = (X - X0) / STEP, fy = (Y1 - Y) / STEP; if (fx < 0 || fy < 0 || fx > W - 1.001 || fy > H - 1.001) return out;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * W + i; return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + W] * (1 - u) + A[k + W + 1] * u) * v; };
  const at = (i, j) => hs[Math.max(0, Math.min(H - 1, j)) * W + Math.max(0, Math.min(W - 1, i))];
  const hsm = new Float32Array(N); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += at(i + a, j + b); hsm[j * W + i] = s / 9; }
  const sm = (X, Y) => bil(hsm, X, Y, 0);
  // ущелья: дно ниже обоих бортов (поперёк уклона) хотя бы на 150 м, склон -- обращённый к озеру, недалеко от воды
  const cand = [];
  for (let j = 3; j < H - 3; j++) for (let i = 3; i < W - 3; i++) { const k = j * W + i, g = hsm[k]; if (lake[k] || g < 250 || g > 2900 || dist[k] > 32000) continue;
    const gx = (hsm[k + 2] - hsm[k - 2]) / (4 * STEP), gy = (hsm[k - 2 * W] - hsm[k + 2 * W]) / (4 * STEP), gl = Math.hypot(gx, gy); if (gl < 0.04) continue;
    const X = X0 + i * STEP, Y = Y1 - j * STEP, px = -gy / gl, py = gx / gl, sd = Math.sign((X - cx) * nx + (Y - cy) * ny);
    if ((gx * nx + gy * ny) * sd < 0.25 * gl) continue; // склон смотрит на озеро (за гребнем вода стекает прочь)
    // два масштаба: узкое ущелье (борта в 1.2-2 км) и широкая долина у выхода к озеру (2.5-4.5 км)
    let best = null; for (const [Ra, Rb, v0] of [[1200, 2000, 150], [2500, 4500, 220]]) { let wall = 1e9, wsum = 0;
      for (const R of [Ra, Rb]) for (const s of [-1, 1]) { const hw = sm(X + px * R * s, Y + py * R * s); wall = Math.min(wall, hw); wsum += hw; }
      const v = wall - g; if (v >= v0 && (!best || v / v0 > best.v / best.v0)) best = { v, v0, wall: wsum / 4, wide: Ra > 2000 }; }
    if (!best) continue;
    // ближе к озеру -- лучше: из устья облако видно с воды, верховья закрыты передними хребтами
    cand.push({ X, Y, g, v: best.v, wall: best.wall, wide: best.wide, sc: (best.v / best.v0) * (1.5 - Math.min(1, g / 2400)), dx: -gx / gl, dy: -gy / gl, lk: dist[k] }); } // dx, dy -- вниз по ущелью, к озеру
  cand.sort((a, b) => b.sc - a.sc); const gorges = [];
  for (const c of cand) { if (gorges.some((o) => Math.hypot(o.X - c.X, o.Y - c.Y) < 4200)) continue; gorges.push(c); if (gorges.length >= 160) break; }
  // русло: от устья выбранной точки вниз по ущелью до выхода к озеру -- шаг 300 м вниз по уклону с поправкой к самому низу поперёк,
  // точки через 1.5 км. По руслу облако «вытекает» -- там, где ущелье прорезает передний хребет, его видно с воды
  for (const q of gorges) { let X = q.X, Y = q.Y, ex = q.dx, ey = q.dy, acc = 0; q.path = [{ X, Y, g: q.g }];
    for (let it = 0; it < 120; it++) { const e = 300, gx = (sm(X + e, Y) - sm(X - e, Y)) / (2 * e), gy = (sm(X, Y + e) - sm(X, Y - e)) / (2 * e), gl = Math.hypot(gx, gy);
      if (gl > 1e-3) { ex = ex * 0.5 - (gx / gl) * 0.5; ey = ey * 0.5 - (gy / gl) * 0.5; const l = Math.hypot(ex, ey); ex /= l; ey /= l; }
      X += ex * 300; Y += ey * 300; const px = -ey, py = ex, hc = sm(X, Y), hl = sm(X - px * 300, Y - py * 300), hr = sm(X + px * 300, Y + py * 300);
      if (hl < hc && hl <= hr) { X -= px * 150; Y -= py * 150; } else if (hr < hc) { X += px * 150; Y += py * 150; }
      acc += 300; if (bil(dist, X, Y, 0) < 1800) break; if (acc >= 1500) { acc = 0; q.path.push({ X, Y, g: sm(X, Y) }); if (q.path.length >= 14) break; } } }
  return { gorges, cx, cy, th,
    lakeD: (X, Y) => bil(dist, X, Y, 30000),
    side: (X, Y) => (X - cx) * nx + (Y - cy) * ny };
}
