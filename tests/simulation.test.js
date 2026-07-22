/* ============================================================================
 * BLADE.EXE — tests/simulation.test.js
 * Tests d'intégration Node, zéro dépendance externe.
 *   a) bot parfait   — score monte, vagues montent, >=1 boss meurt, 0 crash
 *   b) bot passif    — 3 vies perdues -> status OVER
 *   c) déterminisme  — même seed + même script -> même score (2 exécutions)
 *   d) BladeMeta     — streak sur réussite seulement, reset après trou, unlock
 *   e) mode daily    — bot parfait -> status WIN + event dailyWin + plus de spawn
 * Lancement : node tests/simulation.test.js
 * ========================================================================== */
'use strict';

var path = require('path');
var BladeEngine = require('../js/engine.js');
var BladeLevels = require('../js/levels.js');
var CONFIG = require('../js/config.js');

var pass = 0, fail = 0;
var results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push('  PASS  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; results.push('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}

var VIEW = { w: 400, h: 720 };
var DT = 1 / 60;

/* ---------------------------------------------------------------- bot parfait */
// distance point->segment (comme dans l'engine) pour éviter de balayer un virus
function segDist(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  var t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
// Pour un objet, trace un micro-segment traversant (x,y) dans la direction req.
// Un joueur parfait ne balaie jamais un virus : si le trait croiserait un virus,
// on saute cet objet pour cette frame (il sera tranché quand la voie est libre).
function perfectSlice(engine, o) {
  var d = o.size * 1.15 + 5;
  var cx = Math.cos(o.req), sy = Math.sin(o.req);
  var ax = o.x - cx * d, ay = o.y - sy * d, bx = o.x + cx * d, by = o.y + sy * d;
  var objs = engine.state.objs;
  for (var i = 0; i < objs.length; i++) {
    var v = objs[i];
    if (!v.virus || v.cool > 0) continue;
    if (segDist(v.x, v.y, ax, ay, bx, by) <= v.size) return null; // voie bloquée par un virus
  }
  engine.strokeStart(ax, ay);
  var ev = engine.strokeMove(bx, by);
  engine.strokeEnd();
  return ev;
}

function runPerfect(seed, seconds) {
  var engine = BladeEngine.create({ mode: 'arcade', seed: seed, viewport: { w: VIEW.w, h: VIEW.h } });
  var frames = Math.round(seconds / DT);
  var stats = { bossSpawn: 0, bossDone: 0, miss: 0, virus: 0, wrong: 0, slice: 0, maxWave: 1, threw: false };
  var scoreAt2s = null;
  try {
    for (var f = 0; f < frames; f++) {
      var ev = engine.update(DT);
      tally(stats, ev);
      // le bot tranche tous les objets non-virus présents
      var objs = engine.state.objs;
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (o.virus) continue;
        tally(stats, perfectSlice(engine, o));
      }
      if (engine.state.wave.id > stats.maxWave) stats.maxWave = engine.state.wave.id;
      if (scoreAt2s === null && f * DT >= 2) scoreAt2s = engine.state.score;
      if (engine.state.status === 'OVER') break;
    }
  } catch (e) {
    stats.threw = true;
    stats.err = e && e.message;
  }
  stats.finalScore = engine.state.score;
  stats.finalWave = engine.state.wave.id;
  stats.status = engine.state.status;
  stats.lives = engine.state.lives;
  stats.scoreAt2s = scoreAt2s || 0;
  return stats;
}

function tally(stats, ev) {
  if (!ev) return;
  for (var i = 0; i < ev.length; i++) {
    var t = ev[i].type;
    if (stats[t] != null) stats[t]++;
  }
}

