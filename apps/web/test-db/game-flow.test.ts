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

  it("cannot buy a pack without the credits, and cannot open another player's pack", async () => {
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
    await expect(openUserPack(admin, broke.id, packId, crypto.randomUUID())).rejects.toMatchObject({
      code: 'pack_not_found',
    });
  });
});
