# ⚔️ BLADE.EXE

Jeu de sabre réflexe cyberpunk en pseudo-3D — des fragments de données foncent
vers vous, tranchez-les d'un swipe **dans le sens de leur flèche** (±30°) avant
qu'ils ne vous atteignent. HTML5/Canvas pur, zéro dépendance, zéro asset externe.

**▶ Jouer : https://rativore.github.io/blade-exe/** (pensé paysage, tactile +
souris ; installable sur l'écran d'accueil iOS/Android en web-app plein écran).

---

## Modes de jeu

| Mode | Principe |
|---|---|
| **JOUER** (arcade) | Vagues infinies (LENT → KERNEL PANIC), combo ×8, slow-mo, high-score |
| **DÉFI DU JOUR** | Séquence du jour (seed par date, la même pour tous), objectif 1200 pts, barre de progression, **1 réussite/jour** → série |
| **NIVEAUX** | 2 mondes × 30 niveaux à objectif de score, étoiles = vies restantes, portes d'étoiles (nv 11 : 15★, nv 21 : 35★, monde 2 : 55★), boss aux nv 10/20/30 |
| **BOUTIQUE** | 2 onglets : 14 sabres (dont 3 multicolores) + 4 thèmes d'ambiance avec leur musique |

Mondes : **INFERNO.SYS** (rouge/orange, musique industrielle 150 BPM) et
**TOXIC.SECTOR** (vert acide, acid 140 BPM) — chaque monde impose sa DA et sa
musique pendant ses niveaux.

## Économie (ÉCLATS ◆)

- Défi réussi (1re fois du jour) : **50 + 5 × série** (doublable par pub ×2)
- Niveau : **20 ◆ + 10/étoile à la première réussite**, puis uniquement la
  différence d'étoiles ; niveaux boss ×2 ; monde parfait = 1 650 ◆
- Arcade : 1 ◆ / 1000 pts
- Boutique : sabres de 150 (VOLT) à 8 000 ◆ (OMÉGA), sabres multicolores
  BIFROST 1 500 / PRISME 3 000 / NEBULA 5 000, thèmes SAKURA 3 000 /
  MIDAS 6 000 / VOID 12 000 ; GLITCH et PHANTOM = trophées de série (3/7 j),
  non achetables

## Publicité (SIMULÉE — provider `sim`)

Interstitiel toutes les 2 fins de partie (jamais avant 5 parties, cooldown
120 s, jamais après une victoire, report si bloqué), bandeau au menu, « ×2
éclats » optionnel au défi réussi. Le tout dans `js/ads.js` : brancher un vrai
régisseur (SDK CrazyGames ou AdMob via Capacitor) = remplacer ce seul module.

## Architecture

`js/config.js` est **LE CONTRAT** : constantes de gameplay + API exacte de
chaque module. En cas de divergence, on corrige le module, jamais le contrat.

| Fichier | Rôle |
|---|---|
| `js/config.js` | Contrat partagé (constantes + specs d'API) |
| `js/engine.js` | Moteur pur (zéro DOM, RNG seedé mulberry32, déterministe) |
| `js/levels.js` | Vagues, courbe paramétrique des 60 niveaux, seeds |
| `js/meta.js` | Sauvegarde localStorage, économie, boutique, série |
| `js/audio.js` | 7 musiques procédurales + SFX, WebAudio pur (aucun fichier) |
| `js/ads.js` | Couche publicité (overlays DOM, provider interchangeable) |
| `js/ui.js` | Rendu canvas, écrans, thèmes de DA |
| `js/main.js` | Boucle, input, routage des écrans |
| `maquette.html` | Prototype d'origine (référence gameplay/visuelle, ne pas toucher) |

## Développement

- **Tests** : `node tests/simulation.test.js` — 32 cas (bots simulés,
  déterminisme, économie, migration de sauvegarde). Zéro dépendance.
- **Jouer en local** : double-clic sur `LANCER-LE-JEU.bat` (ou ouvrir `index.html`).
- **Publier** : incrémenter `CONFIG.VERSION` **et** les `?v=` d'`index.html`
  (anti-cache mobile), relancer les tests, commit + push — GitHub Pages
  redéploie en ~1 min. La version affichée en bas à gauche de l'écran titre
  permet de vérifier sur téléphone que la mise à jour est arrivée.

## ⚠️ État courant & chantiers en attente

- **`CONFIG.TEST_ALL_OWNED: true`** — toute la boutique est possédée d'office
  (phase de test client). **À repasser à `false`** pour restaurer l'économie.
- Pubs simulées : monétisation réelle = soumission portails (CrazyGames/Poki)
  ou app native Capacitor + AdMob — voir la feuille de route dans
  `../MODE-OPERATOIRE.md`.
- Avant le passage mobile/stores : audit complet (tests adversariaux moteur,
  équilibrage fin, revue UI).
- Sauvegarde locale à l'appareil (pas de sync cloud).

---
Prototype né de `maquette.html` (concept validé le 2026-07-22), développé par
pipeline d'agents IA — voir le mode opératoire du projet parent.
