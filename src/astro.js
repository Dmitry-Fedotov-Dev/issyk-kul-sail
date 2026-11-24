// Астрономия неба Иссык-Куля: дата и время -> звёздное время, Солнце, Луна, планеты.
// Формулы -- низкоточные эфемериды Пола Шлютера (P. Schlyter, «How to compute planetary positions»): точность
// ~1-2 угловые минуты для Солнца и планет, несколько минут для Луны -- глазу на экране этого более чем достаточно.
//
// Игровое время: G.day -- сутки от стартовой даты, G.clock -- местные часы (Бишкек, UTC+6). Звёзды, Солнце, Луна
// и планеты считаются по одной юлианской дате, поэтому всё согласовано: заря, фаза Луны, сезонное небо.
const D = Math.PI / 180, rev = (x) => x - Math.floor(x / 360) * 360;
export const START = Date.UTC(2026, 6, 23);           // 23 июля 2026, полночь UTC: высокое лето -- Млечный Путь в Стрельце над Терскеем
export const jdOf = (day, clock) => START / 86400000 + 2440587.5 + day + (clock - 6) / 24; // местное UTC+6 -> UTC
export const gmst = (jd) => rev(280.46061837 + 360.98564736629 * (jd - 2451545));

// эклиптика -> экваториальные (RA, Dec в градусах)
function eclToEq(lon, lat, ecl) { const x = Math.cos(lon * D) * Math.cos(lat * D), y = Math.sin(lon * D) * Math.cos(lat * D), z = Math.sin(lat * D);
  const ye = y * Math.cos(ecl * D) - z * Math.sin(ecl * D), ze = y * Math.sin(ecl * D) + z * Math.cos(ecl * D); return [rev(Math.atan2(ye, x) / D), Math.atan2(ze, Math.hypot(x, ye)) / D]; }
// уравнение Кеплера и положение в плоскости орбиты
function orbit(N, i, w, a, e, M) { let E = M + (e / D) * Math.sin(M * D) * (1 + e * Math.cos(M * D)); for (let k = 0; k < 4; k++) E -= (E - (e / D) * Math.sin(E * D) - M) / (1 - e * Math.cos(E * D));
  const xv = a * (Math.cos(E * D) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(E * D), v = Math.atan2(yv, xv) / D, r = Math.hypot(xv, yv);
  const x = r * (Math.cos(N * D) * Math.cos((v + w) * D) - Math.sin(N * D) * Math.sin((v + w) * D) * Math.cos(i * D));
  const y = r * (Math.sin(N * D) * Math.cos((v + w) * D) + Math.cos(N * D) * Math.sin((v + w) * D) * Math.cos(i * D)), z = r * Math.sin((v + w) * D) * Math.sin(i * D);
  return { x, y, z, r, v }; }
const PL = { // N, i, w, a, e, M -- элементы и их суточный ход
  venus: [[76.6799, 2.4659e-5], [3.3946, 2.75e-8], [54.891, 1.38374e-5], [0.72333, 0], [0.006773, -1.302e-9], [48.0052, 1.6021302244], -4.2, [1, 0.96, 0.86]],
  mars: [[49.5574, 2.11081e-5], [1.8497, -1.78e-8], [286.5016, 2.92961e-5], [1.523688, 0], [0.093405, 2.516e-9], [18.6021, 0.5240207766], 0.6, [1, 0.62, 0.42]],
  jupiter: [[100.4542, 2.76854e-5], [1.303, -1.557e-7], [273.8777, 1.64505e-5], [5.20256, 0], [0.048498, 4.469e-9], [19.895, 0.0830853001], -2.3, [1, 0.94, 0.84]],
  saturn: [[113.6634, 2.3898e-5], [2.4886, -1.081e-7], [339.3939, 2.97661e-5], [9.55475, 0], [0.055546, -9.499e-9], [316.967, 0.0334442282], 0.6, [1, 0.9, 0.7]] };

// всё небо на момент jd: { sun, moon, planets } -- RA/Dec в градусах; moon.k -- освещённая доля диска
export function sky(jd) {
  const d = jd - 2451543.5, ecl = 23.4393 - 3.563e-7 * d;
  // Солнце (геоцентрическое)
  const sw = 282.9404 + 4.70935e-5 * d, se = 0.016709 - 1.151e-9 * d, sM = rev(356.047 + 0.9856002585 * d);
  const so = orbit(0, 0, sw, 1, se, sM), sLon = rev(so.v + sw), sx = so.r * Math.cos(sLon * D), sy = so.r * Math.sin(sLon * D);
  const [sRA, sDec] = eclToEq(sLon, 0, ecl);
  // Луна с главными возмущениями (эвекция, вариация, годичное уравнение)
  const mN = rev(125.1228 - 0.0529538083 * d), mw = rev(318.0634 + 0.1643573223 * d), mM = rev(115.3654 + 13.0649929509 * d), mo = orbit(mN, 5.1454, mw, 60.2666, 0.0549, mM);
  let mLon = Math.atan2(mo.y, mo.x) / D, mLat = Math.atan2(mo.z, Math.hypot(mo.x, mo.y)) / D;
  const Ls = rev(sM + sw), Lm = rev(mM + mw + mN), DD = Lm - Ls, F = Lm - mN, s = (x) => Math.sin(x * D);
  mLon += -1.274 * s(mM - 2 * DD) + 0.658 * s(2 * DD) - 0.186 * s(sM) - 0.059 * s(2 * mM - 2 * DD) - 0.057 * s(mM - 2 * DD + sM) + 0.053 * s(mM + 2 * DD) + 0.046 * s(2 * DD - sM) + 0.041 * s(mM - sM) - 0.035 * s(DD) - 0.031 * s(mM + sM);
  mLat += -0.173 * s(F - 2 * DD) - 0.055 * s(mM - F - 2 * DD) - 0.046 * s(mM + F - 2 * DD) + 0.033 * s(F + 2 * DD) + 0.017 * s(2 * mM + F);
  const [mRA, mDec] = eclToEq(rev(mLon), mLat, ecl), elong = Math.acos(Math.cos((mLon - sLon) * D) * Math.cos(mLat * D)) / D;
  const moon = { ra: mRA, dec: mDec, k: (1 - Math.cos(elong * D)) / 2, waxing: rev(mLon - sLon) < 180 };
  // планеты: гелиоцентрические -> геоцентрические
  const planets = {}; for (const [n, p] of Object.entries(PL)) { const el = p.slice(0, 6).map(([a, b]) => a + b * d), o = orbit(el[0], el[1], el[2], el[3], el[4], rev(el[5]));
    const gx = o.x + sx, gy = o.y + sy, gz = o.z; const [ra, dec] = eclToEq(rev(Math.atan2(gy, gx) / D), Math.atan2(gz, Math.hypot(gx, gy)) / D, ecl);
    planets[n] = { ra, dec, mag: p[6], col: p[7] }; }
  return { sun: { ra: sRA, dec: sDec }, moon, planets };
}
// RA/Dec (°) -> единичный вектор на небесной сфере J2000 (x -- точка весны, z -- полюс мира)
export const radec = (ra, dec, out = [0, 0, 0]) => { const c = Math.cos(dec * D); out[0] = c * Math.cos(ra * D); out[1] = c * Math.sin(ra * D); out[2] = Math.sin(dec * D); return out; };
