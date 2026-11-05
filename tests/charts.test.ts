import { describe, expect, it } from 'vitest';
import { CHART_SPECS, buildChart, chartSeconds } from '../src/charts/compiler';
import { TRACKS, type Difficulty } from '../src/content/tracks';
import { wordsForTrack } from '../src/content/words';

const difficulties: Difficulty[] = ['mortal', 'hero', 'olympian'];

describe('chart compiler', () => {
  for (const track of TRACKS) {
    for (const difficulty of difficulties) {
      it(`builds a sane chart for ${track.id}/${difficulty}`, () => {
        const chart = buildChart(track, difficulty);

        expect(chart.notes.length).toBeGreaterThan(40);
        expect(chart.words.length).toBe(wordsForTrack(track.id).length);

        // notes are sorted
        for (let i = 1; i < chart.notes.length; i++) {
          expect(chart.notes[i].beat).toBeGreaterThanOrEqual(chart.notes[i - 1].beat);
        }

        // lanes are legal
        for (const n of chart.notes) {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThanOrEqual(3);
          expect(n.beat).toBeGreaterThanOrEqual(chart.leadInBeats - 0.001);
        }

        // every letter note appears exactly once, in order, per word
        for (const word of chart.words) {
          const letterNotes = chart.notes.filter(
            (n) => n.kind === 'letter' && n.wordIndex === word.index,
          );
          expect(letterNotes.length).toBe(word.letters.length);
          expect(letterNotes.map((n) => n.letter)).toEqual(word.letters);
          for (let i = 1; i < letterNotes.length; i++) {
            expect(letterNotes[i].beat).toBeGreaterThan(letterNotes[i - 1].beat);
          }
        }

        // words do not overlap
        for (let i = 1; i < chart.words.length; i++) {
          expect(chart.words[i].startBeat).toBeGreaterThanOrEqual(chart.words[i - 1].endBeat - 0.001);
        }

        expect(chart.totalBeats).toBeGreaterThan(chart.words[chart.words.length - 1].endBeat);
        expect(chartSeconds(chart)).toBeGreaterThan(30);
      });
    }
  }

  it('is deterministic for the same seed', () => {
    const track = TRACKS[0];
    const a = buildChart(track, 'hero');
    const b = buildChart(track, 'hero');
    expect(a.notes.map((n) => `${n.beat}:${n.lane}`)).toEqual(b.notes.map((n) => `${n.beat}:${n.lane}`));
  });

  it('changes shape with difficulty', () => {
    const track = TRACKS[0];
    const mortal = buildChart(track, 'mortal');
    const olympian = buildChart(track, 'olympian');
    expect(CHART_SPECS.olympian.spacing).toBeLessThan(CHART_SPECS.mortal.spacing);
    expect(olympian.notes.length).toBeGreaterThan(mortal.notes.length);
  });

  it('shuffles words for daily-style charts', () => {
    const track = TRACKS[2];
    const a = buildChart(track, 'hero', { shuffleWords: true, seedSalt: 'a' });
    const b = buildChart(track, 'hero', { shuffleWords: true, seedSalt: 'b' });
    expect(a.words.map((w) => w.wordId)).not.toEqual(b.words.map((w) => w.wordId));
  });
});
