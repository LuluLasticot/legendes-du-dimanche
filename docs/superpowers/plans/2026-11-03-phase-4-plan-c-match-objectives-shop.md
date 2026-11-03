# Phase 4 — Plan C : le match, les objectifs, la boutique et le bout en bout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer la boucle de la tranche fine. Le joueur joue un premier match guidé avec son onze, reçoit des crédits calculés sur le match **rejoué par le serveur**, avance Les Fondations (packs et crédits), ouvre ses packs, en achète à la boutique (probabilités affichées) et voit son record. Un e2e Playwright parcourt l'arrivée jusqu'à la première récompense, et la CI démarre Supabase local.

**Architecture:** Trois migrations de plus : matchs, objectifs, onze enregistré. Toutes les écritures passent par des fonctions `SECURITY DEFINER` réservées à `service_role`, comme au plan A. Le serveur Next.js fige le match (`MatchSetup` en JSON), le client le joue avec l'écran de match existant, puis renvoie ses **entrées** et le score annoncé. Le serveur rejoue avec `replayMatch` : la récompense se calcule sur le rejeu, et un score qui diffère fait rejeter le match. Les objectifs sont des lignes (`objective_defs`), avancés par une fonction idempotente.

**Tech Stack:** PostgreSQL 17 (Supabase local), Next.js 16 (Server Actions), React 19, `@legendes/engine` (`MatchSim`, `replayMatch`), Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md` (§3 étapes 5-6, §7, §8, §10, §11) ; décisions D-041 et D-042.

## Global Constraints

- Code, identifiants, commentaires, commits en **anglais** ; textes vus par le joueur en **français** dans `apps/web/messages/fr.json`.
- TypeScript `strict`, **pas de `any`** ; **Zod à chaque frontière** : entrées des Server Actions, JSON lu en base (`setup`, `options`).
- Lire le guide Next 16 concerné dans `apps/web/node_modules/next/dist/docs/` avant le code Next. Une erreur levée dans une Server Action est masquée en production : **renvoyer des codes** (comme `openStarter`).
- **Règle 2** :
  - toute fonction d'écriture a son `EXECUTE` retiré à `public`, `anon` et `authenticated`, et accordé à `service_role` seul ;
  - RLS sur chaque table, lecture de ses propres lignes seulement ;
  - le prix d'un pack vient de `PACKS`, la récompense d'un match du rejeu, **jamais du client**.
- **Règle 5** : la boutique affiche les probabilités (`packOdds`) avant l'achat ; aucun argent réel.
- **Règle 4** : aucun nom de la marque d'origine.
- `packages/engine` **n'est pas modifié** (déterminisme, empreinte de référence).
- **Barème de départ** (GDD §9.2, à équilibrer) :
  - victoire 300 CR en District, 600 en Régional, 900 en National ;
  - nul 50 %, défaite 25 % ;
  - +25 CR par action clé réussie.
- **Fondations :**
  - jouer un match → Pack Bronze ;
  - composer l'équipe → 300 CR ;
  - ouvrir un pack (autre que celui de départ) → Pack Bronze.
- Branche `feat/match-loop`, créée depuis `feat/game-shell` (PR #47). `pnpm check` vert à chaque tâche ; `pnpm --filter @legendes/web test:db` vert aux tâches base.
- Commits conventionnels, terminés par la ligne d'attribution de la session.
- **Hors plan :** objectifs du jour et de la semaine (les tables les permettent, aucune ligne), calendrier de championnat, rattachement à un e-mail, captcha, mise en ligne Supabase hébergé.

## Review Focus

1. **Un client renvoie « but » à chaque action clé**, ou un score qui n'est pas celui du rejeu. Le score gonflé est rejeté. Les issues « but » sont acceptées si elles sont bien formées : la validation fine de la cadence est hors tranche (spec §12). Test : tâche 3.
2. **Le même match validé deux fois** (double clic, deux onglets) : un seul crédit, la même réponse. Test : tâches 1 et 3.
3. **Un objectif déclenché deux fois** (deux matchs, deux packs) : une seule récompense. Test : tâche 1.
4. **Un onze enregistré avec une carte qu'on ne possède pas**, ou incomplet : refusé. Test : tâche 1.
5. **Un achat sans assez de crédits**, ou un double clic sur « Acheter » : message clair, un seul débit. Test : tâche 6 (même `request_id`) et plan A.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261103090000_game_loop.sql` | `matches`, `objective_defs` (+ lignes des Fondations), `user_objectives`, `user_squads` ; `create_match`, `record_match`, `advance_objective`, `save_squad`. |
| `packages/data/src/team/match-team.ts` (+ test) | `toMatchTeamFromSheet` : le onze d'un joueur en équipe du moteur. |
| `apps/web/src/server/game/matches.ts` (+ test db) | `startMatch`, `finishMatch`, `matchReward`, `guidedSeed`. |
| `apps/web/src/server/game/objectives.ts` | `listObjectives`, `advanceObjective`. |
| `apps/web/src/server/game/squads.ts` | `saveSquad`, `savedSheet`. |
| `apps/web/src/components/match/match-screen.tsx` | Mode « jeu » : match donné, fin rendue à l'appelant. |
| `apps/web/src/app/jouer/match/page.tsx`, `components/game/game-match.tsx` | Le match du joueur, puis sa récompense. |
| `apps/web/src/app/jouer/ouvrir/[pack]/page.tsx`, `components/game/pack-open.tsx` | Ouvrir un pack de l'inventaire. |
| `apps/web/src/app/jouer/(jeu)/boutique/page.tsx` | Packs, prix, probabilités, achat. |
| `apps/web/e2e/game.spec.ts`, `.github/workflows/ci.yml` | Bout en bout avec Supabase local, en CI. |

