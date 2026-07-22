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
  var baseC = (typeof CONFIG !== "undefined") ? CONFIG.COLORS :
    { BG: "#05020a", CY: "#00f0ff", MG: "#ff1fd0", DANGER: "#ff2b4a", GOLD: "#ffd000", TEXT: "#eafcff" };
  var curTheme = null; // null = DA GRID de base ; sinon un theme de CONFIG.WORLDS
  var C = {};
  function computeColors() {
    if (curTheme) {
      C = {
        BG: curTheme.BG, CY: curTheme.HUE_A, MG: curTheme.HUE_B,
        DANGER: curTheme.DANGER, GOLD: baseC.GOLD, TEXT: curTheme.TEXT,
        GRID1: curTheme.GRID1, GRID2: curTheme.GRID2
      };
    } else {
      C = {
        BG: baseC.BG, CY: baseC.CY, MG: baseC.MG, DANGER: baseC.DANGER,
        GOLD: baseC.GOLD, TEXT: baseC.TEXT, GRID1: baseC.CY, GRID2: baseC.MG
      };
    }
  }
  computeColors();
  function setTheme(theme) { curTheme = theme || null; computeColors(); }

  var cv = null, ctx = null;
  var W = 0, H = 0, DPR = 1, MIN = 0;

  var blade = { outer: "rgba(255,31,208,0.5)", inner: C.TEXT, glow: C.MG };

  // ---- cosmetic-only state (not part of engine state) ----------------------
  var halves = [], particles = [], trail = [];
  var waveBanner = 0, waveName = "";
  var bossBanner = 0, bossText = "";
  var glitch = 0, redFlash = 0;
  var gridT = 0, titleT = 0;

  var btnRects = { TITLE: {}, OVER: {}, WIN: {}, PLAY: {}, SHOP: {}, WORLDS: {}, LEVELS: {}, LEVELEND: {} };

  // ---------------------------------------------------------------- helpers
  function hexToRgba(hex, a) {
    var v = hex.replace("#", "");
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var r = parseInt(v.substr(0, 2), 16), g = parseInt(v.substr(2, 2), 16), b = parseInt(v.substr(4, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function colorFor(hue) { return hue === "MG" ? C.MG : C.CY; }
  function lightenHex(hex, amt) {
    var v = hex.replace("#", "");
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var r = parseInt(v.substr(0, 2), 16), g = parseInt(v.substr(2, 2), 16), b = parseInt(v.substr(4, 2), 16);
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function bladeName(id) {
    if (typeof CONFIG === "undefined") return id;
    for (var i = 0; i < CONFIG.BLADES.length; i++) {
      if (CONFIG.BLADES[i].id === id) return CONFIG.BLADES[i].name;
    }
    return id;
  }
  function currencySymbol() {
    return (typeof CONFIG !== "undefined" && CONFIG.ECONOMY && CONFIG.ECONOMY.SYMBOL) ? CONFIG.ECONOMY.SYMBOL : "◆";
  }
  // status/contextual action for a shop blade entry ({...blade, unlocked, equipped})
  function bladeStatus(b, shards) {
    if (!b) return { text: "", color: C.TEXT, action: null, label: null, disabled: true };
    if (b.equipped) return { text: "ÉQUIPÉE", color: C.GOLD, action: null, label: null, disabled: true };
    if (b.unlocked) return { text: "POSSÉDÉE", color: C.CY, action: "equip", label: "ÉQUIPER", disabled: false };
    if (b.unlock && b.unlock.type === "shop") {
      var price = b.unlock.price || 0;
      var afford = shards >= price;
      return { text: price + " " + currencySymbol(), color: C.GOLD, action: "buy", label: "ACHETER", disabled: !afford };
    }
    if (b.unlock && b.unlock.type === "streak") {
      return { text: "SÉRIE " + (b.unlock.value || 0) + " J", color: C.MG, action: null, label: null, disabled: true };
    }
    return { text: "", color: C.TEXT, action: null, label: null, disabled: true };
  }
  // status/contextual action for a shop theme entry ({...CONFIG.THEMES[i], unlocked, equipped})
  function themeStatus(t, shards) {
    if (!t) return { text: "", color: C.TEXT, action: null, label: null, disabled: true };
    if (t.equipped) return { text: "ÉQUIPÉ", color: C.GOLD, action: null, label: null, disabled: true };
    if (t.unlocked) return { text: "POSSÉDÉ", color: C.CY, action: "equip", label: "ÉQUIPER", disabled: false };
    var price = t.price || 0;
    var afford = shards >= price;
    return { text: price + " " + currencySymbol(), color: C.GOLD, action: "buy", label: "ACHETER", disabled: !afford };
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
      ctx.strokeStyle = hexToRgba(C.GRID1, al.toFixed(3));
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (var j = -8; j <= 8; j++) {
      var bx = vpx + (W * 0.9) * (j / 8);
      ctx.strokeStyle = hexToRgba(C.GRID2, 0.06);
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
    if (blade.colors && blade.colors.length) {
      var cols = blade.colors;
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 1; i < trail.length; i++) {
          var col = cols[i % cols.length];
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          if (pass === 0) { ctx.strokeStyle = hexToRgba(col, 0.5); ctx.lineWidth = 16; ctx.shadowBlur = 24; ctx.shadowColor = col; }
          else { ctx.strokeStyle = lightenHex(col, 0.65); ctx.lineWidth = 4; ctx.shadowBlur = 12; ctx.shadowColor = col; }
          ctx.stroke();
        }
      }
    } else {
      for (var pass2 = 0; pass2 < 2; pass2++) {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (var j = 1; j < trail.length; j++) ctx.lineTo(trail[j].x, trail[j].y);
        if (pass2 === 0) { ctx.strokeStyle = blade.outer; ctx.lineWidth = 16; ctx.shadowBlur = 24; ctx.shadowColor = blade.glow; }
        else { ctx.strokeStyle = blade.inner; ctx.lineWidth = 4; ctx.shadowBlur = 12; ctx.shadowColor = blade.glow; }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // ---------------------------------------------------------------- shop blade preview (static trail arc)
  function drawBladePreview(cx, cy, r, def, dt) {
    var b = def || blade;
    var n = 14, pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var ang = -Math.PI * 0.72 + t * Math.PI * 1.44;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.72 });
    }
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (b.colors && b.colors.length) {
      var cols = b.colors;
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 1; i < pts.length; i++) {
          var col = cols[i % cols.length];
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          if (pass === 0) { ctx.strokeStyle = hexToRgba(col, 0.5); ctx.lineWidth = Math.max(10, r * 0.22); ctx.shadowBlur = 26; ctx.shadowColor = col; }
          else { ctx.strokeStyle = lightenHex(col, 0.65); ctx.lineWidth = Math.max(3, r * 0.07); ctx.shadowBlur = 14; ctx.shadowColor = col; }
          ctx.stroke();
        }
      }
    } else {
      for (var pass2 = 0; pass2 < 2; pass2++) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        if (pass2 === 0) { ctx.strokeStyle = b.outer; ctx.lineWidth = Math.max(10, r * 0.22); ctx.shadowBlur = 26; ctx.shadowColor = b.glow; }
        else { ctx.strokeStyle = b.inner; ctx.lineWidth = Math.max(3, r * 0.07); ctx.shadowBlur = 14; ctx.shadowColor = b.glow; }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // ---------------------------------------------------------------- shop theme preview (vignette)
  function themeColorsFor(t) {
    var th = t && t.theme;
    if (th) return { BG: th.BG, GRID1: th.GRID1, GRID2: th.GRID2, HUE_A: th.HUE_A, HUE_B: th.HUE_B };
    return { BG: baseC.BG, GRID1: baseC.CY, GRID2: baseC.MG, HUE_A: baseC.CY, HUE_B: baseC.MG };
  }
  function drawMiniHex(cx, cy, r, col) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowBlur = 10; ctx.shadowColor = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var a = 0; a < 6; a++) {
      var an = a / 6 * TAU, px = Math.cos(an) * r, py = Math.sin(an) * r;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  function drawThemePreview(cx, cy, w, h, t) {
    var tc = themeColorsFor(t);
    var x = cx - w / 2, y = cy - h / 2;
    ctx.save();
    ctx.fillStyle = tc.BG; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    var lines = 4;
    for (var i = 1; i <= lines; i++) {
      var ly = y + (h * i) / (lines + 1);
      ctx.strokeStyle = hexToRgba(i % 2 ? tc.GRID1 : tc.GRID2, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w * 0.08, ly); ctx.lineTo(x + w * 0.92, ly); ctx.stroke();
    }
    drawMiniHex(cx - w * 0.18, cy + h * 0.18, Math.min(w, h) * 0.14, tc.HUE_A);
    drawMiniHex(cx + w * 0.18, cy + h * 0.18, Math.min(w, h) * 0.14, tc.HUE_B);
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

  // ---------------------------------------------------------------- home button (PLAY, discret, sous le score)
  function drawHomeButton() {
    var bx = 14, by = 40, bw = 24, bh = 24;
    var cx = bx + bw / 2, cy = by + bh / 2, r = bw / 2;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = C.CY; ctx.lineWidth = 2; ctx.shadowBlur = 8; ctx.shadowColor = C.CY;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.font = '700 14px "Segoe UI",Arial,sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.CY;
    ctx.fillText("⌂", cx, cy + 1);
    ctx.restore();
    btnRects.PLAY.home = { x: bx, y: by, w: bw, h: bh };
  }

  // ---------------------------------------------------------------- goal progress bar (daily / level)
  function drawGoalBar(state, goal, label) {
    if (!goal) return;
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
    txt(label + " " + Math.round(pct * 100) + "%", W / 2, by + barH + 13, Math.round(MIN * 0.026), C.GOLD, "center", true);
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
    if (mode === "daily" && typeof CONFIG !== "undefined" && CONFIG.DAILY) drawGoalBar(state, CONFIG.DAILY.GOAL, "DÉFI");
    else if (mode === "level" && state.target) drawGoalBar(state, state.target, "NIVEAU");
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
    delete btnRects.TITLE.bladePrev; // sélecteur retiré du titre — purge des zones cliquables
    delete btnRects.TITLE.bladeNext;
    var jit = Math.sin(titleT * 30) > 0.9 ? (Math.random() - 0.5) * 8 : 0;
    var verMid = (typeof CONFIG !== "undefined" && CONFIG.VERSION) ? CONFIG.VERSION : "?";
    var meta = view.meta || { best: 0, daily: { streak: 0 }, shards: 0 };
    var menu = view.menu || { blades: [], bladeIndex: 0, muted: false };
    var landscape = W > H;
    var topOffset = view.bannerOffset || 0; // bandeau pub DOM en haut de l'écran TITLE

    txt((meta.shards || 0) + " " + currencySymbol(), 16, 26 + topOffset, Math.round(MIN * 0.032), C.GOLD, "left", true);

    if (landscape) {
      // zone utile sous le bandeau pub : tout se centre dans [topOffset, H]
      var availH = H - topOffset;
      // ---- left column (~40% W) : logo + subtitle + version ----
      var colX = W * 0.20;
      txt("BLADE", colX + jit, topOffset + availH * 0.28, Math.round(MIN * 0.16), C.CY, "center", true);
      txt(".EXE", colX - jit, topOffset + availH * 0.28 + MIN * 0.135, Math.round(MIN * 0.115), C.MG, "center", true);

      ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(titleT * 3);
      txt("GLISSEZ POUR TRANCHER DANS LE BON SENS", colX, topOffset + availH * 0.62, Math.round(MIN * 0.034), "#cfefff", "center", false);
      ctx.restore();

      // ---- right column : big buttons + blade selector ----
      var bw = W * 0.40, bh = availH * 0.16;
      var colRX = W * 0.72;
      var bx = colRX - bw / 2;
      var gap = availH * 0.05;
      var shopBh = bh * 0.5, shopGap = gap * 0.7;
      var levelsBh = bh * 0.5, levelsGap = gap * 0.55;
      var selectorH = MIN * 0.19; // rangée du sabre incluse dans le centrage
      var totalH = bh * 2 + gap + shopGap + shopBh + levelsGap + levelsBh;
      var arcadeY = topOffset + Math.max(8, (availH - totalH - selectorH) / 2);
      var dailyY = arcadeY + bh + gap;
      var shopY = dailyY + bh + shopGap;
      var levelsY = shopY + shopBh + levelsGap;

      drawMenuButton(bx, arcadeY, bw, bh, "JOUER", C.CY, "RECORD " + (meta.best || 0));
      if (menu.dailyDone) {
        ctx.save(); ctx.globalAlpha = 0.45;
        drawMenuButton(bx, dailyY, bw, bh, "DÉFI RÉUSSI ✓", C.MG, "REVENEZ DEMAIN · SÉRIE " + ((meta.daily && meta.daily.streak) || 0) + " J");
        ctx.restore();
      } else {
        drawMenuButton(bx, dailyY, bw, bh, "DÉFI DU JOUR", C.MG, "SÉRIE " + ((meta.daily && meta.daily.streak) || 0) + " J");
      }
      drawMenuButton(bx, shopY, bw, shopBh, "NIVEAUX", C.CY, null);
      drawMenuButton(bx, levelsY, bw, levelsBh, "BOUTIQUE", C.GOLD, null);

      btnRects.TITLE.arcade = { x: bx, y: arcadeY, w: bw, h: bh };
      btnRects.TITLE.daily = { x: bx, y: dailyY, w: bw, h: bh };
      btnRects.TITLE.levels = { x: bx, y: shopY, w: bw, h: shopBh };
      btnRects.TITLE.shop = { x: bx, y: levelsY, w: bw, h: levelsBh };

      // (sélecteur de sabre retiré du titre — l'équipement se fait en boutique)
    } else {
      // ---- portrait (fenêtre PC) : disposition centrée d'origine ----
      txt("BLADE", W / 2 + jit, H * 0.20, Math.round(MIN * 0.13), C.CY, "center", true);
      txt(".EXE", W / 2 - jit, H * 0.20 + MIN * 0.11, Math.round(MIN * 0.095), C.MG, "center", true);

      ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(titleT * 3);
      txt("GLISSEZ POUR TRANCHER DANS LE BON SENS", W / 2, H * 0.38, Math.round(MIN * 0.030), "#cfefff", "center", false);
      ctx.restore();

      var bw2 = MIN * 0.56, bh2 = MIN * 0.105;
      var arcadeY2 = H * 0.44;
      var dailyY2 = arcadeY2 + bh2 + MIN * 0.05;
      var shopBh2 = bh2 * 0.7;
      var shopY2 = dailyY2 + bh2 + MIN * 0.04;
      var levelsBh2 = bh2 * 0.7;
      var levelsY2 = shopY2 + shopBh2 + MIN * 0.035;
      var bx2 = W / 2 - bw2 / 2;

      drawMenuButton(bx2, arcadeY2, bw2, bh2, "JOUER", C.CY, "RECORD " + (meta.best || 0));
      if (menu.dailyDone) {
        ctx.save(); ctx.globalAlpha = 0.45;
        drawMenuButton(bx2, dailyY2, bw2, bh2, "DÉFI RÉUSSI ✓", C.MG, "REVENEZ DEMAIN");
        ctx.restore();
      } else {
        drawMenuButton(bx2, dailyY2, bw2, bh2, "DÉFI DU JOUR", C.MG, "SÉRIE " + ((meta.daily && meta.daily.streak) || 0) + " J");
      }
      drawMenuButton(bx2, shopY2, bw2, shopBh2, "NIVEAUX", C.CY, null);
      drawMenuButton(bx2, levelsY2, bw2, levelsBh2, "BOUTIQUE", C.GOLD, null);

      btnRects.TITLE.arcade = { x: bx2, y: arcadeY2, w: bw2, h: bh2 };
      btnRects.TITLE.daily = { x: bx2, y: dailyY2, w: bw2, h: bh2 };
      btnRects.TITLE.levels = { x: bx2, y: shopY2, w: bw2, h: shopBh2 };
      btnRects.TITLE.shop = { x: bx2, y: levelsY2, w: bw2, h: levelsBh2 };

      // (sélecteur de sabre retiré du titre — l'équipement se fait en boutique)
    }

    // mute toggle — en bas à GAUCHE au-dessus de la version (le haut droit est
    // occupé par les boutons du menu, le bas droit par la flèche ▶ du sabre)
    var mw = 96, mh = 34;
    var mx = 16, my = H - 16 - 18 - mh;
    ctx.save();
    ctx.strokeStyle = C.CY; ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.shadowColor = C.CY;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
    txt(menu.muted ? "SON : OFF" : "SON : ON", mx + mw / 2, my + mh / 2, 14, "#eafcff", "center", false);
    btnRects.TITLE.mute = { x: mx, y: my, w: mw, h: mh };

    txt("v" + verMid, 16, H - 16, 13, "#4a6a75", "left", false);
  }

  // ---------------------------------------------------------------- ad button (mis en avant : fond plein + glow fort)
  function drawAdButton(x, y, w, h, label) {
    ctx.save();
    ctx.fillStyle = hexToRgba(C.GOLD, 0.18); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.GOLD; ctx.lineWidth = 3; ctx.shadowBlur = 22; ctx.shadowColor = C.GOLD;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    txt(label, x + w / 2, y + h / 2, Math.round(MIN * 0.034), C.GOLD, "center", true);
  }

  // ---------------------------------------------------------------- end-screen buttons (OVER/WIN)
  // landscape : REJOUER / MENU empilés, plus grands, colonne de droite
  // adBtn : {key,label}|null — bouton pub, au-dessus de la pile, mis en avant
  function drawEndButtonsLandscape(screenKey, adBtn, noReplay) {
    var bw = W * 0.28, bh = H * 0.22, gap = H * 0.06;
    var colRX = W * 0.80;
    var rx = colRX - bw / 2;
    var adBh = bh * 0.55, adGap = gap * 0.65;
    var nBtns = noReplay ? 1 : 2;
    var totalH = bh * nBtns + gap * (nBtns - 1) + (adBtn ? adBh + adGap : 0);
    var y0 = H * 0.5 - totalH / 2;
    var replayY = y0;
    if (adBtn) {
      drawAdButton(rx, y0, bw, adBh, adBtn.label);
      btnRects[screenKey][adBtn.key] = { x: rx, y: y0, w: bw, h: adBh };
      replayY = y0 + adBh + adGap;
    }
    var menuY = replayY;
    if (noReplay) {
      delete btnRects[screenKey].replay;
    } else {
      drawMenuButton(rx, replayY, bw, bh, "REJOUER", C.CY, null);
      btnRects[screenKey].replay = { x: rx, y: replayY, w: bw, h: bh };
      menuY = replayY + bh + gap;
    }
    drawMenuButton(rx, menuY, bw, bh, "MENU", C.MG, null);
    btnRects[screenKey].menu = { x: rx, y: menuY, w: bw, h: bh };
  }
  // portrait : REJOUER / MENU côte à côte, centrés (disposition d'origine)
  function drawEndButtonsPortrait(screenKey, adBtn, noReplay) {
    var bw = MIN * 0.36, bh = MIN * 0.105, gap = MIN * 0.04;
    var y = H * 0.60;
    var rx = W / 2 - bw - gap / 2, mxB = W / 2 + gap / 2;

    if (adBtn) {
      var adBw = bw * 2 + gap, adBh = bh * 0.85, adGap = MIN * 0.035;
      var adY = y - adBh - adGap, adX = W / 2 - adBw / 2;
      drawAdButton(adX, adY, adBw, adBh, adBtn.label);
      btnRects[screenKey][adBtn.key] = { x: adX, y: adY, w: adBw, h: adBh };
    }

    if (noReplay) {
      delete btnRects[screenKey].replay;
      var cx = W / 2 - bw / 2;
      drawMenuButton(cx, y, bw, bh, "MENU", C.MG, null);
      btnRects[screenKey].menu = { x: cx, y: y, w: bw, h: bh };
      return;
    }
    drawMenuButton(rx, y, bw, bh, "REJOUER", C.CY, null);
    drawMenuButton(mxB, y, bw, bh, "MENU", C.MG, null);

    btnRects[screenKey].replay = { x: rx, y: y, w: bw, h: bh };
    btnRects[screenKey].menu = { x: mxB, y: y, w: bw, h: bh };
  }

  // ---------------------------------------------------------------- over screen
  function drawOverScreen(view) {
    ctx.save(); ctx.fillStyle = "rgba(5,2,10,0.6)"; ctx.fillRect(0, 0, W, H); ctx.restore();
    var state = view.engineState || { score: 0, maxCombo: 0 };
    var meta = view.meta || { best: 0 };
    var menu = view.menu || { unlockedThisRun: [] };
    var landscape = W > H;

    var tx = landscape ? W * 0.07 : W / 2;
    var align = landscape ? "left" : "center";

    txt("SYSTÈME COMPROMIS", tx, H * 0.24, Math.round(MIN * 0.065), C.DANGER, align, true);
    txt("SCORE " + state.score, tx, H * 0.40, Math.round(MIN * 0.06), C.CY, align, true);
    txt("RECORD " + (meta.best || 0), tx, H * 0.52, Math.round(MIN * 0.04), C.MG, align, true);
    if (menu.shardsEarnedThisRun > 0) {
      txt("+" + menu.shardsEarnedThisRun + " " + currencySymbol(), tx, H * 0.585, Math.round(MIN * 0.032), C.GOLD, align, true);
    }

    var unlocked = menu.unlockedThisRun || [];
    if (unlocked.length) {
      var names = [];
      for (var i = 0; i < unlocked.length; i++) names.push(bladeName(unlocked[i]));
      txt("LAME(S) DÉBLOQUÉE(S) : " + names.join(", ").toUpperCase(), tx, H * 0.62, Math.round(MIN * 0.028), C.GOLD, align, true);
    }

    var offerContinue = !!(view.adOffers && view.adOffers.continue);
    if (!offerContinue) delete btnRects.OVER.continue;
    var contBtn = offerContinue ? { key: "continue", label: "CONTINUER (PUB)" } : null;
    if (landscape) drawEndButtonsLandscape("OVER", contBtn); else drawEndButtonsPortrait("OVER", contBtn);
  }

  // ---------------------------------------------------------------- win screen
  function drawWinScreen(view) {
    ctx.save(); ctx.fillStyle = "rgba(5,2,10,0.6)"; ctx.fillRect(0, 0, W, H); ctx.restore();
    var state = view.engineState || { score: 0, maxCombo: 0 };
    var meta = view.meta || { daily: { streak: 0 } };
    var menu = view.menu || { unlockedThisRun: [] };
    var streak = (meta.daily && meta.daily.streak) || 0;
    var landscape = W > H;

    var tx = landscape ? W * 0.07 : W / 2;
    var align = landscape ? "left" : "center";

    txt("DÉFI RÉUSSI", tx, H * 0.24, Math.round(MIN * 0.065), C.GOLD, align, true);
    txt("SCORE " + state.score, tx, H * 0.40, Math.round(MIN * 0.06), C.CY, align, true);
    txt("SÉRIE " + streak + " J", tx, H * 0.52, Math.round(MIN * 0.04), C.MG, align, true);
    if (menu.shardsEarnedThisRun > 0) {
      txt("+" + menu.shardsEarnedThisRun + " " + currencySymbol(), tx, H * 0.585, Math.round(MIN * 0.032), C.GOLD, align, true);
    }

    var unlocked = menu.unlockedThisRun || [];
    if (unlocked.length) {
      var names = [];
      for (var i = 0; i < unlocked.length; i++) names.push(bladeName(unlocked[i]));
      txt("LAME(S) DÉBLOQUÉE(S) : " + names.join(", ").toUpperCase(), tx, H * 0.62, Math.round(MIN * 0.028), C.GOLD, align, true);
    }

    var offerX2 = !!(view.adOffers && view.adOffers.x2);
    if (!offerX2) delete btnRects.WIN.x2;
    var x2Btn = offerX2 ? { key: "x2", label: "×2 ÉCLATS (PUB)" } : null;
    // défi réussi = pas de REJOUER (un seul succès par jour, retour demain)
    if (landscape) drawEndButtonsLandscape("WIN", x2Btn, true); else drawEndButtonsPortrait("WIN", x2Btn, true);
  }

  // ---------------------------------------------------------------- shop screen (onglets SABRES / THÈMES)
  function drawTabButton(x, y, w, h, label, active) {
    ctx.save();
    if (active) { ctx.globalAlpha = 0.18; ctx.fillStyle = C.GOLD; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = active ? C.GOLD : "rgba(255,255,255,0.35)";
    ctx.lineWidth = active ? 3 : 2;
    ctx.shadowBlur = active ? 14 : 0; ctx.shadowColor = C.GOLD;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    txt(label, x + w / 2, y + h / 2, Math.round(MIN * (active ? 0.032 : 0.028)), active ? C.GOLD : "#cfefff", "center", active);
  }
  function drawShopTabs(tab, landscape) {
    var tw = landscape ? W * 0.16 : MIN * 0.32;
    var th = landscape ? H * 0.065 : MIN * 0.075;
    var gap = landscape ? W * 0.02 : MIN * 0.03;
    var totalW = tw * 2 + gap;
    var tx0 = W / 2 - totalW / 2, ty = H * 0.19;
    var bladesX = tx0, themesX = tx0 + tw + gap;
    drawTabButton(bladesX, ty, tw, th, "SABRES", tab === "blades");
    drawTabButton(themesX, ty, tw, th, "THÈMES", tab === "themes");
    btnRects.SHOP.tabBlades = { x: bladesX, y: ty, w: tw, h: th };
    btnRects.SHOP.tabThemes = { x: themesX, y: ty, w: tw, h: th };
  }
  function drawShopBladesTab(menu, shards, landscape) {
    var blades = menu.blades || [];
    var idx = menu.shopIndex || 0;
    if (idx < 0 || idx >= blades.length) idx = 0;
    var b = blades[idx] || null;
    var st = bladeStatus(b, shards);

    if (landscape) {
      var previewCx = W * 0.27, previewCy = H * 0.54, previewR = MIN * 0.15;
      if (b) drawBladePreview(previewCx, previewCy, previewR, b);
      txt(b ? b.name : "—", previewCx, previewCy + previewR * 1.1 + MIN * 0.05, Math.round(MIN * 0.05), b ? b.glow : C.TEXT, "center", true);

      var arrowY = previewCy;
      var arrowHalf = MIN * 0.05;
      var prevX = previewCx - previewR - MIN * 0.09, nextX = previewCx + previewR + MIN * 0.09;
      txt("◀", prevX, arrowY, Math.round(MIN * 0.055), "#eafcff", "center", true);
      txt("▶", nextX, arrowY, Math.round(MIN * 0.055), "#eafcff", "center", true);
      btnRects.SHOP.shopPrev = { x: prevX - arrowHalf, y: arrowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };
      btnRects.SHOP.shopNext = { x: nextX - arrowHalf, y: arrowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };

      var infoCX = W * 0.72;
      txt(st.text, infoCX, H * 0.40, Math.round(MIN * 0.045), st.color, "center", true);

      if (st.label) {
        var bw = W * 0.30, bh = H * 0.16;
        var bx = infoCX - bw / 2, by = H * 0.50;
        var col = st.disabled ? "#555" : st.color;
        ctx.save();
        ctx.globalAlpha = st.disabled ? 0.5 : 1;
        drawMenuButton(bx, by, bw, bh, st.label, col, null);
        ctx.restore();
        if (!st.disabled) btnRects.SHOP[st.action] = { x: bx, y: by, w: bw, h: bh };
      }
    } else {
      var pCx = W / 2, pCy = H * 0.34, pR = MIN * 0.14;
      if (b) drawBladePreview(pCx, pCy, pR, b);
      txt(b ? b.name : "—", pCx, pCy + pR * 1.15 + MIN * 0.04, Math.round(MIN * 0.045), b ? b.glow : C.TEXT, "center", true);

      var aY = pCy;
      var aHalf = MIN * 0.045;
      var pPrevX = pCx - pR - MIN * 0.10, pNextX = pCx + pR + MIN * 0.10;
      txt("◀", pPrevX, aY, Math.round(MIN * 0.05), "#eafcff", "center", true);
      txt("▶", pNextX, aY, Math.round(MIN * 0.05), "#eafcff", "center", true);
      btnRects.SHOP.shopPrev = { x: pPrevX - aHalf, y: aY - aHalf, w: aHalf * 2, h: aHalf * 2 };
      btnRects.SHOP.shopNext = { x: pNextX - aHalf, y: aY - aHalf, w: aHalf * 2, h: aHalf * 2 };

      txt(st.text, pCx, H * 0.58, Math.round(MIN * 0.04), st.color, "center", true);

      if (st.label) {
        var pbw = MIN * 0.5, pbh = MIN * 0.11;
        var pbx = pCx - pbw / 2, pby = H * 0.64;
        var pcol = st.disabled ? "#555" : st.color;
        ctx.save();
        ctx.globalAlpha = st.disabled ? 0.5 : 1;
        drawMenuButton(pbx, pby, pbw, pbh, st.label, pcol, null);
        ctx.restore();
        if (!st.disabled) btnRects.SHOP[st.action] = { x: pbx, y: pby, w: pbw, h: pbh };
      }
    }
  }
  function drawShopThemesTab(menu, shards, landscape) {
    var themes = menu.themes || [];
    var idx = menu.shopThemeIndex || 0;
    if (idx < 0 || idx >= themes.length) idx = 0;
    var t = themes[idx] || null;
    var st = themeStatus(t, shards);

    if (landscape) {
      var pcx = W * 0.27, pcy = H * 0.54, pw = MIN * 0.30, ph = MIN * 0.20;
      if (t) drawThemePreview(pcx, pcy, pw, ph, t);
      txt(t ? t.name : "—", pcx, pcy + ph / 2 + MIN * 0.06, Math.round(MIN * 0.05), t ? st.color : C.TEXT, "center", true);

      var arrowY = pcy;
      var arrowHalf = MIN * 0.05;
      var prevX = pcx - pw / 2 - MIN * 0.09, nextX = pcx + pw / 2 + MIN * 0.09;
      txt("◀", prevX, arrowY, Math.round(MIN * 0.055), "#eafcff", "center", true);
      txt("▶", nextX, arrowY, Math.round(MIN * 0.055), "#eafcff", "center", true);
      btnRects.SHOP.shopPrev = { x: prevX - arrowHalf, y: arrowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };
      btnRects.SHOP.shopNext = { x: nextX - arrowHalf, y: arrowY - arrowHalf, w: arrowHalf * 2, h: arrowHalf * 2 };

      var infoCX = W * 0.72;
      txt(st.text, infoCX, H * 0.40, Math.round(MIN * 0.045), st.color, "center", true);

      if (st.label) {
        var bw = W * 0.30, bh = H * 0.16;
        var bx = infoCX - bw / 2, by = H * 0.50;
        var col = st.disabled ? "#555" : st.color;
        ctx.save();
        ctx.globalAlpha = st.disabled ? 0.5 : 1;
        drawMenuButton(bx, by, bw, bh, st.label, col, null);
        ctx.restore();
        if (!st.disabled) btnRects.SHOP[st.action] = { x: bx, y: by, w: bw, h: bh };
      }
    } else {
      var pCx = W / 2, pCy = H * 0.34, pW = MIN * 0.5, pH = MIN * 0.30;
      if (t) drawThemePreview(pCx, pCy, pW, pH, t);
      txt(t ? t.name : "—", pCx, pCy + pH / 2 + MIN * 0.05, Math.round(MIN * 0.045), t ? st.color : C.TEXT, "center", true);

      var aY = pCy;
      var aHalf = MIN * 0.045;
      var pPrevX = pCx - pW / 2 - MIN * 0.10, pNextX = pCx + pW / 2 + MIN * 0.10;
      txt("◀", pPrevX, aY, Math.round(MIN * 0.05), "#eafcff", "center", true);
      txt("▶", pNextX, aY, Math.round(MIN * 0.05), "#eafcff", "center", true);
      btnRects.SHOP.shopPrev = { x: pPrevX - aHalf, y: aY - aHalf, w: aHalf * 2, h: aHalf * 2 };
      btnRects.SHOP.shopNext = { x: pNextX - aHalf, y: aY - aHalf, w: aHalf * 2, h: aHalf * 2 };

      txt(st.text, pCx, H * 0.58, Math.round(MIN * 0.04), st.color, "center", true);

      if (st.label) {
        var pbw = MIN * 0.5, pbh = MIN * 0.11;
        var pbx = pCx - pbw / 2, pby = H * 0.64;
        var pcol = st.disabled ? "#555" : st.color;
        ctx.save();
        ctx.globalAlpha = st.disabled ? 0.5 : 1;
        drawMenuButton(pbx, pby, pbw, pbh, st.label, pcol, null);
        ctx.restore();
        if (!st.disabled) btnRects.SHOP[st.action] = { x: pbx, y: pby, w: pbw, h: pbh };
      }
    }
  }
  function drawShopScreen(view) {
    var meta = view.meta || { shards: 0 };
    var menu = view.menu || { blades: [], shopIndex: 0, themes: [], shopThemeIndex: 0, shopTab: "blades" };
    var tab = menu.shopTab || "blades";
    var shards = (typeof meta.shards === "number") ? meta.shards : 0;
    var landscape = W > H;

    btnRects.SHOP = {};

    txt("BOUTIQUE", W / 2, H * 0.08, Math.round(MIN * 0.055), C.GOLD, "center", true);
    txt(shards + " " + currencySymbol(), W / 2, H * 0.145, Math.round(MIN * 0.032), C.CY, "center", true);

    drawShopTabs(tab, landscape);
    if (tab === "themes") drawShopThemesTab(menu, shards, landscape);
    else drawShopBladesTab(menu, shards, landscape);

    var backW = landscape ? W * 0.24 : MIN * 0.4;
    var backH = landscape ? H * 0.12 : MIN * 0.09;
    var backX = landscape ? W * 0.72 - backW / 2 : W / 2 - backW / 2;
    var backY = landscape ? H * 0.74 : H * 0.82;
    drawMenuButton(backX, backY, backW, backH, "RETOUR", C.MG, null);
    btnRects.SHOP.back = { x: backX, y: backY, w: backW, h: backH };
  }

  // ---------------------------------------------------------------- worlds screen
  function drawWorldsScreen(view) {
    btnRects.WORLDS = {};
    var worlds = (typeof CONFIG !== "undefined" && CONFIG.WORLDS) ? CONFIG.WORLDS : [];
    var progress = (typeof BladeMeta !== "undefined") ? BladeMeta.getLevelProgress() : { starsByWorld: [] };
    var starsByWorld = progress.starsByWorld || [];
    var perWorld = (typeof CONFIG !== "undefined" && CONFIG.LEVELS) ? CONFIG.LEVELS.PER_WORLD : 30;
    var maxStars = perWorld * 3;
    var landscape = W > H;
    var n = worlds.length;

    txt("MONDES", W / 2, H * 0.09, Math.round(MIN * 0.055), C.CY, "center", true);

    var cardW, cardH, gap, x0, y0;
    if (landscape) {
      cardW = W * 0.30; cardH = H * 0.58; gap = W * 0.04;
      x0 = W / 2 - (cardW * n + gap * (n - 1)) / 2; y0 = H * 0.52 - cardH / 2;
    } else {
      cardW = W * 0.72; cardH = H * 0.30; gap = H * 0.035;
      x0 = W / 2 - cardW / 2; y0 = H * 0.22;
    }

    for (var i = 0; i < n; i++) {
      var w = worlds[i];
      var cx = landscape ? x0 + i * (cardW + gap) : x0;
      var cy = landscape ? y0 : y0 + i * (cardH + gap);
      var stars = starsByWorld[i] || 0;
      var gate = (typeof BladeLevels !== "undefined") ? BladeLevels.worldGate(i) : 0;
      var unlocked = i === 0 || (starsByWorld[i - 1] || 0) >= gate;
      var glow = (w.theme && w.theme.HUE_A) || C.CY;

      ctx.save();
      if (w.theme) { ctx.globalAlpha = 0.16; ctx.fillStyle = w.theme.BG; ctx.fillRect(cx, cy, cardW, cardH); ctx.globalAlpha = 1; }
      ctx.strokeStyle = unlocked ? glow : "#555"; ctx.lineWidth = 3;
      ctx.shadowBlur = unlocked ? 16 : 0; ctx.shadowColor = glow;
      ctx.strokeRect(cx, cy, cardW, cardH);
      ctx.restore();

      txt(w.name || ("MONDE " + (i + 1)), cx + cardW / 2, cy + cardH * 0.34, Math.round(MIN * 0.042), unlocked ? glow : "#888", "center", true);
      txt(stars + " / " + maxStars + " ★", cx + cardW / 2, cy + cardH * 0.55, Math.round(MIN * 0.03), C.GOLD, "center", true);
      if (!unlocked) {
        txt("🔒", cx + cardW / 2, cy + cardH * 0.72, Math.round(MIN * 0.05), "#888", "center", false);
        txt(gate + "★ requis", cx + cardW / 2, cy + cardH * 0.85, Math.round(MIN * 0.026), C.DANGER, "center", false);
      }
      btnRects.WORLDS["world" + i] = { x: cx, y: cy, w: cardW, h: cardH };
    }

    var backW = landscape ? W * 0.16 : MIN * 0.34, backH = landscape ? H * 0.10 : MIN * 0.08;
    var backX = W / 2 - backW / 2, backY = H * 0.90 - backH;
    drawMenuButton(backX, backY, backW, backH, "RETOUR", C.MG, null);
    btnRects.WORLDS.back = { x: backX, y: backY, w: backW, h: backH };
  }

  // ---------------------------------------------------------------- levels screen (grille 6x5)
  function drawLevelsScreen(view) {
    btnRects.LEVELS = {};
    var menu = view.menu || {};
    var meta = view.meta || {};
    var worldIdx = menu.worldIndex || 0;
    var worlds = (typeof CONFIG !== "undefined" && CONFIG.WORLDS) ? CONFIG.WORLDS : [];
    var world = worlds[worldIdx] || { id: "inferno", name: "NIVEAUX" };
    var perWorld = (typeof CONFIG !== "undefined" && CONFIG.LEVELS) ? CONFIG.LEVELS.PER_WORLD : 30;
    var bossLevels = (typeof CONFIG !== "undefined" && CONFIG.LEVELS) ? CONFIG.LEVELS.BOSS_LEVELS : [];
    var progress = (typeof BladeMeta !== "undefined") ? BladeMeta.getLevelProgress() : { stars: {}, starsByWorld: [] };
    var shards = (typeof meta.shards === "number") ? meta.shards : 0;
    var worldStars = progress.starsByWorld[worldIdx] || 0;

    txt(world.name || "NIVEAUX", W / 2, H * 0.075, Math.round(MIN * 0.045), C.CY, "center", true);
    txt(shards + " " + currencySymbol(), W - 18, 24, Math.round(MIN * 0.028), C.GOLD, "right", true);

    var cols = 6, rows = 5;
    var gridW = W * 0.88, gridH = H * 0.68;
    var gx = (W - gridW) / 2, gy = H * 0.15;
    var cw = gridW / cols, ch = gridH / rows;
    var pad = Math.min(cw, ch) * 0.10;

    for (var lvl = 1; lvl <= perWorld; lvl++) {
      var idx = lvl - 1;
      var col = idx % cols, row = Math.floor(idx / cols);
      var cx = gx + col * cw + pad / 2, cy = gy + row * ch + pad / 2;
      var cw2 = cw - pad, ch2 = ch - pad;
      var key = world.id + "-" + lvl;
      var stars = progress.stars ? (progress.stars[key] || 0) : 0;
      var prevStars = lvl === 1 ? 1 : (progress.stars ? (progress.stars[world.id + "-" + (lvl - 1)] || 0) : 0);
      var gate = (typeof BladeLevels !== "undefined") ? BladeLevels.levelGate(worldIdx, lvl) : 0;
      var unlocked = lvl === 1 || (prevStars > 0 && worldStars >= gate);
      var isBoss = bossLevels && bossLevels.indexOf(lvl) !== -1;
      var cellCol = unlocked ? (isBoss ? C.GOLD : C.CY) : "#555";

      ctx.save();
      ctx.strokeStyle = cellCol; ctx.lineWidth = 2;
      ctx.shadowBlur = unlocked ? 10 : 0; ctx.shadowColor = cellCol;
      ctx.strokeRect(cx, cy, cw2, ch2);
      ctx.restore();

      txt(String(lvl), cx + cw2 / 2, cy + ch2 * 0.36, Math.round(Math.min(cw2, ch2) * 0.32), unlocked ? C.TEXT : "#777", "center", false);
      if (isBoss) txt("⬢", cx + cw2 * 0.84, cy + ch2 * 0.18, Math.round(Math.min(cw2, ch2) * 0.24), C.GOLD, "center", true);

      if (unlocked) {
        var starStr = "";
        for (var s = 0; s < 3; s++) starStr += (s < stars ? "★" : "☆");
        txt(starStr, cx + cw2 / 2, cy + ch2 * 0.74, Math.round(Math.min(cw2, ch2) * 0.20), C.GOLD, "center", false);
      } else if (gate > 0 && worldStars < gate) {
        txt(gate + "★", cx + cw2 / 2, cy + ch2 * 0.74, Math.round(Math.min(cw2, ch2) * 0.20), C.DANGER, "center", false);
      } else {
        txt("🔒", cx + cw2 / 2, cy + ch2 * 0.74, Math.round(Math.min(cw2, ch2) * 0.22), "#777", "center", false);
      }
      btnRects.LEVELS["lvl" + lvl] = { x: cx, y: cy, w: cw2, h: ch2 };
    }

    var backW = W * 0.18, backH = H * 0.08;
    var backX = W / 2 - backW / 2, backY = H * 0.90;
    drawMenuButton(backX, backY, backW, backH, "RETOUR", C.MG, null);
    btnRects.LEVELS.back = { x: backX, y: backY, w: backW, h: backH };
  }

  // ---------------------------------------------------------------- level-end screen
  function drawLevelEndScreen(view) {
    btnRects.LEVELEND = {};
    var menu = view.menu || {};
    var res = menu.levelResult || { success: false, stars: 0, score: 0, target: 0, shardsEarned: 0, hasNext: false };
    var landscape = W > H;
    var tx = landscape ? W * 0.07 : W / 2;
    var align = landscape ? "left" : "center";

    ctx.save(); ctx.fillStyle = "rgba(5,2,10,0.62)"; ctx.fillRect(0, 0, W, H); ctx.restore();

    if (res.success) {
      txt("NIVEAU RÉUSSI", tx, H * 0.16, Math.round(MIN * 0.055), C.GOLD, align, true);
      var starStr = "";
      for (var s = 0; s < 3; s++) starStr += (s < res.stars ? "★" : "☆");
      txt(starStr, tx, H * 0.30, Math.round(MIN * 0.09), C.GOLD, align, true);
    } else {
      txt("ÉCHEC", tx, H * 0.16, Math.round(MIN * 0.065), C.DANGER, align, true);
    }
    txt("SCORE " + res.score + " / " + res.target, tx, H * 0.44, Math.round(MIN * 0.042), C.CY, align, true);
    if (res.shardsEarned > 0) {
      txt("+" + res.shardsEarned + " " + currencySymbol(), tx, H * 0.52, Math.round(MIN * 0.030), C.GOLD, align, true);
    }

    var buttons = [];
    if (res.success && res.hasNext) buttons.push({ key: "next", label: "SUIVANT", col: C.CY });
    // niveau réussi = pas de REJOUER direct (comme le défi) — le rejeu passe par la grille
    if (!res.success) buttons.push({ key: "replay", label: "REJOUER", col: C.MG });
    buttons.push({ key: "back", label: "NIVEAUX", col: C.GOLD });
    buttons.push({ key: "menu", label: "MENU", col: C.TEXT });

    var bw, bh, gap, i;
    if (landscape) {
      bw = W * 0.26; bh = H * 0.15; gap = H * 0.04;
      var totalH = buttons.length * bh + (buttons.length - 1) * gap;
      var y0 = H * 0.5 - totalH / 2;
      var rx = W * 0.80 - bw / 2;
      for (i = 0; i < buttons.length; i++) {
        var by = y0 + i * (bh + gap);
        drawMenuButton(rx, by, bw, bh, buttons[i].label, buttons[i].col, null);
        btnRects.LEVELEND[buttons[i].key] = { x: rx, y: by, w: bw, h: bh };
      }
    } else {
      bw = MIN * 0.5; bh = MIN * 0.095; gap = MIN * 0.025;
      var y0p = H * 0.60;
      var bx = W / 2 - bw / 2;
      for (i = 0; i < buttons.length; i++) {
        var byp = y0p + i * (bh + gap);
        drawMenuButton(bx, byp, bw, bh, buttons[i].label, buttons[i].col, null);
        btnRects.LEVELEND[buttons[i].key] = { x: bx, y: byp, w: bw, h: bh };
      }
    }
  }

  // ---------------------------------------------------------------- orientation overlay
  function drawPortraitOverlay(dt) {
    ctx.save();
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H * 0.42;
    var r = MIN * 0.16;
    var spin = titleT * 1.6;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(spin);
    ctx.shadowBlur = 22; ctx.shadowColor = C.CY; ctx.strokeStyle = C.CY; ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, r, 0.2 * TAU, 0.92 * TAU); ctx.stroke();
    var ax = Math.cos(0.2 * TAU) * r, ay = Math.sin(0.2 * TAU) * r;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + r * 0.22, ay - r * 0.05);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - r * 0.05, ay - r * 0.22);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    txt("TOURNEZ VOTRE TÉLÉPHONE", cx, cy + r + MIN * 0.09, Math.round(MIN * 0.045), C.MG, "center", true);
  }

  // ---------------------------------------------------------------- public API
  function render(dt, view) {
    if (!ctx) return;
    if (dt > 0.05) dt = 0.05;
    view = view || {};
    updateCosmetics(dt);
    titleT += dt;
    drawGrid(dt);
    if (view.screen === "TITLE") {
      drawTitleScreen(dt, view);
    } else if (view.screen === "OVER") {
      drawPlay(view.engineState, view.mode);
      drawOverScreen(view);
    } else if (view.screen === "WIN") {
      drawPlay(view.engineState, view.mode);
      drawWinScreen(view);
    } else if (view.screen === "SHOP") {
      drawShopScreen(view);
    } else if (view.screen === "WORLDS") {
      drawWorldsScreen(view);
    } else if (view.screen === "LEVELS") {
      drawLevelsScreen(view);
    } else if (view.screen === "LEVELEND") {
      drawPlay(view.engineState, view.mode);
      drawLevelEndScreen(view);
    } else {
      drawPlay(view.engineState, view.mode);
      drawHomeButton();
    }
    if (view.portraitBlocked) drawPortraitOverlay(dt);
  }
  function hitTest(x, y, screen) {
    var rects = btnRects[screen];
    if (!rects) return null;
    for (var key in rects) {
      if (!Object.prototype.hasOwnProperty.call(rects, key)) continue;
      var r = rects[key];
      var pad = 10; // tolérance tactile
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return key;
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
    hitTest: hitTest,
    setTheme: setTheme
  };
})();

if (typeof window !== "undefined") window.BladeUI = BladeUI;
if (typeof module !== "undefined" && module.exports) module.exports = BladeUI;
