// Spooky sound cues, generated in code with the Web Audio API.
// No audio files and nothing downloaded: every sound is built from
// oscillators and filtered noise, played through a generated "crypt" reverb.
// Sound is OFF until the user turns it on, and browsers only allow audio
// after a click anyway.

let A = null;
let M = null;
let R = null;
let windStop = null;

function ctx() {
  if (!A) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    A = new AC();
    const comp = A.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(A.destination);
    M = A.createGain();
    M.gain.value = 0.7; // keep it low: this is an office tool
    M.connect(comp);
    // Reverb: a decaying burst of noise as the "room".
    R = A.createConvolver();
    const len = A.sampleRate * 3.2;
    const b = A.createBuffer(2, len, A.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    R.buffer = b;
    const rg = A.createGain();
    rg.gain.value = 0.55;
    R.connect(rg);
    rg.connect(comp);
  }
  if (A.state === 'suspended') A.resume();
  return A;
}

function bus(pan = 0, wet = 0.6) {
  const c = A;
  const g = c.createGain();
  g.gain.value = 0;
  const p = c.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(M);
  const s = c.createGain();
  s.gain.value = wet;
  p.connect(s);
  s.connect(R);
  return { g, p };
}

function noise(secs) {
  const b = A.createBuffer(1, A.sampleRate * secs, A.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = A.createBufferSource();
  s.buffer = b;
  return s;
}

function env(g, t, a, h, r, peak) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
}

function osc(type, f, t, dur, dest, gain) {
  const o = A.createOscillator();
  const g = A.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.value = gain;
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur);
  return o;
}

function creakLayer(t, base, pan, v) {
  const b = bus(pan);
  const o = A.createOscillator();
  const f = A.createBiquadFilter();
  const lfo = A.createOscillator();
  const lg = A.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * 2.1, t + 0.9);
  o.frequency.linearRampToValueAtTime(base * 1.3, t + 2);
  lfo.frequency.setValueAtTime(14, t);
  lfo.frequency.linearRampToValueAtTime(26, t + 2);
  lg.gain.value = base * 0.4;
  lfo.connect(lg);
  lg.connect(o.frequency);
  f.type = 'bandpass';
  f.frequency.value = base * 12;
  f.Q.value = 7;
  o.connect(f);
  f.connect(b.g);
  env(b.g, t, 0.2, 1.5, 0.5, v);
  o.start(t);
  lfo.start(t);
  o.stop(t + 2.4);
  lfo.stop(t + 2.4);
}