---

### Task 1: Matchs, objectifs et onze enregistré en base

**Files:**
- Create: `supabase/migrations/20261103090000_game_loop.sql`, `apps/web/test-db/loop.test.ts`
- Modify: `apps/web/src/server/game/errors.ts` (codes), `packages/shared/src/db/database.types.ts` (`pnpm db:types`)

**Interfaces — produces (SQL, service_role only):**
- `create_match(p_user uuid, p_seed integer, p_setup jsonb, p_options jsonb, p_request uuid) returns uuid` ; même requête, même match.
- `record_match(p_user uuid, p_match uuid, p_valid boolean, p_score integer[], p_moments_won integer, p_reward integer) returns integer` :
  - crédits payés maintenant ;
  - 0 s'il est rejeté ou déjà enregistré ;
  - erreurs `match_not_found`.
- `advance_objective(p_user uuid, p_condition text) returns integer` : le nombre d'objectifs complétés maintenant.
- `save_squad(p_user uuid, p_formation text, p_lineup text[]) returns void` ; erreurs `squad_incomplete`, `card_not_owned`.
- Nouveaux codes `GameErrorCode` : `match_not_found`, `match_rejected`, `squad_incomplete`, `card_not_owned` (+ messages français, tâche 4).

- [ ] **Step 1: Failing database tests** — `apps/web/test-db/loop.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { admin, newGuest } from './harness.ts';

const request = (): string => crypto.randomUUID();
const setup = { seed: 1 };
const options = { userSide: 0, pauseAtHalfTime: true };

async function playing(): Promise<{ id: string; client: Awaited<ReturnType<typeof newGuest>>['client']; cards: string[] }> {
  const g = await newGuest();
  const club = (await admin.from('clubs').select('id').limit(1).single()).data!.id;
  const pack = (await admin.rpc('choose_club', { p_user: g.id, p_club: club })).data!;
  const defs = (await admin.from('card_defs').select('id').limit(18)).data!.map((c) => c.id);
  await admin.rpc('open_pack', { p_user: g.id, p_pack: pack, p_seed: 's', p_cards: defs, p_request: pack });
  return { ...g, cards: defs };
}

describe('matches', () => {
  it('records a match once: one credit line, the same answer again', async () => {
    const g = await playing();
    const match = (await admin.rpc('create_match', { p_user: g.id, p_seed: 7, p_setup: setup, p_options: options, p_request: request() })).data!;
    const args = { p_user: g.id, p_match: match, p_valid: true, p_score: [2, 1], p_moments_won: 2, p_reward: 350 };
    expect((await admin.rpc('record_match', args)).data).toBe(350);
    expect((await admin.rpc('record_match', args)).data).toBe(0);
    const lines = await admin.from('credit_ledger').select('delta').eq('user_id', g.id).eq('reason', 'match');
    expect(lines.data).toEqual([{ delta: 350 }]);
    const row = await g.client.from('matches').select('status, reward').eq('id', match).single();
    expect(row.data).toEqual({ status: 'validated', reward: 350 });
  });

  it('pays nothing for a rejected match', async () => {
    const g = await playing();
    const match = (await admin.rpc('create_match', { p_user: g.id, p_seed: 7, p_setup: setup, p_options: options, p_request: request() })).data!;
    expect((await admin.rpc('record_match', { p_user: g.id, p_match: match, p_valid: false, p_score: [9, 0], p_moments_won: 9, p_reward: 9999 })).data).toBe(0);
    expect((await g.client.from('matches').select('status').eq('id', match).single()).data?.status).toBe('rejected');
  });

  it('refuses a client calling the writes', async () => {
    const g = await playing();
    const { error } = await g.client.rpc('create_match', { p_user: g.id, p_seed: 1, p_setup: setup, p_options: options, p_request: request() });
    expect(error).not.toBeNull();
    expect((await g.client.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' })).error).not.toBeNull();
  });
});

describe('objectives', () => {
  it('rewards the first match once with a bronze pack', async () => {
    const g = await playing();
    expect((await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' })).data).toBe(1);
    expect((await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' })).data).toBe(0);
    const packs = await admin.from('user_packs').select('type').eq('user_id', g.id).eq('source', 'objective');
    expect(packs.data).toEqual([{ type: 'bronze' }]);
  });

  it('pays the squad objective in credits', async () => {
    const g = await playing();
    await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'squad_saved' });
    const lines = await admin.from('credit_ledger').select('delta').eq('user_id', g.id).eq('reason', 'objective');
    expect(lines.data).toEqual([{ delta: 300 }]);
  });
});

describe('the saved squad', () => {
  it('takes eleven owned cards and completes the squad objective', async () => {
    const g = await playing();
    const { error } = await admin.rpc('save_squad', { p_user: g.id, p_formation: '4-3-3', p_lineup: g.cards.slice(0, 11) });
    expect(error).toBeNull();
    expect((await g.client.from('user_objectives').select('objective_id')).data).toEqual([{ objective_id: 'foundations-squad' }]);
  });

  it('refuses a card not owned, or fewer than eleven', async () => {
    const g = await playing();
    const other = (await admin.from('card_defs').select('id').range(500, 500).single()).data!.id;
    const bad = await admin.rpc('save_squad', { p_user: g.id, p_formation: '4-3-3', p_lineup: [...g.cards.slice(0, 10), other] });
    expect(bad.error?.message).toBe('card_not_owned');
    const short = await admin.rpc('save_squad', { p_user: g.id, p_formation: '4-3-3', p_lineup: g.cards.slice(0, 10) });
    expect(short.error?.message).toBe('squad_incomplete');
  });
});
```

