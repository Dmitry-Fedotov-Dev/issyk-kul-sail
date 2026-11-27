// Айсберги озера Мерцбахера. Мелкие и средние (0.6-6 м) -- с физикой: масса по объёму (лёд 900 кг/м³ -- над водой ~десятая
// часть), качка на воде, «нырок» от удара и всплытие, дрейф по ветру, вязкость воды, столкновения друг с другом, с берегом
// и с лодкой (отдача по массам), мелкие от сильного удара переворачиваются. Большие (15-35 м) -- неподвижные ледяные
// глыбы: только покачиваются, об них можно удариться. Вид -- гранёный лёд: белый сверху, бирюзово-синий под водой.
import * as THREE from 'three';

const ICE = 900, WATER = 1000;
// гранёная льдина: икосаэдр с неровными вершинами, приплюснутый; цвет по высоте (подводная часть -- синее)
function iceGeo(seed, flat) { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, col = [];
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const key = new Map(); for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!key.has(k)) key.set(k, 0.75 + rnd() * 0.5); const m = key.get(k); p.setXYZ(i, p.getX(i) * m, p.getY(i) * m * flat, p.getZ(i) * m); }
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / flat, t = Math.max(0, Math.min(1, (y + 0.2) / 0.9)); col.push(0.55 + 0.42 * t, 0.78 + 0.2 * t, 0.86 + 0.13 * t); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g; }

