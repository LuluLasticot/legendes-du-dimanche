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
