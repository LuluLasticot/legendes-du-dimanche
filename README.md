# Légendes du Dimanche

> Le foot du dimanche mérite ses légendes.

Jeu web (PWA, mobile d'abord) de collection de cartes et de gestion d'équipe consacré au **football amateur français**, avec des actions clés jouables en 3D.

Jeu non officiel, non affilié à la FFF, aux ligues ou aux clubs.

## Prérequis

- Node 24 (`.nvmrc`) et pnpm 12 (`corepack enable pnpm`)
- Deno 2 (test de déterminisme)
- Docker ou OrbStack (Supabase en local)

## Démarrage

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

## Commandes

| Commande                                 | Rôle                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                               | Lance l'app web (Next.js)                                                   |
| `pnpm build`                             | Build de production                                                         |
| `pnpm typecheck`                         | TypeScript sur tous les paquets                                             |
| `pnpm lint`                              | ESLint (dont les règles de déterminisme du moteur)                          |
| `pnpm test`                              | Vitest : tests unitaires, de propriétés et de déterminisme (Node)           |
| `pnpm test:deno`                         | Test de déterminisme sous Deno                                              |
| `pnpm check`                             | Tout ce que vérifie la CI                                                   |
| `pnpm format`                            | Prettier                                                                    |
| `pnpm determinism:update`                | Régénère l'empreinte de référence du moteur (**volontairement uniquement**) |
| `pnpm db:start` / `db:stop` / `db:reset` | Supabase local (Docker)                                                     |
| `pnpm db:new <nom>`                      | Nouvelle migration                                                          |

## Structure

```
apps/web            Next.js 16 (App Router), Tailwind v4, next-intl
packages/engine     Cœur déterministe : PRNG, maths, physique, simulation (TS pur, zéro dépendance)
packages/shared     Postes, formations, tiers, divisions, schémas Zod, libellés FR
packages/ui         Design tokens (CSS + TS), thème Tailwind
supabase/           config, migrations, fonctions, seeds
docs/               GDD, architecture, roadmap, données et légal, décisions
```

## Déploiement (Vercel)

Projet Vercel avec **Root Directory = `apps/web`** ; pnpm et Turborepo sont détectés automatiquement.
