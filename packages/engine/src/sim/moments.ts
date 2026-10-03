// Bridge between the match and the 3D key moments (ARCHITECTURE §4.3): the request in world
// coordinates and card attributes mapped to the Phase 1 moment models, and the automatic
// resolution of a moment by the same micro-simulation (skipped moments, accessibility).

import { kickedBall } from '../physics/ball.ts';
import { BALL, PENALTY_AREA, PITCH } from '../physics/constants.ts';
import { DEFAULT_PHYSICS, withWind, type PhysicsParams } from '../physics/params.ts';
import { v3, type Vec3 } from '../physics/vec3.ts';
import { clamp, cos, degToRad, sin, sqrt } from '../math/index.ts';
import { Rng } from '../rng/index.ts';
import {
  secondBallSetup,
  simulateShotMoment,
  type ShotMomentSetup,
} from '../moments/shot-moment.ts';
import { reboundCovers, reboundSetup, type ReboundSetup } from '../moments/rebound.ts';
import { firstTimeDifficulty } from '../moments/shot.ts';
import type { Situation } from '../moments/situations.ts';
import { shooterProfile, type ShotAttributes } from '../moments/shot.ts';
import { opponentShot, penaltyKeeperFeet, penaltySpot, wallSize } from '../moments/situations.ts';
import type { DefenderSetup } from '../moments/shot-moment.ts';
import type { MomentRequest, ShotOutcome } from './match.ts';
import type { MatchConditions } from './model.ts';

/** Ball position of the moment in the 3D world (attacked goal line at +X, left touchline −Z). */
export function momentSpot(request: MomentRequest): Vec3 {
  if (request.kind === 'penalty') {
    const p = penaltySpot();
    return v3(p.x, BALL.radius, p.z);
  }
  // The 3D moment starts a little before the shot (12–30 m out): time to see it and play it.
  // A free kick stays outside the area (inside, it would be a penalty).
  const closest = request.kind === 'free-kick' ? PENALTY_AREA.depth + 1 : 12;
  const distance = clamp((1 - request.spot.y) * PITCH.length, closest, 30);
  return v3(
    PITCH.goalLineX - distance,
    BALL.radius,
    clamp((request.spot.x - 0.5) * PITCH.width, -16, 16),
  );
}

const MARKER = { pace: 62, defending: 62, physical: 62, heightCm: 182 };
/** How far towards the posts the automatic shooter aims (share of the goal width). */
const AUTO_REACH = 0.7;

/** Who stands in the way: the wall on a free kick, a marker in open play, nobody on a penalty. */
export function momentDefenders(request: MomentRequest, from: Vec3): DefenderSetup[] {
  const covers: DefenderSetup[] = reboundCovers(momentSituation(request), from).map((feet) => ({
    role: 'cover',
    feet,
    attributes: MARKER,
  }));
  if (request.kind === 'penalty') return covers;
  if (request.kind === 'free-kick') {
    const n = Math.max(2, wallSize(PITCH.goalLineX - from.x, from.z));
    return [
      ...Array.from({ length: n }, () => ({ role: 'wall' as const, attributes: MARKER })),
      ...covers,
    ];
  }
  return [{ role: 'marker', feet: v3(from.x + 5, 0, from.z * 0.8), attributes: MARKER }, ...covers];
}

/** The 3D situation a key moment is played as (auto-resolution uses the same geometry). */
export function momentSituation(request: MomentRequest): Situation {
  switch (request.kind) {
    case 'penalty':
      return 'penalty';
    case 'free-kick':
      return 'free-kick';
    case 'keeper':
      return 'keeper';
    default:
      return 'free';
  }
}

/** Who follows up: the shooter, then the runners of the situation (none when keeping goal). */
export function momentRebound(request: MomentRequest, from: Vec3): ReboundSetup | undefined {
  return reboundSetup(
    momentSituation(request),
    v3(from.x - 0.4, 0, from.z),
    request.shooterAttributes.pace,
  );
}

/** Card attributes → shot attributes of the moment models. */
export function momentShotAttributes(request: MomentRequest): ShotAttributes {
  const a = request.shooterAttributes;
  return {
    shotPower: (a.shooting + a.physical) / 2,
    curve: (a.passing + a.dribbling) / 2,
    finishing: a.shooting,
    composure: request.shooter.composure,
  };
}

