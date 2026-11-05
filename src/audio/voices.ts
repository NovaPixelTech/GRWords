import { clamp } from '../util/math';

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

function safeTime(ctx: AudioContext, when: number): number {
  return Math.max(when, ctx.currentTime + 0.001);
}

/* ──────────────────────────── Lyre ──────────────────────────── */

/**
 * Karplus–Strong plucked string. Buffers are generated on first use and cached
 * per MIDI note, so the whole instrument costs a few milliseconds of CPU.
 */
export class Lyre {
  private cache = new Map<number, AudioBuffer>();

  constructor(private ctx: AudioContext) {}

  private bufferFor(midi: number): AudioBuffer {
    const hit = this.cache.get(midi);
    if (hit) return hit;

    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const freq = midiToFreq(midi);
    const seconds = clamp(2.9 - midi / 90, 1.1, 2.9);
    const length = Math.floor(sr * seconds);
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);

    const period = Math.max(2, Math.round(sr / freq));
    const excitation = new Float32Array(period);
    let lp = 0;
    const brightness = clamp(0.62 - freq / 3000, 0.18, 0.7);
    for (let i = 0; i < period; i++) {
      const n = Math.random() * 2 - 1;
      lp += brightness * (n - lp);
      excitation[i] = lp;
    }
    let mean = 0;
    for (let i = 0; i < period; i++) mean += excitation[i];
    mean /= period;
    for (let i = 0; i < period; i++) {
      data[i] = excitation[i] - mean;
    }

    const damp = 0.9972 - clamp(freq / 12000, 0, 0.02);
    for (let i = period; i < length; i++) {
      const a = data[i - period];
      const b = i - period - 1 >= 0 ? data[i - period - 1] : 0;
      data[i] = (a + b) * 0.5 * damp;
    }

    const fade = Math.floor(sr * 0.2);
    for (let i = 0; i < fade && i < length; i++) {
      data[length - 1 - i] *= i / fade;
    }

    this.cache.set(midi, buffer);
    return buffer;
  }

  play(dest: AudioNode, midi: number, when: number, gain = 0.7, brightness = 1): void {
    const ctx = this.ctx;
    const t = safeTime(ctx, when);

    const src = ctx.createBufferSource();
    src.buffer = this.bufferFor(midi);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200 + 2600 * clamp(brightness, 0, 1);
    filter.Q.value = 0.3;

    const env = ctx.createGain();
    env.gain.value = clamp(gain, 0, 1.4);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    src.start(t);
    src.stop(t + 3.2);

    // Pick attack: a whisper of noise gives the string definition.
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 + freqGlow(midi) * 900;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.055 * clamp(gain, 0, 1), t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    noise.start(t, Math.random() * 0.3, 0.09);
  }

  /** Damped "dead string" for misses. */
  thud(dest: AudioNode, when: number, gain = 0.5): void {
    const ctx = this.ctx;
    const t = safeTime(ctx, when);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.4);
  }
}

function freqGlow(midi: number): number {
  return clamp((midi - 48) / 36, 0, 1);
}

/* ─────────────────────────── Percussion ─────────────────────────── */

export function doum(ctx: AudioContext, dest: AudioNode, when: number, gain = 0.9): void {
  const t = safeTime(ctx, when);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(132, t);
  osc.frequency.exponentialRampToValueAtTime(44, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClip();
  osc.connect(shaper);
  shaper.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 0.5);

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 340;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.32 * gain, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  noise.connect(lp);
  lp.connect(ng);
  ng.connect(dest);
  noise.start(t, Math.random() * 0.4, 0.12);
}