Run: `pnpm --filter @legendes/web test:db` — Expected: FAIL (functions and tables missing; the typed client may need `pnpm db:types` after Step 3, so first run fails at compile or on `PGRST202`).

- [ ] **Step 2: The migration** — `pnpm db:new game_loop` then rename to `20261103090000_game_loop.sql`:

```sql
-- Légendes du Dimanche — the game loop (Phase 4, plan C): matches checked by replay, objectives,
-- the saved eleven. Same rule as before: a player reads his own rows, the server writes.

-- ─── Matches ─────────────────────────────────────────────────────────────────────────────────
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed integer not null,
  setup jsonb not null,
  options jsonb not null,
  status text not null default 'created' check (status in ('created', 'validated', 'rejected')),
  score integer[] check (score is null or array_length(score, 1) = 2),
  moments_won integer check (moments_won is null or moments_won >= 0),
  reward integer check (reward is null or reward >= 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, request_id)
);
create index matches_user_idx on public.matches (user_id, created_at);
alter table public.matches enable row level security;
revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;
create policy matches_select_own on public.matches
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Objectives ──────────────────────────────────────────────────────────────────────────────
create table public.objective_defs (
  id text primary key,
  chain text not null,
  position integer not null,
  condition text not null check (condition in ('match_played', 'squad_saved', 'pack_opened')),
  reward_pack text check (reward_pack in ('bronze', 'silver', 'gold', 'gold-premium')),
  reward_credits integer check (reward_credits > 0),
  check ((reward_pack is null) <> (reward_credits is null)),
  unique (chain, position)
);
alter table public.objective_defs enable row level security;
revoke all on public.objective_defs from anon, authenticated;
grant select on public.objective_defs to anon, authenticated;
create policy objective_defs_read on public.objective_defs for select using (true);

-- Les Fondations of the slice (starting values, to balance with packages/economy).
insert into public.objective_defs (id, chain, position, condition, reward_pack, reward_credits) values
  ('foundations-match', 'foundations', 1, 'match_played', 'bronze', null),
  ('foundations-squad', 'foundations', 2, 'squad_saved', null, 300),
  ('foundations-open', 'foundations', 3, 'pack_opened', 'bronze', null);

create table public.user_objectives (
  user_id uuid not null references public.profiles (id) on delete cascade,
  objective_id text not null references public.objective_defs (id),
  completed_at timestamptz not null default now(),
  primary key (user_id, objective_id)
);
alter table public.user_objectives enable row level security;
revoke all on public.user_objectives from anon, authenticated;
grant select on public.user_objectives to authenticated;
create policy user_objectives_select_own on public.user_objectives
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── The saved eleven ────────────────────────────────────────────────────────────────────────
create table public.user_squads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  formation text not null,
  lineup text[] not null check (array_length(lineup, 1) = 11),
  updated_at timestamptz not null default now()
);
alter table public.user_squads enable row level security;
revoke all on public.user_squads from anon, authenticated;
grant select on public.user_squads to authenticated;
create policy user_squads_select_own on public.user_squads
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Writes: service role only ───────────────────────────────────────────────────────────────

-- Completes every objective with this condition the player has not done yet, and pays it.
create function public.advance_objective(p_user uuid, p_condition text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  done integer := 0;
  inserted integer;
begin
  for d in select * from public.objective_defs where condition = p_condition order by chain, position loop
    insert into public.user_objectives (user_id, objective_id) values (p_user, d.id)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then continue; end if;
    done := done + 1;
    if d.reward_pack is not null then
      insert into public.user_packs (user_id, type, source) values (p_user, d.reward_pack, 'objective');
    else
      insert into public.credit_ledger (user_id, delta, reason, ref)
      values (p_user, d.reward_credits, 'objective', d.id);
    end if;
  end loop;
  return done;
end $$;

-- A match frozen by the server before it is played. Asking again with the same request returns it.
create function public.create_match(
  p_user uuid, p_seed integer, p_setup jsonb, p_options jsonb, p_request uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  id uuid;
begin
  if not exists (select 1 from public.profiles where profiles.id = p_user) then
    raise exception 'profile_not_found';
  end if;
  insert into public.matches (user_id, seed, setup, options, request_id)
  values (p_user, p_seed, p_setup, p_options, p_request)
  on conflict (user_id, request_id) do nothing
  returning matches.id into id;
  if id is null then
    select matches.id into id from public.matches where user_id = p_user and request_id = p_request;
  end if;
  return id;
end $$;

-- The server's verdict on a played match (the replay is done in TypeScript): a valid match pays
-- its reward once and counts for the objectives; a rejected one pays nothing.
create function public.record_match(
  p_user uuid, p_match uuid, p_valid boolean, p_score integer[], p_moments_won integer, p_reward integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  select * into m from public.matches where id = p_match and user_id = p_user for update;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'created' then return 0; end if;
  if not p_valid then
    update public.matches set status = 'rejected', finished_at = now() where id = p_match;
    return 0;
  end if;
  if p_reward < 0 then raise exception 'invalid_amount'; end if;
  update public.matches
  set status = 'validated', score = p_score, moments_won = p_moments_won, reward = p_reward,
      finished_at = now()
  where id = p_match;
  if p_reward > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user, p_reward, 'match', p_match::text);
  end if;
  perform public.advance_objective(p_user, 'match_played');
  return p_reward;
end $$;

-- The player's eleven: eleven cards he owns, in the formation's order.
create function public.save_squad(p_user uuid, p_formation text, p_lineup text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(array_length(p_lineup, 1), 0) <> 11 then raise exception 'squad_incomplete'; end if;
  if exists (
    select 1 from unnest(p_lineup) as l(card_id)
    where not exists (
      select 1 from public.card_items i where i.user_id = p_user and i.card_id = l.card_id
    )
  ) then
    raise exception 'card_not_owned';
  end if;
  insert into public.user_squads (user_id, formation, lineup) values (p_user, p_formation, p_lineup)
  on conflict (user_id) do update set formation = excluded.formation, lineup = excluded.lineup,
    updated_at = now();
  perform public.advance_objective(p_user, 'squad_saved');
end $$;

revoke execute on function
  public.advance_objective(uuid, text),
  public.create_match(uuid, integer, jsonb, jsonb, uuid),
  public.record_match(uuid, uuid, boolean, integer[], integer, integer),
  public.save_squad(uuid, text, text[])
from public, anon, authenticated;
grant execute on function
  public.advance_objective(uuid, text),
  public.create_match(uuid, integer, jsonb, jsonb, uuid),
  public.record_match(uuid, uuid, boolean, integer[], integer, integer),
  public.save_squad(uuid, text, text[])
to service_role;
```

