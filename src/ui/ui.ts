import { DIFFICULTIES, TRACKS, TRACK_BY_ID, type Difficulty } from '../content/tracks';
import { WORD_BY_ID, WORDS } from '../content/words';
import type { Profile, Settings } from '../game/profile';
import { bestKey } from '../game/profile';
import type { Rank } from '../game/scoring';
import { RANK_META } from '../game/scoring';
import type { TrackId } from '../content/words';

export type ScreenName = 'title' | 'select' | 'codex' | 'settings' | 'results' | 'calibration' | 'pause';

export interface DailyInfo {
  trackId: TrackId;
  trackName: string;
  trackTitle: string;
  difficulty: Difficulty;
  done: boolean;
  bestScore: number;
}

export interface RunResultView {
  trackName: string;
  trackTitle: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  rank: Rank;
  maxCombo: number;
  counts: Record<string, number>;
  wordIds: string[];
  newWords: string[];
  isBest: boolean;
  mode: 'stage' | 'endless' | 'daily';
  bestScore: number;
}

export interface HudState {
  score: number;
  accuracy: number;
  combo: number;
  health: number;
  progress: number;
  beat: number;
  leadIn: number;
}

export interface UIActions {
  onStart(trackId: TrackId, difficulty: Difficulty, mode: 'stage' | 'daily'): void;
  onEndless(difficulty: Difficulty): void;
  onScreen(screen: ScreenName | 'none'): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onSettings(patch: Partial<Settings>): void;
  onErase(): void;
  onCalibrateStart(): void;
  onCalibrateCancel(): void;
  onUnlockAudio(): void;
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

export class UI {
  readonly root: HTMLElement;
  private live: HTMLElement;
  private screens = new Map<ScreenName, HTMLElement>();
  private hud: HTMLElement;
  private toastEl: HTMLElement;
  private profile: Profile;
  private difficulty: Difficulty = 'mortal';
  daily: DailyInfo | null = null;
  actions: UIActions | null = null;
  audioUnlocked = false;

