import { describe, expect, it } from 'vitest';
import { LETTERS, WORDS, lettersOf, toLetters } from '../src/content/words';

describe('toLetters', () => {
  it('strips polytonic accents and breathings', () => {
    expect(toLetters('ἄνεμος')).toEqual(['Α', 'Ν', 'Ε', 'Μ', 'Ο', 'Σ']);
    expect(toLetters('ἀλήθεια')).toEqual(['Α', 'Λ', 'Η', 'Θ', 'Ε', 'Ι', 'Α']);
  });

  it('produces the Greek alphabet from lowercase and capitalised words', () => {
    expect(toLetters('λόγος')).toEqual(['Λ', 'Ο', 'Γ', 'Ο', 'Σ']);
    expect(toLetters('Ἀμφιτρίτη')).toEqual(['Α', 'Μ', 'Φ', 'Ι', 'Τ', 'Ρ', 'Ι', 'Τ', 'Η']);
    expect(toLetters('Ὀδύσσεια')).toEqual(['Ο', 'Δ', 'Υ', 'Σ', 'Σ', 'Ε', 'Ι', 'Α']);
  });

  it('normalises the final sigma', () => {
    expect(toLetters('θάλασσα')).toEqual(['Θ', 'Α', 'Λ', 'Α', 'Σ', 'Σ', 'Α']);
    expect(toLetters('ἅλς')).toEqual(['Α', 'Λ', 'Σ']);
  });

  it('never leaks combining marks or non-Greek characters', () => {
    for (const word of WORDS) {
      const letters = lettersOf(word.id);
      expect(letters.length).toBeGreaterThan(1);
      for (const ch of letters) {
        const code = ch.codePointAt(0) ?? 0;
        expect(ch.length).toBe(1);
        expect(code).toBeGreaterThanOrEqual(0x0391);
        expect(code).toBeLessThanOrEqual(0x03a9);
      }
    }
  });

  it('precomputes a letter set for every word', () => {
    expect(Object.keys(LETTERS).length).toBe(WORDS.length);
  });
});

describe('vocabulary', () => {
  it('has no duplicate ids', () => {
    const ids = WORDS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all six tracks with at least ten words each', () => {
    const byTrack = new Map<string, number>();
    for (const w of WORDS) byTrack.set(w.track, (byTrack.get(w.track) ?? 0) + 1);
    expect(byTrack.size).toBe(6);
    for (const count of byTrack.values()) expect(count).toBeGreaterThanOrEqual(10);
  });
});
