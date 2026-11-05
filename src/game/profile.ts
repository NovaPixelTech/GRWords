import { loadJSON, saveJSON } from '../util/storage';
import type { Difficulty } from '../content/tracks';
import type { Rank } from './scoring';

export type Quality = 'high' | 'balanced' | 'low';

export interface Settings {
  offsetMs: number;
  music: number;
  sfx: number;
  quality: Quality;
  reducedMotion: boolean;
}

export interface Best {
  score: number;
  accuracy: number;
  rank: Rank;
  maxCombo: number;
  date: string;
}

export interface Profile {
  settings: Settings;
  codex: string[];
  bests: Record<string, Best>;
  plays: number;
  lastTrack: string;
  lastDifficulty: Difficulty;
}

export const DEFAULT_SETTINGS: Settings = {
  offsetMs: 0,
  music: 0.72,
  sfx: 0.78,
  quality: 'high',
  reducedMotion: false,
};

export function defaultProfile(): Profile {
  return {
    settings: { ...DEFAULT_SETTINGS },
    codex: [],
    bests: {},
    plays: 0,
    lastTrack: 'thalassa',
    lastDifficulty: 'mortal',
  };
}

export function loadProfile(): Profile {
  const stored = loadJSON<Partial<Profile>>('profile', {});
  const base = defaultProfile();
  return {
    ...base,
    ...stored,
    settings: { ...base.settings, ...(stored.settings ?? {}) },
    codex: Array.isArray(stored.codex) ? stored.codex : [],
    bests: stored.bests && typeof stored.bests === 'object' ? stored.bests : {},
  };
}

export function saveProfile(profile: Profile): void {
  saveJSON('profile', profile);
}

export function bestKey(trackId: string, difficulty: Difficulty): string {
  return `${trackId}:${difficulty}`;
}

export interface RunSummary {
  trackId: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  rank: Rank;
  maxCombo: number;
  wordIds: string[];
  date: string;
  mode: 'stage' | 'endless' | 'daily';
}

export function recordRun(profile: Profile, run: RunSummary): { profile: Profile; isBest: boolean; newWords: string[] } {
  const next: Profile = {
    ...profile,
    codex: [...profile.codex],
    bests: { ...profile.bests },
    plays: profile.plays + 1,
    lastTrack: run.trackId,
    lastDifficulty: run.difficulty,
  };

  const newWords: string[] = [];
  for (const id of run.wordIds) {
    if (!next.codex.includes(id)) {
      next.codex.push(id);
      newWords.push(id);
    }
  }

  let isBest = false;
  if (run.mode !== 'endless') {
    const key = run.mode === 'daily' ? `daily:${run.date}` : bestKey(run.trackId, run.difficulty);
    const prev = next.bests[key];
    if (!prev || run.score > prev.score) {
      next.bests[key] = {
        score: run.score,
        accuracy: run.accuracy,
        rank: run.rank,
        maxCombo: run.maxCombo,
        date: run.date,
      };
      isBest = true;
    }
  }

  saveProfile(next);
  return { profile: next, isBest, newWords };
}

export function resetProfile(): Profile {
  const fresh = defaultProfile();
  saveProfile(fresh);
  return fresh;
}
