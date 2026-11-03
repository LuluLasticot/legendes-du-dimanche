import { WORLD } from '@legendes/data';
import { sim } from '@legendes/engine';
import { describe, expect, it } from 'vitest';
import { finishMatch, MATCH_OPTIONS, startMatch } from '@/server/game/matches.ts';
import { listObjectives } from '@/server/game/objectives.ts';
import { chooseClub, openUserPack } from '@/server/game/packs.ts';
import { loadPlayer, type PlayerState } from '@/server/game/player.ts';
import { admin, newGuest } from './harness.ts';

const club = WORLD.clubs.find((c) => c.divisionId === 'escaut-d5')!;

async function ready(): Promise<PlayerState> {
  const g = await newGuest();
  const pack = await chooseClub(admin, g.id, club.id);
  await openUserPack(admin, g.id, pack, pack);
  return (await loadPlayer(g.client, g.id))!;
}

/** What a client that lets the coach play sends at full time. */
function played(setup: sim.MatchSetup) {
  const match = new sim.MatchSim(setup, MATCH_OPTIONS);
  const result = match.run((m) => sim.autoResolveMoment(m, setup.conditions));
  return { ...match.inputs, score: [...result.score] };
}

describe('a match, replayed by the server', () => {
  it('validates a true result once, pays it and counts it for the Foundations', async () => {
    const player = await ready();
    const { matchId, setup } = await startMatch(admin, player, crypto.randomUUID());
    expect((await startMatch(admin, player, crypto.randomUUID())).matchId).toBe(matchId);
    const claimed = played(setup);
    const verdict = await finishMatch(admin, player.userId, matchId, claimed);
    expect(verdict.status).toBe('validated');
    expect(verdict.reward).toBeGreaterThan(0);
    expect(await finishMatch(admin, player.userId, matchId, claimed)).toEqual(verdict);
    const lines = await admin
      .from('credit_ledger')
      .select('delta')
      .eq('user_id', player.userId)
      .eq('reason', 'match');
    expect(lines.data).toEqual([{ delta: verdict.reward }]);
    const foundations = await listObjectives(admin, player.userId);
    expect(foundations.find((o) => o.id === 'foundations-match')?.done).toBe(true);
  });

  it('gives the first match a key moment before 3:00', async () => {
    const player = await ready();
    const { setup } = await startMatch(admin, player, crypto.randomUUID());
    const match = new sim.MatchSim(setup, MATCH_OPTIONS);
    while (match.step() && !match.waiting);
    expect(match.pendingMoment?.half).toBe(1);
    expect(match.pendingMoment?.t).toBeLessThan(180);
  });

  it('rejects an inflated score, and inputs that do not fit the match', async () => {
    const player = await ready();
    const first = await startMatch(admin, player, crypto.randomUUID());
    const claimed = played(first.setup);
    const inflated = { ...claimed, score: [claimed.score[0]! + 3, claimed.score[1]] };
    expect(await finishMatch(admin, player.userId, first.matchId, inflated)).toEqual({
      status: 'rejected',
      reward: 0,
      score: null,
    });
    const second = await startMatch(admin, player, crypto.randomUUID());
    expect(second.matchId).not.toBe(first.matchId);
    const garbage = { moments: ['goal', 'goal', 'goal'], changes: [], score: [9, 0] };
    expect((await finishMatch(admin, player.userId, second.matchId, garbage)).status).toBe(
      'rejected',
    );
    const opponentTactic = {
      ...played(second.setup),
      changes: [{ phase: 0, type: 'sub', side: 1, out: 'a', in: 'b' }],
    };
    const third = await startMatch(admin, player, crypto.randomUUID());
    expect((await finishMatch(admin, player.userId, third.matchId, opponentTactic)).status).toBe(
      'rejected',
    );
    const paid = await admin
      .from('credit_ledger')
      .select('delta')
      .eq('user_id', player.userId)
      .eq('reason', 'match');
    expect(paid.data).toEqual([]);
  });

  it('keeps one open match per player, even when two tabs start one at once', async () => {
    const player = await ready();
    const [a, b] = await Promise.all([
      startMatch(admin, player, crypto.randomUUID()),
      startMatch(admin, player, crypto.randomUUID()),
    ]);
    expect(a.matchId).toBe(b.matchId);
    const open = await admin
      .from('matches')
      .select('id')
      .eq('user_id', player.userId)
      .eq('status', 'created');
    expect(open.data).toHaveLength(1);
  });

  it('validates a match whose coach changed his tactics many times at half-time', async () => {
    const player = await ready();
    const { matchId, setup } = await startMatch(admin, player, crypto.randomUUID());
    const match = new sim.MatchSim(setup, MATCH_OPTIONS);
    while (match.step()) {
      if (match.waiting === 'half-time') {
        for (let i = 0; i < 15; i++) {
          match.setTactic(0, { ...match.tacticOf(0), mentality: i % 2 === 0 ? 1 : 0 });
        }
        match.resumeSecondHalf();
      }
      const pending = match.pendingMoment;
      if (pending) match.resolveMoment(sim.autoResolveMoment(pending, setup.conditions));
    }
    const claimed = { ...match.inputs, score: [...match.result().score] };
    expect(claimed.changes.length).toBe(15);
    expect((await finishMatch(admin, player.userId, matchId, claimed)).status).toBe('validated');
  });

  it('gives two tabs the stored match on later matchdays too', async () => {
    const player = await ready();
    const first = await startMatch(admin, player, crypto.randomUUID());
    await finishMatch(admin, player.userId, first.matchId, played(first.setup));
    const [a, b] = await Promise.all([
      startMatch(admin, player, crypto.randomUUID()),
      startMatch(admin, player, crypto.randomUUID()),
    ]);
    expect(a.matchId).toBe(b.matchId);
    const stored = await admin.from('matches').select('setup').eq('id', a.matchId).single();
    expect(a.setup).toEqual(stored.data?.setup);
    expect(b.setup).toEqual(stored.data?.setup);
  });
});
