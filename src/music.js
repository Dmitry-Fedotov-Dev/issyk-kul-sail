// Вариометр музыкой: вместо писка играет «Гимнопедия №1» Эрика Сати (1888, общественное достояние) на маленьком
// синтезированном фортепиано. В подъёме -- в мажоре, как написано; в сильном снижении та же музыка уходит в
// параллельный минор (Gmaj7 -> Gm7, Dmaj7 -> Dm7, фа-диез -> фа). Движок знает форму пьесы: такты, четырёхтактовые
// фразы, разделы. Решения принимаются только на границе такта: смена настроения -- через поворотный аккорд
// (Bbmaj7 вниз, A7 вверх), конец потока -- каденцией на тонике, а не обрывом. Каждый проход фразы -- новая
// вариация: мелизмы, октава выше, ломаный аккомпанемент, эхо-канон, импровизация на долгих нотах.
// Тема A (такты 1-20) -- по нотам Сати; средний эпизод B -- стилизация автора игры на тех же гармониях.

// аккорды: [бас, голоса]
const CH = {
  G: [43, [59, 62, 66]], D: [50, [57, 61, 66]], Em: [40, [55, 59, 62]], A7: [45, [55, 61, 64]], Bm: [47, [57, 62, 66]],
  Bb: [46, [57, 62, 65]], Df: [38, [57, 62, 66, 69]],
};
// такт: [аккорд, мелодия [доля, нота, длительность в четвертях]]; размер 3/4
const INTRO = [['G', []], ['D', []]];
const HEAD = [['G', [[1, 78, 1], [2, 81, 1]]], ['D', [[0, 79, 1], [1, 78, 1], [2, 73, 1]]], ['G', [[0, 71, 1], [1, 73, 1], [2, 74, 1]]], ['D', [[0, 69, 3]]]];
const A1 = [...HEAD, ['G', [[0, 66, 12]]], ['D', []], ['G', []], ['D', []]];
const A2 = [...HEAD, ['G', [[0, 73, 3]]], ['D', [[0, 78, 3]]], ['G', [[0, 76, 6]]], ['D', []]];
const B = [['Em', [[1, 71, 1], [2, 74, 1]]], ['A7', [[0, 76, 2], [2, 73, 1]]], ['Bm', [[0, 74, 1], [1, 73, 1], [2, 71, 1]]], ['G', [[0, 69, 3]]],
  ['Em', [[1, 67, 1], [2, 71, 1]]], ['A7', [[0, 73, 1], [1, 76, 1], [2, 74, 1]]], ['G', [[0, 69, 3]]], ['A7', [[0, 64, 3]]]];
const FORM = [...A1, ...A2, ...B, ...A2];
const TO_DN = ['Bb', [[0, 77, 2], [2, 74, 1]], true], TO_UP = ['A7', [[0, 76, 1], [1, 74, 1], [2, 73, 1]], true];
const CADENCE = [['G', [[0, 71, 1], [1, 69, 2]]], ['Df', [[0, 74, 7]], false, 2.2]];

const MAJ = [2, 4, 6, 7, 9, 11, 1], MIN = [2, 4, 5, 7, 9, 10, 0];
const minor = (n) => { const pc = n % 12; return pc === 6 || pc === 1 || pc === 11 ? n - 1 : n; };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const above = (n, sc) => { let k = n + 1; while (!sc.includes(k % 12)) k++; return k; };
const below = (n, sc) => { let k = n - 1; while (!sc.includes(((k % 12) + 12) % 12)) k--; return k; };

