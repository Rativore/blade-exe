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
      shards: 0,
      blades: { unlocked: ['neon'], equipped: 'neon' },
      daily: { lastDate: null, streak: 0, scores: {} },
      levelStars: {},
      gamesPlayed: 0,
      themes: { unlocked: ['grid'], equipped: 'grid' },
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
        // migration : anciennes sauvegardes sans shards -> shards:0 (défaut déjà posé
        // par defaults()) ; les lames déjà unlocked (anciens types total/best) restent
        // telles quelles, on ne les retire jamais.
        save.shards = typeof parsed.shards === 'number' ? parsed.shards : save.shards;
        if (parsed.blades) {
          save.blades.unlocked = Array.isArray(parsed.blades.unlocked) ? parsed.blades.unlocked : save.blades.unlocked;
          save.blades.equipped = parsed.blades.equipped || save.blades.equipped;
        }
        if (parsed.daily) {
          save.daily.lastDate = parsed.daily.lastDate || null;
          save.daily.streak = typeof parsed.daily.streak === 'number' ? parsed.daily.streak : 0;
          save.daily.scores = parsed.daily.scores || {};
        }
        // migration : anciennes sauvegardes sans levelStars -> {} (défaut déjà posé)
        save.levelStars = (parsed.levelStars && typeof parsed.levelStars === 'object') ? parsed.levelStars : save.levelStars;
        // migration : anciennes sauvegardes sans gamesPlayed -> 0 (défaut déjà posé)
        save.gamesPlayed = typeof parsed.gamesPlayed === 'number' ? parsed.gamesPlayed : save.gamesPlayed;
        // migration : anciennes sauvegardes sans themes -> unlocked:['grid'], equipped:'grid'
        // (défauts déjà posés par defaults())
        if (parsed.themes) {
          save.themes.unlocked = Array.isArray(parsed.themes.unlocked) ? parsed.themes.unlocked : save.themes.unlocked;
          save.themes.equipped = parsed.themes.equipped || save.themes.equipped;
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
      // 'default' : possédée d'office ; 'streak' : série quotidienne ;
      // 'shop' : ne se déverrouille QUE via buyBlade (jamais ici).
      if (u.type === 'default') reached = true;
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

    var shardsEarned = 0;
    var lastDateBefore = s.daily.lastDate; // capturé AVANT toute mise à jour de ce run

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
        // première réussite du jour = lastDate (avant appel) !== dateStr
        if (lastDateBefore !== dateStr) {
          shardsEarned = CONFIG.ECONOMY.DAILY_WIN_REWARD + CONFIG.ECONOMY.DAILY_STREAK_BONUS * s.daily.streak;
        }
      }
    } else if (mode === 'arcade') {
      shardsEarned = Math.floor(score / CONFIG.ECONOMY.ARCADE_RATE);
    }

    s.shards += shardsEarned;
    s.gamesPlayed = (s.gamesPlayed || 0) + 1;

    var unlocked = checkUnlocks();
    persist();

    return { newBest: newBest, unlocked: unlocked, streak: s.daily.streak, shardsEarned: shardsEarned, shards: s.shards };
  }

  // --- mode NIVEAUX ---------------------------------------------------------
  // BladeMeta.recordLevel({worldId, levelIdx, stars, score}) -> { shardsEarned,
  //   improved, shards } : étoiles conservées au max historique ; éclats =
  //   REWARD_FIRST (si première réussite) + REWARD_PER_STAR × étoiles nouvelles
  //   au-delà du max précédent, le tout × BOSS_REWARD_MULT si niveau boss ;
  //   rejouer sans améliorer le nombre d'étoiles = 0.
  function recordLevel(opts) {
    var s = get();
    opts = opts || {};
    var worldId = opts.worldId;
    var levelIdx = opts.levelIdx;
    var stars = opts.stars || 0;
    var key = worldId + '-' + levelIdx;

    var prevStars = s.levelStars[key] || 0;
    var improved = stars > prevStars;
    var shardsEarned = 0;

    if (improved) {
      var isFirstClear = prevStars === 0;
      var starDelta = stars - prevStars;
      var reward = (isFirstClear ? CONFIG.LEVELS.REWARD_FIRST : 0)
        + CONFIG.LEVELS.REWARD_PER_STAR * starDelta;
      var isBoss = CONFIG.LEVELS.BOSS_LEVELS.indexOf(levelIdx) !== -1;
      if (isBoss) reward *= CONFIG.LEVELS.BOSS_REWARD_MULT;
      shardsEarned = reward;
      s.levelStars[key] = stars;
    }

    s.shards += shardsEarned;
    s.gamesPlayed = (s.gamesPlayed || 0) + 1;
    persist();

    return { shardsEarned: shardsEarned, improved: improved, shards: s.shards };
  }

  // BladeMeta.getLevelProgress() -> { stars, starsByWorld:[n0,n1], totalStars }
  function getLevelProgress() {
    var s = get();
    var starsByWorld = CONFIG.WORLDS.map(function (w) {
      var sum = 0;
      for (var i = 1; i <= CONFIG.LEVELS.PER_WORLD; i++) {
        sum += s.levelStars[w.id + '-' + i] || 0;
      }
      return sum;
    });
    var totalStars = starsByWorld.reduce(function (a, b) { return a + b; }, 0);
    return { stars: s.levelStars, starsByWorld: starsByWorld, totalStars: totalStars };
  }

  function buyBlade(id) {
    var s = get();
    var blade = null;
    for (var i = 0; i < CONFIG.BLADES.length; i++) {
      if (CONFIG.BLADES[i].id === id) { blade = CONFIG.BLADES[i]; break; }
    }
    // refus : lame inconnue ou pas de type 'shop' (default/streak ne s'achètent pas)
    if (!blade || blade.unlock.type !== 'shop') return { ok: false, shards: s.shards };
    // refus : déjà possédée
    if (s.blades.unlocked.indexOf(id) !== -1) return { ok: false, shards: s.shards };
    // refus : solde insuffisant
    if (s.shards < blade.unlock.price) return { ok: false, shards: s.shards };

    s.shards -= blade.unlock.price;
    s.blades.unlocked.push(id);
    persist();
    return { ok: true, shards: s.shards };
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

  // BladeMeta.buyTheme(id) -> { ok, shards } — refus si id inconnu, price 0
  // (thème 'grid', gratuit d'office), déjà possédé, ou shards < price ;
  // sinon débite, ajoute à unlocked, persiste.
  function buyTheme(id) {
    var s = get();
    var theme = null;
    for (var i = 0; i < CONFIG.THEMES.length; i++) {
      if (CONFIG.THEMES[i].id === id) { theme = CONFIG.THEMES[i]; break; }
    }
    // refus : thème inconnu ou price 0 (le thème gratuit par défaut ne s'achète pas)
    if (!theme || theme.price === 0) return { ok: false, shards: s.shards };
    // refus : déjà possédé
    if (s.themes.unlocked.indexOf(id) !== -1) return { ok: false, shards: s.shards };
    // refus : solde insuffisant
    if (s.shards < theme.price) return { ok: false, shards: s.shards };

    s.shards -= theme.price;
    s.themes.unlocked.push(id);
    persist();
    return { ok: true, shards: s.shards };
  }

  // BladeMeta.getThemes() -> [{...CONFIG.THEMES[i], unlocked, equipped}]
  function getThemes() {
    var s = get();
    return CONFIG.THEMES.map(function (t) {
      return Object.assign({}, t, {
        unlocked: s.themes.unlocked.indexOf(t.id) !== -1,
        equipped: s.themes.equipped === t.id,
      });
    });
  }

  // BladeMeta.equipTheme(id) -> bool (refus si non possédé)
  function equipTheme(id) {
    var s = get();
    if (s.themes.unlocked.indexOf(id) === -1) return false;
    s.themes.equipped = id;
    persist();
    return true;
  }

  // BladeMeta.addShards(n) -> shards — crédite n (>0) éclats et persiste
  // (récompenses pub : ×2 défi, +bonus boutique plus tard).
  function addShards(n) {
    var s = get();
    if (n > 0) {
      s.shards += n;
      persist();
    }
    return s.shards;
  }

  var BladeMeta = {
    load: load,
    get: get,
    recordRun: recordRun,
    getBlades: getBlades,
    equipBlade: equipBlade,
    buyBlade: buyBlade,
    todayStr: todayStr,
    recordLevel: recordLevel,
    getLevelProgress: getLevelProgress,
    addShards: addShards,
    buyTheme: buyTheme,
    equipTheme: equipTheme,
    getThemes: getThemes,
  };

  return BladeMeta;
})();

if (typeof window !== 'undefined') window.BladeMeta = BladeMeta;
if (typeof module !== 'undefined' && module.exports) module.exports = BladeMeta;
