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
    const { data: pack } = await admin
      .from('user_packs')
      .select('opened_at')
      .eq('id', packId)
      .single();
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
    const args = {
      p_user: id,
      p_pack: packId,
      p_seed: 'test',
      p_cards: cards,
      p_request: request(),
    };
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

  it("refuses a pack that is not the player's", async () => {
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
    const { data: pack } = await admin
      .from('user_packs')
      .select('opened_at')
      .eq('id', packId)
      .single();
    expect(pack?.opened_at).toBeNull();
  });

  it('refuses an empty draw and a draw of the wrong size', async () => {
    const { id, packId, cards } = await guestWithBronzePack();
    const base = { p_user: id, p_pack: packId, p_seed: 'test', p_request: request() };
    expect((await admin.rpc('open_pack', { ...base, p_cards: [] })).error?.message).toBe(
      'empty_pack',
    );
    expect(
      (await admin.rpc('open_pack', { ...base, p_request: request(), p_cards: cards.slice(0, 3) }))
        .error?.message,
    ).toBe('wrong_card_count');
  });
});