/** Physics of the match conditions (wind in the moment's frame). */
export function momentPhysics(conditions: MatchConditions): PhysicsParams {
  const r = degToRad(conditions.windDirection);
  return withWind(
    DEFAULT_PHYSICS,
    v3(cos(r) * conditions.windSpeed, 0, sin(r) * conditions.windSpeed),
  );
}

/**
 * Plays the moment without the player: the shooter picks a spot like a real finisher, the
 * keeper reacts. On average a little worse than a well-executed gesture (GDD §7.4).
 */
export function autoResolveMoment(
  request: MomentRequest,
  conditions: MatchConditions,
): ShotOutcome {
  const rng = Rng.create(request.seed).fork('auto');
  const physics = momentPhysics(conditions);
  const from = momentSpot(request);
  const profile = shooterProfile(momentShotAttributes(request), {
    weakFoot: false,
    weakFootStars: request.shooter.weakFoot,
    pressure: request.kind === 'penalty' ? 0.5 : 0.8,
  });
  // An average finisher does not always find the corner.
  const shot = opponentShot(
    from,
    profile,
    physics,
    conditions.surface,
    rng.fork('shot'),
    undefined,
    AUTO_REACH,
  );
  const penalty = request.kind === 'penalty';
  const rebound = momentRebound(request, from);
  const setup: ShotMomentSetup = {
    ball: kickedBall(from, shot.velocity, shot.spin),
    physics,
    surface: conditions.surface,
    keeper: {
      attributes: request.keeper.keeper,
      ...(penalty ? { feet: penaltyKeeperFeet(), mode: 'penalty' as const } : {}),
    },
    // A defender closing the shooter down (none on a penalty), and the covers of the runners.
    defenders: momentDefenders(request, from),
    seed: rng.nextU32(),
    ...(rebound ? { rebound } : {}),
  };
  const result = simulateShotMoment(setup, 720);
  const last = result.states[result.states.length - 1];
  if (result.outcome !== 'rebound' || !last) return shotOutcome(result.outcome, result.events);

  // Second ball won: strike it again first time, a little harder to control.
  const again = last.flight.ball.pos;
  const secondFrom = v3(again.x, Math.max(again.y, BALL.radius), again.z);
  const toGoal = v3(PITCH.goalLineX - secondFrom.x, 0, -secondFrom.z);
  const len = sqrt(toGoal.x * toGoal.x + toGoal.z * toGoal.z) || 1;
  const secondProfile = shooterProfile(momentShotAttributes(request), {
    weakFoot: false,
    weakFootStars: request.shooter.weakFoot,
    pressure: 0.8,
    difficulty: firstTimeDifficulty(last.flight.ball, v3(toGoal.x / len, 0, toGoal.z / len)),
  });
  const second = opponentShot(
    secondFrom,
    secondProfile,
    physics,
    conditions.surface,
    rng.fork('second-ball'),
    undefined,
    AUTO_REACH,
  );
  const followUp = simulateShotMoment(
    secondBallSetup(
      setup,
      last,
      kickedBall(secondFrom, second.velocity, second.spin),
      rng.fork('second-moment').nextU32(),
    ),
    720,
  );
  return shotOutcome(followUp.outcome, followUp.events);
}

/** Moment outcome (and its events) → match outcome. */
export function shotOutcome(
  outcome: string | null,
  events: readonly { readonly type: string; readonly kind?: string }[],
): ShotOutcome {
  if (outcome === 'goal') return 'goal';
  if (outcome === 'saved') {
    // The last touch counts: a parry gathered at the second attempt is a catch.
    const save = events.filter((e) => e.type === 'save').pop();
    return save?.kind === 'catch' ? 'save-catch' : 'save-parry';
  }
  if (outcome === 'blocked') return 'block';
  if (outcome === 'cleared') {
    // Second ball cleared by a defender: the shot was a save, or it hit the woodwork.
    if (events.some((e) => e.type === 'save')) return 'save-parry';
    return events.some((e) => e.type === 'frame') ? 'post' : 'block';
  }
  return events.some((e) => e.type === 'frame') ? 'post' : 'miss';
}
