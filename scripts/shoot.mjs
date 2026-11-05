/**
 * Headless visual smoke test.
 *
 * Usage: node scripts/shoot.mjs [baseUrl]
 * Captures the title, song select, codex, settings, calibration, gameplay,
 * results and mobile screens to shots/ and prints console errors.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = resolve('shots');
mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--disable-gpu-vsync',
    '--hide-scrollbars',
  ],
});

const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

async function shot(name, ms = 900) {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1. Title
await shot('01-title');

// 2. Song select
await page.getByRole('button', { name: /Enter the Lyre/i }).click();
await shot('02-select');

// 3. Hero difficulty
await page.getByRole('button', { name: /Hero/i }).first().click();
await shot('03-select-hero', 350);

// 4. Codex via title
await page.getByRole('button', { name: '←' }).first().click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Codex' }).click();
await shot('04-codex');

// 5. Settings
await page.getByRole('button', { name: '←' }).first().click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Settings' }).click();
await shot('05-settings');

// 6. Calibration tap test
await page.getByRole('button', { name: /Timing calibration/i }).click();
await shot('06-calibration', 1000);

// 7–8. Gameplay — straight into a run
await page.goto(`${BASE}/?autostart=1&track=thalassa&difficulty=mortal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2400);
await shot('07-gameplay-early', 200);
await page.waitForTimeout(4200);
await shot('08-gameplay-mid', 200);

// 9. Results — finish a run cleanly through the game's own API
await page.goto(`${BASE}/?autostart=1&track=sophia&difficulty=mortal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const ET = window.ETYMOS;
  const g = ET.run.game;
  if (g.phase === 'countdown') g.update(ET.now());
  for (const n of g.notes) if (!n.judged) g.press(n.note.lane, n.time);
  g.update(g.notes[g.notes.length - 1].time + 2);
});
await shot('09-results', 1900);

// 10–11. Mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/?autostart=1&track=odysseia&difficulty=mortal`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await shot('10-mobile-gameplay', 300);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('11-mobile-title', 200);

// 12. Short landscape phone — title must scroll, not clip
await page.setViewportSize({ width: 844, height: 390 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await shot('12-short-title', 200);

await browser.close();

if (errors.length) {
  console.log('\n--- ISSUES ---');
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
