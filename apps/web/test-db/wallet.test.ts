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
    expect(
      (await admin.rpc('choose_club', { p_user: id, p_club: 'no-such-club' })).error?.message,
    ).toBe('club_not_eligible');
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
