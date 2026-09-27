# Légendes du Dimanche — Contexte projet pour Claude Code

Jeu web (PWA, mobile d'abord) de collection de cartes et de gestion d'équipe, façon mode « équipe ultime », **consacré au football amateur français** (District → Régional → National 2/3). Matchs simulés en 2D avec des **actions clés jouables en 3D façon Score! Hero**.

**Objectif immédiat : tranche verticale de niveau portfolio (Phases 0 à 4). Objectif final : lancement national.**

## Documents de référence (à lire avant toute tâche importante)

- `docs/GDD.md` — game design complet (cartes, collectifs, match, modes, économie, DA)
- `docs/ARCHITECTURE.md` — stack, monorepo, moteur déterministe, backend, anti-triche
- `docs/ROADMAP.md` — phases, livrables, critères de fin (**phase en cours ci-dessous**)
- `docs/DONNEES-ET-LEGAL.md` — sources de données autorisées, RGPD, marques, loot boxes

## Phase en cours

**Phase 0 — Fondations** (puis Phase 1 : prototype d'action clé 3D).
Mettre à jour cette ligne à chaque changement de phase.

## Stack

pnpm + Turborepo · Next.js (App Router) + React + TypeScript strict · Tailwind v4 · Three.js impératif (`packages/render3d`) · PixiJS v8 (`packages/render2d`) · moteur TS pur déterministe (`packages/engine`) · Supabase (Postgres + RLS, Auth, Edge Functions) · Zod · Vitest · Playwright · Vercel. Plus tard : Colyseus (Fly.io), Upstash Redis.

## Code réutilisable

`../carte-du-ciel` (Vite + Three.js 0.169, TS) : moteur de rendu, niveaux de qualité, cartes 3D et faces générées en worker, ouverture de pack, shaders holographiques, effets, audio, tests visuels Playwright. À porter dans `packages/render3d`, pas à copier tel quel.

## Règles non négociables

1. **Déterminisme de `packages/engine`** : aucun `Math.random()` (PRNG à graine uniquement), aucune fonction `Math.sin/cos/exp/pow/atan2` dans le code validé par le serveur (utiliser `engine/math`), pas de temps fixe dérivé du rendu, ordre d'itération stable. `engine` n'importe rien de `render*`, `ui` ni `apps`.
2. **Serveur autoritaire** pour tout ce qui a de la valeur : tirages de packs, crédits (grand livre `credit_ledger`), marché, récompenses. Écritures sensibles via fonctions Postgres transactionnelles, RLS partout.
3. **Aucune donnée réelle de personne** sans consentement : joueurs fictifs générés ; aucun scraping de la FFF, de Transfermarkt ou de Flashscore ; aucune photo trouvée en ligne ; aucun logo réel (blasons générés).
4. **Marques interdites** : « FIFA », « FUT », « Ultimate Team », « EA SPORTS FC » — ni dans l'interface, ni dans les noms de fichiers affichés, ni dans le marketing. Design des cartes original.
5. **Aucun achat avec de l'argent réel** de packs, crédits ou cartes, aucune conversion en argent réel. Probabilités de packs affichées.
6. **Pas de joueurs mineurs** (réels ou fictifs).

## Conventions

- Code, identifiants et commits en **anglais** ; textes du jeu en **français** via fichiers de traduction (i18n prêt dès le départ).
- TypeScript `strict`, pas de `any` ; Zod à chaque frontière (réseau, stockage, JSON).
- Scènes 3D : API impérative (`mount`, `play`, `dispose`) montée par de fins composants React ; React ne manipule jamais d'objets Three.js directement.
- Commits conventionnels, petites PR, CI verte obligatoire.
- Budgets perf (action clé 3D) : < 150 draw calls, < 300k triangles, 60 i/s visé / 30 i/s minimum sur mobile milieu de gamme.

## Tests

- `engine` : tests unitaires, de propriétés, de **déterminisme** (Node + Deno) et **statistiques** (10 000 matchs).
- Économie : simulateur dans `packages/economy`.
- E2E + régression visuelle Playwright pour les parcours et écrans clés.

## Commandes

- `pnpm dev` (app web, http://localhost:3000) · `pnpm build`
- `pnpm check` = format:check + lint + typecheck + test + test:deno (ce que vérifie la CI)
- `pnpm test` (Vitest) · `pnpm test:deno` (déterminisme sous Deno) · `pnpm --filter @legendes/engine test:watch`
- `pnpm determinism:update` : régénère l'empreinte de référence du moteur, **uniquement volontairement** (casse les replays)
- `pnpm db:start|stop|reset` (Supabase local, Docker requis) · `pnpm db:new <nom>` (migration)
- Paquets internes livrés en sources `.ts` ; imports relatifs **avec l'extension `.ts`** dans `engine` et `shared` (compatibilité Deno).

## Méthode

- Début de phase : mode plan, proposer un découpage, attendre validation.
- Pour tout ce qui touche au ressenti (caméra, geste, animations) : exposer les paramètres dans une page de réglage plutôt que de coder des constantes en dur.
- Consigner les décisions importantes dans `docs/DECISIONS.md`.
