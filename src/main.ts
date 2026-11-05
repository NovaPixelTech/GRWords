import './styles.css';

import { buildChart, buildEndlessChart, type Chart } from './charts/compiler';
import { DIFFICULTIES, TRACKS, TRACK_BY_ID, type Difficulty, type Track } from './content/tracks';
import { WORDS, WORD_BY_ID, lettersOf, type TrackId } from './content/words';
import { audio } from './audio/engine';
import { bell, choir, getLyre, shimmer, tek } from './audio/voices';
import { Game, type EndReason, type GameCarry, type RuntimeNote, type RuntimeWord } from './game/game';
import type { JudgementKind } from './game/judge';
import {
  bestKey,
  loadProfile,
  recordRun,
  resetProfile,
  saveProfile,
  type Profile,
  type Settings,
} from './game/profile';
import { rankFor, type Rank } from './game/scoring';
import { MusicDirector, wordFanfare } from './music/sequencer';
import { Stage, type FrameView } from './render/stage';
import { UI, type RunResultView, type ScreenName } from './ui/ui';
import { hashString, todayKey } from './util/rng';
import { clamp } from './util/math';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const live = document.getElementById('live') as HTMLElement;

const stage = new Stage(canvas);

let profile: Profile = loadProfile();
stage.setQuality(profile.settings.quality);
stage.reducedMotion = profile.settings.reducedMotion;

const ui = new UI(uiRoot, live, profile);
const music = new MusicDirector(audio);

type Mode = 'idle' | 'playing' | 'paused' | 'results';

interface Run {
  game: Game;
  track: Track;
  chart: Chart;
  difficulty: Difficulty;
  mode: 'stage' | 'endless' | 'daily';
  finishing: boolean;
  round: number;
  /** Every word completed across all rounds of this run. */
  collected: Set<string>;
}

interface RunSpec {
  trackId: TrackId;
  difficulty: Difficulty;
  mode: Run['mode'];
}

let run: Run | null = null;
let mode: Mode = 'idle';
let lastSpec: RunSpec | null = null;
let audioAnnounced = false;

const FEATURED = ['logos', 'thalassa', 'psyche', 'sophia', 'kleos', 'odysseia', 'philia', 'kosmos'];

/* ─────────────────────────── audio ─────────────────────────── */

async function unlockAudio(): Promise<boolean> {
  const ok = await audio.unlock();
  if (ok) {
    applyVolumes();
    if (!audioAnnounced) {
      audioAnnounced = true;
      ui.markAudioUnlocked();
    }
  }
  return ok;
}

function applyVolumes(): void {
  audio.setVolumes({ music: profile.settings.music, sfx: profile.settings.sfx });
}

/* ─────────────────────────── idle scene ─────────────────────────── */

function idleTrack(): Track {
  return TRACK_BY_ID[profile.lastTrack as TrackId] ?? TRACKS[0];
}

let idleCache: { key: string; word: RuntimeWord } | null = null;

function idleWord(now: number): RuntimeWord {
  const slot = Math.floor(now / 9) % FEATURED.length;
  const id = FEATURED[slot];
  if (idleCache && idleCache.key === id) return idleCache.word;
  const letters = lettersOf(id);
  const word: RuntimeWord = {
    word: { index: 0, wordId: id, startBeat: 0, endBeat: 0, letters, noteIds: [] },
    notes: letters.map((letter, i) => ({
      note: {
        id: i,
        beat: 0,
        lane: i % 4,
        letter,
        wordIndex: 0,
        letterIndex: i,
        kind: 'letter' as const,
        midi: 60,
        velocity: 1,
      },
      time: 0,
      judged: 'perfect' as JudgementKind,
      delta: 0,
    })),
    hits: letters.length,
    misses: 0,
    resolved: true,
    clean: true,
    completedAt: -1,
    bonus: 0,
  };
  idleCache = { key: id, word };
  return word;
}