- [ ] **Step 3:** `pnpm db:reset`, reload the API cache (`docker exec supabase_db_legendes-du-dimanche psql -U postgres -c "notify pgrst, 'reload schema'"`), `pnpm db:types`. Add the four codes to `GAME_ERROR_CODES`. Run `pnpm --filter @legendes/web test:db` — Expected: PASS (30 + 7).
- [ ] **Step 4:** `pnpm check`, commit — `feat(db): matches checked by replay, objectives and the saved eleven (service-role writes only)`.

---

### Task 2: Le onze d'un joueur, en équipe du moteur

**Files:**
- Create: `packages/data/src/team/match-team.ts`, `packages/data/test/match-team.test.ts`
- Modify: `packages/data/src/team/index.ts`

**Interfaces:**
- Produces: `toMatchTeamFromSheet(club: Club, sheet: TeamSheet, options?: { kit?: KitSpec; tactic?: Tactic }): MatchTeam`. Il lève une erreur si un poste du onze est vide. `players` contient le onze puis le banc, avec `toMatchPlayer(card.player, card.club)` ; `lineup` suit l'ordre des postes de la formation ; `bench` est le banc (7 au plus) ; `name`, `id` et les couleurs sont ceux du club du joueur.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { simulateMatch } from '@legendes/engine/sim';
import { bestSquad, generateSquad, openStarterPack, toMatchTeam, toMatchTeamFromSheet, WORLD } from '../src/index.ts';

