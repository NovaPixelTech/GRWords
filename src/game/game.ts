import type { Chart, ChartNote, ChartWord } from '../charts/compiler';
import type { Difficulty, Track } from '../content/tracks';
import { HIT_TOTAL, gradeAbs, type JudgementKind } from './judge';
import {
  accuracyOf,
  applyHit,
  applyWordBonus,
  createScoreState,
  type ScoreState,
} from './scoring';

export type Phase = 'countdown' | 'playing' | 'paused' | 'ended';
export type EndReason = 'complete' | 'broken';

export interface RuntimeNote {
  note: ChartNote;
  time: number;
  judged: JudgementKind | null;
  delta: number;
}

export interface RuntimeWord {
  word: ChartWord;
  notes: RuntimeNote[];
  hits: number;
  misses: number;
  resolved: boolean;
  clean: boolean;
  completedAt: number;
  bonus: number;
}

export interface GameEvents {
  onHit(note: ChartNote, kind: JudgementKind, when: number, points: number): void;
  onMiss(note: ChartNote, when: number): void;
  onWordComplete(word: ChartWord, clean: boolean, streak: number, when: number, bonus: number): void;
  onEnd(reason: EndReason): void;
  onPhase(phase: Phase): void;
}

export interface GameCarry {
  score: ScoreState;
  health: number;
  spellStreak: number;
}

export interface GameDeps {
  track: Track;
  chart: Chart;
  difficulty: Difficulty;
  startTime: number;
  offsetSec: number;
  events: GameEvents;
  /** Accumulated state when chaining rounds (Endless). */
  carry?: GameCarry;
}

const HEALTH_MAX = 100;
const HEAL: Record<JudgementKind, number> = { perfect: 2.3, great: 1.4, good: 0.5, miss: -9 };

export class Game {
  readonly track: Track;
  readonly chart: Chart;
  readonly difficulty: Difficulty;
  readonly notes: RuntimeNote[];
  readonly words: RuntimeWord[];

  score: ScoreState = createScoreState();
  health = HEALTH_MAX;
  spellStreak = 0;
  phase: Phase = 'countdown';

  private startTime: number;
  private offset: number;
  private beatSec: number;
  private cursor = 0;
  private pausedBeat = 0;
  private lastNow = 0;
  private ended = false;
  private events: GameEvents;
  private started = false;

  constructor(deps: GameDeps) {
    this.track = deps.track;
    this.chart = deps.chart;
    this.difficulty = deps.difficulty;
    this.startTime = deps.startTime;
    this.offset = deps.offsetSec;
    this.events = deps.events;
    this.beatSec = 60 / deps.track.bpm;

    if (deps.carry) {
      this.score = deps.carry.score;
      this.health = deps.carry.health;
      this.spellStreak = deps.carry.spellStreak;
    }

    this.notes = deps.chart.notes.map((note) => ({
      note,
      time: this.startTime + note.beat * this.beatSec,
      judged: null,
      delta: 0,
    }));

    this.words = deps.chart.words.map((word) => ({
      word,
      notes: this.notes.filter((n) => n.note.kind === 'letter' && n.note.wordIndex === word.index),
      hits: 0,
      misses: 0,
      resolved: false,
      clean: true,
      completedAt: -1,
      bonus: 0,
    }));

    this.phase = 'countdown';
    this.events.onPhase(this.phase);
  }

  get startBeatTime(): number {
    return this.startTime;
  }

  get beatSecValue(): number {
    return this.beatSec;
  }

  beatAt(now: number): number {
    return (now - this.startTime) / this.beatSec;
  }

  timeOf(beat: number): number {
    return this.startTime + beat * this.beatSec;
  }

  get healthRatio(): number {
    return this.health / HEALTH_MAX;
  }

  get accuracy(): number {
    return accuracyOf(this.score);
  }

  get progress(): number {
    return Math.max(0, Math.min(1, this.beatAt(this.lastNow) / this.chart.totalBeats));
  }

  setOffset(offsetSec: number): void {
    this.offset = offsetSec;
  }

