// Як-130: низкополигональная модель в стиле остальных снарядов. Нос -- в -z, верх -- +y, правое крыло -- +x.
// Реальные пропорции: длина 11.5 м, размах 9.8 м, высота 4.8 м. Тандемная кабина (задний инструктор сидит выше),
// длинные наплывы от крыла до кабины, двигатели в гондолах по бокам под наплывами, один киль, цельноповоротный
// стабилизатор. Окраска ВКС: серо-голубой камуфляж, светлый низ, красные звёзды и бортовой номер.
import * as THREE from 'three';

const std = (c, r = 0.55, m = 0.15) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: 0.8 });
const mesh = (g, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };

// тело по сечениям: [z, полуширина, верх, низ]; сечение -- суперэллипс (чуть квадратнее у гондол)
function body(sec, seg = 18, ex = 2.2) {
  const pos = [], idx = [], ring = seg + 1;
  for (const [z, w, top, bot] of sec) for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * w, y = s >= 0 ? Math.pow(s, 2 / ex) * top : -Math.pow(-s, 2 / ex) * bot; pos.push(x, y, z); }
  for (let i = 0; i < sec.length - 1; i++) for (let j = 0; j < seg; j++) { const p = i * ring + j, q = p + ring; idx.push(p, q, p + 1, p + 1, q, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// плоская деталь (крыло, киль) из контура: толщина t, по xz (горизонтальная) или по zy (вертикальная)
function plate(pts, t, vertical = false) {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.6, bevelSegments: 1 });
  g.translate(0, 0, -t / 2); if (vertical) g.rotateY(Math.PI / 2); else g.rotateX(Math.PI / 2); return g;
}
function decal(draw, w, h) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false })); }
const star = (x) => { x.fillStyle = '#fff'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 13 : 30, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); } x.fill();
  x.fillStyle = '#c8102e'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 10 : 25, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); } x.fill(); };