/* ------------------------------------------------------------ bot parfait daily */
// Run en mode 'daily' : le bot tranche tout comme runPerfect, mais on vérifie
// qu'une fois DAILY.GOAL atteint, l'engine passe en 'WIN', émet 'dailyWin' une
// seule fois, et n'accepte plus aucun spawn/événement/perte de vie ensuite.
function runDailyPerfect(seed, maxSeconds, postWinSeconds) {
  var engine = BladeEngine.create({ mode: 'daily', seed: seed, viewport: { w: VIEW.w, h: VIEW.h } });
  var maxFrames = Math.round(maxSeconds / DT);
  var postFrames = Math.round(postWinSeconds / DT);
  var stats = {
    threw: false, err: null,
    dailyWinEvents: 0, winScore: null, winMaxCombo: null,
    objsAtWin: null, livesAtWin: null,
    spawnGrewAfterWin: false, livesDroppedAfterWin: false, eventsAfterWin: 0,
    won: false
  };
  var won = false, framesSinceWin = 0;
  try {
    for (var f = 0; f < maxFrames; f++) {
      var ev = engine.update(DT);
      for (var k = 0; k < ev.length; k++) {
        if (ev[k].type === 'dailyWin') {
          stats.dailyWinEvents++;
          stats.winScore = ev[k].score;
          stats.winMaxCombo = ev[k].maxCombo;
        }
      }
      if (!won) {
        var objs = engine.state.objs;
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i];
          if (o.virus) continue;
          var r = perfectSlice(engine, o);
          if (r) for (var k2 = 0; k2 < r.length; k2++) {
            if (r[k2].type === 'dailyWin') { stats.dailyWinEvents++; stats.winScore = r[k2].score; stats.winMaxCombo = r[k2].maxCombo; }
          }
        }
        if (engine.state.status === 'WIN') {
          won = true; stats.won = true;
          stats.objsAtWin = engine.state.objs.length;
          stats.livesAtWin = engine.state.lives;
        }
      } else {
        framesSinceWin++;
        // le run est fini : tenter de trancher ne doit produire aucun événement
        var objs2 = engine.state.objs;
        for (var j = objs2.length - 1; j >= 0; j--) {
          var o2 = objs2[j];
          if (o2.virus) continue;
          var r2 = perfectSlice(engine, o2);
          if (r2 && r2.length) stats.eventsAfterWin += r2.length;
        }
        if (ev.length) stats.eventsAfterWin += ev.length;
        if (engine.state.objs.length > stats.objsAtWin) stats.spawnGrewAfterWin = true;
        if (engine.state.lives < stats.livesAtWin) stats.livesDroppedAfterWin = true;
        if (framesSinceWin >= postFrames) break;
      }
    }
  } catch (e) { stats.threw = true; stats.err = e && e.message; }
  stats.finalStatus = engine.state.status;
  stats.finalScore = engine.state.score;
  return stats;
}

/* ---------------------------------------------------------------- bot passif */
function runPassive(seed, maxSeconds) {
  var engine = BladeEngine.create({ mode: 'arcade', seed: seed, viewport: { w: VIEW.w, h: VIEW.h } });
  var frames = Math.round(maxSeconds / DT);
  var over = false, threw = false, err = null;
  try {
    for (var f = 0; f < frames; f++) {
      var ev = engine.update(DT);
      for (var i = 0; i < ev.length; i++) if (ev[i].type === 'over') over = true;
      if (engine.state.status === 'OVER') { over = true; break; }
    }
  } catch (e) { threw = true; err = e && e.message; }
  return { over: over, threw: threw, err: err, status: engine.state.status, lives: engine.state.lives };
}

/* ============================================================ CASE a : parfait */
(function () {
  var s = runPerfect(12345, 120);
  var ok = !s.threw
    && s.finalScore > s.scoreAt2s
    && s.finalWave > 1
    && s.bossSpawn >= 1
    && s.bossDone >= 1
    && s.status === 'PLAY';
  check('a) bot parfait — 120 s sans crash, score/vagues montent, boss tué', ok,
    'score ' + s.scoreAt2s + '->' + s.finalScore + ', vague->' + s.finalWave
    + ', boss ' + s.bossDone + '/' + s.bossSpawn + ', status ' + s.status
    + (s.threw ? ', EXC=' + s.err : ''));
})();

/* ============================================================ CASE b : passif */
(function () {
  var r = runPassive(777, 60);
  check('b) bot passif — 3 vies perdues puis OVER', !r.threw && r.over && r.status === 'OVER' && r.lives <= 0,
    'status ' + r.status + ', lives ' + r.lives + (r.threw ? ', EXC=' + r.err : ''));
})();

/* ==================================================== CASE c : déterminisme */
(function () {
  var a = runPerfect(20260722, 60);
  var b = runPerfect(20260722, 60);
  check('c) déterminisme — même seed/script -> même score final',
    !a.threw && !b.threw && a.finalScore === b.finalScore && a.bossDone === b.bossDone,
    'run1 ' + a.finalScore + ' / run2 ' + b.finalScore);
})();