const club = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5')!;
const rival = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5' && c.id !== club.id)!;

describe('the player eleven as a match team', () => {
  it('lines up the sheet in order, with its bench, and plays a whole match', () => {
    const sheet = bestSquad(openStarterPack(club, 'mt').cards);
    const team = toMatchTeamFromSheet(club, sheet);
    expect(team.formation).toBe(sheet.formation);
    expect(team.lineup).toEqual(sheet.slots.map((s) => s.card!.card.player.id));
    expect(team.bench).toEqual(sheet.bench.map((c) => c.card.player.id));
    const result = simulateMatch({
      seed: 3,
      home: team,
      away: toMatchTeam(rival, generateSquad(rival)),
      conditions: { surface: 'grass', rain: false, windSpeed: 0, windDirection: 0 },
    });
    expect(result.duration).toBeGreaterThan(80 * 60);
  });

  it('refuses an eleven with an empty slot', () => {
    const sheet = bestSquad(openStarterPack(club, 'mt').cards.slice(0, 6));
    expect(() => toMatchTeamFromSheet(club, sheet)).toThrow();
  });
});
```

Run `cd packages/data && npx vitest run test/match-team.test.ts` — FAIL (not exported).

- [ ] **Step 2: Implement**

```ts
// packages/data/src/team/match-team.ts
// The player's eleven (a TeamSheet of owned cards, from any club) as the engine plays it.

import { DEFAULT_TACTIC, type MatchTeam, type Tactic } from '@legendes/engine/sim';
import { pickInk } from '../identity/colour.ts';
import { kitsOf, type KitSpec } from '../identity/kit.ts';
import type { Club } from '../schema.ts';
import { toMatchPlayer } from '../squad/bridge.ts';
import type { TeamSheet } from './auto-squad.ts';

export function toMatchTeamFromSheet(
  club: Club,
  sheet: TeamSheet,
  options: { kit?: KitSpec; tactic?: Tactic } = {},
): MatchTeam {
  const eleven = sheet.slots.map((s) => {
    if (!s.card) throw new Error(`Empty slot ${s.position}: the eleven is not complete`);
    return s.card;
  });
  const cards = [...eleven, ...sheet.bench];
  return {
    id: club.id,
    name: club.name,
    colours: coloursOfKit(options.kit ?? kitsOf(club).home),
    formation: sheet.formation,
    lineup: eleven.map((c) => c.card.player.id),
    bench: sheet.bench.map((c) => c.card.player.id),
    players: cards.map((c) => toMatchPlayer(c.card.player, c.club)),
    tactic: options.tactic ?? DEFAULT_TACTIC,
  };
}
```

Reuse the exact colour mapping of `toMatchTeam` (`coloursOf` in `squad/bridge.ts`): export it from there and import it instead of the `coloursOfKit` placeholder name above, and drop the `pickInk` import if unused. Run — PASS. `pnpm check`, commit — `feat(data): the player's eleven as a match team`.

---

### Task 3: Démarrer et valider un match côté serveur

**Files:**
- Create: `apps/web/src/server/game/matches.ts`, `apps/web/src/server/game/squads.ts`, `apps/web/src/server/game/objectives.ts`, `apps/web/src/server/game/matches.test.ts`, `apps/web/test-db/matches.test.ts`

**Interfaces:**
- Consumes: `create_match`, `record_match`, `save_squad`, `advance_objective` (tâche 1) ; `toMatchTeamFromSheet` (tâche 2) ; `bestSquad`, `autoSquad`, `cardsOf`, `matchKits`, `getDivision`.
- Produces:
  - `matchReward(level: CompetitionLevel, score: readonly [number, number], momentsWon: number): number` (pure)
  - `momentsWon(result: MatchResult, played: readonly PlayedMoment[]): number` (pure : issues réussies pour le côté du joueur)
  - `MATCH_OPTIONS: MatchOptions = { userSide: 0, pauseAtHalfTime: true }`
  - `startMatch(db: GameDb, player: PlayerState, requestId: string): Promise<{ matchId: string; setup: MatchSetup }>`
  - `finishMatch(db: GameDb, userId: string, matchId: string, claimed: unknown): Promise<{ status: 'validated' | 'rejected'; reward: number; score: [number, number] }>`
  - `saveSquad(db, userId, sheet: TeamSheet): Promise<void>` ; `savedSheet(db, player: PlayerState): Promise<TeamSheet>` (le onze enregistré, sinon `bestSquad`)
  - `listObjectives(db, userId): Promise<{ id: string; done: boolean; reward: { pack: string } | { credits: number } }[]>`

