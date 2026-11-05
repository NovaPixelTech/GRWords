/**
 * Headless diagnostic pass: layout geometry, canvas pixel health, note
 * rendering probes, and simulated runs driven through the game's own API.
 *
 * Usage: node scripts/inspect.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--mute-audio'],
});

const issues = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') issues.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));

const canvasStats = () =>
  page.evaluate(() => {
    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    const read = (x, y, w, h) => {
      const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h)).data;
      let sum = 0;
      let sum2 = 0;
      let n = 0;
      let max = 0;
      for (let i = 0; i < d.length; i += 16) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l;
        sum2 += l * l;
        n++;
        max = Math.max(max, l);
      }
      const mean = sum / n;
      return { mean: +mean.toFixed(2), sd: +Math.sqrt(sum2 / n - mean * mean).toFixed(2), max: +max.toFixed(1) };
    };
    return {
      size: [W, H],
      whole: read(0, 0, W, H),
      stone: read(W * 0.5 - W * 0.18, H * 0.1, W * 0.36, H * 0.12),
    };
  });

const layout = () =>
  page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const out = {
      vw,
      vh,
      screens: [...document.querySelectorAll('.screen.active')].map((s) => s.dataset.screen),
      overflow: [],
      clipped: [],
      hud: null,
      stoneTop: null,
    };
    const check = (sel) => {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('[aria-hidden="true"]') && el.closest('.hud') === null && el.closest('.hud')) continue;
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === 'none') continue;
        const hiddenByParent = el.closest('.track-card') && el.classList.contains('track-glow');
        if (hiddenByParent) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) {
          out.overflow.push(`${sel} → ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflow !== 'hidden') {
          out.clipped.push(`${sel} scrollW ${el.scrollWidth} > clientW ${el.clientWidth}`);
        }
      }
    };
    for (const sel of ['.brand-name', '.btn', '.track-card', '.hud-top', '.results-stats', '.codex-card', '.diff-pill']) {
      check(sel);
    }
    const hud = document.querySelector('.hud-top')?.getBoundingClientRect();
    if (hud && hud.height > 0) out.hud = { top: +hud.top.toFixed(1), bottom: +hud.bottom.toFixed(1) };
    const stage = window.ETYMOS?.stage;
    if (stage) out.stoneTop = +(stage.stoneY ?? 0).toFixed(1);
    return out;
  });

/** Probe canvas pixels where the next note should be drawn. */
const noteProbe = () =>
  page.evaluate(() => {
    const ET = window.ETYMOS;
    const run = ET.run;
    if (!run) return null;
    const stage = ET.stage;
    const g = run.game;
    const now = ET.now();
    const target = g.notes.find((n) => !n.judged && n.time - now > 0.25 && n.time - now < 1.4);
    if (!target) return { skipped: true };
    const dt = target.time - ET.now();
    const x = stage.laneX(target.note.lane);
    const span = stage.bridgeY - stage.spawnY;
    const y = stage.bridgeY - (dt / 1.5) * span;
    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const dpr = stage.dpr;
    const box = (cx, cy, r = 10) => {
      const d = ctx.getImageData(Math.round((cx - r) * dpr), Math.round((cy - r) * dpr), r * 2 * dpr, r * 2 * dpr).data;
      let sum = 0;
      let n = 0;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += l;
        n++;
        max = Math.max(max, l);
      }
      return { mean: +(sum / n).toFixed(1), max: +max.toFixed(1) };
    };
    return {
      lane: target.note.lane,
      letter: target.note.letter,
      x: Math.round(x),
      y: Math.round(y),
      note: box(x, y),
      control: box(16, y),
      bridge: box(x, stage.bridgeY, 6),
    };
  });

function report(label, value) {
  console.log(`\n## ${label}\n${JSON.stringify(value, null, 2)}`);
}

/** Press every note at its scheduled time, then let the chart end. */
const fastForward = () =>
  page.evaluate(async () => {
    const ET = window.ETYMOS;
    const run = ET.run;
    if (!run) return { error: 'no run' };
    const g = run.game;
    // Nudge the phase out of countdown without retiring anything.
    if (g.phase === 'countdown') g.update(ET.now());
    for (const n of g.notes) {
      if (!n.judged) g.press(n.note.lane, n.time);
    }
    g.update(g.notes[g.notes.length - 1].time + 2);
    return {
      phase: g.phase,
      score: g.score.score,
      misses: g.score.counts.miss,
      words: g.words.filter((w) => w.resolved).length,
      totalWords: g.words.length,
    };
  });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

report('title.layout', await layout());
report('title.canvas', await canvasStats());