export function makeIcebergs(scene, { cells, grid, h, n = 44, big = 6, front = null, mid = null }) {
  const { W, X0, Y1, STEP } = grid, mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list = [], bigs = [];
  const any = (i) => { const k = cells[(i * 7919 + 13) % cells.length]; return [X0 + (k % W) * STEP + ((i * 37) % 60) - 30, Y1 - ((k / W) | 0) * STEP + ((i * 53) % 60) - 30]; };
  // три четверти -- в полосе от ледяной плотины (там откалываются) к середине озера; на глубине, иначе -- где угодно
  const at = (i) => { if (!front || !mid || i % 4 === 3) return any(i); for (let t = 0; t < 12; t++) { const u = ((i * 0.618 + t * 0.37) % 1), X = front.X + (mid.X - front.X) * u + Math.sin(i * 2.3 + t) * 220, Y = front.Y + (mid.Y - front.Y) * u + Math.cos(i * 1.7 + t) * 220; const k = Math.round((Y1 - Y) / STEP) * W + Math.round((X - X0) / STEP); if (cells.includes(k)) return [X, Y]; } return any(i); };
  for (let i = 0; i < big; i++) { const [X, Y] = at(i * 5 + 3), r = 15 + ((i * 41) % 20), ht = 0.45 + ((i * 13) % 10) / 40, m = new THREE.Mesh(iceGeo(97 + i * 31, ht), mat); m.scale.set(r, r, r); scene.add(m);
    bigs.push({ X, Y, vx: 0, vy: 0, r, ht, m, ph: i * 1.3 }); }
  for (let i = 0; i < n; i++) { const [X, Y] = at(i + 40), r = 0.6 + Math.pow(((i * 29) % 100) / 100, 2.4) * 5.4, /* больше мелочи (обломки 0.6-2 м, 0.2-5 т) -- их расталкивает лодка; крупных мало */ ht = 0.5 + ((i * 7) % 10) / 25, m = new THREE.Mesh(iceGeo(11 + i * 17, ht), mat); m.scale.set(r, r, r); scene.add(m);
    const mass = ICE * (4 / 3) * Math.PI * r * r * r * ht * 0.55; // неровная, не шар
    list.push({ X, Y, vx: 0, vy: 0, z: 0, vz: 0, r, ht, mass, yaw: i * 2.1, wy: 0, roll: 0, pitch: 0, wr: 0, wp: 0, rr: 0, rp: 0, m, cool: 0 }); }
  // боковые столкновения: две окружности, импульс по нормали, упругость 0.3; ma, mb -- массы (Infinity -- неподвижный)
  const collide = (a, b, ra, rb, ma, mb) => { const dx = b.X - a.X, dy = b.Y - a.Y, d = Math.hypot(dx, dy), R = ra + rb; if (d >= R || d < 1e-3) return 0;
    const nx = dx / d, ny = dy / d, ov = R - d, ia = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb), ib = 1 - ia; a.X -= nx * ov * ia; a.Y -= ny * ov * ia; b.X += nx * ov * ib; b.Y += ny * ov * ib;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv >= 0) return 0; const im = (ma === Infinity ? 0 : 1 / ma) + (mb === Infinity ? 0 : 1 / mb), j = -1.3 * rv / im;
    if (ma !== Infinity) { a.vx -= j * nx / ma; a.vy -= j * ny / ma; } if (mb !== Infinity) { b.vx += j * nx / mb; b.vy += j * ny / mb; } return -rv; };
  const boatR = (b) => ({ yacht: 3.6, boat: 2.6, jetski: 1.6, kayak: 1.9, scull: 3.3, sup: 1.4 }[b.kind || 'yacht'] || 2), boatM = (b) => ({ yacht: 2800, boat: 1100, jetski: 420, kayak: 110, scull: 100, sup: 95 }[b.kind || 'yacht'] || 500);
  let T = 0;
  // level -- уровень воды; wind -- {sx, sy} м/с; boat -- лодка игрока или null; bump(сила 0..1) -- отдача в кадр/звук
  function update(dt, level, wind, boat, bump) { T += dt; dt = Math.min(dt, 0.05);
    for (const g of bigs) { const gz = h(g.X, g.Y), sit = level - gz < g.r * 0.3; g.m.position.set(g.X, (sit ? gz + g.r * g.ht * 0.5 : level - g.r * g.ht * 0.42) + Math.sin(T * 0.25 + g.ph) * 0.25, -g.Y); g.m.rotation.set(Math.sin(T * 0.2 + g.ph) * 0.01, g.ph, Math.cos(T * 0.17 + g.ph) * 0.01); }
    const wx = wind ? wind.sx : 0, wy = wind ? wind.sy : 0;
    for (const g of list) { g.cool = Math.max(0, g.cool - dt);
      // ветер в надводную часть и вязкость воды: мелкие разгоняются и тормозятся быстрее
      const fr = 0.06 + 0.5 / g.r; g.vx += (wx * 0.018 - g.vx * fr) * dt; g.vy += (wy * 0.018 - g.vy * fr) * dt;
      // берег: где мельче половины льдины -- выталкивает на глубину (по уклону дна), скорость вдоль берега остаётся
      const gz = h(g.X, g.Y), dep = level - gz, ground = dep < g.r * g.ht * 0.9;
      if (ground) { const e = 6, gx = h(g.X + e, g.Y) - h(g.X - e, g.Y), gy = h(g.X, g.Y + e) - h(g.X, g.Y - e), L = Math.hypot(gx, gy) || 1, nx = -gx / L, ny = -gy / L; const vn = g.vx * nx + g.vy * ny; if (vn < 0) { g.vx -= vn * nx * 1.4; g.vy -= vn * ny * 1.4; } g.vx += nx * 1.5 * dt; g.vy += ny * 1.5 * dt; }
      g.X += g.vx * dt; g.Y += g.vy * dt; g.yaw += g.wy * dt; g.wy *= Math.exp(-dt * 0.4);
      // качка: пружина плавучести вокруг равновесия + волна; наклоны -- пружины к положению покоя (после переворота -- новое)
      g.vz += (-g.z * 3.2 - g.vz * 1.1) * dt; g.z += g.vz * dt;
      g.wr += ((g.rr - g.roll) * 2.2 - g.wr * 0.9) * dt; g.wp += ((g.rp - g.pitch) * 2.2 - g.wp * 0.9) * dt; g.roll += g.wr * dt; g.pitch += g.wp * dt; }
    for (let i = 0; i < list.length; i++) { const a = list[i]; for (let k = i + 1; k < list.length; k++) collide(a, list[k], a.r * 0.85, list[k].r * 0.85, a.mass, list[k].mass); for (const g of bigs) collide(a, g, a.r * 0.85, g.r * 0.8, a.mass, Infinity); }
    if (boat) { const rb = boatR(boat), mb = boatM(boat); let hard = 0;
      for (const g of bigs) { const v = collide(boat, g, rb, g.r * 0.8, mb, Infinity); if (v > hard) hard = v; }
      for (const g of list) { const v = collide(boat, g, rb, g.r * 0.85, mb, g.mass); if (v > 0.4 && g.cool <= 0) { g.cool = 0.6; const k = Math.min(1, v * mb / (g.mass + mb) / 2);
          g.vz -= k * 2.2; g.wy += (Math.random() - 0.5) * k * 2; g.wr += (Math.random() - 0.5) * k * 3; g.wp += (Math.random() - 0.5) * k * 3; // нырок, разворот, раскачка
          if (g.r < 3.2 && k > 0.35 && Math.random() < 0.6) { if (Math.random() < 0.5) g.rr += Math.PI; else g.rp += Math.PI; } // мелкая -- переворачивается
          hard = Math.max(hard, v * Math.min(1, g.mass / mb)); } }
      if (hard > 0.5 && bump) bump(Math.min(1, hard / 4)); }
    for (const g of list) { const gz = h(g.X, g.Y), sit = level - gz < g.r * g.ht * 0.5; g.m.position.set(g.X, (sit ? gz + g.r * g.ht * 0.45 : level - g.r * g.ht * 0.3 + g.z + Math.sin(T * 0.9 + g.yaw) * 0.06), -g.Y); g.m.rotation.set(g.pitch, g.yaw, g.roll); } }
  function setVisible(v) { for (const g of list) g.m.visible = v; for (const g of bigs) g.m.visible = v; }
  return { update, setVisible, list, bigs };
}