  constructor(root: HTMLElement, live: HTMLElement, profile: Profile) {
    this.root = root;
    this.live = live;
    this.profile = profile;
    this.difficulty = profile.lastDifficulty;
    root.innerHTML = this.template();
    this.hud = root.querySelector('[data-hud]') as HTMLElement;
    this.toastEl = root.querySelector('[data-toast]') as HTMLElement;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-screen]'))) {
      const name = el.dataset.screen as ScreenName;
      this.screens.set(name, el);
    }
    this.bind();
    this.renderSelect();
    this.renderCodex();
    this.renderSettings();
    this.showScreen('title');
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
    this.renderSelect();
    this.renderCodex();
    this.renderSettings();
  }

  private template(): string {
    const diffButtons = DIFFICULTIES.map(
      (d) => `<button class="diff-pill" data-action="diff" data-diff="${d.id}">
        <span class="diff-greek">${d.greek}</span>
        <span class="diff-label">${d.label}</span>
        <span class="diff-stars">${'★'.repeat(d.stars)}</span>
      </button>`,
    ).join('');

    return `
      <section class="screen screen-title" data-screen="title">
        <div class="title-inner">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true">ΛΥΡΑ</div>
            <h1 class="brand-name">ETYMOS</h1>
            <p class="brand-tag">Play the word. Hear the word. Keep the word.</p>
          </div>
          <div class="menu">
            <button class="btn btn-primary" data-action="open" data-screen="select">
              <span class="btn-glyph">☼</span> Enter the Lyre
            </button>
            <button class="btn" data-action="daily">
              <span class="btn-glyph">✦</span> Daily Oracle
              <span class="daily-sub" data-daily-sub></span>
            </button>
            <div class="menu-row">
              <button class="btn btn-ghost" data-action="open" data-screen="codex">Codex</button>
              <button class="btn btn-ghost" data-action="open" data-screen="settings">Settings</button>
            </div>
          </div>
          <p class="title-hint" data-hint>Tap anywhere to awaken the lyre</p>
          <div class="title-foot">
            <span>4 strings · D F J K</span>
            <span class="dot">·</span>
            <span data-codex-count>0 words kept</span>
          </div>
        </div>
      </section>

      <section class="screen" data-screen="select">
        <header class="screen-head">
          <button class="btn btn-ghost small" data-action="back">←</button>
          <h2>Choose a Song</h2>
          <span class="head-spacer"></span>
        </header>
        <div class="diff-row" data-diff-row>${diffButtons}</div>
        <div class="track-grid" data-track-grid></div>
        <footer class="screen-foot">
          <button class="btn btn-ghost" data-action="endless">Endless · Open Sea</button>
        </footer>
      </section>

      <section class="screen" data-screen="results">
        <div class="results" data-results></div>
      </section>

      <section class="screen" data-screen="codex">
        <header class="screen-head">
          <button class="btn btn-ghost small" data-action="back">←</button>
          <h2>Codex</h2>
          <span class="head-spacer" data-codex-total></span>
        </header>
        <div class="codex" data-codex></div>
      </section>

      <section class="screen" data-screen="settings">
        <header class="screen-head">
          <button class="btn btn-ghost small" data-action="back">←</button>
          <h2>Settings</h2>
          <span class="head-spacer"></span>
        </header>
        <div class="settings" data-settings></div>
      </section>

      <section class="screen" data-screen="calibration">
        <div class="calib">
          <h2>Calibrate</h2>
          <p>Tap the screen — or press Space — in time with the clicks. Ten taps is enough.</p>
          <div class="calib-dot" data-calib-dot></div>
          <p class="calib-status" data-calib-status>Taps: 0</p>
          <div class="menu-row">
            <button class="btn" data-action="calib-cancel">Cancel</button>
          </div>
        </div>
      </section>

      <section class="screen screen-pause" data-screen="pause">
        <div class="pause-card">
          <p class="pause-greek">Ἀνάπαυλα</p>
          <h2>Paused</h2>
          <div class="menu">
            <button class="btn btn-primary" data-action="resume">Resume</button>
            <button class="btn btn-ghost" data-action="restart">Restart</button>
            <button class="btn btn-ghost" data-action="quit">Quit to Songs</button>
          </div>
        </div>
      </section>

      <div class="hud" data-hud aria-hidden="true">
        <div class="hud-top">
          <div class="hud-score">
            <span class="hud-label">Score</span>
            <span class="hud-value" data-hud-score>0</span>
          </div>
          <div class="hud-center">
            <div class="hud-progress"><i data-hud-progress></i></div>
            <div class="hud-track" data-hud-track></div>
          </div>
          <div class="hud-acc">
            <span class="hud-label">Acc</span>
            <span class="hud-value" data-hud-acc>100%</span>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="hud-health"><i data-hud-health></i></div>
          <div class="hud-combo" data-hud-combo><b>0</b><span>combo</span></div>
        </div>
      </div>

      <div class="toast" data-toast></div>
    `;
  }

  private bind(): void {
    this.root.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) {
        if (!this.audioUnlocked) this.actions?.onUnlockAudio();
        return;
      }
      const action = target.dataset.action;
      if (!this.audioUnlocked) {
        this.audioUnlocked = true;
        this.actions?.onUnlockAudio();
      }
      switch (action) {
        case 'open':
          this.showScreen(target.dataset.screen as ScreenName);
          this.actions?.onScreen(target.dataset.screen as ScreenName);
          break;
        case 'back': {
          const dest = (target.dataset.back as ScreenName | undefined) ?? 'title';
          this.showScreen(dest);
          this.actions?.onScreen(dest);
          break;
        }
        case 'diff':
          this.difficulty = (target.dataset.diff as Difficulty) ?? 'mortal';
          this.renderSelect();
          break;
        case 'play': {
          const track = target.dataset.track as TrackId;
          this.actions?.onStart(track, this.difficulty, 'stage');
          break;
        }
        case 'daily':
          if (this.daily) this.actions?.onStart(this.daily.trackId, this.daily.difficulty, 'daily');
          break;
        case 'endless':
          this.actions?.onEndless(this.difficulty);
          break;
        case 'resume':
          this.actions?.onResume();
          break;
        case 'restart':
          this.actions?.onRestart();
          break;
        case 'quit':
          this.actions?.onQuit();
          break;
        case 'calibrate':
          this.actions?.onCalibrateStart();
          break;
        case 'calib-cancel':
          this.actions?.onCalibrateCancel();
          this.showScreen('settings');
          break;
        case 'erase':
          this.actions?.onErase();
          break;
        case 'unlock':
          this.actions?.onUnlockAudio();
          break;
        default:
          break;
      }
    });

    this.root.addEventListener('input', (ev) => {
      const input = ev.target as HTMLInputElement;
      if (!input.dataset.setting) return;
      const key = input.dataset.setting as keyof Settings;
      let value: number | string | boolean;
      if (input.type === 'range') value = Number(input.value) / 100;
      else if (input.type === 'checkbox') value = input.checked;
      else value = input.value;
      if (key === 'offsetMs') value = Number(input.value);
      const patch: Partial<Settings> = { [key]: value } as Partial<Settings>;
      if (key === 'offsetMs') patch.offsetMs = Number(input.value);
      this.actions?.onSettings(patch);
      this.updateSettingLabel(input);
    });
  }

  private updateSettingLabel(input: HTMLInputElement): void {
    const out = input.parentElement?.querySelector<HTMLElement>('[data-out]');
    if (!out) return;
    if (input.type === 'range') {
      if (input.dataset.setting === 'offsetMs') out.textContent = `${input.value} ms`;
      else out.textContent = `${Math.round(Number(input.value))}%`;
    }
  }

  showScreen(name: ScreenName | 'none'): void {
    for (const [key, el] of this.screens) {
      el.classList.toggle('active', key === name);
    }
    if (name !== 'none') {
      this.screens.get(name)?.classList.add('active');
    }
    const playing = name === 'none';
    this.hud.classList.toggle('active', playing);
    document.body.classList.toggle('playing', playing);
    if (name !== 'title') this.audioUnlocked = true;
    else this.updateHint();
  }

  showPause(): void {
    this.screens.get('pause')?.classList.add('active');
  }

  hidePause(): void {
    this.screens.get('pause')?.classList.remove('active');
  }

  private updateHint(): void {
    const hint = this.root.querySelector<HTMLElement>('[data-hint]');
    if (!hint) return;
    hint.textContent = this.audioUnlocked ? 'Tap a song to begin' : 'Tap anywhere to awaken the lyre';
  }

  markAudioUnlocked(): void {
    this.audioUnlocked = true;
    this.updateHint();
    this.toast('The lyre is awake');
  }

  setDaily(info: DailyInfo): void {
    this.daily = info;
    const sub = this.root.querySelector<HTMLElement>('[data-daily-sub]');
    if (sub) {
      sub.textContent = `${info.trackName} · ${info.done ? `best ${num(info.bestScore)}` : 'unplayed'}`;
    }
  }

  setCodexCount(): void {
    const el = this.root.querySelector<HTMLElement>('[data-codex-count]');
    if (el) el.textContent = `${this.profile.codex.length} of ${WORDS.length} words kept`;
  }

  private renderSelect(): void {
    for (const btn of Array.from(this.root.querySelectorAll<HTMLElement>('.diff-pill'))) {
      btn.classList.toggle('active', btn.dataset.diff === this.difficulty);
    }
    const grid = this.root.querySelector<HTMLElement>('[data-track-grid]');
    if (!grid) return;
    grid.innerHTML = TRACKS.map((t) => {
      const best = this.profile.bests[bestKey(t.id, this.difficulty)];
      const rank = best ? best.rank : null;
      return `<button class="track-card" data-action="play" data-track="${t.id}">
        <span class="track-glow" style="--glow-a:${t.palette.accent};--glow-b:${t.palette.gold}"></span>
        <span class="track-glyph">${t.glyph}</span>
        <span class="track-name">${t.name}</span>
        <span class="track-title">${t.title}</span>
        <span class="track-epithet">${t.epithet}</span>
        <span class="track-meta">
          <span class="track-bpm">${t.bpm} bpm</span>
          ${rank ? `<span class="track-rank rank-${rank}">${rank}</span>` : `<span class="track-rank empty">—</span>`}
        </span>
      </button>`;
    }).join('');
  }

  private renderCodex(): void {
    const host = this.root.querySelector<HTMLElement>('[data-codex]');
    const total = this.root.querySelector<HTMLElement>('[data-codex-total]');
    if (!host) return;
    if (total) total.textContent = `${this.profile.codex.length} / ${WORDS.length}`;
    const groups = TRACKS.map((t) => {
      const words = WORDS.filter((w) => w.track === t.id);
      const cards = words
        .map((w) => {
          const known = this.profile.codex.includes(w.id);
          return `<article class="codex-card ${known ? 'known' : 'locked'}">
            <div class="codex-greek">${known ? w.greek : '· · ·'}</div>
            <div class="codex-translit">${known ? w.translit.toUpperCase() : 'UNKNOWN'}</div>
            <div class="codex-meaning">${known ? w.meaning : 'Forge this word to reveal it'}</div>
            ${known && w.kin ? `<div class="codex-kin">${w.kin.slice(0, 3).join(' · ')}</div>` : ''}
          </article>`;
        })
        .join('');
      return `<section class="codex-group">
        <h3><span>${t.name}</span> ${t.title}</h3>
        <div class="codex-grid">${cards}</div>
      </section>`;
    }).join('');
    host.innerHTML = groups;
    this.setCodexCount();
  }

  private renderSettings(): void {
    const host = this.root.querySelector<HTMLElement>('[data-settings]');
    if (!host) return;
    const s = this.profile.settings;
    host.innerHTML = `
      <div class="setting">
        <label>Music</label>
        <input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-setting="music" />
        <span class="setting-out" data-out>${Math.round(s.music * 100)}%</span>
      </div>
      <div class="setting">
        <label>Effects</label>
        <input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-setting="sfx" />
        <span class="setting-out" data-out>${Math.round(s.sfx * 100)}%</span>
      </div>
      <div class="setting">
        <label>Timing offset</label>
        <input type="range" min="-160" max="160" value="${s.offsetMs}" data-setting="offsetMs" />
        <span class="setting-out" data-out>${s.offsetMs} ms</span>
      </div>
      <div class="setting">
        <label>Graphics</label>
        <select data-setting="quality">
          <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High — bloom and grain</option>
          <option value="balanced" ${s.quality === 'balanced' ? 'selected' : ''}>Balanced</option>
          <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low — fastest</option>
        </select>
      </div>
      <div class="setting setting-check">
        <label>Reduce motion</label>
        <input type="checkbox" data-setting="reducedMotion" ${s.reducedMotion ? 'checked' : ''} />
      </div>
      <div class="setting-actions">
        <button class="btn btn-ghost" data-action="calibrate">Timing calibration</button>
        <button class="btn btn-ghost danger" data-action="erase">Erase all progress</button>
      </div>
      <p class="setting-note">
        Default keys: <b>D F J K</b> for the four strings. On touch, tap the lower half of the screen in four columns.
      </p>
    `;
  }

  showResults(r: RunResultView): void {
    const host = this.root.querySelector<HTMLElement>('[data-results]');
    if (!host) return;
    const meta = RANK_META[r.rank];
    const words = r.wordIds
      .map((id) => {
        const w = WORD_BY_ID[id];
        if (!w) return '';
        const isNew = r.newWords.includes(id);
        return `<span class="earned-word ${isNew ? 'new' : ''}">
          <b>${w.greek}</b><i>${w.translit}</i><em>${w.meaning}</em>
        </span>`;
      })
      .join('');

    host.innerHTML = `
      <div class="rank-badge rank-badge-${r.rank}" style="--rank-color:${meta.color}">
        <span class="rank-letter">${r.rank}</span>
        <span class="rank-title">${meta.title}</span>
      </div>
      <h2 class="results-title">${r.trackName} <span>· ${r.trackTitle}</span></h2>
      <p class="results-sub">${r.difficulty.toUpperCase()}${r.mode === 'daily' ? ' · DAILY ORACLE' : r.mode === 'endless' ? ' · OPEN SEA' : ''}${r.isBest ? ' · NEW BEST' : ''}</p>
      ${r.bestScore > 0 && !r.isBest ? `<p class="results-best">Best ${num(r.bestScore)}</p>` : ''}
      <div class="results-stats">
        <div><span>Score</span><b>${num(r.score)}</b></div>
        <div><span>Accuracy</span><b>${(r.accuracy * 100).toFixed(2)}%</b></div>
        <div><span>Max combo</span><b>${num(r.maxCombo)}</b></div>
        <div><span>Perfect</span><b>${num(r.counts.perfect ?? 0)}</b></div>
      </div>
      <div class="earned">
        <h3>Words performed</h3>
        <div class="earned-list">${words || '<span class="muted">No words completed</span>'}</div>
      </div>
      <div class="results-actions">
        <button class="btn btn-primary" data-action="restart">Play again</button>
        <button class="btn btn-ghost" data-action="back" data-back="select">Songs</button>
      </div>
    `;
    this.showScreen('results');
  }

  updateHud(state: HudState): void {
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel);
    const score = q('[data-hud-score]');
    const acc = q('[data-hud-acc]');
    const prog = q('[data-hud-progress]');
    const health = q('[data-hud-health]');
    const combo = q('[data-hud-combo]');
    if (score) score.textContent = num(state.score);
    if (acc) acc.textContent = `${(state.accuracy * 100).toFixed(1)}%`;
    if (prog) prog.style.width = `${Math.round(state.progress * 100)}%`;
    if (health) health.style.width = `${Math.round(state.health * 100)}%`;
    if (combo) {
      combo.classList.toggle('on', state.combo > 4);
      const b = combo.querySelector('b');
      if (b) b.textContent = num(state.combo);
    }
  }

  setTrackLabel(label: string): void {
    const el = this.root.querySelector<HTMLElement>('[data-hud-track]');
    if (el) el.textContent = label;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  announce(message: string): void {
    this.live.textContent = message;
  }

  pulseCalibration(): void {
    const dot = this.root.querySelector<HTMLElement>('[data-calib-dot]');
    if (!dot) return;
    dot.classList.remove('pulse');
    void dot.offsetWidth;
    dot.classList.add('pulse');
  }

  setCalibrationStatus(text: string): void {
    const el = this.root.querySelector<HTMLElement>('[data-calib-status]');
    if (el) el.textContent = text;
  }

  get selectedDifficulty(): Difficulty {
    return this.difficulty;
  }

  set selectedDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.renderSelect();
  }

  get trackName(): string {
    return TRACK_BY_ID[this.profile.lastTrack as TrackId]?.name ?? '';
  }
}
