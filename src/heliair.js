// Ощущение скорости и высоты для вертолёта. Огромные горы вдали почти не двигаются в кадре, поэтому на 200 км/ч кажется,
// что машина висит. Нужны ближние ориентиры, которые проносятся мимо:
//  * воздушная взвесь -- снежная пыль и ледяные кристаллы в коробке вокруг камеры; неподвижна в воздухе (сносится ветром),
//    поэтому летит навстречу со скоростью машины относительно воздуха. Чем быстрее -- тем длиннее штрихи и заметнее;
//    на месте её почти не видно. Боковой ветер -- штрихи идут наискось.
//  * россыпь скал -- выходы камня на склонах в радиусе ~1 км (инстансы, раскладка по сетке детерминированная): на бреющем
//    они мелькают под брюхом, у стены -- проносятся сбоку. Даёт параллакс среднего плана.
//  * тень машины на рельефе -- видно высоту над землёй и сближение со склоном.
import * as THREE from 'three';

const N_MOTE = 360, BOX = 70, CELL = 90, RING = 6; // RING клеток в каждую сторону -- ~1 км
const hash = (i, j, k) => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function makeHeliAir({ scene, H }) {
  // ---- взвесь ----
  const mp = new Float32Array(N_MOTE * 3), seg = new Float32Array(N_MOTE * 6), col = new Float32Array(N_MOTE * 6);
  for (let i = 0; i < N_MOTE; i++) { mp[i * 3] = (Math.random() - 0.5) * 2 * BOX; mp[i * 3 + 1] = (Math.random() - 0.5) * 2 * BOX * 0.6; mp[i * 3 + 2] = (Math.random() - 0.5) * 2 * BOX;
    const b = 0.35 + Math.random() * 0.3; for (let k = 0; k < 2; k++) { col[i * 6 + k * 3] = b * (k ? 0.6 : 1); col[i * 6 + k * 3 + 1] = (b + 0.08) * (k ? 0.6 : 1); col[i * 6 + k * 3 + 2] = (b + 0.25) * (k ? 0.7 : 1); } } // серо-голубые: видны и на снегу, и на небе; хвост темнее
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(seg, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const motes = new THREE.LineSegments(mg, mm); motes.frustumCulled = false; motes.renderOrder = 5; motes.visible = false; scene.add(motes);
  let mInit = false; const cam0 = new THREE.Vector3();

  // ---- скалы ----
  const MAXR = (RING * 2 + 1) ** 2; const rg = new THREE.IcosahedronGeometry(1, 0); { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.55); rg.computeVertexNormals(); }
  const rm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const rocks = new THREE.InstancedMesh(rg, rm, MAXR); rocks.frustumCulled = false; rocks.visible = false; rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(rocks);
  let rci = 1e9, rcj = 1e9; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), cc = new THREE.Color();
  function layRocks(X, Y) { const ci = Math.floor(X / CELL), cj = Math.floor(Y / CELL); if (ci === rci && cj === rcj) return; rci = ci; rcj = cj; let n = 0;
    for (let j = cj - RING; j <= cj + RING; j++) for (let i = ci - RING; i <= ci + RING; i++) { const r0 = hash(i, j, 1); if (r0 < 0.25) continue; // четверть клеток пустые -- россыпь неровная
      const x = (i + hash(i, j, 2)) * CELL, y = (j + hash(i, j, 3)) * CELL, z = H(x, y); if (z < 30) continue; // у воды и в городе камней не кладём
      const sl = Math.hypot(H(x + 6, y) - H(x - 6, y), H(x, y + 6) - H(x, y - 6)) / 12; if (sl > 1.1) continue; // на отвесах не держатся (и там сетка рельефа грубее -- камень повиснет)
      const big = hash(i, j, 4), s0 = 2.5 + big * big * 14 * (sl > 0.5 ? 1.3 : 1);
      e.set(hash(i, j, 5) * 0.5, hash(i, j, 6) * 6.28, hash(i, j, 7) * 0.5); q.setFromEuler(e); sv.set(s0 * (0.8 + hash(i, j, 8) * 0.7), s0 * (0.7 + hash(i, j, 9) * 0.6), s0 * (0.8 + hash(i, j, 10) * 0.7));
      pv.set(x, z - s0 * 0.25, -y); m4.compose(pv, q, sv); rocks.setMatrixAt(n, m4);
      const t = hash(i, j, 11); cc.setRGB(0.36 + t * 0.12, 0.33 + t * 0.1, 0.32 + t * 0.08); rocks.setColorAt(n, cc); n++; }
    rocks.count = n; rocks.instanceMatrix.needsUpdate = true; if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true; }

  // ---- тень ----
  const sc = document.createElement('canvas'); sc.width = sc.height = 64; { const x = sc.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(20,30,50,.55)'); gr.addColorStop(0.6, 'rgba(20,30,50,.3)'); gr.addColorStop(1, 'rgba(20,30,50,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow);

  // h -- вертолёт (X, Y, Z, vx, vy, vz, th), w -- ветер {x, y, z} у машины, camera -- камера
  function tick(dt, h, w, camera) {
    const ax = h.vx - (w ? w.x : 0), ay = h.vy - (w ? w.y : 0), az = h.vz - (w ? w.z || 0 : 0), Va = Math.hypot(ax, ay, az);
    // взвесь: точки живут в мировых координатах, коробка ездит с камерой (выпавшие переносятся на другую сторону)
    const c = camera.position; if (!mInit) { cam0.copy(c); mInit = true; }
    const k = Math.min(0.09, 0.03 + Va * 0.0011), dx = -ax * k, dy = -az * k, dz = ay * k; // штрих -- путь точки относительно машины за k секунд (мир three: x, z=-Y)
    const wx = w ? w.x : 0, wy = w ? w.y : 0;
    for (let i = 0; i < N_MOTE; i++) { const o = i * 3; let x = mp[o] + wx * dt, y = mp[o + 1] - 0.4 * dt, z = mp[o + 2] - wy * dt;
      let rx = x - c.x, ry = y - c.y, rz = z - c.z; const L = 2 * BOX, Ly = 1.2 * BOX;
      const wr = (v, h, P) => (((v + h) % P) + P) % P - h; rx = wr(rx, BOX, L); ry = wr(ry, Ly / 2, Ly); rz = wr(rz, BOX, L); // коробка вокруг камеры: вышедшие -- с другой стороны
      x = c.x + rx; y = c.y + ry; z = c.z + rz; mp[o] = x; mp[o + 1] = y; mp[o + 2] = z;
      const s6 = i * 6; seg[s6] = x; seg[s6 + 1] = y; seg[s6 + 2] = z; seg[s6 + 3] = x - dx * 1.0; seg[s6 + 4] = y - dy; seg[s6 + 5] = z - dz; }
    mg.attributes.position.needsUpdate = true; const vis = Math.min(0.75, Math.max(0, (Va - 8) / 60)); mm.opacity += (vis - mm.opacity) * Math.min(1, dt * 3); motes.visible = mm.opacity > 0.02;
    // скалы
    layRocks(h.X, h.Y); rocks.visible = true;
    // тень: прямо под машиной (солнце высоко -- упрощение), размер растёт, плотность падает с высотой
    const gz = H(h.X, h.Y), agl = h.Z - gz; shadow.visible = agl < 600 && gz > -1; if (shadow.visible) { const s = 18 + agl * 0.05; shadow.scale.set(s, s, 1); shadow.position.set(h.X, gz + 0.6, -h.Y); shadow.material.opacity = Math.max(0.15, 1 - agl / 600); }
  }
  function hide() { motes.visible = false; rocks.visible = false; shadow.visible = false; mInit = false; rci = rcj = 1e9; }
  return { tick, hide };
}
