# Phase 4 — Plan B : la coque du jeu, l'accueil et le pack de départ à l'écran

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un visiteur arrive sur `/jouer`, devient invité, choisit n'importe quel club du pilote, ouvre son pack de départ dans la vraie scène 3D, découvre son onze composé automatiquement (collectifs expliqués) puis navigue dans la coque à 7 onglets (La Une, Équipes et Mon club sur ses vraies données ; les autres onglets en « Bientôt »).

**Architecture:** Les règles de composition (collectifs GDD §6.2, composition automatique) sont des fonctions pures de `packages/data`, testées sans base. La session invitée vit dans des cookies (`@supabase/ssr`) rafraîchis par `src/proxy.ts` ; les pages serveur lisent l'état du joueur avec le client de session (RLS : ses lignes seules) et les écritures passent par des Server Actions qui appellent les modules du plan A avec le client `service_role` (règle 2). Un garde unique (`stageOf`) envoie chaque visiteur à la bonne étape de l'accueil. La scène d'ouverture de `/lab/pack` est rendue réutilisable (`components/pack/`) et sert au pack de départ. La coque reprend les composants de la maquette validée (`components/shell/`).

**Tech Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, Tailwind 4, next-intl, `@supabase/ssr` + `@supabase/supabase-js`, Three.js (`@legendes/render3d`), Vitest, Supabase local (Docker).

**Spec:** `docs/superpowers/specs/2026-10-06-phase-4-tranche-fine-design.md` (§3 parcours, §4 coque, §6 pack de départ, §9 structure, §10 erreurs) ; maquette validée : `/lab/une` (branche `design/la-une-mockup`).

## Global Constraints

- Code, identifiants, commentaires et commits en **anglais** ; tout texte vu par le joueur en **français**, dans `apps/web/messages/fr.json` (aucune chaîne en dur dans le JSX).
- TypeScript `strict`, **pas de `any`**, Zod à chaque frontière (formulaires, réponses de la base).
- **Avant tout code Next.js**, lire le guide concerné dans `apps/web/node_modules/next/dist/docs/` (`01-getting-started/16-proxy.md`, `07-mutating-data.md`, `02-guides/authentication.md`) : ce n'est pas le Next.js habituel (Middleware s'appelle Proxy, `cookies()` est asynchrone, `typedRoutes: true`).
- Règle 2 : aucune écriture depuis le navigateur. Les Server Actions vérifient la session, puis appellent `chooseClub`, `claimWelcome`, `openUserPack` (plan A) avec le client `service_role`, qui n'est importé que par du code serveur (`import 'server-only'`).
- Règle 4 : aucun nom, logo ni visuel de la marque d'origine dans l'interface ni dans les fichiers affichés. Règle 5 : la **composition** du pack de départ est affichée avant l'ouverture (8 du club ; 8 bronze, 6 argent, 4 or).
- Routes en français (spec §4) : `/jouer`, `/jouer/solo`, `/jouer/en-ligne`, `/jouer/equipes`, `/jouer/transferts`, `/jouer/boutique`, `/jouer/mon-club` ; accueil `/jouer/bienvenue`, `/jouer/bienvenue/club`, `/jouer/bienvenue/pack`. La coque n'apparaît pas pendant l'accueil.
- Branche : `feat/game-shell`, créée depuis `design/la-une-mockup` (qui contient `feat/game-core`, PR #46, et la maquette). `pnpm check` vert à chaque tâche ; `pnpm --filter @legendes/web test:db` vert aux tâches qui touchent la base (Docker, `pnpm db:start`).
- Commits conventionnels, un par tâche, terminés par la ligne d'attribution de la session.
- Hors plan B (plan C) : match, objectifs en base (Les Fondations réelles, objectifs du jour), boutique, record et XP, e2e Playwright avec Supabase, job CI. Le rattachement à un e-mail (spec §5) passe aussi au plan C : la tranche se joue en invité.

## Review Focus

1. **Le joueur recharge ou revient en arrière pendant l'ouverture du pack de départ** (l'action est appelée deux fois) : il retrouve les mêmes 18 cartes, rien n'est tiré deux fois. Test : tâche 4 (`request_id` = id du pack).
2. **Un lien direct vers `/jouer/equipes` sans club choisi, ou sans session** : redirection vers la bonne étape de l'accueil, jamais une page cassée. Test : tâche 4 (`stageOf`).
3. **Deux exemplaires du même joueur dans la collection** : la composition automatique ne le fait jamais jouer deux fois. Test : tâche 1.
4. **Une collection trop courte pour une formation** (pas de gardien, moins de 11 cartes) : les postes restent vides, rien ne plante. Test : tâche 1.
5. **Un club de N2 choisi** : la page du club, le pack et le onze fonctionnent comme pour un club de D5 (cartes or, collectif de district plus rare). Test : tâche 4 (choix d'un club de N2) et tâche 1 (onze d'un pack de N2).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `packages/data/src/team/collective.ts` | Points de collectif d'un onze (GDD §6.2) : club et district. |
| `packages/data/src/team/auto-squad.ts` | `autoSquad`, `bestSquad` : onze, banc et note à partir des cartes possédées. |
| `packages/data/test/collective.test.ts`, `auto-squad.test.ts` | Tests unitaires. |
| `packages/ui/src/card/pack.ts` | Ajoute l'habillage du pack de départ (`PackArtType`). |
| `apps/web/src/components/pack/pack-assets.ts` | `buildPackAssets` (déplacé de `pack-lab.tsx`), commun au labo et au jeu. |
| `apps/web/src/components/pack/pack-opening.tsx` | Scène d'ouverture + indices + boutons, sans réglages de labo. |
| `apps/web/src/lib/supabase/{session,admin}.ts`, `apps/web/src/proxy.ts` | Session invitée en cookies ; client `service_role` côté serveur. |
| `apps/web/src/server/game/player.ts` (+ test db) | `loadPlayer` : état du joueur lu avec RLS. |
| `apps/web/src/server/game/stage.ts` (+ test) | `stageOf`, `STAGE_PATH` : quelle étape pour quel état. |
| `apps/web/src/app/jouer/actions.ts` | Server Actions : commencer, choisir le club, ouvrir le pack de départ. |
| `apps/web/src/app/jouer/current.ts` | `currentPlayer()`, `requireStage()` pour les pages. |
| `apps/web/src/app/jouer/bienvenue/**` | Les trois écrans de l'accueil. |
| `apps/web/src/app/jouer/(jeu)/**` | Layout de la coque et les 7 onglets. |
| `apps/web/src/components/shell/*` | Coque de la maquette, navigation réelle, tuiles, « Bientôt ». |
| `apps/web/src/components/team/*` | Terrain de l'onze, carte de collectif. |
| `apps/web/messages/fr.json` | Textes de l'accueil, des onglets, des erreurs. |

---

### Task 1: Collectifs et composition automatique (fonctions pures)

