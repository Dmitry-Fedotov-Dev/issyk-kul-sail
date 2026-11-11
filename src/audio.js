// Звук целиком синтезируется WebAudio, файлов нет. Задача -- присутствие: ветер дует с той стороны, откуда он
// на самом деле приходит, свистит в снастях в порыв, вода журчит вдоль борта, плещет в скулу, фал стучит по мачте.
export function makeAudio() {
  let ctx = null, master, muted = false, L = {}, buf, nextLap = 0, nextClink = 0, lastHeel = 0, creakT = 0;
  function start() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
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
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g);
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
  return {
    start, update, engine, siren,
    stroke(q = 1) { noise(500 + 500 * q, 0.9, 0.3, 0.05 + 0.07 * q, 0, 200); },
    slap(p = 1) { noise(900, 0.7, 0.55, 0.3 * p, 0, 240); noise(3200, 0.8, 0.9, 0.12 * p, 0, 1500); },
    thump(p = 1) { tone(95, 0.35, 'sine', 0.5 * p, 38); noise(700, 0.8, 0.25, 0.35 * p); },
    splash(p = 1) { noise(1500, 0.5, 1.4, 0.55 * p, 0, 300); noise(4000, 0.7, 1.8, 0.2 * p, 0, 1200); },
    beep(hi) { tone(hi ? 1175 : 784, hi ? 0.5 : 0.12, 'square', 0.1); },
    horn() { tone(220, 1.1, 'sawtooth', 0.16); tone(277, 1.1, 'sawtooth', 0.12); },
    chime() { tone(784, 0.25, 'sine', 0.14); setTimeout(() => tone(1175, 0.4, 'sine', 0.14), 110); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.75; return muted; },
  };
}