Règles :
- **Adversaire** : l'adversaire de la journée N est le N-ième autre club de la division par ordre d'`id`, en boucle, avec N = matchs validés + 1. Le joueur reçoit à domicile. Les maillots viennent de `matchKits`.
- **Graine** : c'est `crypto.randomInt(1, 2**31)`. **Premier match guidé** (aucun match validé) : parmi les graines 1 à 400, la première dont la première action clé du joueur tombe avant 3:00 (`MatchSim` avec `MATCH_OPTIONS`, en faisant `step()` jusqu'à `pendingMoment`). Sinon la graine 1. Le moteur n'est pas modifié (spec §8).
- **Match déjà ouvert** : un match `created` du joueur est **repris** au lieu d'en créer un autre.
- **Validation** :
  - parser `claimed` avec Zod : `{ moments: ShotOutcome[] (≤ 12), changes: MatchChange[] (≤ 10), score: [int, int] }` ;
  - lire `setup` et `options` du match, parser le setup en `MatchSetup` (schéma Zod minimal sur les champs lus) ;
  - lancer `replayMatch` ; une exception ou un score rejoué différent du score annoncé → `record_match(p_valid=false)` ;
  - sinon : `reward = matchReward(niveau de la division du club, score, momentsWon)`.
- **Action clé réussie** : un moment où le joueur attaque (`attacking === 0`) et dont l'issue est `goal` ; ou un moment `keeper`, que le joueur défend, dont l'issue n'est pas `goal`.

- [ ] **Step 1: Failing unit test** — `matches.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { matchReward } from './matches.ts';

describe('match rewards', () => {
  it('pays a win by level, half a draw, a quarter a defeat, and 25 a key moment', () => {
    expect(matchReward('district', [2, 1], 0)).toBe(300);
    expect(matchReward('regional', [1, 1], 0)).toBe(300);
    expect(matchReward('national', [0, 3], 2)).toBe(225 + 50);
  });
});
```

