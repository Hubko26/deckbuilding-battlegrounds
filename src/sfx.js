// Zvukové efekty cez Web Audio API – syntéza, žiadne súbory.
// Všetko je krátke a tiché (deti + rodičia). Mute sa pamätá v localStorage.

const Sfx = (() => {
  let ctx = null;
  let muted = localStorage.getItem("arena.muted") === "1";

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Tón s obálkou; slide = koncová frekvencia (kĺzanie).
  function tone(freq, dur, { type = "sine", vol = 0.15, slide = null, delay = 0 } = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Krátky šum (náraz).
  function noise(dur, { vol = 0.2, delay = 0, cutoff = 800 } = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  return {
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem("arena.muted", muted ? "1" : "0");
      return muted;
    },
    // úder karty do karty
    hit() {
      noise(0.12, { vol: 0.25, cutoff: 900 });
      tone(140, 0.13, { type: "square", vol: 0.12, slide: 70 });
    },
    // smrť príšerky
    die() {
      tone(320, 0.3, { type: "sawtooth", vol: 0.1, slide: 60 });
    },
    // buff / heal
    buff() {
      tone(520, 0.1, { type: "sine", vol: 0.1 });
      tone(780, 0.14, { type: "sine", vol: 0.1, delay: 0.06 });
    },
    // vyvolanie tokenu
    summon() {
      tone(300, 0.08, { type: "triangle", vol: 0.1, slide: 500 });
    },
    // evolve – trojtónová fanfárka
    evolve() {
      tone(523, 0.12, { type: "triangle", vol: 0.14 });
      tone(659, 0.12, { type: "triangle", vol: 0.14, delay: 0.1 });
      tone(784, 0.22, { type: "triangle", vol: 0.16, delay: 0.2 });
    },
    // kúpa / predaj
    coin() {
      tone(880, 0.07, { type: "square", vol: 0.08 });
      tone(1320, 0.12, { type: "square", vol: 0.08, delay: 0.06 });
    },
    // damage hrdinu
    hero() {
      noise(0.3, { vol: 0.3, cutoff: 400 });
      tone(90, 0.4, { type: "square", vol: 0.16, slide: 40 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.15, delay: i * 0.14 }));
    },
    lose() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.25, { type: "sawtooth", vol: 0.08, delay: i * 0.2 }));
    },
  };
})();

if (typeof module !== "undefined") module.exports = Sfx;