function frameView(now: number): FrameView {
  if (run && mode !== 'idle') {
    const g = run.game;
    return {
      time: now,
      beat: g.beatAt(now),
      track: run.track,
      notes: g.notes,
      activeWord: g.inscriptionWord(now),
      combo: g.score.combo,
      health: g.healthRatio,
      phase: g.phase,
      leadInBeats: g.chart.leadInBeats,
      totalBeats: g.chart.totalBeats,
    };
  }
  return {
    time: now,
    beat: now * 0.55,
    track: idleTrack(),
    notes: idleNotes(now),
    activeWord: idleWord(now),
    combo: 0,
    health: 1,
    phase: 'idle',
    leadInBeats: 0,
    totalBeats: 1,
  };
}

/** A slow attract-mode rain of ghost notes behind the menus. */
function idleNotes(now: number): RuntimeNote[] {
  const step = 0.66;
  const first = Math.floor(now / step);
  const out: RuntimeNote[] = [];
  for (let i = 0; i < 9; i++) {
    const k = first + i;
    const id = FEATURED[Math.abs(k) % FEATURED.length];
    const letters = lettersOf(id);
    const letter = letters[Math.abs(k * 5) % letters.length] ?? 'Λ';
    out.push({
      note: {
        id: k,
        beat: 0,
        lane: Math.abs(k * 3) % 4,
        letter,
        wordIndex: 0,
        letterIndex: 0,
        kind: 'letter',
        midi: 60,
        velocity: 1,
      },
      time: k * step,
      judged: null,
      delta: 0,
    });
  }
  return out;
}

/* ─────────────────────────── run lifecycle ─────────────────────────── */

function chartFor(track: Track, difficulty: Difficulty, runMode: Run['mode'], round: number): Chart {
  if (runMode === 'endless') {
    return buildEndlessChart(track, difficulty, WORDS.map((w) => w.id), round);
  }
  if (runMode === 'daily') {
    return buildChart(track, difficulty, { seedSalt: todayKey(), shuffleWords: true });
  }
  return buildChart(track, difficulty);
}

interface StartOptions {
  round?: number;
  carry?: GameCarry;
  collected?: Set<string>;
}

function startRun(
  trackId: TrackId,
  difficulty: Difficulty,
  runMode: Run['mode'],
  opts: StartOptions = {},
): void {
  void (async () => {
    await unlockAudio();
    const track = TRACK_BY_ID[trackId];
    if (!track) return;

    const round = opts.round ?? 0;
    const collected = opts.collected ?? new Set<string>();

    music.stop();
    stage.effects.clear();
    stage.setTrack(track);
    ui.hidePause();
    lastSpec = { trackId, difficulty, mode: runMode };

    const chart = chartFor(track, difficulty, runMode, round);
    const startTime = audio.now() + 0.9;
    const offsetSec = profile.settings.offsetMs / 1000;

    const game: Game = new Game({
      track,
      chart,
      difficulty,
      startTime,
      offsetSec,
      carry: opts.carry,
      events: {
        onHit: (note, kind, when) => {
          const lyre = audio.ctx ? getLyre(audio.ctx) : null;
          const bus = audio.sfxBus;
          if (lyre && bus) {
            const gain = kind === 'perfect' ? 0.8 : kind === 'great' ? 0.66 : 0.52;
            lyre.play(bus, note.midi, Math.max(when, audio.now()), gain, kind === 'perfect' ? 1 : 0.75);
          }
          stage.hit(note.lane, kind);
        },
        onMiss: (note) => {
          if (audio.ctx && audio.sfxBus) getLyre(audio.ctx).thud(audio.sfxBus, audio.now(), 0.38);
          stage.miss(note.lane);
        },
        onWordComplete: (word, clean, streak, when) => {
          collected.add(word.wordId);
          const entry = WORD_BY_ID[word.wordId];
          const t = Math.max(when, audio.now());
          wordFanfare(audio, track, t);
          if (audio.ctx && audio.sfxBus) {
            choir(audio.ctx, audio.sfxBus, t, 196 * Math.pow(2, (word.index % 5) / 12), 1.2, 0.09);
            shimmer(audio.ctx, audio.sfxBus, t + 0.06, 784, 4, 0.07);
          }
          stage.wordComplete();
          ui.announce(`${entry?.greek ?? ''}, ${entry?.translit ?? ''}. ${entry?.meaning ?? ''}.`);
          if (clean) {
            ui.toast(`${entry?.greek ?? ''} · ${entry?.meaning ?? ''}${streak > 1 ? ` ×${streak}` : ''}`);
          }
        },
        onEnd: (reason) => {
          const current = run;
          if (!current || current.game !== game) return;
          if (runMode === 'endless' && reason === 'complete') {
            // Endless chains charts: keep score, health and the spell streak.
            mode = 'idle';
            startRun(trackId, difficulty, 'endless', {
              round: round + 1,
              collected,
              carry: {
                score: game.score,
                health: game.health,
                spellStreak: game.spellStreak,
              },
            });
            return;
          }
          finishRun(reason);
        },
        onPhase: () => {
          /* reflected through the frame view */
        },
      },
    });

    run = { game, track, chart, difficulty, mode: runMode, finishing: false, round, collected };
    mode = 'playing';

    music.start(track, chart, startTime, 0);
    music.seed(track, startTime, chart.totalBeats);
    ui.showScreen('none');
    ui.setTrackLabel(
      runMode === 'endless'
        ? `${track.name} · Open Sea${round > 0 ? ` · Round ${round + 1}` : ''}`
        : `${track.name} · ${track.title}`,
    );
    live.textContent = `${track.title}, ${difficulty}. Listen for the pulse.`;
    if (runMode === 'endless' && round > 0) ui.toast(`Round ${round + 1}`);
  })();
}

