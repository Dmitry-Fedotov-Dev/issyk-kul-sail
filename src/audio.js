import { makeMusic } from './music.js';
// Звук целиком синтезируется WebAudio, файлов нет. Задача -- присутствие: ветер дует с той стороны, откуда он
// на самом деле приходит, свистит в снастях в порыв, вода журчит вдоль борта, плещет в скулу, фал стучит по мачте.
export function makeAudio() {
  let ctx = null, master, muted = false, L = {}, buf, nextLap = 0, nextClink = 0, lastHeel = 0, creakT = 0;
  function start() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.75;
    // выход: срез инфразвука (динамики ноутбука и телефона хрипят от гула ниже 45 Гц) -> мягкий компрессор -> запас
    // по громкости -> плавный ограничитель (tanh). Раньше сумма слоёв доходила до 0 дБ, компрессор с автоподъёмом
    // уровня в Chrome давил её рывками -- на сильном ветре, мотором и реактивным звук хрипел и «клиповал».
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45; hp.Q.value = 0.6;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.3;
    const trim = ctx.createGain(); trim.gain.value = 0.42;
    const lim = ctx.createWaveShaper(), N = 4096, cv = new Float32Array(N); for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 4 - 2; cv[i] = Math.tanh(x * 1.3) * 0.9; } lim.curve = cv; lim.oversample = '2x';
    master.connect(hp); hp.connect(comp); comp.connect(trim); trim.connect(lim); lim.connect(ctx.destination);
    buf = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0; // розовый шум, каналы независимы -- звук «вокруг»
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; } }
    const layer = (type, f, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6; s.loopStart = Math.random();
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); g.gain.value = 0;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(pan); pan.connect(master); s.start(); return { g, fl, pan }; };
    L.low = layer('lowpass', 260, 0.4);      // гул ветра в ушах
    L.mid = layer('bandpass', 700, 0.6);     // шум потока
    L.whistle = layer('bandpass', 2300, 9);  // свист в снастях
    L.rush = layer('bandpass', 1400, 0.5);   // вода вдоль борта
    L.bubble = layer('bandpass', 480, 2.2);  // журчание за кормой
    L.flap = layer('bandpass', 240, 1.1);    // полощущий парус
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'square'; lfo.frequency.value = 8.5; lg.gain.value = 170; lfo.connect(lg); lg.connect(L.flap.fl.frequency); lfo.start();
    const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 5.3; lg2.gain.value = 190; lfo2.connect(lg2); lg2.connect(L.bubble.fl.frequency); lfo2.start();
  }
  const set = (p, v, tc = 0.12) => p.setTargetAtTime(v, ctx.currentTime, tc);
  function noise(f, q, dur, vol, pan = 0, f2) {
    if (!ctx) return; const s = ctx.createBufferSource(); s.buffer = buf; s.loopStart = Math.random() * 3; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = q; const g = ctx.createGain(), t = ctx.currentTime;
    fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null; s.connect(fl); fl.connect(g);
    if (pn) { pn.pan.value = pan; g.connect(pn); pn.connect(master); } else g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(f, dur, type = 'sine', vol = 0.25, f2, pan = 0) {
    if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.006, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g);
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pn) { pn.pan.value = pan; g.connect(pn); pn.connect(master); } else g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function update(b) {
    if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime, aws = b.aws, sp = Math.hypot(b.vx, b.vy);
    // ветер приходит с той стороны, откуда дует вымпельный: с правого борта -- в правое ухо
    const side = Math.sin(b.awa), front = Math.cos(b.awa), w2 = aws * aws;
    set(L.low.g.gain, Math.min(0.55, 0.03 + w2 * 0.0026)); set(L.low.fl.frequency, 170 + aws * 16); if (L.low.pan.pan) set(L.low.pan.pan, side * 0.55);
    set(L.mid.g.gain, Math.min(0.42, 0.01 + w2 * 0.0019 * (0.6 + 0.4 * Math.abs(front)))); set(L.mid.fl.frequency, 420 + aws * 46); if (L.mid.pan.pan) set(L.mid.pan.pan, side * 0.8);
    set(L.whistle.g.gain, Math.min(0.16, Math.max(0, aws - 7.5) ** 2 * 0.0042), 0.25); set(L.whistle.fl.frequency, 1500 + aws * 95, 0.3); if (L.whistle.pan.pan) set(L.whistle.pan.pan, -side * 0.3);
    const lee = b.phi > 0 ? 1 : -1; // вода шумит у подветренного, притопленного борта
    set(L.rush.g.gain, Math.min(0.4, sp * sp * 0.016)); set(L.rush.fl.frequency, 800 + sp * 300); if (L.rush.pan.pan) set(L.rush.pan.pan, lee * Math.min(0.6, Math.abs(b.phi) * 1.6));
    set(L.bubble.g.gain, Math.min(0.2, sp * 0.03));
    set(L.flap.g.gain, b.capsized ? 0 : Math.min(0.5, b.luff * aws * 0.045));
    // плеск о борт: на малом ходу слышен каждый
    if (t > nextLap) { nextLap = t + 0.5 + Math.random() * 1.7; const v = 0.05 + Math.min(0.1, sp * 0.02); noise(300 + Math.random() * 500, 1.4, 0.28 + Math.random() * 0.3, v, Math.random() * 1.6 - 0.8, 140 + Math.random() * 120); }
    // фал стучит по мачте, чаще в ветер и на качке
    if (t > nextClink) { nextClink = t + (0.25 + Math.random() * 2.2) * (9 / (3 + aws)); const f = 2300 + Math.random() * 500; tone(f, 0.09, 'triangle', 0.035, f * 0.96, 0.1); if (Math.random() < 0.4) setTimeout(() => tone(f * 1.01, 0.07, 'triangle', 0.02, undefined, 0.1), 70 + Math.random() * 50); }
    // рангоут поскрипывает, когда крен меняется рывком
    const dh = Math.abs(b.phi - lastHeel); lastHeel = b.phi; creakT -= 1;
    if (dh > 0.012 && creakT <= 0 && !b.capsized) { creakT = 25; tone(110 + Math.random() * 60, 0.28, 'sawtooth', 0.035, 85 + Math.random() * 30, -0.2); }
  }
  // мотор: две пилы с расстройкой через фильтр, обороты от газа и скорости; в воздухе винт «взвывает»
  let eng = null, sir = null;
  function engine(on, thr = 0, sp = 0, air = false) { if (!ctx || ctx.state !== 'running') return;
    if (!eng) { if (!on) return; const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.connect(g); g.connect(master);
      const os = [0, 1].map((i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50; o.detune.value = i * 14; o.connect(f); o.start(); return o; }); eng = { g, f, os }; }
    const rpm = on ? 0.25 + 0.5 * thr + 0.35 * sp + (air ? 0.35 : 0) : 0; set(eng.g.gain, on ? 0.05 + 0.11 * thr : 0, 0.15); for (const o of eng.os) set(o.frequency, 42 + rpm * 150, 0.08); set(eng.f.frequency, 350 + rpm * 1900, 0.1); }
  // сирена: двухтональная, тише с расстоянием
  function siren(on, far = 0) { if (!ctx || ctx.state !== 'running') return;
    if (!sir) { if (!on) return; const g = ctx.createGain(); g.gain.value = 0; g.connect(master); const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 700; const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.9; lg.gain.value = 260; l.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8; o.connect(f); f.connect(g); o.start(); l.start(); sir = { g }; }
    set(sir.g.gain, on ? 0.09 * (1 - 0.8 * far) : 0, 0.2); }
  // ---- параплан ----
  // Вариометр как у настоящего прибора: набор -- короткие писки, тем чаще и выше, чем сильнее; спуск сильнее 2.5 м/с --
  // низкий гудок. Поток: гул по воздушной скорости, в болтанку -- рывками; хлопок ткани при подсложении.
  // Вариометр -- музыкой, а не писком: мягкие синтезаторные колокольчики в реверберации, по одной ноте из аккорда.
  // В подъёме -- мажор (maj7, add9, 6/9, лидийский), в нисходящем потоке -- минор (m7, m9, sus). Каждый вход в поток --
  // вариометр -- музыкой: «Гимнопедия» Сати, мажор в подъёме и минор в снижении (см. music.js)
  let winchO = null, music = null;
  function vario(v, on = true) { if (!ctx || ctx.state !== 'running') return; (music ||= makeMusic(ctx, master)).update(v || 0, on); }
  function airflow(V, turb = 0, flap = 0, on = true) { if (!ctx || ctx.state !== 'running') return; const a = (on ? V : 0) * (music && music.playing ? 0.8 : 1), j = 1 + turb * 0.5 * Math.sin(ctx.currentTime * 23) * Math.sin(ctx.currentTime * 7.3);
    set(L.low.g.gain, Math.min(0.5, (0.02 + a * a * 0.0021) * j)); set(L.low.fl.frequency, 150 + a * 15); if (L.low.pan.pan) set(L.low.pan.pan, 0);
    set(L.mid.g.gain, Math.min(0.32, a * a * 0.0012 * j)); set(L.mid.fl.frequency, 380 + a * 40); set(L.whistle.g.gain, Math.min(0.1, Math.max(0, a - 12) ** 2 * 0.004), 0.25);
    set(L.rush.g.gain, 0); set(L.bubble.g.gain, 0); set(L.flap.g.gain, on ? Math.min(0.5, flap * 0.5) : 0); }
  function winch(on, k = 0) { if (!ctx || ctx.state !== 'running') return;
    if (!winchO) { if (!on) return; const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 90; f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.5; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start(); winchO = { o, g }; }
    set(winchO.g.gain, on ? 0.03 + 0.03 * k : 0, 0.2); set(winchO.o.frequency, 80 + 60 * k, 0.3); }
  // ---- пляж: Дымок пешком или лодка у берега ----
  // Прибой -- накат каждые 5-9 с (шипение, затихающее вниз), гомон людей рядом, треск костра, гитара у ночной
  // компании (переборы Am-F-C-G), чайки днём. Всё -- от расстояний, которые даёт берег, и тихо: фон, не музыка.
  let bch = null, nextWave = 0, nextGull = 0, nextCrack = 0, nextPick = 0, gStep = 0;
  const GUIT = [[220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2], [130.8, 196, 261.6, 329.6], [196, 246.9, 293.7, 392]];
  function pluck(f, v, pan) { if (!ctx) return; const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(), t = ctx.currentTime;
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.002; fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.6);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(fl); o.connect(fl); fl.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pn) { pn.pan.value = pan; g.connect(pn); pn.connect(master); } else g.connect(master); o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7); }
  // p: { water: м до воды, crowd: 0..N, fireD, guitD, day 0..1, on }
  function beach(p) { if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime;
    if (!bch) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.6; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 420; fl.Q.value = 1.6;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start(); // гомон: полоса голосов, «дышит» случайно
      const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = 3.1; lg.gain.value = 140; lf.connect(lg); lg.connect(fl.frequency); lf.start(); bch = { g }; }
    const on = p.on !== false, surf = on ? Math.max(0, 1 - (p.water || 0) / 45) : 0;
    set(bch.g.gain, on ? Math.min(0.07, p.crowd * 0.012) * (0.55 + 0.45 * (p.day ?? 1)) : 0, 0.5);
    if (!on) return;
    if (t > nextWave && surf > 0.02) { nextWave = t + 5 + Math.random() * 4; const v = 0.05 + 0.13 * surf; noise(900, 0.5, 2.6, v, (Math.random() - 0.5) * 0.6, 260); setTimeout(() => noise(3000, 0.6, 1.8, v * 0.35, 0, 900), 500); }
    if (t > nextGull && (p.day ?? 1) > 0.5 && surf > 0.1) { nextGull = t + 9 + Math.random() * 18; const f = 1500 + Math.random() * 500, pan = Math.random() * 1.6 - 0.8;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) setTimeout(() => tone(f, 0.22, 'triangle', 0.025, f * 0.72, pan), i * 260); }
    const fk = Math.max(0, 1 - (p.fireD ?? 1e9) / 18); if (fk > 0 && t > nextCrack) { nextCrack = t + 0.05 + Math.random() * 0.35 / fk; noise(2500 + Math.random() * 3000, 2, 0.04, 0.05 * fk, (Math.random() - 0.5) * 0.4); }
    const gk = Math.max(0, 1 - (p.guitD ?? 1e9) / 35); if (gk > 0 && t > nextPick) { const ch = GUIT[Math.floor(gStep / 8) % 4], idx = [0, 1, 2, 3, 2, 1, 2, 3][gStep % 8]; gStep++; nextPick = t + 0.28; pluck(ch[idx], 0.07 * gk * gk, 0.2); } }
  // находка: нота серии -- выше с каждой (пентатоника), редкое -- арпеджио и блеск
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function find(tier = 0, combo = 1) { const base = 659 * Math.pow(2, PENTA[Math.min(PENTA.length - 1, combo - 1)] / 12);
    tone(base, 0.18, 'sine', 0.1); setTimeout(() => tone(base * 1.5, 0.3, 'sine', 0.08), 70);
    if (tier >= 4) [1, 1.26, 1.5, 2, 2.52].forEach((k, i) => setTimeout(() => tone(523 * k * (tier >= 6 ? 1.5 : 1), 0.5, 'triangle', 0.09), 160 + i * 90));
    noise(7000, 1.2, 0.35, 0.03, 0, 10000); }
  // пешком: лодочные шумы (поток, плеск о борт, парус) стихают, остаётся лёгкий ветер
  function foot(wind = 4) { if (!ctx || ctx.state !== 'running') return; set(L.low.g.gain, 0.02 + wind * wind * 0.0008, 0.4); set(L.mid.g.gain, wind * wind * 0.0004, 0.4); for (const k of ['whistle', 'rush', 'bubble', 'flap']) set(L[k].g.gain, 0, 0.3); }
  // реактивный: рёв (шум через фильтр, громче и ярче с тягой) и свист турбины (тон растёт с оборотами)
  let jt = null;
  function jet(thr = 0, V = 0, on = true) { if (!ctx || ctx.state !== 'running') return;
    if (!jt) { if (!on) return; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400; const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start();
      const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = 2000; of.type = 'bandpass'; of.frequency.value = 3000; of.Q.value = 3; og.gain.value = 0; o.connect(of); of.connect(og); og.connect(master); o.start(); jt = { g, fl, og, o }; }
    const k = on ? thr : 0; set(jt.g.gain, on ? 0.04 + 0.2 * k : 0, 0.3); set(jt.fl.frequency, 300 + 1500 * k + V * 3, 0.3); set(jt.og.gain, on ? 0.008 + 0.025 * k : 0, 0.4); set(jt.o.frequency, 1800 + 2600 * k, 0.8); }
  return {
    start, update, engine, siren, vario, airflow, winch, beach, find, foot, jet,
    plop(p = 1) { noise(700, 1.2, 0.5, 0.3 * p, 0, 180); tone(300, 0.15, 'sine', 0.12 * p, 120); },
    paddle() { noise(900 + Math.random() * 400, 1, 0.22, 0.04, (Math.random() - 0.5) * 0.4, 400); },
    shake() { for (let i = 0; i < 6; i++) setTimeout(() => noise(3500, 1.5, 0.07, 0.05, i % 2 ? 0.4 : -0.4), i * 45); },
    purr() { tone(48, 0.9, 'sawtooth', 0.04, 44); },
    mew(sad) { tone(sad ? 700 : 900, 0.35, 'triangle', 0.05, sad ? 450 : 1300); },
    pop(p = 1) { noise(260, 0.9, 0.35, 0.5 * p, 0, 90); tone(70, 0.3, 'sine', 0.35 * p, 40); },
    gust(p = 1) { noise(500, 0.7, 1.2, 0.22 * p, (Math.random() - 0.5) * 0.8, 1700); noise(180, 0.8, 0.9, 0.18 * p, 0, 90); },
    rustle(p = 1) { noise(1800, 0.6, 0.6, 0.12 * p, 0, 500); },
    stroke(q = 1) { noise(500 + 500 * q, 0.9, 0.3, 0.05 + 0.07 * q, 0, 200); },
    slap(p = 1) { noise(900, 0.7, 0.55, 0.3 * p, 0, 240); noise(3200, 0.8, 0.9, 0.12 * p, 0, 1500); },
    thump(p = 1) { tone(95, 0.35, 'sine', 0.5 * p, 38); noise(700, 0.8, 0.25, 0.35 * p); },
    splash(p = 1) { noise(1500, 0.5, 1.4, 0.55 * p, 0, 300); noise(4000, 0.7, 1.8, 0.2 * p, 0, 1200); },
    beep(hi) { tone(hi ? 1175 : 784, hi ? 0.5 : 0.12, 'square', 0.1); },
    horn() { tone(220, 1.1, 'sawtooth', 0.16); tone(277, 1.1, 'sawtooth', 0.12); },
    // вылет с доски: «бдыщ» и «уиии» вверх-вниз, как в мультике
    whee(p = 1) { tone(160, 0.3, 'sine', 0.45 * p, 520); setTimeout(() => { tone(420, 0.55, 'triangle', 0.13 * p, 1500); setTimeout(() => tone(1500, 0.8, 'triangle', 0.11 * p, 260), 520); }, 90); },
    // подзорная труба: латунь выдвигается (шорох по нарастающей и щелчок), тиканье наводки, находка -- звон
    spy(on) { noise(on ? 500 : 1400, 1.4, 0.32, 0.07, 0, on ? 1600 : 450); setTimeout(() => tone(on ? 1900 : 1500, 0.03, 'triangle', 0.06), on ? 290 : 200); },
    tick(f = 1200, v = 0.025) { tone(f, 0.025, 'triangle', v); },
    spyKnown() { tone(1320, 0.12, 'sine', 0.07); },
    spyFound(r = 1) { const n = [784, 988, 1175, 1568, 1976].slice(0, 2 + r); n.forEach((fq, i) => setTimeout(() => tone(fq, 0.35, 'sine', 0.11), i * 85)); setTimeout(() => noise(6000, 1.2, 0.5, 0.05, 0, 9000), 60); },
    chime() { tone(784, 0.25, 'sine', 0.14); setTimeout(() => tone(1175, 0.4, 'sine', 0.14), 110); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.75; return muted; },
  };
}
