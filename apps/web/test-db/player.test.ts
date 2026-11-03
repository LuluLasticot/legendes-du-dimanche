import { WORLD } from '@legendes/data';
import { describe, expect, it } from 'vitest';
import { chooseClub, openUserPack } from '@/server/game/packs.ts';
import { loadPlayer, starterPackId } from '@/server/game/player.ts';
import { stageOf } from '@/server/game/stage.ts';
import { claimWelcome } from '@/server/game/wallet.ts';
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
    expect(await starterPackId(guest.client, guest.id)).toBe(packId);
    // The page asks twice (a reload): the pack's id is the request id, the cards are the same.
    const first = await openUserPack(admin, guest.id, packId, packId);
    const again = await openUserPack(admin, guest.id, packId, packId);
    expect(again.cardIds).toEqual(first.cardIds);
    const after = await loadPlayer(guest.client, guest.id);
    expect(after?.cardIds).toHaveLength(18);
    expect(stageOf(after)).toBe('playing');
    expect(await starterPackId(guest.client, guest.id)).toBe(packId);
  });

  it('reads nothing of another player', async () => {
    const [a, b] = [await newGuest(), await newGuest()];
    expect(await loadPlayer(a.client, b.id)).toBeNull();
    expect(await starterPackId(a.client, b.id)).toBeNull();
  });
});