function finishRun(reason: EndReason): void {
  if (!run || run.finishing) return;
  run.finishing = true;
  mode = 'results';
  music.stop();

  const { game, track, difficulty, mode: runMode, collected } = run;
  const accuracy = game.accuracy;
  let rank: Rank = rankFor(accuracy);
  if (reason === 'broken' && rank === 'S') rank = 'A';
  if (reason === 'broken' && rank === 'A') rank = 'B';

  const bestBefore = profile.bests[bestKey(track.id, difficulty)];
  const wordIds = WORDS.filter((w) => collected.has(w.id)).map((w) => w.id);

  window.setTimeout(
    () => {
      if (!run) return;
      const updated = recordRun(profile, {
        trackId: track.id,
        difficulty,
        score: game.score.score,
        accuracy,
        rank,
        maxCombo: game.score.maxCombo,
        wordIds,
        date: todayKey(),
        mode: runMode,
      });
      profile = updated.profile;
      ui.setProfile(profile);
      applyVolumes();

      const view: RunResultView = {
        trackName: track.name,
        trackTitle: track.title,
        difficulty,
        score: game.score.score,
        accuracy,
        rank,
        maxCombo: game.score.maxCombo,
        counts: { ...game.score.counts },
        wordIds,
        newWords: updated.newWords,
        isBest: updated.isBest,
        mode: runMode,
        bestScore: bestBefore?.score ?? 0,
      };

      ui.showResults(view);
      run = null;
      updateDaily();
    },
    reason === 'broken' ? 1000 : 800,
  );
}

function restartRun(): void {
  if (run && !run.finishing) {
    startRun(run.track.id, run.difficulty, run.mode);
    return;
  }
  if (lastSpec) startRun(lastSpec.trackId, lastSpec.difficulty, lastSpec.mode);
}

function quitToSelect(): void {
  music.stop();
  run = null;
  mode = 'idle';
  ui.hidePause();
  ui.showScreen('select');
}

function pauseRun(): void {
  if (!run || mode !== 'playing') return;
  run.game.pause(audio.now());
  music.stop();
  mode = 'paused';
  ui.showPause();
}

