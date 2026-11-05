import { describe, expect, it } from 'vitest';
import { WINDOWS, gradeAbs } from '../src/game/judge';
import {
  accuracyOf,
  applyHit,
  applyWordBonus,
  comboMultiplier,
  createScoreState,
  rankFor,
} from '../src/game/scoring';

describe('judgement windows', () => {
  it('grades symmetrically around the beat', () => {
    expect(gradeAbs(0)).toBe('perfect');
    expect(gradeAbs(0.04)).toBe('perfect');
    expect(gradeAbs(-0.04)).toBe('perfect');
    expect(gradeAbs(WINDOWS.perfect + 0.01)).toBe('great');
    expect(gradeAbs(-WINDOWS.great + 0.005)).toBe('great');
    expect(gradeAbs(WINDOWS.great + 0.01)).toBe('good');
    expect(gradeAbs(WINDOWS.good + 0.01)).toBeNull();
  });
});

describe('scoring', () => {
  it('caps the combo multiplier at 2x', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(40)).toBeCloseTo(1.5);
    expect(comboMultiplier(500)).toBe(2);
  });

  it('awards more for perfect than good and resets on miss', () => {
    const state = createScoreState();
    const perfect = applyHit(state, 'perfect');
    const good = applyHit(state, 'good');
    expect(perfect).toBeGreaterThan(good);
    expect(state.combo).toBe(2);
    applyHit(state, 'miss');
    expect(state.combo).toBe(0);
    expect(state.judged).toBe(3);
  });

  it('computes weighted accuracy', () => {
    const state = createScoreState();
    applyHit(state, 'perfect');
    applyHit(state, 'perfect');
    applyHit(state, 'miss');
    applyHit(state, 'miss');
    expect(accuracyOf(state)).toBeCloseTo(0.5);
  });

  it('rewards clean words more than broken ones', () => {
    const clean = createScoreState();
    const broken = createScoreState();
    const a = applyWordBonus(clean, 7, true, 1);
    const b = applyWordBonus(broken, 7, false, 0);
    expect(a).toBeGreaterThan(b);
  });

  it('maps accuracy onto ranks', () => {
    expect(rankFor(1)).toBe('S');
    expect(rankFor(0.96)).toBe('A');
    expect(rankFor(0.9)).toBe('B');
    expect(rankFor(0.8)).toBe('C');
    expect(rankFor(0.4)).toBe('D');
  });
});