  /** Called every animation frame with the audio clock. */
  update(now: number): void {
    if (this.phase === 'paused' || this.phase === 'ended') return;
    this.lastNow = now;

    const beat = this.beatAt(now);
    if (!this.started && beat >= 0) {
      this.started = true;
      this.setPhase('playing');
    }

    // Retire notes that fell past the good window.
    while (this.cursor < this.notes.length) {
      const rn = this.notes[this.cursor];
      if (rn.time > now - HIT_TOTAL) break;
      if (!rn.judged) this.resolve(rn, 'miss', now, now);
      this.cursor++;
    }

    if (this.health <= 0) {
      this.end('broken');
      return;
    }

    if (beat > this.chart.totalBeats + 0.5 || this.cursor >= this.notes.length) {
      this.end('complete');
    }
  }

  /** Returns the judgement produced, or null if the press hit nothing. */
  press(lane: number, now: number): JudgementKind | null {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return null;
    const adjusted = now - this.offset;

    let best: RuntimeNote | null = null;
    let bestDelta = Infinity;

    const from = Math.max(0, this.cursor - 2);
    for (let i = from; i < this.notes.length; i++) {
      const rn = this.notes[i];
      const delta = adjusted - rn.time;
      if (delta < -HIT_TOTAL) break;
      if (rn.judged) continue;
      if (rn.note.lane !== lane) continue;
      if (delta > HIT_TOTAL) continue;
      const abs = Math.abs(delta);
      if (abs < bestDelta) {
        bestDelta = abs;
        best = rn;
      }
    }

    if (!best) return null;
    const kind = gradeAbs(adjusted - best.time);
    if (!kind) return null;
    this.resolve(best, kind, now, adjusted);
    return kind;
  }

  private resolve(rn: RuntimeNote, kind: JudgementKind, now: number, _adjusted: number): void {
    rn.judged = kind;
    rn.delta = _adjusted - rn.time;

    const points = applyHit(this.score, kind);
    this.health = Math.max(0, Math.min(HEALTH_MAX, this.health + HEAL[kind]));

    if (kind === 'miss') {
      this.events.onMiss(rn.note, now);
    } else {
      this.events.onHit(rn.note, kind, now, points);
    }

    if (rn.note.kind !== 'letter' || rn.note.wordIndex < 0) return;
    const rw = this.words[rn.note.wordIndex];
    if (!rw || rw.resolved) return;

    if (kind === 'miss') {
      rw.misses += 1;
      rw.clean = false;
    } else {
      rw.hits += 1;
    }

    if (rw.notes.every((n) => n.judged !== null)) {
      rw.resolved = true;
      rw.completedAt = now;
      if (rw.clean) this.spellStreak += 1;
      else this.spellStreak = 0;
      const bonus = applyWordBonus(this.score, rw.word.letters.length, rw.clean, this.spellStreak);
      rw.bonus = bonus;
      this.events.onWordComplete(rw.word, rw.clean, this.spellStreak, now, bonus);
    }
  }

  pause(now: number): void {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return;
    this.pausedBeat = Math.max(0, this.beatAt(now));
    this.setPhase('paused');
  }

  /** Restart the clock so the paused beat resumes exactly where it stopped. */
  resume(now: number): number {
    if (this.phase !== 'paused') return this.pausedBeat;
    this.startTime = now + 0.6 - this.pausedBeat * this.beatSec;
    for (const rn of this.notes) {
      rn.time = this.startTime + rn.note.beat * this.beatSec;
    }
    this.cursor = 0;
    while (this.cursor < this.notes.length && this.notes[this.cursor].time < now - HIT_TOTAL) {
      this.cursor++;
    }
    this.setPhase('playing');
    return this.pausedBeat;
  }

  quit(): void {
    this.end('complete');
  }

  private end(reason: EndReason): void {
    if (this.ended) return;
    this.ended = true;
    this.setPhase('ended');
    this.events.onEnd(reason);
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.events.onPhase(phase);
  }

  /** What should be carved into the inscription stone right now. */
  inscriptionWord(now: number): RuntimeWord | null {
    const upcoming = this.words.find((w) => !w.resolved);
    if (upcoming) return upcoming;
    const last = this.words[this.words.length - 1] ?? null;
    return last;
  }

  nextWordAfter(word: RuntimeWord): RuntimeWord | null {
    const i = this.words.indexOf(word);
    return i >= 0 ? this.words[i + 1] ?? null : null;
  }
}
