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
    expect((await b.client.from('credit_ledger').select('id').eq('user_id', a.id)).data).toEqual(
      [],
    );
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
    expect((await admin.from('credit_ledger').select('id').eq('user_id', guest.id)).data).toEqual(
      [],
    );
  });

  it('cannot call the server functions, signed in or not', async () => {
    const guest = await newGuest();
    const asGuest = await guest.client.rpc('claim_welcome', {
      p_user: guest.id,
      p_amount: 1_000_000,
    });
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
