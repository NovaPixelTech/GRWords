import { laneMidi, type Difficulty, type Track } from '../content/tracks';
import { lettersOf, WORD_BY_ID, wordsForTrack } from '../content/words';
import { mulberry32, seedFrom, shuffle, type Rng } from '../util/rng';

export type NoteKind = 'letter' | 'ornament';

export interface ChartNote {
  id: number;
  /** Absolute position in beats from the start of the song. */
  beat: number;
  lane: number;
  /** Greek capital for letter notes, empty for ornaments. */
  letter: string;
  /** Index into chart.words, or -1 for ornaments. */
  wordIndex: number;
  letterIndex: number;
  kind: NoteKind;
  midi: number;
  /** Slight velocity variation for the synth. */
  velocity: number;
}

export interface ChartWord {
  index: number;
  wordId: string;
  startBeat: number;
  endBeat: number;
  letters: string[];
  noteIds: number[];
}

export interface Chart {
  trackId: string;
  difficulty: Difficulty;
  bpm: number;
  notes: ChartNote[];
  words: ChartWord[];
  totalBeats: number;
  leadInBeats: number;
  seed: number;
}

interface DifficultySpec {
  spacing: number;
  blockBars: number;
  ornamentSpacing: number;
  ornamentChance: number;
  jumpChance: number;
}

export const CHART_SPECS: Record<Difficulty, DifficultySpec> = {
  mortal: { spacing: 1, blockBars: 3, ornamentSpacing: 1, ornamentChance: 0.45, jumpChance: 0 },
  hero: { spacing: 0.5, blockBars: 3, ornamentSpacing: 0.5, ornamentChance: 0.6, jumpChance: 0.12 },
  olympian: { spacing: 0.25, blockBars: 3, ornamentSpacing: 0.25, ornamentChance: 0.5, jumpChance: 0.22 },
};

class LaneWalker {
  private lane: number;
  private dir: number;

  constructor(rng: Rng) {
    this.lane = 1 + Math.floor(rng() * 2);
    this.dir = rng() < 0.5 ? 1 : -1;
  }

  next(rng: Rng, jumpChance: number): number {
    const out = this.lane;
    const r = rng();
    if (r < 0.52) {
      this.lane += this.dir;
    } else if (r < 0.82) {
      this.dir *= -1;
      this.lane += this.dir;
    } else if (rng() < jumpChance) {
      this.lane += this.dir * 2;
    } else {
      this.dir *= -1;
      this.lane += this.dir;
    }
    if (this.lane < 0) {
      this.lane = -this.lane;
      this.dir = 1;
    } else if (this.lane > 3) {
      this.lane = 6 - this.lane;
      this.dir = -1;
    }
    this.lane = Math.max(0, Math.min(3, this.lane));
    return out;
  }
}

export interface ChartOptions {
  seedSalt?: string;
  shuffleWords?: boolean;
  /** Overrides the track word list (used by Endless). */
  words?: string[];
}

export function buildChart(track: Track, difficulty: Difficulty, opts: ChartOptions = {}): Chart {
  const spec = CHART_SPECS[difficulty];
  const seed = seedFrom(track.id, difficulty, opts.seedSalt ?? 'standard');
  const rng = mulberry32(seed);
  const walker = new LaneWalker(rng);

  let wordIds = opts.words ?? wordsForTrack(track.id).map((w) => w.id);
  if (opts.shuffleWords) wordIds = shuffle(rng, wordIds);

  const leadInBeats = 8;
  const notes: ChartNote[] = [];
  const words: ChartWord[] = [];
  let noteId = 0;
  let cursor = leadInBeats;

  for (let wi = 0; wi < wordIds.length; wi++) {
    const entry = WORD_BY_ID[wordIds[wi]];
    if (!entry) continue;
    const letters = lettersOf(entry.id);
    if (letters.length === 0) continue;

    const letterSpan = Math.max(1, (letters.length - 1) * spec.spacing);
    const blockBeats = Math.max(
      spec.blockBars * 4,
      Math.ceil((letterSpan + 2) / 4) * 4,
    );

    const noteIds: number[] = [];
    const wordIndex = words.length;

    for (let i = 0; i < letters.length; i++) {
      const lane = walker.next(rng, spec.jumpChance);
      const beat = cursor + i * spec.spacing;
      notes.push({
        id: noteId,
        beat,
        lane,
        letter: letters[i],
        wordIndex,
        letterIndex: i,
        kind: 'letter',
        midi: laneMidi(track, lane, 1),
        velocity: 0.86 + rng() * 0.14,
      });
      noteIds.push(noteId);
      noteId++;
    }

    // Ornaments fill the tail of the block so the pulse never dies.
    const lastLetterBeat = cursor + letterSpan;
    const gridStart = Math.ceil((lastLetterBeat + spec.spacing) / spec.ornamentSpacing) * spec.ornamentSpacing;
    const gridEnd = cursor + blockBeats - 0.5;
    for (let b = gridStart; b <= gridEnd; b += spec.ornamentSpacing) {
      if (rng() > spec.ornamentChance) continue;
      const lane = walker.next(rng, spec.jumpChance);
      notes.push({
        id: noteId,
        beat: b,
        lane,
        letter: '',
        wordIndex: -1,
        letterIndex: -1,
        kind: 'ornament',
        midi: laneMidi(track, lane, 0),
        velocity: 0.6 + rng() * 0.2,
      });
      noteId++;
    }

    words.push({
      index: wordIndex,
      wordId: entry.id,
      startBeat: cursor,
      endBeat: cursor + blockBeats,
      letters,
      noteIds,
    });

    cursor += blockBeats;
  }

  const outroBeats = 8;
  const totalBeats = cursor + outroBeats;

  notes.sort((a, b) => a.beat - b.beat || a.lane - b.lane);

  return {
    trackId: track.id,
    difficulty,
    bpm: track.bpm,
    notes,
    words,
    totalBeats,
    leadInBeats,
    seed,
  };
}

export function chartSeconds(chart: Chart): number {
  return (chart.totalBeats * 60) / chart.bpm;
}

/** Build an endless chart from a rotating pool of every word in the game. */
export function buildEndlessChart(track: Track, difficulty: Difficulty, allIds: string[], round: number): Chart {
  const rng = mulberry32(seedFrom('endless', track.id, difficulty, round));
  const pool = shuffle(rng, allIds);
  const count = Math.min(pool.length, 14 + round * 2);
  return buildChart(track, difficulty, {
    words: pool.slice(0, count),
    seedSalt: `endless-${round}`,
  });
}
