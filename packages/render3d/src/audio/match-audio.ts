// Sounds of a key moment, fully synthesised with WebAudio (no audio file, no licence question):
// strike (per surface), bounce, net, post, gloves, block, whistle, the murmur of a small stand
// and its cheer / "ooh". Ported from Carte du Ciel's audio engine (master bus, compressor, short
// reverb, iOS silent-switch workaround), with separate volumes (GDD §12.6).

export type StrikeSurface = 'grass' | 'artificial' | 'muddy' | 'dirt';

export interface AudioVolumes {
  master: number;
  effects: number;
  crowd: number;
}

export const DEFAULT_VOLUMES: AudioVolumes = { master: 0.8, effects: 1, crowd: 0.7 };

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** WAV of silence: playing it in a loop lets WebAudio ignore the iPhone silent switch. */
function silentWavUrl(): string {
  const n = 4410;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const write = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

let iosUnmuted = false;
function unmuteIOS(): void {
  if (iosUnmuted) return;
  iosUnmuted = true;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // Not allowed: the silent switch keeps control.
    }
    return;
  }
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return;
  const audio = document.createElement('audio');
  audio.setAttribute('x-webkit-airplay', 'deny');
  audio.preload = 'auto';
  audio.loop = true;
  audio.src = silentWavUrl();
  audio.play().catch(() => {
    // Refused: the silent switch keeps control.
  });
}

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private crowd!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private murmur: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private volumes: AudioVolumes = { ...DEFAULT_VOLUMES };
  private enabled = true;

  /** Creates or resumes the audio context. Call from a user gesture (tap / click). */
  unlock(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return true;
    }
    const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }
    unmuteIOS();
    const c = this.ctx;
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(compressor);
    this.effects = c.createGain();
    this.crowd = c.createGain();
    this.effects.connect(this.master);
    this.crowd.connect(this.master);
    // Open-air ground: short, damped reverb.
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(1.3, 3);
    const wet = c.createGain();
    wet.gain.value = 0.3;
    this.reverb.connect(wet);
    wet.connect(this.master);
    const length = c.sampleRate * 2;
    this.noise = c.createBuffer(1, length, c.sampleRate);
    const data = this.noise.getChannelData(0);
    // Noise content does not need to be reproducible: xorshift, cheap and seedless enough.
    let x = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
    }
    this.applyVolumes();
    return true;
  }

  get ready(): boolean {
    return this.ctx !== null && this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVolumes();
    if (!enabled) this.stopMurmur();
  }

  setVolumes(volumes: AudioVolumes): void {
    this.volumes = { ...volumes };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.volumes.master : 0, t, 0.05);
    this.effects.gain.setTargetAtTime(this.volumes.effects, t, 0.05);
    this.crowd.gain.setTargetAtTime(this.volumes.crowd, t, 0.05);
  }

  private impulse(duration: number, decay: number): AudioBuffer {
    const c = this.ctx as AudioContext;
    const length = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      let x = 0x1234567 + ch;
      for (let i = 0; i < length; i++) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        d[i] = (((x >>> 0) / 4294967296) * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /** Routes a node to a bus, with optional pan (−1 left … 1 right) and reverb send. */
  private out(node: AudioNode, bus: GainNode, pan = 0, wet = 0.15): void {
    const c = this.ctx as AudioContext;
    let n: AudioNode = node;
    if (pan !== 0 && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p);
      n = p;
    }
    n.connect(bus);
    if (wet > 0) {
      const g = c.createGain();
      g.gain.value = wet;
      n.connect(g);
      g.connect(this.reverb);
    }
  }

  private envelope(gain: GainNode, t0: number, attack: number, peak: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private noiseSource(rate = 1): AudioBufferSourceNode {
    const c = this.ctx as AudioContext;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    return s;
  }

  /** Noise burst through a filter. */
  private burst(
    bus: GainNode,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    peak: number,
    attack: number,
    decay: number,
    pan = 0,
    wet = 0.12,
    delay = 0,
  ): void {
    const c = this.ctx as AudioContext;
    const t = c.currentTime + delay;
    const source = this.noiseSource(0.8 + ((t * 7919) % 1) * 0.4);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = c.createGain();
    this.envelope(gain, t, attack, peak, decay);
    source.connect(filter);
    filter.connect(gain);
    this.out(gain, bus, pan, wet);
    source.start(t, (t * 13) % 1.5);
    source.stop(t + attack + decay + 0.05);
  }

  /** Short tone with a pitch drop (body of a kick, thud). */
  private thump(
    bus: GainNode,
    from: number,
    to: number,
    peak: number,
    decay: number,
    pan = 0,
  ): void {
    const c = this.ctx as AudioContext;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + decay);
    const gain = c.createGain();
    this.envelope(gain, t, 0.004, peak, decay);
    osc.connect(gain);
    this.out(gain, bus, pan, 0.08);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  // ─── Sounds ─────────────────────────────────────────────────────────────────

  /** The strike: leather thump + surface texture. `power` in [0, 1]. */
  strike(power: number, surface: StrikeSurface): void {
    if (!this.ready) return;
    const p = clamp(power, 0, 1);
    this.thump(this.effects, 150 + p * 60, 55, 0.5 + p * 0.5, 0.12);
    const bright =
      surface === 'artificial'
        ? 5200
        : surface === 'muddy'
          ? 1400
          : surface === 'dirt'
            ? 3200
            : 3800;
    this.burst(this.effects, 'bandpass', bright, 1.2, 0.25 + p * 0.35, 0.002, 0.06);
    if (surface === 'muddy')
      this.burst(this.effects, 'lowpass', 600, 2, 0.35, 0.01, 0.18, 0, 0.05, 0.02);
    if (surface === 'dirt')
      this.burst(this.effects, 'highpass', 2500, 0.7, 0.18, 0.005, 0.2, 0, 0.05, 0.01);
  }

  /** Ball bouncing, `speed` of the impact in m/s. */
  bounce(speed: number, surface: StrikeSurface, pan = 0): void {
    if (!this.ready || speed < 1) return;
    const k = clamp(speed / 15, 0.05, 1);
    this.thump(this.effects, 110, 60, 0.25 * k, 0.08, pan);
    if (surface === 'muddy')
      this.burst(this.effects, 'lowpass', 500, 3, 0.25 * k, 0.005, 0.15, pan, 0.04);
  }

  /** The net: a swish of cords. */
  net(speed: number, pan = 0): void {
    if (!this.ready) return;
    const k = clamp(speed / 20, 0.2, 1);
    const c = this.ctx as AudioContext;
    const t = c.currentTime;
    const source = this.noiseSource(1.1);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(5200, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
    const gain = c.createGain();
    this.envelope(gain, t, 0.01, 0.55 * k, 0.5);
    source.connect(filter);
    filter.connect(gain);
    this.out(gain, this.effects, pan, 0.2);
    source.start(t);
    source.stop(t + 0.6);
  }

  /** The post or the bar: a metallic clang. */
  post(speed: number, pan = 0): void {
    if (!this.ready) return;
    const c = this.ctx as AudioContext;
    const t = c.currentTime;
    const k = clamp(speed / 20, 0.2, 1);
    for (const [f, amp, dec] of [
      [523, 0.35, 1.1],
      [1291, 0.22, 0.8],
      [2317, 0.14, 0.55],
      [3517, 0.08, 0.35],
    ] as const) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = c.createGain();
      this.envelope(gain, t, 0.002, amp * k, dec);
      osc.connect(gain);
      this.out(gain, this.effects, pan, 0.35);
      osc.start(t);
      osc.stop(t + dec + 0.05);
    }
    this.thump(this.effects, 180, 90, 0.3 * k, 0.06, pan);
  }

  /** Gloves: a catch is a dull slap, a parry a sharper one. */
  gloves(kind: 'catch' | 'parry', speed: number, pan = 0): void {
    if (!this.ready) return;
    const k = clamp(speed / 25, 0.3, 1);
    this.burst(
      this.effects,
      'bandpass',
      kind === 'catch' ? 900 : 1800,
      1.4,
      0.55 * k,
      0.002,
      kind === 'catch' ? 0.09 : 0.06,
      pan,
    );
    this.thump(this.effects, 140, 70, 0.3 * k, 0.07, pan);
  }

  /** A defender's body blocking the ball. */
  block(speed: number, pan = 0): void {
    if (!this.ready) return;
    const k = clamp(speed / 25, 0.3, 1);
    this.thump(this.effects, 120, 55, 0.45 * k, 0.1, pan);
    this.burst(this.effects, 'lowpass', 1200, 1, 0.25 * k, 0.003, 0.08, pan);
  }

  /** Referee whistle (pea whistle: two close tones with a rattle). */
  whistle(duration = 0.35, delay = 0): void {
    if (!this.ready) return;
    const c = this.ctx as AudioContext;
    const t = c.currentTime + delay;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.setValueAtTime(0.22, t + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.06);
    const rattle = c.createOscillator();
    rattle.frequency.value = 38;
    const rattleDepth = c.createGain();
    rattleDepth.gain.value = 0.5;
    const am = c.createGain();
    am.gain.value = 0.6;
    rattle.connect(rattleDepth);
    rattleDepth.connect(am.gain);
    for (const f of [3150, 3290]) {
      const osc = c.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(am);
      osc.start(t);
      osc.stop(t + duration + 0.1);
    }
    am.connect(gain);
    this.out(gain, this.effects, 0, 0.3);
    rattle.start(t);
    rattle.stop(t + duration + 0.1);
  }

  /** Continuous murmur of a small stand (a few dozen people). */
  startMurmur(): void {
    if (!this.ready || this.murmur) return;
    const c = this.ctx as AudioContext;
    const source = this.noiseSource(0.5);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.06, c.currentTime, 0.8);
    source.connect(filter);
    filter.connect(gain);
    this.out(gain, this.crowd, 0, 0.3);
    source.start();
    this.murmur = { source, gain };
  }

  stopMurmur(): void {
    if (!this.murmur || !this.ctx) return;
    const { source, gain } = this.murmur;
    gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    source.stop(this.ctx.currentTime + 1.5);
    this.murmur = null;
  }

  /** The stand reacts: a cheer with claps for a goal, an "ooh" for a save / post / near miss. */
  crowdReaction(kind: 'goal' | 'ooh'): void {
    if (!this.ready) return;
    const c = this.ctx as AudioContext;
    const t = c.currentTime;
    if (kind === 'goal') {
      // Voices: a few formant bands swelling then fading.
      for (const [f, q, amp] of [
        [450, 1.2, 0.35],
        [900, 1.5, 0.28],
        [1800, 2, 0.14],
      ] as const) {
        const source = this.noiseSource(0.9);
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = f;
        filter.Q.value = q;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(amp, t + 0.25);
        gain.gain.setTargetAtTime(amp * 0.6, t + 0.6, 0.6);
        gain.gain.setTargetAtTime(0.0001, t + 2.2, 0.5);
        source.connect(filter);
        filter.connect(gain);
        this.out(gain, this.crowd, 0, 0.4);
        source.start(t);
        source.stop(t + 4.5);
      }
      // Scattered claps.
      for (let i = 0; i < 26; i++) {
        const delay = 0.3 + ((i * 0.618) % 1) * 2.4;
        this.burst(
          this.crowd,
          'bandpass',
          1500 + ((i * 331) % 900),
          1.1,
          0.12,
          0.002,
          0.04,
          ((i * 0.37) % 1) * 1.2 - 0.6,
          0.2,
          delay,
        );
      }
    } else {
      const source = this.noiseSource(0.9);
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(380, t);
      filter.frequency.linearRampToValueAtTime(620, t + 0.35);
      filter.frequency.linearRampToValueAtTime(420, t + 1.1);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      source.connect(filter);
      filter.connect(gain);
      this.out(gain, this.crowd, 0, 0.4);
      source.start(t);
      source.stop(t + 1.4);
    }
  }

  dispose(): void {
    this.stopMurmur();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
