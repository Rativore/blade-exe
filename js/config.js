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
 *   js/ads.js     → BladeAds     (couche pub — overlays DOM, jamais de canvas)
 *   js/ui.js      → BladeUI      (rendu canvas + effets cosmétiques)
 *   js/main.js    → boucle, input, écrans TITLE/PLAY/OVER, câblage global
 * Chaque module : window.X = X ; et si module.exports existe → module.exports = X
 * (engine, levels, meta doivent tourner sous Node sans navigateur).
 * ========================================================================== */

var CONFIG = {

  VERSION: '2.6',             // affichée en bas à gauche de l'écran titre — à incrémenter
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
    SPAWN_MARGIN_BOTTOM: 48,  // px — large : éloigne l'action du bord bas (geste
                              // système iOS « glisser depuis le bas » = sortie d'app)
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

  /* ------------------------------------------------ économie (monnaie IG) */
  ECONOMY: {
    CURRENCY: 'ÉCLATS',       // monnaie in-game, symbole ◆
    SYMBOL: '◆',
    DAILY_WIN_REWARD: 100,    // première réussite du défi du jour uniquement
    DAILY_STREAK_BONUS: 10,   // + BONUS × série (après incrément) à chaque réussite
    ARCADE_RATE: 1000,        // arcade : floor(score / RATE) éclats par partie
  },

  /* ------------------------------------------------ publicité (simulée) */
  ADS: {
    ENABLED: true,
    PROVIDER: 'sim',            // 'sim' = fausse pub (compte à rebours) ; plus
                                // tard : 'crazygames' | 'admob' — seul ads.js change
    SIM_DURATION: 5,            // s de la pub simulée
    INTERSTITIAL_EVERY: 2,      // 1 interstitiel toutes les N fins de partie
    INTERSTITIAL_MIN_GAMES: 5,  // jamais avant N parties jouées au total (save.gamesPlayed)
    INTERSTITIAL_COOLDOWN: 120, // s minimum entre deux interstitiels
    NO_AD_AFTER_WIN: true,      // jamais d'interstitiel après dailyWin ou 3★
    CONTINUE_PER_RUN: 0,        // « Continuer (pub) » DÉSACTIVÉ (choix client
                                // 2026-07-23 : au game over, uniquement REJOUER
                                // et MENU, l'interstitiel passe avant) ; remettre
                                // 1 pour réactiver l'offre — le code reste en place
    DAILY_X2: true,             // « ×2 éclats (pub) » sur l'écran DÉFI RÉUSSI
    BANNER: true,               // bandeau simulé en haut du menu TITLE uniquement
    BANNER_HEIGHT: 50,          // px
  },

  /* ------------------------------------------------ mode NIVEAUX */
  LEVELS: {
    PER_WORLD: 30,
    // étoiles d'un niveau réussi = vies restantes (3★ = zéro vie perdue)
    GATES: { 11: 15, 21: 35 },  // porte au niveau n : étoiles requises DANS ce monde
    WORLD2_STARS: 55,           // étoiles du monde 1 requises pour ouvrir le monde 2
    REWARD_FIRST: 20,           // ◆ première réussite d'un niveau
    REWARD_PER_STAR: 10,        // ◆ par étoile jamais obtenue sur ce niveau
    BOSS_LEVELS: [10, 20, 30],  // niveaux boss (récompenses ×2)
    BOSS_REWARD_MULT: 2,
  },

  // Chaque monde : DA (thème appliqué par BladeUI en jeu et sur ses écrans)
  // + musique dédiée (kind BladeAudio). L'arcade/défi gardent la DA GRID de base.
  WORLDS: [
    { id: 'inferno', name: 'INFERNO.SYS', music: 'inferno',
      theme: { BG: '#0a0202', GRID1: '#ff5a00', GRID2: '#ff2b4a',
               HUE_A: '#ff7a00', HUE_B: '#ff2b4a', DANGER: '#ffe600', TEXT: '#fff0e0' } },
    { id: 'toxic', name: 'TOXIC.SECTOR', music: 'toxic',
      theme: { BG: '#020a02', GRID1: '#39ff14', GRID2: '#eaff00',
               HUE_A: '#39ff14', HUE_B: '#eaff00', DANGER: '#ff1fd0', TEXT: '#eaffe0' } },
  ],

  /* ------------------------------------------------ lames cosmétiques (trail) */
  // unlock.type: 'default' | 'shop' (achat en éclats, price) | 'streak'
  // (série quotidienne — trophées NON achetables). Ordre = ordre d'affichage.
  BLADES: [
    { id: 'neon',    name: 'NÉON',    outer: 'rgba(255,31,208,0.5)', inner: '#eafcff', glow: '#ff1fd0', unlock: { type: 'default' } },
    { id: 'volt',    name: 'VOLT',    outer: 'rgba(234,255,0,0.5)',  inner: '#fdffe0', glow: '#eaff00', unlock: { type: 'shop',   price: 150 } },
    { id: 'plasma',  name: 'PLASMA',  outer: 'rgba(57,255,20,0.5)',  inner: '#eaffea', glow: '#39ff14', unlock: { type: 'shop',   price: 300 } },
    { id: 'oni',     name: 'ONI',     outer: 'rgba(162,107,255,0.5)',inner: '#f0e8ff', glow: '#a26bff', unlock: { type: 'shop',   price: 450 } },
    { id: 'aurum',   name: 'AURUM',   outer: 'rgba(255,208,0,0.5)',  inner: '#fff6d0', glow: '#ffd000', unlock: { type: 'shop',   price: 600 } },
    { id: 'spectre', name: 'SPECTRE', outer: 'rgba(0,255,200,0.5)',  inner: '#e0fff8', glow: '#00ffc8', unlock: { type: 'shop',   price: 1000 } },
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
 * BladeEngine.create({ mode, seed, viewport: {w, h}, level? }) → engine
 *   mode : 'arcade' | 'daily' | 'level' ; seed : entier (déterminisme total :
 *   même seed + mêmes appels ⇒ même partie ; RNG interne mulberry32, jamais
 *   Math.random dans engine.js).
 *   mode 'level' : opts.level = { target, grow, maxObjs, interval, batch,
 *   virusP, rotSpeed, dirs, seqLen, bossAt } (spec de BladeLevels.levelSpec) —
 *   paramètres de spawn FIXES (waveFor ignoré, pas d'événements 'wave') ;
 *   bossAt = null ou fraction (ex 0.6) : UN boss spawn quand score >=
 *   bossAt×target (bossSpec(0), mêmes règles) ; victoire quand score >=
 *   target → status 'WIN', event {type:'levelWin', score, maxCombo,
 *   stars: lives} (les vies restantes = étoiles) ; défaite = 'over' normal.
 *   state gagne target (mode level, sinon null) pour la barre de progression.
 * engine.revive() → bool — uniquement si status === 'OVER' et mode 'arcade' :
 *   repasse status à 'PLAY', lives = 1, combo = 0, vide objs (boss compris),
 *   réarme le timer de spawn ; score/maxCombo conservés. Sinon → false.
 *   (Support du « Continuer (pub) » ; le déterminisme d'un run avec revive
 *   n'est plus garanti après l'appel — sans importance en arcade.)
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
 * --- mode NIVEAUX ---
 * BladeLevels.levelSpec(worldIdx 0|1, levelIdx 1..30) → { seed, target, grow,
 *   maxObjs, interval, batch, virusP, rotSpeed, dirs, seqLen, bossAt, boss }
 *   Courbe PARAMÉTRIQUE (pas 60 configs à la main) : monde 1 — target 300 →
 *   ~1500, grow 2.6 → 1.3, virus dès nv 4, rotation dès nv 12, double coupe
 *   dès nv 18 ; monde 2 — reprend ~nv 12 du monde 1 en plus dense et pousse
 *   plus loin (virusP jusqu'à 0.40, seqLen 2 fréquent). boss = levelIdx ∈
 *   CONFIG.LEVELS.BOSS_LEVELS (bossAt 0.6, target +30 %), sinon bossAt null.
 *   seed = hash(worldId + '-' + levelIdx) déterministe.
 * BladeLevels.levelGate(worldIdx, levelIdx) → étoiles requises dans ce monde
 *   (CONFIG.LEVELS.GATES, 0 sinon) ; BladeLevels.worldGate(worldIdx) → étoiles
 *   du monde précédent requises (0 pour le monde 0, WORLD2_STARS pour le 1).
 *
 * ------------------------------------------------------------------ meta.js
 * BladeMeta.load() → save (crée les défauts si absent ; localStorage
 *   CONFIG.SAVE_KEY ; fallback mémoire si localStorage indisponible → Node OK)
 * save = { best, bestCombo, totalScore, shards,
 *          blades: { unlocked:['neon',...], equipped:'neon' },
 *          daily:  { lastDate:'YYYY-MM-DD'|null, streak:0, scores:{date:score} } }
 *   Migration : anciennes sauvegardes sans shards → shards:0 ; lames déjà
 *   unlocked (anciens types total/best) RESTENT unlocked telles quelles.
 * BladeMeta.get() → save courant (load() implicite au premier accès)
 * BladeMeta.recordRun({mode:'arcade'|'daily', score, maxCombo, dateStr}) →
 *   { newBest:bool, unlocked:[bladeId,...], streak, shardsEarned, shards }
 *   - met à jour best/bestCombo/totalScore, persiste ;
 *   - mode daily : scores[dateStr] = max(existant, score) toujours enregistré,
 *     mais la série ne bouge QUE si le défi est réussi (score >= CONFIG.DAILY.GOAL) :
 *     streak +1 si lastDate = veille, reset à 1 si trou, inchangé si même jour
 *     (lastDate n'est posé que sur une réussite) ;
 *   - ÉCLATS : réussite du défi ET lastDate !== dateStr avant l'appel (première
 *     réussite du jour) → shardsEarned = DAILY_WIN_REWARD + DAILY_STREAK_BONUS ×
 *     streak (après incrément) ; mode arcade → floor(score / ARCADE_RATE) ;
 *     défi rejoué ou raté → 0 ; shards += shardsEarned ;
 *   - déverrouille les lames 'streak' dont la condition est atteinte.
 * BladeMeta.buyBlade(id) → { ok:bool, shards }  — refus si pas type 'shop',
 *   déjà possédée, ou shards < price ; sinon débite, ajoute à unlocked, persiste.
 * save.gamesPlayed (migration : 0) — incrémenté à chaque recordRun ET chaque
 *   recordLevel (sert au seuil ADS.INTERSTITIAL_MIN_GAMES).
 * BladeMeta.addShards(n) → shards — crédite n (>0) éclats et persiste
 *   (récompenses pub : ×2 défi, +bonus boutique plus tard).
 * --- mode NIVEAUX ---
 * save.levelStars = { 'inferno-1': 2, ... }  (0 étoiles = jamais réussi ;
 *   migration : défaut {}).
 * BladeMeta.recordLevel({worldId, levelIdx, stars, score}) → { shardsEarned,
 *   improved:bool, shards } — étoiles conservées au max historique ;
 *   éclats = REWARD_FIRST (si première réussite) + REWARD_PER_STAR × (étoiles
 *   nouvelles au-delà du max précédent), le tout × BOSS_REWARD_MULT si niveau
 *   boss ; rejouer sans améliorer = 0 ; persiste.
 * BladeMeta.getLevelProgress() → { stars:{clé:étoiles}, starsByWorld:[n0,n1],
 *   totalStars } (calculé depuis save.levelStars et CONFIG.WORLDS).
 * BladeMeta.getBlades() → [{...blade, unlocked:bool, equipped:bool}]
 * BladeMeta.equipBlade(id) → bool (refus si verrouillée)
 * BladeMeta.todayStr(d?) → 'YYYY-MM-DD' locale
 *
 * ------------------------------------------------------------------- ads.js
 * BladeAds — couche publicité, indépendante du canvas : tous ses affichages
 * sont des overlays DOM (div plein écran / bandeau), par-dessus le jeu.
 * PROVIDER 'sim' : vidéo remplacée par un panneau « PUBLICITÉ SIMULÉE » avec
 * compte à rebours (ADS.SIM_DURATION) — interstitiel fermable à la fin,
 * récompensée créditée seulement si le compte à rebours va au bout (bouton
 * ABANDONNER possible → échec). Brancher un vrai SDK = réécrire ce seul module.
 * BladeAds.init()
 * BladeAds.registerRunEnd({won:bool}) → bool — comptabilise une fin de partie
 *   et affiche l'interstitiel si dû : toutes les INTERSTITIAL_EVERY fins, si
 *   gamesPlayed >= INTERSTITIAL_MIN_GAMES, cooldown écoulé, et pas après une
 *   victoire quand NO_AD_AFTER_WIN. Retourne true si une pub s'affiche.
 * BladeAds.showRewarded(placement, cb) — placement 'continue'|'dailyX2' ;
 *   cb(success:bool) appelé à la fermeture. Pendant tout overlay : les inputs
 *   du jeu ne doivent rien recevoir (l'overlay DOM capte les événements).
 * BladeAds.setBanner(visible) — bandeau simulé fixé en haut (BANNER_HEIGHT px),
 *   TITLE uniquement ; ne s'affiche que si ADS.BANNER.
 * BladeAds.bannerHeight() → px effectifs du bandeau visible (0 sinon).
 * Silencieux et sans crash sous Node (aucun DOM → no-op).
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
 *   kind 'inferno' : industriel agressif ~150 BPM — kick lourd, basse saw
 *   distordue (waveshaper), hats métalliques, stabs graves (monde INFERNO.SYS).
 *   kind 'toxic' : acid ~140 BPM — basse résonante type 303 (lowpass Q élevé
 *   balayé), offbeat hats, blips mouillés (monde TOXIC.SECTOR).
 *   setMusicIntensity s'applique à 'game', 'inferno' et 'toxic' (densité+filtre).
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
 *   { screen:'TITLE'|'PLAY'|'OVER'|'WIN'|'SHOP'|'WORLDS'|'LEVELS'|'LEVELEND',
 *     engineState|null, meta, menu, mode }
 *   --- mode NIVEAUX ---
 *   BladeUI.setTheme(theme|null) : null = DA GRID de base (arcade/défi/menus) ;
 *   un theme de CONFIG.WORLDS = fond, grille, teintes fragments (HUE_A/HUE_B
 *   remplacent CY/MG), virus (DANGER), textes HUD — appliqué pendant tout le
 *   run ET sur les écrans WORLDS/LEVELS/LEVELEND du monde sélectionné.
 *   WORLDS : 2 cartes (nom, DA en fond, étoiles xx/90, verrou + « 55★ requis »
 *   si fermé), RETOUR → btnRects.WORLDS = {world0, world1, back}.
 *   LEVELS : grille 6×5 du monde menu.worldIndex — chaque case : numéro,
 *   0-3★, verrou (niveau précédent non fini OU porte d'étoiles non atteinte,
 *   afficher « n★ » requis sur les portes), boss marqués ⬢ ; solde ◆ ; RETOUR.
 *   btnRects.LEVELS = {lvl1..lvl30, back}.
 *   LEVELEND (réussite OU échec de niveau) : étoiles obtenues (grosses, la
 *   version échec affiche ÉCHEC + objectif), score/objectif, +X ◆, boutons
 *   SUIVANT (si réussite et suivant jouable) / REJOUER / NIVEAUX →
 *   btnRects.LEVELEND = {next, replay, back}.
 *   PLAY en mode level : barre de progression score/target (comme le défi).
 *   BOUTIQUE (screen SHOP) : solde ◆ en haut, carrousel de lames (une à la
 *   fois, ◀ ▶) avec aperçu de la traînée en couleur, nom, prix ou état
 *   (POSSÉDÉE / ÉQUIPÉE / RÉCOMPENSE DE SÉRIE x J), gros bouton contextuel
 *   ACHETER (si achetable et solde suffisant, grisé sinon) ou ÉQUIPER (si
 *   possédée), bouton RETOUR. btnRects.SHOP → 'shopPrev'|'shopNext'|'buy'|
 *   'equip'|'back'. TITLE : bouton BOUTIQUE (sous les 2 modes) + solde ◆
 *   affiché ; OVER/WIN : ligne « +X ◆ » (shardsEarned du run, via
 *   menu.shardsEarnedThisRun). Layout paysage 2 colonnes comme le reste.
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
 * 'bladePrev'|'bladeNext'|'home'|'shop'|'shopPrev'|'shopNext'|'buy'|'equip'|
 * 'back'|'levels'|'world0'|'world1'|'lvl1'..'lvl30'|'next'|'continue'|'x2'|
 * null (main.js
 * route les taps ; écran SHOP : carrousel dans menu.shopIndex, buy/equip sur
 * menu.blades[menu.shopIndex] ; écrans NIVEAUX : menu.worldIndex/levelIndex).
 * PLAY : bouton ⌂ ACCUEIL discret en haut à gauche, SOUS le score (dans la
 * zone HUD protégée par SPAWN_MARGIN_TOP) → btnRects.PLAY.home ; permet de
 * quitter la partie en cours pour revenir au menu.
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
 * ACCUEIL EN JEU : en PLAY, onDown teste d'abord hitTest(x,y,'PLAY') ;
 * si 'home' → terminer le run comme une fin de partie (recordRun avec le
 * score courant, musique menu, écran TITLE), sinon stroke normal.
 * BOUTIQUE : écran SHOP (pas d'engine) — 'shop' depuis TITLE, 'back' →
 * TITLE ; 'buy' → BladeMeta.buyBlade + son 'bossDone' si ok / 'wrong' si
 * refus ; 'equip' → equipBlade + setBlade ; menu.shopIndex pour le carrousel.
 * Fin de run : menu.shardsEarnedThisRun = recordRun().shardsEarned (affiché
 * sur OVER/WIN) ; musique menu conservée sur SHOP.
 * PUB (view.adOffers, fourni par main.js) : OVER — bouton « CONTINUER (PUB) »
 * (btnRects.OVER.continue) si view.adOffers.continue ; WIN — bouton « ×2
 * ÉCLATS (PUB) » (btnRects.WIN.x2) si view.adOffers.x2. Sur TITLE, décaler le
 * bouton SON et tout contenu du haut de view.bannerOffset px (bandeau DOM).
 * Flux main.js : event 'over' en arcade avec continue dispo → écran OVER SANS
 * recordRun (fin en attente) ; action 'continue' → showRewarded('continue') →
 * succès : engine.revive() + retour PLAY + musique game ; échec/refus ou toute
 * autre action → finaliser (recordRun) PUIS agir. Fin de partie finalisée
 * (over/levelend/dailyWin) → BladeAds.registerRunEnd({won}) ; won = dailyWin
 * ou niveau réussi 3★. Action 'x2' (WIN, une fois) → showRewarded('dailyX2')
 * → succès : BladeMeta.addShards(menu.shardsEarnedThisRun) et doubler
 * l'affichage. Bannière : BladeAds.setBanner(screen === 'TITLE') à chaque
 * changement d'écran ; view.bannerOffset = BladeAds.bannerHeight().
 * NIVEAUX : bouton 'levels' au TITLE → WORLDS ; 'world0/world1' (si ouvert) →
 * setTheme(monde) + LEVELS ; 'lvlN' (si déverrouillé : niveau précédent fini
 * ET porte d'étoiles atteinte) → engine mode 'level' avec levelSpec, musique
 * du monde (startMusic(world.music)), menu.worldIndex/menu.levelIndex posés.
 * Event 'levelWin' → recordLevel + écran LEVELEND (réussite) ; event 'over'
 * en mode level → LEVELEND (échec, 0★, pas de recordLevel). 'next' → niveau
 * suivant ; 'back' → LEVELS ; retour au TITLE = setTheme(null) + musique menu.
 * Le bouton ⌂ en mode level → LEVELS (pas TITLE), sans recordLevel.
 * ========================================================================== */

if (typeof window !== 'undefined') window.CONFIG = CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