/* ==================================================== CASE d : BladeMeta */
function freshMeta() {
  var pCfg = require.resolve('../js/config.js');
  var pMeta = require.resolve('../js/meta.js');
  delete require.cache[pCfg];
  delete require.cache[pMeta];
  return require('../js/meta.js');
}

(function () {
  // d1 : streak J+1 (règle « réussite seulement » -> scores >= DAILY.GOAL = 1200)
  var M = freshMeta();
  var r1 = M.recordRun({ mode: 'daily', score: 1250, maxCombo: 5, dateStr: '2026-07-20' });
  var r2 = M.recordRun({ mode: 'daily', score: 1300, maxCombo: 6, dateStr: '2026-07-21' });
  check('d1) streak J+1 -> 2 (réussites >= 1200)', r1.streak === 1 && r2.streak === 2, 'j1=' + r1.streak + ' j2=' + r2.streak);

  // d1b : un score sous le seuil ne fait jamais bouger la série ni lastDate
  M = freshMeta();
  var rw1 = M.recordRun({ mode: 'daily', score: 1250, maxCombo: 5, dateStr: '2026-07-20' });
  var rw2 = M.recordRun({ mode: 'daily', score: 400, maxCombo: 2, dateStr: '2026-07-21' }); // échec
  var rw3 = M.recordRun({ mode: 'daily', score: 1300, maxCombo: 6, dateStr: '2026-07-22' }); // réussite après échec = trou
  check('d1b) échec (< 1200) ne casse ni ne fait avancer la série sur le coup, mais compte comme un trou', rw1.streak === 1 && rw2.streak === 1 && rw3.streak === 1,
    'j1=' + rw1.streak + ' échec=' + rw2.streak + ' j3=' + rw3.streak);

  // d2 : reset après un trou (réussites seulement)
  M = freshMeta();
  var g1 = M.recordRun({ mode: 'daily', score: 1200, maxCombo: 1, dateStr: '2026-07-20' });
  var g2 = M.recordRun({ mode: 'daily', score: 1250, maxCombo: 1, dateStr: '2026-07-25' });
  check('d2) reset streak après trou -> 1', g1.streak === 1 && g2.streak === 1, 'avant=' + g1.streak + ' après-trou=' + g2.streak);

  // d3 : même jour -> inchangé, meilleur score du jour gardé même sous le seuil
  M = freshMeta();
  var h1 = M.recordRun({ mode: 'daily', score: 1300, maxCombo: 1, dateStr: '2026-07-20' });
  var h2 = M.recordRun({ mode: 'daily', score: 1500, maxCombo: 1, dateStr: '2026-07-20' });
  var sc = M.get().daily.scores['2026-07-20'];
  check('d3) même jour -> streak inchangé + meilleur score gardé', h1.streak === 1 && h2.streak === 1 && sc === 1500,
    'streak=' + h2.streak + ' score=' + sc);

  // d3b : score du jour toujours enregistré même en échec (score < GOAL)
  M = freshMeta();
  M.recordRun({ mode: 'daily', score: 400, maxCombo: 1, dateStr: '2026-07-20' });
  var scFail = M.get().daily.scores['2026-07-20'];
  var streakFail = M.get().daily.streak;
  check('d3b) échec quotidien -> score enregistré mais streak/lastDate ne bougent pas', scFail === 400 && streakFail === 0 && M.get().daily.lastDate === null,
    'score=' + scFail + ' streak=' + streakFail + ' lastDate=' + M.get().daily.lastDate);

  // d4 : AURUM (type 'shop') ne se déverrouille PLUS jamais via un record arcade
  M = freshMeta();
  var u1 = M.recordRun({ mode: 'arcade', score: 9999, maxCombo: 10 });
  var aurumAfterRecord = M.getBlades().filter(function (b) { return b.id === 'aurum'; })[0].unlocked;
  check('d4) AURUM (shop) NE se déverrouille PAS via un record arcade',
    u1.unlocked.indexOf('aurum') === -1 && (CONFIG.TEST_ALL_OWNED ? aurumAfterRecord === true : aurumAfterRecord === false),
    'unlocked=[' + u1.unlocked.join(',') + '] aurum.unlocked=' + aurumAfterRecord + (CONFIG.TEST_ALL_OWNED ? ' [mode test tout possédé]' : ''));

  // d5 : PLASMA (type 'shop') ne se déverrouille PLUS jamais via le cumul de score
  M = freshMeta();
  M.recordRun({ mode: 'arcade', score: 9000, maxCombo: 1 });
  M.recordRun({ mode: 'arcade', score: 9000, maxCombo: 1 });
  var u3 = M.recordRun({ mode: 'arcade', score: 9000, maxCombo: 1 }); // total 27000
  var blades = M.getBlades();
  var plasmaUnlocked = blades.filter(function (b) { return b.id === 'plasma'; })[0].unlocked;
  check('d5) PLASMA (shop) NE se déverrouille PAS via le cumul de score',
    u3.unlocked.indexOf('plasma') === -1 && (CONFIG.TEST_ALL_OWNED ? plasmaUnlocked === true : plasmaUnlocked === false),
    'unlocked=[' + u3.unlocked.join(',') + '] plasma.unlocked=' + plasmaUnlocked);

  // d6 : unlock 'streak' (série quotidienne >= 3, réussites >= 1200) -> glitch
  M = freshMeta();
  M.recordRun({ mode: 'daily', score: 1200, maxCombo: 1, dateStr: '2026-07-20' });
  M.recordRun({ mode: 'daily', score: 1200, maxCombo: 1, dateStr: '2026-07-21' });
  var u6 = M.recordRun({ mode: 'daily', score: 1200, maxCombo: 1, dateStr: '2026-07-22' });
  check('d6) unlock GLITCH à la série de 3', u6.streak === 3 && u6.unlocked.indexOf('glitch') !== -1,
    'streak=' + u6.streak + ' unlocked=[' + u6.unlocked.join(',') + ']');

  // d7 : equipBlade refuse une lame verrouillée, accepte une débloquée
  M = freshMeta();
  var refuse = M.equipBlade('phantom'); // verrouillée
  var accept = M.equipBlade('neon');    // par défaut
  check('d7) equipBlade — refus si verrouillée, accepte si débloquée',
    (CONFIG.TEST_ALL_OWNED ? refuse === true : refuse === false) && accept === true,
    'phantom=' + refuse + ' neon=' + accept);
})();