**Files:**
- Create: `packages/data/src/team/collective.ts`, `packages/data/src/team/auto-squad.ts`, `packages/data/src/team/index.ts`
- Modify: `packages/data/src/index.ts` (ajouter `export * from './team/index.ts';`)
- Test: `packages/data/test/collective.test.ts`, `packages/data/test/auto-squad.test.ts`

**Interfaces:**
- Produces:
  - `interface CollectiveMember { clubId: string; districtId: string; inPosition: boolean }`
  - `collectiveOf(members: readonly (CollectiveMember | null)[]): { perPlayer: number[]; total: number }` (même ordre, `null` = poste vide → 0)
  - `COLLECTIVE_STEPS = { club: [2, 4, 7], district: [3, 5, 8] }`, `COLLECTIVE_MAX = 33`
  - `interface SquadSlot { position: Position; x: number; y: number; card: PackCard | null; inPosition: boolean; collective: number }`
  - `interface Squad { formation: Formation; slots: SquadSlot[]; bench: PackCard[]; collective: number; rating: number }`
  - `autoSquad(cards: readonly PackCard[], formation: Formation): Squad`
  - `bestSquad(cards: readonly PackCard[]): Squad` (meilleure formation de `FORMATIONS`)

Règles (à recopier en commentaire d'en-tête de `collective.ts`) :
- Chaque joueur **à son poste** prend le meilleur de : club (2 → +1, 4 → +2, 7 → +3) et district (3 → +1, 5 → +2, 8 → +3), en comptant les joueurs à leur poste du onze qui partagent ce groupe, lui compris. Plafond 3, **33** pour l'équipe.
- Un joueur hors de son poste ne gagne ni ne donne de collectif.
- La ligue (GDD §6.2) n'est pas comptée : le pilote n'a qu'une ligue, elle donnerait +3 à tout le monde (décision D-042, tâche 9). La division (bonus secondaire) attend la Phase 5.

- [ ] **Step 1: Write the failing collective tests**

```ts
// packages/data/test/collective.test.ts
import { describe, expect, it } from 'vitest';
import { collectiveOf, COLLECTIVE_MAX, type CollectiveMember } from '../src/index.ts';

const m = (clubId: string, districtId = 'd1', inPosition = true): CollectiveMember => ({
  clubId,
  districtId,
  inPosition,
});

describe('collectives', () => {
  it('follows the club steps: 2 → +1, 4 → +2, 7 → +3', () => {
    const others = (n: number) => Array.from({ length: n }, (_, i) => m(`o${i}`, `d${i + 10}`));
    expect(collectiveOf([m('a', 'x'), m('a', 'y'), ...others(9)]).perPlayer.slice(0, 2)).toEqual([1, 1]);
    expect(collectiveOf([...Array(4).fill(m('a', 'x')), ...others(7)]).perPlayer[0]).toBe(2);
    expect(collectiveOf([...Array(7).fill(m('a', 'x')), ...others(4)]).perPlayer[0]).toBe(3);
  });

  it('takes the best of club and district', () => {
    // 2 of the club (+1) but 5 of the district (+2).
    const lineup = [m('a'), m('a'), m('b'), m('c'), m('e'), ...Array.from({ length: 6 }, (_, i) => m(`z${i}`, `far${i}`))];
    expect(collectiveOf(lineup).perPlayer.slice(0, 5)).toEqual([2, 2, 2, 2, 2]);
  });

  it('gives nothing to, and takes nothing from, a player out of position', () => {
    const lineup = [m('a'), m('a', 'd1', false), ...Array.from({ length: 9 }, (_, i) => m(`z${i}`, `far${i}`))];
    expect(collectiveOf(lineup).perPlayer.slice(0, 2)).toEqual([0, 0]);
  });

  it('caps the team at 33 and scores an empty slot 0', () => {
    expect(collectiveOf(Array(11).fill(m('a'))).total).toBe(COLLECTIVE_MAX);
    expect(collectiveOf([null, ...Array(10).fill(m('a'))]).perPlayer[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd packages/data && npx vitest run test/collective.test.ts`
Expected: FAIL, `collectiveOf` is not exported.

- [ ] **Step 3: Implement `collective.ts`**

```ts
// packages/data/src/team/collective.ts
// Collectives (GDD §6.2), the game's "links": players of the eleven who share a club or a
// district play better together. Each player in his position takes the best of the two groups,
// counting the players in position who share it, himself included: club 2 → +1, 4 → +2,
// 7 → +3; district 3 → +1, 5 → +2, 8 → +3; at most 3 each, 33 for the team. A player out of
// position neither gets nor gives any. The league is not counted: the pilot has a single one,
// it would give +3 to everybody (D-042). The division bonus waits for Phase 5.

export interface CollectiveMember {
  readonly clubId: string;
  readonly districtId: string;
  readonly inPosition: boolean;
}

export const COLLECTIVE_STEPS = { club: [2, 4, 7], district: [3, 5, 8] } as const;
export const COLLECTIVE_MAX = 33;

const points = (count: number, steps: readonly number[]): number =>
  steps.filter((step) => count >= step).length;

/** Collective points of each slot of an eleven (`null` = empty slot), and their total. */
export function collectiveOf(members: readonly (CollectiveMember | null)[]): {
  perPlayer: number[];
  total: number;
} {
  const counted = members.filter((x): x is CollectiveMember => x !== null && x.inPosition);
  const count = (key: 'clubId' | 'districtId', value: string): number =>
    counted.filter((x) => x[key] === value).length;
  const perPlayer = members.map((x) =>
    x === null || !x.inPosition
      ? 0
      : Math.min(
          3,
          Math.max(
            points(count('clubId', x.clubId), COLLECTIVE_STEPS.club),
            points(count('districtId', x.districtId), COLLECTIVE_STEPS.district),
          ),
        ),
  );
  return { perPlayer, total: Math.min(COLLECTIVE_MAX, perPlayer.reduce((a, b) => a + b, 0)) };
}
```

Create `packages/data/src/team/index.ts`:

```ts
export * from './collective.ts';
export * from './auto-squad.ts';
```

(Create `auto-squad.ts` with `export {};` for now so the index compiles.) Add `export * from './team/index.ts';` to `packages/data/src/index.ts`.

- [ ] **Step 4: Run, expect PASS**

Run: `cd packages/data && npx vitest run test/collective.test.ts` — Expected: 4 passed.

- [ ] **Step 5: Write the failing auto-squad tests**

```ts
// packages/data/test/auto-squad.test.ts
import { describe, expect, it } from 'vitest';
import {
  autoSquad,
  bestSquad,
  cardOf,
  generateSquad,
  getClub,
  openStarterPack,
  WORLD,
  type PackCard,
} from '../src/index.ts';

const d5 = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5')!;
const n2 = WORLD.clubs.find((c) => c.divisionId.startsWith('n2'))!;

describe('the automatic squad', () => {
  it('fields eleven different players, a keeper in goal, from a starter pack of any division', () => {
    for (const club of [d5, n2]) {
      const squad = bestSquad(openStarterPack(club, 'auto').cards);
      const cards = squad.slots.map((s) => s.card);
      expect(cards.every((c) => c !== null)).toBe(true);
      expect(new Set(cards.map((c) => c!.card.player.id)).size).toBe(11);
      expect(squad.slots[0]!.position).toBe('GK');
      expect(squad.slots[0]!.card!.card.player.positions[0]).toBe('GK');
      expect(squad.bench).toHaveLength(7);
    }
  });

  it('never plays the same player twice, even with two copies of his card', () => {
    const pack = openStarterPack(d5, 'dup').cards;
    const squad = autoSquad([...pack, ...pack], '4-4-2');
    const ids = squad.slots.flatMap((s) => (s.card ? [s.card.card.player.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves slots empty when the collection is short', () => {
    const outfield = openStarterPack(d5, 'short').cards.filter(
      (c) => c.card.player.positions[0] !== 'GK',
    );
    const squad = autoSquad(outfield.slice(0, 5), '4-4-2');
    expect(squad.slots[0]!.card).toBeNull();
    expect(squad.slots.filter((s) => s.card !== null)).toHaveLength(5);
  });

  it('values collectives: a squad of a single club gets its 33 points', () => {
    const club = getClub(d5.id)!;
    const own: PackCard[] = generateSquad(club).players.map((p) => ({ card: cardOf(p), club }));
    expect(bestSquad(own).collective).toBe(33);
  });

  it('is deterministic', () => {
    const cards = openStarterPack(n2, 'det').cards;
    expect(bestSquad(cards)).toEqual(bestSquad(cards));
  });
});
```

- [ ] **Step 6: Run, expect failure** (`autoSquad` not exported).

- [ ] **Step 7: Implement `auto-squad.ts`**

```ts
// packages/data/src/team/auto-squad.ts
// The automatic squad (spec §3, step 4): from the cards a player owns, the eleven of a formation
// with the best total of ratings and collective points, the seven best others on the bench. A
// greedy start (best rating per slot), then swaps while they improve the total. Pure and
// deterministic: the same cards give the same squad.

import {
  FORMATION_SLOTS,
  FORMATIONS,
  type Formation,
} from '@legendes/engine/sim/formations';
import { POSITION_LINE, type Position } from '@legendes/engine/sim/positions';
import type { PackCard } from '../packs.ts';
import { collectiveOf } from './collective.ts';

export interface SquadSlot {
  readonly position: Position;
  readonly x: number;
  readonly y: number;
  readonly card: PackCard | null;
  readonly inPosition: boolean;
  readonly collective: number;
}

export interface Squad {
  readonly formation: Formation;
  readonly slots: readonly SquadSlot[];
  readonly bench: readonly PackCard[];
  readonly collective: number;
  /** Mean of the eleven's ratings at their slots (0 for an empty slot), rounded. */
  readonly rating: number;
}

const BENCH = 7;
/** A player in his line but not his exact position plays at 85 %; elsewhere he does not play. */
const NEAR_POSITION = 0.85;

function fit(card: PackCard, position: Position): { value: number; inPosition: boolean } {
  const { positions, rating } = card.card.player;
  if (positions.includes(position)) return { value: rating, inPosition: true };
  const main = positions[0] ?? 'CM';
  const sameLine = POSITION_LINE[main] === POSITION_LINE[position] && position !== 'GK';
  return { value: sameLine ? rating * NEAR_POSITION : 0, inPosition: false };
}

function score(lineup: readonly (PackCard | null)[], positions: readonly Position[]): number {
  let total = 0;
  const members = lineup.map((c, i) => {
    if (!c) return null;
    const f = fit(c, positions[i] as Position);
    total += f.value;
    return { clubId: c.club.id, districtId: c.club.districtId, inPosition: f.inPosition };
  });
  return total + collectiveOf(members).total;
}

/** One card per player (the most valuable copy), in a stable order. */
function distinct(cards: readonly PackCard[]): PackCard[] {
  const byPlayer = new Map<string, PackCard>();
  for (const c of [...cards].sort((a, b) => a.card.id.localeCompare(b.card.id))) {
    const seen = byPlayer.get(c.card.player.id);
    if (!seen || c.card.player.rating > seen.card.player.rating) byPlayer.set(c.card.player.id, c);
  }
  return [...byPlayer.values()];
}

export function autoSquad(cards: readonly PackCard[], formation: Formation): Squad {
  const slots = FORMATION_SLOTS[formation];
  const positions = slots.map((s) => s.position);
  const pool = distinct(cards);
  const lineup: (PackCard | null)[] = positions.map(() => null);

  // Greedy start: each slot takes the free card that fits it best.
  for (let i = 0; i < positions.length; i++) {
    let best: PackCard | null = null;
    let bestValue = 0;
    for (const c of pool) {
      if (lineup.includes(c)) continue;
      const v = fit(c, positions[i] as Position).value;
      if (v > bestValue) [best, bestValue] = [c, v];
    }
    lineup[i] = best;
  }

  // Swaps (slot ↔ slot, slot ↔ free card) while the total improves.
  let current = score(lineup, positions);
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < lineup.length; i++) {
      const candidates: (PackCard | null)[] = [...pool.filter((c) => !lineup.includes(c)), ...lineup];
      for (const c of candidates) {
        if (c === lineup[i]) continue;
        const j = c === null ? -1 : lineup.indexOf(c);
        const next = [...lineup];
        next[i] = c;
        if (j >= 0) next[j] = lineup[i] ?? null;
        const s = score(next, positions);
        if (s > current + 1e-9) {
          lineup.splice(0, lineup.length, ...next);
          current = s;
          improved = true;
        }
      }
    }
  }

  const members = lineup.map((c, i) =>
    c
      ? { clubId: c.club.id, districtId: c.club.districtId, inPosition: fit(c, positions[i] as Position).inPosition }
      : null,
  );
  const collective = collectiveOf(members);
  const bench = pool
    .filter((c) => !lineup.includes(c))
    .sort((a, b) => b.card.player.rating - a.card.player.rating || a.card.id.localeCompare(b.card.id))
    .slice(0, BENCH);
  const values = lineup.map((c, i) => (c ? fit(c, positions[i] as Position).value : 0));
  return {
    formation,
    slots: slots.map((slot, i) => ({
      position: slot.position,
      x: slot.x,
      y: slot.y,
      card: lineup[i] ?? null,
      inPosition: members[i]?.inPosition ?? false,
      collective: collective.perPlayer[i] ?? 0,
    })),
    bench,
    collective: collective.total,
    rating: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

/** The automatic squad in the formation that suits the cards best. */
export function bestSquad(cards: readonly PackCard[]): Squad {
  let best: Squad | null = null;
  let bestScore = -1;
  for (const formation of FORMATIONS) {
    const squad = autoSquad(cards, formation);
    const s = squad.rating * 11 + squad.collective;
    if (s > bestScore) [best, bestScore] = [squad, s];
  }
  return best as Squad;
}
```

Check `PackCard` is exported from `packs.ts` (it is used by `OpenedPack`); if it is only a local interface, export it.

- [ ] **Step 8: Run, expect PASS** — `cd packages/data && npx vitest run test/auto-squad.test.ts test/collective.test.ts`. If `bestSquad` for a single-club squad is not 33 (that club has fewer than 7 in-position players for every formation), pick in the test the first D5 club for which `generateSquad` gives 2 GK, ≥ 7 DEF, ≥ 6 MID, ≥ 3 ATT — do not weaken the rule.

- [ ] **Step 9: `pnpm check`, then commit**

```bash
git add packages/data
git commit -m "feat(data): collectives and the automatic squad — club and district, swaps that pay"
```

---

### Task 2: L'habillage du pack de départ

**Files:**
- Modify: `packages/ui/src/card/pack.ts`, `apps/web/messages/fr.json`, `apps/web/src/components/shell/pack-art.tsx`
- Test: `packages/ui/test/pack.test.ts` (créer s'il n'existe pas ; sinon y ajouter le cas)

**Interfaces:**
- Produces: `type PackArtType = PackType | 'starter'` exporté de `@legendes/ui/card` ; `PACK_LOOKS: Record<PackArtType, PackLook>` ; `packNode`, `packMaskNode` acceptent `PackArtType` ; messages `packs.types.starter.{name,contents}` et `packs.starterMix`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { PACK_LOOKS, packNode } from '../src/card/index.ts';

const labels = { title: 'PACK DE DÉPART', contents: '18 cartes', tearHere: 'x', odds: 'y', legal: 'z' };

describe('the starter pack art', () => {
  it('has its own look and prints its name', () => {
    expect(PACK_LOOKS.starter.metal).toHaveLength(3);
    expect(JSON.stringify(packNode('starter', labels, 'starter'))).toContain('PACK DE DÉPART');
  });
});
```

Run: `cd packages/ui && npx vitest run test/pack.test.ts` — Expected: FAIL (type error / `PACK_LOOKS.starter` undefined).

- [ ] **Step 2: Implement** — in `pack.ts`, add `export type PackArtType = PackType | 'starter';`, retype `PACK_LOOKS` as `Readonly<Record<PackArtType, PackLook>>` and add the look of a club's pitch at night (green foil, chalk ink):

```ts
  starter: { metal: ['#9fe0b8', '#2a7a58', '#0a2a1c'], ink: '#f4f1e8', tint: '#bff0cf', holo: 0 },
```

Retype the `type` parameter of `parts`, `packNode`, `packMaskNode` from `PackType` to `PackArtType`. In `fr.json` under `packs.types` add `"starter": { "name": "Pack de départ", "contents": "18 cartes · 8 de ton club" }` and under `packs` add `"starterMix": "Composition : {club} cartes de ton club · {bronze} bronze, {silver} argent, {gold} or"`. In `pack-art.tsx`, type `type` as `PackArtType`.

- [ ] **Step 3: PASS, `pnpm check`, commit** — `feat(ui): the starter pack's own foil`.

---

### Task 3: La scène d'ouverture, réutilisable hors du labo

**Files:**
- Create: `apps/web/src/components/pack/pack-assets.ts`, `apps/web/src/components/pack/pack-opening.tsx`
- Modify: `apps/web/src/components/lab/pack-lab.tsx`, `apps/web/messages/fr.json` (namespace `packOpening`)
- Test: `apps/web/e2e/lab.spec.ts` (existant, doit rester vert)

**Interfaces:**
- Consumes: `PackArtType` (tâche 2).
- Produces:
  - `buildPackAssets(render3d: typeof Render3D, input: { type: PackArtType; cards: readonly PackCard[] }, tr: FaceTranslators, labels: PackLabels): Promise<PackOpeningAssets>`
  - `<PackOpening type cards onDone tuning? walkoutVariant? />` (client) : monte la scène, affiche les indices (championnat, club, poste) et les boutons Déchirer / Passer / Suivant / Tout retourner / Continuer ; `onDone()` est appelé par « Continuer » sur l'écran récapitulatif.

C'est un **déplacement**, pas une réécriture :
- [ ] **Step 1:** Move `buildAssets` (and `SURFACE_KEY`) from `pack-lab.tsx` to `pack-assets.ts` as `buildPackAssets`, with `opened: OpenedPack` replaced by `{ type: PackArtType; cards: readonly PackCard[] }` (it only reads `type` and `cards`). The lab imports it. Run `pnpm --filter @legendes/web exec tsc --noEmit`.
- [ ] **Step 2:** In `pack-lab.tsx`, find the JSX that shows the walkout clues and the opening buttons (everything rendered over the `<canvas>` except the type / force / variant menus, the odds panel and the tuning pane). Move it into `pack-opening.tsx` with the canvas and the mounting effect (the `import('@legendes/render3d')` block). Lab-only inputs become optional props: `tuning`, `walkoutVariant`, `onReady(handle)` (the lab uses the handle for `setTuning` and mute). Texts move from `lab.pack.*` to a new `packOpening.*` namespace (same French strings); keep `data-step` on the root element (the e2e reads it).
- [ ] **Step 3:** `PackLab` renders `<PackOpening …/>` plus its menus and panels. Run `pnpm --filter @legendes/web e2e -- lab.spec.ts` (needs `pnpm dev` running) — Expected: PASS, unchanged. Open `/lab/pack` in the browser pane and run one gold pack to the summary.
- [ ] **Step 4:** `pnpm check`, commit — `refactor(web): the pack opening scene as a component the game can use`.

---

### Task 4: Session invitée, état du joueur et garde des étapes

**Files:**
- Modify: `apps/web/package.json` (`pnpm --filter @legendes/web add @supabase/ssr server-only`), `apps/web/src/env.ts`
- Create: `apps/web/src/lib/supabase/session.ts`, `apps/web/src/lib/supabase/admin.ts`, `apps/web/src/proxy.ts`, `apps/web/src/server/game/player.ts`, `apps/web/src/server/game/stage.ts`, `apps/web/src/app/jouer/current.ts`, `apps/web/src/app/jouer/actions.ts`
- Test: `apps/web/src/server/game/stage.test.ts`, `apps/web/test-db/player.test.ts`

**Interfaces:**
- Consumes: `chooseClub`, `claimWelcome`, `openUserPack`, `balanceOf`, `GameDb`, `GameError` (plan A).
- Produces:
  - `interface PlayerState { userId: string; pseudo: string; clubId: string | null; credits: number; packs: { id: string; type: string; source: string }[]; cardIds: string[] }`
  - `loadPlayer(db: GameDb, userId: string): Promise<PlayerState | null>`
  - `type Stage = 'start' | 'club' | 'pack' | 'playing'` ; `stageOf(state: PlayerState | null): Stage` ; `STAGE_PATH: Record<Stage, string>`
  - `currentPlayer(): Promise<PlayerState | null>` ; `requireStage(stage: Stage): Promise<PlayerState>` (redirige sinon)
  - Server Actions : `startAsGuest(): Promise<void>`, `pickClub(formData: FormData): Promise<void>`, `openStarter(): Promise<{ cardIds: string[] }>`

- [ ] **Step 1: Failing `stageOf` test**

```ts
// apps/web/src/server/game/stage.test.ts
import { describe, expect, it } from 'vitest';
import type { PlayerState } from './player.ts';
import { STAGE_PATH, stageOf } from './stage.ts';

const base: PlayerState = { userId: 'u', pseudo: 'Joueur-1', clubId: null, credits: 1000, packs: [], cardIds: [] };

describe('the welcome stages', () => {
  it('sends a visitor without a session to the start', () => {
    expect(stageOf(null)).toBe('start');
  });
  it('asks for a club, then for the starter pack, then lets him play', () => {
    expect(stageOf(base)).toBe('club');
    const chosen = { ...base, clubId: 'c', packs: [{ id: 'p', type: 'starter', source: 'starter' }] };
    expect(stageOf(chosen)).toBe('pack');
    expect(stageOf({ ...chosen, packs: [], cardIds: Array(18).fill('x') })).toBe('playing');
  });
  it('maps every stage to its page', () => {
    expect(STAGE_PATH).toEqual({
      start: '/jouer/bienvenue',
      club: '/jouer/bienvenue/club',
      pack: '/jouer/bienvenue/pack',
      playing: '/jouer',
    });
  });
});
```

Run: `pnpm --filter @legendes/web exec vitest run src/server/game/stage.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 2: Implement `player.ts` and `stage.ts`**

```ts
// apps/web/src/server/game/player.ts
// What the game knows of a player, read with his own session (row-level security: his rows only).

import { z } from 'zod';
import { gameErrorFrom } from './errors.ts';
import { balanceOf, type GameDb } from './wallet.ts';

export interface PlayerState {
  readonly userId: string;
  readonly pseudo: string;
  readonly clubId: string | null;
  readonly credits: number;
  /** Closed packs, oldest first. */
  readonly packs: readonly { id: string; type: string; source: string }[];
  /** Owned cards (copies included), oldest first. */
  readonly cardIds: readonly string[];
}

const packRow = z.object({ id: z.string().uuid(), type: z.string(), source: z.string() });

export async function loadPlayer(db: GameDb, userId: string): Promise<PlayerState | null> {
  const profile = await db.from('profiles').select('pseudo, club_id').eq('id', userId).maybeSingle();
  if (profile.error) throw gameErrorFrom(profile.error);
  if (!profile.data) return null;
  const [packs, cards, credits] = await Promise.all([
    db.from('user_packs').select('id, type, source').eq('user_id', userId).is('opened_at', null).order('created_at'),
    db.from('card_items').select('card_id').eq('user_id', userId).order('created_at'),
    balanceOf(db, userId),
  ]);
  if (packs.error) throw gameErrorFrom(packs.error);
  if (cards.error) throw gameErrorFrom(cards.error);
  return {
    userId,
    pseudo: profile.data.pseudo,
    clubId: profile.data.club_id,
    credits,
    packs: z.array(packRow).parse(packs.data),
    cardIds: cards.data.map((c) => c.card_id),
  };
}
```

Check the column names against `supabase/migrations/20261007091000_game_cards.sql` (`card_items.card_id`, `created_at`) and adjust if they differ.

```ts
// apps/web/src/server/game/stage.ts
// Where a visitor belongs: the welcome steps come in order, the game shell only after them.

import type { PlayerState } from './player.ts';

export type Stage = 'start' | 'club' | 'pack' | 'playing';

export const STAGE_PATH: Readonly<Record<Stage, string>> = {
  start: '/jouer/bienvenue',
  club: '/jouer/bienvenue/club',
  pack: '/jouer/bienvenue/pack',
  playing: '/jouer',
};

export function stageOf(state: PlayerState | null): Stage {
  if (!state) return 'start';
  if (!state.clubId) return 'club';
  if (state.packs.some((p) => p.source === 'starter')) return 'pack';
  return 'playing';
}
```

Run the test — Expected: PASS.

- [ ] **Step 3: Failing database test for `loadPlayer` and the replayed starter opening**

```ts
// apps/web/test-db/player.test.ts
import { WORLD } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { loadPlayer } from '@/server/game/player.ts';
import { chooseClub, openUserPack } from '@/server/game/packs.ts';
import { claimWelcome } from '@/server/game/wallet.ts';
import { stageOf } from '@/server/game/stage.ts';
import { admin, newGuest } from './harness.ts';

const n2 = WORLD.clubs.find((c) => c.divisionId.startsWith('n2'))!;

describe('the player state', () => {
  it('follows a guest from the start to the game, with a National 2 club', async () => {
    const guest = await newGuest();
    expect(stageOf(await loadPlayer(guest.client, guest.id))).toBe('club');
    await claimWelcome(admin, guest.id);
    const packId = await chooseClub(admin, guest.id, n2.id);
    const before = await loadPlayer(guest.client, guest.id);
    expect(before?.credits).toBe(1000);
    expect(stageOf(before)).toBe('pack');
    // The page asks twice (reload): same request id, same cards.
    const first = await openUserPack(admin, guest.id, packId, packId);
    const again = await openUserPack(admin, guest.id, packId, packId);
    expect(again.cardIds).toEqual(first.cardIds);
    const after = await loadPlayer(guest.client, guest.id);
    expect(after?.cardIds).toHaveLength(18);
    expect(stageOf(after)).toBe('playing');
  });

  it('reads nothing of another player', async () => {
    const [a, b] = [await newGuest(), await newGuest()];
    expect(await loadPlayer(a.client, b.id)).toBeNull();
  });
});
```

Run: `pnpm --filter @legendes/web test:db` — Expected: FAIL only if something is wrong; it must at least compile against the real code. If it passes straight away (all code exists after Step 2), check it is not vacuous: temporarily make `stageOf` return `'playing'` when packs exist and see the first test fail, then restore.

- [ ] **Step 4: Session and admin clients, proxy, env**

In `env.ts`, add:

```ts
/** The game needs Supabase: a clear error instead of a broken page when it is not configured. */
export function gameEnv(): { url: string; publishableKey: string; secretKey: string } {
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)');
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY,
  };
}
```

```ts
// apps/web/src/lib/supabase/session.ts
// The visitor's own Supabase client: his session lives in cookies, row-level security applies.
import 'server-only';
import type { Database } from '@legendes/shared';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { gameEnv } from '@/env';