const titleCanvas = await canvasStats();
if (titleCanvas.whole.sd < 3) issues.push(`title canvas looks blank (sd ${titleCanvas.whole.sd})`);

await page.getByRole('button', { name: /Enter the Lyre/i }).click();
await page.waitForTimeout(500);
report('select.layout', await layout());

const mobileSelect = await page.evaluate(() => {
  const pills = [...document.querySelectorAll('.diff-pill')].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), w: Math.round(r.width) };
  });
  const rows = new Set(pills.map((p) => p.top));
  return { pills, rows: rows.size };
});
report('select.diffPills', mobileSelect);
if (mobileSelect.rows > 1) issues.push('difficulty pills wrap onto multiple rows');

// ── Simulated perfect run, real time ────────────────────────────────
await page.evaluate(() => window.ETYMOS.start('thalassa', 'mortal'));

// Sample the audio bus during the lead-in, before the first note arrives.
await page.waitForTimeout(2400);
const audioCheck = await page.evaluate(async () => {
  const ET = window.ETYMOS;
  const levels = [];
  for (let i = 0; i < 22; i++) {
    levels.push(ET.audio.level());
    await new Promise((r) => setTimeout(r, 40));
  }
  return {
    state: ET.audio.state,
    ctxTime: ET.audio.ctx ? +ET.audio.ctx.currentTime.toFixed(2) : null,
    peak: +Math.max(...levels).toFixed(5),
    mean: +(levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(5),
  };
});
report('audio', audioCheck);
if (audioCheck.state === 'running' && audioCheck.peak < 0.0005) {
  issues.push('audio context is running but the master bus is silent');
}

// Frame pacing while the stage is animating at full load.
const fps = await page.evaluate(async () => {
  const times = [];
  await new Promise((resolve) => {
    const start = performance.now();
    const tick = (t) => {
      times.push(t);
      if (t - start < 1200) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const deltas = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)] ?? 16.7;
  const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? 16.7;
  return {
    frames: times.length,
    fps: +(1000 / median).toFixed(1),
    medianFrameMs: +median.toFixed(2),
    p95FrameMs: +p95.toFixed(2),
  };
});
report('fps', fps);
if (fps.fps < 55) issues.push(`frame rate below target (${fps.fps} fps, p95 ${fps.p95FrameMs} ms)`);

const desktopGame = await page.evaluate(() => {
  const stage = window.ETYMOS.stage;
  const hud = document.querySelector('.hud-top').getBoundingClientRect();
  return {
    stoneY: Math.round(stage.stoneY),
    hudBottom: Math.round(hud.bottom),
    bridgeY: Math.round(stage.bridgeY),
    gapPx: Math.round(stage.bridgeY - stage.spawnY),
  };
});
report('desktop.gameplay', desktopGame);
if (desktopGame.hudBottom > desktopGame.stoneY + 2) {
  issues.push(`desktop HUD overlaps stone (hud ${desktopGame.hudBottom} > stone ${desktopGame.stoneY})`);
}

// Wait until the first notes are on screen, then probe their pixels.
await page.waitForTimeout(1000);
const probe = await noteProbe();
report('note.probe', probe);
if (probe && probe.note && probe.control && probe.note.max - probe.control.max < 20) {
  issues.push(`note is not clearly brighter than background (${probe.note.max} vs ${probe.control.max})`);
}
if (probe && probe.bridge && probe.bridge.max < 60) issues.push('bridge line not visible');

const summary = await page.evaluate(async () => {
  const ET = window.ETYMOS;
  const run = ET.run;
  if (!run) return { error: 'no run' };
  const g = run.game;
  const notes = g.notes.map((n) => ({ lane: n.note.lane, time: n.time }));
  await new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      const now = ET.now();
      while (i < notes.length && notes[i].time <= now + 0.002) {
        g.press(notes[i].lane, notes[i].time);
        i++;
      }
      if (i >= notes.length || g.phase === 'ended') return resolve();
      setTimeout(tick, 4);
    };
    tick();
  });
  await new Promise((r) => setTimeout(r, 1000));
  return {
    phase: g.phase,
    score: g.score.score,
    accuracy: +g.accuracy.toFixed(4),
    counts: g.score.counts,
    maxCombo: g.score.maxCombo,
    health: +g.health.toFixed(1),
    resolvedWords: g.words.filter((w) => w.resolved).length,
    totalWords: g.words.length,
  };
});
report('run.result', summary);

