import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, seedFrom, todayKey } from '../src/util/rng';

describe('deterministic randomness', () => {
  it('replays the same sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes strings stably', () => {
    expect(hashString('etymos')).toBe(hashString('etymos'));
    expect(hashString('etymos')).not.toBe(hashString('etymo'));
    expect(seedFrom('a', 1, 'b')).toBe(seedFrom('a', 1, 'b'));
  });

  it('formats a stable UTC day key', () => {
    expect(todayKey(new Date('2026-11-04T22:10:00Z'))).toBe('2026-11-04');
  });
});
