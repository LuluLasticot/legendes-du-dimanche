import { describe, expect, it } from 'vitest';
import {
  applyPassError,
  backgroundPlayers,
  DEFAULT_KEEPER_TUNING,
  chooseReceiver,
  isOffside,
  keeperSetPosition,
  markerSetups,
  offsideLineX,
  passBall,
  passerProfile,
  PASS_LAYOUTS,
  passLayout,
  receptionTicks,
  RECEIVER_RUN_SPEED,
  simulatePassMoment,
  solvePass,
  type DefenderAttributes,
  type KeeperAttributes,
  type PassLayout,
} from '../src/moments/index.ts';
import { DEFAULT_PHYSICS, PITCH, v3, type Vec3 } from '../src/physics/index.ts';
import { Rng } from '../src/rng/index.ts';

const KEEPER: KeeperAttributes = {
  diving: 70,
  handling: 70,
  reflexes: 70,
  speed: 65,
  positioning: 70,
  heightCm: 186,
};
const MARKER: DefenderAttributes = { pace: 70, defending: 70, physical: 70, heightCm: 182 };

/** X of the offside line of a layout, keeper set for the passer's ball. */
function lineOf(layout: PassLayout): number {
  const keeperFeet = keeperSetPosition(layout.ball, KEEPER, DEFAULT_KEEPER_TUNING);
  return offsideLineX(layout.ball.x, layout.markers, keeperFeet);
}

describe('offside line', () => {
  it('is the second-last opponent, the keeper counting as one', () => {
    const keeper = v3(51, 0, 0);
    expect(offsideLineX(30, [v3(40, 0, 0), v3(45, 0, 3)], keeper)).toBe(45);
    // The keeper has come out: he is no longer the last man.
    expect(offsideLineX(30, [v3(40, 0, 0), v3(50, 0, 3)], v3(46, 0, 0))).toBe(46);
  });

  it('never puts a player offside in front of the ball or in his own half', () => {
    expect(offsideLineX(48, [v3(40, 0, 0), v3(45, 0, 3)], v3(51, 0, 0))).toBe(48);
    expect(offsideLineX(-20, [v3(-30, 0, 0), v3(-25, 0, 3)], v3(-28, 0, 0))).toBe(0);
    expect(isOffside(v3(10, 0, 0), 10, -5)).toBe(false);
    expect(isOffside(v3(11, 0, 0), 10, -5)).toBe(true);
  });
});

