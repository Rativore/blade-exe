/* ============================================================================
 * BLADE.EXE — js/config.js — LE CONTRAT PARTAGÉ
 * ----------------------------------------------------------------------------
 * Spec unique du jeu. Les valeurs de gameplay viennent de la maquette validée
 * (maquette.html, conservée comme référence visuelle et de feel).
 * En cas de divergence entre un module et ce contrat : ON CORRIGE LE MODULE.
 *
 * Modules et propriété exclusive :
 *   js/engine.js  → BladeEngine  (logique pure, ZÉRO DOM, exporté pour Node)
 *   js/levels.js  → BladeLevels  (vagues, boss, seed du défi quotidien)
 *   js/meta.js    → BladeMeta    (sauvegarde, records, lames, série quotidienne)
 *   js/audio.js   → BladeAudio   (WebAudio synthé, aucun fichier externe)
 *   js/ui.js      → BladeUI      (rendu canvas + effets cosmétiques)
 *   js/main.js    → boucle, input, écrans TITLE/PLAY/OVER, câblage global
 * Chaque module : window.X = X ; et si module.exports existe → module.exports = X
 * (engine, levels, meta doivent tourner sous Node sans navigateur).
 * ========================================================================== */

var CONFIG = {

  VERSION: '1.7',             // affichée à l'écran titre — à incrémenter
                              // à CHAQUE publication (sert à vérifier sur
                              // téléphone que le cache Pages est bien à jour)

  /* ------------------------------------------------ identité & couleurs */
  COLORS: {
    BG: '#05020a',
    CY: '#00f0ff',            // cyan néon
    MG: '#ff1fd0',            // magenta néon
    DANGER: '#ff2b4a',        // virus / urgence
    GOLD: '#ffd000',          // combo / anneau d'urgence
    TEXT: '#eafcff',
  },

  /* ------------------------------------------------ règles de coupe (maquette) */
  CUT: {
    TOLERANCE_DEG: 30,        // écart max geste↔flèche (en degrés, ±)
    MIN_SEG_PX: 4,            // déplacement mini pour qu'un segment ait une direction
    WRONG_SHRINK: 0.7,        // mauvais sens → size *= 0.7 (repoussé)
    WRONG_COOLDOWN: 0.35,     // s d'immunité après un mauvais coup
    POINTS_BASE: 10,          // points par coupe = POINTS_BASE * mult
    COMBO_MULT_MAX: 8,        // multiplicateur plafonné
    SLOWMO_EVERY: 10,         // slow-mo tous les N combos
    SLOWMO_DURATION: 0.3,     // s
    SLOWMO_SCALE: 0.35,       // vitesse du monde pendant le slow-mo (input non ralenti)
  },

  /* ------------------------------------------------ objets (fractions de MIN = min(w,h)) */
  OBJ: {
    START_SIZE: 0.028,        // rayon initial
    MAX_SIZE: 0.155,          // rayon fatal (objet « atteint » le joueur)
    SPAWN_MARGIN_TOP: 70,     // px réservés au HUD
    SPAWN_MARGIN_BOTTOM: 20,  // px
    SPIN_SPEED: 0.6,          // rad/s rotation cosmétique de l'hexagone
  },

  /* ------------------------------------------------ défi du jour */
  DAILY: {
    GOAL: 1200,               // score à atteindre → le run se termine en victoire
    // Le mode daily est FINI : à GOAL le statut passe à 'WIN' (event 'dailyWin').
    // La série (streak) ne compte que si le défi est RÉUSSI (score >= GOAL).
    // UI : barre de progression score/GOAL affichée en haut pendant tout le run.
  },

  /* ------------------------------------------------ boss FIREWALL */
  BOSS: {
    SCORES: [600, 1800, 3600],// premiers seuils, ensuite +BOSS.EVERY
    EVERY: 2500,              // après le dernier seuil : tous les +2500 pts
    SIZE: 0.24,               // rayon (fraction de MIN), spawn centré à l'écran
    GROW_TIME: 8,             // s pour atteindre MAX (raté = -1 vie)
    POINTS_PER_CUT: 30,       // par coupe de la séquence, × mult
    POINTS_DONE: 250,         // bonus de destruction (× mult)
    // seqLen par boss : BladeLevels.bossSpec(n)
  },

  /* ------------------------------------------------ partie */
  RUN: {
    LIVES: 3,
    MODES: ['arcade', 'daily'],
    DAILY_LOCALSTORAGE_NOTE: 'un seul score enregistré par date (le meilleur)',
  },

  /* ------------------------------------------------ lames cosmétiques (trail) */
  // unlock.type: 'default' | 'total' (score cumulé) | 'best' (record arcade) | 'streak' (série quotidienne)
  BLADES: [
    { id: 'neon',    name: 'NÉON',    outer: 'rgba(255,31,208,0.5)', inner: '#eafcff', glow: '#ff1fd0', unlock: { type: 'default' } },
    { id: 'plasma',  name: 'PLASMA',  outer: 'rgba(57,255,20,0.5)',  inner: '#eaffea', glow: '#39ff14', unlock: { type: 'total',  value: 5000 } },
    { id: 'aurum',   name: 'AURUM',   outer: 'rgba(255,208,0,0.5)',  inner: '#fff6d0', glow: '#ffd000', unlock: { type: 'best',   value: 2500 } },
    { id: 'glitch',  name: 'GLITCH',  outer: 'rgba(255,43,74,0.5)',  inner: '#ffe0e6', glow: '#ff2b4a', unlock: { type: 'streak', value: 3 } },
    { id: 'phantom', name: 'PHANTOM', outer: 'rgba(255,255,255,0.4)',inner: '#ffffff', glow: '#ffffff', unlock: { type: 'streak', value: 7 } },
  ],

  SAVE_KEY: 'bladeExeSave.v1',
};

