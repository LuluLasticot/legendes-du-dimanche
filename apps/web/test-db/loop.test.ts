import { describe, expect, it } from 'vitest';
import { admin, newGuest } from './harness.ts';

const request = (): string => crypto.randomUUID();
const setup = { seed: 1 };
const options = { userSide: 0, pauseAtHalfTime: true };

async function playing(): Promise<{
  id: string;
  client: Awaited<ReturnType<typeof newGuest>>['client'];
  cards: string[];
}> {
  const g = await newGuest();
  const club = (await admin.from('clubs').select('id').limit(1).single()).data!.id;
  const pack = (await admin.rpc('choose_club', { p_user: g.id, p_club: club })).data!;
  const defs = (await admin.from('card_defs').select('id').limit(18)).data!.map((c) => c.id);
  await admin.rpc('open_pack', {
    p_user: g.id,
    p_pack: pack,
    p_seed: 's',
    p_cards: defs,
    p_request: pack,
  });
  return { ...g, cards: defs };
}

describe('matches', () => {
  it('records a match once: one credit line, the same answer again', async () => {
    const g = await playing();
    const match = (
      await admin.rpc('create_match', {
        p_user: g.id,
        p_seed: 7,
        p_setup: setup,
        p_options: options,
        p_request: request(),
      })
    ).data!;
    const args = {
      p_user: g.id,
      p_match: match,
      p_valid: true,
      p_score: [2, 1],
      p_moments_won: 2,
      p_reward: 350,
    };
    expect((await admin.rpc('record_match', args)).data).toBe(350);
    expect((await admin.rpc('record_match', args)).data).toBe(0);
    const lines = await admin
      .from('credit_ledger')
      .select('delta')
      .eq('user_id', g.id)
      .eq('reason', 'match');
    expect(lines.data).toEqual([{ delta: 350 }]);
    const row = await g.client.from('matches').select('status, reward').eq('id', match).single();
    expect(row.data).toEqual({ status: 'validated', reward: 350 });
  });

  it('pays nothing for a rejected match', async () => {
    const g = await playing();
    const match = (
      await admin.rpc('create_match', {
        p_user: g.id,
        p_seed: 7,
        p_setup: setup,
        p_options: options,
        p_request: request(),
      })
    ).data!;
    expect(
      (
        await admin.rpc('record_match', {
          p_user: g.id,
          p_match: match,
          p_valid: false,
          p_score: [9, 0],
          p_moments_won: 9,
          p_reward: 9999,
        })
      ).data,
    ).toBe(0);
    expect(
      (await g.client.from('matches').select('status').eq('id', match).single()).data?.status,
    ).toBe('rejected');
  });

  it('refuses a client calling the writes', async () => {
    const g = await playing();
    const { error } = await g.client.rpc('create_match', {
      p_user: g.id,
      p_seed: 1,
      p_setup: setup,
      p_options: options,
      p_request: request(),
    });
    expect(error).not.toBeNull();
    expect(
      (await g.client.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' }))
        .error,
    ).not.toBeNull();
  });
});

describe('objectives', () => {
  it('rewards the first match once with a bronze pack', async () => {
    const g = await playing();
    expect(
      (await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' })).data,
    ).toBe(1);
    expect(
      (await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'match_played' })).data,
    ).toBe(0);
    const packs = await admin
      .from('user_packs')
      .select('type')
      .eq('user_id', g.id)
      .eq('source', 'objective');
    expect(packs.data).toEqual([{ type: 'bronze' }]);
  });

  it('pays the squad objective in credits', async () => {
    const g = await playing();
    await admin.rpc('advance_objective', { p_user: g.id, p_condition: 'squad_saved' });
    const lines = await admin
      .from('credit_ledger')
      .select('delta')
      .eq('user_id', g.id)
      .eq('reason', 'objective');
    expect(lines.data).toEqual([{ delta: 300 }]);
  });
});

describe('the saved squad', () => {
  it('takes eleven owned cards and completes the squad objective', async () => {
    const g = await playing();
    const { error } = await admin.rpc('save_squad', {
      p_user: g.id,
      p_formation: '4-3-3',
      p_lineup: g.cards.slice(0, 11),
    });
    expect(error).toBeNull();
    expect((await g.client.from('user_objectives').select('objective_id')).data).toEqual([
      { objective_id: 'foundations-squad' },
    ]);
  });

  it('refuses a card not owned, or fewer than eleven', async () => {
    const g = await playing();
    const other = (await admin.from('card_defs').select('id').range(500, 500).single()).data!.id;
    const bad = await admin.rpc('save_squad', {
      p_user: g.id,
      p_formation: '4-3-3',
      p_lineup: [...g.cards.slice(0, 10), other],
    });
    expect(bad.error?.message).toBe('card_not_owned');
    const short = await admin.rpc('save_squad', {
      p_user: g.id,
      p_formation: '4-3-3',
      p_lineup: g.cards.slice(0, 10),
    });
    expect(short.error?.message).toBe('squad_incomplete');
  });
});
