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

  var menu = {
    blades: blades,
    bladeIndex: equippedIdx,
    muted: false,
    unlockedThisRun: []
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
    BladeAudio.startMusic();
  }

  function handleRunEnd(e, nextScreen) {
    if (overHandled) return;
    overHandled = true;
    var dateStr = (currentMode === "daily") ? BladeMeta.todayStr() : undefined;
    var res = BladeMeta.recordRun({ mode: currentMode, score: e.score, maxCombo: e.maxCombo, dateStr: dateStr });
    refreshMeta();
    menu.unlockedThisRun = res.unlocked || [];
    BladeAudio.stopMusic();
    screen = nextScreen;
  }

  var SOUND_FOR_EVENT = {
    slice: "slice", wrong: "wrong", virus: "virus", miss: "miss", wave: "wave",
    slowmo: "slowmo", bossSpawn: "boss", bossCut: "slice", bossDone: "bossDone", over: "over",
    dailyWin: "dailyWin"
  };
  function routeEvents(events) {
    if (!events || !events.length) return;
    BladeUI.onEvents(events);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var s = SOUND_FOR_EVENT[ev.type];
      if (s) BladeAudio.play(s);
      if (ev.type === "wave") BladeAudio.setMusicIntensity((ev.id - 1) / 5);
      if (ev.type === "over") handleRunEnd(ev, "OVER");
      if (ev.type === "dailyWin") handleRunEnd(ev, "WIN");
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
    switch (action) {
      case "arcade": BladeAudio.play("click"); startRun("arcade"); break;
      case "daily": BladeAudio.play("click"); startRun("daily"); break;
      case "replay": BladeAudio.play("click"); startRun(currentMode); break;
      case "menu": BladeAudio.play("click"); BladeAudio.stopMusic(); refreshMeta(); screen = "TITLE"; break;
      case "mute":
        BladeAudio.setMuted(!BladeAudio.muted);
        menu.muted = BladeAudio.muted;
        BladeAudio.play("click");
        break;
      case "bladePrev": cycleBlade(-1); break;
      case "bladeNext": cycleBlade(1); break;
      default: break;
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
  function onDown(e) {
    e.preventDefault();
    BladeAudio.unlock();
    var p = getXY(e);
    if (screen === "PLAY") {
      slicing = true;
      routeEvents(engine.strokeStart(p.x, p.y));
      BladeUI.strokePoint(p.x, p.y);
    } else {
      handleAction(BladeUI.hitTest(p.x, p.y, screen));
    }
  }
  function onMove(e) {
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
  function frame(now) {
    var dt = (now - t0) / 1000; t0 = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    if (screen === "PLAY" && engine) {
      routeEvents(engine.update(dt));
    }

    var view = { screen: screen, engineState: engine ? engine.state : null, meta: meta, menu: menu, mode: currentMode };
    if (screen === "TITLE") view.debug = BladeAudio.debugInfo();
    BladeUI.render(dt, view);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
