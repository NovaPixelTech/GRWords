/**
 * Audio engine: one AudioContext, a mastered bus, a generated convolution
 * reverb, and lazy unlock on the first gesture.
 *
 * Nothing is loaded from disk. Every sound in ETYMOS is synthesised at runtime.
 */

export interface Volumes {
  music: number;
  sfx: number;
}

function makeImpulseResponse(ctx: AudioContext, seconds = 2.8, decay = 2.4): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  const preDelay = Math.floor(rate * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      if (i < preDelay) {
        data[i] = 0;
        continue;
      }
      const t = (i - preDelay) / (length - preDelay);
      const env = Math.pow(1 - t, decay);
      const noise = Math.random() * 2 - 1;
      // gentle low-pass so the tail is warm rather than hissy
      smooth = smooth * 0.72 + noise * 0.28;
      data[i] = smooth * env * 0.9;
    }
  }
  return buffer;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private reverb: ConvolverNode | null = null;
  private musicSend: GainNode | null = null;
  private sfxSend: GainNode | null = null;
  private volumes: Volumes = { music: 0.72, sfx: 0.78 };
  private started = false;

  get ready(): boolean {
    return this.ctx !== null && this.started;
  }

  /** Must be called from a user gesture the first time. */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.22;
      limiter.connect(ctx.destination);

      // Tapped after the limiter so health checks can confirm real signal.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      limiter.connect(analyser);
      this.analyser = analyser;
      this.analyserBuf = new Float32Array(analyser.fftSize);

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(limiter);

      const musicBus = ctx.createGain();
      const sfxBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus.connect(master);

      const reverb = ctx.createConvolver();
      reverb.buffer = makeImpulseResponse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      reverb.connect(wet);
      wet.connect(master);

      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.5;
      musicBus.connect(musicSend);
      musicSend.connect(reverb);

      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.35;
      sfxBus.connect(sfxSend);
      sfxSend.connect(reverb);

      this.limiter = limiter;
      this.master = master;
      this.musicBus = musicBus;
      this.sfxBus = sfxBus;
      this.reverb = reverb;
      this.musicSend = musicSend;
      this.sfxSend = sfxSend;
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    this.started = this.ctx.state === 'running';
    this.applyVolumes();
    return this.started;
  }

  setVolumes(v: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...v };
    this.applyVolumes();
  }

  get volume(): Volumes {
    return { ...this.volumes };
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  now(): number {
    // If the context is suspended or missing (autoplay blocked, headless), fall
    // back to wall-clock time so the game still runs — just silently.
    if (this.ctx && this.ctx.state === 'running') return this.ctx.currentTime;
    return performance.now() / 1000;
  }

  /** The context may add latency on output; expose it for calibration. */
  get baseLatency(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!ctx) return 0;
    return (ctx.outputLatency ?? 0) + (ctx.baseLatency ?? 0);
  }

  /** RMS of the master bus right now, 0..1. Used by smoke tests. */
  level(): number {
    const analyser = this.analyser;
    const buf = this.analyserBuf;
    if (!analyser || !buf) return 0;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  get state(): AudioContextState | 'none' {
    return this.ctx ? this.ctx.state : 'none';
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}

export const audio = new AudioEngine();