await page.waitForTimeout(1500);
const results = await page.evaluate(() => ({
  screen: document.querySelector('.screen.active')?.dataset.screen,
  rank: document.querySelector('.rank-letter')?.textContent,
  stats: [...document.querySelectorAll('.results-stats b')].map((b) => b.textContent),
  earned: document.querySelectorAll('.earned-word').length,
  hasReplay: Boolean([...document.querySelectorAll('button')].find((b) => /play again/i.test(b.textContent))),
}));
report('results', results);

if (summary.phase !== 'ended') issues.push(`run did not end (phase ${summary.phase})`);
if ((summary.counts?.miss ?? 0) > 1) issues.push(`simulated run had ${summary.counts.miss} misses`);
if (results.screen !== 'results') issues.push(`results screen not shown (${results.screen})`);
if (results.rank !== 'S') issues.push(`perfect run did not earn S (got ${results.rank})`);
if (summary.resolvedWords !== summary.totalWords) {
  issues.push(`only ${summary.resolvedWords}/${summary.totalWords} words resolved`);
}
if (!results.hasReplay) issues.push('no play-again button on results');

// ── Replay from results ─────────────────────────────────────────────
await page.getByRole('button', { name: /play again/i }).click();
await page.waitForTimeout(1200);
const replay = await page.evaluate(() => ({
  playing: Boolean(window.ETYMOS.run) && document.querySelector('.screen.active') === null,
  phase: window.ETYMOS.run?.game.phase ?? null,
  score: window.ETYMOS.run?.game.score.score ?? null,
}));
report('replay', replay);
if (!replay.playing) issues.push('play-again did not start a new run');

// ── Endless chaining ────────────────────────────────────────────────
await page.evaluate(() => {
  const ET = window.ETYMOS;
  ET.run?.game.quit();
});
await page.waitForTimeout(1400);
await page.evaluate(() => window.ETYMOS.ui.actions.onEndless('mortal'));
await page.waitForTimeout(1500);

const endlessRound0 = await page.evaluate(() => {
  const r = window.ETYMOS.run;
  return r ? { round: r.round, notes: r.chart.notes.length } : null;
});
const round1 = await page.evaluate(async () => {
  const ET = window.ETYMOS;
  const run = ET.run;
  if (!run) return { error: 'no run' };
  const g = run.game;
  if (g.phase === 'countdown') g.update(ET.now());
  for (const n of g.notes) if (!n.judged) g.press(n.note.lane, n.time);
  g.update(g.notes[g.notes.length - 1].time + 2);
  const carried = g.score.score;
  await new Promise((r) => setTimeout(r, 1800));
  const next = ET.run;
  return {
    carriedScore: carried,
    advanced: Boolean(next) && next.round === 1,
    round: next?.round ?? null,
    score: next?.game.score.score ?? null,
    health: next?.game.health ?? null,
  };
});
report('endless', { round0: endlessRound0, round1 });
if (!round1.advanced) issues.push('endless did not advance to round 2');
if (round1.score !== round1.carriedScore) issues.push('endless did not carry the score');

// ── Mobile ──────────────────────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
report('mobile.title.layout', await layout());

await page.getByRole('button', { name: /Enter the Lyre/i }).click();
await page.waitForTimeout(500);
report('mobile.select.layout', await layout());

await page.evaluate(() => window.ETYMOS.start('odysseia', 'mortal'));
await page.waitForTimeout(2600);
const mobileGame = await page.evaluate(() => {
  const stage = window.ETYMOS.stage;
  const hud = document.querySelector('.hud-top').getBoundingClientRect();
  return {
    stoneY: Math.round(stage.stoneY),
    stoneBottom: Math.round(stage.stoneY + stage.stoneH),
    hudBottom: Math.round(hud.bottom),
    bridgeY: Math.round(stage.bridgeY),
    laneGap: Math.round(stage.laneGap),
    gapPx: Math.round(stage.bridgeY - stage.spawnY),
  };
});
report('mobile.gameplay', mobileGame);
if (mobileGame.hudBottom > mobileGame.stoneY + 4) {
  issues.push(`mobile HUD overlaps stone (hud ${mobileGame.hudBottom} > stone ${mobileGame.stoneY})`);
}
if (mobileGame.gapPx < 240) issues.push(`mobile playfield too short (${mobileGame.gapPx}px)`);
if (mobileGame.laneGap * 3 > 390 - 60) issues.push('mobile lanes too wide');

await page.setViewportSize({ width: 820, height: 1180 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
report('tablet.title.layout', await layout());

await browser.close();

console.log('\n=== ISSUES ===');
if (issues.length === 0) console.log('none');
else for (const i of issues) console.log('• ' + i);
process.exitCode = issues.length ? 1 : 0;
