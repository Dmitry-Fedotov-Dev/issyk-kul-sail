// Находки на берегу: волна каждый игровой день выносит на песок мелочи -- ракушки, камушки, стёклышки, а изредка
// черепки и монеты затонувших поселений (Иссык-Куль правда хранит их на дне). Зачем ходить пешком -- вот зачем.
// Геймдизайн:
//  * Видно издалека: искорка мерцает и с воды, и с воздуха (подрастает с расстоянием), редкое светится цветом --
//    увидел бирюзовый огонёк с яхты, причалил, побежал. Ночью искорки ярче.
//  * Редкость -- лотерея: обычное часто, черепок -- раз в несколько пляжей, монета -- событие. У редкого свой звук.
//  * Серия: находки одна за другой (меньше 10 с между) -- нота за нотой вверх и «×3» -- тянет пробежаться по кромке.
//  * Каждый игровой день -- новые находки в каждой ячейке берега (детерминированно: день + ячейка), подобранное
//    не возвращается до следующего дня. Коллекция копится навсегда (в журнале).
//  * Дымок в хорошем настроении «чует» находки -- подбирает с 2.5 м вместо 1.2.
import * as THREE from 'three';

export const KINDS = [
  { id: 'shell', name: 'Ракушка', w: 46, col: [255, 240, 200], tone: 0 },
  { id: 'pebble', name: 'Цветной камушек', w: 28, col: [255, 225, 170], tone: 1 },
  { id: 'glass', name: 'Морское стёклышко', w: 14, col: [170, 255, 220], tone: 2 },
  { id: 'feather', name: 'Перо чайки', w: 8, col: [235, 245, 255], tone: 2 },
  { id: 'shard', name: 'Черепок древнего кувшина', w: 3.5, col: [120, 230, 255], tone: 4, rare: 'Иссык-Куль прячет на дне затонувшие города — волна вынесла кусочек одного из них' },
  { id: 'coin', name: 'Монета Шёлкового пути', w: 0.5, col: [255, 140, 255], tone: 6, rare: 'Тысячу лет назад тут шли караваны. Невероятная удача!' },
];
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const pick = (r) => { let t = r() * KINDS.reduce((a, k) => a + k.w, 0); for (const k of KINDS) if ((t -= k.w) <= 0) return k; return KINDS[0]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function sparkTex() { // пиксельная звезда с тёмным контуром: читается и на светлом песке, и ночью; цвет -- от материала
  const N = 21, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), m = N >> 1;
  const star = (L, w) => { const pts = []; for (let k = -L; k <= L; k++) { const ww = Math.max(0, Math.round(w * (1 - Math.abs(k) / (L + 1)))); for (let q = -ww; q <= ww; q++) { pts.push([m + k, m + q], [m + q, m + k]); } } return pts; };
  x.fillStyle = 'rgba(40,24,10,0.9)'; for (const [i, j] of star(9, 3)) { x.fillRect(i - 1, j, 3, 1); x.fillRect(i, j - 1, 1, 3); }
  x.fillStyle = '#fff'; for (const [i, j] of star(8, 2)) x.fillRect(i, j, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}
function beamTex() { // столб света над редкой находкой -- видно с яхты и с воздуха, как маяк: «там что-то есть!»
  const c = document.createElement('canvas'); c.width = 8; c.height = 64; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = g; x.fillRect(2, 0, 4, 64); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 16, 1, 48); x.fillRect(7, 16, 1, 48);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}

