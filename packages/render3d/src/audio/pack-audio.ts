// Sounds of pack opening (GDD §12.4): the tear of the foil, the boom when it opens, bells and a
// shimmer for good cards, the floodlights switching on one by one with a clunk, the drone and the
// riser of a walkout, the referee's whistle, the roar of the stand, and the ball on the metal
// stand for the little jokes. Everything is synthesised (ported from Carte du Ciel, audio.ts).

import { MatchAudio } from './match-audio.ts';

const NOTE = {
  D3: 146.83,
  A3: 220,
  D4: 293.66,
  Fs4: 369.99,
  A4: 440,
  D5: 587.33,
  E5: 659.26,
  Fs5: 739.99,
  A5: 880,
  B5: 987.77,
  D6: 1174.66,
  E6: 1318.5,
  Fs6: 1479.98,
  A6: 1760,
} as const;
const PENTA = [NOTE.D5, NOTE.E5, NOTE.Fs5, NOTE.A5, NOTE.B5, NOTE.D6, NOTE.E6, NOTE.Fs6, NOTE.A6];

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

export class PackAudio extends MatchAudio {
  private tearNode: {
    source: AudioBufferSourceNode;
    band: BiquadFilterNode;
    gain: GainNode;
  } | null = null;
  private droneNode: { gain: GainNode; oscs: OscillatorNode[]; filter: BiquadFilterNode } | null =
    null;
  private seq = 0;

  /** A cheap source of variation for the sounds (not the game's randomness). */
  private jitter(): number {
    this.seq = (this.seq * 1103515245 + 12345) % 2147483648;
    return this.seq / 2147483648;
  }

  private get c(): AudioContext {
    return this.ctx as AudioContext;
  }

  // ─── Tear ─────────────────────────────────────────────────────────────────────────────────

  tearStart(): void {
    if (!this.ready || this.tearNode) return;
    const c = this.c;
    const source = this.noiseSource(0.9);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.8;
    const high = c.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 700;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    source.connect(band);
    band.connect(high);
    high.connect(gain);
    this.out(gain, this.effects, 0, 0.08);
    source.start();
    this.tearNode = { source, band, gain };
  }

  /** `speed`: tear front speed (pack widths per second), `pan`: where the front is. */
  tearUpdate(speed: number, pan: number): void {
    if (!this.tearNode) return;
    const t = this.c.currentTime;
    const v = clamp(speed * 1.6, 0, 1);
    this.tearNode.gain.gain.setTargetAtTime(0.02 + v * 0.5, t, 0.025);
    this.tearNode.band.frequency.setTargetAtTime(1500 + v * 2600 + this.jitter() * 900, t, 0.02);
    if (this.jitter() < v * 0.75) this.crackle(0.05 + this.jitter() * 0.12 * v, pan);
  }

