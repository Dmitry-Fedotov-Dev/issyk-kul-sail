// Миникарта внутри компаса: полупрозрачная подложка под стрелками, повёрнута по курсу (нос -- вверх).
// Рельеф отмывкой, озеро, реки и тропы. Рисуется не каждый кадр: подложка снимается в квадрат вокруг игрока
// и пересобирается, только когда игрок отошёл от её центра или сменился масштаб. Тап по компасу -- масштаб.
import { TRAILS, RIVERS } from './trails.js';

const T = 200; // пикселей в квадрате подложки
const parse = (str) => str.split(';').map((w) => { const a = w.split(',').map(Number), f = new Float32Array(a.length - (a.length % 2)); for (let k = 0; k < f.length; k++) f[k] = a[k] * 4; return f; });

export function makeMinimap(h) {
  const cv = document.createElement('canvas'); cv.width = cv.height = T; const x = cv.getContext('2d'), img = x.createImageData(T, T);
  let cx = 1e9, cy = 1e9, span = 0, lines = null;
  function build(X, Y, range) {
    span = range * 2.6; cx = X; cy = Y; const mpp = span / T, d = img.data, sh = mpp * 1.5;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const wx = X + (i - T / 2 + 0.5) * mpp, wy = Y - (j - T / 2 + 0.5) * mpp, z = h(wx, wy), o = (j * T + i) * 4;
      if (z < 0) { const k = Math.min(1, -z / 30); d[o] = 40 - 25 * k; d[o + 1] = 120 - 45 * k; d[o + 2] = 175 - 30 * k; d[o + 3] = 200; continue; }
      // отмывка: свет с северо-запада, цвет по высоте -- степь, луга, скалы, снег
      const gx = (h(wx + sh, wy) - h(wx - sh, wy)) / (2 * sh), gy = (h(wx, wy + sh) - h(wx, wy - sh)) / (2 * sh), L = Math.max(0.35, Math.min(1.35, 0.9 + (gx - gy) * -0.55)), H = z + 1601;
      let r = 200, g = 180, b = 125; if (H > 1900) { r = 120; g = 150; b = 90; } if (H > 3100) { r = 140; g = 132; b = 125; } if (H > 3900) { r = 225; g = 228; b = 235; }
      if (z < 4) { r = 225; g = 205; b = 150; }
      d[o] = Math.min(255, r * L); d[o + 1] = Math.min(255, g * L); d[o + 2] = Math.min(255, b * L); d[o + 3] = 185; }
    x.putImageData(img, 0, 0);
    // реки и тропы поверх отмывки
    lines = lines || { rv: parse(RIVERS), tr: parse(TRAILS) };
    const px = (wx) => (wx - X) / mpp + T / 2, py = (wy) => T / 2 - (wy - Y) / mpp, lim = span * 0.75;
    const draw = (L, col, w, dash) => { x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash); x.lineJoin = 'round'; x.beginPath();
      for (const f of L) { let pen = false; for (let k = 0; k + 1 < f.length; k += 2) { const ok = Math.abs(f[k] - X) < lim && Math.abs(f[k + 1] - Y) < lim; if (!ok) { pen = false; continue; } if (pen) x.lineTo(px(f[k]), py(f[k + 1])); else x.moveTo(px(f[k]), py(f[k + 1])); pen = true; } }
      x.stroke(); x.setLineDash([]); };
    draw(lines.rv, 'rgba(60,150,200,.95)', Math.max(1.2, 3 - mpp / 40), []); draw(lines.tr, 'rgba(90,50,30,.75)', 1.2, [3, 3]);
  }
  // dc -- контекст компаса, (c, c) -- его центр, R -- радиус в пикселях; range -- метров от центра до края
  function draw(dc, c, R, X, Y, th, range) {
    if (Math.abs(range * 2.6 - span) > 1 || Math.hypot(X - cx, Y - cy) > range * 0.3) build(X, Y, range);
    const k = R / range, mpp = span / T;
    dc.save(); dc.beginPath(); dc.arc(c, c, R, 0, 7); dc.clip(); dc.globalAlpha = 0.62; dc.translate(c, c); dc.rotate(-th);
    dc.drawImage(cv, (-T / 2 - (X - cx) / mpp) * mpp * k, (-T / 2 + (Y - cy) / mpp) * mpp * k, T * mpp * k, T * mpp * k);
    dc.restore();
  }
  return { draw };
}
// подпись масштаба: «1 км», «300 м»
export const rangeTxt = (m) => (m >= 1000 ? `${+(m / 1000).toFixed(1)} км` : `${Math.round(m)} м`);