export function makeFinds({ G, scene, camera, beach, audio, toast, store, ach, onTake = () => {} }) {
  const tex = sparkTex(), btex = beamTex(), beams = [], pool = [], live = new Set(), H = (x, y) => (G.hMesh ? G.hMesh(x, y) : G.h(x, y));
  const getS = () => { let s = pool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1, depthWrite: false, fog: false })); s.center.set(0.5, 0.3); scene.add(s); } s.visible = true; live.add(s); return s; };
  const putS = (s) => { s.visible = false; live.delete(s); (s.userData.beam ? beams : pool).push(s); };
  const getB = () => { let s = beams.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: btex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.center.set(0.5, 0); s.userData.beam = true; scene.add(s); } s.visible = true; live.add(s); return s; };
  const got = new Set(); let gotDay = -1; // подобрано сегодня: «ячейка:номер»
  const coll = Object.assign({}, store.get('finds') || {}); // коллекция навсегда: id -> сколько
  const perCell = new Map(); // id ячейки -> { day, list }
  let combo = 0, comboT = 0;

  function gen(c, dayN) { // сколько и чего вынесла волна в эту ячейку сегодня: на кромке воды (места пляжа ближе к воде)
    const r = rng(c.id * 31 + dayN * 7919 + 5), sp = c.sp || [], out = []; if (!sp.length) return out;
    const n = c.zone === 'wild' ? 3 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3); // дикий берег -- щедрее: там никто не собирает
    for (let i = 0; i < n; i++) { const p = sp[Math.floor(r() * sp.length)];
      // от места пляжа -- к воде, пока не намокнет: находка лежит у самой кромки
      let x = p.x, y = p.y; for (let k = 0; k < 20 && G.h(x + p.wx * 2, y + p.wy * 2) > 0.05; k++) { x += p.wx * 2; y += p.wy * 2; }
      // чуть выше уреза и вразброс вдоль берега (не в воду): полоса, где волна оставляет выброс
      const back = 1 + r() * 4, al = (r() - 0.5) * 16; x += -p.wx * back - p.wy * al; y += -p.wy * back + p.wx * al;
      for (let k = 0; k < 6 && G.h(x, y) < 0.05; k++) { x -= p.wx * 1.5; y -= p.wy * 1.5; } if (G.h(x, y) < 0.05) continue;
      const kind = pick(r); out.push({ key: c.id + ':' + i, x, y, kind, ph: r() * 6.28 }); }
    return out;
  }
  // dym -- состояние пешего Дымка или null; magnet -- радиус подбора
  function update(dt, dym, dayN, magnet = 1.2) {
    if (dayN !== gotDay) { got.clear(); gotDay = dayN; }
    const cx = camera.position.x, cy = -camera.position.z, night = G.night ? 1 : 0, t = G.t || 0;
    comboT -= dt; if (comboT <= 0) combo = 0;
    const seen = new Set();
    for (const c of beach.cells) { if (!c.on || !c.sp) continue; seen.add(c.id);
      let e = perCell.get(c.id); if (!e || e.day !== dayN) { if (e) for (const f of e.list) { if (f.s) { putS(f.s); f.s = null; } if (f.b) { putS(f.b); f.b = null; } } e = { day: dayN, list: gen(c, dayN) }; perCell.set(c.id, e); }
      for (const f of e.list) {
        if (got.has(f.key)) { if (f.s) { putS(f.s); f.s = null; } if (f.b) { putS(f.b); f.b = null; } continue; }
        const d = Math.hypot(f.x - cx, f.y - cy, camera.position.y - H(f.x, f.y));
        if (d > 900) { if (f.s) { putS(f.s); f.s = null; } if (f.b) { putS(f.b); f.b = null; } continue; }
        if (!f.s) { f.s = getS(); const [r, g, b] = f.kind.col; f.s.material.color.setRGB(r / 255, g / 255, b / 255); }
        // мерцание: вспышка раз в пару секунд, редкие -- чаще и крупнее; издали подрастает, чтобы было видно с яхты
        const rare = f.kind.tone >= 4, tw = Math.pow(0.5 + 0.5 * Math.sin(t * (rare ? 4.5 : 2.6) + f.ph), 3), far = clamp(d * 0.05, 1, 9);
        const sz = (rare ? 1.1 : 0.75) * (0.6 + 0.6 * tw) * far, gz = H(f.x, f.y); f.s.scale.set(sz, sz, 1); f.s.material.rotation = t * 0.6 + f.ph; f.s.material.opacity = clamp(0.75 + 0.25 * tw, 0, 1);
        f.s.position.set(f.x, gz + 0.12, -f.y);
        if (rare) { if (!f.b) { f.b = getB(); const [r, g, b] = f.kind.col; f.b.material.color.setRGB(r / 255, g / 255, b / 255); }
          const bh = clamp(d * 0.08, 3, 40); f.b.scale.set(bh * 0.14, bh, 1); f.b.material.opacity = 0.45 + 0.25 * tw + night * 0.3; f.b.position.set(f.x, gz, -f.y); }
        if (dym && dym.ground !== false && Math.hypot(dym.X - f.x, dym.Y - f.y) < magnet) take(f); } }
    for (const [id, e] of perCell) if (!seen.has(id)) { for (const f of e.list) { if (f.s) { putS(f.s); f.s = null; } if (f.b) { putS(f.b); f.b = null; } } perCell.delete(id); }
  }
  let lastTake = null;
  function take(f) {
    got.add(f.key); if (f.s) { putS(f.s); f.s = null; } if (f.b) { putS(f.b); f.b = null; }
    const k = f.kind; coll[k.id] = (coll[k.id] || 0) + 1; store.set('finds', coll);
    combo = comboT > 0 ? combo + 1 : 1; comboT = 10;
    // звук: нота серии растёт, редкое -- фанфарка
    if (audio.find) audio.find(k.tone, combo);
    const tot = KINDS.reduce((a, q) => a + (coll[q.id] || 0), 0);
    if (k.rare) toast(`✦ ${k.name}! ${k.rare}`); else toast(`${k.name}${combo > 1 ? ` · серия ×${combo}` : ''} · в коллекции ${tot}`);
    ach('d_find'); if (combo >= 3) ach('d_combo'); if (k.id === 'shard') ach('d_shard'); if (k.id === 'coin') ach('d_coin');
    if (KINDS.every((q) => coll[q.id])) ach('d_coll');
    lastTake = { kind: k, combo, t: G.t }; onTake(k);
  }
  // ближайшая находка (для подсказки и чтобы Дымок оглядывался)
  function nearest(X, Y, R = 25) { let best = null, bd = R; for (const [, e] of perCell) for (const f of e.list) { if (got.has(f.key)) continue; const d = Math.hypot(f.x - X, f.y - Y); if (d < bd) { bd = d; best = f; } } return best ? { f: best, d: bd } : null; }
  const total = () => KINDS.reduce((a, q) => a + (coll[q.id] || 0), 0);
  return { update, nearest, coll, total, get last() { return lastTake; }, get count() { return live.size; } };
}
