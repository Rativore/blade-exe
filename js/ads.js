/* ============================================================================
 * BLADE.EXE — js/ads.js — BladeAds
 * Couche publicité, INDÉPENDANTE du canvas : tous les affichages sont des
 * overlays DOM (div plein écran / bandeau) créés en JS, styles inline,
 * z-index élevé, position fixed — jamais de dessin canvas.
 * PROVIDER 'sim' seul implémenté ; structure prête pour un futur provider
 * (ex 'crazygames' | 'admob') : un simple objet {showInterstitial, showRewarded}
 * interchangeable via CONFIG.ADS.PROVIDER.
 * Silencieux et sans crash sous Node (aucun DOM → no-op).
 * ========================================================================== */

var BladeAds = (function () {

  var CONFIG = (typeof window !== 'undefined' && window.CONFIG)
    ? window.CONFIG
    : (typeof require === 'function' ? require('./config.js') : undefined);

  var hasDOM = (typeof document !== 'undefined' && typeof window !== 'undefined');

  function getMeta() {
    if (typeof window !== 'undefined' && window.BladeMeta) return window.BladeMeta;
    if (typeof require === 'function') {
      try { return require('./meta.js'); } catch (e) { return null; }
    }
    return null;
  }

  var state = {
    endsSinceAd: 0,     // fins de partie depuis le dernier interstitiel affiché ;
                        // >= EVERY = une pub est DUE et le reste tant qu'un
                        // garde-fou la bloque (report, jamais de pub perdue)
    lastAdTime: 0,      // ms epoch du dernier interstitiel affiché (0 = jamais)
    bannerEl: null,     // élément DOM du bandeau TITLE (null si masqué)
  };

  /* ---------------------------------------------------------------- style */

  var Z_OVERLAY = 999999;
  var Z_BANNER = 99999;

  function styleOverlayRoot(el) {
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.zIndex = String(Z_OVERLAY);
    el.style.background = 'rgba(2,1,6,0.94)';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontFamily = "'Courier New', monospace";
    el.style.color = CONFIG.COLORS.TEXT;
    el.style.textAlign = 'center';
    el.style.userSelect = 'none';
    el.style.touchAction = 'none';
    el.style.pointerEvents = 'auto';
  }

  function makeButton(label) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.marginTop = '28px';
    b.style.padding = '12px 28px';
    b.style.fontFamily = "'Courier New', monospace";
    b.style.fontSize = '16px';
    b.style.letterSpacing = '2px';
    b.style.fontWeight = 'bold';
    b.style.color = CONFIG.COLORS.BG;
    b.style.background = CONFIG.COLORS.CY;
    b.style.border = 'none';
    b.style.borderRadius = '4px';
    b.style.cursor = 'pointer';
    b.style.pointerEvents = 'auto';
    return b;
  }

  function disableButton(b) {
    b.disabled = true;
    b.style.opacity = '0.35';
    b.style.cursor = 'default';
    b.style.background = '#555';
    b.style.color = '#999';
  }

  function enableButton(b) {
    b.disabled = false;
    b.style.opacity = '1';
    b.style.cursor = 'pointer';
    b.style.background = CONFIG.COLORS.CY;
    b.style.color = CONFIG.COLORS.BG;
  }

  function buildBasePanel(labelTop) {
    var overlay = document.createElement('div');
    styleOverlayRoot(overlay);

    var badge = document.createElement('div');
    badge.textContent = labelTop;
    badge.style.fontSize = '14px';
    badge.style.letterSpacing = '4px';
    badge.style.color = CONFIG.COLORS.MG;
    badge.style.marginBottom = '18px';
    overlay.appendChild(badge);

    var title = document.createElement('div');
    title.textContent = 'PUBLICITÉ';
    title.style.fontSize = '34px';
    title.style.fontWeight = 'bold';
    title.style.letterSpacing = '6px';
    title.style.color = CONFIG.COLORS.CY;
    title.style.textShadow = '0 0 12px ' + CONFIG.COLORS.CY + ', 0 0 24px ' + CONFIG.COLORS.CY;
    overlay.appendChild(title);

    var countdown = document.createElement('div');
    countdown.style.fontSize = '48px';
    countdown.style.fontWeight = 'bold';
    countdown.style.marginTop = '22px';
    countdown.style.color = CONFIG.COLORS.TEXT;
    overlay.appendChild(countdown);

    var btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '16px';
    overlay.appendChild(btnRow);

    document.body.appendChild(overlay);
    return { overlay: overlay, countdown: countdown, btnRow: btnRow };
  }

  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function startCountdown(countdownEl, duration, onTick, onDone) {
    var remaining = Math.max(0, Math.ceil(duration));
    countdownEl.textContent = String(remaining);
    if (remaining <= 0) { onDone(); return { cancel: function () {} }; }
    var timer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        countdownEl.textContent = '0';
        onDone();
      } else {
        countdownEl.textContent = String(remaining);
        if (onTick) onTick(remaining);
      }
    }, 1000);
    return { cancel: function () { clearInterval(timer); } };
  }

  /* ----------------------------------------------------------- provider 'sim' */

  function simShowInterstitial(onClose) {
    var parts = buildBasePanel('INTERSTITIEL SIMULÉ');
    var closeBtn = makeButton('FERMER');
    disableButton(closeBtn);
    parts.btnRow.appendChild(closeBtn);

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      removeOverlay(parts.overlay);
      if (typeof onClose === 'function') onClose();
    }

    startCountdown(parts.countdown, CONFIG.ADS.SIM_DURATION, null, function () {
      enableButton(closeBtn);
      closeBtn.onclick = finish;
    });
  }

  function simShowRewarded(placement, cb) {
    var parts = buildBasePanel('PUB RÉCOMPENSÉE (' + placement + ')');
    var abandonBtn = makeButton('ABANDONNER');
    parts.btnRow.appendChild(abandonBtn);

    var settled = false;
    function settle(success) {
      if (settled) return;
      settled = true;
      countdownCtrl.cancel();
      removeOverlay(parts.overlay);
      cb(success);
    }

    abandonBtn.onclick = function () { settle(false); };

    var countdownCtrl = startCountdown(parts.countdown, CONFIG.ADS.SIM_DURATION, null, function () {
      settle(true);
    });
  }

  var providers = {
    sim: {
      showInterstitial: simShowInterstitial,
      showRewarded: simShowRewarded,
    },
  };

  function currentProvider() {
    return providers[CONFIG && CONFIG.ADS ? CONFIG.ADS.PROVIDER : 'sim'] || providers.sim;
  }

  /* --------------------------------------------------------------- bandeau */

  function buildBanner() {
    var el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '100%';
    el.style.height = CONFIG.ADS.BANNER_HEIGHT + 'px';
    el.style.zIndex = String(Z_BANNER);
    el.style.background = CONFIG.COLORS.BG;
    el.style.borderBottom = '2px solid ' + CONFIG.COLORS.CY;
    el.style.boxShadow = '0 0 10px ' + CONFIG.COLORS.CY + ' inset';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontFamily = "'Courier New', monospace";
    el.style.fontSize = '13px';
    el.style.letterSpacing = '3px';
    el.style.color = CONFIG.COLORS.CY;
    el.style.textShadow = '0 0 8px ' + CONFIG.COLORS.CY;
    el.style.pointerEvents = 'auto';
    el.style.userSelect = 'none';
    el.textContent = 'ESPACE PUBLICITAIRE';
    return el;
  }

  /* -------------------------------------------------------------------- API */

  function init() {
    // rien à préparer pour le provider 'sim' ; point d'extension pour un futur
    // provider (chargement SDK, etc.).
  }

  function registerRunEnd(opts) {
    if (!hasDOM) return false;
    if (!CONFIG || !CONFIG.ADS || !CONFIG.ADS.ENABLED) return false;
    opts = opts || {};
    var won = !!opts.won;

    state.endsSinceAd += 1;

    // pas encore due
    if (state.endsSinceAd < CONFIG.ADS.INTERSTITIAL_EVERY) return false;

    // due, mais bloquée par un garde-fou → RESTE due (report à la fin suivante)
    var meta = getMeta();
    var gamesPlayed = (meta && meta.get) ? (meta.get().gamesPlayed || 0) : 0;
    if (gamesPlayed < CONFIG.ADS.INTERSTITIAL_MIN_GAMES) return false;

    if (state.lastAdTime !== 0) {
      var elapsedS = (Date.now() - state.lastAdTime) / 1000;
      if (elapsedS < CONFIG.ADS.INTERSTITIAL_COOLDOWN) return false;
    }

    if (won && CONFIG.ADS.NO_AD_AFTER_WIN) return false;

    state.endsSinceAd = 0;
    state.lastAdTime = Date.now();
    currentProvider().showInterstitial();
    return true;
  }

  function showRewarded(placement, cb) {
    var callback = (typeof cb === 'function') ? cb : function () {};
    if (!hasDOM || !CONFIG || !CONFIG.ADS || !CONFIG.ADS.ENABLED) {
      setTimeout(function () { callback(false); }, 0);
      return;
    }
    currentProvider().showRewarded(placement, callback);
  }

  function setBanner(visible) {
    if (!hasDOM) return;
    var wantVisible = !!visible && !!(CONFIG && CONFIG.ADS && CONFIG.ADS.BANNER);
    if (wantVisible) {
      if (!state.bannerEl) {
        state.bannerEl = buildBanner();
        document.body.appendChild(state.bannerEl);
      }
    } else if (state.bannerEl) {
      removeOverlay(state.bannerEl);
      state.bannerEl = null;
    }
  }

  function bannerHeight() {
    if (!hasDOM || !state.bannerEl) return 0;
    return CONFIG.ADS.BANNER_HEIGHT;
  }

  var BladeAds = {
    init: init,
    registerRunEnd: registerRunEnd,
    showRewarded: showRewarded,
    setBanner: setBanner,
    bannerHeight: bannerHeight,
  };

  return BladeAds;
})();

if (typeof window !== 'undefined') window.BladeAds = BladeAds;
if (typeof module !== 'undefined' && module.exports) module.exports = BladeAds;
