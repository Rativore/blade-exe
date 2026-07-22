/* ============================================================================
 * BLADE.EXE — js/levels.js — BladeLevels
 * Vagues, seuils de boss, seed du défi quotidien. Aucune dépendance DOM.
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

  // hash simple et déterministe d'une chaîne 'YYYY-MM-DD' -> entier 32 bits positif
  function dailySeed(dateStr) {
    var str = String(dateStr);
    var h = 2166136261; // FNV offset basis
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var BladeLevels = {
    WAVES: WAVES,
    waveFor: waveFor,
    nextBossScore: nextBossScore,
    bossSpec: bossSpec,
    dailySeed: dailySeed,
  };

  return BladeLevels;
})();

if (typeof window !== 'undefined') window.BladeLevels = BladeLevels;
if (typeof module !== 'undefined' && module.exports) module.exports = BladeLevels;