describe('pass layouts', () => {
  it('offer a choice: at least two onside teammates and one offside', () => {
    for (const layout of PASS_LAYOUTS) {
      const line = lineOf(layout);
      const offside = layout.receivers.filter((r) => isOffside(r, line, layout.ball.x));
      expect(layout.receivers.length).toBeGreaterThanOrEqual(3);
      expect(offside.length).toBeGreaterThanOrEqual(1);
      expect(layout.receivers.length - offside.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keep the teammates apart and off the markers', () => {
    for (const layout of PASS_LAYOUTS) {
      const all: Vec3[] = [layout.ball, ...layout.receivers, ...layout.markers];
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++)
          expect(
            Math.hypot(
              (all[i] as Vec3).x - (all[j] as Vec3).x,
              (all[i] as Vec3).z - (all[j] as Vec3).z,
            ),
          ).toBeGreaterThan(2.5);
    }
  });
});

describe('several receivers', () => {
  const layout = passLayout(1);
  const receivers = layout.receivers.map((from) => ({
    from,
    pace: 80,
    speed: RECEIVER_RUN_SPEED,
    run: v3(1, 0, 0),
  }));
  const profile = passerProfile({ passing: 80, composure: 70 }, 0);

  const play = (target: Vec3, seed: number, offside = true, markers = 0) => {
    const chosen = chooseReceiver(receivers, target, RECEIVER_RUN_SPEED);
    const wanted = receptionTicks(
      (receivers[chosen] as { from: Vec3 }).from,
      target,
      80,
      RECEIVER_RUN_SPEED,
    );
    const solution = solvePass(layout.ball, target, wanted, profile, DEFAULT_PHYSICS, 'grass');
    const velocity = applyPassError(solution.velocity, profile, Rng.create(seed));
    return {
      chosen,
      result: simulatePassMoment({
        ball: passBall(layout.ball, velocity),
        physics: DEFAULT_PHYSICS,
        surface: 'grass',
        receivers,
        offside,
        keeper: { attributes: KEEPER },
        defenders: markerSetups(layout, markers, MARKER),
        seed: seed + 1,
      }),
    };
  };

  it('a pass goes to the teammate it is played to', () => {
    for (const index of [0, 1]) {
      const at = layout.receivers[index] as Vec3;
      const target = v3(at.x + 4, 0, at.z);
      expect(chooseReceiver(receivers, target, RECEIVER_RUN_SPEED)).toBe(index);
    }
  });

  it('is received by the teammate aimed at, the others keep running', () => {
    const at = layout.receivers[0] as Vec3;
    let received = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { result } = play(v3(at.x + 5, 0, at.z - 1), seed);
      if (result.outcome !== 'received') continue;
      received++;
      const event = result.events.find((e) => e.type === 'received');
      expect(event && 'by' in event ? event.by : -1).toBe(0);
      const first = result.states[0];
      const last = result.states[result.states.length - 1];
      // The teammate who was not aimed at has run on, towards the goal.
      expect(
        (last?.receivers[1]?.feet.x ?? 0) - (first?.receivers[1]?.feet.x ?? 0),
      ).toBeGreaterThan(1);
    }
    expect(received).toBeGreaterThan(15);
  });

  it('flags a pass met by a teammate who started beyond the line', () => {
    const at = layout.receivers[2] as Vec3;
    const target = v3(at.x + 3, 0, at.z);
    let flagged = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { chosen, result } = play(target, seed, true, layout.markers.length);
      expect(chosen).toBe(2);
      if (result.outcome === 'offside') flagged++;
      expect(result.outcome).not.toBe('received');
    }
    expect(flagged).toBeGreaterThan(15);
    // Without the rule the same pass is received.
    const { result } = play(target, 3, false, layout.markers.length);
    expect(result.outcome).toBe('received');
  });

  it('is deterministic', () => {
    const at = layout.receivers[1] as Vec3;
    const target = v3(at.x + 4, 0, at.z);
    expect(play(target, 5).result.outcome).toBe(play(target, 5).result.outcome);
    expect(play(target, 5).result.states.length).toBe(play(target, 5).result.states.length);
  });

  it('lets the pitch keep its geometry: nobody starts off it', () => {
    for (const layout of PASS_LAYOUTS)
      for (const r of layout.receivers) {
        expect(r.x).toBeLessThan(PITCH.goalLineX);
        expect(Math.abs(r.z)).toBeLessThan(PITCH.width / 2);
      }
  });
});

describe('background players and the offside line', () => {
  it('never move the line nor stand offside themselves', () => {
    for (const layout of PASS_LAYOUTS) {
      const keeper = keeperSetPosition(layout.ball, KEEPER, DEFAULT_KEEPER_TUNING);
      const line = offsideLineX(layout.ball.x, layout.markers, keeper);
      const busy = [layout.ball, keeper, ...layout.receivers, ...layout.markers];
      const players = backgroundPlayers('pass', layout.ball, busy, 12, { offsideLine: line });
      expect(players.length).toBeGreaterThanOrEqual(6);
      const defenders = players.filter((p) => p.side === 'defend').map((p) => p.feet);
      // Whatever the camera shows as the last line is the line the rule uses.
      expect(offsideLineX(layout.ball.x, [...layout.markers, ...defenders], keeper)).toBe(line);
      for (const p of players.filter((q) => q.side === 'attack'))
        expect(isOffside(p.feet, line, layout.ball.x)).toBe(false);
      // The trap is still a trap, the others still onside.
      const flags = layout.receivers.map((r) => isOffside(r, line, layout.ball.x));
      expect(flags.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    }
  });
});
