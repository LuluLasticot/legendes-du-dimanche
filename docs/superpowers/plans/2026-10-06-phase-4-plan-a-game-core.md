# Phase 4 — Plan A : le socle serveur du jeu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une base Supabase locale où un invité reçoit un profil, des crédits de bienvenue et un pack de départ, ouvre des packs tirés par le serveur et possède ses cartes, le tout écrit par le serveur seul (règle 2), avec les modules serveur TypeScript qui l'appellent.

**Architecture:** Deux migrations SQL (portefeuille et profils ; cartes et packs) dont toutes les écritures passent par des fonctions `SECURITY DEFINER` réservées à `service_role` ; la sécurité par ligne limite les clients à la lecture de leurs propres lignes. Le tirage reste en TypeScript pur (`openPack`, nouveau `openStarterPack`), appelé par des modules serveur qui enregistrent le résultat de façon atomique et rejouable. Aucune page ni route Next.js dans ce plan : le socle se teste directement contre Supabase local (plans B et C : coque, écrans, match, boutique, bout en bout).

**Tech Stack:** PostgreSQL 17 (Supabase local, Docker), `@supabase/supabase-js`, TypeScript strict, Zod, Vitest, pnpm/Turborepo.

**Spec:** `docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md` (sections 5, 6, 7, 9, 10, 11).

## Global Constraints

- Code, identifiants, commentaires et commits en **anglais** ; textes destinés au joueur en **français** (aucun dans ce plan, sauf les messages d'erreur du plan B).
- TypeScript `strict`, **pas de `any`**, Zod à chaque frontière (réseau, base, stockage).
- Paquets internes en sources `.ts` ; imports relatifs **avec l'extension `.ts`** dans `packages/shared` et `packages/engine`.
- Règle 2 : tout ce qui a de la valeur (crédits, cartes, packs) est écrit par le serveur seul : `EXECUTE` retiré à `public`, `anon`, `authenticated` sur chaque fonction d'écriture ; aucune règle d'insertion, de modification ou de suppression pour le client ; RLS activée sur **chaque** table.
- Règle 5 : aucun achat avec de l'argent réel ; le prix d'un pack vient de `PACKS` (code testé), jamais du client.
- Règle 3 et 6 : joueurs fictifs et majeurs uniquement (déjà garanti par le générateur).
- Commits conventionnels (`feat(scope): …`), petits, un par tâche ; terminer chaque message de commit par la ligne d'attribution donnée par la session.
- Branche d'implémentation : `feat/game-core`, créée depuis `main` à jour. `pnpm check` doit rester vert à chaque tâche (les tests de base de données ne font **pas** partie de `pnpm check`, ils demandent Docker : `pnpm --filter @legendes/web test:db`).
- Valeurs de départ à équilibrer plus tard (`packages/economy`) : bonus de bienvenue 1 000 CR, pack Bronze 400 CR.

## Review Focus

Ce que la spec implique sans le dire, et qui peut casser pour un vrai joueur, du plus probable au moins probable :

1. **Deux onglets ouvrent le même pack en même temps** (deux `request_id` différents) : un seul doit réussir, les 12 cartes ne doivent pas être doublées. Test : tâche 5.
2. **Le bonus de bienvenue réclamé depuis deux onglets en même temps** : payé une seule fois. Test : tâche 3.
3. **« Choisis ton club » rejoué après une réponse perdue** (le serveur a réussi, le client a réessayé) : le même pack de départ revient, pas d'erreur. Test : tâches 3 et 6.
4. **Un joueur qui tente de lire le profil, le grand livre ou les cartes d'un autre** : il ne reçoit rien. Test : tâche 3.
5. **Un tirage contenant une carte inconnue parmi des cartes valides** : rien n'est enregistré, le pack reste fermé. Test : tâche 5.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `packages/data/src/packs.ts` (modifié) | + `openStarterPack`, `StarterPack`, constantes du pack de départ |
| `packages/data/src/card-defs.ts` (créé) | toutes les définitions de cartes du pilote et leur SQL de peuplement |
| `packages/data/src/sql.ts` (modifié) | exporte `insert` et `q` pour le script de cartes |
| `packages/data/scripts/build-card-seed.ts` (créé) | écrit / vérifie `supabase/seed/20_cards.sql` |
| `supabase/migrations/20261007090000_game_wallet.sql` (créé) | profils, grand livre, solde, bienvenue, choix du club, achat de pack |
| `supabase/migrations/20261007091000_game_cards.sql` (créé) | définitions de cartes, exemplaires, ouvertures, `open_pack` |
| `supabase/seed/20_cards.sql` (généré) | les 9 749 définitions de cartes |
| `supabase/config.toml` (modifié) | connexions anonymes activées |
| `packages/shared/src/db/database.types.ts` (généré) | types de la base, pour `supabase-js` |
| `apps/web/vitest.db.config.ts`, `apps/web/test-db/*.ts` (créés) | harnais et tests contre Supabase local |
| `apps/web/src/server/game/{errors,wallet,packs}.ts` (créés) | modules serveur ; le client Supabase est injecté |

---

### Task 1: Le pack de départ

**Files:**
- Modify: `packages/data/src/packs.ts` (ajout en fin de fichier ; imports en tête)
- Test: `packages/data/test/starter-pack.test.ts` (créé)

**Interfaces:**
- Consumes: `Rng` (`@legendes/engine/rng`), `POSITION_LINE` et `PositionLine` (`@legendes/engine/sim/positions`), `clubsOf` (`./world.ts`), `generateSquad`, `cardOf`, `cardClassOf`, `cardValue`, `PackCard`, `Entry` (internes à `packs.ts`).
- Produces (exportés par `@legendes/data`) :
  - `STARTER_PACK_SIZE = 18`, `STARTER_CLUB_CARDS = 11`, `STARTER_MAX_SILVER = 2`
  - `interface StarterPack { readonly type: 'starter'; readonly seed: string; readonly clubId: string; readonly cards: readonly PackCard[] }`
  - `openStarterPack(club: Club, seed: string): StarterPack`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `packages/data/test/starter-pack.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { POSITION_LINE } from '@legendes/engine/sim/positions';
import {
  cardClassOf,
  cardValue,
  clubsOf,
  openStarterPack,
  STARTER_CLUB_CARDS,
  STARTER_MAX_SILVER,
  STARTER_PACK_SIZE,
  type CardClass,
} from '../src/index.ts';

const starters = clubsOf({ divisionId: 'escaut-d5' });
const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('the starter pack', () => {
  it('has enough clubs to test', () => {
    expect(starters.length).toBeGreaterThanOrEqual(30);
  });

  it('is deterministic, and the seed changes it', () => {
    const club = starters[0]!;
    expect(openStarterPack(club, 'x')).toEqual(openStarterPack(club, 'x'));
    expect(openStarterPack(club, 'x')).not.toEqual(openStarterPack(club, 'y'));
  });

  it('holds 18 cards, 11 from the chosen club, no player twice', () => {
    for (const club of starters) {
      for (const seed of SEEDS) {
        const pack = openStarterPack(club, seed);
        expect(pack.type).toBe('starter');
        expect(pack.clubId).toBe(club.id);
        expect(pack.cards).toHaveLength(STARTER_PACK_SIZE);
        expect(pack.cards.filter((c) => c.club.id === club.id)).toHaveLength(STARTER_CLUB_CARDS);
        expect(new Set(pack.cards.map((c) => c.card.player.id)).size).toBe(STARTER_PACK_SIZE);
        for (const { club: other } of pack.cards) expect(other.districtId).toBe(club.districtId);
      }
    }
  });

  it('always makes a valid squad: 2 keepers, 6 defenders, 6 midfielders, 4 forwards', () => {
    for (const club of starters) {
      for (const seed of SEEDS) {
        const lines = openStarterPack(club, seed).cards.map(
          (c) => POSITION_LINE[c.card.player.positions[0] ?? 'CM'],
        );
        const count = (line: string): number => lines.filter((l) => l === line).length;
        expect([count('goalkeeper'), count('defence'), count('midfield'), count('attack')]).toEqual([
          2, 6, 6, 4,
        ]);
      }
    }
  });

  it('has no big rare: bronze and at most two silver, no gold, no promo', () => {
    const allowed = new Set<CardClass>([
      'bronze-common',
      'bronze-rare',
      'silver-common',
      'silver-rare',
    ]);
    for (const club of starters) {
      for (const seed of SEEDS) {
        const classes = openStarterPack(club, seed).cards.map((c) => cardClassOf(c.card));
        for (const cardClass of classes) expect(allowed.has(cardClass)).toBe(true);
        expect(classes.filter((c) => c.startsWith('silver')).length).toBeLessThanOrEqual(
          STARTER_MAX_SILVER,
        );
      }
    }
  });

  it('shows the best card last', () => {
    const cards = openStarterPack(starters[0]!, 'order').cards;
    const values = cards.map((c) => cardValue(c.card));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @legendes/data exec vitest run test/starter-pack.test.ts`
Expected: FAIL (erreur de typage ou « openStarterPack is not a function »).

- [ ] **Step 3: Implémenter**

Dans `packages/data/src/packs.ts`, ajouter aux imports :

```ts
import { POSITION_LINE, type PositionLine } from '@legendes/engine/sim/positions';
```
et changer `import { WORLD } from './world.ts';` en `import { clubsOf, WORLD } from './world.ts';`.

Puis ajouter **à la fin du fichier** :

```ts
// ─── Starter pack ────────────────────────────────────────────────────────────────────────────
// What a new player opens first (GDD §3.5): random players, most of them from the club he chose,
// bronze and a couple of silver at most — no big rare, like the first pack of the genre.

export const STARTER_PACK_SIZE = 18;
/** Cards from the chosen club; the rest comes from the other clubs of its district. */
export const STARTER_CLUB_CARDS = 11;
export const STARTER_MAX_SILVER = 2;

/** Per line: how many cards from the club, how many from the others (2 + 6 + 6 + 4 in all). */
const STARTER_SLOTS: readonly { line: PositionLine; own: number; others: number }[] = [
  { line: 'goalkeeper', own: 1, others: 1 },
  { line: 'defence', own: 4, others: 2 },
  { line: 'midfield', own: 4, others: 2 },
  { line: 'attack', own: 2, others: 2 },
];

const STARTER_CLASSES: ReadonlySet<CardClass> = new Set([
  'bronze-common',
  'bronze-rare',
  'silver-common',
  'silver-rare',
]);

export interface StarterPack {
  readonly type: 'starter';
  readonly seed: string;
  readonly clubId: string;
  /** Eighteen cards, the least valuable first. */
  readonly cards: readonly PackCard[];
}

interface StarterEntry extends Entry {
  readonly cardClass: CardClass;
}

const starterPools = new Map<string, readonly StarterEntry[]>();

/** The district's players whose base card is bronze or silver, in a stable order. */
function starterEntries(districtId: string): readonly StarterEntry[] {
  const cached = starterPools.get(districtId);
  if (cached) return cached;
  const entries: StarterEntry[] = [];
  for (const club of [...clubsOf({ districtId })].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const player of generateSquad(club).players) {
      const cardClass = cardClassOf(cardOf(player));
      if (STARTER_CLASSES.has(cardClass)) entries.push({ player, club, cardClass });
    }
  }
  starterPools.set(districtId, entries);
  return entries;
}

/** Draws the starter pack of a club. Deterministic: the same club and seed give the same cards. */
export function openStarterPack(club: Club, seed: string): StarterPack {
  const rng = Rng.create(`starter:${club.id}:${seed}`);
  const entries = starterEntries(club.districtId);
  const taken = new Set<string>();
  const cards: PackCard[] = [];
  let silver = 0;
  let slot = 0;

  const draw = (line: PositionLine, fromClub: boolean): void => {
    const fits = (e: StarterEntry): boolean =>
      POSITION_LINE[e.player.positions[0] ?? 'CM'] === line &&
      !taken.has(e.player.id) &&
      !(silver >= STARTER_MAX_SILVER && e.cardClass.startsWith('silver'));
    const preferred = entries.filter((e) => fits(e) && (e.club.id === club.id) === fromClub);
    // A club short of a profile is completed from the rest of the district (and back).
    const pool = preferred.length > 0 ? preferred : entries.filter(fits);
    if (pool.length === 0) throw new Error(`No ${line} card left for the starter pack of ${club.id}`);
    const entry = rng.fork('slot', slot++).pick(pool);
    taken.add(entry.player.id);
    if (entry.cardClass.startsWith('silver')) silver++;
    cards.push({ card: cardOf(entry.player), club: entry.club });
  };

  for (const { line, own, others } of STARTER_SLOTS) {
    for (let i = 0; i < own; i++) draw(line, true);
    for (let i = 0; i < others; i++) draw(line, false);
  }
  cards.sort((a, b) => cardValue(a.card) - cardValue(b.card) || a.card.id.localeCompare(b.card.id));
  return { type: 'starter', seed, clubId: club.id, cards };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `pnpm --filter @legendes/data exec vitest run test/starter-pack.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Vérifier le reste du paquet et commiter**

Run: `pnpm --filter @legendes/data test && pnpm --filter @legendes/data typecheck && pnpm --filter @legendes/data lint`
Expected: tout passe.

```bash
git add packages/data/src/packs.ts packages/data/test/starter-pack.test.ts
git commit -m "feat(data): the starter pack — 18 cards, most from the chosen club, no big rare"
```

---

### Task 2: Supabase local pour les tests, harnais et connexion invité

**Files:**
- Modify: `supabase/config.toml` (la ligne `enable_anonymous_sign_ins = false`)
- Modify: `apps/web/package.json` (dépendance et script), `apps/web/tsconfig.json` (inclure `test-db`)
- Create: `apps/web/vitest.db.config.ts`, `apps/web/test-db/harness.ts`, `apps/web/test-db/guest.test.ts`

**Interfaces:**
- Produces (`apps/web/test-db/harness.ts`) :
  - `type Db = SupabaseClient<Database>`
  - `admin: Db` (clé de service, ne persiste pas de session)
  - `interface Guest { readonly id: string; readonly client: Db }` ; `newGuest(): Promise<Guest>` (connexion anonyme avec la clé publique)
  - `anonymousClient(): Db` (clé publique, aucune session)
- Note : le type `Database` n'existe qu'à la tâche 3 ; cette tâche utilise un client sans type de base et corrige le harnais à la tâche 3.

- [ ] **Step 1: Activer les connexions anonymes**

Dans `supabase/config.toml`, remplacer `enable_anonymous_sign_ins = false` par `enable_anonymous_sign_ins = true`.

- [ ] **Step 2: Redémarrer la pile locale et rejouer les migrations**

Run: `pnpm db:stop && pnpm db:start && pnpm db:reset`
Expected: la pile démarre ; `db reset` applique les trois migrations existantes et les seeds (`10_universe.sql`). Les clés affichées par `db:start` sont déjà dans `apps/web/.env.local` ; si ce n'est pas le cas, copier `API URL`, `Publishable` et `Secret` dans `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY`.

- [ ] **Step 3: Ajouter la dépendance et le script**

Run: `pnpm --filter @legendes/web add @supabase/supabase-js`

Dans `apps/web/package.json`, ajouter dans `scripts` :

```json
    "test:db": "node --env-file=.env.local ./node_modules/vitest/vitest.mjs run --config vitest.db.config.ts",
```

Dans `apps/web/tsconfig.json`, ajouter `"test-db",` à la liste `include` (après `"scripts",`), pour que les tests de base soient typés et lus par le lint.

- [ ] **Step 4: Écrire la configuration Vitest des tests de base**

Créer `apps/web/vitest.db.config.ts` :

```ts
import { defineConfig } from 'vitest/config';

// Tests against the local Supabase stack (`pnpm db:start`). Run with `pnpm --filter @legendes/web test:db`:
// the script loads apps/web/.env.local. Not part of `pnpm test`: they need Docker.
export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    include: ['test-db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 5: Écrire le harnais**

Créer `apps/web/test-db/harness.ts` :

```ts
// Clients of the local Supabase stack for the database tests: the service role (what the server
// uses) and guests (what a visitor is: an anonymous account with the public key only).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is missing. Run the tests with \`pnpm --filter @legendes/web test:db\` ` +
        '(it reads apps/web/.env.local, filled from `pnpm db:start`).',
    );
  }
  return value;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export type Db = SupabaseClient;

