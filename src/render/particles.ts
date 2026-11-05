import { clamp01 } from '../util/math';
import { rgba } from './theme';

export type ParticleShape = 'spark' | 'ember' | 'shard' | 'mote';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: ParticleShape;
  spin: number;
  angle: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface BurstOptions {
  count?: number;
  speed?: number;
  spread?: number;
  angle?: number;
  color?: string;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  shape?: ParticleShape;
}

const MAX_PARTICLES = 900;

export class Effects {
  private particles: Particle[] = [];
  private waves: Shockwave[] = [];
  private motes: Particle[] = [];
  quality = 1;

  constructor() {
    this.motes = [];
  }

  clear(): void {
    this.particles.length = 0;
    this.waves.length = 0;
  }

  burst(x: number, y: number, opts: BurstOptions = {}): void {
    const count = Math.round((opts.count ?? 18) * this.quality);
    const speed = opts.speed ?? 320;
    const spread = opts.spread ?? Math.PI * 2;
    const angle = opts.angle ?? 0;
    const color = opts.color ?? '#ffe7a6';
    const life = opts.life ?? 0.75;
    const size = opts.size ?? 3;
    const gravity = opts.gravity ?? 620;
    const drag = opts.drag ?? 1.6;
    const shape = opts.shape ?? 'spark';

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * (0.7 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.55 + Math.random() * 0.9),
        color,
        gravity,
        drag,
        shape,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  wave(x: number, y: number, color: string, maxRadius = 260, life = 0.6, width = 3): void {
    this.waves.push({
      x,
      y,
      radius: 6,
      maxRadius,
      life,
      maxLife: life,
      color,
      width,
    });
  }

  trail(x: number, y: number, color: string, count = 3): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) return;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 40,
        vy: 30 + Math.random() * 60,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.6,
        size: 1.6 + Math.random() * 2,
        color,
        gravity: -20,
        drag: 2,
        shape: 'ember',
        spin: 0,
        angle: 0,
      });
    }
  }

  update(dt: number): void {
    const step = Math.min(dt, 0.05);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= step;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const damping = Math.exp(-p.drag * step);
      p.vx *= damping;
      p.vy = p.vy * damping + p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.angle += p.spin * step;
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= step;
      if (w.life <= 0) {
        this.waves.splice(i, 1);
        continue;
      }
      const t = 1 - w.life / w.maxLife;
      w.radius = 6 + (w.maxRadius - 6) * (1 - Math.pow(1 - t, 2));
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = clamp01(p.life / p.maxLife);
      const alpha = t * t;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size * 0.5, -p.size * 2.4, p.size, p.size * 4.8);
        ctx.restore();
      } else if (p.shape === 'ember') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.7), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'mote') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const w of this.waves) {
      const t = clamp01(w.life / w.maxLife);
      ctx.globalAlpha = t * 0.85;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width * (0.4 + t * 1.2);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Ambient floating dust, drawn behind everything else. */
  drawMotes(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, color: string): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const count = Math.round(46 * this.quality);
    for (let i = 0; i < count; i++) {
      const seed = i * 127.31;
      const baseX = ((Math.sin(seed) * 0.5 + 0.5) * w + Math.sin(time * 0.07 + seed) * 40 + w) % w;
      const y = ((seed * 7.7 + time * (6 + (i % 5) * 2.4)) % (h * 1.1)) - h * 0.05;
      const r = 0.7 + (i % 4) * 0.55;
      ctx.globalAlpha = 0.06 + 0.12 * (0.5 + 0.5 * Math.sin(time * 0.8 + seed));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(baseX, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  get count(): number {
    return this.particles.length;
  }
}
