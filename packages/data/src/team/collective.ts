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
  return {
    perPlayer,
    total: Math.min(
      COLLECTIVE_MAX,
      perPlayer.reduce((a, b) => a + b, 0),
    ),
  };
}