/* ============================================================================
 * API EXACTE DES MODULES (le contrat — signatures à respecter à la lettre)
 * ============================================================================
 *
 * ---------------------------------------------------------------- engine.js
 * BladeEngine.create({ mode, seed, viewport: {w, h} }) → engine
 *   mode : 'arcade' | 'daily' ; seed : entier (déterminisme total du run :
 *   même seed + mêmes appels ⇒ même partie ; RNG interne mulberry32, jamais
 *   Math.random dans engine.js).
 * engine.state  (lecture seule pour UI/tests) :
 *   { status:'PLAY'|'OVER'|'WIN',      // 'WIN' : mode daily uniquement, score >= DAILY.GOAL
 *     score, lives, combo, mult, maxCombo,
 *     wave:{id,name}, slowmo,           // s de slow-mo restantes
 *     objs:[{ x,y,          // px dans viewport
 *             size,maxS,    // rayons px
 *             seq:[rad,...],idx,        // directions exigées ; req = seq[idx]
 *             req,          // rad — direction courante à trancher
 *             virus:bool, boss:bool, rot,  // rot: rad/s de pivot de req (0 si fixe)
 *             hue:'CY'|'MG', spin, cool }] }
 * engine.update(dt) → events[]           // dt en s, réel (l'engine applique
 *                                        // lui-même SLOWMO_SCALE au monde)
 * engine.strokeStart(x,y) → events[]     // px viewport
 * engine.strokeMove(x,y)  → events[]     // segmente, teste les coupes
 * engine.strokeEnd()      → events[]
 * engine.resize(w,h)                     // repositionne les objs proportionnellement
 * Événements (tous {type, ...}) :
 *   {type:'slice', x,y,size,angle,hue,points,combo}   // coupe réussie
 *   {type:'wrong', x,y}                               // mauvais sens
 *   {type:'virus', x,y}                               // virus touché (-1 vie)
 *   {type:'miss',  x,y}                               // obj à taille max (-1 vie)
 *   {type:'wave',  id,name}                           // changement de vague
 *   {type:'slowmo'}
 *   {type:'bossSpawn'} {type:'bossCut',remaining,x,y} {type:'bossDone',points,x,y}
 *   {type:'over', score, maxCombo}
 *   {type:'dailyWin', score, maxCombo}  // mode daily : score >= DAILY.GOAL → status 'WIN',
 *                                       // plus aucun spawn, le run s'arrête proprement
 * Règles reprises de la maquette : tolérance ±30°, un seul objet touché par
 * micro-segment, mauvais sens = shrink 0.7 + cooldown 0.35 s + combo=0,
 * virus tranché/touché = -1 vie, obj (non virus) à maxS = -1 vie,
 * mult = min(combo, 8), score += 10×mult, slow-mo 0.3 s tous les 10 combos.
 * Boss : hexagone centré, seq de bossSpec(n).seqLen coupes (flèche courante
 * affichée = seq[idx]), chaque bonne coupe = POINTS_PER_CUT×mult + reset du
 * timer de croissance à 50 %, séquence finie = POINTS_DONE×mult ; à maxS = -1 vie.
 * Pendant un boss : le spawn normal continue selon la vague (densité réduite de moitié).
 *
 * ---------------------------------------------------------------- levels.js
 * BladeLevels.WAVES → tableau des 6 vagues (ordre croissant de minScore) :
 *   { id, name, minScore, grow,        // s pour passer de START_SIZE à MAX_SIZE
 *     maxObjs, interval,               // s entre spawns (jitter ×0.75..1.25 côté engine)
 *     batch, virusP,                   // proba virus par spawn
 *     rotSpeed,                        // rad/s de pivot des flèches (0 = fixes)
 *     dirs,                            // 4 (cardinales) ou 8 (diagonales incluses)
 *     seqLen }                         // 1 = normal ; 2 = objets à double coupe
 * Valeurs imposées (courbe adoucie après le test humain du 2026-07-22 —
 * « la difficulté monte trop rapidement ») :
 *   1 LENT        minScore 0     grow 2.80 maxObjs 1 interval 0.90 batch 1 virusP 0    rot 0    dirs 4 seqLen 1
 *   2 MOYEN       minScore 300   grow 2.20 maxObjs 2 interval 1.00 batch 1 virusP 0.08 rot 0    dirs 8 seqLen 1
 *   3 RAPIDE      minScore 900   grow 1.80 maxObjs 3 interval 0.80 batch 2 virusP 0.15 rot 0    dirs 8 seqLen 1
 *   4 FRÉNÉTIQUE  minScore 1800  grow 1.55 maxObjs 4 interval 0.65 batch 2 virusP 0.22 rot 0.4  dirs 8 seqLen 1
 *   5 SURCHARGE   minScore 3000  grow 1.35 maxObjs 5 interval 0.55 batch 2 virusP 0.28 rot 0.7  dirs 8 seqLen 2
 *   6 KERNEL PANIC minScore 4500 grow 1.15 maxObjs 6 interval 0.45 batch 3 virusP 0.35 rot 1.0  dirs 8 seqLen 2
 * BladeLevels.waveFor(score) → la vague correspondante
 * BladeLevels.nextBossScore(bossCount) → seuil du (bossCount+1)-ième boss
 *   (BOSS.SCORES puis dernier + n×BOSS.EVERY)
 * BladeLevels.bossSpec(bossCount) → { seqLen: min(3 + bossCount, 6), growTime: BOSS.GROW_TIME }
 * BladeLevels.dailySeed(dateStr) → entier déterministe depuis 'YYYY-MM-DD'
 *   (hash simple, stable entre sessions et machines)
 *
 * ------------------------------------------------------------------ meta.js
 * BladeMeta.load() → save (crée les défauts si absent ; localStorage
 *   CONFIG.SAVE_KEY ; fallback mémoire si localStorage indisponible → Node OK)
 * save = { best, bestCombo, totalScore,
 *          blades: { unlocked:['neon',...], equipped:'neon' },
 *          daily:  { lastDate:'YYYY-MM-DD'|null, streak:0, scores:{date:score} } }
 * BladeMeta.get() → save courant (load() implicite au premier accès)
 * BladeMeta.recordRun({mode:'arcade'|'daily', score, maxCombo, dateStr}) →
 *   { newBest:bool, unlocked:[bladeId,...], streak }
 *   - met à jour best/bestCombo/totalScore, persiste ;
 *   - mode daily : scores[dateStr] = max(existant, score) toujours enregistré,
 *     mais la série ne bouge QUE si le défi est réussi (score >= CONFIG.DAILY.GOAL) :
 *     streak +1 si lastDate = veille, reset à 1 si trou, inchangé si même jour
 *     (lastDate n'est posé que sur une réussite) ;
 *   - déverrouille les lames dont la condition est atteinte (CONFIG.BLADES).
 * BladeMeta.getBlades() → [{...blade, unlocked:bool, equipped:bool}]
 * BladeMeta.equipBlade(id) → bool (refus si verrouillée)
 * BladeMeta.todayStr(d?) → 'YYYY-MM-DD' locale
 *
 * ----------------------------------------------------------------- audio.js
 * BladeAudio.init()            // crée l'AudioContext (+ resume immédiat)
 * BladeAudio.unlock()          // init() + resume() — à appeler à CHAQUE geste
 *                              // utilisateur (touchstart ET touchend : iOS ne
 *                              // débloque parfois le son qu'au relâchement)
 * BladeAudio.play(name)        // 'slice'|'wrong'|'virus'|'miss'|'wave'|'slowmo'
 *                              // |'boss'|'bossDone'|'over'|'dailyWin'|'click'
 * BladeAudio.startMusic(kind) / BladeAudio.stopMusic()
 *   kind 'menu' : nappe synthwave calme (~90 BPM, pads détunés + arpège lent +
 *   sub discret, boucle 8 mesures) pour l'écran titre.
 *   kind 'game' (défaut si omis) : boucle hyperpop/glitchcore : ~160 BPM, lead saw
 *   arpégé (gamme mineure), sub bass avec pompe side-chain, hi-hats avec
 *   rafales stutter 1/32, snare claps, glitchs de pitch occasionnels —
 *   séquencée via un scheduler setInterval + AudioContext.currentTime.
 * BladeAudio.setMusicIntensity(i)  // 0..1, piloté par la vague (1 = KERNEL PANIC) :
 *   monte le tempo ressenti (densité hats/stutters) et ouvre un filtre lowpass.
 * BladeAudio.setMuted(b) / BladeAudio.muted   // coupe SFX ET musique
 * Synthèse WebAudio uniquement (osc + gain + filtres), zéro fichier externe,
 * silencieux et sans crash sous Node.
 *
 * -------------------------------------------------------------------- ui.js
 * BladeUI.init(canvas)         // garde ctx, gère DPR (cap 2) — reprendre resize() maquette
 * BladeUI.resize()             // recalcule W,H,MIN ; retourne {w,h}
 * BladeUI.render(dt, view)     // dessine une frame complète ; view =
 *   { screen:'TITLE'|'PLAY'|'OVER'|'WIN', engineState|null, meta, menu, mode }
 *   En mode daily (screen PLAY) : barre de progression fixe en haut, sous le
 *   HUD — remplissage score/CONFIG.DAILY.GOAL, libellé 'DÉFI x%', passe dorée
 *   (GOLD) et pulse à >85 %. Écran WIN = 'DÉFI RÉUSSI' + score + série +
 *   mêmes boutons que OVER (replay/menu).
 *   ORIENTATION : le jeu se joue en PAYSAGE. Sur appareil tactile en portrait
 *   (h > w), BladeUI.render dessine un overlay opaque « ↻ TOURNEZ VOTRE
 *   TÉLÉPHONE » par-dessus tout ; view.portraitBlocked (fourni par main.js)
 *   le déclenche, et main.js bloque alors tout input jeu (les strokes), pas
 *   le déblocage audio. Sur PC (souris, pas de tactile), jamais d'overlay.
 *   Reprendre le feel de la maquette : grille perspective animée, hexagones
 *   néon + flèche blanche, anneau d'urgence (>55 % jaune, >85 % rouge),
 *   moitiés qui s'écartent, particules, traînée 2 passes (couleurs de la lame
 *   équipée), bannière de vague, flash rouge, glitchOverlay, slow-mo teinté.
 * BladeUI.onEvents(events)     // slice/wrong/virus/... → moitiés, particules, flashs
 * BladeUI.strokePoint(x,y) / BladeUI.strokeEnd()   // alimente la traînée cosmétique
 * BladeUI.setBlade(bladeDef)   // couleurs de la traînée
 * Écrans : TITLE = logo glitché + ARCADE / DÉFI DU JOUR (+ série, record) +
 * sélecteur de lame + bouton son ; OVER = SYSTÈME COMPROMIS, score, record,
 * lames débloquées ce run, REJOUER + MENU. Boutons = zones cliquables que
 * BladeUI.hitTest(x,y,screen) → 'arcade'|'daily'|'replay'|'menu'|'mute'|
 * 'bladePrev'|'bladeNext'|null (main.js route les taps).
 *
 * ------------------------------------------------------------------ main.js
 * Boucle rAF (dt cap 0.05 s), resize, input souris+tactile (preventDefault,
 * passive:false), écrans TITLE/PLAY/OVER, création engine (arcade : seed =
 * Date.now()&0xffffffff ; daily : BladeLevels.dailySeed(BladeMeta.todayStr())),
 * routage events → BladeUI.onEvents + BladeAudio.play, fin de run ('over' OU
 * 'dailyWin') → BladeMeta.recordRun. Un tap sur TITLE/OVER/WIN passe par
 * BladeUI.hitTest. Musique : startMusic('menu') dès le premier geste sur
 * TITLE (et au retour menu/over/win), startMusic('game') au lancement d'un
 * run ; setMusicIntensity((wave.id-1)/5) à chaque event 'wave'.
 * ORIENTATION : détecte tactile + portrait (h > w) → view.portraitBlocked =
 * true et ignore strokes/hitTest (l'unlock audio reste actif) ; au premier
 * geste, tente screen.orientation.lock('landscape') dans un try/catch
 * (marche sur Android en plein écran, refusé sur iOS → l'overlay suffit).
 * ========================================================================== */

if (typeof window !== 'undefined') window.CONFIG = CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