/* ============================================================ CASE e : daily WIN */
(function () {
  var d = runDailyPerfect(555, 180, 3);
  var ok = !d.threw && d.won && d.finalStatus === 'WIN'
    && d.dailyWinEvents === 1
    && d.winScore >= 1200
    && d.eventsAfterWin === 0
    && !d.spawnGrewAfterWin
    && !d.livesDroppedAfterWin;
  check('e) daily bot parfait — status WIN + event dailyWin unique + plus aucun spawn/perte de vie', ok,
    'won=' + d.won + ', status=' + d.finalStatus + ', score=' + d.finalScore
    + ', dailyWinEvents=' + d.dailyWinEvents + ', eventsAfterWin=' + d.eventsAfterWin
    + ', spawnGrewAfterWin=' + d.spawnGrewAfterWin + ', livesDroppedAfterWin=' + d.livesDroppedAfterWin
    + (d.threw ? ', EXC=' + d.err : ''));
})();

/* ==================================================== CASE e2-e4 : économie */
(function () {
  // e2 : première réussite quotidienne -> shardsEarned = WIN_REWARD + BONUS*streak ;
  // rejouer le même jour -> 0 (valeurs lues dans CONFIG pour suivre l'équilibrage)
  var M = freshMeta();
  var win1 = M.recordRun({ mode: 'daily', score: 1250, maxCombo: 5, dateStr: '2026-07-20' });
  var expected1 = CONFIG.ECONOMY.DAILY_WIN_REWARD + CONFIG.ECONOMY.DAILY_STREAK_BONUS * win1.streak;
  var replaySameDay = M.recordRun({ mode: 'daily', score: 1300, maxCombo: 5, dateStr: '2026-07-20' });
  check('e2) 1ère réussite daily -> shardsEarned=WIN_REWARD+BONUS*streak, rejouer le même jour -> 0',
    win1.shardsEarned === expected1 && win1.shards === expected1
    && replaySameDay.shardsEarned === 0 && replaySameDay.shards === expected1,
    'win1=' + win1.shardsEarned + '/' + win1.shards + ' replay=' + replaySameDay.shardsEarned + '/' + replaySameDay.shards);

  // e3 : arcade -> floor(score / ARCADE_RATE) éclats
  var M3 = freshMeta();
  var arc = M3.recordRun({ mode: 'arcade', score: 2600, maxCombo: 3 });
  check('e3) arcade 2600 pts -> 2 éclats', arc.shardsEarned === 2 && arc.shards === 2,
    'shardsEarned=' + arc.shardsEarned + ' shards=' + arc.shards);

  // e4 : buyBlade — refus solde insuffisant / achat OK / re-achat refusé / lame 'streak' refusée
  var M4 = freshMeta();
  var refuseNoMoney = M4.buyBlade('volt'); // shards=0, price 150
  var funded = M4.recordRun({ mode: 'arcade', score: 200000, maxCombo: 1 }); // 200 éclats
  var buyOk = M4.buyBlade('volt'); // price 150 -> ok, reste 50
  var buyAgain = M4.buyBlade('volt'); // déjà possédée -> refus
  var buyStreak = M4.buyBlade('glitch'); // type 'streak' -> jamais achetable -> refus
  check('e4) buyBlade — refus solde insuffisant, achat OK débite+déverrouille, re-achat refusé, lame streak refusée',
    refuseNoMoney.ok === false && refuseNoMoney.shards === 0
    && funded.shards === 200
    && buyOk.ok === true && buyOk.shards === 50
    && M4.getBlades().filter(function (b) { return b.id === 'volt'; })[0].unlocked === true
    && buyAgain.ok === false && buyAgain.shards === 50
    && buyStreak.ok === false && buyStreak.shards === 50,
    'refuse=' + refuseNoMoney.ok + ' buyOk=' + buyOk.ok + '/' + buyOk.shards
    + ' buyAgain=' + buyAgain.ok + ' buyStreak=' + buyStreak.ok);
})();