function resumeRun(): void {
  if (!run || mode !== 'paused') return;
  const now = audio.now();
  const beat = run.game.resume(now);
  music.start(run.track, run.chart, run.game.startBeatTime, beat);
  mode = 'playing';
  ui.hidePause();
}

/* ─────────────────────────── daily ─────────────────────────── */

function updateDaily(): void {
  const key = todayKey();
  const track = TRACKS[hashString(key) % TRACKS.length];
  const difficulty = DIFFICULTIES[hashString(`${key}:d`) % DIFFICULTIES.length].id;
  const best = profile.bests[`daily:${key}`];
  ui.setDaily({
    trackId: track.id,
    trackName: track.name,
    trackTitle: track.title,
    difficulty,
    done: Boolean(best),
    bestScore: best?.score ?? 0,
  });
}

/* ─────────────────────────── settings ─────────────────────────── */

function applySettings(patch: Partial<Settings>): void {
  profile = { ...profile, settings: { ...profile.settings, ...patch } };
  saveProfile(profile);
  applyVolumes();
  if (patch.quality) stage.setQuality(patch.quality);
  if (patch.reducedMotion !== undefined) stage.reducedMotion = patch.reducedMotion;
}

/* ─────────────────────────── calibration ─────────────────────────── */

interface CalibrationState {
  active: boolean;
  clicks: number[];
  taps: number[];
  timer: number | null;
  nextAt: number;
}

const calib: CalibrationState = { active: false, clicks: [], taps: [], timer: null, nextAt: 0 };

function startCalibration(): void {
  void (async () => {
    await unlockAudio();
    calib.active = true;
    calib.clicks = [];
    calib.taps = [];
    ui.showScreen('calibration');
    ui.setCalibrationStatus('Listen… tap or press Space on each click. 0 / 10');
    calib.nextAt = audio.now() + 0.9;
    tickCalibration();
  })();
}

function tickCalibration(): void {
  if (!calib.active) return;
  const now = audio.now();
  if (now >= calib.nextAt) {
    const when = calib.nextAt;
    calib.clicks.push(when);
    if (audio.ctx && audio.sfxBus) {
      tek(audio.ctx, audio.sfxBus, when, 0.55);
      bell(audio.ctx, audio.sfxBus, when, 1320, 0.14, 0.5);
    }
    ui.pulseCalibration();
    calib.nextAt += 0.62;
  }
  calib.timer = window.setTimeout(tickCalibration, 30);
}

function tapCalibration(): void {
  if (!calib.active) return;
  const now = audio.now();
  let best = -1;
  let bestD = Infinity;
  for (const c of calib.clicks) {
    const d = Math.abs(now - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best < 0 || bestD > 0.28) return;

  calib.taps.push(now - best);
  const n = calib.taps.length;
  ui.setCalibrationStatus(`Taps: ${n} / 10`);

  if (n >= 10) {
    const sorted = [...calib.taps].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    const ms = Math.round(clamp(avg * 1000, -160, 160));
    stopCalibration();
    applySettings({ offsetMs: ms });
    ui.toast(`Offset set to ${ms > 0 ? '+' : ''}${ms} ms`);
    ui.showScreen('settings');
  }
}

function stopCalibration(): void {
  calib.active = false;
  if (calib.timer !== null) window.clearTimeout(calib.timer);
  calib.timer = null;
}

/* ─────────────────────────── input ─────────────────────────── */

const KEY_LANES: Record<string, number> = { d: 0, f: 1, j: 2, k: 3 };
const CODE_LANES: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };

function pressLane(lane: number): void {
  if (!run || mode !== 'playing') return;
  run.game.press(lane, audio.now());
}

