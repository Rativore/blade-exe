/* ============================================================================
 * BLADE.EXE — js/engine.js — BladeEngine
 * ----------------------------------------------------------------------------
 * Logique pure du jeu. ZÉRO DOM. Déterministe : même seed + mêmes appels
 * (update/strokeStart/strokeMove/strokeEnd/resize) ⇒ même partie.
 * RNG interne mulberry32 seedé — jamais Math.random.
 * Géométrie et règles reprises de la maquette validée (segDist, angDiff,
 * testCut, tolérance ±30°, shrink 0.7, cooldown 0.35 s, combo, slow-mo).
 * Testable sous Node : require('./levels.js') et require('./config.js').
 * ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var D2R = Math.PI / 180;
  var DIRS4 = [0, 90, 180, 270];
  var DIRS8 = [0, 45, 90, 135, 180, 225, 270, 315];

  /* ------------------------------------------------------------ dépendances */
  function resolveConfig() {
    if (typeof window !== 'undefined' && window.CONFIG) return window.CONFIG;
    if (typeof require !== 'undefined') { try { return require('./config.js'); } catch (e) {} }
    return null;
  }
  function resolveLevels() {
    if (typeof window !== 'undefined' && window.BladeLevels) return window.BladeLevels;
    if (typeof require !== 'undefined') { try { return require('./levels.js'); } catch (e) {} }
    return null;
  }

  /* ------------------------------------------------------------------- RNG */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* -------------------------------------------------------------- géométrie */
  function segDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  function angDiff(a, b) {
    var d = Math.abs(a - b) % TAU;
    if (d > Math.PI) d = TAU - d;
    return d;
  }

  /* ============================================================== Engine */
  function Engine(opts) {
    opts = opts || {};
    this.CFG = resolveConfig();
    this.LV = resolveLevels();
    if (!this.CFG) throw new Error('BladeEngine: CONFIG introuvable');
    if (!this.LV) throw new Error('BladeEngine: BladeLevels introuvable');

    this.mode = (opts.mode === 'daily') ? 'daily'
              : (opts.mode === 'level') ? 'level' : 'arcade';
    this.level = (this.mode === 'level') ? (opts.level || null) : null;
    this.seed = (opts.seed | 0) || 1;
    this.rng = mulberry32(this.seed);

    var vp = opts.viewport || {};
    this.W = vp.w || 360;
    this.H = vp.h || 640;
    this.MIN = Math.min(this.W, this.H);

    // état interne / cadence
    this.spawnT = 0.4;
    this.bossCount = 0;   // nombre de boss déjà déclenchés
    this.bossActive = false;
    this._levelBossSpawned = false;   // mode level : un seul boss autorisé
    this.stroking = false;
    this.lastPt = null;

    var w0 = this.LV.waveFor(0);
    this.state = {
      status: 'PLAY',
      score: 0,
      lives: this.CFG.RUN.LIVES,
      combo: 0,
      mult: 0,
      maxCombo: 0,
      wave: { id: w0.id, name: w0.name },
      slowmo: 0,
      target: this.level ? this.level.target : null,   // barre de progression (level uniquement)
      objs: []
    };
    this._objs = this.state.objs;
  }

  /* --------------------------------------------------------------- helpers */
  Engine.prototype._pickDir = function (dirsCount) {
    var arr = dirsCount === 4 ? DIRS4 : DIRS8;
    return arr[(this.rng() * arr.length) | 0] * D2R;
  };
  Engine.prototype._buildSeq = function (dirsCount, len) {
    var seq = [];
    for (var i = 0; i < len; i++) seq.push(this._pickDir(dirsCount));
    return seq;
  };
  Engine.prototype._setCombo = function (c) {
    this.state.combo = c;
    this.state.mult = Math.min(c, this.CFG.CUT.COMBO_MULT_MAX);
    if (c > this.state.maxCombo) this.state.maxCombo = c;
  };

  /* ---------------------------------------------------------------- spawn */
  Engine.prototype._spawnObj = function (wave, virus) {
    var OBJ = this.CFG.OBJ, MIN = this.MIN, W = this.W, H = this.H;
    var maxS = OBJ.MAX_SIZE * MIN;
    var startS = OBJ.START_SIZE * MIN;
    var m = maxS + 6;
    var x = m + this.rng() * Math.max(0, W - 2 * m);
    var yTop = OBJ.SPAWN_MARGIN_TOP + m, yBot = H - m - OBJ.SPAWN_MARGIN_BOTTOM;
    var y = yTop + this.rng() * Math.max(10, yBot - yTop);
    var rotSpeed = wave.rotSpeed || 0;
    var rot = rotSpeed > 0 ? (this.rng() < 0.5 ? -rotSpeed : rotSpeed) : 0;
    var seq = virus ? [] : this._buildSeq(wave.dirs, wave.seqLen);
    var o = {
      x: x, y: y, size: startS, maxS: maxS,
      rate: (maxS - startS) / wave.grow,
      seq: seq, idx: 0,
      req: virus ? 0 : seq[0],
      rotAcc: 0,
      virus: !!virus, boss: false,
      rot: rot,
      hue: this.rng() < 0.5 ? 'CY' : 'MG',
      spin: this.rng() * TAU,
      cool: 0
    };
    this._objs.push(o);
  };

  Engine.prototype._spawnBoss = function (events) {
    var OBJ = this.CFG.OBJ, BOSS = this.CFG.BOSS, MIN = this.MIN, W = this.W, H = this.H;
    var spec = this.LV.bossSpec(this.bossCount);
    var maxS = BOSS.SIZE * MIN;
    var startS = OBJ.START_SIZE * MIN;
    var y = Math.max(OBJ.SPAWN_MARGIN_TOP + maxS, H * 0.45);
    var seq = this._buildSeq(8, spec.seqLen);
    var o = {
      x: W / 2, y: y, size: startS, maxS: maxS,
      rate: (maxS - startS) / spec.growTime,
      growStartS: startS,
      seq: seq, idx: 0,
      req: seq[0],
      rotAcc: 0,
      virus: false, boss: true,
      rot: 0,
      hue: this.rng() < 0.5 ? 'CY' : 'MG',
      spin: this.rng() * TAU,
      cool: 0
    };
    this._objs.push(o);
    this.bossActive = true;
    this.bossCount++;
    events.push({ type: 'bossSpawn' });
  };

  /* ----------------------------------------------------------- perte de vie */
  Engine.prototype._loseLife = function (events) {
    this._setCombo(0);
    this.state.lives--;
    if (this.state.lives <= 0) {
      this.state.status = 'OVER';
      events.push({ type: 'over', score: this.state.score, maxCombo: this.state.maxCombo });
    }
  };

  /* ------------------------------------------------------------- résolution */
  Engine.prototype._resolveCut = function (x1, y1, x2, y2, ang, events) {
    var CUT = this.CFG.CUT, BOSS = this.CFG.BOSS;
    var objs = this._objs;
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      if (o.cool > 0) continue;
      if (segDist(o.x, o.y, x1, y1, x2, y2) > o.size) continue;

      // --- virus : le toucher coûte une vie
      if (o.virus) {
        objs.splice(i, 1);
        events.push({ type: 'virus', x: o.x, y: o.y });
        this._loseLife(events);
        return; // un seul objet par micro-segment
      }

      var good = angDiff(ang, o.req) <= CUT.TOLERANCE_DEG * D2R;

      // --- boss
      if (o.boss) {
        if (good) {
          var mB = this._afterGoodCut(events);
          var pB = BOSS.POINTS_PER_CUT * mB;
          this.state.score += pB;
          o.idx++;
          o.size = o.growStartS + (o.maxS - o.growStartS) * 0.5; // timer -> 50 %
          var remaining = o.seq.length - o.idx;
          events.push({ type: 'bossCut', remaining: remaining, x: o.x, y: o.y });
          this._checkWin(events);
          if (remaining <= 0) {
            var done = BOSS.POINTS_DONE * mB;
            this.state.score += done;
            objs.splice(i, 1);
            this.bossActive = false;
            events.push({ type: 'bossDone', points: done, x: o.x, y: o.y });
            this._checkWin(events);
          } else {
            o.req = o.seq[o.idx] + o.rotAcc;
          }
        } else {
          this._setCombo(0);
          o.cool = CUT.WRONG_COOLDOWN;
          events.push({ type: 'wrong', x: o.x, y: o.y });
        }
        return;
      }

      // --- fragment de données normal
      if (good) {
        var mN = this._afterGoodCut(events);
        var pN = CUT.POINTS_BASE * mN;
        this.state.score += pN;
        events.push({
          type: 'slice', x: o.x, y: o.y, size: o.size,
          angle: ang, hue: o.hue, points: pN, combo: this.state.combo
        });
        o.idx++;
        if (o.idx >= o.seq.length) {
          objs.splice(i, 1);
        } else {
          o.req = o.seq[o.idx] + o.rotAcc; // coupe suivante (objet à double coupe)
        }
        this._checkWin(events);
      } else {
        this._setCombo(0);
        o.size *= CUT.WRONG_SHRINK;
        o.cool = CUT.WRONG_COOLDOWN;
        events.push({ type: 'wrong', x: o.x, y: o.y });
      }
      return; // un seul objet par micro-segment
    }
  };

  // victoire (idempotent : ne redéclenche jamais l'event une fois hors PLAY) —
  // daily : score >= DAILY.GOAL -> 'dailyWin' ; level : score >= target -> 'levelWin'
  Engine.prototype._checkWin = function (events) {
    if (this.state.status !== 'PLAY') return;
    if (this.mode === 'daily') {
      if (this.state.score >= this.CFG.DAILY.GOAL) {
        this.state.status = 'WIN';
        events.push({ type: 'dailyWin', score: this.state.score, maxCombo: this.state.maxCombo });
      }
    } else if (this.mode === 'level') {
      if (this.state.score >= this.state.target) {
        this.state.status = 'WIN';
        events.push({ type: 'levelWin', score: this.state.score, maxCombo: this.state.maxCombo, stars: this.state.lives });
      }
    }
  };

  // incrémente le combo, gère le slow-mo, renvoie le multiplicateur courant
  Engine.prototype._afterGoodCut = function (events) {
    var CUT = this.CFG.CUT;
    this._setCombo(this.state.combo + 1);
    var combo = this.state.combo;
    if (combo > 0 && combo % CUT.SLOWMO_EVERY === 0) {
      this.slowmo = CUT.SLOWMO_DURATION;
      this.state.slowmo = this.slowmo;
      events.push({ type: 'slowmo' });
    }
    return this.state.mult;
  };

  /* ---------------------------------------------------------------- update */
  Engine.prototype.update = function (dt) {
    var events = [];
    if (this.state.status !== 'PLAY') return events;
    var CFG = this.CFG, LV = this.LV, CUT = CFG.CUT, OBJ = CFG.OBJ;

    // slow-mo : ralentit le monde, jamais l'input
    if (this.slowmo > 0) this.slowmo -= dt;
    if (this.slowmo < 0) this.slowmo = 0;
    this.state.slowmo = this.slowmo || 0;
    var ts = this.state.slowmo > 0 ? CUT.SLOWMO_SCALE : 1;
    var wdt = dt * ts;

    // vague courante — mode level : paramètres de spawn FIXES (pas de waveFor,
    // pas d'événement 'wave')
    var wave;
    if (this.mode === 'level') {
      wave = this.level;
    } else {
      wave = LV.waveFor(this.state.score);
      if (wave.id !== this.state.wave.id) {
        this.state.wave = { id: wave.id, name: wave.name };
        events.push({ type: 'wave', id: wave.id, name: wave.name });
      }
    }

    // apparition d'un boss — level : UN seul boss quand score >= bossAt×target
    // (si bossAt non null) ; arcade/daily : boss récurrents selon les seuils
    if (this.mode === 'level') {
      if (this.level.bossAt != null && !this.bossActive && !this._levelBossSpawned &&
          this.state.score >= this.level.bossAt * this.state.target) {
        this._spawnBoss(events);
        this._levelBossSpawned = true;
      }
    } else if (!this.bossActive && this.state.score >= LV.nextBossScore(this.bossCount)) {
      this._spawnBoss(events);
    }

    // spawn normal (densité réduite de moitié pendant un boss)
    var effMax = this.bossActive ? Math.max(1, Math.round(wave.maxObjs / 2)) : wave.maxObjs;
    var normalCount = 0;
    for (var c = 0; c < this._objs.length; c++) if (!this._objs[c].boss) normalCount++;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && normalCount < effMax) {
      var n = Math.min(wave.batch, effMax - normalCount);
      for (var s = 0; s < n; s++) {
        var isV = this.rng() < wave.virusP;
        this._spawnObj(wave, isV);
      }
      this.spawnT = wave.interval * (0.75 + this.rng() * 0.5);
    }

    // croissance des objets vers le joueur
    var objs = this._objs;
    for (var i = objs.length - 1; i >= 0; i--) {
      var o = objs[i];
      if (o.cool > 0) o.cool -= dt;
      o.size += o.rate * wdt;
      o.spin += OBJ.SPIN_SPEED * wdt;
      if (o.rot) {
        o.rotAcc += o.rot * wdt;
        if (!o.virus) o.req = o.seq[o.idx] + o.rotAcc;
      }
      if (o.size >= o.maxS) {
        objs.splice(i, 1);
        if (o.boss) {
          this.bossActive = false;
          events.push({ type: 'miss', x: o.x, y: o.y });
          this._loseLife(events);
        } else if (!o.virus) {
          events.push({ type: 'miss', x: o.x, y: o.y });
          this._loseLife(events);
        }
        // virus arrivé à maturité : disparaît sans pénalité (piège évité)
      }
    }
    return events;
  };

  /* ----------------------------------------------------------------- input */
  Engine.prototype.strokeStart = function (x, y) {
    this.stroking = true;
    this.lastPt = { x: x, y: y };
    return [];
  };
  Engine.prototype.strokeMove = function (x, y) {
    var events = [];
    if (this.state.status !== 'PLAY') { this.lastPt = { x: x, y: y }; return events; }
    if (!this.lastPt) { this.lastPt = { x: x, y: y }; return events; }
    var dx = x - this.lastPt.x, dy = y - this.lastPt.y;
    var minPx = this.CFG.CUT.MIN_SEG_PX;
    if (dx * dx + dy * dy > minPx * minPx) {
      this._resolveCut(this.lastPt.x, this.lastPt.y, x, y, Math.atan2(dy, dx), events);
      this.lastPt = { x: x, y: y };
    }
    return events;
  };
  Engine.prototype.strokeEnd = function () {
    this.stroking = false;
    this.lastPt = null;
    return [];
  };

  /* ---------------------------------------------------------------- revive */
  // Support du « Continuer (pub) » : uniquement si status === 'OVER' et mode
  // 'arcade' -> repasse en PLAY, lives = 1, combo = 0, vide objs (boss compris),
  // réarme le timer de spawn ; score/maxCombo conservés. Sinon -> false.
  Engine.prototype.revive = function () {
    if (this.state.status !== 'OVER' || this.mode !== 'arcade') return false;
    this.state.status = 'PLAY';
    this.state.lives = 1;
    this._setCombo(0);
    this._objs.length = 0;
    this.bossActive = false;
    this.spawnT = 0.4;
    return true;
  };

  /* ---------------------------------------------------------------- resize */
  Engine.prototype.resize = function (w, h) {
    var oldW = this.W, oldH = this.H, oldMIN = this.MIN;
    if (!w || !h) return;
    var sx = w / oldW, sy = h / oldH;
    var newMIN = Math.min(w, h), sMin = newMIN / oldMIN;
    var objs = this._objs;
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.boss) { o.x = w / 2; o.y = Math.max(this.CFG.OBJ.SPAWN_MARGIN_TOP + o.maxS * sMin, h * 0.45); }
      else { o.x *= sx; o.y *= sy; }
      o.size *= sMin;
      o.maxS *= sMin;
      o.rate *= sMin;
      if (o.growStartS != null) o.growStartS *= sMin;
    }
    this.W = w; this.H = h; this.MIN = newMIN;
  };

  /* --------------------------------------------------------------- exports */
  var BladeEngine = {
    create: function (opts) { return new Engine(opts); },
    // exposés pour tests / réutilisation
    _mulberry32: mulberry32,
    _segDist: segDist,
    _angDiff: angDiff
  };

  if (typeof window !== 'undefined') window.BladeEngine = BladeEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = BladeEngine;
})();