/* ========================================================= CASE e5 : migration */
(function () {
  // e5 : une ancienne sauvegarde sans champ shards, chargée -> shards 0, unlocked conservées
  var pCfg = require.resolve('../js/config.js');
  var pMeta = require.resolve('../js/meta.js');
  delete require.cache[pCfg];
  delete require.cache[pMeta];

  var fakeLS = {
    _store: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem: function (k, v) { this._store[k] = String(v); },
  };
  var hadWindow = typeof global.window !== 'undefined';
  var prevWindow = global.window;
  global.window = { localStorage: fakeLS }; // force meta.js à passer par le fallback "localStorage"

  var oldSave = {
    // ancienne sauvegarde SANS champ shards (avant l'introduction de l'économie)
    best: 4200, bestCombo: 12, totalScore: 15000,
    blades: { unlocked: ['neon', 'aurum', 'plasma'], equipped: 'aurum' },
    daily: { lastDate: '2026-07-18', streak: 2, scores: { '2026-07-18': 1300 } },
  };
  fakeLS.setItem('bladeExeSave.v1', JSON.stringify(oldSave));

  var M5 = require('../js/meta.js');
  var loaded = M5.load();

  check('e5) migration — save sans shards -> shards 0, unlocked conservées',
    loaded.shards === 0
    && loaded.blades.unlocked.indexOf('aurum') !== -1
    && loaded.blades.unlocked.indexOf('plasma') !== -1
    && loaded.blades.equipped === 'aurum',
    'shards=' + loaded.shards + ' unlocked=[' + loaded.blades.unlocked.join(',') + ']');

  // restauration de l'environnement Node pour ne pas polluer d'éventuels tests suivants
  if (hadWindow) global.window = prevWindow; else delete global.window;
  delete require.cache[pCfg];
  delete require.cache[pMeta];
})();

/* ======================================================== CASE f : NIVEAUX */

/* ---- f1) levelSpec : déterminisme + courbe (target croissant, grow décroissant,
   virusP=0 avant le nv 4 dans le monde 1) */
