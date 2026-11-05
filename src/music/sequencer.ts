import { AudioEngine } from '../audio/engine';
import { bass, bell, clap, doum, drone, getLyre, midiToFreq, pad, tek } from '../audio/voices';
import type { Chart } from '../charts/compiler';
import type { Track } from '../content/tracks';

/**
 * Schedules the accompaniment (frame drums, bass, pad, drone, bells) against
 * the audio clock. The player supplies the melody by striking the lyre, so a
 * missed note really does leave a hole in the music.
 */
export class MusicDirector {
  private timer: number | null = null;
  private step = 0;
  private lastStep = 0;
  private startTime = 0;
  private beatSec = 0.5;
  private running = false;
  private track: Track | null = null;
  private chart: Chart | null = null;
  private ctx: AudioContext | null = null;

  constructor(private engine: AudioEngine) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(track: Track, chart: Chart, startTime: number, fromBeat = 0): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;

    this.stop();
    this.ctx = ctx;
    this.track = track;
    this.chart = chart;
    this.beatSec = 60 / track.bpm;
    this.startTime = startTime;
    this.step = Math.max(0, Math.round(fromBeat * 4));
    this.lastStep = Math.round(chart.totalBeats * 4);
    this.running = true;

    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /** Anchors a drone at the start of a run. */
  seed(track: Track, startTime: number, beats: number): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;
    const dur = (beats * 60) / track.bpm;
    drone(ctx, bus, startTime, midiToFreq(track.root - 12), dur, 0.045);
  }

  private tick(): void {
    const ctx = this.ctx;
    const track = this.track;
    const chart = this.chart;
    const bus = this.engine.musicBus;
    if (!ctx || !track || !chart || !bus || !this.running) return;

    const horizon = ctx.currentTime + 0.22;
    let guard = 0;
    while (this.step < this.lastStep && guard++ < 128) {
      const time = this.startTime + (this.step * this.beatSec) / 4;
      if (time > horizon) break;
      if (time >= ctx.currentTime - 0.06) this.schedule(this.step, time);
      this.step++;
    }
  }

  private schedule(step: number, time: number): void {
    const ctx = this.ctx;
    const track = this.track;
    const chart = this.chart;
    const bus = this.engine.musicBus;
    if (!ctx || !track || !chart || !bus) return;

    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const totalBars = Math.max(1, Math.ceil(chart.totalBeats / 4));
    const progress = bar / totalBars;
    const chord = track.progression[bar % track.progression.length];
    const intro = bar < 2;
    const finale = bar >= totalBars - 2;

    if (inBar === 0) {
      // Chord pad, refreshed every bar.
      const third = chord.quality === 'min' ? 3 : 4;
      const rootMidi = track.root + chord.root + 12;
      const freqs = [0, third, 7, 12, 15].map((i) => midiToFreq(rootMidi + i));
      pad(ctx, bus, time, freqs, this.beatSec * 4 * 0.98, intro ? 0.1 : 0.075);

      if (bar % 8 === 0) {
        drone(ctx, bus, time, midiToFreq(track.root + chord.root - 24), this.beatSec * 32, 0.035);
      }
    }

    if (intro) {
      if (inBar === 0 || inBar === 8) {
        bell(ctx, bus, time, midiToFreq(track.root + 24), 0.16, 1.4);
      }
      if (inBar === 12) {
        tek(ctx, bus, time, 0.18);
      }
      return;
    }

    // ── Frame drum: maqsum-flavoured 16th pattern ──────────────────────
    if (inBar === 0) {
      doum(ctx, bus, time, 0.85);
    } else if (inBar === 2) {
      tek(ctx, bus, time, 0.4);
    } else if (inBar === 6) {
      tek(ctx, bus, time, 0.5);
    } else if (inBar === 8) {
      doum(ctx, bus, time, 0.8);
    } else if (inBar === 10) {
      tek(ctx, bus, time, 0.45);
    } else if (inBar === 14) {
      tek(ctx, bus, time, progress > 0.35 ? 0.55 : 0.38);
    }

    // Fill at the end of every fourth bar.
    if (bar % 4 === 3 && inBar >= 12) {
      if (inBar === 12) tek(ctx, bus, time, 0.5);
      if (inBar === 13) tek(ctx, bus, time, 0.34);
      if (inBar === 14) tek(ctx, bus, time, 0.42);
      if (inBar === 15) clap(ctx, bus, time, 0.34);
    }

    // Claps thicken the groove once the run is underway.
    if (progress > 0.3 && bar % 2 === 1 && inBar === 12) {
      clap(ctx, bus, time, 0.3);
    }

    if (finale && inBar === 0) {
      clap(ctx, bus, time, 0.38);
      bell(ctx, bus, time, midiToFreq(track.root + 12), 0.2, 1.8);
    }

    // ── Bass ───────────────────────────────────────────────────────────
    const bassRoot = midiToFreq(track.root + chord.root - 12);
    if (inBar === 0) {
      bass(ctx, bus, time, bassRoot, this.beatSec * 1.6, 0.3);
    } else if (inBar === 6 && progress > 0.4) {
      bass(ctx, bus, time, bassRoot, this.beatSec * 0.9, 0.2);
    } else if (inBar === 8) {
      bass(ctx, bus, time, bassRoot, this.beatSec * 1.4, 0.26);
    } else if (inBar === 14 && progress > 0.6) {
      bass(ctx, bus, time, midiToFreq(track.root + chord.root - 5), this.beatSec * 0.8, 0.16);
    }

    // ── Sparse melodic bells in the second half ────────────────────────
    if (progress > 0.45 && bar % 4 === 2 && inBar === 14) {
      const scaleNote = track.root + 24 + (chord.root % 5);
      bell(ctx, bus, time, midiToFreq(scaleNote), 0.11, 1.2);
    }
  }
}

/** Fires a short lyre flourish to celebrate a completed word. */
export function wordFanfare(engine: AudioEngine, track: Track, when: number): void {
  const ctx = engine.ctx;
  const bus = engine.sfxBus;
  if (!ctx || !bus) return;
  const lyre = getLyre(ctx);
  const notes = [0, 4, 7, 12];
  notes.forEach((n, i) => {
    lyre.play(bus, track.root + 24 + n, when + i * 0.07, 0.5, 1);
  });
}