export const admin: Db = createClient(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SECRET_KEY'),
  options,
);

export function anonymousClient(): Db {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    options,
  );
}

export interface Guest {
  readonly id: string;
  readonly client: Db;
}

/** A new visitor: an anonymous account, signed in with the public key. */
export async function newGuest(): Promise<Guest> {
  const client = anonymousClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.message}`);
  return { id: data.user.id, client };
}
```

- [ ] **Step 6: Écrire le test de connexion invité**

Créer `apps/web/test-db/guest.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { newGuest } from './harness.ts';

describe('guest sign-in', () => {
  it('creates an anonymous account with its own identity', async () => {
    const a = await newGuest();
    const b = await newGuest();
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
    const { data } = await a.client.auth.getUser();
    expect(data.user?.is_anonymous).toBe(true);
  });
});
```

- [ ] **Step 7: Lancer le test**

Run: `pnpm --filter @legendes/web test:db`
Expected: PASS (1 test). Si `signInAnonymously` répond « Anonymous sign-ins are disabled », la pile n'a pas pris la configuration : refaire `pnpm db:stop && pnpm db:start`.

- [ ] **Step 8: Vérifier et commiter**

Run: `pnpm --filter @legendes/web typecheck && pnpm --filter @legendes/web lint`
Expected: passe.