(function () {
  var s1 = BladeLevels.levelSpec(0, 5);
  var s2 = BladeLevels.levelSpec(0, 5);
  check('f1a) levelSpec déterministe (2 appels identiques)', JSON.stringify(s1) === JSON.stringify(s2));

  var okAll = true, detail = '';
  for (var w = 0; w < 2; w++) {
    var prevT = -Infinity, prevG = Infinity;
    for (var i = 1; i <= CONFIG.LEVELS.PER_WORLD; i++) {
      var sp = BladeLevels.levelSpec(w, i);
      if (sp.target <= prevT) { okAll = false; detail += 'target monde' + w + ' nv' + i + ' non croissant; '; }
      if (sp.grow >= prevG) { okAll = false; detail += 'grow monde' + w + ' nv' + i + ' non décroissant; '; }
      if (w === 0 && i < 4 && sp.virusP !== 0) { okAll = false; detail += 'virusP monde0 nv' + i + '!=0; '; }
      prevT = sp.target; prevG = sp.grow;
    }
  }
  check('f1b) courbe — target strictement croissant, grow décroissant, virusP=0 avant nv4 (monde 1)', okAll, detail);
})();

/* ---- f2) gates */
(function () {
  var g11a = BladeLevels.levelGate(0, 11), g11b = BladeLevels.levelGate(1, 11);
  var g21 = BladeLevels.levelGate(0, 21);
  var wg1 = BladeLevels.worldGate(1);
  check('f2) gates — levelGate(*,11)=15, levelGate(*,21)=35, worldGate(1)=55',
    g11a === 15 && g11b === 15 && g21 === 35 && wg1 === 55,
    'g11=' + g11a + '/' + g11b + ' g21=' + g21 + ' worldGate1=' + wg1);
})();

/* ---- f3) recordLevel : récompenses, rejouer sans améliorer, boss x2 */
(function () {
  var BladeMeta = freshMeta();
  var r1 = BladeMeta.recordLevel({ worldId: 'inferno', levelIdx: 1, stars: 2, score: 400 });
  var r2 = BladeMeta.recordLevel({ worldId: 'inferno', levelIdx: 1, stars: 2, score: 450 });
  var r3 = BladeMeta.recordLevel({ worldId: 'inferno', levelIdx: 1, stars: 3, score: 500 });
  check('f3a) première réussite 2★ niveau normal = 20+2×10=40 ◆, rejouer 2★=0, passer à 3★=+10',
    r1.shardsEarned === 40 && r1.improved === true
    && r2.shardsEarned === 0 && r2.improved === false
    && r3.shardsEarned === 10 && r3.improved === true,
    'r1=' + r1.shardsEarned + ' r2=' + r2.shardsEarned + ' r3=' + r3.shardsEarned);

  var rBoss = BladeMeta.recordLevel({ worldId: 'inferno', levelIdx: 10, stars: 2, score: 900 });
  check('f3b) niveau boss — récompense ×2 (20+2×10)×2=80', rBoss.shardsEarned === 80, 'shardsEarned=' + rBoss.shardsEarned);
})();

/* ---- f4) simulation engine mode 'level' */
function runLevelPerfect(worldIdx, levelIdx, maxSeconds) {
  var spec = BladeLevels.levelSpec(worldIdx, levelIdx);
  var stats = { threw: false, err: null, levelWinEvents: 0, winStars: null, finalStatus: null };
  try {
    var engine = BladeEngine.create({ mode: 'level', seed: spec.seed, viewport: { w: VIEW.w, h: VIEW.h }, level: spec });
    var frames = Math.round(maxSeconds / DT);
    for (var f = 0; f < frames; f++) {
      var ev = engine.update(DT);
      for (var k = 0; k < ev.length; k++) {
        if (ev[k].type === 'levelWin') { stats.levelWinEvents++; stats.winStars = ev[k].stars; }
      }
      var objs = engine.state.objs;
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (o.virus) continue;
        var r = perfectSlice(engine, o);
        if (r) for (var k2 = 0; k2 < r.length; k2++) {
          if (r[k2].type === 'levelWin') { stats.levelWinEvents++; stats.winStars = r[k2].stars; }
        }
      }
      if (engine.state.status !== 'PLAY') break;
    }
    stats.finalStatus = engine.state.status;
  } catch (e) { stats.threw = true; stats.err = e && e.message; }
  return stats;
}

function runLevelPassive(worldIdx, levelIdx, maxSeconds) {
  var spec = BladeLevels.levelSpec(worldIdx, levelIdx);
  var stats = { threw: false, err: null, finalStatus: null };
  try {
    var engine = BladeEngine.create({ mode: 'level', seed: spec.seed, viewport: { w: VIEW.w, h: VIEW.h }, level: spec });
    var frames = Math.round(maxSeconds / DT);
    for (var f = 0; f < frames; f++) {
      engine.update(DT);
      if (engine.state.status !== 'PLAY') break;
    }
    stats.finalStatus = engine.state.status;
  } catch (e) { stats.threw = true; stats.err = e && e.message; }
  return stats;
}

