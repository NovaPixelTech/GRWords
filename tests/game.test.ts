import { describe, expect, it } from 'vitest';
import { buildChart } from '../src/charts/compiler';
import { TRACKS } from '../src/content/tracks';
import { Game, type GameCarry } from '../src/game/game';
import { applyHit, createScoreState } from '../src/game/scoring';

const track = TRACKS[0];
const chart = buildChart(track, 'mortal');

function makeGame(carry?: GameCarry) {
  const events = {
    onHit: () => {},
    onMiss: () => {},
    onWordComplete: () => {},
    onEnd: () => {},
    onPhase: () => {},
  };
  return new Game({
    track,
    chart,
    difficulty: 'mortal',
    startTime: 0,
    offsetSec: 0,
    events,
    carry,
  });
}

describe('game judgement', () => {
  it('accepts a perfect press on the right lane', () => {
    const game = makeGame();
    const note = game.notes[0];
    const kind = game.press(note.note.lane, note.time);
    expect(kind).toBe('perfect');
    expect(game.score.counts.perfect).toBe(1);
    expect(game.score.combo).toBe(1);
    expect(note.judged).toBe('perfect');
  });

  it('ignores presses outside the good window', () => {
    const game = makeGame();
    const note = game.notes[0];
    expect(game.press(note.note.lane, note.time - 0.5)).toBeNull();
    expect(game.press(note.note.lane, note.time + 0.5)).toBeNull();
    expect(note.judged).toBeNull();
  });

  it('ignores presses on the wrong string', () => {
    const game = makeGame();
    const note = game.notes[0];
    const wrong = (note.note.lane + 1) % 4;
    expect(game.press(wrong, note.time)).toBeNull();
    expect(note.judged).toBeNull();
  });

  it('auto-misses notes that fall past the window and drains health', () => {
    const game = makeGame();
    const note = game.notes[0];
    const before = game.health;
    game.update(note.time + 0.2);
    expect(note.judged).toBe('miss');
    expect(game.score.counts.miss).toBeGreaterThan(0);
    expect(game.health).toBeLessThan(before);
  });

  it('carves a word only when every letter is resolved', () => {
    const game = makeGame();
    const word = game.words[0];
    expect(word.notes.length).toBe(word.word.letters.length);

    for (const runtime of word.notes.slice(0, -1)) {
      game.press(runtime.note.lane, runtime.time);
    }
    expect(word.resolved).toBe(false);
    expect(word.hits).toBe(word.notes.length - 1);

    const last = word.notes[word.notes.length - 1];
    game.press(last.note.lane, last.time);
    expect(word.resolved).toBe(true);
    expect(word.clean).toBe(true);
    expect(word.bonus).toBeGreaterThan(0);
    expect(game.spellStreak).toBe(1);
  });

  it('breaks the spell streak when a letter is missed', () => {
    const game = makeGame();
    const word = game.words[0];
    for (const runtime of word.notes.slice(1)) {
      game.press(runtime.note.lane, runtime.time);
    }
    game.update(word.notes[0].time + 0.2);
    expect(word.clean).toBe(false);
    expect(word.resolved).toBe(true);
    expect(game.spellStreak).toBe(0);
  });
});

describe('game lifecycle', () => {
  it('pauses even during the count-in and resumes at the same beat', () => {
    const game = makeGame();
    expect(game.phase).toBe('countdown');
    game.pause(0.3);
    expect(game.phase).toBe('paused');
    const beat = game.resume(10);
    expect(game.phase).toBe('playing');
    expect(beat).toBeGreaterThanOrEqual(0);
  });

  it('carries score, health and streak into a chained round', () => {
    const score = createScoreState();
    applyHit(score, 'perfect');
    const carry: GameCarry = { score, health: 42, spellStreak: 3 };
    const game = makeGame(carry);
    expect(game.score).toBe(score);
    expect(game.score.counts.perfect).toBe(1);
    expect(game.health).toBe(42);
    expect(game.spellStreak).toBe(3);
  });

  it('ends when health reaches zero', () => {
    let ended: string | null = null;
    const game = new Game({
      track,
      chart,
      difficulty: 'mortal',
      startTime: 0,
      offsetSec: 0,
      carry: { score: createScoreState(), health: 1, spellStreak: 0 },
      events: {
        onHit: () => {},
        onMiss: () => {},
        onWordComplete: () => {},
        onEnd: (reason) => {
          ended = reason;
        },
        onPhase: () => {},
      },
    });
    game.update(game.notes[0].time + 0.2);
    expect(ended).toBe('broken');
    expect(game.phase).toBe('ended');
  });
});