Run — FAIL. Implement `matchReward` (`WIN = { district: 300, regional: 600, national: 900 }`, nul `/ 2`, défaite `/ 4`, arrondis à l'entier) — PASS.

- [ ] **Step 2: Failing database test** — `test-db/matches.test.ts`:
  - un invité avec club et pack de départ ouvert ;
  - `startMatch` puis `simulateMatch`, résolu par `autoResolveMoment`, donne les entrées (`MatchSim.run` avec un résolveur, puis `.inputs`) ;
  - `finishMatch` avec le bon score : `validated`, `reward > 0`, `foundations-match` complété, un pack bronze `objective` ;
  - rejouer `finishMatch` : même `status`, `reward` 0 pas de nouveau crédit ;
  - un second match avec un score gonflé (`[score[0] + 3, score[1]]`) : `rejected`, reward 0 ;
  - un `claimed` mal formé : `rejected` ;
  - `startMatch` deux fois sans finir : le même `matchId`.

```ts
// sketch of the inputs a test can produce without the 3D scene
const sim = new MatchSim(setup, MATCH_OPTIONS);
const result = sim.run((m) => autoResolveMoment(m, setup.conditions));
const claimed = { ...sim.inputs, score: result.score };
```

(Check `MatchSim.run`'s handling of `pauseAtHalfTime`. If it stops at half-time, loop `resumeSecondHalf()` / `step()` like `replayMatch` in a small test helper.)

- [ ] **Step 3: Implement `matches.ts`, `squads.ts`, `objectives.ts`** from the interfaces and rules above. All database calls go through the typed `GameDb`; RPC errors map with `gameErrorFrom`. `savedSheet` rebuilds the saved eleven: cards in `lineup` order placed on the formation's slots, other owned cards as the bench. If a saved card is no longer owned, it falls back to `bestSquad`. Run unit + db tests — PASS.
- [ ] **Step 4:** `pnpm check`, `test:db`, commit — `feat(web): matches frozen, replayed and paid by the server`.

---

### Task 4: Le match dans le jeu

**Files:**
- Modify: `apps/web/src/components/match/match-screen.tsx`, `apps/web/messages/fr.json` (`game.match`, `game.errors`)
- Create: `apps/web/src/app/jouer/match/page.tsx`, `apps/web/src/components/game/game-match.tsx`, `apps/web/src/app/jouer/game-actions.ts`

**Interfaces:**
- `MatchScreen` takes an optional `game?: { setup: sim.MatchSetup; onFullTime: (claimed: { moments: sim.ShotOutcome[]; changes: sim.MatchChange[]; score: [number, number] }) => void; fullTime: ReactNode }`. Without it, the lab is unchanged. With it:
  - no `PreMatch` : un écran « Coup d'envoi » (un tap, qui débloque aussi le son) ;
  - `start` uses `game.setup` and `{ userSide: 0, pauseAtHalfTime: true }` ;
  - `?auto=1` résout les actions clés par le coach (pour l'e2e, et pour qui veut regarder) ;
  - à la fin du match, `onFullTime` est appelé une fois avec `match.inputs` et le score, puis `game.fullTime` remplace le panneau `FullTime` du labo.
- Server Actions (`game-actions.ts`, `'use server'`) :
  - `startMyMatch(): Promise<{ ok: true; matchId: string; setup: MatchSetup } | { ok: false; error }>` ;
  - `finishMyMatch(matchId: string, claimed: unknown): Promise<{ ok: true; status; reward; score } | { ok: false; error }>`.

- [ ] **Step 1:** `jouer/match/page.tsx` (server) : `requireStage('playing')`, puis rend `<GameMatch />` en plein écran, **sans la coque**. La page est hors du groupe `(jeu)`, comme `/lab/match`.
- [ ] **Step 2:** `game-match.tsx` (client) :
  - au montage, `startMyMatch()` (une fois, garde `useRef`), puis `<MatchScreen game={…} />` ;
  - `onFullTime` → `finishMyMatch` ;
  - le panneau de fin affiche le score, « Match validé » et « +{reward} CR », la ligne « Objectif accompli : Jouer un match → Pack Bronze » (lue dans le résultat), et le bouton « Retour à La Une » ;
  - si le match est rejeté : « Ce résultat n'a pas pu être vérifié. Aucune récompense. ».
- [ ] **Step 3:** La Une : la tuile héroïne « Premier match » devient un lien vers `/jouer/match`. Le bouton « Jouer » est actif ; le titre est « Match suivant » après le premier match.
- [ ] **Step 4: Verify in the browser** : un match complet à ×8 avec « Laisser le coach », puis un match en jouant une action clé en 3D ; la récompense apparaît sur La Une (crédits de la barre, Fondations). `pnpm check`, commit — `feat(web): the player's match, replayed by the server and paid`.

---

### Task 5: Fondations, record, onze enregistré

**Files:**
- Modify: `apps/web/src/app/jouer/(jeu)/page.tsx` (La Une), `apps/web/src/app/jouer/(jeu)/layout.tsx` (barre), `apps/web/src/app/jouer/(jeu)/equipes/page.tsx`, `apps/web/src/app/jouer/game-actions.ts`
- Test: `apps/web/src/server/game/season.test.ts`

**Interfaces:**
- `seasonOf(matches: { status: string; score: number[] | null }[]): { wins, draws, losses, xp, level, nextLevelXp }`, pure dans `server/game/season.ts` :
  - 100 XP par match validé, +50 par victoire ;
  - niveau = 1 + ⌊xp / 500⌋, et `nextLevelXp` est le seuil du niveau suivant ;
  - victoire, nul et défaite se lisent du point de vue du côté 0.
- Server Action `saveMySquad(formation: Formation): Promise<{ ok } | { ok: false; error }>` : enregistre `autoSquad(cards, formation)`.

- [ ] **Step 1: Failing test** for `seasonOf` (no match → level 1, 0 XP; 2 wins and 1 defeat → 3 V 0 N 1 D… compute exactly: `[{validated,[2,0]},{validated,[1,1]},{validated,[0,1]},{rejected,null}]` → 1 V 1 N 1 D, 350 XP, niveau 1, seuil 500). Implement — PASS.
- [ ] **Step 2:** Bar: the layout reads `matches` (its own rows) and passes `seasonOf(…)`.
- [ ] **Step 3:** La Une, Fondations : les étapes 3 à 5 sont lues dans `listObjectives`. Les étapes 1 et 2 restent dérivées de l'accueil.
- [ ] **Step 4:** Équipes :
  - le onze affiché est `savedSheet` ; le choix d'une formation montre l'automatique de cette formation ;
  - un bouton « Valider ce onze » (formulaire, action `saveMySquad`) l'enregistre et revalide la page ;
  - un badge « Enregistré » s'affiche quand le onze vu est le onze enregistré.
- [ ] **Step 5:** Browser check; `pnpm check`, commit — `feat(web): the Foundations, the record and the saved eleven`.

---

### Task 6: Ouvrir ses packs et la boutique

**Files:**
- Create: `apps/web/src/app/jouer/ouvrir/[pack]/page.tsx`, `apps/web/src/components/game/pack-open.tsx`
- Modify: `apps/web/src/app/jouer/(jeu)/boutique/page.tsx`, `apps/web/src/app/jouer/(jeu)/page.tsx` (tuile Packs), `apps/web/src/app/jouer/game-actions.ts`, `apps/web/messages/fr.json` (`game.store`)

**Interfaces:**
- `openMyPack(packId: string): Promise<{ ok: true; type: PackType; cardIds: string[] } | { ok: false; error }>` :
  - `request_id` = id du pack (un rechargement rend les mêmes cartes) ;
  - après l'ouverture, `advance_objective('pack_opened')`, en dehors de la transaction et idempotent : si l'appel échoue, le prochain pack ouvert le rattrape.
- `buyMyPack(form: FormData)` :
  - champs `type` (`z.enum(PACK_TYPES)`) et `request` (uuid créé au rendu de la page : un double clic ne débite qu'une fois) ;
  - `buyPack` (plan A), puis redirection vers `/jouer/ouvrir/[id]` ;
  - en cas d'erreur, redirection vers `/jouer/boutique?erreur=<code>`.

- [ ] **Step 1:** `/jouer/ouvrir/[pack]` : page plein écran, sans la coque, comme le pack de départ. `pack-open.tsx` reprend le schéma de `StarterOpening`, avec le type du pack ; « Continuer » ramène à `/jouer`.
- [ ] **Step 2:** La Une, tuile Packs : le premier pack en attente avec son art, son nombre, et le bouton « Ouvrir » vers `/jouer/ouvrir/[id]`.
- [ ] **Step 3: Boutique** (remplace « Bientôt ») :
  - les 4 packs de `PACKS` : art, prix, contenu, solde du joueur ;
  - le tableau des probabilités de `packOdds`, toujours visible, comme dans le labo (règle 5) ;
  - « Acheter » désactivé si le solde est insuffisant ;
  - le message d'erreur vient de `?erreur`.
- [ ] **Step 4:** Browser: buy a Bronze with the welcome credits, open it, the Fondations « Ouvrir un pack » is ticked and gives its pack. `pnpm check`, commit — `feat(web): open your packs, and the shop with its odds`.

---

### Task 7: Le bout en bout, en local et en CI

**Files:**
- Create: `apps/web/e2e/game.spec.ts`
- Modify: `.github/workflows/ci.yml` (job `game`), `apps/web/playwright.config.ts` if a project filter is needed

- [ ] **Step 1:** `game.spec.ts` (Chromium, ordinateur et mobile 375 px) :
  - le test est sauté si `NEXT_PUBLIC_SUPABASE_URL` manque ;
  - `/jouer` → Commencer → recherche « bermerain » → choisir → pack de départ : Ouvrir, Passer, toucher, Tout retourner, Continuer ;
  - Équipes : Continuer vers La Une → Jouer → `/jouer/match?auto=1` à la vitesse maximale, jusqu'au panneau de fin ;
  - attendre « Match validé », puis Retour à La Une : crédits > 1 000 et Fondations « Jouer un match » cochée.
- [ ] **Step 2:** `pnpm --filter @legendes/web e2e -- game.spec.ts` with `pnpm db:start` and `pnpm dev` — PASS.
- [ ] **Step 3: CI job `game`** (le changement de workflow que la spec demande d'annoncer : il l'est dans le compte rendu et la PR). Étapes :
  - `supabase/setup-cli@v1` (version figée), `supabase start` ;
  - écriture de `apps/web/.env.local` depuis `supabase status -o env` ;
  - `pnpm --filter @legendes/web test:db` ;
  - installation de Chromium, puis `pnpm --filter @legendes/web e2e -- game.spec.ts` ;
  - traces en artefact si échec.
- [ ] **Step 4:** Push the branch, watch the job; commit — `ci: the database tests and the game's end-to-end run against local Supabase`.

---

### Task 8: Décisions et avancement

- [ ] **D-043** « La boucle de la tranche (Phase 4, plan C) » :
  - match figé, rejoué, payé ; barème ; graine guidée ; adversaire de la journée ;
  - objectifs en données ; onze enregistré ; boutique ; record et XP dérivés ;
  - e2e et job CI ;
  - le moteur compte encore la ligue dans ses collectifs (sans effet dans le pilote : les deux équipes l'ont), à aligner en Phase 5.
- [ ] ROADMAP (plan C ✅ ; reste de la Phase 4 : mise en ligne, PWA, finition), ligne de phase de `CLAUDE.md` (et de `AGENTS.md` s'il est suivi). `pnpm check`, commit — `docs: D-043 — the game loop of the slice`.

---

## Self-review (fait à l'écriture)

- **Couverture de la spec :**
  - §3 étapes 5-6 : tâches 4 et 5 ;
  - §7 : tâche 1 et la tuile de la tâche 5 ;
  - §8, étapes 1 à 5 et premier match guidé : tâches 1, 3 et 4 ;
  - §10, erreurs « match déjà récompensé » et « résultat rejeté » : tâches 3 et 4 ; `request_id` partout ;
  - §11, match truqué, une seule récompense, e2e, CI : tâches 3 et 7.
- **Noms cohérents :** `toMatchTeamFromSheet`, `MATCH_OPTIONS`, `matchReward`, `startMatch`, `finishMatch`, `savedSheet`, `listObjectives`, `seasonOf`, `startMyMatch`, `finishMyMatch`, `openMyPack`, `buyMyPack`, `saveMySquad`.
- **Review Focus :** 1 et 2 → tâche 3 ; 2, 3 et 4 → tâche 1 ; 5 → tâche 6.
