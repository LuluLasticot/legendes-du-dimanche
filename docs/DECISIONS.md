# Légendes du Dimanche — Journal des décisions

> Décisions techniques et de conception importantes, les plus récentes en bas. Format : contexte → décision → conséquences.

---

## D-001 — Versions de la stack (Phase 0, 27/09/2026)

- **Node 24 LTS** (`.nvmrc`), testé aussi sous Node 22 en CI. **pnpm 12** épinglé via `packageManager` (corepack).
- **TypeScript 6.0**, pas 7.0 : `typescript-eslint` 8.x exige TypeScript < 6.1. Passer à TS 7 (compilateur natif) dès que typescript-eslint le supporte.
- **ESLint 10** en configuration plate. On n'utilise pas `eslint-config-next`, qui embarque `eslint-plugin-react`, non compatible avec ESLint 10. On branche à la place `@next/eslint-plugin-next` et `eslint-plugin-react-hooks` directement.
- **Next.js 16** (App Router, Turbopack), **React 19.3**, **Tailwind 4.3**, **Zod 4**, **Vitest 5**, **fast-check 4**.
- Versions partagées via le **catalogue pnpm** (`pnpm-workspace.yaml`).
- Scripts d'installation désactivés par défaut (pnpm) ; `@parcel/watcher` et `@swc/core`, tirés par next-intl, sont explicitement refusés : leurs binaires précompilés suffisent.

## D-002 — Paquets internes livrés en sources TypeScript

Les paquets `packages/*` exposent directement leurs fichiers `.ts` (champ `exports`), sans étape de build ; Next.js les transpile (`transpilePackages`).
**Imports relatifs avec l'extension `.ts` explicite** (`allowImportingTsExtensions`) : `engine` et `shared` s'exécutent ainsi tels quels sous **Deno** (Supabase Edge Functions), sous Node (type stripping) et avec les bundlers.

## D-003 — PRNG : xoshiro128\*\* initialisé par splitmix32

- Opérations entières 32 bits uniquement (`Math.imul`, décalages) : identiques sur tous les moteurs JS.
- `float()` utilise 53 bits (deux tirages), `int()` est sans biais (rejet), `normal()` utilise Box–Muller avec les maths déterministes.
- **Sous-graines** : `deriveSeed(graine, ...étiquettes)` et `rng.fork('moment', 3)` ne dépendent que de la graine d'origine et des étiquettes, **pas du nombre de tirages déjà consommés**. Ajouter un tirage dans une phase du match ne décale donc pas les actions clés suivantes.
- État sérialisable (`getState` / `fromState`) pour les reprises et la reconnexion.
- Remplace `core/random.ts` (mulberry32) de Carte du Ciel.

## D-004 — Maths déterministes (`engine/math`)

