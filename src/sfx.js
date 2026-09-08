// Zvukové efekty cez Web Audio API – syntéza, žiadne súbory.
// Všetko je krátke a tiché (deti + rodičia). Mute sa pamätá v localStorage.
//
// Signálová cesta: hlas → (dry + reverb send) → kompresor → master → výstup.
// Kompresor je dôležitý: pri plošných efektoch (AoE) hrá naraz 6+ hlasov a
// bez neho sa amplitúdy sčítajú do klipovania.

const Sfx = (() => {
  let ctx = null, master = null, dry = null, wet = null;
  let muted = localStorage.getItem("arena.muted") === "1";

  // Krátky umelý dozvuk – šum s exponenciálnym doznením.
  function impulse(c, dur, decay) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function build(c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master = c.createGain();
    master.gain.value = muted ? 0 : 0.9;
    comp.connect(master).connect(c.destination);
    dry = c.createGain();
    dry.gain.value = 1;
    dry.connect(comp);
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 0.45, 2.6);
    wet = c.createGain();
    wet.gain.value = 0.2;
    wet.connect(conv).connect(comp);
  }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      build(ctx);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Hlas ide do sucha aj do dozvuku; reverb sa dá per-zvuk stlmiť (send).
  function route(node, send) {
    node.connect(dry);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s).connect(wet);
    }
  }

  // Náhodné rozladenie – ten istý zvuk 20× za boj inak omrzí.
  const vary = (f, pct) => f * (1 + (Math.random() * 2 - 1) * pct);

  // Tón s obálkou; slide = koncová frekvencia (kĺzanie).
  // unison = druhý oscilátor rozladený o ±`unison` centov (hrubší zvuk),
  // vib = hĺbka vibráta v Hz, attack = nábeh (bez neho zvuk lupne).
  function tone(freq, dur, opts = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const {
      type = "sine", vol = 0.15, slide = null, delay = 0, unison = 0,
      vib = 0, vibRate = 6, attack = 0.008, send = 0.25, jitter = 0,
    } = opts;
    const t0 = c.currentTime + delay;
    const f0 = jitter ? vary(freq, jitter) : freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    route(g, send);
    const voices = unison ? [-unison, unison] : [0];
    for (const cents of voices) {
      const osc = c.createOscillator();
      osc.type = type;
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(f0, t0);
      if (slide !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
      if (vib) {
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = vibRate;
        lg.gain.value = vib;
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.02);
      }
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }

  // Šum s filtrom; cutoffTo = koniec preladenia filtra (whoosh / sweep).
  function noise(dur, opts = {}) {
    if (muted) return;
    const c = ac();
    if (!c) return;
    const {
      vol = 0.2, delay = 0, cutoff = 800, cutoffTo = null,
      type = "lowpass", q = 1, send = 0.25, attack = 0.005,
    } = opts;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff, t0);
    if (cutoffTo !== null) f.frequency.exponentialRampToValueAtTime(Math.max(cutoffTo, 20), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g);
    route(g, send);
    src.start(t0);
  }

  // Rýchly rozklad akordu – základ „magických“ zvukov.
  function arp(freqs, opts = {}) {
    const { step = 0.06, dur = 0.14, type = "triangle", vol = 0.11, delay = 0, send = 0.35 } = opts;
    freqs.forEach((f, i) => tone(f, dur, { type, vol, delay: delay + i * step, send }));
  }

  // Zvuky kúziel podľa fx.type – každé kúzlo znie inak.
  const SPELLS = {
    buffTarget() { arp([523, 659, 784, 1047], { step: 0.05, vol: 0.1 }); },
    buffAllFriends() {
      noise(0.5, { vol: 0.16, cutoff: 300, cutoffTo: 2600, type: "bandpass", q: 1.6, send: 0.5 });
      arp([392, 523, 659, 784], { step: 0.07, dur: 0.3, vol: 0.09, send: 0.5 });
    },
    dmgBoost() {
      noise(0.16, { vol: 0.14, cutoff: 2400, cutoffTo: 6000, type: "highpass", q: 3 });
      tone(1200, 0.18, { type: "square", vol: 0.08, slide: 300, unison: 12 });
    },
    bolt() {
      noise(0.09, { vol: 0.3, cutoff: 6000, cutoffTo: 1200, type: "highpass", q: 1 });
      tone(180, 0.45, { type: "sawtooth", vol: 0.16, slide: 45, unison: 9, send: 0.5 });
    },
    hex() {
      tone(760, 0.35, { type: "triangle", vol: 0.12, slide: 150, vib: 22, vibRate: 11 });
      tone(220, 0.2, { type: "sine", vol: 0.12, slide: 520, delay: 0.3 }); // bublina
    },
    // ovčia premena: „béé“ – sawtooth s rýchlym vibrátom, klesá
    polymorph() {
      noise(0.15, { vol: 0.1, cutoff: 600, cutoffTo: 2500, type: "bandpass", q: 2 });
      tone(470, 0.42, { type: "sawtooth", vol: 0.1, slide: 330, vib: 28, vibRate: 13, unison: 6, delay: 0.1, send: 0.4 });
    },
    silence() {
      noise(0.5, { vol: 0.2, cutoff: 3200, cutoffTo: 120, type: "lowpass", q: 4, send: 0.1 });
      tone(300, 0.4, { type: "sine", vol: 0.07, slide: 90, send: 0.1 });
    },
    transform() {
      noise(0.2, { vol: 0.14, cutoff: 700, cutoffTo: 4000, type: "bandpass", q: 2 });
      arp([659, 880, 1175, 1568], { step: 0.045, dur: 0.16, vol: 0.09, send: 0.5 });
    },
    copyToDeck() {
      tone(880, 0.3, { type: "sine", vol: 0.1, unison: 14, send: 0.5 });
      tone(1320, 0.3, { type: "sine", vol: 0.07, unison: 14, delay: 0.07, send: 0.5 });
    },
    discover() {
      noise(0.28, { vol: 0.13, cutoff: 900, cutoffTo: 3200, type: "bandpass", q: 1.2 });
      arp([784, 988, 1319], { step: 0.08, dur: 0.22, vol: 0.09, send: 0.5 });
    },
    // hviezdna moc: veľká fanfára + trblietavý dozvuk
    starPower() {
      noise(0.6, { vol: 0.12, cutoff: 400, cutoffTo: 5000, type: "bandpass", q: 1.2, send: 0.6 });
      arp([523, 659, 784, 1047, 1319], { step: 0.07, dur: 0.35, vol: 0.11, send: 0.6 });
      tone(1568, 0.5, { type: "sine", vol: 0.08, unison: 12, delay: 0.35, send: 0.7 });
    },
    // mince: rovnaký cinkot ako kúpa, len hlasnejší
    gold() {
      tone(880, 0.08, { type: "square", vol: 0.1 });
      tone(1320, 0.14, { type: "square", vol: 0.1, delay: 0.07 });
      tone(1760, 0.18, { type: "square", vol: 0.08, delay: 0.14 });
    },
  };
  SPELLS.goldLater = SPELLS.gold;

  return {
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem("arena.muted", muted ? "1" : "0");
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    // úder karty do karty – zakaždým mierne iná výška
    hit() {
      noise(0.12, { vol: 0.25, cutoff: 900, cutoffTo: 300 });
      tone(140, 0.13, { type: "square", vol: 0.12, slide: 70, jitter: 0.07 });
    },
    // smrť príšerky
    die() {
      tone(320, 0.3, { type: "sawtooth", vol: 0.1, slide: 60, jitter: 0.06, unison: 8 });
      noise(0.25, { vol: 0.1, cutoff: 1200, cutoffTo: 200, delay: 0.05 });
    },
    // buff / heal
    buff() {
      tone(520, 0.1, { type: "sine", vol: 0.1 });
      tone(780, 0.14, { type: "sine", vol: 0.1, delay: 0.06 });
    },
    // projektil / magický zásah
    zap() {
      tone(700, 0.18, { type: "sawtooth", vol: 0.12, slide: 120, jitter: 0.05 });
    },
    // vyvolanie tokenu
    summon() {
      tone(300, 0.08, { type: "triangle", vol: 0.1, slide: 500 });
      noise(0.18, { vol: 0.08, cutoff: 400, cutoffTo: 1800, type: "bandpass", q: 1.5 });
    },
    // evolve – trojtónová fanfárka
    evolve() {
      arp([523, 659, 784], { step: 0.1, dur: 0.16, vol: 0.14 });
      tone(1047, 0.3, { type: "triangle", vol: 0.14, delay: 0.2, send: 0.5 });
    },
    // kúpa / predaj
    coin() {
      tone(880, 0.07, { type: "square", vol: 0.08, jitter: 0.03 });
      tone(1320, 0.12, { type: "square", vol: 0.08, delay: 0.06, jitter: 0.03 });
    },
    // damage hrdinu
    hero() {
      noise(0.3, { vol: 0.3, cutoff: 400, cutoffTo: 120, send: 0.5 });
      tone(90, 0.4, { type: "square", vol: 0.16, slide: 40, unison: 10, send: 0.5 });
    },
    // švih pri zoslaní kúzla (znie pred konkrétnym efektom)
    cast() {
      noise(0.26, { vol: 0.14, cutoff: 500, cutoffTo: 3000, type: "bandpass", q: 1.4, send: 0.4 });
    },
    // konkrétny efekt kúzla podľa fx.type
    spell(kind) {
      const f = SPELLS[kind];
      if (f) f.call(this);
      else this.buff();
    },
    // božský štít praskol
    shieldPop() {
      tone(1400, 0.12, { type: "sine", vol: 0.12, slide: 2600 });
      noise(0.18, { vol: 0.12, cutoff: 3000, cutoffTo: 900, type: "highpass", q: 2 });
    },
    // fénixovo pierko / návrat zo smrti
    revive() {
      arp([392, 523, 659, 880], { step: 0.07, dur: 0.28, vol: 0.1, send: 0.5 });
    },
    // umlčanie
    silence() { SPELLS.silence.call(this); },
    // premena na žabu
    hex() { SPELLS.hex.call(this); },
    // ogrí chaos – opitý úder
    drunk() {
      tone(180, 0.4, { type: "sawtooth", vol: 0.12, slide: 90, vib: 18, vibRate: 5 });
      noise(0.2, { vol: 0.14, cutoff: 700, cutoffTo: 200 });
    },
    // zmrazenie karty v obchode
    freeze() {
      tone(2200, 0.3, { type: "sine", vol: 0.07, slide: 1400, send: 0.5 });
      noise(0.3, { vol: 0.08, cutoff: 5000, cutoffTo: 2500, type: "highpass", q: 2, send: 0.5 });
    },
    // objavenie kariet (kniha)
    discover() { SPELLS.discover.call(this); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.15, delay: i * 0.14, send: 0.4 }));
    },
    lose() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.25, { type: "sawtooth", vol: 0.08, delay: i * 0.2, unison: 8 }));
    },
  };
})();

if (typeof module !== "undefined") module.exports = Sfx;