(function () {
  var p = runLevelPerfect(0, 1, 60);
  check('f4a) mode level — bot parfait monde0 nv1 -> WIN + levelWin stars=3', !p.threw
    && p.finalStatus === 'WIN' && p.levelWinEvents === 1 && p.winStars === 3,
    'status=' + p.finalStatus + ' levelWinEvents=' + p.levelWinEvents + ' stars=' + p.winStars
    + (p.threw ? ' EXC=' + p.err : ''));

  var q = runLevelPassive(0, 1, 60);
  check('f4b) mode level — bot passif -> OVER', !q.threw && q.finalStatus === 'OVER',
    'status=' + q.finalStatus + (q.threw ? ' EXC=' + q.err : ''));
})();

/* ======================================================== CASE g1 : revive */
(function () {
  var engine = BladeEngine.create({ mode: 'arcade', seed: 777, viewport: { w: VIEW.w, h: VIEW.h } });
  var frames = Math.round(60 / DT);
  for (var f = 0; f < frames; f++) {
    engine.update(DT);
    if (engine.state.status === 'OVER') break;
  }
  var scoreBefore = engine.state.score;
  var maxComboBefore = engine.state.maxCombo;
  var wasOver = engine.state.status === 'OVER';
  var r = engine.revive();
  check('g1a) revive() après OVER en arcade -> true, status PLAY, lives 1, score/maxCombo conservés, objs vides',
    wasOver && r === true && engine.state.status === 'PLAY' && engine.state.lives === 1
    && engine.state.combo === 0 && engine.state.objs.length === 0
    && engine.state.score === scoreBefore && engine.state.maxCombo === maxComboBefore,
    'wasOver=' + wasOver + ' r=' + r + ' status=' + engine.state.status + ' lives=' + engine.state.lives
    + ' objs=' + engine.state.objs.length + ' score=' + engine.state.score + '/' + scoreBefore);

  var r2 = engine.revive();
  check('g1b) revive() en PLAY -> false', r2 === false, 'r2=' + r2);

  var daily = BladeEngine.create({ mode: 'daily', seed: 42, viewport: { w: VIEW.w, h: VIEW.h } });
  var framesD = Math.round(300 / DT);
  for (var fd = 0; fd < framesD; fd++) {
    daily.update(DT);
    if (daily.state.status !== 'PLAY') break;
  }
  var r3 = daily.revive();
  check('g1c) revive() en mode daily OVER -> false', daily.state.status === 'OVER' && r3 === false,
    'dailyStatus=' + daily.state.status + ' r3=' + r3);
})();

/* ==================================================== CASE g2 : gamesPlayed */
(function () {
  var M = freshMeta();
  var before = M.get().gamesPlayed;
  M.recordRun({ mode: 'arcade', score: 100, maxCombo: 1 });
  var afterRun = M.get().gamesPlayed;
  M.recordLevel({ worldId: 'inferno', levelIdx: 1, stars: 2, score: 400 });
  var afterLevel = M.get().gamesPlayed;
  check('g2) gamesPlayed s\'incrémente sur recordRun et recordLevel',
    before === 0 && afterRun === 1 && afterLevel === 2,
    'before=' + before + ' afterRun=' + afterRun + ' afterLevel=' + afterLevel);
})();

/* ==================================================== CASE g3 : addShards */
(function () {
  var M = freshMeta();
  var before = M.get().shards;
  var result = M.addShards(50);
  var after = M.get().shards;
  check('g3) addShards(50) crédite le solde', before === 0 && result === 50 && after === 50,
    'before=' + before + ' result=' + result + ' after=' + after);
})();

