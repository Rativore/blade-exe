/* ============================================================================
 * BLADE.EXE — js/audio.js — BladeAudio
 * ----------------------------------------------------------------------------
 * Synthèse WebAudio pure (oscillateurs + gain + bruit filtré), zéro fichier
 * audio externe. Silencieux si l'API WebAudio est indisponible (ex : Node).
 * API (contrat) : init(), play(name), setMuted(b), .muted
 * ========================================================================== */

var BladeAudio = (function () {
  "use strict";

  var hasAudio = (typeof window !== "undefined") &&
    (typeof window.AudioContext === "function" || typeof window.webkitAudioContext === "function");

  var ctx = null;
  var master = null;
  var muted = false;

  function init() {
    if (!hasAudio || ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    // iOS : router l'audio en session « playback » pour que le commutateur
    // silencieux physique ne coupe pas le WebAudio (iOS 17+, sans effet ailleurs)
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = "playback";
      }
    } catch (err) {}
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      resume();
    } catch (err) {
      ctx = null;
      master = null;
    }
  }

  function resume() {
    // iOS peut mettre le contexte en "suspended" OU "interrupted"
    if (ctx && ctx.state !== "running" && typeof ctx.resume === "function") {
      ctx.resume();
    }
  }

  // Déblocage historique iOS : jouer un échantillon muet DANS le geste
  var unlocked = false;
  function playSilentBuffer() {
    if (!ctx || unlocked) return;
    try {
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      unlocked = true;
    } catch (err) {}
  }

  function debugInfo() {
    if (!hasAudio) return "audio: API WebAudio absente";
    if (!ctx) return "audio: en attente du premier toucher";
    return "audio: " + ctx.state + " · " + ctx.sampleRate + "Hz" +
      (muted ? " · muet" : "") + (unlocked ? " · déverrouillé" : "");
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  // ---------------------------------------------------------------- primitives
  function tone(freq, dur, opts) {
    if (!ctx) return;
    opts = opts || {};
    var t = (opts.time != null) ? opts.time : now();
    var dest = opts.dest || master;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.toFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t + dur);
    }
    var peak = (opts.gain != null) ? opts.gain : 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  function noiseBurst(dur, opts) {
    if (!ctx) return;
    opts = opts || {};
    var t = (opts.time != null) ? opts.time : now();
    var dest = opts.dest || master;
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filterType || "bandpass";
    filt.frequency.value = opts.freq || 1200;
    filt.Q.value = opts.q != null ? opts.q : 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain != null ? opts.gain : 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t);
  }

  // ---------------------------------------------------------------- sound bank
  var SOUNDS = {
    slice: function () {
      tone(1400, 0.09, { type: "triangle", toFreq: 2600, gain: 0.35, attack: 0.002 });
      noiseBurst(0.06, { freq: 3000, q: 0.6, gain: 0.15 });
    },
    wrong: function () {
      tone(180, 0.16, { type: "square", toFreq: 90, gain: 0.3 });
    },
    virus: function () {
      tone(90, 0.32, { type: "sawtooth", toFreq: 40, gain: 0.4 });
      noiseBurst(0.26, { freq: 500, q: 0.5, gain: 0.3 });
    },
    miss: function () {
      tone(500, 0.28, { type: "sawtooth", toFreq: 80, gain: 0.3 });
    },
    wave: function () {
      tone(660, 0.1, { type: "sine", gain: 0.3 });
      setTimeout(function () { tone(880, 0.14, { type: "sine", gain: 0.3 }); }, 90);
    },
    slowmo: function () {
      tone(1200, 0.35, { type: "sine", toFreq: 300, gain: 0.22 });
    },
    boss: function () {
      tone(120, 0.5, { type: "sawtooth", gain: 0.35 });
      tone(121, 0.5, { type: "sawtooth", gain: 0.2 });
    },
    bossDone: function () {
      tone(523.25, 0.18, { type: "triangle", gain: 0.35 });
      setTimeout(function () { tone(659.25, 0.18, { type: "triangle", gain: 0.35 }); }, 100);
      setTimeout(function () { tone(783.99, 0.32, { type: "triangle", gain: 0.35 }); }, 200);
    },
    over: function () {
      tone(300, 0.5, { type: "sawtooth", toFreq: 60, gain: 0.35 });
    },
    dailyWin: function () {
      tone(523.25, 0.15, { type: "triangle", gain: 0.35 });
      setTimeout(function () { tone(659.25, 0.15, { type: "triangle", gain: 0.35 }); }, 90);
      setTimeout(function () { tone(783.99, 0.15, { type: "triangle", gain: 0.35 }); }, 180);
      setTimeout(function () { tone(1046.5, 0.4, { type: "triangle", gain: 0.42 }); }, 270);
      noiseBurst(0.4, { freq: 6500, q: 0.5, gain: 0.15, filterType: "highpass" });
    },
    click: function () {
      tone(700, 0.05, { type: "sine", gain: 0.2 });
    }
  };

  function play(name) {
    if (!hasAudio || muted) return;
    if (!ctx) init();
    if (!ctx) return;
    resume();
    var fn = SOUNDS[name];
    if (fn) fn();
  }

  function setMuted(b) {
    muted = !!b;
    if (master) master.gain.value = muted ? 0 : 0.6;
  }

  // ============================================================== musique
  // Boucle procédurale hyperpop/glitchcore ~160 BPM, 4 mesures, scheduler
  // setInterval (lookahead) + AudioContext.currentTime. Zéro fichier externe.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var BPM = 160;
  var BEAT_DUR = 60 / BPM;
  var STEP16_DUR = BEAT_DUR / 4;
  var STEPS_PER_BAR = 16;
  var BARS_PER_LOOP = 4;
  var TOTAL_STEPS = STEPS_PER_BAR * BARS_PER_LOOP;
  var LOOKAHEAD_MS = 25;
  var SCHED_AHEAD = 0.12;

  var LEAD_ROOT = 220;   // A3
  var BASS_ROOT = 55;    // A1
  // gamme mineure naturelle (offsets en demi-tons), arpège 16 pas / mesure
  var LEAD_STEPS = [0, 3, 7, 10, 12, 10, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3];
  var GLITCH_BAR = BARS_PER_LOOP - 1;   // glitch de pitch ~1×/boucle
  var GLITCH_START = 12, GLITCH_LEN = 3;
  var GLITCH_OFFSETS = [19, -5, 24];

  // motifs de densité pré-calculés par RNG seedé (déterministe, pas Math.random)
  var planRng = mulberry32(20260722);
  var STUTTER_PLAN = [];
  (function () {
    for (var i = 0; i < TOTAL_STEPS; i++) {
      STUTTER_PLAN.push(planRng() < 0.22 ? (1 + Math.floor(planRng() * 3)) : 0);
    }
  })();
  var HAT_OFFBEAT_PLAN = [];
  (function () {
    for (var i = 0; i < STEPS_PER_BAR; i++) HAT_OFFBEAT_PLAN.push(planRng());
  })();

  var musicPlaying = false;
  var musicKind = "game";   // "game" | "menu"
  var musicTimer = null;
  var musicBus = null;      // volume musique (intensité)
  var musicLowpass = null;  // filtre global (ouvre avec l'intensité)
  var duckGain = null;      // pompe side-chain (bass)
  var intensity = 0;
  var currentStep = 0;
  var nextNoteTime = 0;

  function createMusicChain(kind) {
    musicBus = ctx.createGain();
    musicLowpass = ctx.createBiquadFilter();
    musicLowpass.type = "lowpass";
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(musicBus);
    musicBus.connect(musicLowpass);
    musicLowpass.connect(master);
    if (kind === "menu") {
      musicBus.gain.value = MENU_BUS_GAIN;
      musicLowpass.frequency.value = MENU_LOWPASS_FREQ;
      musicLowpass.Q.value = 0.6;
    } else if (kind === "inferno") {
      musicBus.gain.value = 0.44 + intensity * 0.16;
      musicLowpass.frequency.value = 900 + intensity * 7000;
      musicLowpass.Q.value = 0.7;
    } else if (kind === "toxic") {
      musicBus.gain.value = 0.40 + intensity * 0.18;
      musicLowpass.frequency.value = 1000 + intensity * 8000;
      musicLowpass.Q.value = 0.65;
    } else {
      musicBus.gain.value = 0.42 + intensity * 0.18;
      musicLowpass.frequency.value = 1200 + intensity * 9000;
      musicLowpass.Q.value = 0.7;
    }
  }

  function scheduleKick(t) {
    tone(150, 0.16, { type: "sine", toFreq: 42, gain: 0.9, attack: 0.001, dest: musicBus, time: t });
    if (duckGain) {
      try {
        duckGain.gain.cancelScheduledValues(t);
        duckGain.gain.setValueAtTime(1, t);
        duckGain.gain.setValueAtTime(0.12, t + 0.001);
        duckGain.gain.exponentialRampToValueAtTime(1, t + BEAT_DUR * 0.85);
      } catch (err) { /* noop */ }
    }
  }

  function scheduleBass(t, dur) {
    tone(BASS_ROOT, dur, { type: "sine", gain: 0.5, attack: 0.005, dest: duckGain, time: t });
  }

  function scheduleClap(t) {
    noiseBurst(0.12, { filterType: "bandpass", freq: 1600, q: 1.2, gain: 0.35, dest: musicBus, time: t });
    noiseBurst(0.05, { filterType: "highpass", freq: 2500, q: 0.8, gain: 0.15, dest: musicBus, time: t });
  }

  function scheduleHat(step, t) {
    var posInBar = step % STEPS_PER_BAR;
    var offbeat = (posInBar % 2) === 1;
    var density = 0.35 + intensity * 0.65;
    var playBase = !offbeat || (HAT_OFFBEAT_PLAN[posInBar] < density);
    if (playBase) {
      noiseBurst(0.03, { filterType: "highpass", freq: 8000 + intensity * 3000, q: 0.7, gain: 0.16, dest: musicBus, time: t });
    }
    var plan = STUTTER_PLAN[step];
    if (plan > 0) {
      var hits = Math.round(plan * intensity);
      for (var k = 1; k <= hits; k++) {
        var tt = t + k * (STEP16_DUR / 2);
        noiseBurst(0.016, { filterType: "highpass", freq: 9500, q: 0.9, gain: 0.11, dest: musicBus, time: tt });
      }
    }
  }

  function leadPluck(freq, t, dur, glitch) {
    if (!musicBus) return;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var g = ctx.createGain();
    o1.type = "sawtooth"; o2.type = "sawtooth";
    var det = glitch ? 55 : 9;
    o1.detune.setValueAtTime(-det, t);
    o2.detune.setValueAtTime(det, t);
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq, t);
    if (glitch) {
      o1.frequency.exponentialRampToValueAtTime(freq * 1.9, t + dur * 0.4);
      o2.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur * 0.4);
    }
    var peak = 0.16 + intensity * 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g); g.connect(musicBus);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function scheduleStep(step, t) {
    var posInBar = step % STEPS_PER_BAR;
    var bar = Math.floor(step / STEPS_PER_BAR) % BARS_PER_LOOP;
    if (posInBar % 4 === 0) {
      scheduleKick(t);
      scheduleBass(t, BEAT_DUR * 0.82);
    }
    if (posInBar === 4 || posInBar === 12) scheduleClap(t);
    scheduleHat(step, t);

    var semis = LEAD_STEPS[posInBar];
    var glitchNow = (bar === GLITCH_BAR) && (posInBar >= GLITCH_START) && (posInBar < GLITCH_START + GLITCH_LEN);
    if (glitchNow) semis += GLITCH_OFFSETS[posInBar - GLITCH_START];
    var freq = LEAD_ROOT * Math.pow(2, semis / 12);
    leadPluck(freq, t, STEP16_DUR * 0.9, glitchNow);
  }

  // ------------------------------------------------------ musique de menu
  // Nappe synthwave calme ~90 BPM, boucle de 8 mesures : pads saw détunés
  // (lowpass), arpège lent, sub discret. Aucune batterie agressive.
  var MENU_BPM = 90;
  var MENU_BEAT_DUR = 60 / MENU_BPM;
  var MENU_STEP_DUR = MENU_BEAT_DUR;        // granularité = la noire
  var MENU_STEPS_PER_BAR = 4;
  var MENU_BARS_PER_LOOP = 8;
  var MENU_TOTAL_STEPS = MENU_STEPS_PER_BAR * MENU_BARS_PER_LOOP;
  var MENU_BUS_GAIN = 0.22;                 // < volume du jeu (0.42..0.6)
  var MENU_LOWPASS_FREQ = 1500;
  var MENU_ROOT = 110;                      // A2 — référence pads/sub
  // progression i - VI - VII - i (Am - F - G - Am), 2 mesures par accord,
  // chaque accord = [root, tierce, quinte] en demi-tons depuis MENU_ROOT
  var MENU_CHORDS = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]];
  var MENU_ARP_PATTERN = [0, 1, 2, 1];      // indices dans l'accord courant

  function schedulePad(tones, t, dur) {
    if (!musicBus) return;
    for (var i = 0; i < tones.length; i++) {
      var freq = MENU_ROOT * Math.pow(2, tones[i] / 12);
      var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      var g = ctx.createGain();
      o1.type = "sawtooth"; o2.type = "sawtooth";
      o1.detune.setValueAtTime(-7, t); o2.detune.setValueAtTime(7, t);
      o1.frequency.setValueAtTime(freq, t); o2.frequency.setValueAtTime(freq, t);
      var peak = 0.06;
      var atk = Math.min(1.2, dur * 0.35), rel = Math.min(1.0, dur * 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + atk);
      g.gain.setValueAtTime(peak, t + dur - rel);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.connect(g); o2.connect(g); g.connect(musicBus);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }
  }

  function scheduleMenuArp(tones, step, t) {
    if (!musicBus) return;
    var idx = MENU_ARP_PATTERN[step % MENU_ARP_PATTERN.length];
    var semis = tones[idx % tones.length] + 12; // une octave au-dessus des pads
    var freq = MENU_ROOT * Math.pow(2, semis / 12);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    var peak = 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + MENU_STEP_DUR * 0.9);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + MENU_STEP_DUR + 0.05);
  }

  function scheduleMenuSub(tones, t) {
    if (!duckGain) return;
    var freq = (MENU_ROOT / 2) * Math.pow(2, tones[0] / 12);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    var peak = 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + MENU_BEAT_DUR * 3.2);
    o.connect(g); g.connect(duckGain);
    o.start(t); o.stop(t + MENU_BEAT_DUR * 3.3);
  }

  function scheduleMenuStep(step, t) {
    var posInBar = step % MENU_STEPS_PER_BAR;
    var bar = Math.floor(step / MENU_STEPS_PER_BAR) % MENU_BARS_PER_LOOP;
    var chordIdx = Math.floor(bar / 2) % MENU_CHORDS.length;
    var tones = MENU_CHORDS[chordIdx];
    if (posInBar === 0) {
      if (bar % 2 === 0) schedulePad(tones, t, MENU_BEAT_DUR * MENU_STEPS_PER_BAR * 2 - 0.05);
      scheduleMenuSub(tones, t);
    }
    scheduleMenuArp(tones, step, t);
  }

  // ------------------------------------------------- musique monde INFERNO.SYS
  // Industriel agressif ~150 BPM, 4 mesures : kick lourd 4/4 (pitch-drop
  // profond), basse saw distordue (WaveShaperNode), hats métalliques serrés
  // (bruit bandpass haut + Q élevé), stabs graves toutes les 2 mesures,
  // gamme phrygienne (ambiance sombre).
  var INFERNO_BPM = 150;
  var INFERNO_BEAT_DUR = 60 / INFERNO_BPM;
  var INFERNO_STEP_DUR = INFERNO_BEAT_DUR / 4;
  var INFERNO_STEPS_PER_BAR = 16;
  var INFERNO_BARS_PER_LOOP = 4;
  var INFERNO_TOTAL_STEPS = INFERNO_STEPS_PER_BAR * INFERNO_BARS_PER_LOOP;
  var INFERNO_BASS_ROOT = 41.2;                  // E1
  var INFERNO_PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];  // gamme phrygienne naturelle

  function makeDistortionCurve(amount) {
    var n = 1024, curve = new Float32Array(n), deg = Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
  var INFERNO_DIST_CURVE = makeDistortionCurve(38);

  var infernoRng = mulberry32(20260723);
  var INFERNO_HAT_PLAN = [];
  (function () {
    for (var i = 0; i < INFERNO_STEPS_PER_BAR; i++) INFERNO_HAT_PLAN.push(infernoRng());
  })();

  function scheduleInfernoKick(t) {
    tone(165, 0.24, { type: "sine", toFreq: 32, gain: 1.0, attack: 0.001, dest: musicBus, time: t });
    if (duckGain) {
      try {
        duckGain.gain.cancelScheduledValues(t);
        duckGain.gain.setValueAtTime(1, t);
        duckGain.gain.setValueAtTime(0.1, t + 0.001);
        duckGain.gain.exponentialRampToValueAtTime(1, t + INFERNO_BEAT_DUR * 0.8);
      } catch (err) { /* noop */ }
    }
  }

  function scheduleInfernoBass(t, dur) {
    if (!ctx || !duckGain) return;
    var osc = ctx.createOscillator();
    var shaper = ctx.createWaveShaper();
    var filt = ctx.createBiquadFilter();
    var g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(INFERNO_BASS_ROOT, t);
    shaper.curve = INFERNO_DIST_CURVE;
    shaper.oversample = "2x";
    filt.type = "lowpass";
    filt.frequency.value = 900 + intensity * 1500;
    filt.Q.value = 1.2;
    var peak = 0.45 + intensity * 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(shaper); shaper.connect(filt); filt.connect(g); g.connect(duckGain);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  function scheduleInfernoHat(step, t) {
    var posInBar = step % INFERNO_STEPS_PER_BAR;
    var density = 0.62 + intensity * 0.38;
    if (INFERNO_HAT_PLAN[posInBar] < density) {
      noiseBurst(0.025, { filterType: "bandpass", freq: 8200 + intensity * 2500, q: 9 + intensity * 5, gain: 0.15, dest: musicBus, time: t });
    }
  }

  function scheduleInfernoStab(t) {
    var semis = INFERNO_PHRYGIAN[5]; // b6 : degré sombre caractéristique
    var freq = INFERNO_BASS_ROOT * Math.pow(2, semis / 12);
    tone(freq, 0.35, { type: "sawtooth", toFreq: freq * 0.85, gain: 0.4, attack: 0.004, dest: musicBus, time: t });
    noiseBurst(0.12, { filterType: "bandpass", freq: 700, q: 2, gain: 0.2, dest: musicBus, time: t });
  }

  function scheduleInfernoStep(step, t) {
    var posInBar = step % INFERNO_STEPS_PER_BAR;
    var bar = Math.floor(step / INFERNO_STEPS_PER_BAR) % INFERNO_BARS_PER_LOOP;
    if (posInBar % 4 === 0) {
      scheduleInfernoKick(t);
      scheduleInfernoBass(t, INFERNO_BEAT_DUR * 0.9);
    }
    scheduleInfernoHat(step, t);
    if (bar % 2 === 0 && posInBar === 8) scheduleInfernoStab(t);
  }

  // ------------------------------------------------ musique monde TOXIC.SECTOR
  // Acid ~140 BPM, 4 mesures : basse 303 (saw + lowpass résonant Q 12-18,
  // motif 16 pas avec accents/slides, filtre balayé par enveloppe + LFO lent),
  // kick sec, hats offbeat, blips aigus mouillés épars.
  var TOXIC_BPM = 140;
  var TOXIC_BEAT_DUR = 60 / TOXIC_BPM;
  var TOXIC_STEP_DUR = TOXIC_BEAT_DUR / 4;
  var TOXIC_STEPS_PER_BAR = 16;
  var TOXIC_BARS_PER_LOOP = 4;
  var TOXIC_TOTAL_STEPS = TOXIC_STEPS_PER_BAR * TOXIC_BARS_PER_LOOP;
  var TOXIC_BASS_ROOT = 55; // A1
  var TOXIC_SCALE = [0, 3, 5, 7, 10, 12]; // ligne acid (mineure/pentatonique)

  var toxicRng = mulberry32(20260724);
  var TOXIC_PATTERN = [];
  (function () {
    for (var i = 0; i < TOXIC_STEPS_PER_BAR; i++) {
      var rest = toxicRng() < 0.18;
      var scaleIdx = Math.floor(toxicRng() * TOXIC_SCALE.length);
      TOXIC_PATTERN.push({
        note: rest ? null : TOXIC_SCALE[scaleIdx],
        accent: !rest && toxicRng() < 0.3,
        slide: !rest && toxicRng() < 0.25,
        q: 12 + toxicRng() * 6   // résonance 12..18
      });
    }
  })();
  var TOXIC_HAT_PLAN = [];
  (function () {
    for (var i = 0; i < TOXIC_STEPS_PER_BAR; i++) TOXIC_HAT_PLAN.push(toxicRng());
  })();
  var TOXIC_BLIP_PLAN = [];
  (function () {
    for (var i = 0; i < TOXIC_TOTAL_STEPS; i++) TOXIC_BLIP_PLAN.push(toxicRng());
  })();

  function scheduleToxicKick(t) {
    tone(160, 0.09, { type: "sine", toFreq: 65, gain: 0.75, attack: 0.001, dest: musicBus, time: t });
  }

  function scheduleToxicBass(step, t) {
    if (!ctx || !duckGain) return;
    var posInBar = step % TOXIC_STEPS_PER_BAR;
    var cur = TOXIC_PATTERN[posInBar];
    if (!cur || cur.note == null) return;
    var prevIdx = (posInBar - 1 + TOXIC_STEPS_PER_BAR) % TOXIC_STEPS_PER_BAR;
    var prev = TOXIC_PATTERN[prevIdx];
    var freq = TOXIC_BASS_ROOT * Math.pow(2, cur.note / 12);
    var dur = TOXIC_STEP_DUR * (cur.slide ? 1.9 : 0.85);
    var osc = ctx.createOscillator();
    var filt = ctx.createBiquadFilter();
    var g = ctx.createGain();
    osc.type = "sawtooth";
    filt.type = "lowpass";
    filt.Q.value = cur.q;
    var lfo = Math.sin((step / TOXIC_STEPS_PER_BAR) * Math.PI * 2) * 0.5 + 0.5; // balayage lent
    var baseCut = 350 + lfo * 900 + intensity * 1400 + (cur.accent ? 900 : 0);
    if (prev && prev.slide && prev.note != null) {
      var prevFreq = TOXIC_BASS_ROOT * Math.pow(2, prev.note / 12);
      osc.frequency.setValueAtTime(prevFreq, t);
      osc.frequency.linearRampToValueAtTime(freq, t + TOXIC_STEP_DUR * 0.6);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    filt.frequency.setValueAtTime(baseCut * 2.4, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, baseCut * 0.5), t + dur * 0.8);
    var peak = (cur.accent ? 0.42 : 0.28) + intensity * 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt); filt.connect(g); g.connect(duckGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function scheduleToxicHat(step, t) {
    var posInBar = step % TOXIC_STEPS_PER_BAR;
    if (posInBar % 2 === 0) return; // offbeat uniquement
    var density = 0.4 + intensity * 0.5;
    if (TOXIC_HAT_PLAN[posInBar] < density) {
      noiseBurst(0.02, { filterType: "highpass", freq: 6500, q: 0.8, gain: 0.13, dest: musicBus, time: t });
    }
  }

  function scheduleToxicBlip(step, t) {
    var r = TOXIC_BLIP_PLAN[step];
    if (r >= 0.14) return; // épars
    var freq = 1800 + r * 4000;
    tone(freq, 0.05, { type: "sine", toFreq: freq * 1.4, gain: 0.16, attack: 0.002, dest: musicBus, time: t });
    tone(freq * 0.98, 0.05, { type: "sine", gain: 0.06, attack: 0.002, dest: musicBus, time: t + 0.09 }); // écho "mouillé"
  }

  function scheduleToxicStep(step, t) {
    var posInBar = step % TOXIC_STEPS_PER_BAR;
    if (posInBar % 4 === 0) scheduleToxicKick(t);
    scheduleToxicBass(step, t);
    scheduleToxicHat(step, t);
    scheduleToxicBlip(step, t);
  }

  function schedulerTick() {
    if (!ctx || !musicPlaying) return;
    var stepDur, totalSteps;
    if (musicKind === "menu") { stepDur = MENU_STEP_DUR; totalSteps = MENU_TOTAL_STEPS; }
    else if (musicKind === "inferno") { stepDur = INFERNO_STEP_DUR; totalSteps = INFERNO_TOTAL_STEPS; }
    else if (musicKind === "toxic") { stepDur = TOXIC_STEP_DUR; totalSteps = TOXIC_TOTAL_STEPS; }
    else { stepDur = STEP16_DUR; totalSteps = TOTAL_STEPS; }
    while (nextNoteTime < ctx.currentTime + SCHED_AHEAD) {
      if (musicKind === "menu") scheduleMenuStep(currentStep, nextNoteTime);
      else if (musicKind === "inferno") scheduleInfernoStep(currentStep, nextNoteTime);
      else if (musicKind === "toxic") scheduleToxicStep(currentStep, nextNoteTime);
      else scheduleStep(currentStep, nextNoteTime);
      nextNoteTime += stepDur;
      currentStep = (currentStep + 1) % totalSteps;
    }
  }

  function teardownMusicChain(immediate) {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicPlaying = false;
    if (ctx && musicBus) {
      var bus = musicBus, lp = musicLowpass, dg = duckGain;
      if (immediate) {
        try { bus.disconnect(); } catch (err) { /* noop */ }
        try { if (lp) lp.disconnect(); } catch (err) { /* noop */ }
        try { if (dg) dg.disconnect(); } catch (err) { /* noop */ }
      } else {
        try {
          var t = now();
          bus.gain.cancelScheduledValues(t);
          bus.gain.setValueAtTime(bus.gain.value, t);
          bus.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        } catch (err) { /* noop */ }
        setTimeout(function () {
          try { bus.disconnect(); } catch (err) { /* noop */ }
          try { if (lp) lp.disconnect(); } catch (err) { /* noop */ }
          try { if (dg) dg.disconnect(); } catch (err) { /* noop */ }
        }, 140);
      }
    }
    musicBus = null; musicLowpass = null; duckGain = null;
  }

  // kind : 'menu' (nappe calme écran titre) | 'game' (défaut si omis, boucle
  // hyperpop inchangée) | 'inferno' (industriel, monde INFERNO.SYS) | 'toxic'
  // (acid, monde TOXIC.SECTOR)
  var MUSIC_KINDS = { menu: 1, game: 1, inferno: 1, toxic: 1 };
  function startMusic(kind) {
    kind = MUSIC_KINDS[kind] ? kind : "game";
    if (!hasAudio) return;
    if (!ctx) init();
    if (!ctx) return;
    if (musicPlaying) {
      if (musicKind === kind) return;
      teardownMusicChain(true); // changement de kind : bascule immédiate
    }
    resume();
    musicKind = kind;
    createMusicChain(kind);
    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    musicPlaying = true;
    musicTimer = setInterval(schedulerTick, LOOKAHEAD_MS);
    schedulerTick();
  }

  function stopMusic() {
    teardownMusicChain(false);
  }

  // Pilote 'game', 'inferno' et 'toxic' (densité percussions via `intensity`
  // + ouverture du filtre + léger gain) ; sans effet pendant la nappe 'menu'.
  function setMusicIntensity(i) {
    intensity = Math.max(0, Math.min(1, i));
    if (musicKind === "menu") return;
    if (!ctx) return;
    var t = now();
    var lpFreq, busGain;
    if (musicKind === "inferno") {
      lpFreq = 900 + intensity * 7000;
      busGain = 0.44 + intensity * 0.16;
    } else if (musicKind === "toxic") {
      lpFreq = 1000 + intensity * 8000;
      busGain = 0.40 + intensity * 0.18;
    } else {
      lpFreq = 1200 + intensity * 9000;
      busGain = 0.42 + intensity * 0.18;
    }
    if (musicLowpass) {
      try {
        musicLowpass.frequency.cancelScheduledValues(t);
        musicLowpass.frequency.setTargetAtTime(lpFreq, t, 0.08);
      } catch (err) { /* noop */ }
    }
    if (musicBus) {
      try { musicBus.gain.setTargetAtTime(busGain, t, 0.08); } catch (err) { /* noop */ }
    }
  }

  // Déblocage mobile : à appeler depuis les gestes utilisateur (touchstart ET
  // touchend — iOS ne considère parfois que le relâchement comme un vrai geste).
  function unlock() {
    init();
    resume();
    playSilentBuffer();
  }

  var api = {
    init: init,
    unlock: unlock,
    debugInfo: debugInfo,
    play: play,
    setMuted: setMuted,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setMusicIntensity: setMusicIntensity
  };
  Object.defineProperty(api, "muted", {
    get: function () { return muted; }
  });

  return api;
})();

if (typeof window !== "undefined") window.BladeAudio = BladeAudio;
if (typeof module !== "undefined" && module.exports) module.exports = BladeAudio;
