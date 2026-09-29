import type { sim } from '@legendes/engine';
import type { MatchAudio, StrikeSurface } from '@legendes/render3d/audio';
import { eventCue, segmentCues, type Cursor } from '@legendes/render2d';

/** Above this playback speed only whistles and the stand are played: kicks would pile up. */
const KICK_MAX_SPEED = 8;
/** Real milliseconds between two ball sounds, so a fast forward stays readable. */
const KICK_GAP_MS = 110;
/** Real milliseconds between two reactions of the stand. */
const CROWD_GAP_MS = 2500;

/**
 * Plays the sounds of the 2D match: the ball, the referee, the net and the stand, from the
 * cues render2d derives from the timeline. Only the segment on screen sounds; a fast forward
 * that skips segments skips their sounds too.
 */
export class MatchSounds {
  private segment = -1;
  private fired = new Set<number>();
  private lastKick = 0;
  private lastCrowd = 0;

  constructor(
    private readonly audio: MatchAudio,
    private readonly surface: StrikeSurface,
    private readonly home: sim.Side = 0,
  ) {}

  /** Call every frame with the cursor of the display clock. */
  update(cursor: Cursor, speed: number): void {
    if (cursor.segment.index !== this.segment) {
      this.segment = cursor.segment.index;
      this.fired.clear();
    }
    const cues = segmentCues(cursor.segment);
    const now = performance.now();
    cues.forEach((cue, i) => {
      if (this.fired.has(i) || cursor.progress < cue.at) return;
      this.fired.add(i);
      if (cue.sound === 'whistle') {
        this.audio.whistle(cue.duration, cue.delay);
        return;
      }
      if (speed > KICK_MAX_SPEED || now - this.lastKick < KICK_GAP_MS) return;
      this.lastKick = now;
      if (cue.sound === 'strike') this.audio.strike(cue.power, this.surface);
      else this.audio.block(cue.speed);
    });
  }

  /** A match event reached by the clock: the ball in the net, a save, the stand. */
  event(event: sim.MatchEvent, speed: number): void {
    const cue = eventCue(event, this.home);
    if (!cue) return;
    if (cue.sound === 'net') this.audio.net(cue.speed);
    else if (cue.sound === 'gloves') this.audio.gloves(cue.kind, 12);
    else if (cue.sound === 'post') this.audio.post(cue.speed);
    else if (cue.sound === 'block') this.audio.block(cue.speed);
    else if (cue.sound === 'whistle') this.audio.whistle(0.3);
    const now = performance.now();
    // A goal always gets its roar; the other reactions are spaced out.
    if (
      cue.crowd === 'goal' ||
      (cue.crowd && speed <= KICK_MAX_SPEED && now - this.lastCrowd > CROWD_GAP_MS)
    ) {
      this.lastCrowd = now;
      this.audio.crowdReaction(cue.crowd);
    }
  }
}
