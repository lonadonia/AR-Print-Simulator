#!/usr/bin/env node
/**
 * Captures review screenshots of the demo build into docs/screenshots/.
 * Start the demo first:  npm run build:demo && npx vite preview --port 4173
 * Then:                  node scripts/capture-screenshots.mjs
 * Headless Chromium renders WebGL with SwiftShader (software), so colours can differ slightly
 * from a GPU-rendered browser.
 */
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screenshots');
const URL = process.env.VISUALIZER_URL ?? 'http://localhost:4173/';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
await mkdir(OUT, { recursive: true });

async function open(viewport, dpr = 1, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.locator('.rv-arealist__item').first().waitFor();
  await page.waitForTimeout(1200);
  return page;
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

for (const [w, h, dpr, touch] of [
  [1440, 900, 1, false],
  [1024, 768, 1, false],
  [768, 1024, 1, true],
  [390, 844, 2, true],
  [360, 740, 2, true],
]) {
  const page = await open({ width: w, height: h }, dpr, touch);
  await shot(page, `viewport-${w}`);
  await page.context().close();
  console.log('viewport', w);
}

// Feature states at desktop size.
const page = await open({ width: 1440, height: 900 });
await page.getByRole('tab', { name: 'Perspective' }).click();
await page.getByRole('tab', { name: 'Artwork' }).click();
await page.getByRole('option', { name: 'Linear grid' }).click();
await page.getByRole('tab', { name: 'Perspective' }).click();
await page.waitForTimeout(800);
await shot(page, 'feature-perspective-grid');

await page.getByRole('tab', { name: 'Cutouts' }).click();
await page.waitForTimeout(300);
await shot(page, 'feature-cutouts');

await page.getByRole('button', { name: 'Select area 2: Upper cabinet doors' }).click();
await page.getByRole('tab', { name: 'Artwork' }).click();
await page.getByRole('option', { name: 'Copper fans' }).click();
await page.getByRole('tab', { name: 'Material' }).click();
await page.getByRole('radio', { name: /Brushed brass/ }).check();
await page.waitForTimeout(800);
await shot(page, 'feature-two-areas-materials');

await page.getByRole('button', { name: 'Warm evening' }).click();
await page.waitForTimeout(500);
await shot(page, 'feature-lighting-warm');

await page.locator('.rv-roombtn').click();
await page.waitForTimeout(400);
await shot(page, 'feature-room-picker');
await page.getByRole('dialog').getByRole('button', { name: /Reception with feature wall/ }).click();
await page.waitForTimeout(1500);
await shot(page, 'room-office');
await page.locator('.rv-roombtn').click();
await page.getByRole('dialog').getByRole('button', { name: /Bathroom with shower/ }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Select area 2: Vanity wall' }).click();
await page.getByRole('tab', { name: 'Artwork' }).click();
await page.getByRole('option', { name: 'Botanical leaves' }).click();
await page.waitForTimeout(1200);
await shot(page, 'room-bathroom');

await browser.close();
console.log('saved to', OUT);