/* ==================================================== CASE h1 : migration themes */
(function () {
  // h1 : une ancienne sauvegarde sans champ themes, chargée -> unlocked ['grid'], equipped 'grid'
  var pCfg = require.resolve('../js/config.js');
  var pMeta = require.resolve('../js/meta.js');
  delete require.cache[pCfg];
  delete require.cache[pMeta];

  var fakeLS = {
    _store: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem: function (k, v) { this._store[k] = String(v); },
  };
  var hadWindow = typeof global.window !== 'undefined';
  var prevWindow = global.window;
  global.window = { localStorage: fakeLS };

  var oldSave = {
    best: 4200, bestCombo: 12, totalScore: 15000, shards: 500,
    blades: { unlocked: ['neon'], equipped: 'neon' },
    daily: { lastDate: null, streak: 0, scores: {} },
  };
  fakeLS.setItem('bladeExeSave.v1', JSON.stringify(oldSave));

  var Mh1 = require('../js/meta.js');
  var loadedH1 = Mh1.load();

  check('h1) migration — save sans themes -> unlocked [grid], equipped grid',
    Array.isArray(loadedH1.themes.unlocked) && loadedH1.themes.unlocked.length === 1
    && loadedH1.themes.unlocked[0] === 'grid' && loadedH1.themes.equipped === 'grid',
    'unlocked=[' + loadedH1.themes.unlocked.join(',') + '] equipped=' + loadedH1.themes.equipped);

  if (hadWindow) global.window = prevWindow; else delete global.window;
  delete require.cache[pCfg];
  delete require.cache[pMeta];
})();

/* ==================================================== CASE h2 : buyTheme */
// Robuste à la phase de test « thèmes gratuits » : on cherche un thème payant ;
// s'il n'y en a aucun (tous à price 0), on vérifie qu'ils sont possédés d'office.
function firstPaidTheme() {
  for (var i = 0; i < CONFIG.THEMES.length; i++) {
    if (CONFIG.THEMES[i].price > 0) return CONFIG.THEMES[i];
  }
  return null;
}
(function () {
  var M = freshMeta();
  var paid = firstPaidTheme();
  if (!paid) {
    var allOwned = M.getThemes().every(function (t) { return t.unlocked === true; });
    var buyGrid0 = M.buyTheme('grid');
    check('h2) thèmes gratuits (phase de test) — tous possédés d\'office, price 0 jamais achetable',
      allOwned && buyGrid0.ok === false, 'allOwned=' + allOwned + ' buyGrid=' + buyGrid0.ok);
    return;
  }
  var refuseNoMoney = M.buyTheme(paid.id); // shards=0
  var funded = M.addShards(paid.price);
  var buyOk = M.buyTheme(paid.id); // -> ok, reste 0
  var buyAgain = M.buyTheme(paid.id); // déjà possédé -> refus
  var buyGrid = M.buyTheme('grid'); // price 0 -> jamais achetable -> refus
  check('h2) buyTheme — refus solde insuffisant, achat ' + paid.name + ' ok (débite ' + paid.price + '), re-achat refusé, achat grid refusé',
    refuseNoMoney.ok === false && refuseNoMoney.shards === 0
    && funded === paid.price
    && buyOk.ok === true && buyOk.shards === 0
    && M.getThemes().filter(function (t) { return t.id === paid.id; })[0].unlocked === true
    && buyAgain.ok === false && buyAgain.shards === 0
    && buyGrid.ok === false && buyGrid.shards === 0,
    'refuse=' + refuseNoMoney.ok + ' buyOk=' + buyOk.ok + '/' + buyOk.shards
    + ' buyAgain=' + buyAgain.ok + ' buyGrid=' + buyGrid.ok);
})();

/* ==================================================== CASE h3 : equipTheme */
(function () {
  var M = freshMeta();
  var paid = firstPaidTheme();
  if (!paid) {
    var acceptFree = M.equipTheme('void'); // gratuit en phase de test -> équipable direct
    check('h3) equipTheme — thème gratuit équipable directement (phase de test)', acceptFree === true,
      'equip void=' + acceptFree);
    return;
  }
  var refuse = M.equipTheme(paid.id); // non possédé (accepté en mode test tout possédé)
  M.addShards(paid.price);
  M.buyTheme(paid.id);
  var accept = M.equipTheme(paid.id); // possédé après achat
  check('h3) equipTheme — refus si non possédé, ok après achat',
    (CONFIG.TEST_ALL_OWNED ? refuse === true : refuse === false) && accept === true,
    'sakura(non possédé)=' + refuse + ' sakura(après achat)=' + accept);
})();

/* ---------------------------------------------------------------- rapport */
console.log('\n=== BLADE.EXE — simulation.test.js ===');
console.log(results.join('\n'));
console.log('\n---> ' + pass + ' PASS / ' + fail + ' FAIL\n');
process.exit(fail ? 1 : 0);
