/* ============================================================================
 * BLADE.EXE — js/ui.js — BladeUI
 * ----------------------------------------------------------------------------
 * Rendu canvas + effets cosmétiques. Reprend le feel de maquette.html : grille
 * perspective animée, hexagones néon + flèche blanche, anneau d'urgence,
 * moitiés qui s'écartent, particules, traînée 2 passes (couleurs de la lame
 * équipée), bannières, flash rouge, glitch overlay, teinte slow-mo.
 * API (contrat) : init(canvas), resize(), render(dt,view), onEvents(events),
 * strokePoint(x,y), strokeEnd(), setBlade(bladeDef), hitTest(x,y,screen).
 * ========================================================================== */

var BladeUI = (function () {
  "use strict";

  var TAU = Math.PI * 2;
  var C = (typeof CONFIG !== "undefined") ? CONFIG.COLORS :
    { BG: "#05020a", CY: "#00f0ff", MG: "#ff1fd0", DANGER: "#ff2b4a", GOLD: "#ffd000", TEXT: "#eafcff" };

  var cv = null, ctx = null;
  var W = 0, H = 0, DPR = 1, MIN = 0;

  var blade = { outer: "rgba(255,31,208,0.5)", inner: C.TEXT, glow: C.MG };

  // ---- cosmetic-only state (not part of engine state) ----------------------
  var halves = [], particles = [], trail = [];
  var waveBanner = 0, waveName = "";
  var bossBanner = 0, bossText = "";
  var glitch = 0, redFlash = 0;
  var gridT = 0, titleT = 0;

  var btnRects = { TITLE: {}, OVER: {}, WIN: {} };

  // ---------------------------------------------------------------- helpers
  function hexToRgba(hex, a) {
    var v = hex.replace("#", "");
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var r = parseInt(v.substr(0, 2), 16), g = parseInt(v.substr(2, 2), 16), b = parseInt(v.substr(4, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function colorFor(hue) { return hue === "MG" ? C.MG : C.CY; }
  function bladeName(id) {
    if (typeof CONFIG === "undefined") return id;
    for (var i = 0; i < CONFIG.BLADES.length; i++) {
      if (CONFIG.BLADES[i].id === id) return CONFIG.BLADES[i].name;
    }
    return id;
  }

  // ---------------------------------------------------------------- init/resize
  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext("2d");
    resize();
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    MIN = Math.min(W, H);
    return { w: W, h: H };
  }

  function setBlade(def) { if (def) blade = def; }

  // ---------------------------------------------------------------- stroke trail
  function strokePoint(x, y) {
    trail.push({ x: x, y: y, t: 0 });
    if (trail.length > 26) trail.shift();
  }
  function strokeEnd() { /* trail simply ages out via updateCosmetics */ }

  // ---------------------------------------------------------------- events → fx
  function onEvents(events) {
    if (!events || !events.length) return;
    for (var i = 0; i < events.length; i++) applyEvent(events[i]);
  }
  function applyEvent(e) {
    switch (e.type) {
      case "slice": spawnHalves(e); spawnParticles(e.x, e.y, colorFor(e.hue), 8); break;
      case "wrong": redFlash = Math.max(redFlash, 0.25); break;
      case "virus": redFlash = Math.max(redFlash, 0.4); spawnParticles(e.x, e.y, C.DANGER, 14); break;
      case "miss": glitch = Math.max(glitch, 0.35); break;
      case "wave": waveBanner = 1.4; waveName = e.name || ""; break;
      case "slowmo": break; // tint driven directly by engineState.slowmo in render
      case "bossSpawn": bossBanner = 1.6; bossText = "PARE-FEU DÉTECTÉ"; glitch = Math.max(glitch, 0.3); break;
      case "bossCut": spawnParticles(e.x, e.y, C.GOLD, 10); break;
      case "bossDone": bossBanner = 1.3; bossText = "PARE-FEU DÉTRUIT"; spawnParticles(e.x, e.y, C.GOLD, 26); break;
      case "over": redFlash = Math.max(redFlash, 0.5); break;
      default: break;
    }
  }
  function spawnHalves(e) {
    var n = e.angle + Math.PI / 2, spd = 120 + Math.random() * 60, col = colorFor(e.hue);
    halves.push({
      x: e.x, y: e.y, size: e.size, cut: e.angle, side: 1,
      vx: Math.cos(n) * spd, vy: Math.sin(n) * spd, rot: (Math.random() - 0.5) * 4,
      a: Math.random() * TAU, life: 0.7, max: 0.7, col: col
    });
    halves.push({
      x: e.x, y: e.y, size: e.size, cut: e.angle, side: -1,
      vx: -Math.cos(n) * spd, vy: -Math.sin(n) * spd, rot: (Math.random() - 0.5) * 4,
      a: Math.random() * TAU, life: 0.7, max: 0.7, col: col
    });
  }
  function spawnParticles(x, y, col, n) {
    n = n || 8;
    for (var k = 0; k < n; k++) {
      var pa = Math.random() * TAU, ps = 40 + Math.random() * 140;
      particles.push({ x: x, y: y, vx: Math.cos(pa) * ps, vy: Math.sin(pa) * ps, life: 0.5, max: 0.5, col: col });
    }
  }

  // ---------------------------------------------------------------- cosmetics tick
  function updateCosmetics(dt) {
    for (var h = halves.length - 1; h >= 0; h--) {
      var q = halves[h];
      q.x += q.vx * dt; q.y += q.vy * dt; q.a += q.rot * dt; q.vy += 180 * dt; q.life -= dt;
      if (q.life <= 0) halves.splice(h, 1);
    }
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
      if (pt.life <= 0) particles.splice(p, 1);
    }
    for (var tr = trail.length - 1; tr >= 0; tr--) {
      trail[tr].t += dt;
      if (trail[tr].t > 0.16) trail.splice(tr, 1);
    }
    if (waveBanner > 0) waveBanner -= dt;
    if (bossBanner > 0) bossBanner -= dt;
    if (glitch > 0) glitch -= dt;
    if (redFlash > 0) redFlash -= dt;
  }

  // ---------------------------------------------------------------- background
  function drawGrid(dt) {
    gridT += dt * 0.3;
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, W, H);
    var vpx = W / 2, vpy = H * 0.42;
    ctx.lineWidth = 1;
    for (var i = 0; i < 16; i++) {
      var f = ((i / 16) + (gridT % 1)); if (f > 1) f -= 1;
      var y = vpy + (H - vpy) * f * f;
      var al = 0.10 * (1 - f);
      ctx.strokeStyle = hexToRgba(C.CY, al.toFixed(3));
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (var j = -8; j <= 8; j++) {
      var bx = vpx + (W * 0.9) * (j / 8);
      ctx.strokeStyle = hexToRgba(C.MG, 0.06);
      ctx.beginPath(); ctx.moveTo(vpx, vpy); ctx.lineTo(bx, H); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- primitives
  function neonCircle(x, y, r, color, lw) {
    ctx.save();
    ctx.shadowBlur = 18; ctx.shadowColor = color;
    ctx.strokeStyle = color; ctx.lineWidth = lw || 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function drawArrow(o, col) {
    var r = o.size;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.req);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.shadowBlur = 14; ctx.shadowColor = col;
    ctx.lineCap = "round";
    var len = r * 0.7;
    ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len, 0); ctx.lineTo(len - r * 0.35, -r * 0.28);
    ctx.moveTo(len, 0); ctx.lineTo(len - r * 0.35, r * 0.28);
    ctx.stroke();
    ctx.restore();
  }
  function drawHex(o, col) {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.spin || 0);
    ctx.shadowBlur = 18; ctx.shadowColor = col; ctx.strokeStyle = col; ctx.lineWidth = o.boss ? 4 : 3;
    ctx.beginPath();
    for (var a = 0; a < 6; a++) {
      var an = a / 6 * TAU, px = Math.cos(an) * o.size, py = Math.sin(an) * o.size;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = o.boss ? 0.18 : 0.12; ctx.fillStyle = col; ctx.fill();
    ctx.restore();
    if (o.boss) {
      ctx.save();
      ctx.translate(o.x, o.y); ctx.rotate(-(o.spin || 0) * 0.6);
      ctx.shadowBlur = 12; ctx.shadowColor = C.GOLD; ctx.strokeStyle = C.GOLD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, o.size * 1.16, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  function drawVirus(o) {
    neonCircle(o.x, o.y, o.size, C.DANGER, 3);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = C.DANGER; ctx.shadowBlur = 16; ctx.shadowColor = C.DANGER;
    var e = o.size * 0.22;
    ctx.beginPath(); ctx.arc(-o.size * 0.32, -o.size * 0.12, e, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.size * 0.32, -o.size * 0.12, e, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.DANGER; ctx.lineWidth = Math.max(2, o.size * 0.12); ctx.shadowBlur = 10;
    for (var k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * o.size * 0.16, o.size * 0.30);
      ctx.lineTo(k * o.size * 0.16, o.size * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawUrgencyRing(o) {
    var prog = o.size / o.maxS;
    if (prog <= 0.55) return;
    ctx.save();
    ctx.strokeStyle = prog > 0.85 ? C.DANGER : C.GOLD;
    ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.size + 7, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
    ctx.restore();
  }
  function drawBossSeq(o) {
    var total = o.seq ? o.seq.length : 1;
    var remaining = total - (o.idx || 0);
    txt(remaining + " / " + total, o.x, o.y + o.size + 24, Math.round(MIN * 0.032), C.GOLD, "center", true);
  }
  function drawObj(o) {
    ctx.save();
    ctx.globalAlpha = o.cool > 0 ? 0.55 : 1;
    if (o.virus) {
      drawVirus(o);
    } else {
      var col = colorFor(o.hue);
      drawHex(o, col);
      drawArrow(o, col);
      if (o.boss) drawBossSeq(o);
    }
    ctx.restore();
    drawUrgencyRing(o);
  }
  function drawHalf(q) {
    var al = q.life / q.max;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(q.x, q.y); ctx.rotate(q.cut);
    ctx.beginPath();
    ctx.rect(-q.size - 2, q.side > 0 ? 0 : -q.size - 2, (q.size + 2) * 2, q.size + 2);
    ctx.clip();
    ctx.rotate(q.a - q.cut);
    ctx.shadowBlur = 16; ctx.shadowColor = q.col; ctx.strokeStyle = q.col; ctx.lineWidth = 3;
    ctx.beginPath();
    for (var a = 0; a < 6; a++) {
      var an = a / 6 * TAU, px = Math.cos(an) * q.size, py = Math.sin(an) * q.size;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  function drawTrail() {
    if (trail.length < 2) return;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (var i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      if (pass === 0) { ctx.strokeStyle = blade.outer; ctx.lineWidth = 16; ctx.shadowBlur = 24; ctx.shadowColor = blade.glow; }
      else { ctx.strokeStyle = blade.inner; ctx.lineWidth = 4; ctx.shadowBlur = 12; ctx.shadowColor = blade.glow; }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i], al = p.life / p.max;
      ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = p.col; ctx.shadowBlur = 10; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  function glitchOverlay(amt) {
    var n = Math.floor(6 + amt * 20);
    for (var i = 0; i < n; i++) {
      var y = Math.random() * H, hh = 2 + Math.random() * 20;
      var off = (Math.random() - 0.5) * 40;
      ctx.save();
      ctx.globalAlpha = 0.5 * amt;
      ctx.fillStyle = i % 2 ? C.CY : C.MG;
      ctx.fillRect(off, y, W, hh * amt);
      ctx.restore();
    }
  }
  function txt(s, x, y, size, col, align, glow) {
    ctx.save();
    ctx.font = '700 ' + size + 'px "Segoe UI",Arial,sans-serif';
    ctx.textAlign = align || "left"; ctx.textBaseline = "middle";
    if (glow) { ctx.shadowBlur = 16; ctx.shadowColor = col; }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  function drawHUD(state) {
    txt("SCORE " + state.score, 16, 26, 20, C.CY, "left", true);
    var lives = state.lives;
    for (var i = 0; i < 3; i++) {
      ctx.save();
      ctx.globalAlpha = i < lives ? 1 : 0.2;
      ctx.fillStyle = i < lives ? C.MG : "#555"; ctx.shadowBlur = i < lives ? 12 : 0; ctx.shadowColor = C.MG;
      ctx.fillRect(W - 24 - i * 26, 16, 18, 18);
      ctx.restore();
    }
    if (state.combo > 1) txt("COMBO x" + state.mult, W / 2, 26, 22, C.GOLD, "center", true);
    if (waveBanner > 0) {
      var a = Math.min(1, waveBanner / 1.4);
      ctx.save(); ctx.globalAlpha = a;
      txt("VAGUE : " + waveName, W / 2, H * 0.3, Math.round(MIN * 0.055), C.CY, "center", true);
      ctx.restore();
    }
    if (bossBanner > 0) {
      var ab = Math.min(1, bossBanner / 1.3);
      ctx.save(); ctx.globalAlpha = ab;
      txt(bossText, W / 2, H * 0.22, Math.round(MIN * 0.06), C.DANGER, "center", true);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- daily progress bar
  function drawDailyBar(state) {
    if (typeof CONFIG === "undefined" || !CONFIG.DAILY) return;
    var goal = CONFIG.DAILY.GOAL || 1;
    var pct = Math.max(0, Math.min(1, state.score / goal));
    var barW = W * 0.86, barH = 9;
    var bx = (W - barW) / 2, by = 46;
    var hot = pct > 0.85;
    var pulse = hot ? (0.65 + 0.35 * Math.sin(gridT * 22)) : 1;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.GOLD; ctx.shadowBlur = 10; ctx.shadowColor = C.GOLD;
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.restore();
    txt("DÉFI " + Math.round(pct * 100) + "%", W / 2, by + barH + 13, Math.round(MIN * 0.026), C.GOLD, "center", true);
  }

  // ---------------------------------------------------------------- play screen
  function drawPlay(state, mode) {
    if (!state) return;
    var objs = state.objs || [];
    for (var i = 0; i < objs.length; i++) drawObj(objs[i]);
    for (var h = 0; h < halves.length; h++) drawHalf(halves[h]);
    drawParticles();
    drawTrail();
    drawHUD(state);
    if (mode === "daily") drawDailyBar(state);
    if (redFlash > 0) {
      ctx.save(); ctx.fillStyle = hexToRgba(C.DANGER, (redFlash * 0.7).toFixed(3)); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (glitch > 0) glitchOverlay(glitch / 0.35);
    if (state.slowmo > 0) {
      ctx.save(); ctx.fillStyle = hexToRgba(C.CY, 0.05); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }

  // ---------------------------------------------------------------- title screen
  function drawMenuButton(x, y, w, h, label, col, sub) {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowBlur = 16; ctx.shadowColor = col;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    txt(label, x + w / 2, y + h * 0.42, Math.round(MIN * 0.045), "#eafcff", "center", true);
    if (sub) txt(sub, x + w / 2, y + h * 0.78, Math.round(MIN * 0.026), col, "center", false);
  }
  function drawTitleScreen(dt, view) {
    titleT += dt;
    var jit = Math.sin(titleT * 30) > 0.9 ? (Math.random() - 0.5) * 8 : 0;
    txt("BLADE", W / 2 + jit, H * 0.20, Math.round(MIN * 0.13), C.CY, "center", true);
    txt(".EXE", W / 2 - jit, H * 0.20 + MIN * 0.11, Math.round(MIN * 0.095), C.MG, "center", true);

    ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(titleT * 3);
    txt("GLISSEZ POUR TRANCHER DANS LE BON SENS", W / 2, H * 0.38, Math.round(MIN * 0.030), "#cfefff", "center", false);
    ctx.restore();

    var meta = view.meta || { best: 0, daily: { streak: 0 } };
    var menu = view.menu || { blades: [], bladeIndex: 0, muted: false };

    var bw = MIN * 0.56, bh = MIN * 0.105;
    var arcadeY = H * 0.46;
    var dailyY = arcadeY + bh + MIN * 0.05;
    var bx = W / 2 - bw / 2;

    drawMenuButton(bx, arcadeY, bw, bh, "ARCADE", C.CY, "RECORD " + (meta.best || 0));
    drawMenuButton(bx, dailyY, bw, bh, "DÉFI DU JOUR", C.MG, "SÉRIE " + ((meta.daily && meta.daily.streak) || 0) + " J");

    btnRects.TITLE.arcade = { x: bx, y: arcadeY, w: bw, h: bh };
    btnRects.TITLE.daily = { x: bx, y: dailyY, w: bw, h: bh };

    // blade selector
    var rowY = dailyY + bh + MIN * 0.11;
    var b = menu.blades[menu.bladeIndex] || { name: "NÉON", glow: C.MG, unlocked: true };
    var label = b.name + (b.unlocked === false ? "  [VERROUILLÉ]" : "");
    txt(label, W / 2, rowY, Math.round(MIN * 0.04), b.glow || C.MG, "center", true);

    var prevX = W / 2 - bw * 0.42, nextX = W / 2 + bw * 0.42;
    var arrowHalf = MIN * 0.05;
    txt("◀", prevX, rowY, Math.round(MIN * 0.05), "#eafcff", "center", true);
    txt("▶", nextX, rowY, Math.round(MIN * 0.05), "#eafcff", "center", true);
    btnRects.TITLE.bladePrev = { x: prevX - arrowHalf, y: rowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };
    btnRects.TITLE.bladeNext = { x: nextX - arrowHalf, y: rowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };

    // mute toggle
    var mw = 96, mh = 34;
    var mx = W - 16 - mw, my = 14;
    ctx.save();
    ctx.strokeStyle = C.CY; ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.shadowColor = C.CY;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
    txt(menu.muted ? "SON : OFF" : "SON : ON", mx + mw / 2, my + mh / 2, 14, "#eafcff", "center", false);
    btnRects.TITLE.mute = { x: mx, y: my, w: mw, h: mh };

    var ver = (typeof CONFIG !== "undefined" && CONFIG.VERSION) ? CONFIG.VERSION : "?";
    txt("TAP / CLIC POUR CHOISIR  ·  v" + ver, W / 2, H * 0.94, Math.round(MIN * 0.032), "#8fd8e6", "center", false);
  }

  // ---------------------------------------------------------------- over screen
  function drawOverScreen(view) {
    ctx.save(); ctx.fillStyle = "rgba(5,2,10,0.6)"; ctx.fillRect(0, 0, W, H); ctx.restore();
    var state = view.engineState || { score: 0, maxCombo: 0 };
    var meta = view.meta || { best: 0 };
    var menu = view.menu || { unlockedThisRun: [] };

    txt("SYSTÈME COMPROMIS", W / 2, H * 0.24, Math.round(MIN * 0.065), C.DANGER, "center", true);
    txt("SCORE " + state.score, W / 2, H * 0.36, Math.round(MIN * 0.06), C.CY, "center", true);
    txt("RECORD " + (meta.best || 0), W / 2, H * 0.44, Math.round(MIN * 0.04), C.MG, "center", true);

    var unlocked = menu.unlockedThisRun || [];
    if (unlocked.length) {
      var names = [];
      for (var i = 0; i < unlocked.length; i++) names.push(bladeName(unlocked[i]));
      txt("LAME(S) DÉBLOQUÉE(S) : " + names.join(", ").toUpperCase(), W / 2, H * 0.51, Math.round(MIN * 0.028), C.GOLD, "center", true);
    }

    var bw = MIN * 0.36, bh = MIN * 0.105, gap = MIN * 0.04;
    var y = H * 0.60;
    var rx = W / 2 - bw - gap / 2, mxB = W / 2 + gap / 2;

    drawMenuButton(rx, y, bw, bh, "REJOUER", C.CY, null);
    drawMenuButton(mxB, y, bw, bh, "MENU", C.MG, null);

    btnRects.OVER.replay = { x: rx, y: y, w: bw, h: bh };
    btnRects.OVER.menu = { x: mxB, y: y, w: bw, h: bh };
  }

  // ---------------------------------------------------------------- win screen
  function drawWinScreen(view) {
    ctx.save(); ctx.fillStyle = "rgba(5,2,10,0.6)"; ctx.fillRect(0, 0, W, H); ctx.restore();
    var state = view.engineState || { score: 0, maxCombo: 0 };
    var meta = view.meta || { daily: { streak: 0 } };
    var menu = view.menu || { unlockedThisRun: [] };
    var streak = (meta.daily && meta.daily.streak) || 0;

    txt("DÉFI RÉUSSI", W / 2, H * 0.24, Math.round(MIN * 0.065), C.GOLD, "center", true);
    txt("SCORE " + state.score, W / 2, H * 0.36, Math.round(MIN * 0.06), C.CY, "center", true);
    txt("SÉRIE " + streak + " J", W / 2, H * 0.44, Math.round(MIN * 0.04), C.MG, "center", true);

    var unlocked = menu.unlockedThisRun || [];
    if (unlocked.length) {
      var names = [];
      for (var i = 0; i < unlocked.length; i++) names.push(bladeName(unlocked[i]));
      txt("LAME(S) DÉBLOQUÉE(S) : " + names.join(", ").toUpperCase(), W / 2, H * 0.51, Math.round(MIN * 0.028), C.GOLD, "center", true);
    }

    var bw = MIN * 0.36, bh = MIN * 0.105, gap = MIN * 0.04;
    var y = H * 0.60;
    var rx = W / 2 - bw - gap / 2, mxB = W / 2 + gap / 2;

    drawMenuButton(rx, y, bw, bh, "REJOUER", C.CY, null);
    drawMenuButton(mxB, y, bw, bh, "MENU", C.MG, null);

    btnRects.WIN.replay = { x: rx, y: y, w: bw, h: bh };
    btnRects.WIN.menu = { x: mxB, y: y, w: bw, h: bh };
  }

  // ---------------------------------------------------------------- public API
  function render(dt, view) {
    if (!ctx) return;
    if (dt > 0.05) dt = 0.05;
    view = view || {};
    updateCosmetics(dt);
    drawGrid(dt);
    if (view.screen === "TITLE") {
      drawTitleScreen(dt, view);
    } else if (view.screen === "OVER") {
      drawPlay(view.engineState, view.mode);
      drawOverScreen(view);
    } else if (view.screen === "WIN") {
      drawPlay(view.engineState, view.mode);
      drawWinScreen(view);
    } else {
      drawPlay(view.engineState, view.mode);
    }
  }
  function hitTest(x, y, screen) {
    var rects = btnRects[screen];
    if (!rects) return null;
    for (var key in rects) {
      if (!Object.prototype.hasOwnProperty.call(rects, key)) continue;
      var r = rects[key];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return key;
    }
    return null;
  }

  return {
    init: init,
    resize: resize,
    render: render,
    onEvents: onEvents,
    strokePoint: strokePoint,
    strokeEnd: strokeEnd,
    setBlade: setBlade,
    hitTest: hitTest
  };
})();

if (typeof window !== "undefined") window.BladeUI = BladeUI;
if (typeof module !== "undefined" && module.exports) module.exports = BladeUI;
