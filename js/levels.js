/* ============================================================================
 * BLADE.EXE — js/levels.js — BladeLevels
 * Vagues, seuils de boss, seed du défi quotidien, courbe du mode NIVEAUX.
 * Aucune dépendance DOM.
 * ========================================================================== */

var BladeLevels = (function () {

  var CONFIG = (typeof window !== 'undefined' && window.CONFIG)
    ? window.CONFIG
    : (typeof require === 'function' ? require('./config.js') : undefined);

  var WAVES = [
    { id: 1, name: 'LENT',         minScore: 0,    grow: 2.80, maxObjs: 1, interval: 0.90, batch: 1, virusP: 0,    rotSpeed: 0,   dirs: 4, seqLen: 1 },
    { id: 2, name: 'MOYEN',        minScore: 300,  grow: 2.20, maxObjs: 2, interval: 1.00, batch: 1, virusP: 0.08, rotSpeed: 0,   dirs: 8, seqLen: 1 },
    { id: 3, name: 'RAPIDE',       minScore: 900,  grow: 1.80, maxObjs: 3, interval: 0.80, batch: 2, virusP: 0.15, rotSpeed: 0,   dirs: 8, seqLen: 1 },
    { id: 4, name: 'FRÉNÉTIQUE',   minScore: 1800, grow: 1.55, maxObjs: 4, interval: 0.65, batch: 2, virusP: 0.22, rotSpeed: 0.4, dirs: 8, seqLen: 1 },
    { id: 5, name: 'SURCHARGE',    minScore: 3000, grow: 1.35, maxObjs: 5, interval: 0.55, batch: 2, virusP: 0.28, rotSpeed: 0.7, dirs: 8, seqLen: 2 },
    { id: 6, name: 'KERNEL PANIC', minScore: 4500, grow: 1.15, maxObjs: 6, interval: 0.45, batch: 3, virusP: 0.35, rotSpeed: 1.0, dirs: 8, seqLen: 2 },
  ];

  function waveFor(score) {
    var result = WAVES[0];
    for (var i = 0; i < WAVES.length; i++) {
      if (score >= WAVES[i].minScore) result = WAVES[i];
      else break;
    }
    return result;
  }

  function nextBossScore(bossCount) {
    var scores = CONFIG.BOSS.SCORES;
    if (bossCount < scores.length) return scores[bossCount];
    var last = scores[scores.length - 1];
    var extra = bossCount - scores.length + 1;
    return last + extra * CONFIG.BOSS.EVERY;
  }

  function bossSpec(bossCount) {
    return { seqLen: Math.min(3 + bossCount, 6), growTime: CONFIG.BOSS.GROW_TIME };
  }

  // hash simple et déterministe d'une chaîne -> entier 32 bits positif
  // (utilisé pour dailySeed 'YYYY-MM-DD' ET pour le seed du mode NIVEAUX
  // 'worldId-levelIdx' : même algorithme, réutilisé tel quel.)
  function hashStr(str) {
    str = String(str);
    var h = 2166136261; // FNV offset basis
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function dailySeed(dateStr) {
    return hashStr(dateStr);
  }

  /* ============================================================ mode NIVEAUX
   * Courbe PARAMÉTRIQUE (pas de config à la main par niveau) : chaque monde est
   * décrit par un jeu de bornes (target/grow/virus/rotation/densité), et
   * levelSpec() interpole entre ces bornes selon la progression (levelIdx 1..30).
   * Monde 1 (index 0) : target 300 -> ~1500, grow 2.6 -> 1.3, virus dès le
   * niveau 4, rotation dès le niveau 12, double coupe dès le niveau 18.
   * Monde 2 (index 1) : reprend ~le niveau 12 du monde 1 (déjà virus+rotation
   * actifs), en plus dense, et pousse plus loin (virusP jusqu'à 0.40, seqLen 2
   * fréquent dès le niveau 6).
   * Niveaux boss (CONFIG.LEVELS.BOSS_LEVELS) : bossAt 0.6, target × 1.3 —
   * la courbe de target est ensuite reconstruite en clampant (strictement
   * croissante) pour absorber ce pic sans jamais redescendre. */

  var PER_WORLD = CONFIG.LEVELS.PER_WORLD;

  var WORLD_CURVES = [
    { // monde 1 — INFERNO.SYS
      targetStart: 300,  targetEnd: 1500,
      growStart: 2.60,   growEnd: 1.30,
      virusStartLevel: 4,  virusAtStart: 0.05, virusMax: 0.35,
      rotStartLevel: 12,   rotAtStart: 0.30,   rotMax: 1.00,
      seqLenLevel: 18,   // seqLen 2 à partir de ce niveau
      dirsLevel: 3,      // dirs 8 à partir de ce niveau (4 avant)
      maxObjsStart: 1, maxObjsEnd: 6,
      intervalStart: 0.90, intervalEnd: 0.45,
      batchStart: 1, batchEnd: 3,
    },
    { // monde 2 — TOXIC.SECTOR (reprend ~nv12 du monde 1, plus dense, va plus loin)
      targetStart: 550,  targetEnd: 2400,
      growStart: 2.10,   growEnd: 1.00,
      virusStartLevel: 1,  virusAtStart: 0.15, virusMax: 0.40,
      rotStartLevel: 1,    rotAtStart: 0.35,   rotMax: 1.10,
      seqLenLevel: 6,
      dirsLevel: 1,
      maxObjsStart: 3, maxObjsEnd: 6,
      intervalStart: 0.70, intervalEnd: 0.40,
      batchStart: 2, batchEnd: 3,
    },
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function round2(x) { return Math.round(x * 100) / 100; }
  // progression 0..1 sur les 30 niveaux d'un monde
  function progressFrac(levelIdx) { return (levelIdx - 1) / (PER_WORLD - 1); }

  // interpolation géométrique (ratio constant d'un niveau à l'autre)
  function baseTarget(curve, levelIdx) {
    var p = progressFrac(levelIdx);
    return curve.targetStart * Math.pow(curve.targetEnd / curve.targetStart, p);
  }

  var targetCache = [];
  function targetCurve(worldIdx) {
    if (targetCache[worldIdx]) return targetCache[worldIdx];
    var curve = WORLD_CURVES[worldIdx];
    var arr = [];
    var prev = 0;
    for (var i = 1; i <= PER_WORLD; i++) {
      var base = baseTarget(curve, i);
      var isBoss = CONFIG.LEVELS.BOSS_LEVELS.indexOf(i) !== -1;
      var t = Math.round(isBoss ? base * 1.3 : base);
      if (t <= prev) t = prev + 1; // garantit strictement croissant même après un pic boss
      arr.push(t);
      prev = t;
    }
    targetCache[worldIdx] = arr;
    return arr;
  }

  function growFor(curve, levelIdx) {
    return round2(lerp(curve.growStart, curve.growEnd, progressFrac(levelIdx)));
  }

  function threshFrac(levelIdx, startLevel) {
    if (levelIdx < startLevel) return null;
    var span = PER_WORLD - startLevel;
    return span > 0 ? (levelIdx - startLevel) / span : 1;
  }

  function virusPFor(curve, levelIdx) {
    var p = threshFrac(levelIdx, curve.virusStartLevel);
    if (p === null) return 0;
    return round2(lerp(curve.virusAtStart, curve.virusMax, p));
  }

  function rotSpeedFor(curve, levelIdx) {
    var p = threshFrac(levelIdx, curve.rotStartLevel);
    if (p === null) return 0;
    return round2(lerp(curve.rotAtStart, curve.rotMax, p));
  }

  function seqLenFor(curve, levelIdx) { return levelIdx >= curve.seqLenLevel ? 2 : 1; }
  function dirsFor(curve, levelIdx) { return levelIdx >= curve.dirsLevel ? 8 : 4; }

  function maxObjsFor(curve, levelIdx) {
    return Math.max(1, Math.round(lerp(curve.maxObjsStart, curve.maxObjsEnd, progressFrac(levelIdx))));
  }
  function intervalFor(curve, levelIdx) {
    return round2(lerp(curve.intervalStart, curve.intervalEnd, progressFrac(levelIdx)));
  }
  function batchFor(curve, levelIdx) {
    return Math.max(1, Math.round(lerp(curve.batchStart, curve.batchEnd, progressFrac(levelIdx))));
  }

  function levelSpec(worldIdx, levelIdx) {
    var world = CONFIG.WORLDS[worldIdx];
    var curve = WORLD_CURVES[worldIdx];
    var isBoss = CONFIG.LEVELS.BOSS_LEVELS.indexOf(levelIdx) !== -1;
    return {
      seed: hashStr(world.id + '-' + levelIdx),
      target: targetCurve(worldIdx)[levelIdx - 1],
      grow: growFor(curve, levelIdx),
      maxObjs: maxObjsFor(curve, levelIdx),
      interval: intervalFor(curve, levelIdx),
      batch: batchFor(curve, levelIdx),
      virusP: virusPFor(curve, levelIdx),
      rotSpeed: rotSpeedFor(curve, levelIdx),
      dirs: dirsFor(curve, levelIdx),
      seqLen: seqLenFor(curve, levelIdx),
      bossAt: isBoss ? 0.6 : null,
      boss: isBoss,
    };
  }

  // étoiles requises DANS ce monde pour ouvrir le niveau levelIdx (portes)
  function levelGate(worldIdx, levelIdx) {
    var gates = CONFIG.LEVELS.GATES;
    return (gates && typeof gates[levelIdx] === 'number') ? gates[levelIdx] : 0;
  }

  // étoiles du monde précédent requises pour ouvrir ce monde (0 pour le monde 0)
  function worldGate(worldIdx) {
    return worldIdx <= 0 ? 0 : CONFIG.LEVELS.WORLD2_STARS;
  }

  var BladeLevels = {
    WAVES: WAVES,
    waveFor: waveFor,
    nextBossScore: nextBossScore,
    bossSpec: bossSpec,
    dailySeed: dailySeed,
    levelSpec: levelSpec,
    levelGate: levelGate,
    worldGate: worldGate,
  };

  return BladeLevels;
})();

if (typeof window !== 'undefined') window.BladeLevels = BladeLevels;
if (typeof module !== 'undefined' && module.exports) module.exports = BladeLevels;
