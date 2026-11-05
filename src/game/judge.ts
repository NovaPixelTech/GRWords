import type { ChartNote } from '../charts/compiler';

export type JudgementKind = 'perfect' | 'great' | 'good' | 'miss';

/** Timing windows in seconds, measured on the input, absolute value. */
export const WINDOWS = {
  perfect: 0.048,
  great: 0.095,
  good: 0.15,
} as const;

export const HIT_TOTAL = WINDOWS.good;

/**
 * Grade a hit. Returns null when the press is outside the good window entirely
 * (that press should be ignored, not punished).
 */
export function gradeAbs(deltaSeconds: number): JudgementKind | null {
  const d = Math.abs(deltaSeconds);
  if (d <= WINDOWS.perfect) return 'perfect';
  if (d <= WINDOWS.great) return 'great';
  if (d <= WINDOWS.good) return 'good';
  return null;
}

export interface Judgement {
  note: ChartNote;
  kind: JudgementKind;
  delta: number;
  when: number;
}

export const JUDGEMENT_LABEL: Record<JudgementKind, string> = {
  perfect: 'ΕΥ̓͂ · perfect',
  great: 'ΚΑΛΟΣ · great',
  good: 'ἸΚΑΝΟΣ · good',
  miss: 'ἈΣΤΟΧΟΣ · miss',
};

export const JUDGEMENT_COLOR: Record<JudgementKind, string> = {
  perfect: '#ffe7a6',
  great: '#8ff0ff',
  good: '#b6b8d4',
  miss: '#ff6b6b',
};
