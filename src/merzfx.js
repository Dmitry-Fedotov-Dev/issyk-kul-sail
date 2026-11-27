// Эффекты прорыва Мерцбахера по записанному расчёту (merzsim.js): обвалы берегов, отколы ледяной стены плотины,
// всплески, кольцевые волны. Глыбы -- твёрдые тела: срываются со склона, катятся по рельефу (трение), влетают в воду
// (всплеск -- по энергии удара, волна -- по объёму), тонут; лёд всплывает и становится айсбергом.
import * as THREE from 'three';

export function makeMerzFx(scene, { h, ice }) {
  const rockGeo = new THREE.DodecahedronGeometry(1, 0), iceGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6d6258, flatShading: true }), iceMat = new THREE.MeshLambertMaterial({ color: 0xdff1f7, flatShading: true });
  const pool = [], live = [], rings = []; // rings: {X, Y, t, A}
  const get = (isIce) => { let m = pool.find((p) => !p.visible && p.userData.ice === isIce); if (!m) { m = new THREE.Mesh(isIce ? iceGeo : rockGeo, isIce ? iceMat : rockMat); m.userData.ice = isIce; scene.add(m); pool.push(m); } m.visible = true; return m; };
  // событие из расчёта: bank -- обвал берега (камень), calve -- откол ледяного обрыва (лёд). Глыбы стартуют выше по склону
  function event(e, level, near) { const isIce = e.k === 'calve', n = isIce ? 4 + Math.round(e.s / 8) : 10 + Math.round(e.s / 2);
    for (let i = 0; i < n; i++) { const sz = (isIce ? e.s * (0.35 + Math.random() * 0.45) : 2 + Math.pow(Math.random(), 1.5) * e.s * 0.6), back = 30 + Math.random() * 60, X = e.X - e.dx * back + (Math.random() - 0.5) * e.s * 2, Y = e.Y - e.dy * back + (Math.random() - 0.5) * e.s * 2;
      const m = get(isIce); m.scale.set(sz, sz * (isIce ? 0.8 : 0.7), sz); const z = h(X, Y) + sz * (isIce ? 1.2 : 0.6);
      live.push({ m, X, Y, z, vx: e.dx * (isIce ? 3 : 6 + Math.random() * 6), vy: e.dy * (isIce ? 3 : 6 + Math.random() * 6), vz: isIce ? 2 : 1, sz, isIce, wet: false, rx: Math.random(), ry: Math.random(), w: (Math.random() - 0.5) * 3, delay: i * (isIce ? 0.25 : 0.12) }); }
    return { boom: isIce ? 0.6 + e.s / 40 : 0.4 + e.s / 50 }; }
  // шаг: гравитация, склон (скатывание и трение), вода (всплеск, торможение, всплытие льда / тонет камень)
  function step(dt, level, spray, onSplash) { for (let i = live.length - 1; i >= 0; i--) { const c = live[i]; if (c.delay > 0) { c.delay -= dt; c.m.visible = false; continue; } c.m.visible = true;
      const gz = h(c.X, c.Y), inW = c.z < level;
      if (!inW) { c.vz -= 9.81 * dt; c.X += c.vx * dt; c.Y += c.vy * dt; c.z += c.vz * dt;
        if (c.z < gz + c.sz * 0.5) { c.z = gz + c.sz * 0.5; const e = 4, gx = h(c.X + e, c.Y) - h(c.X - e, c.Y), gy = h(c.X, c.Y + e) - h(c.X, c.Y - e); c.vx += -gx / (2 * e) * 9.81 * 0.8 * dt * 10; c.vy += -gy / (2 * e) * 9.81 * 0.8 * dt * 10; c.vz = Math.max(0, -c.vz * 0.25); c.vx *= 1 - dt * 0.6; c.vy *= 1 - dt * 0.6;
          if (Math.random() < dt * 8 && spray) spray.emit(c.X, gz + 0.5, -c.Y, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 3, 1, 1); } } // пыль и снег из-под глыбы
      else { if (!c.wet) { c.wet = true; const E = Math.min(1, c.sz * Math.hypot(c.vx, c.vy, c.vz) / 120); onSplash(c.X, c.Y, c.sz, E); }
        c.vx *= 1 - dt * 1.5; c.vy *= 1 - dt * 1.5; c.X += c.vx * dt; c.Y += c.vy * dt;
        if (c.isIce) { c.vz += ((level - c.sz * 0.3 - c.z) * 2 - c.vz * 1.2) * dt; c.z += c.vz * dt; if (Math.abs(c.vz) < 0.4 && Math.abs(level - c.sz * 0.3 - c.z) < 1) { ice.spawn(c.X, c.Y, c.sz * 0.9); c.m.visible = false; live.splice(i, 1); continue; } } // всплыл -- айсберг
        else { c.vz -= 2.5 * dt; c.z += c.vz * dt; if (c.z < Math.max(gz, level - 25)) { c.m.visible = false; live.splice(i, 1); continue; } } }
      c.rx += c.w * dt; c.ry += c.w * 0.7 * dt; c.m.position.set(c.X, c.z, -c.Y); c.m.rotation.set(c.rx, c.ry, c.rx * 0.5); } }
  return { event, step, live, rings };
}