  tearStop(): void {
    if (!this.tearNode) return;
    const { source, gain } = this.tearNode;
    const t = this.c.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.04);
    source.stop(t + 0.3);
    this.tearNode = null;
  }

  crackle(gain: number, pan = 0): void {
    if (!this.ready) return;
    this.burst(
      this.effects,
      'bandpass',
      2500 + this.jitter() * 5000,
      3,
      gain,
      0.001,
      0.02 + this.jitter() * 0.03,
      pan,
      0.05,
    );
  }

  rip(): void {
    if (!this.ready) return;
    const c = this.c;
    const t = c.currentTime;
    const source = this.noiseSource(1);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(4200, t);
    band.frequency.exponentialRampToValueAtTime(700, t + 0.32);
    const gain = c.createGain();
    this.envelope(gain, t, 0.004, 0.7, 0.34);
    source.connect(band);
    band.connect(gain);
    this.out(gain, this.effects, 0, 0.2);
    source.start(t);
    source.stop(t + 0.5);
    for (let i = 0; i < 7; i++)
      this.burst(this.effects, 'bandpass', 3000 + i * 500, 3, 0.3, 0.001, 0.03, 0, 0.05, i * 0.025);
  }

  // ─── Building blocks ──────────────────────────────────────────────────────────────────────

  whoosh(duration = 0.6, from = 400, to = 2400, peak = 0.3, pan = 0): void {
    if (!this.ready) return;
    const c = this.c;
    const t = c.currentTime;
    const source = this.noiseSource(1);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + duration * 0.7);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + duration * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(band);
    band.connect(gain);
    this.out(gain, this.effects, pan, 0.3);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  boom(peak = 0.8, from = 90, to = 34, duration = 1.1): void {
    if (!this.ready) return;
    this.thump(this.effects, from, to, peak, duration);
    this.burst(this.effects, 'lowpass', 900, 0.7, peak * 0.5, 0.003, 0.5, 0, 0.3);
  }

  bell(freq: number, peak = 0.2, duration = 1.6, delay = 0, pan = 0): void {
    if (!this.ready) return;
    const c = this.c;
    const t = c.currentTime + delay;
    const carrier = c.createOscillator();
    carrier.frequency.value = freq;
    const mod = c.createOscillator();
    mod.frequency.value = freq * 3.5;
    const depth = c.createGain();
    depth.gain.setValueAtTime(freq * 2.2, t);
    depth.gain.exponentialRampToValueAtTime(freq * 0.05, t + duration * 0.6);
    mod.connect(depth);
    depth.connect(carrier.frequency);
    const gain = c.createGain();
    this.envelope(gain, t, 0.004, peak, duration);
    carrier.connect(gain);
    this.out(gain, this.effects, pan, 0.55);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + duration + 0.1);
    mod.stop(t + duration + 0.1);
  }

  pad(freqs: readonly number[], duration = 3, peak = 0.1, attack = 0.08): void {
    if (!this.ready) return;
    const c = this.c;
    const t = c.currentTime;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.Q.value = 0.6;
    low.frequency.setValueAtTime(600, t);
    low.frequency.exponentialRampToValueAtTime(3200, t + 0.4);
    low.frequency.exponentialRampToValueAtTime(900, t + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    low.connect(gain);
    this.out(gain, this.effects, 0, 0.6);
    for (const f of freqs) {
      for (const detune of [-7, 6]) {
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = c.createGain();
        g.gain.value = 0.25 / freqs.length;
        osc.connect(g);
        g.connect(low);
        osc.start(t);
        osc.stop(t + duration + 0.1);
      }
    }
  }

  shimmer(count = 6, peak = 0.07, spread = 0.07, base = 0): void {
    for (let i = 0; i < count; i++) {
      const note =
        PENTA[
          Math.min(PENTA.length - 1, base + Math.floor(this.jitter() * (PENTA.length - base)))
        ] ?? NOTE.A5;
      this.bell(
        note,
        peak * (0.6 + this.jitter() * 0.6),
        1.4,
        i * spread + this.jitter() * 0.02,
        (this.jitter() - 0.5) * 1.2,
      );
    }
  }

  riser(duration = 1.3, peak = 0.28): void {
    if (!this.ready) return;
    const c = this.c;
    const t = c.currentTime;
    const source = this.noiseSource(1);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2;
    band.frequency.setValueAtTime(300, t);
    band.frequency.exponentialRampToValueAtTime(6000, t + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + duration);
    gain.gain.linearRampToValueAtTime(0.0001, t + duration + 0.02);
    source.connect(band);
    band.connect(gain);
    this.out(gain, this.effects, 0, 0.35);
    source.start(t);
    source.stop(t + duration + 0.05);
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + duration);
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(400, t);
    low.frequency.exponentialRampToValueAtTime(5000, t + duration);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(peak * 0.3, t + duration);
    g2.gain.linearRampToValueAtTime(0.0001, t + duration + 0.02);
    osc.connect(low);
    low.connect(g2);
    this.out(g2, this.effects, 0, 0.3);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  droneStart(): void {
    if (!this.ready || this.droneNode) return;
    const c = this.c;
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 1.2);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.connect(gain);
    this.out(gain, this.effects, 0, 0.5);
    const oscs = [55, 110, 165, 164.8].map((f, i) => {
      const osc = c.createOscillator();
      osc.type = i < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 5;
      const g = c.createGain();
      g.gain.value = [0.5, 0.25, 0.15, 0.12][i] ?? 0.1;
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      return osc;
    });
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.18;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(t);
    this.droneNode = { gain, oscs: [...oscs, lfo], filter };
  }

  droneSwell(to = 2400, duration = 1.2): void {
    if (this.droneNode) {
      this.droneNode.filter.frequency.exponentialRampToValueAtTime(
        to,
        this.c.currentTime + duration,
      );
    }
  }

  droneStop(fade = 0.08): void {
    if (!this.droneNode) return;
    const t = this.c.currentTime;
    const d = this.droneNode;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(Math.max(d.gain.gain.value, 0.0001), t);
    d.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    for (const o of d.oscs) o.stop(t + fade + 0.05);
    this.droneNode = null;
  }

  // ─── The ground ───────────────────────────────────────────────────────────────────────────

  /** A floodlight tower switching on: the contactor's clunk, then the lamps' hum. */
  floodlight(pan = 0): void {
    if (!this.ready) return;
    this.thump(this.effects, 140, 48, 0.55, 0.35, pan);
    this.burst(this.effects, 'bandpass', 1800, 2.5, 0.35, 0.001, 0.05, pan, 0.2);
    const c = this.c;
    const t = c.currentTime;
    const hum = c.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 100;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 200;
    band.Q.value = 4;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    hum.connect(band);
    band.connect(gain);
    this.out(gain, this.effects, pan, 0.3);
    hum.start(t);
    hum.stop(t + 1.5);
  }

  /** A floodlight that will not start: buzz and sparks. */
  flicker(): void {
    if (!this.ready) return;
    for (let i = 0; i < 6; i++) {
      this.burst(
        this.effects,
        'bandpass',
        180 + i * 20,
        6,
        0.25,
        0.005,
        0.07,
        0.4,
        0.2,
        i * 0.13 + this.jitter() * 0.05,
      );
      this.burst(this.effects, 'highpass', 5000, 1, 0.12, 0.001, 0.03, 0.4, 0.1, i * 0.13 + 0.02);
    }
  }

  /** The ball hits the metal stand: a thud and the ring of the sheet. */
  metal(pan = 0): void {
    if (!this.ready) return;
    this.thump(this.effects, 220, 90, 0.45, 0.12, pan);
    for (const [f, peak, decay] of [
      [612, 0.18, 0.9],
      [1377, 0.1, 0.6],
      [2210, 0.05, 0.4],
    ] as const) {
      this.burst(this.effects, 'bandpass', f, 40, peak, 0.002, decay, pan, 0.4);
    }
  }

  /** The flip of a card; louder for the rarer. `rank` 0 to 7. */
  flip(rank = 0): void {
    this.whoosh(0.34, 700, 3200, 0.14 + rank * 0.02);
    this.crackle(0.16);
  }

  /** The reveal of a card of `rank` (0 to 7). */
  reveal(rank: number): void {
    if (!this.ready) return;
    if (rank <= 1) {
      this.bell(NOTE.D5, 0.1, 1.2);
    } else if (rank <= 3) {
      this.bell(NOTE.A4, 0.12, 1.4);
      this.bell(NOTE.D5, 0.12, 1.6, 0.09);
      this.shimmer(3, 0.04, 0.05, 4);
    } else if (rank <= 5) {
      [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6].forEach((f, i) => this.bell(f, 0.13, 1.8, i * 0.07));
      this.shimmer(5, 0.05, 0.05, 5);
    } else {
      this.boom(0.4);
      this.pad([NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.E5], 3, 0.12);
      this.shimmer(8, 0.06, 0.05, 3);
    }
  }

  /** The impact of a walkout: boom, chord, shimmer and the stand erupting. */
  impact(rank: number): void {
    if (!this.ready) return;
    this.boom(1, 110, 30, 1.6);
    this.pad(
      rank >= 6
        ? [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.E5]
        : [NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.E5],
      rank >= 6 ? 5 : 4,
      rank >= 5 ? 0.17 : 0.13,
      0.03,
    );
    this.shimmer(rank >= 6 ? 16 : 10, 0.07, 0.06, 2);
    this.whoosh(0.9, 3000, 400, 0.25);
    this.crowdReaction('goal');
  }

  /** A firework rocket bursting. */
  firework(pan = 0): void {
    if (!this.ready) return;
    this.thump(this.effects, 180, 40, 0.4, 0.5, pan);
    for (let i = 0; i < 10; i++) this.crackle(0.08 + this.jitter() * 0.1, pan);
  }
}