export function makeJet() {
  const root = new THREE.Group(), air = new THREE.Group(); root.add(air);
  const top = std(0x8fa3b4), mid = std(0xa9bac7), dark = std(0x5f7488), low = std(0xc9d3dc), metal = std(0x50565e, 0.35, 0.8), glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc3d8, roughness: 0.05, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1 });
  // фюзеляж: от острого носа к кабине, широкий центроплан с гондолами, сужение к соплам
  const fus = body([[-5.9, 0.02, 0.02, 0.02], [-5.5, 0.18, 0.16, 0.14], [-4.9, 0.36, 0.34, 0.3], [-4.0, 0.5, 0.5, 0.45], [-3.0, 0.56, 0.62, 0.55], [-1.6, 0.58, 0.72, 0.62], [-0.4, 0.62, 0.7, 0.66],
    [1.0, 0.62, 0.62, 0.66], [2.6, 0.52, 0.55, 0.58], [4.2, 0.36, 0.45, 0.4], [5.4, 0.22, 0.32, 0.22], [5.7, 0.05, 0.05, 0.05]]);
  mesh(fus, mid, air);
  // спинной гаргрот под камуфляж -- темнее
  mesh(body([[-2.6, 0.3, 0.75, 0.05], [-0.4, 0.42, 0.78, 0.05], [2.4, 0.34, 0.6, 0.05], [5.2, 0.12, 0.34, 0.05]], 12), top, air, 0, 0.05, 0);
  // носовой обтекатель -- тёмный
  mesh(body([[-5.95, 0.01, 0.01, 0.01], [-5.5, 0.19, 0.17, 0.15], [-5.0, 0.33, 0.31, 0.28], [-4.85, 0.37, 0.35, 0.31]], 16), dark, air);
  // фонарь: тандем, задняя кабина выше (инструктор видит поверх ученика)
  mesh(body([[-3.5, 0.05, 0.05, 0.02], [-3.0, 0.34, 0.38, 0.02], [-2.2, 0.4, 0.5, 0.02], [-1.3, 0.4, 0.68, 0.02], [-0.5, 0.36, 0.66, 0.02], [0.2, 0.18, 0.45, 0.02]], 14), glass, air, 0, 0.55, 0);
  // гондолы двигателей по бокам, воздухозаборники под наплывами
  for (const sx of [-1, 1]) { const n = mesh(body([[-1.8, 0.28, 0.34, 0.34], [-1.0, 0.36, 0.42, 0.42], [2.5, 0.38, 0.42, 0.42], [4.6, 0.3, 0.34, 0.34], [5.3, 0.26, 0.28, 0.28]], 14, 2), mid, air, sx * 0.72, -0.18, 0);
    const inlet = mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 14), dark, air, sx * 0.72, -0.18, -1.82); void n; void inlet;
    const noz = mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.5, 14, 1, true), metal, air, sx * 0.72, -0.18, 5.45); noz.rotation.x = Math.PI / 2; }
  // крыло: плечевое, стреловидность по передней кромке ~30°, с длинным наплывом до кабины
  const wing = plate([[0, -1.6], [4.9, 1.2], [4.9, 2.2], [0, 2.9]], 0.12);
  for (const sx of [-1, 1]) { const w = mesh(wing, top, air, sx * 0.5, 0.18, 0); w.scale.x = sx; w.rotation.z = sx * -0.03;
    const lx = mesh(plate([[0, -4.0], [0.55, -1.6], [0.55, 0.4], [0, 0.4]], 0.08), top, air, sx * 0.5, 0.2, 0); lx.scale.x = sx; // наплыв
    const tip = mesh(new THREE.BoxGeometry(0.06, 0.08, 1.1), dark, air, sx * 5.4, 0.18, 1.65); void tip; }
  // хвост: один киль, цельноповоротный стабилизатор
  mesh(plate([[0, 0], [2.2, 0], [3.1, 2.25], [2.3, 2.25]], 0.1, true), top, air, 0, 0.45, 3.0);
  for (const sx of [-1, 1]) { const s = mesh(plate([[0, 0], [2.1, 0.8], [2.1, 1.6], [0, 1.9]], 0.08), top, air, sx * 0.4, -0.05, 3.5); s.scale.x = sx; }
  // звёзды на киле, номер на носу
  for (const sx of [-1, 1]) { const d = decal(star, 0.9, 0.9); d.position.set(sx * 0.07, 1.6, 4.55); d.rotation.y = sx * Math.PI / 2; air.add(d);
    const nb = decal((x) => { x.fillStyle = '#c8102e'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.fillText('130', 32, 46); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.strokeText('130', 32, 46); }, 0.8, 0.8); nb.position.set(sx * 0.53, 0.05, -3.6); nb.rotation.y = sx * Math.PI / 2; air.add(nb);
    const ws = decal(star, 1.0, 1.0); ws.position.set(sx * 3.6, 0.3, 1.2); ws.rotation.x = -Math.PI / 2; air.add(ws); }
  // светлый низ: днище фюзеляжа
  mesh(body([[-4.0, 0.48, 0.05, 0.46], [-0.4, 0.6, 0.05, 0.67], [2.6, 0.5, 0.05, 0.59], [5.3, 0.22, 0.05, 0.23]], 12), low, air, 0, -0.01, 0);
  // шасси: три стойки; убираются (масштаб)
  const gear = new THREE.Group(); air.add(gear); const tyre = std(0x1d2024, 0.9, 0);
  const leg = (x, z, l) => { const g = new THREE.Group(); g.position.set(x, -0.45, z); gear.add(g); mesh(new THREE.CylinderGeometry(0.05, 0.05, l, 6), metal, g, 0, -l / 2, 0); const w = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12), tyre, g, 0, -l, 0); w.rotation.z = Math.PI / 2; return g; };
  leg(0, -3.6, 1.05); leg(-1.35, 0.9, 1.0); leg(1.35, 0.9, 1.0);
  // сопла: свечение на максимале (у Як-130 нет форсажа -- только тёплое марево)
  const glowM = new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = [-1, 1].map((sx) => { const m = mesh(new THREE.ConeGeometry(0.22, 1.6, 10, 1, true), glowM, air, sx * 0.72, -0.18, 6.4); m.rotation.x = -Math.PI / 2; return m; });
  // лётчики: два шлема под фонарём
  for (const [z, y] of [[-2.3, 0.95], [-0.9, 1.08]]) { mesh(new THREE.SphereGeometry(0.17, 10, 8), std(0xe8e8e8, 0.4), air, 0, y, z); mesh(new THREE.BoxGeometry(0.22, 0.07, 0.05), std(0x223344, 0.2, 0.5), air, 0, y, z - 0.16); }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return {
    root,
    setGear(k) { gear.scale.setScalar(Math.max(0.001, k)); gear.visible = k > 0.02; },
    setThrust(k) { glowM.opacity = 0.05 + 0.4 * k * k; for (const g of glows) g.scale.set(1, 0.6 + k * 0.8, 1); },
    fp(on) { air.visible = !on; },
  };
}