export async function sessionClient() {
  const { url, publishableKey } = gameEnv();
  const store = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
```

```ts
// apps/web/src/lib/supabase/admin.ts
// The server's own client (service role): the only one allowed to write anything of value.
import 'server-only';
import type { Database } from '@legendes/shared';
import { createClient } from '@supabase/supabase-js';
import { gameEnv } from '@/env';
import type { GameDb } from '@/server/game/wallet';

export function adminClient(): GameDb {
  const { url, secretKey } = gameEnv();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

```ts
// apps/web/src/proxy.ts
// Refreshes the guest's session cookies on the game's pages (Supabase SSR), nothing else.
import type { Database } from '@legendes/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/jouer/:path*'] };
```

If the `sessionClient()` type is not assignable to `GameDb` in `loadPlayer` (generic parameters of `createServerClient`), widen `GameDb` in `wallet.ts` to `SupabaseClient<Database, 'public'>` — never cast to `any`.

- [ ] **Step 5: `current.ts` and the Server Actions**

```ts
// apps/web/src/app/jouer/current.ts
import 'server-only';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/session';
import { loadPlayer, type PlayerState } from '@/server/game/player';
import { STAGE_PATH, stageOf, type Stage } from '@/server/game/stage';

export async function currentPlayer(): Promise<PlayerState | null> {
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  return data.user ? loadPlayer(db, data.user.id) : null;
}

/** The player, when he is at this stage; otherwise he is sent where he belongs. */
export async function requireStage(stage: Stage): Promise<PlayerState> {
  const player = await currentPlayer();
  const actual = stageOf(player);
  if (actual !== stage || !player) redirect(STAGE_PATH[actual] as never);
  return player;
}
```

(Replace `as never` by the route type expected by `redirect` under `typedRoutes` if the compiler offers one; `STAGE_PATH` can be typed `Record<Stage, Route>` with `import type { Route } from 'next'`.)

```ts
// apps/web/src/app/jouer/actions.ts
'use server';

import { getClub } from '@legendes/data';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { sessionClient } from '@/lib/supabase/session';
import { GameError } from '@/server/game/errors';
import { chooseClub, openUserPack } from '@/server/game/packs';
import { claimWelcome } from '@/server/game/wallet';
import { currentPlayer } from './current';

/** "Commencer": an anonymous account (no form), and the welcome credits. */
export async function startAsGuest(): Promise<void> {
  const db = await sessionClient();
  let { data } = await db.auth.getUser();
  if (!data.user) {
    const signIn = await db.auth.signInAnonymously();
    if (signIn.error || !signIn.data.user) throw new GameError('unexpected', signIn.error?.message);
    data = { user: signIn.data.user };
  }
  await claimWelcome(adminClient(), data.user.id);
  redirect('/jouer/bienvenue/club');
}

const clubForm = z.object({ clubId: z.string().min(1).refine((id) => getClub(id) !== undefined) });

export async function pickClub(form: FormData): Promise<void> {
  const player = await currentPlayer();
  if (!player) redirect('/jouer/bienvenue');
  const { clubId } = clubForm.parse({ clubId: form.get('clubId') });
  await chooseClub(adminClient(), player.userId, clubId);
  redirect('/jouer/bienvenue/pack');
}

/** Opens the starter pack; the pack's id is the request id, so a reload gets the same cards. */
export async function openStarter(): Promise<{ cardIds: string[] }> {
  const player = await currentPlayer();
  const pack = player?.packs.find((p) => p.source === 'starter');
  if (!player || !pack) throw new GameError('pack_not_found');
  const opened = await openUserPack(adminClient(), player.userId, pack.id, pack.id);
  return { cardIds: [...opened.cardIds] };
}
```

- [ ] **Step 6:** `pnpm check` and `pnpm --filter @legendes/web test:db` — Expected: all green (30 tests: 28 + 2). Commit — `feat(web): guest sessions in cookies, the player's state and the welcome stages`.

---

### Task 5: L'accueil — commencer, choisir son club, ouvrir son pack

**Files:**
- Create: `apps/web/src/app/jouer/bienvenue/layout.tsx`, `page.tsx`, `club/page.tsx`, `pack/page.tsx`, `apps/web/src/components/welcome/club-picker.tsx`, `apps/web/src/components/welcome/starter-opening.tsx`, `apps/web/src/app/jouer/error.tsx`, `apps/web/src/lib/game-errors.ts`
- Modify: `apps/web/messages/fr.json` (`game.welcome`, `game.errors`)
- Test: `apps/web/src/lib/game-errors.test.ts`

**Interfaces:**
- Consumes: `requireStage`, `startAsGuest`, `pickClub`, `openStarter` (tâche 4), `<PackOpening>` (tâche 3), `STARTER_MIX`, `STARTER_CLUB_CARDS`, `findCard` (data).
- Produces: `errorKey(error: unknown): GameErrorCode` dans `lib/game-errors.ts`.

- [ ] **Step 1: Failing test — every error code has a French message**

```ts
// apps/web/src/lib/game-errors.test.ts
import { describe, expect, it } from 'vitest';
import messages from '../../messages/fr.json';
import { GAME_ERROR_CODES, GameError } from '@/server/game/errors';
import { errorKey } from './game-errors';

describe('game errors', () => {
  it('has a French message for every code', () => {
    for (const code of GAME_ERROR_CODES) expect(messages.game.errors[code]).toBeTruthy();
  });
  it('maps a GameError to its code and anything else to unexpected', () => {
    expect(errorKey(new GameError('insufficient_funds'))).toBe('insufficient_funds');
    expect(errorKey(new Error('boom'))).toBe('unexpected');
  });
});
```

Run — Expected: FAIL.

- [ ] **Step 2: Implement** `lib/game-errors.ts`:

```ts
import { GameError, type GameErrorCode } from '@/server/game/errors';

/** The message key of an error shown to the player (never the raw message). */
export const errorKey = (error: unknown): GameErrorCode =>
  error instanceof GameError ? error.code : 'unexpected';
```

Add to `fr.json` `game.errors` one sentence per code of `GAME_ERROR_CODES` (`insufficient_funds`: « Pas assez de crédits. », `pack_not_found`: « Ce pack n'existe pas ou n'est plus à toi. », `pack_already_opened`: « Ce pack est déjà ouvert. », `club_already_chosen`: « Ton club est déjà choisi. », `club_not_eligible`: « Ce club ne fait pas partie du jeu. », `club_not_chosen`: « Choisis d'abord ton club. », `unknown_card`, `wrong_card_count`, `empty_pack`, `invalid_amount`, `invalid_price`, `invalid_pack`: « Le tirage n'a pas pu être enregistré. Réessaie. », `profile_not_found`: « Ta session a expiré. Recommence depuis l'accueil. », `unexpected`: « Quelque chose s'est mal passé. Réessaie. »). Run — PASS.

- [ ] **Step 3: The three screens.** Texts under `game.welcome`:

```json
"welcome": {
  "title": "Légendes du Dimanche",
  "pitch": "Ton club, tes cartes, ton dimanche. Choisis ton club, ouvre ton premier pack et compose ton onze.",
  "start": "Commencer",
  "guest": "Sans inscription : tu joues en invité, ta progression reste sur cet appareil.",
  "clubTitle": "Choisis ton club",
  "clubIntro": "Le club que tu soutiens, de District 5 à National 2. Ses joueurs seront le cœur de ton pack de départ.",
  "search": "Chercher un club ou une ville",
  "confirm": "Choisir {club}",
  "final": "Choix définitif",
  "packTitle": "Ton pack de départ",
  "continue": "Découvrir mon équipe"
}
```

- `bienvenue/layout.tsx` : fond de nuit de la coque (mêmes calques que `GameShell`) sans barre ni onglets.
- `bienvenue/page.tsx` (serveur) : `const player = await currentPlayer(); if (stageOf(player) !== 'start') redirect(STAGE_PATH[stageOf(player)])` ; titre, phrase, `<form action={startAsGuest}><button>…</button></form>` (bouton jaune `TileButton` en `<button type="submit">`), mention invité.
- `bienvenue/club/page.tsx` (serveur) : `await requireStage('club')` ; passe à `<ClubPicker>` la liste `WORLD.clubs` triée par niveau (`COMPETITION_LEVELS` : national, régional, district) puis rang puis nom, chaque entrée `{ id, name, city, division: divisionLabel(...) }`.
- `club-picker.tsx` (client) : champ de recherche (nom ou ville, insensible aux accents : `normalize('NFD').replace(/\p{Diacritic}/gu, '')`), liste groupée par division avec `<Crest>`, sélection → panneau de confirmation (blason, maillot domicile `<Kit full>`, stade, « Choix définitif ») avec `<form action={pickClub}><input type="hidden" name="clubId" …/>`. Sur mobile, la liste occupe l'écran et le panneau glisse du bas.
- `bienvenue/pack/page.tsx` (serveur) : `const player = await requireStage('pack')` ; titre, composition (`packs.starterMix` avec `STARTER_CLUB_CARDS` et `STARTER_MIX`), `<StarterOpening />`.
- `starter-opening.tsx` (client) : au montage appelle `openStarter()` (une seule fois : garde `useRef`), reconstruit les cartes avec `findCard` (ignore et signale en console un id introuvable), puis rend `<PackOpening type="starter" cards={cards} onDone={() => router.push('/jouer/equipes?accueil=1')} />`. En cas d'erreur : message `game.errors[errorKey(e)]` et bouton « Réessayer » qui relance l'appel (même `request_id` : mêmes cartes).
- `jouer/error.tsx` (client, convention Next) : message `game.errors.unexpected` + bouton « Réessayer » (`reset`).

- [ ] **Step 4: Verify in the browser pane** (`pnpm db:start`, `pnpm dev`) : en navigation privée, `/jouer` → `/jouer/bienvenue` → Commencer → choisir un club de N2 → l'ouverture du pack de départ va jusqu'au récapitulatif (18 cartes, de l'or) → « Découvrir mon équipe ». Recharger `/jouer/bienvenue/pack` pendant l'animation renvoie les mêmes cartes ou mène à `/jouer` une fois le pack ouvert. Vérifier aussi à 375 px.
- [ ] **Step 5:** `pnpm check`, commit — `feat(web): the welcome — start as a guest, pick any club, open the starter pack`.

---

### Task 6: La coque et sa navigation

**Files:**
- Create: `apps/web/src/app/jouer/(jeu)/layout.tsx`, `apps/web/src/components/shell/game-nav.tsx`, `apps/web/src/components/shell/coming-soon.tsx`, pages `apps/web/src/app/jouer/(jeu)/{solo,en-ligne,transferts,boutique}/page.tsx`
- Modify: `apps/web/src/components/shell/game-shell.tsx`, `apps/web/messages/fr.json` (`game.soon`)

**Interfaces:**
- Consumes: `requireStage('playing')`, `getClub`.
- Produces: `GAME_TABS: readonly { id: GameTab; href: Route; icon: IconName }[]` exporté de `game-nav.tsx` ; `<ComingSoon title body phase />`.

- [ ] **Step 1:** Move the tab list of `game-shell.tsx` to `game-nav.tsx` (client component, `usePathname`) with real `Link`s: home `/jouer`, solo `/jouer/solo`, online `/jouer/en-ligne`, squads `/jouer/equipes`, transfers `/jouer/transferts`, store `/jouer/boutique`, club `/jouer/mon-club`. Active tab: exact match for `/jouer`, prefix match (`pathname === href || pathname.startsWith(href + '/')`) for the others. On a phone, « Plus » is a `<details>` whose panel lists En ligne and Transferts. `GameShell` drops its `active` prop and renders `<GameNav />`; the shop icon of the bar links to `/jouer/boutique`.
- [ ] **Step 2:** `(jeu)/layout.tsx` (server): `const player = await requireStage('playing'); const club = getClub(player.clubId ?? '')` (no club → `redirect(STAGE_PATH.club)`); `<GameShell player={{ club, credits: player.credits, record: { wins: 0, draws: 0, losses: 0 }, level: 1, xp: 0, nextLevelXp: 500, packsWaiting: player.packs.length }}>{children}</GameShell>`. Record and XP stay at zero until plan C records matches (comment it in the layout).
- [ ] **Step 3:** `coming-soon.tsx`: a `Tile tone="muted"` with title, body and a « Bientôt » badge. Pages and texts (`game.soon`):
  - `solo` : « Carrière, Matchs de la semaine, défis de composition et Onze du week-end arrivent avec le premier match. »
  - `en-ligne` : « Le Championnat en ligne et Le Dimanche : affronte d'autres joueurs (Phases 7 et 8). »
  - `transferts` : « Le marché des transferts : achète et vends des cartes (Phase 6). »
  - `boutique` : « Les packs à acheter avec tes crédits, probabilités affichées. »
- [ ] **Step 4:** Browser pane: every tab is reachable at 1440 px and 375 px, the active tab is lit, no horizontal scroll. `pnpm check`, commit — `feat(web): the game shell — club bar and the seven tabs`.

---

### Task 7: Équipes — le onze automatique et les collectifs expliqués

**Files:**
- Create: `apps/web/src/app/jouer/(jeu)/equipes/page.tsx`, `apps/web/src/components/team/pitch-view.tsx`, `apps/web/src/server/game/collection.ts`
- Modify: `apps/web/messages/fr.json` (`game.squads`)
- Test: `apps/web/src/server/game/collection.test.ts`

**Interfaces:**
- Consumes: `bestSquad`, `autoSquad`, `FORMATIONS`, `findCard`, `PlayerState`.
- Produces: `cardsOf(cardIds: readonly string[]): PackCard[]` (cartes connues, ids inconnus ignorés) dans `server/game/collection.ts`.

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/server/game/collection.test.ts
import { openStarterPack, WORLD } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { cardsOf } from './collection';

describe('cards of a collection', () => {
  it('rebuilds known cards and skips unknown ids', () => {
    const ids = openStarterPack(WORLD.clubs[0]!, 's').cards.map((c) => c.card.id);
    const cards = cardsOf([...ids, 'nobody-2026-27-99']);
    expect(cards.map((c) => c.card.id)).toEqual(ids);
  });
});
```

Run — FAIL. Implement:

```ts
// apps/web/src/server/game/collection.ts
import { findCard, type PackCard } from '@legendes/data';

/** The owned cards, recomputed from their ids (an id the game no longer knows is skipped). */
export const cardsOf = (cardIds: readonly string[]): PackCard[] =>
  cardIds.flatMap((id) => {
    const found = findCard(id);
    return found ? [found] : [];
  });
```

Run — PASS.

- [ ] **Step 2: The page.** `equipes/page.tsx` (server) reads `searchParams` (`Promise<{ formation?: string; accueil?: string }>`), validates `formation` with `z.enum(FORMATIONS)`; squad = `formation ? autoSquad(cards, formation) : bestSquad(cards)`. Layout: on the left the pitch, on the right a panel « Note du onze », « Collectif {n} / 33 », formation picker (links `?formation=…`, typed routes), bench (7 small cards). With `accueil=1`, a banner at the top (`game.squads.intro`): « Voici ton onze, composé automatiquement. Les joueurs d'un même club (2, 4, 7) ou d'un même district (3, 5, 8) jouent mieux ensemble : jusqu'à +3 chacun, 33 pour l'équipe. » and a button « Continuer vers La Une » (`/jouer`).
- [ ] **Step 3: `pitch-view.tsx`** (server component): a mown pitch (stripes like the shell background, white lines in SVG), each slot at `left: x*100%`, `top: (1 - y)*100%` (attack at the top), a `<PlayerCard>` (`w-14 sm:w-20 md:w-24`) and under it three dots for its collective points (lit = earned), a dimmed card and the label « Hors poste » when `!inPosition`, an empty outline with the position name for an empty slot.
- [ ] **Step 4:** Browser pane with a real guest: the starter of a D5 club and of an N2 club, each formation of the picker; 375 px readable (cards stay inside the pitch). `pnpm check`, commit — `feat(web): squads — the automatic eleven on the pitch, collectives explained`.

---

### Task 8: La Une et Mon club sur les vraies données

**Files:**
- Create: `apps/web/src/app/jouer/(jeu)/page.tsx`, `apps/web/src/app/jouer/(jeu)/mon-club/page.tsx`, `apps/web/src/components/shell/home-tiles.tsx`
- Delete: `apps/web/src/app/lab/une/page.tsx` (la maquette est remplacée) ; supprimer `game.home.mockup` de `fr.json`
- Modify: `apps/web/messages/fr.json` (`game.home`, `game.collection`)

**Interfaces:**
- Consumes: `requireStage`, `cardsOf`, `bestSquad`, `<PackArt>`, `<Tile>`, `<TileButton>`, `matchKits`, `clubsOf`.

- [ ] **Step 1: La Une** (`(jeu)/page.tsx`, server). Move the tiles of the mockup into `home-tiles.tsx` as separate components taking real props, and render:
  - **Premier match** (héroïne) : ton club contre l'adversaire de la journée 1 = le premier autre club de sa division par ordre d'`id` (plan C le remplacera par le vrai calendrier) ; maillots `matchKits` ; bouton « Jouer » désactivé avec « Bientôt » (le match arrive au plan C).
  - **Les Fondations** : étapes de la maquette, les deux premières cochées d'après l'état réel (club choisi, pack de départ ouvert), les trois autres à venir (les objectifs en base arrivent au plan C).
  - **Packs à ouvrir** : `player.packs.length` ; sans pack, le texte `game.home.packs.none` (« Aucun pack en attente. Les objectifs et la boutique en donnent. ») et pas de bouton.
  - **Objectifs du jour** : tuile `tone="muted"` « Bientôt ».
  - **Ton onze** : les 3 meilleures cartes du `bestSquad`, sa note ; lien vers `/jouer/equipes`.
  - **Collectifs** : club et district du `bestSquad` (nombre de joueurs à leur poste et points), total sur 33.
  - **Le Dimanche** : « Bientôt ».
- [ ] **Step 2: Mon club** (`mon-club/page.tsx`) : en-tête avec blason, nom, division, « {n} cartes » ; grille de toutes les cartes possédées (`PlayerCard w-28 sm:w-32`), la plus précieuse d'abord (`cardValue` décroissant), filtres par classe en liens `?classe=bronze|argent|or` validés par Zod ; un exemplaire en double porte un badge « ×2 ».
- [ ] **Step 3:** Delete `/lab/une`. Browser pane: the whole first session from a private window, then each tab. `pnpm check`, commit — `feat(web): La Une and Mon club on the player's own data`.

---

### Task 9: Décisions et avancement

**Files:**
- Modify: `docs/DECISIONS.md` (D-042), `docs/ROADMAP.md` (avancement Phase 4), `CLAUDE.md` (ligne de phase), `docs/GDD.md` §6.2 (une phrase sur la ligue dans le pilote)

- [ ] **Step 1:** D-042 « La coque, l'accueil et le onze automatique (Phase 4, plan B) » :
  - parcours `/jouer` gardé par `stageOf` (début, club, pack, jeu) ; session invitée en cookies (`@supabase/ssr`, `src/proxy.ts`) ; lectures avec la session (RLS), écritures par Server Actions et `service_role` ;
  - le pack de départ s'ouvre dans la scène du labo (`components/pack/`), son `request_id` est l'id du pack (un rechargement rend les mêmes cartes) ;
  - collectifs : club et district ; **la ligue n'est pas comptée tant que le pilote n'a qu'une ligue** (elle donnerait +3 à tous) ; composition automatique = meilleur total notes + collectifs, formation choisie parmi les 11 ;
  - record et XP à zéro jusqu'au plan C ; e-mail reporté au plan C.
- [ ] **Step 2:** ROADMAP : « ✅ plan B — coque, accueil (tout club du pilote), pack de départ à l'écran, onze automatique et collectifs (D-042). À venir : plan C (match, objectifs, boutique, bout en bout). » ; même mise à jour dans la ligne de phase de `CLAUDE.md`.
- [ ] **Step 3:** `pnpm check`, `pnpm --filter @legendes/web test:db`, commit — `docs: D-042 — the game shell, the welcome and the automatic squad`.

---

## Self-review (fait à l'écriture)

- Spec §3 étapes 1-4 : tâches 4, 5, 7 ; étapes 5-6 (Fondations réelles, premier match) : plan C, annoncé. §4 coque, onglets, mobile, « Bientôt » : tâche 6 ; La Une : tâche 8 ; maquette validée reprise. §6 pack de départ (révisé le 09/10) : affichage de la composition, tâche 5. §9 `lib/supabase/*`, `components/shell/*`, `app/jouer/*` : tâches 4 à 8. §10 messages d'erreur français : tâche 5 ; pack conservé si le réseau tombe : le pack reste fermé tant que `open_pack` n'a pas réussi, et un nouvel appel rend les mêmes cartes une fois ouvert (tâche 4).
- Noms vérifiés d'une tâche à l'autre : `PackArtType`, `buildPackAssets`, `PackOpening`, `PlayerState`, `loadPlayer`, `stageOf`, `STAGE_PATH`, `requireStage`, `currentPlayer`, `startAsGuest`, `pickClub`, `openStarter`, `cardsOf`, `autoSquad`, `bestSquad`, `collectiveOf`.
- Review Focus : 1 → tâche 4 step 3 ; 2 → tâche 4 step 1 ; 3 et 4 → tâche 1 step 5 ; 5 → tâche 4 step 3 et tâche 1 step 5.
