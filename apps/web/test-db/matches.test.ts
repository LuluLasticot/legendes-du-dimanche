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
});