```bash
git add supabase/config.toml apps/web/package.json apps/web/tsconfig.json apps/web/vitest.db.config.ts apps/web/test-db pnpm-lock.yaml
git commit -m "test(web): database tests against local Supabase, with anonymous guests"
```

---

### Task 3: Profils, grand livre, bienvenue, choix du club, achat de pack

**Files:**
- Create: `supabase/migrations/20261007090000_game_wallet.sql`
- Create: `packages/shared/src/db/database.types.ts` (généré)
- Modify: `packages/shared/src/index.ts`, `package.json` (script `db:types`), `apps/web/test-db/harness.ts`
- Test: `apps/web/test-db/security.test.ts`, `apps/web/test-db/wallet.test.ts` (créés)

**Interfaces:**
- Consumes: `newGuest`, `admin`, `anonymousClient` (tâche 2) ; `clubsOf` (`@legendes/data`).
- Produces (SQL, appelables avec `service_role` seul) :
  - `claim_welcome(p_user uuid, p_amount integer) returns integer` : crédits accordés (0 si déjà réclamé)
  - `choose_club(p_user uuid, p_club text) returns void` : idempotent pour le même club
  - `grant_pack(p_user uuid, p_type text, p_source text, p_price integer, p_request uuid default null) returns uuid` : id du pack ; idempotent par `p_request`, et unique par joueur pour l'origine `starter`
  - Tables `profiles`, `credit_ledger`, `user_packs`, vue `wallet_balances`
  - Messages d'erreur (texte exact de l'exception) : `profile_not_found`, `invalid_amount`, `invalid_price`, `invalid_pack`, `insufficient_funds`, `club_already_chosen`, `club_not_eligible`, `club_not_chosen`
- Produces (TypeScript) : `Database` et `Json` exportés par `@legendes/shared`.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20261007090000_game_wallet.sql` :

```sql
-- Légendes du Dimanche — the game's wallet (Phase 4, slice 1): profiles, credit ledger, packs to open.
-- Rule 2: everything of value is written by the server only. A signed-in player (guest included)
-- can READ his own rows; there is no insert, update or delete policy for him at all. Writes go
-- through the SECURITY DEFINER functions below, executable by the service role alone.

-- ─── Profiles ────────────────────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 3 and 24),
  club_id text references public.clubs (id),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Every account, anonymous ones included, gets a profile with a placeholder pseudo.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, pseudo)
  values (new.id, 'Joueur-' || substr(replace(new.id::text, '-', ''), 1, 6));
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Credit ledger ───────────────────────────────────────────────────────────────────────────
-- No balance is ever written: it is the sum of the ledger. Lines are never changed.

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('welcome', 'pack', 'match', 'objective')),
  ref text,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, id);
create unique index credit_ledger_welcome_once on public.credit_ledger (user_id) where reason = 'welcome';
create unique index credit_ledger_ref_once on public.credit_ledger (user_id, reason, ref) where ref is not null;
alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated using (user_id = (select auth.uid()));

create function public.credit_ledger_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'credit_ledger is append-only';
end $$;
create trigger credit_ledger_no_update before update on public.credit_ledger
  for each row execute function public.credit_ledger_no_update();

create view public.wallet_balances with (security_invoker = on) as
  select p.id as user_id, coalesce(sum(l.delta), 0)::integer as balance
  from public.profiles p
  left join public.credit_ledger l on l.user_id = p.id
  group by p.id;
revoke all on public.wallet_balances from anon, authenticated;
grant select on public.wallet_balances to authenticated;

-- ─── Packs waiting to be opened ──────────────────────────────────────────────────────────────

create table public.user_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('starter', 'bronze', 'silver', 'gold', 'gold-premium')),
  source text not null check (source in ('starter', 'shop', 'objective')),
  request_id uuid,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_packs_user_idx on public.user_packs (user_id, created_at);
create unique index user_packs_request_once on public.user_packs (user_id, request_id) where request_id is not null;
create unique index user_packs_starter_once on public.user_packs (user_id) where source = 'starter';
alter table public.user_packs enable row level security;
revoke all on public.user_packs from anon, authenticated;
grant select on public.user_packs to authenticated;
create policy user_packs_select_own on public.user_packs
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Writes: service role only ───────────────────────────────────────────────────────────────

