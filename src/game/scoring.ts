import type { JudgementKind } from './judge';

export const POINTS: Record<JudgementKind, number> = {
  perfect: 300,
  great: 200,
  good: 110,
  miss: 0,
};

export const ACC_WEIGHT: Record<JudgementKind, number> = {
  perfect: 1,
  great: 0.72,
  good: 0.35,
  miss: 0,
};

const COMBO_CAP = 80;

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(Math.max(0, combo), COMBO_CAP) / COMBO_CAP;
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<JudgementKind, number>;
  weighted: number;
  judged: number;
  wordBonus: number;
}

export function createScoreState(): ScoreState {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    weighted: 0,
    judged: 0,
    wordBonus: 0,
  };
}

/** Mutates state, returns the points awarded. */
export function applyHit(state: ScoreState, kind: JudgementKind): number {
  state.counts[kind] += 1;
  state.judged += 1;
  state.weighted += ACC_WEIGHT[kind];

  if (kind === 'miss') {
    state.combo = 0;
    return 0;
  }

  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const gained = Math.round(POINTS[kind] * comboMultiplier(state.combo));
  state.score += gained;
  return gained;
}

export function applyWordBonus(
  state: ScoreState,
  letters: number,
  clean: boolean,
  streak: number,
): number {
  const streakBonus = 1 + Math.min(streak, 6) * 0.25;
  const base = letters * 120 * (clean ? 2 : 1);
  const gained = Math.round(base * streakBonus);
  state.score += gained;
  state.wordBonus += gained;
  return gained;
}

export function accuracyOf(state: ScoreState): number {
  if (state.judged === 0) return 0;
  return state.weighted / state.judged;
}

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export function rankFor(accuracy: number): Rank {
  if (accuracy >= 0.98) return 'S';
  if (accuracy >= 0.95) return 'A';
  if (accuracy >= 0.885) return 'B';
  if (accuracy >= 0.78) return 'C';
  return 'D';
}

export const RANK_META: Record<Rank, { title: string; color: string }> = {
  S: { title: 'Ἄριστος · Peerless', color: '#ffe7a6' },
  A: { title: 'Ἥρως · Hero', color: '#8ff0ff' },
  B: { title: 'Ἀγαθός · Worthy', color: '#b6ffd8' },
  C: { title: 'Μαθητής · Student', color: '#c9b3ff' },
  D: { title: 'Ἀρχάριος · Beginner', color: '#9aa0b8' },
};

export function scorePercent(state: ScoreState, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.min(1, state.score / maxScore);
}