export function tek(ctx: AudioContext, dest: AudioNode, when: number, gain = 0.55): void {
  const t = safeTime(ctx, when);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  noise.connect(bp);
  bp.connect(g);
  g.connect(dest);
  noise.start(t, Math.random() * 0.5, 0.09);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(560, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.linearRampToValueAtTime(gain * 0.35, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(og);
  og.connect(dest);
  osc.start(t);
  osc.stop(t + 0.08);
}

export function clap(ctx: AudioContext, dest: AudioNode, when: number, gain = 0.5): void {
  for (let i = 0; i < 3; i++) {
    const t = safeTime(ctx, when) + i * 0.012;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1350 + i * 240;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * (1 - i * 0.22), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    noise.connect(bp);
    bp.connect(g);
    g.connect(dest);
    noise.start(t, Math.random() * 0.5, 0.14);
  }
}

export function bell(ctx: AudioContext, dest: AudioNode, when: number, freq: number, gain = 0.3, dur = 1.1): void {
  const t = safeTime(ctx, when);
  const partials = [
    { mult: 1, amp: 1, decay: dur },
    { mult: 2.76, amp: 0.35, decay: dur * 0.55 },
    { mult: 5.4, amp: 0.12, decay: dur * 0.3 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * p.mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * p.amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + p.decay + 0.05);
  }
}

/* ─────────────────────────── Pads ─────────────────────────── */

export function pad(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  freqs: number[],
  dur: number,
  gain = 0.12,
): void {
  const t = safeTime(ctx, when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.8);
  g.gain.setValueAtTime(gain, t + Math.max(0.85, dur - 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
  filter.frequency.linearRampToValueAtTime(760, t + dur);
  filter.Q.value = 0.4;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 1);

  filter.connect(g);
  g.connect(dest);

  const per = 1 / Math.max(1, freqs.length);
  for (const f of freqs) {
    for (const det of [-7, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = per * 0.5;
      osc.connect(og);
      og.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 1);
    }
  }
}

export function drone(ctx: AudioContext, dest: AudioNode, when: number, freq: number, dur: number, gain = 0.05): void {
  const t = safeTime(ctx, when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 1.4);
  g.gain.setValueAtTime(gain, t + Math.max(1.5, dur - 1));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = freq * 0.5;
  const og2 = ctx.createGain();
  og2.gain.value = 0.4;
  osc.connect(g);
  osc2.connect(og2);
  og2.connect(g);
  g.connect(dest);
  osc.start(t);
  osc2.start(t);
  osc.stop(t + dur + 1.4);
  osc2.stop(t + dur + 1.4);
}

/** Word-completion "voice": a formant-filtered swell that reads as a choir. */
export function choir(ctx: AudioContext, dest: AudioNode, when: number, freq: number, dur = 1.2, gain = 0.16): void {
  const t = safeTime(ctx, when);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 720;
  f1.Q.value = 6;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 1180;
  f2.Q.value = 8;

  f1.connect(env);
  f2.connect(env);
  env.connect(dest);

  for (const mult of [1, 1.005, 0.996]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq * mult;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6 + Math.random();
    const vibGain = ctx.createGain();
    vibGain.gain.value = 3.2;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    osc.connect(f1);
    osc.connect(f2);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }
}

/** Rounded bass pluck for the accompaniment. */
export function bass(ctx: AudioContext, dest: AudioNode, when: number, freq: number, dur = 0.5, gain = 0.34): void {
  const t = safeTime(ctx, when);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(freq * 0.5, t);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(260, t + dur);

  osc.connect(lp);
  sub.connect(lp);
  lp.connect(g);
  g.connect(dest);
  osc.start(t);
  sub.start(t);
  osc.stop(t + dur + 0.05);
  sub.stop(t + dur + 0.05);
}

let sharedLyre: Lyre | null = null;

/** One lyre per AudioContext, shared by the chart and the UI. */
export function getLyre(ctx: AudioContext): Lyre {
  if (!sharedLyre) sharedLyre = new Lyre(ctx);
  return sharedLyre;
}

/** Bright rising shimmer for word completion / rank reveals. */
export function shimmer(ctx: AudioContext, dest: AudioNode, when: number, base: number, count = 5, gain = 0.12): void {
  for (let i = 0; i < count; i++) {
    bell(ctx, dest, when + i * 0.055, base * Math.pow(2, i / 12), gain * (1 - i * 0.1), 0.9);
  }
}

/* ─────────────────────────── Utils ─────────────────────────── */

let clipCurve: Float32Array<ArrayBuffer> | null = null;

function softClip(): Float32Array<ArrayBuffer> {
  if (clipCurve) return clipCurve;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2) * 0.85;
  }
  clipCurve = curve;
  return curve;
}