const cues = {
  /** HELD: a heavy crypt door creaks open. */
  held() {
    const t = A.currentTime + 0.02;
    creakLayer(t, 62, -0.3, 0.22);
    creakLayer(t + 0.15, 91, 0.35, 0.12);
  },
  /** A count was sealed: wax sizzle, then a stone thunk. */
  seal() {
    const t = A.currentTime + 0.02;
    const n = noise(0.6);
    const hp = A.createBiquadFilter();
    const b = bus(0.15, 0.3);
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    n.connect(hp);
    hp.connect(b.g);
    env(b.g, t, 0.02, 0.25, 0.3, 0.12);
    n.start(t);
    const b2 = bus(0, 0.7);
    const o = A.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t + 0.55);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.75);
    o.connect(b2.g);
    env(b2.g, t + 0.55, 0.005, 0.03, 0.45, 0.7);
    o.start(t + 0.55);
    o.stop(t + 1.2);
  },
  /** SEIZED: organ chord, a ghost moan drifting left to right, thunder. */
  seized() {
    const t = A.currentTime + 0.02;
    const b = bus(0, 0.8);
    const f = A.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(2200, t + 0.6);
    f.frequency.linearRampToValueAtTime(900, t + 3);
    f.connect(b.g);
    env(b.g, t, 0.06, 1.6, 1.6, 0.22);
    [[55, 1], [65.4, 0.9], [82.4, 0.8], [98, 0.6], [110, 0.5], [130.8, 0.35]].forEach(([n, w]) => {
      [-6, 0, 7].forEach((det) => {
        const o = osc('sawtooth', n, t, 3.4, f, 0.05 * w);
        o.detune.value = det;
      });
    });
    const gb = bus(-0.8, 1);
    const go = A.createOscillator();
    const vib = A.createOscillator();
    const vg = A.createGain();
    const fo = A.createBiquadFilter();
    go.type = 'triangle';
    go.frequency.setValueAtTime(330, t + 0.6);
    go.frequency.linearRampToValueAtTime(520, t + 1.6);
    go.frequency.linearRampToValueAtTime(260, t + 3.2);
    vib.frequency.value = 5.5;
    vg.gain.value = 9;
    vib.connect(vg);
    vg.connect(go.frequency);
    fo.type = 'bandpass';
    fo.frequency.value = 700;
    fo.Q.value = 3;
    go.connect(fo);
    fo.connect(gb.g);
    env(gb.g, t + 0.6, 0.5, 1.4, 1, 0.16);
    gb.p.pan.setValueAtTime(-0.8, t + 0.6);
    gb.p.pan.linearRampToValueAtTime(0.8, t + 3.4);
    go.start(t + 0.6);
    vib.start(t + 0.6);
    go.stop(t + 3.6);
    vib.stop(t + 3.6);
    const n = noise(4);
    const lp = A.createBiquadFilter();
    const tb = bus(0.2, 0.9);
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    n.connect(lp);
    lp.connect(tb.g);
    env(tb.g, t + 0.9, 0.05, 0.3, 2.6, 0.9);
    n.start(t + 0.9);
  },
  /** CLEARED: a midnight bell with a soft choir. */
  cleared() {
    const t = A.currentTime + 0.02;
    const b = bus(0, 0.9);
    env(b.g, t, 0.005, 0.05, 4, 0.28);
    [[220, 1], [440, 0.5], [528, 0.35], [654, 0.25], [880, 0.15], [1176, 0.08]].forEach(([f, w]) => osc('sine', f, t, 4.2, b.g, w));
    const cb = bus(0, 0.9);
    env(cb.g, t + 0.2, 1, 1.5, 1.5, 0.09);
    [196, 246.9, 293.7].forEach((n, i) => {
      const o = A.createOscillator();
      const f = A.createBiquadFilter();
      const g = A.createGain();
      o.type = 'sawtooth';
      o.frequency.value = n;
      o.detune.value = (i - 1) * 6;
      f.type = 'bandpass';
      f.frequency.value = 800;
      f.Q.value = 4;
      g.gain.value = 0.3;
      o.connect(f);
      f.connect(g);
      g.connect(cb.g);
      o.start(t + 0.2);
      o.stop(t + 4.4);
    });
  },
  /** AI reading saved: a crystal-ball shimmer. */
  crystal() {
    const t = A.currentTime + 0.02;
    [1046.5, 1318.5, 1568, 2093, 2637].forEach((n, i) => {
      const s = t + i * 0.09;
      const b = bus((i - 2) * 0.35, 1);
      env(b.g, s, 0.01, 0.1, 1.6, 0.07);
      osc('sine', n, s, 1.9, b.g, 1);
    });
  },
};

/** Play one named cue. Silently does nothing if audio is unavailable. */
export function play(name) {
  try {
    if (!ctx() || !cues[name]) return;
    cues[name]();
  } catch {
    /* sound is decoration: never let it break the panel */
  }
}

/** Haunted mode: quiet night wind, looped until stopped. */
export function startWind() {
  try {
    if (!ctx() || windStop) return;
    const n = noise(8);
    n.loop = true;
    const f = A.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    const lfo = A.createOscillator();
    const lg = A.createGain();
    lfo.frequency.value = 0.12;
    lg.gain.value = 220;
    f.frequency.value = 480;
    lfo.connect(lg);
    lg.connect(f.frequency);
    const b = bus(0, 0.4);
    n.connect(f);
    f.connect(b.g);
    b.g.gain.linearRampToValueAtTime(0.07, A.currentTime + 2);
    n.start();
    lfo.start();
    windStop = () => {
      b.g.gain.linearRampToValueAtTime(0, A.currentTime + 1);
      setTimeout(() => {
        n.stop();
        lfo.stop();
      }, 1100);
      windStop = null;
    };
  } catch {
    /* ignore */
  }
}

export function stopWind() {
  if (windStop) windStop();
}
