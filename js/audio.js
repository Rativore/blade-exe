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
  var musicTimer = null;
  var musicBus = null;      // volume musique (intensité)
  var musicLowpass = null;  // filtre global (ouvre avec l'intensité)
  var duckGain = null;      // pompe side-chain (bass)
  var intensity = 0;
  var currentStep = 0;
  var nextNoteTime = 0;

  function createMusicChain() {
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.42 + intensity * 0.18;
    musicLowpass = ctx.createBiquadFilter();
    musicLowpass.type = "lowpass";
    musicLowpass.frequency.value = 1200 + intensity * 9000;
    musicLowpass.Q.value = 0.7;
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(musicBus);
    musicBus.connect(musicLowpass);
    musicLowpass.connect(master);
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

  function schedulerTick() {
    if (!ctx || !musicPlaying) return;
    while (nextNoteTime < ctx.currentTime + SCHED_AHEAD) {
      scheduleStep(currentStep, nextNoteTime);
      nextNoteTime += STEP16_DUR;
      currentStep = (currentStep + 1) % TOTAL_STEPS;
    }
  }

  function startMusic() {
    if (!hasAudio) return;
    if (!ctx) init();
    if (!ctx) return;
    if (musicPlaying) return;
    resume();
    createMusicChain();
    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    musicPlaying = true;
    musicTimer = setInterval(schedulerTick, LOOKAHEAD_MS);
    schedulerTick();
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicPlaying = false;
    if (ctx && musicBus) {
      var bus = musicBus, lp = musicLowpass, dg = duckGain;
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
    musicBus = null; musicLowpass = null; duckGain = null;
  }

  function setMusicIntensity(i) {
    intensity = Math.max(0, Math.min(1, i));
    if (!ctx) return;
    var t = now();
    if (musicLowpass) {
      try {
        musicLowpass.frequency.cancelScheduledValues(t);
        musicLowpass.frequency.setTargetAtTime(1200 + intensity * 9000, t, 0.08);
      } catch (err) { /* noop */ }
    }
    if (musicBus) {
      try { musicBus.gain.setTargetAtTime(0.42 + intensity * 0.18, t, 0.08); } catch (err) { /* noop */ }
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
