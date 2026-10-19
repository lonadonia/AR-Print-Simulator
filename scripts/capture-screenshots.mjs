#!/usr/bin/env node
/**
 * Captures review screenshots of the demo build into docs/screenshots/.
 * Start the demo first:  npm run build:demo && npx vite preview --port 4173
 * Then:                  node scripts/capture-screenshots.mjs
 * Headless Chromium renders WebGL with SwiftShader (software), so colours can differ slightly
 * from a GPU-rendered browser. The camera screenshot shows the fallback (no camera in headless runs).
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

// Professional tools.
await page.locator('.rv-roombtn').click();
await page.getByRole('dialog').getByRole('button', { name: /Reception with feature wall/ }).click();
await page.waitForTimeout(1500);
const stage = await page.getByTestId('stage').boundingBox();
const at = (x, y) => [stage.x + stage.width * x, stage.y + stage.height * y];
await page.keyboard.press('w');
await page.mouse.click(...at(0.72, 0.55));
await page.waitForTimeout(900);
await shot(page, 'tool-magic-select-glass-block');
await page.getByRole('tab', { name: 'Artwork' }).click();
await page.getByRole('button', { name: 'Pattern maker' }).click();
await page.getByRole('option', { name: 'Moroccan quatrefoil' }).click();
await page.getByRole('button', { name: 'Majorelle blue' }).click();
await page.waitForTimeout(900);
await shot(page, 'tool-pattern-maker');

await page.locator('.rv-roombtn').click();
await page.getByRole('dialog').getByRole('button', { name: /Kitchen with angled/ }).click();
await page.waitForTimeout(1500);
await page.getByRole('tab', { name: 'Material' }).click();
await page.getByRole('radio', { name: /Herringbone tile/ }).check();
await page.waitForTimeout(800);
await shot(page, 'tool-tile-layout-herringbone');
await page.getByRole('tab', { name: 'Shape' }).click();
const h = await page.locator('.rv-handle--boundary').nth(2).boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await page.mouse.down();
await page.mouse.move(h.x + h.width / 2 - 6, h.y + h.height / 2 + 4, { steps: 3 });
await shot(page, 'tool-magnifier-snapping');
await page.mouse.up();
await page.keyboard.press('Control+z');
await page.keyboard.press('b');
await page.waitForTimeout(400);
await shot(page, 'tool-before-after');
await page.keyboard.press('b');
await page.getByRole('button', { name: 'Save image of the preview' }).click();
await page.getByRole('dialog', { name: 'Save the preview' }).getByRole('img').waitFor();
await page.waitForTimeout(400);
await shot(page, 'tool-save-image');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Take a room photo with the camera' }).click();
await page.waitForTimeout(1000);
await shot(page, 'tool-camera-fallback');
await page.keyboard.press('Escape');

// Phone: magic select options.
{
  const phone = await open({ width: 390, height: 844 }, 2, true);
  await phone.getByRole('button', { name: 'Magic select: tap a surface (W)' }).tap();
  await phone.waitForTimeout(300);
  await shot(phone, 'phone-magic-select-options');
  await phone.context().close();
}

await browser.close();
console.log('saved to', OUT);