export function makeMusic(ctx, dest) {
  // зал: свёртка с затухающим шумом и тихое эхо
  const ir = ctx.createBuffer(2, ctx.sampleRate * 3.2, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.4); }
  const bus = ctx.createGain(), rev = ctx.createConvolver(), wet = ctx.createGain(), dry = ctx.createGain(), echo = ctx.createDelay(1), fb = ctx.createGain(), es = ctx.createGain();
  rev.buffer = ir; wet.gain.value = 0.5; dry.gain.value = 0.7; echo.delayTime.value = 0.42; fb.gain.value = 0.18; es.gain.value = 0.22;
  bus.connect(dry); bus.connect(rev); bus.connect(es); es.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(rev); rev.connect(wet); dry.connect(dest); wet.connect(dest);
  // тембры: фортепиано с войлочными молоточками и челеста для верхней октавы
  const wave = (h) => { const re = new Float32Array(h.length), im = new Float32Array(h); return ctx.createPeriodicWave(re, im); };
  const PIANO = wave([0, 1, 0.42, 0.2, 0.11, 0.05, 0.03, 0.015]), CEL = wave([0, 1, 0.06, 0.12, 0, 0.04]);
  function key(n, t, vel, len, o = {}) {
    const f = mtof(n), osc = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.setPeriodicWave(o.cel ? CEL : PIANO); o2.setPeriodicWave(o.cel ? CEL : PIANO); osc.frequency.value = f; o2.frequency.value = f; o2.detune.value = 4 + Math.random() * 3;
    const hi = Math.min(9000, f * (o.dark ? 4 : 7) * (0.7 + vel * 3)); lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(hi, t); lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 200), t + Math.min(len, 2.5));
    len = Math.min(len, o.cel ? 3 : 6.5); const a = vel * (o.cel ? 0.8 : 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.007); g.gain.exponentialRampToValueAtTime(a * 0.32, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus); osc.start(t); o2.start(t); osc.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }

  const m = { on: false, mode: 'up', pos: 0, barT: 0, queue: [], ending: false, quiet: 0, stopT: -1e9, a: 0, fx: {}, prev: 74, phrase: 0 };
  function vary() { // вариация на следующую фразу; первый проход -- как написано
    const a = m.a, r = Math.random, up = m.mode === 'up';
    m.fx = m.phrase === 0 ? {} : { orn: r() < 0.45, oct: up && r() < 0.15 + 0.35 * a, arp: r() < 0.25 + 0.4 * a, canon: r() < 0.25, fill: r() < 0.55 + 0.3 * a };
    if (m.fx.oct) m.fx.canon = false; m.phrase++;
  }
  function bar(b, T, beat) {
    const [cn, mel, abs, ring = 1] = b, dn = !abs && m.mode === 'dn', mp = dn ? minor : (x) => x, sc = dn ? MIN : MAJ, fx = m.fx;
    const [bass, voices] = CH[cn], v = (0.55 + 0.45 * m.a) * (dn ? 0.85 : 1), J = () => (Math.random() - 0.5) * 0.025, L = 3 * beat;
    const o = { dark: dn };
    // аккомпанемент: бас на раз, аккорд на два -- или ломаный аккорд восьмыми
    key(mp(bass), T + J(), 0.07 * v, L * 1.6 * ring, o);
    if (fx.arp && ring === 1) { const vs = voices.map(mp), seq = [vs[0], vs[1], vs[2], vs[1], vs[2] + 12 * (Math.random() < 0.4 ? 1 : 0)];
      seq.forEach((n, i) => key(n, T + (0.5 + i * 0.5) * beat + J(), 0.038 * v, beat * 2.2, o)); }
    else voices.forEach((n, i) => key(mp(n), T + beat + i * 0.018 + J(), 0.035 * v, beat * 2.6 * ring, o));
    // мелодия
    let busy = 0;
    for (const [bt, n0, d] of mel) {
      const n = mp(n0) + (fx.oct ? 12 : 0), t = T + bt * beat + J(), vel = (fx.oct ? 0.07 : 0.1) * v * (bt === 0 ? 1.05 : 0.95);
      if (fx.orn && d <= 1 && bt > 0 && Math.random() < 0.4) key(above(n, sc), t - 0.11, vel * 0.55, 0.4, { ...o, cel: fx.oct });
      key(n, t, vel, d * beat * 1.4 + 0.6, { ...o, cel: fx.oct });
      if (fx.canon) key(n - 12, t + 1.5 * beat, vel * 0.42, d * beat + 0.8, o);
      busy += d; m.prev = mp(n0);
    }
    // импровизация на пустых и долгих тактах: шаг по гамме вокруг последней ноты, опора на звуки аккорда
    if (fx.fill && !abs && (mel.length === 0 || (mel.length === 1 && mel[0][1] < 70 && mel[0][2] >= 3)) && Math.random() < 0.75) {
      const ct = voices.map((x) => mp(x) + 12), k = 2 + (Math.random() < 0.4 ? 1 : 0); let n = m.prev < 70 ? ct[1] : m.prev;
      for (let i = 0; i < k; i++) { n = Math.random() < 0.5 ? above(n, sc) : below(n, sc); if (i === k - 1) n = ct.reduce((p, c) => (Math.abs(c - n) < Math.abs(p - n) ? c : p));
        if (n > 83) n -= 12; if (n < 66) n += 12; key(n, T + (1 + i * (k === 3 ? 0.66 : 1)) * beat + J(), 0.055 * v, beat * 2, { ...o, cel: m.a > 0.6 }); }
    }
  }
  function next() { // следующий такт пьесы; вступление звучит только при свежем начале
    if (m.pos < 0) { const b = INTRO[INTRO.length + m.pos]; m.pos++; return b; }
    if (m.pos % 4 === 0) vary(); const b = FORM[m.pos]; m.pos = (m.pos + 1) % FORM.length; return b;
  }
  function update(vz, on) {
    const t = ctx.currentTime, want = !on ? 'off' : vz > 0.25 ? 'up' : vz < -1.9 ? 'dn' : null;
    const target = want === 'up' ? Math.min(1, vz / 3) : want === 'dn' ? Math.min(1, (-vz - 1.9) / 3) : 0; m.a += (target - m.a) * 0.02;
    if (want === 'off') { if (m.on) { m.on = false; m.stopT = t; } m.queue = []; m.ending = false; return; }
    if (!m.on) { if (!want) return; m.on = true; m.mode = want; m.queue = []; m.ending = false; m.quiet = 0;
      if (t - m.stopT > 30) { m.pos = -INTRO.length; m.phrase = 0; } else if (m.pos > 0) m.pos = Math.ceil(m.pos / 4) * 4 % FORM.length; // продолжить с начала фразы
      m.barT = t + 0.06; }
    if (t > m.barT + 0.5) m.barT = t + 0.05; // вкладка спала -- не догоняем
    if (t < m.barT - 0.15) return;
    // граница такта: здесь и только здесь меняется настроение
    if (want) { m.quiet = 0; if (m.ending) { m.ending = false; m.queue = []; } if (want !== m.mode && !m.queue.length) { m.queue.push(want === 'dn' ? TO_DN : TO_UP); m.mode = want; m.phrase = Math.max(1, m.phrase); } }
    else if (!m.ending && ++m.quiet >= 2) { m.ending = true; m.queue = CADENCE.slice(); }
    const beat = 60 / (m.mode === 'up' ? 60 + 14 * m.a : 50 + 6 * m.a), b = m.queue.length ? m.queue.shift() : next();
    bar(b, m.barT, beat); m.barT += 3 * beat * (b[3] || 1);
    if (m.ending && !m.queue.length) { m.on = false; m.ending = false; m.stopT = t; m.pos = Math.ceil(Math.max(0, m.pos) / 4) * 4 % FORM.length; }
  }
  return { update };
}
