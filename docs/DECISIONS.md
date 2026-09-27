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
