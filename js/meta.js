/* ============================================================================
 * BLADE.EXE — js/meta.js — BladeMeta
 * Sauvegarde, records, lames cosmétiques, série quotidienne.
 * Fallback mémoire si localStorage indisponible (Node OK).
 * ========================================================================== */

var BladeMeta = (function () {

  var CONFIG = (typeof window !== 'undefined' && window.CONFIG)
    ? window.CONFIG
    : (typeof require === 'function' ? require('./config.js') : undefined);

  var memoryStore = {};

  function hasLocalStorage() {
    try {
      return typeof window !== 'undefined' && !!window.localStorage;
    } catch (e) {
      return false;
    }
  }

  var storage = hasLocalStorage() ? window.localStorage : {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null; },
    setItem: function (k, v) { memoryStore[k] = String(v); },
  };

  var save = null;

  function defaults() {
    return {
      best: 0,
      bestCombo: 0,
      totalScore: 0,
      blades: { unlocked: ['neon'], equipped: 'neon' },
      daily: { lastDate: null, streak: 0, scores: {} },
    };
  }

  function load() {
    var raw = null;
    try { raw = storage.getItem(CONFIG.SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        save = defaults();
        // fusion superficielle protégeant contre des sauvegardes partielles
        save.best = typeof parsed.best === 'number' ? parsed.best : save.best;
        save.bestCombo = typeof parsed.bestCombo === 'number' ? parsed.bestCombo : save.bestCombo;
        save.totalScore = typeof parsed.totalScore === 'number' ? parsed.totalScore : save.totalScore;
        if (parsed.blades) {
          save.blades.unlocked = Array.isArray(parsed.blades.unlocked) ? parsed.blades.unlocked : save.blades.unlocked;
          save.blades.equipped = parsed.blades.equipped || save.blades.equipped;
        }
        if (parsed.daily) {
          save.daily.lastDate = parsed.daily.lastDate || null;
          save.daily.streak = typeof parsed.daily.streak === 'number' ? parsed.daily.streak : 0;
          save.daily.scores = parsed.daily.scores || {};
        }
      } catch (e) {
        save = defaults();
      }
    } else {
      save = defaults();
    }
    persist();
    return save;
  }

  function persist() {
    try { storage.setItem(CONFIG.SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  function get() {
    if (!save) load();
    return save;
  }

  function todayStr(d) {
    var date = d instanceof Date ? d : new Date();
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function dateFromStr(s) {
    var parts = s.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function isYesterday(prevStr, curStr) {
    if (!prevStr) return false;
    var prev = dateFromStr(prevStr);
    var cur = dateFromStr(curStr);
    var diffDays = Math.round((cur - prev) / 86400000);
    return diffDays === 1;
  }

  function checkUnlocks() {
    var unlockedNow = [];
    var s = get();
    CONFIG.BLADES.forEach(function (b) {
      if (s.blades.unlocked.indexOf(b.id) !== -1) return;
      var u = b.unlock;
      var reached = false;
      if (u.type === 'default') reached = true;
      else if (u.type === 'total') reached = s.totalScore >= u.value;
      else if (u.type === 'best') reached = s.best >= u.value;
      else if (u.type === 'streak') reached = s.daily.streak >= u.value;
      if (reached) {
        s.blades.unlocked.push(b.id);
        unlockedNow.push(b.id);
      }
    });
    return unlockedNow;
  }

  function recordRun(opts) {
    var s = get();
    opts = opts || {};
    var mode = opts.mode;
    var score = opts.score || 0;
    var maxCombo = opts.maxCombo || 0;
    var dateStr = opts.dateStr || todayStr();

    var newBest = false;
    if (score > s.best) { s.best = score; newBest = true; }
    if (maxCombo > s.bestCombo) s.bestCombo = maxCombo;
    s.totalScore += score;

    if (mode === 'daily') {
      var prevScore = s.daily.scores[dateStr];
      s.daily.scores[dateStr] = (typeof prevScore === 'number') ? Math.max(prevScore, score) : score;

      // la série ne bouge que si le défi du jour est réussi (score >= GOAL) ;
      // un score en dessous du seuil est enregistré mais streak/lastDate restent figés.
      if (score >= CONFIG.DAILY.GOAL) {
        if (s.daily.lastDate === dateStr) {
          // même jour : streak inchangé
        } else if (isYesterday(s.daily.lastDate, dateStr)) {
          s.daily.streak += 1;
          s.daily.lastDate = dateStr;
        } else {
          s.daily.streak = 1;
          s.daily.lastDate = dateStr;
        }
      }
    }

    var unlocked = checkUnlocks();
    persist();

    return { newBest: newBest, unlocked: unlocked, streak: s.daily.streak };
  }

  function getBlades() {
    var s = get();
    return CONFIG.BLADES.map(function (b) {
      return Object.assign({}, b, {
        unlocked: s.blades.unlocked.indexOf(b.id) !== -1,
        equipped: s.blades.equipped === b.id,
      });
    });
  }

  function equipBlade(id) {
    var s = get();
    if (s.blades.unlocked.indexOf(id) === -1) return false;
    s.blades.equipped = id;
    persist();
    return true;
  }

  var BladeMeta = {
    load: load,
    get: get,
    recordRun: recordRun,
    getBlades: getBlades,
    equipBlade: equipBlade,
    todayStr: todayStr,
  };

  return BladeMeta;
})();

if (typeof window !== 'undefined') window.BladeMeta = BladeMeta;
if (typeof module !== 'undefined' && module.exports) module.exports = BladeMeta;
