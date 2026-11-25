// Ми-8МТВ-1 МЧС: низкополигональная модель в стиле остальных снарядов. Нос -- в -z, верх -- +y, правый борт -- +x.
// Пропорции: фюзеляж 18.2 м, высота 5.65 м, несущий винт 21.3 м (5 лопастей), рулевой 3.9 м (3 лопасти, слева).
// Окраска спасателей: белый, оранжевая полоса, синий низ, «МЧС» на хвостовой балке, флаг на борту.
import * as THREE from 'three';

const std = (c, r = 0.6, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: 0.8 });
const mesh = (g, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
function body(sec, seg = 20, ex = 2.6) {
  const pos = [], idx = [], ring = seg + 1;
  for (const [z, w, top, bot, yo = 0] of sec) for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * w, y = (s >= 0 ? Math.pow(s, 2 / ex) * top : -Math.pow(-s, 2 / ex) * bot) + yo; pos.push(x, y, z); }
  for (let i = 0; i < sec.length - 1; i++) for (let j = 0; j < seg; j++) { const p = i * ring + j, q = p + ring; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
function decal(draw, w, h, cw = 256, ch = 64) { const c = document.createElement('canvas'); c.width = cw; c.height = ch; draw(c.getContext('2d'), cw, ch); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, side: THREE.DoubleSide })); }

