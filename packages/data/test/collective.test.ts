import { describe, expect, it } from 'vitest';
import { collectiveOf, COLLECTIVE_MAX, type CollectiveMember } from '../src/index.ts';

const m = (clubId: string, districtId = 'd1', inPosition = true): CollectiveMember => ({
  clubId,
  districtId,
  inPosition,
});
/** Players with nothing in common with anyone. */
const strangers = (n: number): CollectiveMember[] =>
  Array.from({ length: n }, (_, i) => m(`z${i}`, `far${i}`));

describe('collectives', () => {
  it('follows the club steps: 2 → +1, 4 → +2, 7 → +3', () => {
    expect(collectiveOf([m('a', 'x'), m('a', 'y'), ...strangers(9)]).perPlayer.slice(0, 2)).toEqual(
      [1, 1],
    );
    expect(
      collectiveOf([...Array<CollectiveMember>(4).fill(m('a', 'x')), ...strangers(7)]).perPlayer[0],
    ).toBe(2);
    expect(
      collectiveOf([...Array<CollectiveMember>(7).fill(m('a', 'x')), ...strangers(4)]).perPlayer[0],
    ).toBe(3);
  });

  it('takes the best of club and district', () => {
    // 2 of the club (+1) but 5 of the district (+2).
    const lineup = [m('a'), m('a'), m('b'), m('c'), m('e'), ...strangers(6)];
    expect(collectiveOf(lineup).perPlayer.slice(0, 5)).toEqual([2, 2, 2, 2, 2]);
  });

  it('gives nothing to, and takes nothing from, a player out of position', () => {
    const lineup = [m('a'), m('a', 'd1', false), ...strangers(9)];
    expect(collectiveOf(lineup).perPlayer.slice(0, 2)).toEqual([0, 0]);
  });

  it('caps the team at 33 and scores an empty slot 0', () => {
    expect(collectiveOf(Array<CollectiveMember>(11).fill(m('a'))).total).toBe(COLLECTIVE_MAX);
    expect(collectiveOf([null, ...Array<CollectiveMember>(10).fill(m('a'))]).perPlayer[0]).toBe(0);
  });
});
