import { describe, expect, it } from 'vitest';
import { eventCue, segmentCues } from '../src/cues.ts';

const segment = (kind: string, success = true) =>
  ({
    kind: 'action',
    action: { kind, success },
  }) as unknown as Parameters<typeof segmentCues>[0];

describe('2D sound cues', () => {
  it('kicks the ball for passes and shots, harder for the long ones', () => {
    const power = (kind: string): number => {
      const cue = segmentCues(segment(kind))[0];
      return cue?.sound === 'strike' ? cue.power : -1;
    };
    expect(power('pass')).toBeGreaterThan(0);
    expect(power('long-pass')).toBeGreaterThan(power('pass'));
    expect(power('shot')).toBeGreaterThan(power('long-pass'));
  });

  it('whistles for kick-off, fouls, penalties and the end of each half', () => {
    for (const kind of ['kickoff', 'foul', 'offside', 'penalty']) {
      expect(segmentCues(segment(kind)).some((c) => c.sound === 'whistle')).toBe(true);
    }
    expect(segmentCues({ kind: 'half-time' } as never)).toHaveLength(2);
    expect(segmentCues({ kind: 'full-time' } as never)).toHaveLength(3);
  });

  it('keeps cues inside the segment and stays silent on dribbles and celebrations', () => {
    for (const kind of ['pass', 'shot', 'kickoff', 'corner', 'penalty', 'foul']) {
      for (const cue of segmentCues(segment(kind))) {
        expect(cue.at).toBeGreaterThanOrEqual(0);
        expect(cue.at).toBeLessThan(1);
      }
    }
    expect(segmentCues(segment('dribble'))).toEqual([]);
    expect(segmentCues({ kind: 'celebration' } as never)).toEqual([]);
  });

  it('cheers a goal of the home stand and only groans at a goal against it', () => {
    const goal = (team: 0 | 1) => ({ kind: 'goal', team, t: 10, xg: null }) as never;
    expect(eventCue(goal(0), 0)).toMatchObject({ sound: 'net', crowd: 'goal' });
    expect(eventCue(goal(1), 0)).toMatchObject({ sound: 'net', crowd: 'ooh' });
  });
});