-- The welcome bonus, once per player, however many tabs ask at the same time.
create function public.claim_welcome(p_user uuid, p_amount integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  paid integer;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  insert into public.credit_ledger (user_id, delta, reason)
  values (p_user, p_amount, 'welcome')
  on conflict (user_id) where reason = 'welcome' do nothing;
  get diagnostics paid = row_count;
  return paid * p_amount;
end $$;

-- The club a new player starts with: a District 5 club, chosen once (asking again for the same
-- club, after a lost answer, is not an error).
create function public.choose_club(p_user uuid, p_club text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  chosen text;
begin
  select club_id into chosen from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if chosen is not null then
    if chosen = p_club then return; end if;
    raise exception 'club_already_chosen';
  end if;
  if not exists (
    select 1 from public.clubs c join public.divisions d on d.id = c.division_id
    where c.id = p_club and d.scope = 'district' and d.rank = 5
  ) then
    raise exception 'club_not_eligible';
  end if;
  update public.profiles set club_id = p_club where id = p_user;
end $$;

-- Gives a closed pack to a player, paying for it from his credits when it has a price. One
-- transaction: the profile row is locked first, so two purchases at once cannot spend the same
-- credits twice. Asking again with the same request returns the same pack.
create function public.grant_pack(
  p_user uuid, p_type text, p_source text, p_price integer, p_request uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing uuid;
  chosen text;
  balance integer;
  new_id uuid;
begin
  select club_id into chosen from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if (p_source = 'starter') <> (p_type = 'starter') then raise exception 'invalid_pack'; end if;
  if p_price < 0 then raise exception 'invalid_price'; end if;
  if p_request is not null then
    select id into existing from public.user_packs where user_id = p_user and request_id = p_request;
    if found then return existing; end if;
  end if;
  if p_source = 'starter' then
    select id into existing from public.user_packs where user_id = p_user and source = 'starter';
    if found then return existing; end if;
    if chosen is null then raise exception 'club_not_chosen'; end if;
  end if;
  if p_price > 0 then
    select coalesce(sum(delta), 0) into balance from public.credit_ledger where user_id = p_user;
    if balance < p_price then raise exception 'insufficient_funds'; end if;
  end if;
  insert into public.user_packs (user_id, type, source, request_id)
  values (p_user, p_type, p_source, p_request) returning id into new_id;
  if p_price > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref) values (p_user, -p_price, 'pack', new_id::text);
  end if;
  return new_id;
end $$;

revoke execute on function
  public.claim_welcome(uuid, integer),
  public.choose_club(uuid, text),
  public.grant_pack(uuid, text, text, integer, uuid)
from public, anon, authenticated;
grant execute on function
  public.claim_welcome(uuid, integer),
  public.choose_club(uuid, text),
  public.grant_pack(uuid, text, text, integer, uuid)
to service_role;
```

- [ ] **Step 2: Appliquer la migration**

Run: `pnpm db:reset`
Expected: la migration s'applique sans erreur (puis le seed de l'univers).

- [ ] **Step 3: Générer les types de la base et les exposer**

Dans `package.json` (racine), remplacer le script `db:types` par :

```json
    "db:types": "mkdir -p packages/shared/src/db && supabase gen types typescript --local > packages/shared/src/db/database.types.ts && prettier --write packages/shared/src/db/database.types.ts",
```

Run: `pnpm db:types`
Expected: `packages/shared/src/db/database.types.ts` existe et contient `wallet_balances`, `claim_welcome`, `grant_pack`.

Ajouter à la fin de `packages/shared/src/index.ts` :

```ts
export type { Database, Json } from './db/database.types.ts';
```

- [ ] **Step 4: Typer le harnais**

Dans `apps/web/test-db/harness.ts`, remplacer l'import et les types :

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@legendes/shared';
```

```ts
export type Db = SupabaseClient<Database>;

export const admin: Db = createClient<Database>(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SECRET_KEY'),
  options,
);

export function anonymousClient(): Db {
  return createClient<Database>(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    options,
  );
}
```

- [ ] **Step 5: Écrire les tests de sécurité (ils doivent passer sur la migration)**

Créer `apps/web/test-db/security.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { admin, anonymousClient, newGuest } from './harness.ts';

describe('a new guest', () => {
  it('has a profile with a placeholder pseudo, no club and an empty wallet', async () => {
    const guest = await newGuest();
    const { data: profile } = await guest.client
      .from('profiles')
      .select('id, pseudo, club_id')
      .eq('id', guest.id)
      .single();
    expect(profile?.pseudo).toMatch(/^Joueur-[0-9a-f]{6}$/);
    expect(profile?.club_id).toBeNull();
    const { data: wallet } = await guest.client.from('wallet_balances').select('balance');
    expect(wallet).toEqual([{ balance: 0 }]);
  });
});

describe('what a client can read', () => {
  it('only its own profile, ledger and wallet', async () => {
    const a = await newGuest();
    const b = await newGuest();
    await admin.rpc('claim_welcome', { p_user: a.id, p_amount: 1000 });
    expect((await b.client.from('profiles').select('id').eq('id', a.id)).data).toEqual([]);
    expect((await b.client.from('credit_ledger').select('id').eq('user_id', a.id)).data).toEqual([]);
    expect((await b.client.from('wallet_balances').select('user_id')).data).toEqual([
      { user_id: b.id },
    ]);
    const own = await a.client.from('credit_ledger').select('delta, reason');
    expect(own.data).toEqual([{ delta: 1000, reason: 'welcome' }]);
  });

  it('nothing at all when not signed in', async () => {
    const visitor = anonymousClient();
    expect((await visitor.from('profiles').select('id')).data ?? []).toEqual([]);
  });
});

describe('what a client can write', () => {
  it('nothing: no credits, no packs, no profile change', async () => {
    const guest = await newGuest();
    const ledger = await guest.client
      .from('credit_ledger')
      .insert({ user_id: guest.id, delta: 99_999, reason: 'match' });
    expect(ledger.error).not.toBeNull();
    const pack = await guest.client
      .from('user_packs')
      .insert({ user_id: guest.id, type: 'gold-premium', source: 'objective' });
    expect(pack.error).not.toBeNull();
    const profile = await guest.client
      .from('profiles')
      .update({ club_id: 'ac-bermerain-59069' })
      .eq('id', guest.id);
    expect(profile.error).not.toBeNull();
    expect((await admin.from('credit_ledger').select('id').eq('user_id', guest.id)).data).toEqual([]);
  });

  it('cannot call the server functions, signed in or not', async () => {
    const guest = await newGuest();
    const asGuest = await guest.client.rpc('claim_welcome', { p_user: guest.id, p_amount: 1_000_000 });
    expect(asGuest.error?.message).toMatch(/permission denied/i);
    const asVisitor = await anonymousClient().rpc('grant_pack', {
      p_user: guest.id,
      p_type: 'gold-premium',
      p_source: 'objective',
      p_price: 0,
    });
    expect(asVisitor.error?.message).toMatch(/permission denied/i);
  });
});
```

- [ ] **Step 6: Écrire les tests du portefeuille et des packs**

Créer `apps/web/test-db/wallet.test.ts` :

```ts
import { clubsOf } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { admin, newGuest } from './harness.ts';

const request = (): string => crypto.randomUUID();
const starterClub = clubsOf({ divisionId: 'escaut-d5' })[0]!.id;
const otherClub = clubsOf({ divisionId: 'escaut-d5' })[1]!.id;
const topClub = clubsOf({ divisionId: 'escaut-d1' })[0]!.id;

async function balance(userId: string): Promise<number> {
  const { data, error } = await admin
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data.balance ?? 0;
}

describe('the welcome bonus', () => {
  it('is paid once, even when five tabs claim it at the same time', async () => {
    const { id } = await newGuest();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => admin.rpc('claim_welcome', { p_user: id, p_amount: 1000 })),
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.reduce((sum, r) => sum + (r.data ?? 0), 0)).toBe(1000);
    expect(await balance(id)).toBe(1000);
  });

  it('refuses a non-positive amount', async () => {
    const { id } = await newGuest();
    expect((await admin.rpc('claim_welcome', { p_user: id, p_amount: 0 })).error?.message).toBe(
      'invalid_amount',
    );
  });
});

describe('the credit ledger', () => {
  it('is append-only', async () => {
    const { id } = await newGuest();
    await admin.rpc('claim_welcome', { p_user: id, p_amount: 1000 });
    const change = await admin.from('credit_ledger').update({ delta: 5000 }).eq('user_id', id);
    expect(change.error?.message).toMatch(/append-only/);
    expect(await balance(id)).toBe(1000);
  });
});

describe('buying a pack', () => {
  it('never spends more than the balance, ten purchases at once', async () => {
    const { id } = await newGuest();
    await admin.rpc('claim_welcome', { p_user: id, p_amount: 1000 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        admin.rpc('grant_pack', {
          p_user: id,
          p_type: 'bronze',
          p_source: 'shop',
          p_price: 400,
          p_request: request(),
        }),
      ),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(2);
    for (const failed of results.filter((r) => r.error !== null)) {
      expect(failed.error?.message).toBe('insufficient_funds');
    }
    expect(await balance(id)).toBe(200);
  });

  it('charges once when the same request is replayed', async () => {
    const { id } = await newGuest();
    await admin.rpc('claim_welcome', { p_user: id, p_amount: 1000 });
    const p_request = request();
    const args = { p_user: id, p_type: 'bronze', p_source: 'shop', p_price: 400, p_request };
    const first = await admin.rpc('grant_pack', args);
    const second = await admin.rpc('grant_pack', args);
    expect(first.error).toBeNull();
    expect(second.data).toBe(first.data);
    expect(await balance(id)).toBe(600);
  });

  it('refuses a negative price and a pack that does not match its origin', async () => {
    const { id } = await newGuest();
    const negative = await admin.rpc('grant_pack', {
      p_user: id,
      p_type: 'bronze',
      p_source: 'shop',
      p_price: -5,
    });
    expect(negative.error?.message).toBe('invalid_price');
    const mismatch = await admin.rpc('grant_pack', {
      p_user: id,
      p_type: 'gold-premium',
      p_source: 'starter',
      p_price: 0,
    });
    expect(mismatch.error?.message).toBe('invalid_pack');
  });
});

describe('choosing a club and the starter pack', () => {
  it('needs a District 5 club', async () => {
    const { id } = await newGuest();
    expect((await admin.rpc('choose_club', { p_user: id, p_club: topClub })).error?.message).toBe(
      'club_not_eligible',
    );
    expect((await admin.rpc('choose_club', { p_user: id, p_club: 'no-such-club' })).error?.message).toBe(
      'club_not_eligible',
    );
  });

  it('gives the starter pack only after a club is chosen, and only once', async () => {
    const { id } = await newGuest();
    const starter = { p_user: id, p_type: 'starter', p_source: 'starter', p_price: 0 };
    expect((await admin.rpc('grant_pack', starter)).error?.message).toBe('club_not_chosen');
    expect((await admin.rpc('choose_club', { p_user: id, p_club: starterClub })).error).toBeNull();
    const first = await admin.rpc('grant_pack', starter);
    const again = await admin.rpc('grant_pack', starter);
    expect(first.error).toBeNull();
    expect(again.data).toBe(first.data);
  });

  it('answers a retry for the same club, and refuses another club', async () => {
    const { id } = await newGuest();
    expect((await admin.rpc('choose_club', { p_user: id, p_club: starterClub })).error).toBeNull();
    expect((await admin.rpc('choose_club', { p_user: id, p_club: starterClub })).error).toBeNull();
    expect((await admin.rpc('choose_club', { p_user: id, p_club: otherClub })).error?.message).toBe(
      'club_already_chosen',
    );
  });
});
```

- [ ] **Step 7: Lancer les tests de base**

Run: `pnpm --filter @legendes/web test:db`
Expected: PASS (guest, security, wallet : 13 tests). Si `permission denied` n'apparaît pas pour les appels de fonction, vérifier le bloc `revoke execute … from public, anon, authenticated`.

- [ ] **Step 8: Vérifier le tout et commiter**

Run: `pnpm check`
Expected: vert (le fichier généré est formaté par Prettier).

```bash
git add supabase/migrations/20261007090000_game_wallet.sql packages/shared apps/web/test-db package.json
git commit -m "feat(db): profiles, credit ledger, welcome bonus, club choice and packs to open (service-role writes only)"
```

---

### Task 4: Les définitions de cartes du pilote

**Files:**
- Modify: `packages/data/src/sql.ts` (exporter `insert`, `q`)
- Create: `packages/data/src/card-defs.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/test/card-defs.test.ts` (créé)

**Interfaces:**
- Consumes: `WORLD`, `generateSquad`, `cardOf`, `cardVariantsOf`, `cardClassOf`, `findCard`.
- Produces (exportés par `@legendes/data`) :
  - `interface CardDef { readonly id: string; readonly playerId: string; readonly variant: CardVariant; readonly cardClass: CardClass; readonly rating: number; readonly clubId: string; readonly position: string }`
  - `allCardDefs(): CardDef[]` (stable, triées par id)
  - `cardDefsSql(defs: readonly CardDef[]): string`

- [ ] **Step 1: Exporter les aides SQL**

Dans `packages/data/src/sql.ts`, remplacer `const q = ` par `export const q = ` et `function insert(` par `export function insert(`.

- [ ] **Step 2: Écrire le test qui échoue**

Créer `packages/data/test/card-defs.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  allCardDefs,
  CARD_CLASSES,
  cardDefsSql,
  findCard,
  generateSquad,
  WORLD,
} from '../src/index.ts';

describe('card definitions', () => {
  const defs = allCardDefs();

  it('hold every card of the pilot, once', () => {
    const players = WORLD.clubs.reduce((n, club) => n + generateSquad(club).players.length, 0);
    expect(defs.length).toBeGreaterThanOrEqual(players * 2);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(defs.filter((d) => d.variant === 'base')).toHaveLength(players);
    expect(defs.filter((d) => d.variant === 'weekend')).toHaveLength(players);
  });

  it('are in a stable order', () => {
    const ids = defs.map((d) => d.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('describe the card the game draws', () => {
    for (const def of defs.filter((_, i) => i % 97 === 0)) {
      const found = findCard(def.id);
      expect(found, def.id).not.toBeNull();
      expect(found?.card.player.rating).toBe(def.rating);
      expect(found?.club.id).toBe(def.clubId);
      expect(found?.card.player.positions[0]).toBe(def.position);
      expect(CARD_CLASSES).toContain(def.cardClass);
    }
  });

  it('make one insert statement per few hundred rows, one line per card', () => {
    const sql = cardDefsSql(defs);
    expect(sql.split('\n').filter((l) => l.startsWith("  ('"))).toHaveLength(defs.length);
    expect(sql).toContain('insert into public.card_defs');
    expect(sql).toContain('on conflict (id) do update');
  });
});
```

- [ ] **Step 3: Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @legendes/data exec vitest run test/card-defs.test.ts`
Expected: FAIL (`allCardDefs` n'existe pas).

- [ ] **Step 4: Implémenter**

Créer `packages/data/src/card-defs.ts` :

```ts
// Every card of the pilot as a plain row (id, class, rating, club, position), for the database:
// it checks that a card exists before a player can own it. The card itself is never stored: it is
// recomputed from its id (`findCard`), so the database holds references only.

import { cardClassOf, type CardClass } from './packs.ts';
import { insert, q } from './sql.ts';
import { cardOf, cardVariantsOf, type CardVariant } from './squad/cards.ts';
import { generateSquad } from './squad/generate.ts';
import { WORLD } from './world.ts';

export interface CardDef {
  readonly id: string;
  readonly playerId: string;
  readonly variant: CardVariant;
  readonly cardClass: CardClass;
  readonly rating: number;
  readonly clubId: string;
  readonly position: string;
}

/** The base card and the promo cards of every generated player, sorted by id. */
export function allCardDefs(): CardDef[] {
  const defs: CardDef[] = [];
  for (const club of WORLD.clubs) {
    for (const player of generateSquad(club).players) {
      for (const variant of cardVariantsOf(player)) {
        const card = cardOf(player, variant);
        defs.push({
          id: card.id,
          playerId: player.id,
          variant,
          cardClass: cardClassOf(card),
          rating: card.player.rating,
          clubId: club.id,
          position: card.player.positions[0] ?? 'CM',
        });
      }
    }
  }
  return defs.sort((a, b) => a.id.localeCompare(b.id));
}

const CHUNK = 500;
const COLUMNS = ['id', 'player_id', 'variant', 'class', 'rating', 'club_id', 'position'] as const;

/** The seed `supabase/seed/20_cards.sql`: idempotent upserts, a few hundred rows per statement. */
export function cardDefsSql(defs: readonly CardDef[]): string {
  const statements: string[] = [];
  for (let i = 0; i < defs.length; i += CHUNK) {
    statements.push(
      insert(
        'card_defs',
        COLUMNS,
        defs
          .slice(i, i + CHUNK)
          .map((d) => [
            q(d.id),
            q(d.playerId),
            q(d.variant),
            q(d.cardClass),
            String(d.rating),
            q(d.clubId),
            q(d.position),
          ]),
        'id',
      ),
    );
  }
  return `-- Generated by \`pnpm --filter @legendes/data build:cards\`. Do not edit.\n${statements.join('\n')}`;
}
```

Ajouter à `packages/data/src/index.ts` : `export * from './card-defs.ts';`

- [ ] **Step 5: Lancer les tests et commiter**

Run: `pnpm --filter @legendes/data test && pnpm --filter @legendes/data typecheck && pnpm --filter @legendes/data lint`
Expected: PASS.

```bash
git add packages/data
git commit -m "feat(data): card definitions of the pilot, as rows for the database"
```

---

### Task 5: Cartes, exemplaires, ouverture d'un pack

**Files:**
- Create: `supabase/migrations/20261007091000_game_cards.sql`
- Create: `packages/data/scripts/build-card-seed.ts`, `supabase/seed/20_cards.sql` (généré)
- Modify: `packages/data/package.json` (scripts `build:cards` et `test`), `packages/shared/src/db/database.types.ts` (régénéré)
- Test: `apps/web/test-db/packs.test.ts` (créé)

**Interfaces:**
- Consumes: `allCardDefs`, `cardDefsSql` (tâche 4) ; `grant_pack`, `choose_club`, `claim_welcome` (tâche 3) ; `openPack`, `openStarterPack` (tâche 1).
- Produces (SQL, `service_role` seul) :
  - Tables `card_defs` (lecture publique), `pack_openings`, `card_items`
  - `open_pack(p_user uuid, p_pack uuid, p_seed text, p_cards text[], p_request uuid) returns text[]` : les identifiants de cartes enregistrés ; rejouer le même `p_request` renvoie les mêmes cartes sans rien changer
  - Messages d'erreur : `pack_not_found`, `pack_already_opened`, `empty_pack`, `wrong_card_count`, `unknown_card`
- Produces (script) : `pnpm --filter @legendes/data build:cards` écrit `supabase/seed/20_cards.sql` ; `--check` échoue s'il est périmé.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20261007091000_game_cards.sql` :

```sql
-- Légendes du Dimanche — cards and pack openings (Phase 4, slice 1).
-- `card_defs` lists the cards that exist (public, filled by the seed); `card_items` are the cards a
-- player owns. A card's picture is never stored: it is recomputed from its id. Opening a pack is a
-- server-only write that checks the cards exist and is replayable by its request id.

create table public.card_defs (
  id text primary key check (id ~ '^.+-\d{4}-\d{2}-\d{2}(~[a-z-]+)?$'),
  player_id text not null,
  variant text not null check (variant in ('base', 'weekend', 'former-pro')),
  class text not null check (class in (
    'bronze-common', 'bronze-rare', 'silver-common', 'silver-rare',
    'gold-common', 'gold-rare', 'former-pro', 'weekend'
  )),
  rating smallint not null check (rating between 1 and 99),
  club_id text not null references public.clubs (id),
  position text not null
);
create index card_defs_club_idx on public.card_defs (club_id);
alter table public.card_defs enable row level security;
revoke all on public.card_defs from anon, authenticated;
grant select on public.card_defs to anon, authenticated;
create policy card_defs_select_all on public.card_defs for select to anon, authenticated using (true);

-- What was drawn for a pack, with its seed: any opening can be redrawn with `openPack` to audit it.
create table public.pack_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pack_id uuid not null unique references public.user_packs (id),
  type text not null,
  seed text not null,
  cards text[] not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
alter table public.pack_openings enable row level security;
revoke all on public.pack_openings from anon, authenticated;
grant select on public.pack_openings to authenticated;
create policy pack_openings_select_own on public.pack_openings
  for select to authenticated using (user_id = (select auth.uid()));

create table public.card_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null references public.card_defs (id),
  source text not null check (source in ('pack')),
  opening_id uuid references public.pack_openings (id),
  created_at timestamptz not null default now()
);
create index card_items_user_idx on public.card_items (user_id, created_at);
alter table public.card_items enable row level security;
revoke all on public.card_items from anon, authenticated;
grant select on public.card_items to authenticated;
create policy card_items_select_own on public.card_items
  for select to authenticated using (user_id = (select auth.uid()));

-- Opens a closed pack with the cards the server drew. Atomic: either every card is added and the
-- pack is marked open, or nothing changes. Asking again with the same request returns the cards
-- already recorded.
create function public.open_pack(
  p_user uuid, p_pack uuid, p_seed text, p_cards text[], p_request uuid
) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  pack public.user_packs;
  previous public.pack_openings;
  opening uuid;
  expected integer;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  select * into previous from public.pack_openings where user_id = p_user and request_id = p_request;
  if found then return previous.cards; end if;
  select * into pack from public.user_packs where id = p_pack and user_id = p_user;
  if not found then raise exception 'pack_not_found'; end if;
  if pack.opened_at is not null then raise exception 'pack_already_opened'; end if;
  if coalesce(array_length(p_cards, 1), 0) = 0 then raise exception 'empty_pack'; end if;
  expected := case pack.type when 'starter' then 18 else 12 end;
  if array_length(p_cards, 1) <> expected then raise exception 'wrong_card_count'; end if;
  if exists (
    select 1 from unnest(p_cards) as c (id)
    where not exists (select 1 from public.card_defs d where d.id = c.id)
  ) then
    raise exception 'unknown_card';
  end if;
  insert into public.pack_openings (user_id, pack_id, type, seed, cards, request_id)
  values (p_user, p_pack, pack.type, p_seed, p_cards, p_request) returning id into opening;
  insert into public.card_items (user_id, card_id, source, opening_id)
  select p_user, c.id, 'pack', opening from unnest(p_cards) as c (id);
  update public.user_packs set opened_at = now() where id = p_pack;
  return p_cards;
end $$;

revoke execute on function public.open_pack(uuid, uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.open_pack(uuid, uuid, text, text[], uuid) to service_role;
```

- [ ] **Step 2: Écrire le script de peuplement**

Créer `packages/data/scripts/build-card-seed.ts` :

```ts
// Writes the card definitions of the pilot for the database: ../../supabase/seed/20_cards.sql
// Run: pnpm --filter @legendes/data build:cards
// `--check` writes nothing and fails if the committed file is not what the generator produces
// (part of `pnpm test`, so CI catches a changed generator whose seed was not rebuilt).
import { readFileSync, writeFileSync } from 'node:fs';
import { allCardDefs, cardDefsSql } from '../src/card-defs.ts';

const target = new URL('../../../supabase/seed/20_cards.sql', import.meta.url);
const defs = allCardDefs();
const sql = cardDefsSql(defs);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing: reported below.
  }
  if (current !== sql) {
    console.error('Out of date: supabase/seed/20_cards.sql. Run: pnpm --filter @legendes/data build:cards');
    process.exit(1);
  }
  console.log(`Card seed is current (${defs.length} cards).`);
} else {
  writeFileSync(target, sql);
  console.log(`Card seed built: ${defs.length} cards.`);
}
```

Dans `packages/data/package.json`, remplacer les scripts `test` et `build:seed` par :

```json
    "test": "vitest run && node scripts/build-seed.ts --check && node scripts/build-card-seed.ts --check",
    "build:seed": "node scripts/build-seed.ts",
    "build:cards": "node scripts/build-card-seed.ts"
```

- [ ] **Step 3: Générer le seed, appliquer, régénérer les types**

Run: `pnpm --filter @legendes/data build:cards && pnpm db:reset && pnpm db:types`
Expected: « Card seed built: 9749 cards. » (le nombre doit rester celui du bilan de Phase 3), `db reset` sans erreur, types régénérés avec `card_items`, `open_pack`.

- [ ] **Step 4: Écrire les tests**

Créer `apps/web/test-db/packs.test.ts` :

```ts
import { allCardDefs, clubsOf, openPack, openStarterPack } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { admin, newGuest } from './harness.ts';

const request = (): string => crypto.randomUUID();
const club = clubsOf({ divisionId: 'escaut-d5' })[0]!;

/** A guest with 1 000 credits and a closed Bronze pack. */
async function guestWithBronzePack(): Promise<{ id: string; packId: string; cards: string[] }> {
  const { id } = await newGuest();
  await admin.rpc('claim_welcome', { p_user: id, p_amount: 1000 });
  const { data } = await admin.rpc('grant_pack', {
    p_user: id,
    p_type: 'bronze',
    p_source: 'shop',
    p_price: 400,
    p_request: request(),
  });
  return {
    id,
    packId: data as string,
    cards: openPack('bronze', 'test').cards.map((c) => c.card.id),
  };
}

async function itemCount(userId: string): Promise<number> {
  const { count } = await admin
    .from('card_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

describe('card definitions', () => {
  it('are in the database and readable by everybody', async () => {
    const { count } = await admin.from('card_defs').select('id', { count: 'exact', head: true });
    expect(count).toBe(allCardDefs().length);
    const guest = await newGuest();
    const { data } = await guest.client.from('card_defs').select('id').limit(1);
    expect(data).toHaveLength(1);
  });
});

describe('opening a pack', () => {
  it('records the cards, marks the pack open, and shows them to their owner only', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const opened = await admin.rpc('open_pack', {
      p_user: id,
      p_pack: packId,
      p_seed: 'test',
      p_cards: cards,
      p_request: request(),
    });
    expect(opened.error).toBeNull();
    expect(opened.data).toEqual(cards);
    expect(await itemCount(id)).toBe(12);
    const { data: pack } = await admin.from('user_packs').select('opened_at').eq('id', packId).single();
    expect(pack?.opened_at).not.toBeNull();
    const other = await newGuest();
    expect((await other.client.from('card_items').select('id')).data).toEqual([]);
  });

  it('opens a starter pack of 18 cards', async () => {
    const { id } = await newGuest();
    await admin.rpc('choose_club', { p_user: id, p_club: club.id });
    const { data: packId } = await admin.rpc('grant_pack', {
      p_user: id,
      p_type: 'starter',
      p_source: 'starter',
      p_price: 0,
    });
    const cards = openStarterPack(club, 'test').cards.map((c) => c.card.id);
    const opened = await admin.rpc('open_pack', {
      p_user: id,
      p_pack: packId as string,
      p_seed: 'test',
      p_cards: cards,
      p_request: request(),
    });
    expect(opened.error).toBeNull();
    expect(await itemCount(id)).toBe(18);
  });

  it('answers a replayed request with the same cards and adds nothing', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const args = { p_user: id, p_pack: packId, p_seed: 'test', p_cards: cards, p_request: request() };
    await admin.rpc('open_pack', args);
    const replay = await admin.rpc('open_pack', args);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(cards);
    expect(await itemCount(id)).toBe(12);
  });

  it('opens a pack once: two tabs at the same time, one wins', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const results = await Promise.all(
      [0, 1].map(() =>
        admin.rpc('open_pack', {
          p_user: id,
          p_pack: packId,
          p_seed: 'test',
          p_cards: cards,
          p_request: request(),
        }),
      ),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.message).toBe('pack_already_opened');
    expect(await itemCount(id)).toBe(12);
  });

  it('refuses a pack that is not the player\'s', async () => {
    const owner = await guestWithBronzePack();
    const thief = await newGuest();
    const stolen = await admin.rpc('open_pack', {
      p_user: thief.id,
      p_pack: owner.packId,
      p_seed: 'test',
      p_cards: owner.cards,
      p_request: request(),
    });
    expect(stolen.error?.message).toBe('pack_not_found');
    expect(await itemCount(thief.id)).toBe(0);
  });

  it('records nothing when one card of the draw does not exist', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const rotten = [...cards.slice(0, 11), 'nobody-2026-27-99'];
    const result = await admin.rpc('open_pack', {
      p_user: id,
      p_pack: packId,
      p_seed: 'test',
      p_cards: rotten,
      p_request: request(),
    });
    expect(result.error?.message).toBe('unknown_card');
    expect(await itemCount(id)).toBe(0);
    const { data: pack } = await admin.from('user_packs').select('opened_at').eq('id', packId).single();
    expect(pack?.opened_at).toBeNull();
  });

  it('refuses an empty draw and a draw of the wrong size', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const base = { p_user: id, p_pack: packId, p_seed: 'test', p_request: request() };
    expect((await admin.rpc('open_pack', { ...base, p_cards: [] })).error?.message).toBe('empty_pack');
    expect(
      (await admin.rpc('open_pack', { ...base, p_request: request(), p_cards: cards.slice(0, 3) }))
        .error?.message,
    ).toBe('wrong_card_count');
  });
});
```

- [ ] **Step 5: Lancer toute la suite de base**

Run: `pnpm --filter @legendes/web test:db`
Expected: PASS (tous les fichiers). Le premier test vérifie que le seed contient exactement `allCardDefs().length` lignes.

- [ ] **Step 6: Vérifier le tout et commiter**

Run: `pnpm check`
Expected: vert, y compris `build:cards --check`.

```bash
git add supabase packages/data packages/shared apps/web/test-db
git commit -m "feat(db): cards, pack openings and open_pack — atomic, replayable, service-role only"
```

---

### Task 6: Les modules serveur du jeu

**Files:**
- Create: `apps/web/src/server/game/errors.ts`, `apps/web/src/server/game/wallet.ts`, `apps/web/src/server/game/packs.ts`
- Test: `apps/web/src/server/game/errors.test.ts` (créé, tests unitaires) ; `apps/web/test-db/game-flow.test.ts` (créé)

**Interfaces:**
- Consumes: `Database` (`@legendes/shared`), `PACKS`, `PackType`, `openPack`, `openStarterPack`, `getClub` (`@legendes/data`), les fonctions SQL des tâches 3 et 5.
- Produces :
  - `type GameDb = SupabaseClient<Database>` (le client administrateur, injecté)
  - `GAME_ERROR_CODES`, `type GameErrorCode`, `class GameError extends Error { readonly code: GameErrorCode }`, `gameErrorFrom(error: { message: string }): GameError`
  - `WELCOME_CREDITS = 1000`, `claimWelcome(db, userId): Promise<number>`, `balanceOf(db, userId): Promise<number>`
  - `chooseClub(db, userId, clubId): Promise<string>` : choisit le club et accorde le pack de départ, renvoie l'id du pack ; idempotent
  - `buyPack(db, userId, type: PackType, requestId: string): Promise<string>`
  - `interface OpenedCards { readonly packId: string; readonly type: string; readonly cardIds: readonly string[] }`
  - `openUserPack(db, userId, packId, requestId): Promise<OpenedCards>`

- [ ] **Step 1: Écrire le test des erreurs (unitaire)**

Créer `apps/web/src/server/game/errors.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { GameError, gameErrorFrom } from './errors.ts';

describe('gameErrorFrom', () => {
  it('turns a database exception into a typed error', () => {
    const error = gameErrorFrom({ message: 'insufficient_funds' });
    expect(error).toBeInstanceOf(GameError);
    expect(error.code).toBe('insufficient_funds');
  });

  it('keeps unknown failures as unexpected, with their message', () => {
    const error = gameErrorFrom({ message: 'connection refused' });
    expect(error.code).toBe('unexpected');
    expect(error.message).toBe('connection refused');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter @legendes/web exec vitest run src/server/game/errors.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire les erreurs**

Créer `apps/web/src/server/game/errors.ts` :

```ts
// The failures the game's database functions raise on purpose (their exception message is the
// code), as typed errors the pages can turn into French messages.

export const GAME_ERROR_CODES = [
  'insufficient_funds',
  'pack_not_found',
  'pack_already_opened',
  'club_already_chosen',
  'club_not_eligible',
  'club_not_chosen',
  'unknown_card',
  'wrong_card_count',
  'empty_pack',
  'profile_not_found',
  'invalid_amount',
  'invalid_price',
  'invalid_pack',
  'unexpected',
] as const;
export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

/** A database error as a GameError: known exception messages keep their code. */
export function gameErrorFrom(error: { message: string }): GameError {
  const code = GAME_ERROR_CODES.find((c) => c !== 'unexpected' && c === error.message);
  return code ? new GameError(code) : new GameError('unexpected', error.message);
}
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `pnpm --filter @legendes/web exec vitest run src/server/game/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Écrire le portefeuille**

Créer `apps/web/src/server/game/wallet.ts` :

```ts
// The player's credits. The balance is the sum of the ledger: nothing here writes a balance.

import type { Database } from '@legendes/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { gameErrorFrom } from './errors.ts';

/** The service-role client (the server's own): it is passed in, never imported. */
export type GameDb = SupabaseClient<Database>;

/** Starting value, to balance with the economy simulator (GDD §9.2). */
export const WELCOME_CREDITS = 1000;

const credits = z.number().int();

/** Pays the welcome bonus once; returns the credits paid now (0 when already paid). */
export async function claimWelcome(db: GameDb, userId: string): Promise<number> {
  const { data, error } = await db.rpc('claim_welcome', {
    p_user: userId,
    p_amount: WELCOME_CREDITS,
  });
  if (error) throw gameErrorFrom(error);
  return credits.parse(data);
}

export async function balanceOf(db: GameDb, userId: string): Promise<number> {
  const { data, error } = await db
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw gameErrorFrom(error);
  return data?.balance ?? 0;
}
```

- [ ] **Step 6: Écrire les packs**

Créer `apps/web/src/server/game/packs.ts` :

```ts
// Packs: chosen club and starter pack, purchases, and opening. The draw happens here, on the
// server, with a seed the player never sees before the result; the database checks the cards
// exist and records the opening atomically (rule 2).

import { getClub, openPack, openStarterPack, PACKS, type PackType } from '@legendes/data';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { GameError, gameErrorFrom } from './errors.ts';
import type { GameDb } from './wallet.ts';

const uuid = z.string().uuid();
const cardIds = z.array(z.string().min(1));

/** Chooses the starting club and gives the starter pack. Safe to repeat: same club, same pack. */
export async function chooseClub(db: GameDb, userId: string, clubId: string): Promise<string> {
  const chosen = await db.rpc('choose_club', { p_user: userId, p_club: clubId });
  if (chosen.error) throw gameErrorFrom(chosen.error);
  const granted = await db.rpc('grant_pack', {
    p_user: userId,
    p_type: 'starter',
    p_source: 'starter',
    p_price: 0,
  });
  if (granted.error) throw gameErrorFrom(granted.error);
  return uuid.parse(granted.data);
}

/** Buys a pack with credits. The price is the game's, never the client's. */
export async function buyPack(
  db: GameDb,
  userId: string,
  type: PackType,
  requestId: string,
): Promise<string> {
  const { data, error } = await db.rpc('grant_pack', {
    p_user: userId,
    p_type: type,
    p_source: 'shop',
    p_price: PACKS[type].price,
    p_request: requestId,
  });
  if (error) throw gameErrorFrom(error);
  return uuid.parse(data);
}

export interface OpenedCards {
  readonly packId: string;
  readonly type: string;
  /** Card ids, the least valuable first (the picture of each is recomputed from its id). */
  readonly cardIds: readonly string[];
}

/** Opens a closed pack. Repeating the same request returns the cards already recorded. */
export async function openUserPack(
  db: GameDb,
  userId: string,
  packId: string,
  requestId: string,
): Promise<OpenedCards> {
  const found = await db
    .from('user_packs')
    .select('type')
    .eq('id', packId)
    .eq('user_id', userId)
    .maybeSingle();
  if (found.error) throw gameErrorFrom(found.error);
  if (!found.data) throw new GameError('pack_not_found');
  const type = found.data.type;

  const seed = randomBytes(12).toString('hex');
  const cards = await draw(db, userId, type, seed);
  const { data, error } = await db.rpc('open_pack', {
    p_user: userId,
    p_pack: packId,
    p_seed: seed,
    p_cards: cards,
    p_request: requestId,
  });
  if (error) throw gameErrorFrom(error);
  return { packId, type, cardIds: cardIds.parse(data) };
}

async function draw(db: GameDb, userId: string, type: string, seed: string): Promise<string[]> {
  if (type === 'starter') {
    const profile = await db.from('profiles').select('club_id').eq('id', userId).maybeSingle();
    if (profile.error) throw gameErrorFrom(profile.error);
    const club = getClub(profile.data?.club_id ?? '');
    if (!club) throw new GameError('club_not_chosen');
    return openStarterPack(club, seed).cards.map((c) => c.card.id);
  }
  if (!(type in PACKS)) throw new GameError('invalid_pack');
  return openPack(type as PackType, seed).cards.map((c) => c.card.id);
}
```

- [ ] **Step 7: Écrire le test du parcours complet**

Créer `apps/web/test-db/game-flow.test.ts` :

```ts
import { clubsOf, findCard } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { GameError } from '@/server/game/errors.ts';
import { buyPack, chooseClub, openUserPack } from '@/server/game/packs.ts';
import { balanceOf, claimWelcome } from '@/server/game/wallet.ts';
import { admin, newGuest } from './harness.ts';

const club = clubsOf({ divisionId: 'escaut-d5' })[0]!;
const otherClub = clubsOf({ divisionId: 'escaut-d5' })[1]!;

async function itemCount(userId: string): Promise<number> {
  const { count } = await admin
    .from('card_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

describe('the first minutes of a new player', () => {
  it('welcome, club, starter pack, purchase, second pack', async () => {
    const { id } = await newGuest();
    expect(await claimWelcome(admin, id)).toBe(1000);
    expect(await claimWelcome(admin, id)).toBe(0);

    const starterId = await chooseClub(admin, id, club.id);
    // Asking again after a lost answer gives the same pack.
    expect(await chooseClub(admin, id, club.id)).toBe(starterId);
    await expect(chooseClub(admin, id, otherClub.id)).rejects.toMatchObject({
      code: 'club_already_chosen',
    });

    const starter = await openUserPack(admin, id, starterId, crypto.randomUUID());
    expect(starter.type).toBe('starter');
    expect(starter.cardIds).toHaveLength(18);
    expect(starter.cardIds.filter((c) => c.startsWith(`${club.id}-`))).toHaveLength(11);
    for (const cardId of starter.cardIds) expect(findCard(cardId), cardId).not.toBeNull();
    expect(await itemCount(id)).toBe(18);

    const request = crypto.randomUUID();
    const bronzeId = await buyPack(admin, id, 'bronze', request);
    expect(await buyPack(admin, id, 'bronze', request)).toBe(bronzeId);
    expect(await balanceOf(admin, id)).toBe(600);

    const bronze = await openUserPack(admin, id, bronzeId, crypto.randomUUID());
    expect(bronze.cardIds).toHaveLength(12);
    expect(await itemCount(id)).toBe(30);
  });

  it('answers a replayed opening with the same cards, and refuses a second opening', async () => {
    const { id } = await newGuest();
    await claimWelcome(admin, id);
    const packId = await buyPack(admin, id, 'bronze', crypto.randomUUID());
    const request = crypto.randomUUID();
    const first = await openUserPack(admin, id, packId, request);
    const replay = await openUserPack(admin, id, packId, request);
    expect(replay.cardIds).toEqual(first.cardIds);
    expect(await itemCount(id)).toBe(12);
    await expect(openUserPack(admin, id, packId, crypto.randomUUID())).rejects.toMatchObject({
      code: 'pack_already_opened',
    });
  });

  it('cannot buy a pack without the credits, and cannot open another player\'s pack', async () => {
    const broke = await newGuest();
    await expect(buyPack(admin, broke.id, 'gold', crypto.randomUUID())).rejects.toBeInstanceOf(
      GameError,
    );
    await expect(buyPack(admin, broke.id, 'gold', crypto.randomUUID())).rejects.toMatchObject({
      code: 'insufficient_funds',
    });
    const owner = await newGuest();
    await claimWelcome(admin, owner.id);
    const packId = await buyPack(admin, owner.id, 'bronze', crypto.randomUUID());
    await expect(
      openUserPack(admin, broke.id, packId, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'pack_not_found' });
  });
});
```

- [ ] **Step 8: Lancer les tests**

Run: `pnpm --filter @legendes/web test:db`
Expected: PASS (toute la suite de base, dont `game-flow`).

- [ ] **Step 9: Vérifier et commiter**

Run: `pnpm check`
Expected: vert.

```bash
git add apps/web/src/server apps/web/test-db
git commit -m "feat(web): server game modules — welcome, club choice, purchases, pack opening"
```

---

### Task 7: Documentation et clôture du plan A

**Files:**
- Modify: `docs/DECISIONS.md`, `CLAUDE.md`, `docs/ROADMAP.md`

- [ ] **Step 1: Consigner la décision**

Ajouter à la fin de `docs/DECISIONS.md` (numéro suivant D-040 : D-041) :

```markdown
## D-041 — Le socle serveur du jeu (Phase 4, plan A)

- **Écrire = le serveur seul** (règle 2). Aucun joueur, invité compris, n'a de règle d'insertion, de modification ou de suppression ; la sécurité par ligne ne lui laisse que la lecture de **ses** lignes. Toute écriture passe par une fonction `SECURITY DEFINER` dont l'exécution est retirée à `public`, `anon` et `authenticated` et accordée à `service_role` seul : `claim_welcome`, `choose_club`, `grant_pack`, `open_pack`. Un test le vérifie (appel refusé, insertions refusées, lignes d'autrui invisibles).
- **Grand livre en ajout seul** (`credit_ledger`, mises à jour interdites par déclencheur) : le solde est la somme (`wallet_balances`). `grant_pack` verrouille la ligne du profil avant de lire le solde : dix achats simultanés avec un solde pour deux n'en laissent passer que deux.
- **Acheter ou gagner, puis ouvrir** : `user_packs` est l'inventaire de packs fermés ; `open_pack` fait le tirage enregistré en une transaction (cartes vérifiées dans `card_defs`, exemplaires ajoutés, journal `pack_openings` avec la **graine**, pack marqué ouvert). Un même `request_id` renvoie le même résultat ; deux onglets ne peuvent ouvrir un pack qu'une fois. Un tirage est rejouable avec `openPack(type, graine)` : c'est l'audit.
- **Le tirage reste en TypeScript** (une seule définition des probabilités, déjà testée) : le serveur Next.js tire la graine (`crypto.randomBytes`), appelle `openPack` ou `openStarterPack`, puis la base valide et enregistre. Le prix d'un pack vient de `PACKS`, jamais du client.
- **Les cartes possédées sont des références** : `card_defs` (9 749 lignes générées par `build:cards`, vérifiées par `--check` en CI) dit quelles cartes existent ; l'image se recalcule depuis l'identifiant (`findCard`).
- **Pack de départ** (`openStarterPack`) : 18 cartes dont 11 du club choisi (un club de District 5), 7 d'autres clubs du district, 2 gardiens, 6 défenseurs, 6 milieux, 4 attaquants, bronze et au plus 2 argent, ni or ni promo.
- **Invités** : connexions anonymes activées ; le profil est créé par déclencheur ; l'amélioration vers un e-mail garde l'identifiant. Limites de débit et captcha à prévoir avant l'ouverture publique.
- **Tests** : `pnpm --filter @legendes/web test:db` (Supabase local, Docker) ; pas encore dans la CI (plan C).
```

- [ ] **Step 2: Mettre à jour CLAUDE.md**

Dans la section « Commandes » de `CLAUDE.md`, ajouter après la ligne `pnpm db:start|stop|reset` :

```markdown
- `pnpm --filter @legendes/web test:db` : tests de la base contre Supabase local (Docker requis ; lit `apps/web/.env.local`) · `pnpm --filter @legendes/data build:cards` : régénère `supabase/seed/20_cards.sql` · `pnpm db:types` : régénère les types de la base
```

Dans la ligne « Phase en cours », ajouter à la fin : « Tranche fine validée (`docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md`) ; plan A (socle serveur) fait : profils, grand livre, packs et cartes en base, écrits par le serveur seul. »

- [ ] **Step 3: Cocher dans le ROADMAP**

Dans `docs/ROADMAP.md`, sous le paragraphe « Construction : tranche fine… » de la Phase 4, ajouter :

```markdown
> Avancement : ✅ plan A — socle serveur (profils, grand livre, packs et cartes en base ; modules serveur). À venir : plan B (coque, accueil, pack de départ à l'écran), plan C (match, objectifs, boutique, bout en bout).
```

- [ ] **Step 4: Vérifier et commiter**

Run: `pnpm check && pnpm --filter @legendes/web test:db`
Expected: tout vert.

```bash
git add docs CLAUDE.md
git commit -m "docs: D-041 — the server core of the game, and the Phase 4 progress"
```

---

## Self-Review

**Couverture de la spec (sections 5, 6, 7, 9, 10, 11) :**
- §5 tables `profiles`, `credit_ledger`, `card_defs`, `card_items`, `user_packs`, `pack_openings` : tâches 3 et 5. `matches`, `objective_defs`, `user_objectives` : **plan C** (volontairement hors de ce plan, annoncé en tête).
- §5 « Qui écrit quoi » (RLS, `EXECUTE` retiré, verrou du profil, bienvenue idempotente) : tâche 3, tests `security` et `wallet`. `create_match`, `record_match`, `advance_objective` : plan C.
- §5 packs en deux actions (`grant_pack`, `open_pack`) et `request_id` : tâches 3 et 5.
- §5 invités : connexion anonyme (tâche 2). Rattachement à un e-mail magique : écran du plan B.
- §6 pack de départ : tâche 1 (composition, postes, au plus 2 argent, pas d'or ni de promo, déterminisme). L'affichage de la composition au lieu des probabilités est une chose d'écran : plan B.
- §7 objectifs : plan C.
- §9 structure du code : `server/game/*` (tâche 6), `scripts/build-card-seed.ts` (tâche 5), `lib/supabase/*` : plan B (client navigateur et serveur avec cookies de session).
- §10 erreurs typées : tâche 6 (`GameError`) ; les messages français : plan B.
- §11 tests unitaires du pack de départ, sécurité en base, concurrence : tâches 1, 3, 5, 6. Match truqué, bout en bout Playwright, job CI : plan C.

**Placeholders :** aucun « TBD » ; chaque étape de code montre le code. Les seules valeurs « à équilibrer » (1 000 CR, 400 CR) sont des constantes explicites.

**Cohérence des types :** `grant_pack` renvoie un `uuid` (chaîne) utilisé tel quel par `buyPack`/`chooseClub` ; `open_pack` renvoie `text[]` lu comme `string[]` ; `OpenedCards.cardIds` ; les noms de fonctions SQL (`claim_welcome`, `choose_club`, `grant_pack`, `open_pack`) et leurs paramètres (`p_user`, `p_club`, `p_type`, `p_source`, `p_price`, `p_request`, `p_pack`, `p_seed`, `p_cards`) sont identiques dans la migration, les tests et les modules serveur ; `PackType`/`PACKS` viennent de `@legendes/data`.

**Revue ciblée (Review Focus) :** 1. deux onglets sur un même pack → test « two tabs at the same time, one wins » (tâche 5) ; 2. bienvenue en double → « five tabs » (tâche 3) ; 3. choix du club rejoué → tâches 3 (`choose_club`) et 6 (`chooseClub` deux fois) ; 4. lecture des lignes d'autrui → `security.test.ts` (tâche 3) et lecture des exemplaires (tâche 5) ; 5. carte inconnue → « records nothing » (tâche 5).

**Points à surveiller à l'exécution :**
- Le seed `20_cards.sql` pèse environ 1 Mo : `db reset` reste rapide, mais ne pas l'éditer à la main.
- Le nombre exact de cartes (9 749) est celui du bilan de Phase 3 ; s'il diffère, c'est le générateur qui fait foi (le test compare la base à `allCardDefs()`).
- Après `db:stop`/`db:start`, les clés locales peuvent changer : les recopier dans `apps/web/.env.local`.
