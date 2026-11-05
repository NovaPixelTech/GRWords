import type { Track } from '../content/tracks';
import type { RuntimeNote, RuntimeWord } from '../game/game';
import type { JudgementKind } from '../game/judge';
import { JUDGEMENT_COLOR } from '../game/judge';
import { WORD_BY_ID } from '../content/words';
import { TAU, clamp, clamp01, hash01, lerp } from '../util/math';
import { Effects } from './particles';
import { laneTints, mix, rgba } from './theme';

export type Quality = 'high' | 'balanced' | 'low';

export interface FrameView {
  time: number;
  beat: number;
  track: Track | null;
  notes: RuntimeNote[];
  activeWord: RuntimeWord | null;
  combo: number;
  health: number;
  phase: string;
  leadInBeats: number;
  totalBeats: number;
}

interface StringState {
  amp: number;
  phase: number;
  freq: number;
}

const APPROACH = 1.5;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bloomCanvas: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private grain: HTMLCanvasElement;

  effects = new Effects();
  quality: Quality = 'high';
  reducedMotion = false;

  W = 1;
  H = 1;
  dpr = 1;

  private laneGap = 70;
  private bridgeY = 600;
  private spawnY = 260;
  private stoneX = 0;
  private stoneY = 0;
  private stoneW = 600;
  private stoneH = 160;
  private stringTop = 200;

  private strings: StringState[] = [
    { amp: 0, phase: 0, freq: 62 },
    { amp: 0, phase: 0, freq: 74 },
    { amp: 0, phase: 0, freq: 88 },
    { amp: 0, phase: 0, freq: 98 },
  ];

  private tints: string[] = ['#8ff0ff', '#a9f4ff', '#ffd9a0', '#ffe7c2'];
  private shake = 0;
  private flash = 0;
  private flashColor = '#ffe7a6';
  private judgeKind: JudgementKind | null = null;
  private judgeAt = -10;
  private wordFlare = 0;
  private clock = 0;
  private track: Track | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;

    this.bloomCanvas = document.createElement('canvas');
    this.bctx = this.bloomCanvas.getContext('2d') as CanvasRenderingContext2D;

    this.grain = document.createElement('canvas');
    this.grain.width = 160;
    this.grain.height = 160;
    const gctx = this.grain.getContext('2d');
    if (gctx) {
      const img = gctx.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 110 + Math.random() * 100;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 26;
      }
      gctx.putImageData(img, 0, 0);
    }

    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.effects.quality = q === 'low' ? 0.45 : q === 'balanced' ? 0.8 : 1;
    this.resize();
  }

  setTrack(track: Track | null): void {
    if (this.track?.id === track?.id) return;
    this.track = track;
    if (track) this.tints = laneTints(track.palette.accent, track.palette.gold);
    this.effects.clear();
  }

  resize(): void {
    const dprLimit = this.quality === 'low' ? 1 : this.quality === 'balanced' ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.dpr = dpr;
    this.W = w;
    this.H = h;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const bloomScale = this.quality === 'high' ? 0.22 : 0.18;
    this.bloomCanvas.width = Math.max(2, Math.floor(w * bloomScale));
    this.bloomCanvas.height = Math.max(2, Math.floor(h * bloomScale));

    this.layout();
  }

  private layout(): void {
    const { W, H } = this;
    const portrait = H > W;

    this.stoneW = Math.min(W * 0.9, 680);
    this.stoneH = clamp(H * 0.2, 122, 196);
    this.stoneX = (W - this.stoneW) / 2;
    // On portrait screens the HUD owns the top strip, so the stone starts below it.
    const hudReserve = portrait ? 78 : H > 560 ? 34 : 0;
    this.stoneY = clamp(H * 0.028, 12, 28) + hudReserve;

    this.spawnY = this.stoneY + this.stoneH + clamp(H * 0.035, 18, 42);
    this.bridgeY = H - clamp(H * 0.135, 92, 158);
    this.stringTop = this.spawnY - 12;

    this.laneGap = clamp(W * (portrait ? 0.165 : 0.135), 46, 92);
  }

  laneX(lane: number): number {
    return this.W / 2 + (lane - 1.5) * this.laneGap;
  }

  /** Which string a screen-space x coordinate belongs to. */
  laneAt(x: number): number {
    const rel = (x - this.W / 2) / this.laneGap + 1.5;
    return Math.max(0, Math.min(3, Math.round(rel)));
  }

  /* ─────────────────────────── feedback ─────────────────────────── */

  hit(lane: number, kind: JudgementKind): void {
    const x = this.laneX(lane);
    const y = this.bridgeY;
    const color = this.tints[lane] ?? '#ffe7a6';
    const strong = kind === 'perfect';

    const st = this.strings[lane];
    st.amp = strong ? 17 : kind === 'great' ? 12 : 7;
    st.phase = 0;

    this.effects.burst(x, y, {
      count: strong ? 22 : 14,
      speed: strong ? 420 : 300,
      spread: Math.PI * 1.5,
      angle: -Math.PI / 2,
      color,
      gravity: 720,
      size: strong ? 3.4 : 2.6,
      life: 0.7,
      shape: 'spark',
    });
    if (strong) {
      this.effects.burst(x, y, {
        count: 6,
        speed: 210,
        spread: Math.PI * 2,
        color: '#ffffff',
        gravity: 120,
        size: 2,
        life: 0.45,
        shape: 'shard',
      });
      this.effects.wave(x, y, rgba(color, 0.7), 96, 0.42, 2.4);
    }
    this.judgeKind = kind;
    this.judgeAt = this.clock;
    this.shake = Math.min(9, this.shake + (strong ? 2.4 : 1.1));
  }

  miss(lane: number): void {
    const x = this.laneX(lane);
    const y = this.bridgeY;
    const st = this.strings[lane];
    st.amp = 9;
    st.phase = 0;

    this.effects.burst(x, y, {
      count: 10,
      speed: 150,
      spread: Math.PI * 1.2,
      angle: -Math.PI / 2,
      color: '#ff6b6b',
      gravity: 900,
      size: 2.2,
      life: 0.5,
      shape: 'spark',
    });
    this.judgeKind = 'miss';
    this.judgeAt = this.clock;
    this.shake = Math.min(11, this.shake + 2.6);
    this.flash = Math.max(this.flash, 0.22);
    this.flashColor = '#ff5252';
  }

  wordComplete(): void {
    const cx = this.W / 2;
    const cy = this.stoneY + this.stoneH / 2;
    const gold = this.track?.palette.gold ?? '#e8c37a';
    this.effects.burst(cx, cy, {
      count: 46,
      speed: 560,
      spread: Math.PI * 2,
      color: gold,
      gravity: 380,
      size: 3.6,
      life: 1.1,
      shape: 'shard',
    });
    this.effects.burst(cx, cy, {
      count: 26,
      speed: 320,
      spread: Math.PI * 2,
      color: '#fff7e0',
      gravity: -60,
      size: 2.4,
      life: 1.3,
      shape: 'ember',
    });
    this.effects.wave(cx, cy, rgba(gold, 0.85), this.W * 0.7, 0.9, 3.5);
    this.effects.wave(this.W / 2, this.bridgeY, rgba(gold, 0.5), this.W * 0.55, 0.8, 2.5);
    this.wordFlare = 1;
    this.flash = Math.max(this.flash, 0.4);
    this.flashColor = gold;
    this.shake = Math.min(16, this.shake + 6);
  }

  private updateStringStates(dt: number): void {
    for (const s of this.strings) {
      if (s.amp > 0.01) {
        s.phase += dt;
        s.amp *= Math.exp(-dt * 5.5);
      }
    }
  }

  /* ─────────────────────────── render ─────────────────────────── */

  update(dt: number): void {
    this.effects.quality = this.reducedMotion
      ? 0.32
      : this.quality === 'low'
        ? 0.45
        : this.quality === 'balanced'
          ? 0.8
          : 1;
    this.updateStringStates(dt);
    this.effects.update(dt);
    this.shake *= Math.exp(-dt * 9);
    this.flash *= Math.exp(-dt * 6);
    this.wordFlare *= Math.exp(-dt * 3.2);
  }

  render(view: FrameView): void {
    const { ctx, W, H, dpr } = this;
    this.setTrack(view.track);
    this.clock = view.time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeX = this.reducedMotion ? 0 : (Math.random() - 0.5) * this.shake;
    const shakeY = this.reducedMotion ? 0 : (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawBackground(view);
    this.effects.drawMotes(ctx, W, H, view.time, this.track?.palette.moon ?? '#e9fbff');

    if (view.track) {
      this.drawLyre(view);
      this.drawNotes(view);
      this.drawBridge(view);
      this.drawInscription(view);
    }

    this.effects.draw(ctx);
    this.drawJudgement(view);
    ctx.restore();

    this.compositeBloom();
    this.drawVignette(view);
    this.drawFlash();
  }

  private drawBackground(view: FrameView): void {
    const { ctx, W, H } = this;
    const p = this.track?.palette;
    const bg0 = p?.bg0 ?? '#04060d';
    const bg1 = p?.bg1 ?? '#0a1424';
    const bg2 = p?.bg2 ?? '#123044';
    const horizon = p?.horizon ?? '#1b6b74';
    const moon = p?.moon ?? '#e9fbff';

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg0);
    grad.addColorStop(0.42, bg1);
    grad.addColorStop(0.78, bg2);
    grad.addColorStop(1, bg0);
    ctx.fillStyle = grad;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // Horizon glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(W / 2, H * 0.86, 10, W / 2, H * 0.86, Math.max(W, H) * 0.62);
    hg.addColorStop(0, rgba(horizon, 0.34));
    hg.addColorStop(0.45, rgba(horizon, 0.09));
    hg.addColorStop(1, rgba(horizon, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Moon
    const moonX = W * 0.5;
    const moonY = H * 0.16;
    const moonR = Math.min(W, H) * 0.085;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 3.2);
    mg.addColorStop(0, rgba(moon, 0.16));
    mg.addColorStop(0.4, rgba(moon, 0.05));
    mg.addColorStop(1, rgba(moon, 0));
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.2, 0, TAU);
    ctx.fill();
    const disc = ctx.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, moonR * 0.1, moonX, moonY, moonR);
    disc.addColorStop(0, rgba(moon, 0.5));
    disc.addColorStop(0.75, rgba(moon, 0.22));
    disc.addColorStop(1, rgba(moon, 0.05));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Stars
    ctx.save();
    for (let i = 0; i < 110; i++) {
      const sx = hash01(i * 3.17) * W;
      const sy = hash01(i * 7.91) * H * 0.72;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(view.time * (0.7 + (i % 5) * 0.3) + i));
      ctx.globalAlpha = 0.12 + tw * 0.3;
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6 + (i % 3) * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Sea
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const seaTop = H * 0.79;
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      const y = seaTop + t * (H - seaTop);
      const wob = Math.sin(view.time * 0.8 + i * 0.9) * 7 * (0.3 + t);
      ctx.globalAlpha = 0.05 + t * 0.06;
      ctx.strokeStyle = horizon;
      ctx.lineWidth = 1 + t * 1.6;
      ctx.beginPath();
      ctx.moveTo(W * 0.08 + wob, y);
      ctx.lineTo(W * 0.92 + wob, y);
      ctx.stroke();
    }
    ctx.restore();

    // Temple columns, far left and right
    this.drawColumns(W, H, rgba(p?.bg0 ?? '#04060d', 0.85), rgba(horizon, 0.16));
  }

  private drawColumns(W: number, H: number, dark: string, rim: string): void {
    const ctx = this.ctx;
    const top = H * 0.28;
    const bottom = H * 0.9;
    const colW = Math.min(W * 0.09, 96);

    const drawOne = (x: number, flip: number) => {
      ctx.save();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + colW * flip, top);
      ctx.lineTo(x + colW * 0.86 * flip, bottom);
      ctx.lineTo(x + colW * 0.14 * flip, bottom);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + colW * flip, top);
      ctx.lineTo(x + colW * 0.86 * flip, bottom);
      ctx.stroke();

      // flute lines
      ctx.globalAlpha = 0.5;
      for (let i = 1; i < 5; i++) {
        const f = i / 5;
        ctx.beginPath();
        ctx.moveTo(x + colW * flip * f, top + 12);
        ctx.lineTo(x + colW * flip * (0.86 * f + 0.07), bottom - 8);
        ctx.stroke();
      }
      ctx.restore();
    };

    drawOne(-colW * 0.25, 1);
    drawOne(W + colW * 0.25, -1);
  }

  private drawLyre(view: FrameView): void {
    const { ctx, W } = this;
    const p = this.track!.palette;
    const cx = W / 2;
    const top = this.stoneY + this.stoneH + 6;
    const armSpread = this.laneGap * 2.15;
    const beatPulse = Math.exp(-((view.beat - Math.floor(view.beat)) % 1) * 6);
    const glow = 0.5 + beatPulse * 0.5;

    const shaft = ctx.createRadialGradient(cx, this.bridgeY - 80, 20, cx, this.bridgeY - 80, this.bridgeY * 0.9);
    shaft.addColorStop(0, rgba(p.accent, 0.1));
    shaft.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = shaft;
    ctx.fillRect(cx - armSpread, top, armSpread * 2, this.bridgeY - top);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Arms
    for (const side of [-1, 1]) {
      const x0 = cx + side * armSpread * 1.28;
      const x1 = cx + side * armSpread * 0.72;
      const grad = ctx.createLinearGradient(x0, top, x1, this.bridgeY);
      grad.addColorStop(0, rgba(p.gold, 0.18));
      grad.addColorStop(0.5, rgba(p.gold, 0.62 * glow));
      grad.addColorStop(1, rgba(p.gold, 0.3));

      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, top + 26);
      ctx.bezierCurveTo(x0 - side * 10, top + (this.bridgeY - top) * 0.42, x1 + side * 44, this.bridgeY - 40, x1, this.bridgeY);
      ctx.stroke();

      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x0 - side * 6, top + 30);
      ctx.bezierCurveTo(x0 - side * 16, top + (this.bridgeY - top) * 0.42, x1 + side * 34, this.bridgeY - 44, x1, this.bridgeY - 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Crossbar
    const barY = top + 16;
    const barGrad = ctx.createLinearGradient(cx - armSpread * 1.3, barY, cx + armSpread * 1.3, barY);
    barGrad.addColorStop(0, rgba(p.gold, 0));
    barGrad.addColorStop(0.5, rgba(p.gold, 0.5 * glow));
    barGrad.addColorStop(1, rgba(p.gold, 0));
    ctx.strokeStyle = barGrad;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - armSpread * 1.3, barY);
    ctx.lineTo(cx + armSpread * 1.3, barY);
    ctx.stroke();

    // Strings
    for (let i = 0; i < 4; i++) {
      const x = this.laneX(i);
      const st = this.strings[i];
      const wob = Math.sin(st.phase * st.freq) * st.amp;
      const grad = ctx.createLinearGradient(0, this.stringTop, 0, this.bridgeY);
      grad.addColorStop(0, rgba(p.gold, 0.05));
      grad.addColorStop(0.35, rgba(p.gold, 0.34));
      grad.addColorStop(1, rgba(this.tints[i], 0.6));

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, this.stringTop);
      ctx.quadraticCurveTo(x + wob, (this.stringTop + this.bridgeY) / 2, x, this.bridgeY);
      ctx.stroke();

      if (st.amp > 0.4) {
        ctx.globalAlpha = Math.min(0.6, st.amp / 20);
        ctx.strokeStyle = rgba(p.moon, 0.5);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, this.stringTop);
        ctx.quadraticCurveTo(x + wob * 1.2, (this.stringTop + this.bridgeY) / 2, x, this.bridgeY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  private drawNotes(view: FrameView): void {
    const { ctx } = this;
    const p = this.track!.palette;
    const bridgeY = this.bridgeY;
    const span = bridgeY - this.spawnY;

    for (const rn of view.notes) {
      if (rn.judged) continue;
      const dt = rn.time - view.time;
      if (dt > APPROACH || dt < -0.24) continue;

      const lane = rn.note.lane;
      const x = this.laneX(lane);
      const y = bridgeY - (dt / APPROACH) * span;
      const fade = clamp01((APPROACH - dt) / 0.32);
      const tint = this.tints[lane];
      const isLetter = rn.note.kind === 'letter';

      ctx.save();
      ctx.globalAlpha = fade;

      // streak
      const streakLen = isLetter ? 74 : 44;
      const sg = ctx.createLinearGradient(0, y - streakLen, 0, y);
      sg.addColorStop(0, rgba(tint, 0));
      sg.addColorStop(1, rgba(tint, isLetter ? 0.38 : 0.18));
      ctx.strokeStyle = sg;
      ctx.lineWidth = isLetter ? 3.2 : 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y - streakLen);
      ctx.lineTo(x, y);
      ctx.stroke();

      if (!isLetter) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        const r = 5.5;
        ctx.fillStyle = rgba(tint, 0.85);
        ctx.fillRect(-r / 2, -r / 2, r, r);
        ctx.restore();
        continue;
      }

      const radius = Math.max(15, this.laneGap * 0.33);

      // outer glow
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 2.4);
      gg.addColorStop(0, rgba(tint, 0.34));
      gg.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.4, 0, TAU);
      ctx.fill();

      // body
      ctx.globalCompositeOperation = 'source-over';
      const body = ctx.createRadialGradient(x, y - radius * 0.4, radius * 0.2, x, y, radius);
      body.addColorStop(0, rgba(mix(p.bg1, tint, 0.28), 0.98));
      body.addColorStop(1, rgba(p.bg0, 0.98));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();

      // rim
      ctx.strokeStyle = rgba(tint, 0.9);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = rgba(this.track!.palette.gold, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.82, 0, TAU);
      ctx.stroke();

      // letter
      const size = Math.round(radius * 1.16);
      ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff8ea';
      ctx.shadowColor = rgba(tint, 0.9);
      ctx.shadowBlur = 10;
      ctx.fillText(rn.note.letter, x, y + size * 0.04);
      ctx.shadowBlur = 0;

      ctx.restore();
    }
  }

  private drawBridge(view: FrameView): void {
    const { ctx, W } = this;
    const p = this.track!.palette;
    const y = this.bridgeY;
    const half = this.laneGap * 2.05;
    const beatPulse = Math.exp(-((view.beat - Math.floor(view.beat)) % 1) * 5);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const g = ctx.createLinearGradient(W / 2 - half, y, W / 2 + half, y);
    g.addColorStop(0, rgba(p.gold, 0));
    g.addColorStop(0.18, rgba(p.gold, 0.45 + beatPulse * 0.3));
    g.addColorStop(0.5, rgba(p.moon, 0.35 + beatPulse * 0.35));
    g.addColorStop(0.82, rgba(p.gold, 0.45 + beatPulse * 0.3));
    g.addColorStop(1, rgba(p.gold, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - half, y);
    ctx.lineTo(W / 2 + half, y);
    ctx.stroke();

    const halo = ctx.createLinearGradient(0, y - 34, 0, y + 22);
    halo.addColorStop(0, rgba(p.accent, 0));
    halo.addColorStop(0.62, rgba(p.accent, 0.12 + beatPulse * 0.1));
    halo.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(W / 2 - half, y - 34, half * 2, 56);

    for (let i = 0; i < 4; i++) {
      const x = this.laneX(i);
      const tint = this.tints[i];
      ctx.fillStyle = rgba(tint, 0.55 + beatPulse * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba(tint, 0.18 + beatPulse * 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 13 + beatPulse * 3, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawInscription(view: FrameView): void {
    const ctx = this.ctx;
    const p = this.track!.palette;
    const { stoneX: x, stoneY: y, stoneW: w, stoneH: h } = this;
    const rw: RuntimeWord | null = view.activeWord;

    const glow = clamp01(0.35 + this.wordFlare);
    ctx.save();

    // slab
    const slab = ctx.createLinearGradient(x, y, x, y + h);
    slab.addColorStop(0, rgba(mix(p.bg1, '#ffffff', 0.06), 0.92));
    slab.addColorStop(0.5, rgba(mix(p.bg0, '#ffffff', 0.03), 0.95));
    slab.addColorStop(1, rgba(p.bg0, 0.92));
    roundRectPath(ctx, x, y, w, h, 16);
    ctx.fillStyle = slab;
    ctx.fill();

    // border
    ctx.strokeStyle = rgba(p.gold, 0.35 + glow * 0.35);
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, x, y, w, h, 16);
    ctx.stroke();

    ctx.strokeStyle = rgba(p.gold, 0.16);
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 7, y + 7, w - 14, h - 14, 11);
    ctx.stroke();

    // corner marks
    ctx.strokeStyle = rgba(p.gold, 0.5);
    ctx.lineWidth = 1.4;
    const cm = 16;
    for (const [cxp, cyp, dx, dy] of [
      [x + 10, y + 10, 1, 1],
      [x + w - 10, y + 10, -1, 1],
      [x + 10, y + h - 10, 1, -1],
      [x + w - 10, y + h - 10, -1, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(cxp + dx * cm, cyp);
      ctx.lineTo(cxp, cyp);
      ctx.lineTo(cxp, cyp + dy * cm);
      ctx.stroke();
    }

    // veins
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 16);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      const vy = y + h * (0.15 + i * 0.18);
      ctx.beginPath();
      ctx.moveTo(x + 10, vy);
      ctx.bezierCurveTo(x + w * 0.3, vy + 14, x + w * 0.6, vy - 18, x + w - 10, vy + 6);
      ctx.stroke();
    }
    ctx.restore();

    if (!rw) {
      ctx.restore();
      return;
    }

    const entry = WORD_BY_ID[rw.word.wordId];
    const letters = rw.word.letters;

    const maxTextW = w - 76;
    let size = Math.min(56, maxTextW / Math.max(letters.length, 1) / 0.7);
    size = Math.max(20, size);

    ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const widths = letters.map((ch) => ctx.measureText(ch).width);
    const gap = Math.max(1, size * 0.04);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);
    let cursor = x + w / 2 - total / 2;
    const lineY = y + h * 0.46;

    for (let k = 0; k < letters.length; k++) {
      const note = rw.notes[k];
      const state = note ? (note.judged ?? 'pending') : 'pending';
      const cxx = cursor + widths[k] / 2;

      if (state === 'miss') {
        ctx.fillStyle = rgba(p.danger, 0.28);
        ctx.fillText(letters[k], cxx, lineY);
        ctx.strokeStyle = rgba(p.danger, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cxx - widths[k] * 0.6, lineY + size * 0.05);
        ctx.lineTo(cxx + widths[k] * 0.6, lineY + size * 0.05);
        ctx.stroke();
      } else if (state === 'pending') {
        ctx.fillStyle = rgba(p.gold, 0.2);
        ctx.fillText(letters[k], cxx, lineY);
      } else {
        const isPerfect = state === 'perfect';
        ctx.save();
        ctx.shadowColor = isPerfect ? rgba(p.gold, 0.95) : rgba(p.accent, 0.7);
        ctx.shadowBlur = isPerfect ? 22 + this.wordFlare * 20 : 10;
        const tg = ctx.createLinearGradient(0, lineY - size * 0.6, 0, lineY + size * 0.6);
        tg.addColorStop(0, '#fff7e2');
        tg.addColorStop(0.55, isPerfect ? p.gold : mix(p.gold, p.accent, 0.4));
        tg.addColorStop(1, p.gold);
        ctx.fillStyle = tg;
        ctx.fillText(letters[k], cxx, lineY);
        ctx.restore();
      }

      cursor += widths[k] + gap;
    }

    // transliteration + meaning
    const subSize = Math.max(11, Math.min(16, w * 0.026));
    ctx.textAlign = 'center';
    ctx.font = `600 ${subSize}px "Cinzel", Georgia, serif`;
    ctx.fillStyle = rgba(p.gold, 0.86);
    ctx.fillText(entry ? entry.translit.toUpperCase() : '', x + w / 2, y + h * 0.74);

    ctx.font = `italic ${subSize * 1.05}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = rgba(p.moon, 0.6);
    ctx.fillText(entry ? entry.meaning : '', x + w / 2, y + h * 0.87);

    // completed flare
    if (this.wordFlare > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.7);
      fg.addColorStop(0, rgba(p.gold, 0.5 * this.wordFlare));
      fg.addColorStop(1, rgba(p.gold, 0));
      ctx.fillStyle = fg;
      roundRectPath(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawJudgement(view: FrameView): void {
    if (!this.judgeKind) return;
    const age = view.time - this.judgeAt;
    if (age > 0.55) return;
    const ctx = this.ctx;
    const t = clamp01(age / 0.55);
    const alpha = 1 - t * t;
    const p = this.track!.palette;
    const color = JUDGEMENT_COLOR[this.judgeKind];

    const label =
      this.judgeKind === 'perfect'
        ? 'ΕΥ̓͂'
        : this.judgeKind === 'great'
          ? 'ΚΑΛΟΣ'
          : this.judgeKind === 'good'
            ? 'ἸΚΑΝΟΣ'
            : 'ἈΣΤΟΧΟΣ';

    const x = this.W / 2;
    const y = this.bridgeY - 90 - t * 26;
    const size = 30 + (1 - t) * 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px "Cinzel", Georgia, serif`;
    ctx.shadowColor = rgba(color, 0.9);
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(label, x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.6;
    ctx.font = `600 ${size * 0.42}px "Cinzel", Georgia, serif`;
    ctx.fillStyle = rgba(p.moon, 0.85);
    ctx.fillText(this.judgeKind.toUpperCase(), x, y + size * 0.72);
    ctx.restore();
  }

  private compositeBloom(): void {
    if (this.quality === 'low') return;
    const { ctx, W, H, bloomCanvas, bctx } = this;
    bctx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(this.canvas, 0, 0, bloomCanvas.width, bloomCanvas.height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.quality === 'high' ? 0.5 : 0.4;
    ctx.filter = this.quality === 'high' ? 'blur(9px)' : 'blur(7px)';
    ctx.drawImage(bloomCanvas, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.restore();
  }

  private drawVignette(view: FrameView): void {
    const { ctx, W, H } = this;
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.28, W / 2, H * 0.52, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (this.quality === 'high' && !this.reducedMotion) {
      ctx.globalAlpha = 0.16;
      ctx.globalCompositeOperation = 'overlay';
      const ox = Math.random() * 160;
      const oy = Math.random() * 160;
      for (let gx = -160; gx < W + 160; gx += 160) {
        for (let gy = -160; gy < H + 160; gy += 160) {
          ctx.drawImage(this.grain, gx + ox, gy + oy);
        }
      }
    }
    void view;
    ctx.restore();
  }

  private drawFlash(): void {
    if (this.flash < 0.01) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.55, this.flash * 0.6);
    const g = ctx.createRadialGradient(this.W / 2, this.H * 0.4, 10, this.W / 2, this.H * 0.4, Math.max(this.W, this.H) * 0.8);
    g.addColorStop(0, this.flashColor);
    g.addColorStop(0.5, rgba(this.flashColor, 0.25));
    g.addColorStop(1, rgba(this.flashColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }
}