export function makeHeli() {
  const root = new THREE.Group(), air = new THREE.Group(); root.add(air);
  const white = std(0xf2f0ea), orange = std(0xff6a1a), blue = std(0x1f4f9a), grey = std(0x6c737c, 0.5, 0.4), dark = std(0x2a2e33, 0.6, 0.3), glass = new THREE.MeshPhysicalMaterial({ color: 0x8fb6cc, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.8 });
  const Y0 = 1.25; // низ фюзеляжа над землёй (на колёсах)
  // фюзеляж: тупой остеклённый нос, высокая кабина-«бочка», сужение к хвостовой балке
  const sec = [[-9.0, 0.3, 0.5, 0.35, 1.0], [-8.6, 0.85, 0.95, 0.65, 1.0], [-7.6, 1.15, 1.2, 0.85, 1.0], [-6.2, 1.2, 1.35, 0.95, 1.0], [-3.0, 1.2, 1.45, 0.95, 1.0], [1.5, 1.2, 1.45, 0.95, 1.0],
    [3.0, 1.05, 1.3, 0.8, 1.05], [4.2, 0.55, 0.75, 0.45, 1.45], [7.0, 0.32, 0.4, 0.32, 1.65], [9.5, 0.24, 0.3, 0.24, 1.75]];
  mesh(body(sec), white, air, 0, Y0, 0);
  // синий низ и оранжевая полоса по борту
  mesh(body(sec.slice(0, 7).map(([z, w, t, b, yo]) => [z, w * 1.005, -0.25, b * 1.005, yo])), blue, air, 0, Y0, 0);
  mesh(new THREE.BoxGeometry(2.44, 0.42, 10.4), orange, air, 0, Y0 + 1.0 + 0.55, -2.2);
  // остекление носа и кабины пилотов
  mesh(body([[-9.05, 0.25, 0.42, 0.05, 1.2], [-8.6, 0.8, 0.85, 0.05, 1.25], [-7.7, 1.05, 1.0, 0.05, 1.3], [-7.0, 1.0, 0.9, 0.05, 1.4]], 16), glass, air, 0, Y0, 0);
  // круглые иллюминаторы по бортам
  const win = new THREE.CircleGeometry(0.26, 14);
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const w = mesh(win, glass, air, sd * 1.215, Y0 + 1.55, -4.6 + i * 1.25); w.rotation.y = sd * Math.PI / 2; }
  // капоты двигателей и редуктора сверху, воздухозаборники с ПЗУ (пылезащитные «грибы»)
  mesh(body([[-6.6, 0.3, 0.2, 0.05], [-5.6, 0.95, 0.75, 0.05], [0.8, 0.95, 0.8, 0.05], [2.4, 0.55, 0.5, 0.05], [3.2, 0.2, 0.2, 0.05]], 14), white, air, 0, Y0 + 2.4, 0);
  for (const sd of [-1, 1]) { const in1 = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.9, 12), grey, air, sd * 0.55, Y0 + 2.75, -6.2); in1.rotation.x = Math.PI / 2;
    const ex = mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10), dark, air, sd * 1.05, Y0 + 2.7, 0.9); ex.rotation.z = sd * 0.9; }
  // подвесные топливные баки по бокам
  for (const sd of [-1, 1]) { const t = mesh(new THREE.CapsuleGeometry(0.5, 3.0, 4, 12), orange, air, sd * 1.65, Y0 + 0.55, -2.6); t.rotation.x = Math.PI / 2; }
  // хвостовой киль и стабилизатор
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.1, 0), new THREE.Vector2(2.3, 2.6), new THREE.Vector2(1.5, 2.8), new THREE.Vector2(0.3, 0.6)].map((v) => v));
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: false }); fg.translate(0, 0, -0.08); fg.rotateY(-Math.PI / 2); mesh(fg, white, air, 0, Y0 + 1.9, 9.0);
  mesh(new THREE.BoxGeometry(3.2, 0.08, 0.7), white, air, 0, Y0 + 1.75, 8.2);
  // надпись «МЧС» на хвостовой балке
  for (const sd of [-1, 1]) { const d = decal((x, w, h) => { x.fillStyle = '#ff6a1a'; x.font = 'bold 46px sans-serif'; x.textAlign = 'center'; x.fillText('МЧС', w / 2, h * 0.78); }, 2.4, 0.6); d.position.set(sd * 0.36, Y0 + 1.85, 6.4); d.rotation.y = sd * Math.PI / 2; air.add(d); }
  // флаг Кыргызстана на борту у кабины
  for (const sd of [-1, 1]) { const d = decal((x, w, h) => { x.fillStyle = '#e8112d'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffef00'; x.beginPath(); x.arc(w / 2, h / 2, h * 0.3, 0, 7); x.fill(); x.fillStyle = '#e8112d'; x.beginPath(); x.arc(w / 2, h / 2, h * 0.17, 0, 7); x.fill(); }, 0.75, 0.45, 100, 60);
    d.position.set(sd * 1.22, Y0 + 1.95, -6.0); d.rotation.y = sd * Math.PI / 2; air.add(d); }
  // шасси: носовое и два основных
  const wh = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14); wh.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.25, -7.0], [0.25, -7.0], [-1.7, 0.2], [1.7, 0.2]]) mesh(wh, dark, air, x, 0.36, z);
  for (const sd of [-1, 1]) { const st = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), grey, air, sd * 1.4, 0.9, 0.2); st.rotation.z = sd * 0.6; }
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), grey, air, 0, 0.8, -7.0);
  // несущий винт: втулка, 5 лопастей (с прогибом вниз на стоянке) и полупрозрачный «диск» на оборотах
  const hub = new THREE.Group(); hub.position.set(0, Y0 + 3.75, -1.2); air.add(hub); mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 10), grey, hub);
  const blades = []; for (let i = 0; i < 5; i++) { const b = new THREE.Group(); b.rotation.y = i * Math.PI * 2 / 5; hub.add(b); const bl = mesh(new THREE.BoxGeometry(0.52, 0.06, 10.4), dark, b, 0, 0, -5.4); blades.push({ g: b, m: bl }); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(10.65, 48), new THREE.MeshBasicMaterial({ color: 0x30343a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; hub.add(disc);
  // рулевой винт слева на киле
  const tr = new THREE.Group(); tr.position.set(-0.3, Y0 + 3.3, 10.6); air.add(tr);
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.06, 1.95, 0.25), dark, tr, 0, 0, 0); b.geometry = b.geometry.clone().translate(0, 0.98, 0); b.rotation.x = i * Math.PI * 2 / 3; }
  const tdisc = new THREE.Mesh(new THREE.CircleGeometry(1.95, 24), disc.material.clone()); tdisc.rotation.y = Math.PI / 2; tr.add(tdisc);
  // трос лебёдки с беседкой (для спасработ): длина задаётся снаружи
  const winch = new THREE.Group(); winch.position.set(1.25, Y0 + 2.4, -5.2); air.add(winch);
  const rope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), dark, winch); rope.geometry.translate(0, -0.5, 0); const hook = mesh(new THREE.SphereGeometry(0.22, 8, 6), orange, winch); winch.visible = false;
  let ang = 0, tang = 0;
  return { root, air, Y0,
    // rpm 0..1 -- обороты (к раскрутке лопасти поднимаются из прогиба), dt -- шаг
    spin(dt, rpm) { ang += dt * rpm * 20.5; tang += dt * rpm * 110; hub.rotation.y = ang; tr.rotation.x = tang;
      for (const b of blades) b.m.rotation.x = -0.05 * (1 - rpm) + 0.02 * rpm; disc.material.opacity = 0.32 * Math.max(0, rpm - 0.4) / 0.6; tdisc.material.opacity = 0.3 * rpm;
      for (const b of blades) b.m.material.opacity = 1; },
    setWinch(len) { winch.visible = len > 0.3; rope.scale.y = Math.max(0.01, len); hook.position.y = -len; } };
}
