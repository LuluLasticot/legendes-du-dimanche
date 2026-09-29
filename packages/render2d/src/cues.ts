// Sound cues of the 2D match: which sound goes with which action of the timeline, and when. Pure
// data (no audio here): the web app maps the cues onto the synthesised sounds of render3d.

import type { sim } from '@legendes/engine';
import type { Segment } from './timeline.ts';

export type Cue =
  | { readonly at: number; readonly sound: 'strike'; readonly power: number }
  | {
      readonly at: number;
      readonly sound: 'whistle';
      readonly duration: number;
      readonly delay: number;
    }
  | { readonly at: number; readonly sound: 'block'; readonly speed: number };

const strike = (at: number, power: number): Cue => ({ at, sound: 'strike', power });
const whistle = (at: number, duration = 0.35, delay = 0): Cue => ({
  at,
  sound: 'whistle',
  duration,
  delay,
});

/** Cues of a segment; `at` is the progress (0–1) within the segment at which the sound plays. */
export function segmentCues(segment: Pick<Segment, 'kind' | 'action'>): readonly Cue[] {
  if (segment.kind === 'half-time') return [whistle(0.02, 0.4), whistle(0.02, 0.4, 0.55)];
  if (segment.kind === 'full-time')
    return [whistle(0.02, 0.35), whistle(0.02, 0.35, 0.5), whistle(0.02, 0.8, 1)];
  if (segment.kind === 'celebration') return [];
  const { kind, success } = segment.action;
  switch (kind) {
    case 'pass':
      return [strike(0.02, 0.35)];
    case 'long-pass':
      return [strike(0.02, 0.7)];
    case 'cross':
      return [strike(0.02, 0.65)];
    case 'clearance':
      return [strike(0.02, 0.85)];
    case 'shot':
      return [strike(0.03, 0.95)];
    case 'tackle':
      return success ? [{ at: 0.05, sound: 'block', speed: 7 }] : [];
    case 'kickoff':
      return [whistle(0.05), strike(0.85, 0.3)];
    case 'goal-kick':
      return [strike(0.75, 0.85)];
    case 'corner':
      return [strike(0.75, 0.7)];
    case 'free-kick':
      return [strike(0.8, 0.8)];
    case 'penalty':
      return [whistle(0.05), strike(0.85, 0.95)];
    case 'foul':
      return [whistle(0.08)];
    case 'offside':
      return [whistle(0.08, 0.6)];
    default:
      return [];
  }
}

/** What the stand and the ball do when a match event is reached (goal, save, post…). */
export type EventCue =
  | { readonly sound: 'net'; readonly speed: number; readonly crowd: 'goal' | 'ooh' }
  | { readonly sound: 'gloves'; readonly kind: 'catch' | 'parry'; readonly crowd: 'ooh' }
  | { readonly sound: 'post'; readonly speed: number; readonly crowd: 'ooh' }
  | { readonly sound: 'block'; readonly speed: number; readonly crowd: null }
  | { readonly sound: 'none'; readonly crowd: 'ooh' }
  | { readonly sound: 'whistle'; readonly crowd: null };

/** `home`: the side whose stand this is (a goal against it only gets a groan). */
export function eventCue(event: sim.MatchEvent, home: sim.Side = 0): EventCue | null {
  switch (event.kind) {
    case 'goal':
      return { sound: 'net', speed: 22, crowd: event.team === home ? 'goal' : 'ooh' };
    case 'save':
      return {
        sound: 'gloves',
        kind: Math.floor(event.t) % 2 === 0 ? 'catch' : 'parry',
        crowd: 'ooh',
      };
    case 'post':
      return { sound: 'post', speed: 18, crowd: 'ooh' };
    case 'block':
      return { sound: 'block', speed: 15, crowd: null };
    case 'miss':
      return event.xg !== null && event.xg > 0.12 ? { sound: 'none', crowd: 'ooh' } : null;
    case 'yellow':
    case 'red':
      return { sound: 'whistle', crowd: null };
    default:
      return null;
  }
}