window.addEventListener('keydown', (ev) => {
  const key = ev.key.toLowerCase();

  if (calib.active) {
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (!ev.repeat) tapCalibration();
    }
    if (key === 'escape') {
      stopCalibration();
      ui.showScreen('settings');
    }
    return;
  }

  if (key === 'escape') {
    if (mode === 'playing') pauseRun();
    else if (mode === 'paused') resumeRun();
    return;
  }

  if (!ui.audioUnlocked) void unlockAudio();

  const lane = CODE_LANES[ev.code] ?? KEY_LANES[key];
  if (lane === undefined) return;
  if (mode !== 'playing' || ev.repeat) return;
  ev.preventDefault();
  pressLane(lane);
});

// Calibration is a tap test, so it has to accept pointer input too — a phone
// has no Space bar. Buttons are excluded so Cancel does not count as a tap.
document.addEventListener(
  'pointerdown',
  (ev) => {
    if (!calib.active) return;
    const target = ev.target as Element | null;
    if (target?.closest?.('[data-action]')) return;
    ev.preventDefault();
    tapCalibration();
  },
  { capture: true, passive: false },
);

canvas.addEventListener(
  'pointerdown',
  (ev) => {
    if (mode !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    if (ev.clientY - rect.top < rect.height * 0.4) return;
    pressLane(stage.laneAt(ev.clientX - rect.left));
  },
  { passive: true },
);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') pauseRun();
});

/* ─────────────────────────── main loop ─────────────────────────── */

let lastFrame = performance.now();

function frame(ts: number): void {
  const dt = Math.min(0.05, (ts - lastFrame) / 1000);
  lastFrame = ts;
  const now = audio.now();

  stage.update(dt);
  stage.render(frameView(now));

  if (run && mode === 'playing') {
    run.game.update(now);
    const g = run.game;
    const beat = g.beatAt(now);
    ui.updateHud({
      score: g.score.score,
      accuracy: g.accuracy,
      combo: g.score.combo,
      health: g.healthRatio,
      progress: Math.max(0, Math.min(1, beat / g.chart.totalBeats)),
      beat,
      leadIn: g.chart.leadInBeats,
    });
  }

  requestAnimationFrame(frame);
}

/* ─────────────────────────── wiring ─────────────────────────── */

ui.actions = {
  onStart: (trackId, difficulty, runMode) => startRun(trackId, difficulty, runMode),
  onEndless: (difficulty) => {
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    startRun(track.id, difficulty, 'endless');
  },
  onScreen: (screen: ScreenName | 'none') => {
    if (screen === 'none') return;
    if (mode !== 'playing' && mode !== 'paused') {
      mode = 'idle';
      music.stop();
    }
    if (screen === 'title') updateDaily();
  },
  onResume: () => resumeRun(),
  onRestart: () => restartRun(),
  onQuit: () => quitToSelect(),
  onSettings: (patch) => applySettings(patch),
  onErase: () => {
    profile = resetProfile();
    ui.setProfile(profile);
    applyVolumes();
    ui.toast('Progress erased');
    updateDaily();
  },
  onCalibrateStart: () => startCalibration(),
  onCalibrateCancel: () => stopCalibration(),
  onUnlockAudio: () => {
    void unlockAudio();
  },
};

window.addEventListener('resize', () => stage.resize());

updateDaily();
ui.setCodexCount();
applyVolumes();

const params = new URLSearchParams(window.location.search);
if (params.has('autostart')) {
  const t = (params.get('track') ?? 'thalassa') as TrackId;
  const d = (params.get('difficulty') ?? 'mortal') as Difficulty;
  window.setTimeout(() => startRun(t, d, 'stage'), 500);
}

requestAnimationFrame(frame);

/* Small debug surface used by smoke tests and development. */
(window as unknown as { ETYMOS?: unknown }).ETYMOS = {
  start: (track: TrackId = 'thalassa', difficulty: Difficulty = 'mortal') => startRun(track, difficulty, 'stage'),
  pause: pauseRun,
  resume: resumeRun,
  /** The clock the game judges against (audio clock when available). */
  now: () => audio.now(),
  audio,
  stage,
  ui,
  get run() {
    return run;
  },
  get profile() {
    return profile;
  },
};
