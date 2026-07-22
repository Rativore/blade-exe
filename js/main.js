/* ============================================================================
 * BLADE.EXE — js/main.js — boucle, input, écrans, câblage global
 * ----------------------------------------------------------------------------
 * rAF (dt cap 0.05s), resize, input souris+tactile (preventDefault,
 * passive:false), écrans TITLE/PLAY/OVER/WIN, création engine (arcade : seed =
 * Date.now()&0xffffffff ; daily : BladeLevels.dailySeed(BladeMeta.todayStr())),
 * routage events → BladeUI.onEvents + BladeAudio.play, fin de run ('over' ou
 * 'dailyWin') → BladeMeta.recordRun. Taps sur TITLE/OVER/WIN via BladeUI.hitTest.
 * Musique : startMusic() au lancement d'un run, stopMusic() sur over/dailyWin/
 * menu, setMusicIntensity((wave.id-1)/5) à chaque event 'wave'.
 * ========================================================================== */

(function () {
  "use strict";

  var canvas = document.getElementById("game");
  BladeUI.init(canvas);

  var meta = BladeMeta.get();
  var blades = BladeMeta.getBlades();
  var equippedIdx = 0;
  for (var i = 0; i < blades.length; i++) { if (blades[i].equipped) equippedIdx = i; }
  BladeUI.setBlade(blades[equippedIdx]);

  var screen = "TITLE";   // TITLE | PLAY | OVER | WIN
  var engine = null;
  var currentMode = "arcade";
  var overHandled = false;

  // ---------------------------------------------------------------- orientation (paysage)
  var isTouch = ("ontouchstart" in window);
  var portraitBlocked = false;
  function updatePortraitBlocked() {
    portraitBlocked = isTouch && (window.innerHeight > window.innerWidth);
  }
  updatePortraitBlocked();
  window.addEventListener("resize", updatePortraitBlocked);
  window.addEventListener("orientationchange", updatePortraitBlocked);
  function tryLockLandscape() {
    try {
      var so = window.screen; // ne pas confondre avec la variable locale `screen` (état d'écran du jeu)
      if (so && so.orientation && typeof so.orientation.lock === "function") {
        so.orientation.lock("landscape").catch(function () {});
      }
    } catch (err) { /* noop — iOS refuse, l'overlay suffit */ }
  }

  var menu = {
    blades: blades,
    bladeIndex: equippedIdx,
    muted: false,
    unlockedThisRun: [],
    shopIndex: 0,
    shardsEarnedThisRun: 0,
    worldIndex: 0,
    levelIndex: 1,
    levelResult: null
  };

  function refreshMeta() {
    meta = BladeMeta.get();
    blades = BladeMeta.getBlades();
    menu.blades = blades;
  }

  // ---------------------------------------------------------------- run flow
  function startRun(mode) {
    currentMode = mode;
    overHandled = false;
    var seed = (mode === "daily")
      ? BladeLevels.dailySeed(BladeMeta.todayStr())
      : (Date.now() & 0xffffffff);
    var size = BladeUI.resize();
    engine = BladeEngine.create({ mode: mode, seed: seed, viewport: { w: size.w, h: size.h } });
    screen = "PLAY";
    BladeAudio.startMusic("game");
  }

  function handleRunEnd(e, nextScreen) {
    if (overHandled) return;
    overHandled = true;
    var dateStr = (currentMode === "daily") ? BladeMeta.todayStr() : undefined;
    var res = BladeMeta.recordRun({ mode: currentMode, score: e.score, maxCombo: e.maxCombo, dateStr: dateStr });
    refreshMeta();
    menu.unlockedThisRun = res.unlocked || [];
    menu.shardsEarnedThisRun = res.shardsEarned || 0;
    BladeUI.setTheme(null);
    BladeAudio.stopMusic();
    BladeAudio.startMusic("menu");
    screen = nextScreen;
  }

  // ---------------------------------------------------------------- mode NIVEAUX
  function isWorldUnlocked(worldIdx) {
    if (worldIdx === 0) return true;
    var progress = BladeMeta.getLevelProgress();
    var prevStars = progress.starsByWorld[worldIdx - 1] || 0;
    return prevStars >= BladeLevels.worldGate(worldIdx);
  }
  function isLevelUnlocked(worldIdx, levelIdx) {
    if (levelIdx === 1) return true;
    var world = CONFIG.WORLDS[worldIdx];
    var progress = BladeMeta.getLevelProgress();
    var prevStars = progress.stars[world.id + "-" + (levelIdx - 1)] || 0;
    if (prevStars <= 0) return false;
    var worldStars = progress.starsByWorld[worldIdx] || 0;
    return worldStars >= BladeLevels.levelGate(worldIdx, levelIdx);
  }
  function startLevel(worldIdx, levelIdx) {
    var world = CONFIG.WORLDS[worldIdx];
    var spec = BladeLevels.levelSpec(worldIdx, levelIdx);
    currentMode = "level";
    overHandled = false;
    menu.worldIndex = worldIdx;
    menu.levelIndex = levelIdx;
    menu.levelResult = null;
    var size = BladeUI.resize();
    engine = BladeEngine.create({ mode: "level", seed: spec.seed, viewport: { w: size.w, h: size.h }, level: spec });
    BladeUI.setTheme(world.theme);
    screen = "PLAY";
    BladeAudio.startMusic(world.music);
  }
  function handleLevelEnd(success, e) {
    if (overHandled) return;
    overHandled = true;
    var world = CONFIG.WORLDS[menu.worldIndex];
    var target = engine ? engine.state.target : 0;
    var shardsEarned = 0, stars = 0;
    if (success) {
      stars = e.stars || 0;
      var res = BladeMeta.recordLevel({ worldId: world.id, levelIdx: menu.levelIndex, stars: stars, score: e.score });
      shardsEarned = (res && res.shardsEarned) || 0;
      refreshMeta();
    }
    var perWorld = (CONFIG.LEVELS && CONFIG.LEVELS.PER_WORLD) || 30;
    var hasNext = success && menu.levelIndex < perWorld && isLevelUnlocked(menu.worldIndex, menu.levelIndex + 1);
    menu.levelResult = {
      success: success, stars: stars, score: e.score, target: target,
      shardsEarned: shardsEarned, hasNext: hasNext
    };
    BladeAudio.stopMusic();
    BladeAudio.startMusic("menu");
    screen = "LEVELEND";
  }

  var SOUND_FOR_EVENT = {
    slice: "slice", wrong: "wrong", virus: "virus", miss: "miss", wave: "wave",
    slowmo: "slowmo", bossSpawn: "boss", bossCut: "slice", bossDone: "bossDone", over: "over",
    dailyWin: "dailyWin", levelWin: "dailyWin"
  };
  function routeEvents(events) {
    if (!events || !events.length) return;
    BladeUI.onEvents(events);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var s = SOUND_FOR_EVENT[ev.type];
      if (s) BladeAudio.play(s);
      if (ev.type === "wave") BladeAudio.setMusicIntensity((ev.id - 1) / 5);
      if (ev.type === "over") {
        if (currentMode === "level") handleLevelEnd(false, ev);
        else handleRunEnd(ev, "OVER");
      }
      if (ev.type === "dailyWin") handleRunEnd(ev, "WIN");
      if (ev.type === "levelWin") handleLevelEnd(true, ev);
    }
  }

  // ---------------------------------------------------------------- menu actions
  function cycleBlade(dir) {
    var n = menu.blades.length;
    if (!n) return;
    menu.bladeIndex = ((menu.bladeIndex + dir) % n + n) % n;
    var b = menu.blades[menu.bladeIndex];
    if (b.unlocked) {
      BladeMeta.equipBlade(b.id);
      BladeUI.setBlade(b);
      refreshMeta();
    }
    BladeAudio.play("click");
  }
  function handleAction(action) {
    if (!action) return;
    if (action === "world0" || action === "world1") {
      var wIdx = (action === "world0") ? 0 : 1;
      if (isWorldUnlocked(wIdx)) {
        BladeAudio.play("click");
        menu.worldIndex = wIdx;
        BladeUI.setTheme(CONFIG.WORLDS[wIdx].theme);
        screen = "LEVELS";
      } else {
        BladeAudio.play("wrong");
      }
      return;
    }
    if (action.indexOf("lvl") === 0) {
      var lvlIdx = parseInt(action.slice(3), 10);
      if (isLevelUnlocked(menu.worldIndex, lvlIdx)) {
        BladeAudio.play("click");
        startLevel(menu.worldIndex, lvlIdx);
      } else {
        BladeAudio.play("wrong");
      }
      return;
    }
    switch (action) {
      case "arcade": BladeAudio.play("click"); startRun("arcade"); break;
      case "daily": BladeAudio.play("click"); startRun("daily"); break;
      case "replay":
        BladeAudio.play("click");
        if (screen === "LEVELEND") startLevel(menu.worldIndex, menu.levelIndex);
        else startRun(currentMode);
        break;
      case "next":
        if (menu.levelResult && menu.levelResult.hasNext) {
          BladeAudio.play("click");
          startLevel(menu.worldIndex, menu.levelIndex + 1);
        }
        break;
      case "menu":
        BladeAudio.play("click"); BladeUI.setTheme(null); BladeAudio.stopMusic(); BladeAudio.startMusic("menu");
        refreshMeta(); screen = "TITLE"; break;
      case "mute":
        BladeAudio.setMuted(!BladeAudio.muted);
        menu.muted = BladeAudio.muted;
        BladeAudio.play("click");
        break;
      case "bladePrev": cycleBlade(-1); break;
      case "bladeNext": cycleBlade(1); break;
      case "shop": BladeAudio.play("click"); screen = "SHOP"; break;
      case "levels": BladeAudio.play("click"); BladeUI.setTheme(null); screen = "WORLDS"; break;
      case "back":
        BladeAudio.play("click");
        if (screen === "LEVELS") { BladeUI.setTheme(null); screen = "WORLDS"; }
        else if (screen === "LEVELEND") { screen = "LEVELS"; }
        else { screen = "TITLE"; }
        break;
      case "shopPrev": shopCycle(-1); break;
      case "shopNext": shopCycle(1); break;
      case "buy": buyShopBlade(); break;
      case "equip": equipShopBlade(); break;
      default: break;
    }
  }
  function shopCycle(dir) {
    var n = menu.blades.length;
    if (!n) return;
    menu.shopIndex = ((menu.shopIndex + dir) % n + n) % n;
    BladeAudio.play("click");
  }
  function buyShopBlade() {
    var b = menu.blades[menu.shopIndex];
    if (!b) return;
    var res = BladeMeta.buyBlade(b.id);
    refreshMeta();
    BladeAudio.play(res && res.ok ? "bossDone" : "wrong");
  }
  function equipShopBlade() {
    var b = menu.blades[menu.shopIndex];
    if (!b) return;
    var ok = BladeMeta.equipBlade(b.id);
    if (ok) {
      BladeUI.setBlade(b);
      refreshMeta();
    }
  }

  // ---------------------------------------------------------------- input
  var slicing = false;
  function getXY(e) {
    var r = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX - r.left, y: e.changedTouches[0].clientY - r.top };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  var landscapeLockTried = false;
  function onDown(e) {
    e.preventDefault();
    BladeAudio.unlock();
    updatePortraitBlocked(); // recalcul frais : les events resize/orientationchange d'iOS arrivent parfois avec des dimensions périmées
    if (isTouch && !landscapeLockTried) { landscapeLockTried = true; tryLockLandscape(); }
    if (screen === "TITLE") BladeAudio.startMusic("menu");
    if (portraitBlocked) return; // input jeu bloqué, le déblocage audio ci-dessus reste actif
    var p = getXY(e);
    if (screen === "PLAY") {
      if (BladeUI.hitTest(p.x, p.y, "PLAY") === "home") {
        BladeAudio.play("click");
        if (currentMode === "level") {
          overHandled = true;
          BladeAudio.stopMusic();
          BladeAudio.startMusic("menu");
          screen = "LEVELS";
        } else {
          handleRunEnd({ score: engine.state.score, maxCombo: engine.state.maxCombo }, "TITLE");
        }
        return;
      }
      slicing = true;
      routeEvents(engine.strokeStart(p.x, p.y));
      BladeUI.strokePoint(p.x, p.y);
    } else {
      handleAction(BladeUI.hitTest(p.x, p.y, screen));
    }
  }
  function onMove(e) {
    if (portraitBlocked) return;
    if (screen !== "PLAY" || !slicing) return;
    e.preventDefault();
    var p = getXY(e);
    routeEvents(engine.strokeMove(p.x, p.y));
    BladeUI.strokePoint(p.x, p.y);
  }
  function onUp(e) {
    BladeAudio.unlock();
    if (screen === "PLAY" && slicing) {
      routeEvents(engine.strokeEnd());
      BladeUI.strokeEnd();
    }
    slicing = false;
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp, { passive: false });
  window.addEventListener("touchcancel", onUp, { passive: false });

  // ---------------------------------------------------------------- resize
  function onResize() {
    var size = BladeUI.resize();
    if (engine) engine.resize(size.w, size.h);
  }
  window.addEventListener("resize", onResize);

  // ---------------------------------------------------------------- loop
  var t0 = performance.now();
  var lastW = window.innerWidth, lastH = window.innerHeight;
  function frame(now) {
    var dt = (now - t0) / 1000; t0 = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    // filet de sécurité iOS : détecter le changement de dimensions même si
    // resize/orientationchange n'a pas été émis (rotation, barre Safari, PWA)
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
      lastW = window.innerWidth; lastH = window.innerHeight;
      onResize();
      updatePortraitBlocked();
    }

    if (screen === "PLAY" && engine) {
      routeEvents(engine.update(dt));
    }

    var view = { screen: screen, engineState: engine ? engine.state : null, meta: meta, menu: menu, mode: currentMode, portraitBlocked: portraitBlocked };
    if (screen === "TITLE") view.debug = BladeAudio.debugInfo();
    BladeUI.render(dt, view);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