ECMAScript laisse `Math.sin/cos/exp/log/pow/atan2…` « approximées par l'implémentation » : V8, JavaScriptCore et SpiderMonkey peuvent renvoyer des bits différents.
- Portage des noyaux **fdlibm** (sin, cos, atan, exp, log) : uniquement `+ − × ÷`, `Math.sqrt` (arrondi correct imposé par IEEE-754), `Math.round/floor/abs` et manipulation de bits (`DataView`, grand-boutiste explicite).
- Précision mesurée par rapport à `Math.*` : ≤ 1e-15 en relatif (sin/cos sur |x| < 1e4, atan/atan2, exp, log), 1e-12 pour `pow` à exposant réel.
- `pow` avec un exposant entier : exponentiation rapide exacte ; sinon `exp(y·log x)`.
- **Vérifié par le lint** dans `packages/engine/src` : `Math.random/sin/cos/…/pow/hypot` interdits, opérateur `**` interdit, `Date` interdit, `Object.keys/values/entries` et `for…in` interdits (ordre d'itération implicite), globales de plateforme interdites (`window`, `performance`, `crypto`, minuteurs), imports de `render*`, `ui`, `apps`, `react`, `three`, `pixi.js` et `node:*` interdits.

## D-005 — Test de déterminisme par empreinte de référence

- `engine/selftest` exécute un scénario canonique : flux du PRNG, grille de valeurs pour les maths avec des valeurs spéciales (±0, sous-normaux, ±∞, NaN), et vol de ballon à 120 Hz (gravité, traînée, Magnus, vent, rebonds).
- Chaque flottant est haché **au bit près** (NaN normalisé, −0 ≠ +0) → une empreinte de 64 bits comparée à `src/selftest/golden.ts`.
- Exécuté 1 000 fois sous Node (Vitest), sous Deno (`deno test`), en CI sur Node 22, Node 24 et Deno 2, et **dans le navigateur du visiteur** sur la page d'accueil (contrôle croisé réel avec Safari et Firefox).
- On ne régénère l'empreinte (`pnpm determinism:update`) que volontairement : une modification signifie que les replays et validations d'anciens matchs ne sont plus reproductibles.
- À ajouter plus tard : un test Playwright sous WebKit et Firefox (Phase 1 ou 4).

## D-006 — Identifiants anglais, libellés français

Postes (`GK`, `RB`, `CB`…), traits (`workhorse`, `late-arrival`…), surfaces (`grass`, `muddy`, `dirt`…) ont des identifiants anglais ; les libellés du jeu (G, DD, DC, « Poumon », « Arrivé à 14h58 », « Stabilisé »…) sont dans `packages/shared/messages/fr.json` (domaine) et `apps/web/messages/fr.json` (interface), chargés par **next-intl** sans routage de langue (fr uniquement, prêt pour fr-BE et nl-BE).

## D-007 — Règles métier encodées dans les schémas Zod

- Âge des joueurs : **18 ans minimum** (règle non négociable n° 6), vérifié par un test de propriété.
- Divisions : N2 et N3 seulement au niveau national (la Ligue 3 est professionnelle depuis le 1er juillet 2026), R1 à R4, profondeur de district variable (jusqu'à D9).
- Test : aucune marque interdite dans les textes du jeu.

## D-008 — Supabase

- CLI en dépendance de développement (`pnpm db:*`). `supabase start` nécessite **Docker** (ou OrbStack), absent de la machine de développement au moment de la Phase 0.
- Migration initiale vide (ancre l'historique) ; seeds dans `supabase/seed/*.sql`.
- Variables d'environnement validées par Zod (`apps/web/src/env.ts`), optionnelles jusqu'à la première fonctionnalité qui en a besoin (auth, Phase 4). Nouvelles clés Supabase : *publishable* / *secret*.

## D-009 — Nom du jeu : Légendes du Dimanche (27/09/2026)

« Main Courante » (nom de code) était peu parlant pour les joueurs. Nouveau nom : **Légendes du Dimanche** (pilier « fierté » + foot amateur du dimanche), accroche **« Ton club. Ta carte. Ta légende. »**
Code : scope npm `@legendes/*`, préfixe des variables CSS `--ld-`, dépôt `legendes-du-dimanche`. Le dossier local reste `main-courante` (sans incidence). Recherche d'antériorité INPI et réservation du domaine à faire avant le lancement public.

## D-010 — Physique du ballon (Phase 1, PR 1)

- Repère monde : mètres, Y vers le haut, origine au point central, +X vers le but attaqué, +Z à droite de l'attaquant.
- Euler semi-implicite à 120 Hz : gravité, traînée quadratique (Cd 0,25), portance de Magnus `a = ½·ρ·A·r·Cm/m · (ω × v)`, décroissance exponentielle de l'effet, vent. Le solveur de frappe utilisera le même intégrateur : ce que le joueur vise est exactement ce qui vole.
- Sol : rebond (restitution, frottement tangentiel) puis roulement (résistance au roulement) sous un seuil d'impact ; paramètres par surface (pelouse, synthétique, terrain gras, stabilisé). Le stabilisé ajoute une dispersion des rebonds tirée du PRNG du moment (aléatoire mais rejouable).
- Cadre du but : poteaux et barre modélisés comme des capsules, détection sur 4 sous-pas par tick (sinon un ballon à 25 m/s traverse le poteau). Filet : boîte qui absorbe la vitesse et émet des événements d'impact pour la déformation au rendu.
- Tous les paramètres de ressenti sont dans `DEFAULT_PHYSICS` (réglables depuis `/lab`) ; le test de déterminisme utilise une **copie figée** de ces valeurs, pour que le réglage ne change pas l'empreinte de référence.

## D-011 — Du geste à la frappe (Phase 1, PR 2)

- **Entrée rejouable** : la trace est une suite de points en coordonnées d'écran normalisées, horodatés en ticks (sérialisable, re-simulable par le serveur). Le point visé en 3D (projection de la fin de trace) est calculé par le rendu et transmis avec la trace.
- **Comme dans Score! Hero, on trace le chemin voulu** : un arc qui bombe à droite fait partir le ballon à droite, puis le ramène à gauche vers la cible. `bulge ∈ [−1, 1]` = écart maximal à la corde (22 % de la corde = effet maximal) ; `power ∈ [0, 1]` = vitesse de la trace.
- **Solveur par tirs successifs** : même intégrateur que le vol réel (ce qu'on vise est ce qui vole). On ajuste l'orientation (lacet) et l'angle de tir (tangage) à vitesse et effet imposés. Pas de Newton avec la sensibilité géométrique, affinés par sécante quand la pente a le bon signe. Pas bornés (0,12 rad) et deux branches séparées : tir tendu sous 63°, lob au-dessus de 40°. Si le ballon touche le sol avant la cible, l'erreur reste continue, sinon le solveur saute vers une solution « rebond ». Converge à 2 cm près sur 500 cas aléatoires (11 à 30 m, tout le cadre, effet de −1 à 1).
- **Stats → plafonds et cône** : puissance de frappe → vitesse max (21 à 34 m/s) ; effet → rotation max ; finition → écart angulaire à 1 σ (4,5° à 0,6°), multiplié par le pied faible (+30 % par étoile manquante) et par la pression, atténuée par le sang-froid. L'erreur d'exécution est tirée du PRNG du moment : aléatoire mais rejouable.
- Test : un bon finisseur rate en moyenne au moins 2 fois moins loin qu'un joueur moyen (« les stats se sentent »).

## D-012 — Rendu 3D : `Stage` impératif (Phase 1, PR 3)

- Port de Carte du Ciel (`render/engine.ts`, `render/quality.ts`, `shaders/post`, caméra) : les singletons globaux liés au DOM deviennent une classe **`Stage`** (`Stage.mount(canvas)` → `onFrame` → `dispose`). React ne fait que fournir un `<canvas>` et charge `@legendes/render3d` à la demande (`import()` dans un effet) : Three.js reste hors du JS initial de l'app.
- **Three.js 0.186** (au lieu de 0.169 dans Carte du Ciel), WebGL 2. Les shaders sont des chaînes TS (`/* glsl */`) plutôt que des fichiers `?raw` : pas de configuration de chargeur dans Next/Turbopack.
- **Post-traitement HDR** repris tel quel : cible half-float + MSAA selon le niveau, bloom Kawase double, composite (ACES, vignette, grain, aberration, flash, bandes, zoom, onde de choc). Les stats de budget (appels de dessin, triangles) ne mesurent que la passe scène.
- **Horloge à pas fixe** (`FrameClock`) : la simulation n'avance que par ticks entiers de 120 Hz, le rendu interpole (`alpha`). Ralenti (`setTimeScale` avec rampe) et hit-stop (gel de la simulation, le rendu continue). Les effets cosmétiques décroissent avec le temps réel non plafonné (`wallDt`), jamais avec le temps simulé.
- **Qualité** : détection par appareil, résolution dynamique puis baisse de niveau automatique (machine à états pure `AdaptiveResolution`, testée) ; ombres désactivées en qualité basse.
- **Secousse** par « trauma » (désactivée si `prefers-reduced-motion`), appliquée par-dessus la caméra de la scène puis retirée après le rendu.
- Banc d'essai `/lab/render` (non indexé) : frappes du solveur jouées en boucle, affichage des stats. Mesuré dans le navigateur de développement : 60 i/s, 17 appels de dessin, ~2 000 triangles.

## D-013 — Bac à sable du ballon `/lab/ball` (Phase 1, PR 4)

- **Page de réglage** (règle du CLAUDE.md : tout ce qui touche au ressenti est réglable, rien en dur) : **Tweakpane 4**, chargé à la demande avec la scène. Réglables : stats du tireur, position du ballon, surface et vent, physique du vol et du sol, geste, frappe (plafonds, cône, pénalités), affichage. Les réglages sont conservés dans le navigateur (`localStorage`, validés par Zod à la relecture, repli sur les valeurs par défaut) et copiables en JSON pour les figer ensuite dans le code.
- **Geste → cible** : la fin de la trace est projetée par raycast sur le plan de la ligne de but ; la trace est en unités « hauteurs d'écran » (isotrope : la courbure ne dépend pas du format de l'écran).
- **Puissance = vitesse sur le temps de mouvement seulement** : garder le doigt immobile avant de lâcher (ou avant de partir) n'affaiblit pas la frappe. Découvert en test : sinon un joueur qui marque une pause obtient une frappe molle. Seuil d'immobilité réglable.
- **Trajectoire prévue** pendant le tracé (même solveur, sans erreur d'exécution) et repère de cible ; trace réelle après la frappe ; vecteurs vitesse/effet en option.
- **Ralenti par re-simulation** : on rejoue le même état initial avec la même graine de rebonds ; aucun enregistrement d'images.
- La matrice de la caméra est mise à jour dès son placement : le raycast du geste ne doit pas dépendre d'une image déjà rendue.

## D-014 — Stade amateur en blocs gris + première passe d'ambiance (Phase 1, PR 5)

- **Kit procédural, sans asset** (`packages/render3d/src/stadium`) : terrain peint dans une texture canvas selon la surface (tontes sur pelouse, granulés sur synthétique, boue dans les surfaces de réparation et au rond central sur terrain gras, stabilisé ocre), tous les tracés réglementaires (module pur `markings.ts`, testé), **main courante** blanche, deux buts complets, tribune en tôle, vestiaires préfabriqués et **buvette éclairée**, 8 pylônes d'éclairage (coins + derrière chaque but) avec halos, ceinture d'arbres et maisons, ciel nocturne avec pollution lumineuse à l'horizon.
- **Filets déformables** : grille de cordes (bords fixés au cadre et au sol), déformation = somme de bosses amorties déclenchées par les événements `net` du moteur (`net-field.ts`, pur et testé). Pilotée par le temps simulé : le ralenti fait onduler le filet au ralenti, et un replay rejoue la même déformation.
- **Budgets** : éléments répétés instanciés (poteaux de la main courante, arbres, maisons, pylônes, projecteurs) ou fusionnés (buts, tribune, rails). Mesuré : **22 appels de dessin, 10 800 triangles** pour le stade complet.
- Résolution de la texture du terrain selon la qualité (10 à 18 px/m), filtrage anisotrope ; une seule lumière portée (depuis un pylône), ombres désactivées en qualité basse.

## D-015 — Gardien de but (Phase 1, PR 6)

- **Modèle déterministe** (`engine/moments/keeper.ts`), pas à pas avec le ballon dans `shot-moment.ts` (action de tir = vol + gardien ; réutilisable par le serveur et l'auto-résolution) :
  1. **Placement** sur la bissectrice de l'angle de tir, avancé selon le placement (0,3 à 1 m).
  2. **Réaction** (réflexes : 0,32 → 0,13 s), puis **lecture** du point de passage avec une erreur tirée de la graine (placement ; l'effet la rend plus difficile). **La lecture s'affine en approchant** (erreur ∝ √temps restant) : un tir droit sur le gardien est presque toujours arrêté.
  3. **Suivi** : un ou deux pas chassés au maximum (0,5 m), puis **plongeon déclenché pour arriver en extension au passage du ballon**. Découvert en test : plonger dès la lecture le faisait retomber avant l'arrivée des tirs lents.
  4. **Enveloppe de portée elliptique** : pleine latéralement à hauteur de hanche, moindre en hauteur **et** au ras du sol. Les lucarnes restent hors de portée des gardiens moyens. Petite **correction tardive** des mains en plein plongeon (réflexes).
  5. **Contact** mains / bras / corps : capter ou repousser selon la prise de balle, la vitesse du tir et l'extension. **La parade éloigne toujours le ballon du but** (vers le terrain, au-dessus ou autour du poteau). Découvert en test : la simple réflexion sur la main renvoyait certains ballons dans le filet. Une parade qui ne finit pas au fond compte comme un arrêt.
- **Calibrage par défaut** (500 tirs visés de 12 à 25 m par un tireur à 70, taux de but des tirs cadrés) : gardien 90 → 17 % (coins 28 %), ~77 → 33 % (coins 52 %), ~52 → 60 % (coins 87 %), ~35 → 70 % (coins 90 %). Le test de propriété vérifie un écart d'au moins 15 points entre un bon et un mauvais gardien. Tous les paramètres sont réglables dans `/lab/ball` (dossiers « Gardien » et « Réglages du gardien »).
- Rendu : silhouette provisoire dont les membres relient exactement les points utilisés par le moteur pour les contacts (pieds, tête, mains). Elle sera remplacée par le personnage animé.
- Le test de déterminisme couvre désormais 10 actions complètes contre un gardien (réglages figés).

## D-016 — Défenseurs et mur (Phase 1, PR 7)

- **Modèle déterministe** (`engine/moments/defenders.ts`) : chaque défenseur est une capsule pieds → tête, avec deux rôles.
  - **Mur** : placé automatiquement à 9,15 m, du premier poteau vers le centre. Il saute à la frappe après un court délai (DÉF) ; la détente dépend de PHY.
  - **Marquage** : après sa réaction, il vise le **point le plus tôt de la trajectoire qu'il peut atteindre** (course avec accélération, VIT). Il se jette au dernier moment (allonge du tacle, DÉF) ou saute pour une tête.
- **Réaction courte au marquage** (0,30 → 0,08 s) : un défenseur face au tireur lit sa position avant la frappe. Découvert en test : avec un temps de réaction « visuel » classique, aucun contre n'était possible à moins de 9 m, ce qui n'est pas réaliste.
- **Contre** : réflexion sur le corps, perte de vitesse (40 % gardés) et ricochet tiré de la graine. Le ballon reste vivant : une déviation peut finir au fond. **Le gardien réagit de nouveau** après une déviation s'il n'a pas encore plongé (sinon il est pris à contre-pied). Issue `blocked` si le dernier à toucher le ballon est un défenseur.
- Mesuré : la plupart des contres viennent d'un défenseur déjà sur la ligne de tir ; la vitesse et la défense ajoutent environ 40 % de contres « de justesse » (test statistique).
- Bac à sable : nombre de joueurs dans le mur, défenseurs au marquage (distance, écart), attributs et tous les réglages ; silhouettes rouges (`PlayerFigure`, commune avec le gardien). Vérifié : coup franc enroulé par-dessus un mur de 4 → but dans la lucarne du premier poteau.

## D-017 — Réalisateur de caméra v1 (Phase 1, PR 8)

- **Plans décrits comme des fonctions de cadrage** (`render3d/camera/director.ts`, sans DOM, testé) :
  - **visée** derrière le tireur ;
  - **poursuite** du ballon, derrière et au-dessus, avec anticipation ; le but reste toujours dans le cadre ;
  - **latéral** façon télé depuis la ligne de touche ;
  - **contrechamp** depuis l'arrière du filet ;
  - **plongée** ;
  - **gros plan sur le gardien** après un arrêt, **orbite** autour du but après un but, **tenue** après un tir manqué.
- **Choix automatique selon l'étape** : visée → poursuite → résultat. Des modes fixes permettent de juger chaque plan seul.
- **Montage** : ressorts critiques (sans dépassement) pour les transitions continues (visée → poursuite) ; **coupes franches** pour le résultat et les replays. La caméra est lissée en temps réel, donc elle reste fluide pendant le ralenti.
- **Ralenti** déclenché par le réalisateur quand un ballon encore en jeu arrive devant le but (0,28 s avant, ×0,3), et maintenu un instant après un but ou un arrêt. Le temps de simulation reste en ticks entiers : le ralenti ne change pas le résultat.
- **Effets d'impact centralisés** (arrêt sur image, secousse, flash) pour la frappe (selon la puissance), le but, l'arrêt, le poteau et le contre ; atténués de moitié en replay.
- **Replay par re-simulation**, rejoué automatiquement après un but, avec un angle qui change à chaque fois (contrechamp → latéral → plongée → poursuite).
- Tous les paramètres sont dans le dossier « Caméra » du panneau de `/lab/ball` (règle du CLAUDE.md : le ressenti se règle, il n'est pas codé en dur).

## D-018 — « Juice » et audio (Phase 1, PR 9)

- **Traînée du ballon** : ruban orienté vers la caméra, qui s'amincit vers la queue, avec une couleur HDR selon la vitesse (craie → or projecteur → orange vif) pour que le bloom la fasse briller. Un seul appel de dessin.
- **Particules d'impact** (un seul appel de dessin, simulation sur le processeur, taille selon la qualité) : herbe, granulés de synthétique, boue, poussière de stabilisé, bouffée de filet, étincelles sur le poteau, **confettis derrière le but**. Tirages issus de la graine de l'action : **un replay montre exactement les mêmes éclats**. Elles suivent le temps simulé, donc ralentissent avec le ralenti.
- **Audio 100 % synthétisé** (WebAudio, port de Carte du Ciel : bus principal, compresseur, réverbération courte « plein air », contournement du bouton silencieux de l'iPhone). **Aucun fichier son**, donc aucune question de licence (DONNEES-ET-LEGAL §6).
  - Sons du jeu : frappe différente selon la surface, rebonds, filet, « bong » du poteau, gants (capté / repoussé), contre, sifflet à roulette.
  - Tribune d'une trentaine de personnes : murmure continu, clameur et applaudissements épars sur un but, « ooh » sur un arrêt ou un poteau.
  - Volumes séparés (général, effets, public, GDD §12.6). Le son se débloque au premier geste, comme l'exigent les navigateurs mobiles.
- Tout est réglable dans le dossier « Effets et son » de `/lab/ball`.

## D-019 — Personnages animés (Mixamo) (Phase 1, PR 10)

- **Sources** : 30 FBX Mixamo téléchargés par Lucas (personnage Y Bot + 29 animations : tireur, défenseurs, gardien, célébrations, réactions) dans `assets-src/mixamo/`, **hors git**. Les conditions d'Adobe autorisent l'usage dans un jeu, pas la redistribution des fichiers bruts, et le dépôt est public.
- **Conversion** (`pnpm --filter @legendes/render3d convert:mixamo`) :
  - FBX → glTF dans Node (FBXLoader et GLTFExporter de Three.js), un seul fichier `player.glb`, squelette partagé, 28 animations ;
  - **déplacement du bassin retiré** : c'est le moteur qui place les joueurs ;
  - maillage **simplifié** (55 000 → 8 300 triangles, meshoptimizer), animations rééchantillonnées, quantification et compression meshopt : **1,7 Mo** ;
  - **métadonnées** calculées en rejouant chaque animation dans Node : instant et position du **contact pied-ballon**, **extension maximale des mains** dans les plongeons, sommet des sauts, déplacement retiré. Elles sont validées par Zod au chargement.
  - Les fichiers convertis vont dans `apps/web/public/assets/characters/`, eux aussi **hors git**. **Sans eux (déploiement Vercel actuel), le jeu revient aux silhouettes provisoires**, sans erreur. Pour les servir en ligne : `NEXT_PUBLIC_CHARACTER_ASSETS_URL` vers un stockage privé (à décider).
- **Le moteur décide, l'animation suit** (ARCHITECTURE §4.3) :
  - **Tireur** : il attend au départ de sa course d'élan. Après le geste, la course d'élan (déplacement retiré restitué à vitesse constante) est **recalée** pour que le pied touche le ballon à l'instant du contact, et **la physique ne démarre qu'à ce moment-là**. Célébration (tirée de la graine) après un but, déception sinon.
  - **Gardien** : attente, pas chassés dans le bon sens, plongeon haut ou bas **choisi selon le sens réel de l'animation** (insensible aux fichiers inversés), prise en cloche, prise basse ou saut. La vitesse de chaque animation est ajustée pour que son extension coïncide avec celle du moteur, et **les gants sont ancrés sur les mains simulées**. Déception après un but encaissé.
  - **Défenseurs** : le mur saute avec le sommet synchronisé sur le moteur ; les marqueurs courent ou sprintent (cadence selon la vitesse), puis taclent en glissant.
- Caméra de visée reculée (6 m, 2,2 m de haut) pour cadrer le tireur, le ballon et le but. Vérifié : course d'élan, contact, départ du ballon, but, confettis, déception du gardien.

## D-020 — Personnages servis depuis un Vercel Blob privé (Phase 1, PR 12)

- Les personnages convertis (dérivés de Mixamo) restent **hors du dépôt public**. Ils sont stockés dans un **Vercel Blob privé** (`characters/<version>/player.glb|player.meta.json`), envoyés par `pnpm --filter @legendes/web assets:upload` (jeton `BLOB_READ_WRITE_TOKEN` dans `apps/web/.env.local`, jamais commité).
- Lecture par une route de l'application (`/api/assets/characters/[file]`), qui n'accepte que ces deux fichiers. Le jeton reste côté serveur (OIDC sur Vercel). Chemins versionnés (`CHARACTER_ASSETS_VERSION`) → **cache CDN d'un an** (`s-maxage`, `immutable`) : la fonction n'est presque jamais appelée.
- Le client passe toujours par cette route (`NEXT_PUBLIC_CHARACTER_ASSETS_URL` ne sert qu'à la surcharger). Sans stockage configuré (développement local sans jeton), la route redirige vers la copie locale de `public/` ; si elle n'existe pas, la scène garde les silhouettes provisoires. Aucune variable à régler côté Vercel : la connexion du stockage au projet suffit.
- Remarque : un joueur peut toujours télécharger ce que le jeu affiche ; l'objectif n'est pas de cacher le fichier aux joueurs, mais de **ne pas publier les fichiers bruts dans le dépôt**.

## D-021 — Les trois situations, puis le gardien joué (Phase 1, PR 13)

- **Passe puis reprise.** Le joueur trace la passe sur la pelouse. Le passeur la dose pour qu'elle arrive **quand le receveur y est** (sa course est déjà lancée à 5 m/s), jamais avant, et encore en mouvement (≥ 5 m/s) ; l'erreur d'exécution dépend de la note de passe et du sang-froid sous pression. Le receveur court vers le **premier point de la trajectoire réelle qu'il peut atteindre**, avec une petite marge. Les défenseurs tentent l'interception (ils lisent une passe **1,6× plus lentement** qu'une frappe qu'ils ont en face) ; le gardien se replace pendant la passe.
- **Reprise.** À la réception, le temps se fige presque (×0,04) et le joueur trace sa frappe depuis la position réelle du ballon. **Difficulté technique** : plus la balle arrive vite, de travers ou en l'air (volée), plus le cône d'erreur s'élargit (jusqu'à ×2,5). Seule la fin du geste de frappe est animée, et le contact reste synchronisé avec la physique.
- **Coup franc direct.** Le mur est formé automatiquement selon la distance (5 joueurs à moins de 20 m … 2 au-delà de 28 m, aucun au-delà de 34 m).
- **Penalty.** Le gardien est **sur sa ligne**. Au moment de la frappe, il **lit le bon côté** (probabilité 28 % → 58 % selon le placement) ou **devine** : un côté, ou il reste au centre dans 12 % des cas. Ensuite, sa correction tardive reste limitée par ses réflexes. Le joueur vise, puis **dose avec une jauge** qui balaie plus vite sous la pression du public ; au-delà de 82 %, la frappe devient de plus en plus difficile à contrôler.
- **Gardien joué.** Un adversaire frappe (coins privilégiés, effet et puissance tirés au sort, erreur d'exécution). Le joueur **glisse vers le coin** : l'endroit où son doigt se lève donne la cible des gants, le moment donne le tick du plongeon. La portée, la vitesse du plongeon, la correction tardive et la prise de balle restent celles des attributs. Plonger trop tôt, c'est être au sol quand le ballon passe. Le vol est ralenti **selon les réflexes** (×0,55 → ×0,3). La caméra est placée par-dessus l'épaule du gardien, qui est rendu en transparence.
- **Déterminisme.** Toutes les entrées sont rejouables : cible et tick de passe, geste de frappe, jauge, tick et cible du plongeon. Le self-test de déterminisme couvre désormais passes, penalties et plongeons commandés (nouvelle empreinte `0111a5785a9ba051`).
- Tout se règle dans le dossier « Situation » du panneau (schéma de passe, notes du passeur et du receveur, vitesse de la jauge, ralenti du gardien). Des onglets permettent de passer d'une situation à l'autre.

## D-022 — Public en tribune et mesure de performance (Phase 1, PR 14)

- **Public** : une trentaine de spectateurs *low-poly* (tribune, habitués accoudés à la main courante près de la buvette, quelques-uns derrière le but), en **3 maillages instanciés** (corps, têtes, bras) : 3 appels de dessin, environ 5k triangles, sans ombre portée. Ils se balancent en attendant, sautent les bras levés sur un but, mettent les mains sur la tête sur un « ouh » ou un but encaissé en mode gardien. Réactions décalées au hasard (0 à 0,3 s) pour ne pas bouger en bloc ; 60 % du public en qualité basse.
- **Mesure** : `/lab/ball?stats` affiche images/s, durée d'image, appels de dessin, triangles, niveau de qualité et résolution dynamique ; le compteur passe en rouge hors budget. Relevé sur desktop (qualité haute, coup franc avec mur et personnages) : 60 i/s, **53 appels de dessin, 121k triangles**, soit une large marge sur les budgets (150 / 300k).

## D-023 — Gardien : animations au sol, aide au plongeon, caméra portrait (Phase 1, PR 16)

- **Recalage des gants séparé** en horizontal et vertical (`Character.anchor(part, cible, poids, poidsVertical)`), et le corps n'est **jamais poussé sous la pelouse** : corrige le gardien à moitié enfoncé sur les ballons bas. Après une prise ou à la fin d'un plongeon, le vertical se relâche (0,35 s) : le gardien retombe au sol au lieu de rester suspendu là où il a capté ; le ballon capté est affiché dans ses gants.
- **Timing des plongeons** : l'instant d'extension des clips se déduit désormais du déplacement de la racine (85 % du vol), et non des mains (qui, sur les plongeons bas, s'étirent au sol bien après l'arrêt) ; les plongeons bas étaient joués environ 4,5 fois trop vite. Personnages reconvertis en **v2** (chaque reconversion change de version, car le CDN met en cache une version pour toujours).
- **Gardien joué, plus lisible et plus juste** : un glissement un peu trop tôt est **retenu jusqu'au bon moment** (0,15 → 0,4 s selon les réflexes) ; du bon côté, la cible est **tirée vers le ballon** (30 → 70 % selon le placement). Le mauvais côté ou un plongeon trop tard restent des buts. Réglable dans le dossier « Situation ».
- **Caméra de face-à-face en portrait** : elle recule et monte jusqu'à ce que le but et un plongeon complet (±4,6 m) tiennent dans la largeur.

## D-024 — Architecture du moteur de match (Phase 2)

- `packages/engine/src/sim/` : simulation pure, déterministe, **sans dépendance** (Deno exécute les sources). Les **postes et formations** (données pures) y déménagent ; `@legendes/shared` les ré-exporte (une seule source de vérité, et le moteur n'importe pas `shared`, qui dépend de Zod).
- **Un match = données sérialisables** : `{ graine, équipes figées, conditions }` + les entrées du joueur horodatées (gestes des actions clés, au format déjà consommé par les situations de la Phase 1, et changements de mi-temps). Rejouer ces entrées reproduit le match au bit près.
- Le moteur produit des **positions cibles et des événements** par phase ; `render2d` interpole. La scène 3D du labo devient une scène réutilisable `mountMoment(setup)` pilotée par la simulation.
- **Règles d'équipe** (GDD §6) : efficacité hors poste (100 % / 95 % secondaire / 85 % même ligne / 70 % / 40 % pour le poste de gardien), collectifs 0–3 par joueur (club 2/4/7, district et ligue 3/5/8, +1 si 4 de la même division, rien hors poste), jusqu'à **+5 sur tous les attributs** à 3 points (simplification : pas seulement les attributs clés du poste), note d'équipe = moyenne des onze + excédent moyen au-dessus de la moyenne.
- Équipes de démonstration à graine (joueurs fictifs) pour les tests et le labo ; les vrais générateurs arrivent en Phase 3 (`packages/data`).

## D-025 — Actions clés dans le match (Phase 2)

- La simulation **se met en pause** sur une situation à enjeu jouable (`MatchSim.pendingMoment`) et reprend avec son issue (`resolveMoment('goal' | 'save-catch' | 'save-parry' | 'block' | 'post' | 'miss')`). Les issues jouées sont les entrées du joueur : même graine + mêmes issues ⇒ même match.
- Situations jouables (3 à 6 par match) : pour l'équipe du joueur, penalty, coup franc dangereux, occasion à xG ≥ 0,2 (« passe puis frappe » si l'action précédente est une passe ou un centre réussis, sinon « frappe ») ; pour l'adversaire, penalty ou occasion à xG ≥ 0,25 → **gardien joué**. Moins de trois actions à la 60e minute : le seuil tombe à 0,1.
- L'action 3D démarre **entre 12 et 30 m du but** (la simulation place les grosses occasions à 5–9 m, où le gardien 3D n'a pas le temps de réagir) avec un défenseur au marquage, le mur sur coup franc, personne sur penalty.
- **Résolution automatique** par la même micro-simulation (tireur IA qui vise à 70 % de la largeur, pression, gardien IA) : environ 40–46 % de buts sur les occasions, 42 % sur les tirs adverses, 22 % sur coup franc direct (un peu haut, à revoir avec les données de jeu), 62–75 % sur penalty.

## D-026 — Chorégraphie du match 2D (Phase 2)

Retour après essai du premier rendu 2D : pions qui coulissent en bloc dans la formation, ballon qui glisse en ligne droite sans être aux pieds de personne, aucune phase de jeu ni arrêt de jeu lisibles. Refonte en trois couches.

- **Moteur** (`engine/sim/shape.ts`) : `teamShape` gère des **rôles** au lieu d'une formation rigide. Avec le ballon, les latéraux montent et débordent côté ballon et rentrent du côté opposé, les défenseurs centraux s'écartent pour relancer, le milieu défensif décroche, un milieu fait la course tardive dans la surface, les ailiers tiennent la ligne puis rentrent côté opposé, un attaquant décroche (l'autre reste sur la ligne) ; sans le ballon, le bloc se resserre vers le ballon, les latéraux rentrent, les attaquants écrantent. `setPieceShape` place les 22 joueurs sur chaque **arrêt de jeu** : engagement, touche (deux solutions à côté du ballon), corner (surface pleine, poteaux, contre-attaquants), sortie de but (défenseurs écartés, adversaires à l'extérieur de la surface), coup franc (mur à 9,15 m sur la ligne du but si dangereux), penalty (tous hors de la surface et de l'arc).
- **Moteur** (`sim/match.ts`) : passes coupées **sur la ligne de passe** (le ballon s'arrête au point d'interception), passes qui sortent en touche, hors-jeu, action « faute » explicite, 25 à 40 s de célébration après un but.
- **Rendu** (`render2d`) : `Timeline` pose les actions sur une **horloge d'affichage** (une passe dure une demi-seconde à l'écran quelle que soit sa durée dans le match ; ×1 ≈ 11 min pour un match, ×2 ≈ 5,6 min ; les arrêts de jeu, buts, mi-temps ont leur temps) et étiquette les **phases** (engagement, relance, construction, attaque placée, transition, arrêt de jeu). `Choreographer` fait courir les pions vers leurs cibles avec vitesse et accélération limitées (ils trottent, sprintent pour recevoir, se tournent dans le sens de la course), le porteur **conduit le ballon aux pieds**, la passe part du pied du passeur et **arrive au pied du receveur**, le ballon monte un peu sur les longues balles, centres et tirs, le gardien suit le tir.
- Le rendu 2D n'influence jamais le résultat : la chorégraphie est purement visuelle, la simulation reste la source de vérité.

## D-027 — Commentaires du speaker (Phase 2)

- Le moteur (`engine/commentary`) **choisit** la catégorie de gabarit et ses paramètres ; les **phrases** sont dans `apps/web/messages/fr.json` sous `commentary.<catégorie>.<n>` (159 phrases, 32 catégories). Pas de texte dans le moteur : changer le ton ou traduire ne touche pas le code, et un test vérifie que le fichier contient exactement les clés que le moteur peut demander, sans marque interdite (règle 4 de CLAUDE.md).
- **Déterministe** : mêmes équipes, même graine, mêmes résultats ⇒ mêmes commentaires (ajouté à l'empreinte de déterminisme). **Jamais deux fois de suite la même variante** d'une catégorie (mémoire des trois dernières).
- Le contexte affine le choix : but d'ouverture, égalisation, but tardif (≥ 80e), frappe de loin (xG < 0,08), de la tête (après un centre), sur penalty, sur coup franc ; fin de match selon le résultat (victoire, nul, 0-0).
- **Le speaker ne dit pas tout** : une touche ou une sortie de but sur trois seulement, une remarque de possession longue (16 actions de suite, au plus toutes les 4 minutes), la fatigue après la 70e, la pluie au coup d'envoi. Les occasions (`chance`) sont fondues dans leur issue.
- Ton : speaker du club, humour de bord de terrain (buvette, voisin, préfabriqué), sans joueur ni club réel.

## D-028 — L'écran de match jouable (Phase 2, étape 7)

- **Machine à états** (`components/match/match-screen.tsx`) : avant-match → match 2D → action clé 3D → mi-temps → fin de match. L'écran **pilote la simulation phase par phase** (`MatchSim.step()` jusqu'à ce qu'elle attende le joueur), alimente la `Timeline` d'affichage avec les nouvelles actions et lui rend l'issue des actions clés. La simulation reste la source de vérité ; le 2D et le 3D ne font que la montrer.
- **Attentes explicites** : `MatchSim.waiting` vaut `'moment'` (une action clé à jouer) ou `'half-time'` (`pauseAtHalfTime`) ; `resolveMoment(issue)` et `resumeSecondHalf()` reprennent.
- **Entrées du joueur = données rejouables** : les issues des actions clés et les changements du coach (`setTactic`, `substitute`, horodatés par numéro de phase) forment `MatchInputs`. `replayMatch(setup, options, inputs)` reproduit le match **au bit près** (test moteur, test E2E, bouton « Rejouer avec les mêmes entrées » à la fin du match). Les changements automatiques du coach adverse ne sont pas des entrées : ils découlent de la graine.
- **Action clé 3D** : le bac à sable devient une scène réutilisable. `mountBallSandbox(canvas, réglages, { moment: { onOutcome } })` joue **une** situation, sans replay ni remise à zéro du ballon, puis rend l'issue (`goal`, `save-catch`, `save-parry`, `block`, `post`, `miss`, avec la détection du poteau). `settingsForMoment` traduit une demande d'action clé du moteur (cartes du tireur et du gardien, lieu, météo, graine) en réglages de scène. Un bouton « Laisser le coach jouer » résout l'action par les stats (`autoResolveMoment`).
- **Ce que la 3D n'enregistre pas encore** : les gestes bruts (tracé, jauge, plongeon) ne sont pas conservés, seule l'issue l'est. La validation serveur d'un match classé (Phase 4) devra rejouer chaque geste : le rapport du tir (`ShotReport`) contient déjà puissance, courbe, erreur d'exécution et graine ; il faudra y ajouter le tracé horodaté.
- **Mi-temps** : statistiques, style, mentalité, pressing, hauteur de ligne, remplacements (5 au total, avec le rappel de ce qu'il en reste). **Fin de match** : statistiques, meilleures notes de chaque équipe, homme du match (`matchRatings` : minutes jouées, buts, arrêts, contres, cartons, fautes, solidité défensive, résultat).
- Équipes de démonstration à graine ; les vrais effectifs viennent de la collection en Phase 4. Paramètres d'adresse du labo : `?seed=N`, `?speed=K` (jusqu'à ×60), `?auto=1` (coup d'envoi immédiat, actions clés au coach).

## D-029 — Retours après l'écran de match : sons, figurants, passes à choix, hors-jeu (Phase 2)

Retours du joueur après essai de `/lab/match` ; traités en PR séparées.

- **Sons du match 2D.** Le match 2D était muet. Les **repères sonores** (quel son, à quel moment de l'action) sont des données pures dans `render2d/src/cues.ts` (testées) ; l'écran les branche sur le `MatchAudio` synthétisé de `render3d` (entrée `@legendes/render3d/audio`, qui n'embarque pas Three.js). Coups de sifflet (engagement, fautes, hors-jeu, penalty, mi-temps, fin), frappes selon la longueur de l'action, filet, poteau, gants, murmure du stade, clameur sur un but. À grande vitesse, seuls le sifflet et le stade restent (les frappes s'empileraient). Le contexte audio se débloque au premier appui.
- **Figurants.** En 3D, seuls le tireur, le gardien et le mur étaient là : le terrain paraissait vide. `engine/moments/background.ts` place les autres joueurs d'un 11 c. 11 (pur, testé : sur le terrain, hors de la ligne de tir, à distance des joueurs de l'action ; au penalty, tous hors de la surface et de l'arc). `render3d/players/extras.ts` les affiche, immobiles (clip `player_idle` décalé), **sans ombre**, avec **3 / 6 / 9 figurants** selon la qualité (pire cas mesuré : 75 appels, 212 k triangles à qualité haute).
- **Passe à choix.** Chaque disposition de passe propose **trois coéquipiers**, tous lancés. Le joueur trace la passe où il veut ; le ballon est pesé pour celui qui peut y être **le plus tôt** (`chooseReceiver`) et le premier à toucher le ballon le reçoit. Les autres poursuivent leur course, en ralentissant. `PassMomentSetup.receiver` devient `receivers[]`.
- **Hors-jeu (3D).** La ligne est celle de l'avant-dernier adversaire, gardien compris, **à l'instant de la passe** (`offsideLineX`, `isOffside`, tolérance de 15 cm). Elle est tracée en jaune au sol, avec un rond sous chaque coéquipier (vert : en jeu, rouge : hors-jeu). Servir un coéquipier hors-jeu : coup de sifflet, issue `offside`. Chaque disposition garde au moins deux coéquipiers en jeu et un piège. Dans la simulation, `ShotOutcome` gagne `'offside'` : le tir n'est pas compté, le ballon passe à la défense sur coup franc. L'empreinte de déterminisme n'a pas bougé (`offside: false` dans l'auto-test, qui date d'avant la règle).

## D-030 — Seconds ballons : parades repoussées et montants (Phase 2)

- **Quand.** Si le gardien repousse le ballon, ou s'il touche un montant et reste en jeu, tout le monde va au second ballon. Le premier joueur qui atteint le ballon assez bas pour le jouer l'emporte (`engine/moments/rebound.ts`, déterministe, même code côté client et pour la validation serveur). En cas d'égalité, c'est la défense qui l'emporte.
- **Qui.** En attaque : le tireur (qui part après son geste, 0,35 s, 0,75 s après un penalty) puis ses coéquipiers : les autres receveurs sur une passe, un coureur au second poteau sur une frappe ou un coup franc, un joueur à l'entrée de la surface sur un penalty (`reboundRunners`). En défense : les défenseurs de l'action (mur, marqueurs), des **défenseurs de couverture** qui marquent ces coureurs (nouveau rôle `cover` : ils restent en place et ne contrent que ce qui leur arrive dessus, `reboundCovers`), et le gardien une fois relevé (0,55 s après la fin du plongeon).
- **Issues.**
  - Un des nôtres l'emporte (`rebound`) : le temps ralentit et le joueur retire de là (ni jauge ni course d'élan, difficulté de la reprise selon la vitesse du ballon). Le gardien est là où il est, encore au sol s'il ne s'est pas relevé (`KeeperSetup.down`), les défenseurs marquent. **Un seul second ballon** par action : l'issue du match est celle de la reprise.
  - Un défenseur l'emporte (`cleared`) : il dégage. Pour le match, cela reste un arrêt repoussé, ou un poteau.
  - Le gardien l'emporte : il capte, et c'est un arrêt capté.
- **Sans `rebound` dans la configuration, rien ne change** : les actions de la Phase 1 et l'empreinte de déterminisme sont identiques. La résolution automatique joue aussi les seconds ballons (même géométrie). Mesure sur un tireur à 72 : penalty de 71 % à 79 % de buts, soit environ un penalty repoussé sur trois converti ; frappes et coups francs quasi inchangés (+1 à 2 %).
- **Retours après essai (même phase).**
  - Qui suit : les figurants sont décoratifs et ne courent pas. Un figurant immobile à côté d'un ballon repoussé, pendant qu'un coéquipier éloigné fait la course, n'a pas de sens. Dans les situations de tir, ils restent donc hors de la surface et de ses abords (20 m du but, ±22 m). La surface est remplie par de **vrais participants** : sur une frappe ou un coup franc, trois coureurs (premier poteau, second poteau, un qui arrive en retard), placés dans le champ de la caméra mais hors de la trajectoire (`clearOfShot`), chacun marqué par un défenseur de couverture placé côté but. Tous vont au second ballon. Figurants ramenés à 3 / 5 / 7 selon la qualité. Pire cas mesuré (coup franc, qualité haute) : 91 appels, 278 k triangles.
  - Hors-jeu : il est jugé **au moment de la frappe**. Un ballon renvoyé par le gardien ou un montant ne remet pas en jeu (loi 11) : un coéquipier hors-jeu au moment du tir reste en dehors de l'action, avec un rond rouge sous lui pendant la course.

## D-031 — Le monde : schéma, sources et générateurs (Phase 3)

- **Paquet `@legendes/data`.** Le monde (ligue, districts, divisions, clubs) est décrit par des schémas Zod (`schema.ts`), des tables de référence écrites à la main (`reference.ts`) et une liste de clubs éditable dans un tableur (`sources/clubs-hdf.csv`). `pnpm --filter @legendes/data build:seed` valide la liste (identifiants, districts, divisions, code INSEE cohérent avec le district) et produit **deux fichiers versionnés** : `src/generated/clubs.ts` (pour l'application) et `supabase/seed/10_universe.sql` (pour la base, en upserts idempotents). `--check`, lancé par `pnpm test`, échoue si un fichier généré n'est pas à jour : la CI attrape un CSV modifié sans reconstruction.
- **Couleurs inconnues.** Un club sans couleurs reçoit une **estimation déterministe** (même club, mêmes couleurs, sur toutes les machines), marquée `guess` dans la base. Les couleurs qu'une personne connaît sont `known`. Aucun logo n'est utilisé pour les déduire.
- **Profondeur variable.** Une division est un couple (niveau, rang) dans un périmètre (national, ligue, district). L'Escaut va de D1 à D6 ; les autres districts seront ajoutés au fil des importations. Tables : `leagues`, `districts`, `divisions`, `clubs`, `club_seasons`, lecture publique par RLS, aucune écriture depuis un client.
- **Sources.** Voir `packages/data/sources/SOURCES.md`. Le fil TeamOpenData (juin–août 2026) confirme que `api-dofa.fff.fr` et `epreuves.fff.fr` sont derrière un pare-feu anti-robots : **exclus**, comme tout contournement (navigateur automatisé, jeton récupéré). La voie propre est une demande d'accès officiel : brouillon de courrier dans `docs/courriers/demande-acces-donnees.md`.
- **Pas de résumé automatique de pages web pour les données.** Les résumés de pages produits par un modèle de langage mélangent les ligues et inventent des lignes (constaté en essayant de lire les poules de National). Une ligne du CSV vient d'une page qu'une personne a lue, ou d'un fichier de données traité par un script ; la colonne `verified` dit lequel.

- **Constat du 29/09/2026 : la pyramide a changé de noms.** Depuis 2026-27, la Ligue 3 (professionnelle) est au 3e niveau, l'ancien National 2 s'appelle **National 1** (4e niveau, 3 groupes de 16) et l'ancien National 3 **National 2** (5e niveau, 8 groupes régionaux de 14). Le GDD parlait encore de N2 et N3 : `shared` (rangs nationaux 1 et 2, mêmes bandes de notes : N1 74-82, N2 70-78), le GDD et les textes du jeu sont corrigés. Le moteur de match garde ses niveaux de démonstration internes (District 9 … « National 2 »), qui correspondent au haut de la pyramide.
- **Import des clubs du pilote.** Une requête ordinaire sur l'API de la FFF donne **403** (pare-feu anti-robots), deux fois : on s'arrête là, aucun contournement par programme. C'est **Lucas qui a enregistré à la main, dans son navigateur, les fichiers JSON** de l'API (clubs du district de l'Escaut, engagements des divisions D1 à D6 et Régional 1) ; `scripts/import-fff-export.ts` les lit sur sa machine, sans réseau, et écrit `clubs-hdf.csv`. Les fichiers bruts contiennent des noms et contacts de dirigeants : ils ne sont **jamais versionnés**, seuls les faits sur les clubs (nom, commune, division, couleurs, stade) le sont. Le pilote compte 205 clubs : 196 clubs de l'Escaut ayant une équipe senior masculine de D1 à R1 (division réelle, saison 2026-27, couleurs et stades réels) et 9 clubs de National 1 / National 2. Les équipes de Régional 2 et 3 sont lues aussi (dans l'Escaut, ce sont des réserves de clubs déjà présents : la division d'un club est celle de sa meilleure équipe). Restent absents : les clubs des autres districts et ceux sans équipe senior masculine. ⚖️ Les conditions d'utilisation de l'API ne sont pas documentées : demander un accès officiel (brouillon dans `docs/courriers/`) avant le lancement public.
- **Premier essai, écarté.** Une première liste tirée de l'annuaire des entreprises (326 associations, divisions tirées au hasard) est remplacée par ces données réelles : la colonne `division_known` reste dans le schéma pour les futurs clubs dont la division serait provisoire.

## D-032 — Les effectifs générés (Phase 3, étape 2)

- **Un effectif = une graine.** `generateSquad(club, saison)` (`packages/data/src/squad`) tire 22 à 25 joueurs fictifs et majeurs d'une graine `club + saison` : même club, même saison, mêmes joueurs, sur toutes les machines et dans tous les processus (générateur du moteur, arithmétique simple, aucun `Math.random` ni fonction transcendante). Aucune base n'est nécessaire pour afficher une carte : on la recalcule. Un test compare le hachage des 4 839 joueurs du pilote à une valeur versionnée : changer le générateur ou la liste des clubs change **tous** les joueurs, il faut le décider (comme l'empreinte du moteur).
- **La note suit la division** (bandes du GDD §5.2, recouvrantes) : chaque joueur tire sa note dans la bande (cloche), décalée par la force propre du club (±1,8) ; quelques « pépites » (+3 à +7), le banc un cran plus bas. Les attributs sont **ajustés pour que la note calculée par le moteur (`playerRating`) soit exactement la note tirée**. Mesures sur le pilote (onze meilleurs) : D4–D6 ≈ 51, D1–D3 ≈ 60, R3 65, R2 68, R1 71, N2 75, N1 78 ; au sommet 30 % de cartes or, dans les districts aucune (et 90 % de bronze).
- **Archétypes par poste** (Mur, Chat, Libéro ; Patron, Relanceur, Stoppeur, Latéral piston ; Sentinelle, Box-to-box, Meneur, Pitbull ; Ailier, Renard des surfaces, Pivot, Faux 9) : ils répartissent les points sur les six attributs et, pour les gardiens, sur PLO/MAI/PIE/RÉF/VIT/PLA. **La courbe d'âge** (18–40 ans, âge moyen 26,5) fait baisser la vitesse après 29 ans et monter lecture du jeu et placement.
- **Traits** (GDD §5.5) : 0 à 2 par joueur selon le poste, l'archétype et l'âge (Vétéran après 33 ans, Renard des surfaces pour les buteurs, Patron pour les défenseurs meneurs…), un capitaine et un ou deux tireurs de coups de pied arrêtés par équipe. **Le moteur ne lit encore que trois de leurs effets**, portés par les valeurs : endurance (Poumon), sang-froid (Ancien pro, Capitaine) et pied faible (Pied carré, 1★). Les autres sont affichés sur la carte, leur effet en match viendra en Phase 5.
- **Noms** : listes rédigées à la main (`squad/names.ts`), prénoms par décennie de naissance et noms du Nord et de France, avec la diversité d'un effectif amateur actuel ; pas de copie d'un registre. Un nom tiré peut coïncider par hasard avec une vraie personne : les joueurs sont fictifs, et les vrais joueurs n'entrent qu'avec leur consentement. Le fichier des prénoms de l'INSEE pourra remplacer les listes si on veut les fréquences exactes.
- **Pont vers le moteur** (`toMatchTeam`) : la formation (parmi cinq) qui donne la meilleure note d'équipe, le meilleur onze dans cette formation, un banc de sept (un gardien d'abord), le style de jeu tiré de la graine du club, les couleurs du club pour le maillot. Des matchs entre clubs générés restent dans les fourchettes de la Phase 2 (un club de R1 ou de National bat un club de D6 dans plus de 75 % des cas ; deux clubs de D3 restent proches). `demo-teams.ts` ne sert plus qu'aux tests du moteur ; `/lab/match` passera aux vrais clubs à l'étape 6.

## D-033 — L'identité des clubs : blasons, maillots, sponsors (Phase 3, étape 3)

- **Tout est généré, rien n'est stocké** (`packages/data/src/identity`) : blason, maillots et sponsors se recalculent à partir de l'identifiant du club (graine `crest:`, `kit:`, `sponsors:` + club + saison), avec le générateur du moteur et de l'arithmétique simple (aucune fonction transcendante : les couleurs et les contrastes sortent au bit près sur tous les moteurs JavaScript). Un test compare le hachage de l'identité des 205 clubs à une valeur versionnée ; la changer change le blason de **tous** les clubs et l'image de partage de toutes les cartes, ça se décide.
- **Une description, plusieurs rendus.** Blason et maillot sont des **arbres SVG** (`svg.ts` : éléments, attributs, texte) : `toSvgString` les sérialise (image de partage, textures 3D), un fin composant React les rend en éléments (`components/club/svg-tree.tsx`, pas de `dangerouslySetInnerHTML`). Le maillot est aussi une donnée (`KitSpec`) que le shader du personnage 3D lira à l'étape 6 : la chemise d'une carte et celle du terrain viendront de la même source.
- **Blason** (jamais un logo réel, règle 3) : 6 formes d'écu (écu, écu français, pointu, rond, fanion, hexagone), 12 partitions (uni, parti, coupé, tranché, pals, fasces, chevron, croix, sautoir, écartelé, chef, chape), 12 meubles (ballon, étoile, tour, **beffroi, gerbe, chevalement, terril**, fleur de lys, couronne, vagues, soleil, losange : symboles locaux du Nord), et trois styles (meuble seul, meuble avec ruban de la ville, monogramme). Un club au maillot rayé a plus de chances d'avoir un champ rayé. L'encre du meuble est choisie parmi les couleurs du club puis les neutres pour contraster (≥ 3 si possible), et un contour foncé porte le reste ; reflet et dégradé pour l'effet « badge brillant ». La police d'affichage (Big Shoulders) est demandée par le SVG, avec repli ; le texte est ajusté à sa boîte (`textLength`).
- **Maillots** : domicile (couleurs et motif du club), extérieur (couleurs inversées si elles se distinguent, sinon blanc ou anthracite, motif tiré), gardien (une couleur éloignée des deux). Col rond, en V ou polo, manches, short, chaussettes et liserés tirés de la graine : **le motif de la chemise domicile reste celui du CSV** (uni pour la plupart des clubs, faute de source), la variété vient des détails, pas d'une invention présentée comme vraie. Le sponsor s'imprime sur la poitrine (sur deux lignes s'il est long), le blason sur le cœur.
- **Sponsors fictifs** : des artisans et commerces génériques à l'humour du coin (« Friterie Chez Momo », « Brasserie des Mineurs », « Distillerie du Terril »), trois par club (maillot, short, panneaux). **Liste d'exclusions** de plus de 90 marques, chaînes et institutions de la région, testée sur tous les gabarits et sur tous les noms produits ; les noms de famille qui sont aussi des enseignes (« Boulanger ») sont écartés du tirage. Un nom de famille ou une ville peut coïncider par hasard avec une vraie entreprise ; le jeu ne prétend jamais le contraire.
- **`/lab/clubs`** : recherche par nom ou ville, filtre par division, galerie de blasons, fiche d'un club (blason, stade, couleurs et leur origine, mention « fiche à vérifier », maillots, sponsors, effectif par ligne avec la note en pastille de palier) et **atelier du blason** (forme, partition, meuble, style) pour régler la direction artistique sans toucher au code.
- **Reste ouvert** : le blason est la première pièce de l'identité visuelle ; les cartes (étapes 4 et 5) en feront le cœur de l'effet « pack » (reflets, holographie) ; le motif réel des maillots et les années de fondation viendront des clubs.

## D-034 — Les cartes 2D (Phase 3, étape 4)

- **Une carte = une description, plusieurs rendus.** `packages/ui/src/card` décrit la carte en unités de carte (250 × 350) : zones, palettes par gabarit, silhouette (`layout.ts`), et la dessine en **arbre SVG** pur (`face.ts`, `avatar.ts`). La page React la rend en éléments (`components/card/player-card.tsx`), l'image de partage (étape 7) et la texture de la carte 3D (étape 5) partiront du même arbre sérialisé : une carte ne peut pas avoir deux visages. Les textes portent la classe des polices chargées par la page (`ld-font-display`, `ld-font-sans`) et une pile de secours pour les rendus hors page.
- **Design original** (règle 4) : cadre de métal à coins coupés comme un ticket, encoche au milieu du bord supérieur, **grillage de main courante** en fond, **faisceaux de projecteur** venus du coin, fanion aux couleurs du club derrière le joueur, portrait en buste façon vignette des années 90. On reprend les processus et le ressenti des modes de collection de cartes des jeux de foot (paliers lisibles d'un coup d'œil, raretés brillantes, promos à l'identité forte), jamais leurs noms ni leurs designs.
- **Huit gabarits** : bronze, argent et or, chacun en commune (métal mat ou satiné) et rare (métal plus clair, reflet plus fort, bandes holographiques derrière le joueur, étincelles) ; **Onze du week-end** (noir et or) ; **Ancien pro** (bleu nuit et ivoire, accent cuivre). Le reflet de surface reste discret sur le visage : le joueur doit rester net, l'éclat est dans le fond et le cadre.
- **Variantes de carte** (`packages/data/src/squad/cards.ts`) : `cardOf(joueur, variante)`, identifiant `<joueur>` ou `<joueur>~<variante>`. Onze du week-end : +3 à +6 tiré de la graine de la carte, sur tous les attributs de la ligne du joueur, note affichée = note de base + bonus exactement (GDD §5.3). Ancien pro : réservé aux joueurs qui ont le trait, +2 et +8 de sang-froid.
- **Avatar** : buste stylisé en aplats (jamais une photo), aux paramètres d'apparence de l'étape 2 (6 carnations, 7 coiffures, 5 couleurs, 3 barbes, 3 morphologies), dans le maillot du club (celui de gardien pour les gardiens), avec reflet dans les yeux pour que le regard vive sur toutes les carnations.
- **`/lab/cards`** : un vrai joueur du pilote par gabarit, recherche de n'importe quel joueur (et de sa version promo), réglages exposés (épaisseur du cadre, grillage, reflet, couleurs du club, grain). L'accueil montre la carte Onze du week-end du meilleur joueur du pilote à la place de la carte provisoire.
- **Tests** : chaque gabarit est vérifié (SVG bien formé, identifiants propres à la carte, aucune référence cassée, note et nom présents) et son **empreinte** est figée par un instantané Vitest : un changement de dessin se voit, se regarde dans `/lab/cards`, puis se valide (`vitest -u`). Les captures d'écran Playwright par gabarit sont reportées : leurs références dépendent du système (polices, lissage) et la CI tourne sous Linux ; elles viendront avec la carte 3D (étape 5), générées en CI.

## D-035 — Les cartes 3D holographiques (Phase 3, étape 5)

- **La carte 3D est la carte 2D.** Ses textures sont le SVG de la carte 2D (`cardNode`) dessiné dans un canvas, et son contour le même tracé (`silhouette(0)`, lu par `render3d/cards/outline.ts`). Une image SVG ne voit pas les polices de la page : Big Shoulders et Manrope (OFL, `apps/web/public/fonts`, en `.woff`, format que l'image de partage de l'étape 7 pourra aussi lire) sont embarquées en données dans le SVG avant le dessin. Le reflet peint et le grain de la version 2D sont retirés des textures : le shader éclaire la carte, et le mode de fusion du grain est perdu quand un SVG devient une image.
- **Un masque dessiné, pas deviné.** `cardMaskNode` reprend les calques de la carte : rouge = métal du cadre (reflète le studio, donne le biseau), vert = fond holographique (plus fort sur les bandes des rares), bleu = joueur et textes, protégés de tout effet. Le dos (`cardBackNode`) : écusson « LD » sur un terrain de nuit, **cadre dans le métal du palier** ; c'est ce que montre un pack avant la révélation.
- **Shader** porté de Carte du Ciel et adapté : studio de lumières (softbox, clé, contre-jour), film arc-en-ciel qui suit l'inclinaison (doré sur les promos, et seulement dans les reflets pour que le noir reste noir), étoiles holographiques, paillettes, laque. Chaque gabarit a sa finition (`CARD_FINISHES` : teinte du métal, force du film, paillettes, couleur du halo, **rang de rareté 0 à 7**).
- **Visionneuse** (`mountCardViewer`) : inclinaison à la souris, au doigt ou au gyroscope (autorisation iOS demandée par un bouton), carte qui respire seule, glisser ou toucher pour la retourner. **Révélation** dont l'intensité suit le rang : montée face cachée avec un halo qui pulse (0,9 à 2,2 s), tremblement et secousse pour les rares, retournement en ressort, flash, balayage de lumière, bloom poussé, onde de choc et gerbe d'étincelles pour les plus rares. C'est la brique de l'ouverture de pack. Le mouvement réduit est respecté (pas de secousse ni d'onde de choc).
- **Rendu** : le pipeline de post-traitement gagne un réglage `filmic` (part de la courbe ACES). Les scènes de match restent à 1, la visionneuse est à 0,3 pour garder les couleurs du design, et le bloom n'y prend que les vrais éclats (seuil 1,35). 5 appels de dessin, textures de 512 à 1 024 px de large selon la taille de la carte à l'écran.
- **Reste ouvert** : mesurer 60 i/s sur iPhone 13 (`?stats`) ; les captures Playwright de référence par gabarit (elles demandent de générer les images sous Linux en CI et de les versionner) ; la séquence complète d'ouverture de pack.

## D-036 — L'ouverture de pack, avancée en Phase 3

- **Pourquoi maintenant** : c'est le moment qui porte le plus de dopamine dans un jeu de collection de cartes. On le construit dès que les cartes 3D existent, dans `/lab/pack`, avec des tirages simulés. En Phase 4, la même scène recevra un tirage fait par le serveur (règle 2) et viendront s'y brancher les crédits et la collection.
- **Le contenu d'un pack** (`packages/data/src/packs.ts`, GDD §9.4) : bronze, argent, or et or premium, **12 cartes** chacun, avec leurs garanties (1 rare, 3 or minimum, 3 rares). Les probabilités sont des données, affichées telles quelles (règle 5), avec le nombre moyen par pack et la chance d'en avoir au moins une. `openPack(type, graine)` est une fonction pure : pas de doublon de joueur, cartes rangées de la moins à la plus précieuse. Un test tire 4 000 packs et vérifie que ce qui sort correspond à ce qui est affiché.
- **Le sachet** : dessiné en SVG comme les cartes (`packNode`, recto et verso, avec leurs masques), puis porté de Carte du Ciel en 3D (`render3d/cards/pack3d.ts`). Sachet bombé en coussin, soudures serties, film holographique sur le pack premium. Le pointillé est tracé exactement là où le shader déchire.
- **Le déroulé** (`scenes/pack-opening.ts`, machine d'états dont React reçoit les étapes pour afficher les textes) :
  1. **La déchirure** : on la fait du doigt ou avec le bouton « Ouvrir ». La lumière qui fuit, les étincelles et le rayon ont la couleur de la **meilleure carte** : premier indice.
  2. **Les cartes sortent** du pack, qui tombe.
  3. **La meilleure carte** a une séquence qui dépend de son rang. À partir de l'or : sortie des vestiaires complète (écran noir et bandes cinéma, **quatre projecteurs** qui s'allument un à un avec leur claquement, coup de sifflet, **la division**, **le blason du club** en 3D avec son nom, **le poste**, puis la tension : la carte monte face cachée, tremble, les particules sont aspirées, flou de zoom, montée sonore ; enfin l'impact : double tour pour les promos, flash, onde de choc, gerbe d'étincelles, rayons prismatiques, clameur de la tribune). Argent : séquence courte (deux projecteurs et le blason). Pour les **promos**, feu d'artifice et **confettis aux couleurs du club**. Bronze : retournement simple, le stade reste allumé (les gags essayés d'abord, projecteur qui grésille et chien qui traverse, ont été retirés après essai : ils cassaient le rythme).
  4. **La carte héroïne**, qu'on incline à la souris ou au doigt.
  5. **La grille** : les 11 autres cartes face cachée, avec un dos au cadre de leur palier (second indice), retournées une à une ou toutes en cascade. Chaque révélation est proportionnée au rang de la carte.
  6. **Le récapitulatif.**
- **« Passer »** accélère jusqu'à la carte héroïne et coupe les sons de la séquence. Chaque durée et intensité (rang de la sortie des vestiaires, écart entre projecteurs, durée des indices, blanc entre deux indices, tension, flash, secousse, particules, vitesse) est un réglage de la page, conservé dans le navigateur. Un sélecteur de **meilleure carte** permet de rejouer chaque séquence pour la régler.
- **Son** : `PackAudio` étend `MatchAudio` (sifflet, voix de la tribune) avec les sons de Carte du Ciel (déchirure, boum, cloches, montée, bourdon) et de nouveaux sons : claquement et bourdonnement des projecteurs, fusées. Tout est synthétisé.
- **Rendu** : textures des 12 cartes à 512 px (1 024 px pour la meilleure), dos partagés par gabarit (`TextureCache`). Le flash retombe en exponentielle pour frapper sans aveugler. On reste sous 100 appels de dessin, stade compris.
- **Le décor** : l'ouverture se passe **de nuit, sur le terrain du club de la meilleure carte** (sa surface : herbe, synthétique ou stabilisé). C'est le stade amateur des actions clés (`stadium/stadium.ts` : tribune et sa foule, main courante, club-house, arbres), vu depuis la pelouse vers la tribune, l'œil à 4 m pour que les cartes ne touchent jamais l'herbe. Ses mâts sont remplacés par quatre mâts placés par la scène (`stadium/masts.ts`), exactement sous les éclats des projecteurs de la sortie des vestiaires : **le stade s'éteint** (les mâts coupent un à un, avec un bruit sourd), **puis se rallume mât après mât**. Pendant la tension le terrain baisse pour laisser la place à la carte ; à l'impact tout se rallume et, à partir de l'or, la tribune se lève. Un halo additif teinté (pack, puis meilleure carte) reste derrière les cartes.
- **Sortie du pack** : tant que les cartes sont dans le sachet, elles ne sont dessinées qu'au-dessus du bord déchiré (plan de coupe en espace monde, `Card3D.clip`). Le sachet penche et tombe : sans cela, un coin de carte traversait son recto.
- **Les indices ne se chevauchent jamais** : un temps de blanc réglable (`clueGap`, 0,3 s) sépare la division, le blason et le poste.
- **Reste ouvert** : le tirage côté serveur et la collection (Phase 4) ; mesurer la fluidité sur un vrai téléphone ; un vrai modèle de joueur qui sortirait du tunnel (le « walkout » au sens propre) quand les personnages 3D aux couleurs du club existeront (étape 6).
