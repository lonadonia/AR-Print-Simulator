import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  area,
  colorDistance,
  handlePositions,
  openEditor,
  photoColor,
  renderedColor,
  stageShot,
  tab,
  toScreen,
  type Pt,
} from './helpers';

const KITCHEN = 'demo/rooms/kitchen.jpg';
const geometry = JSON.parse(readFileSync('src/catalog/demoGeometry.json', 'utf8')) as Record<string, { boundary: Pt[]; exclusions: Pt[][] }[]>;
const centroid = (pts: Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
// L-shaped outline on the kitchen's side wall: a top bar plus a vertical leg on the right.
const L_SHAPE: Pt[] = [
  { x: 0.8, y: 0.12 },
  { x: 0.95, y: 0.12 },
  { x: 0.95, y: 0.62 },
  { x: 0.88, y: 0.62 },
  { x: 0.88, y: 0.33 },
  { x: 0.8, y: 0.33 },
];

async function chooseArtwork(page: import('@playwright/test').Page, title: string) {
  await tab(page, 'Artwork').click();
  await page.getByRole('option', { name: title }).click();
  await page.waitForTimeout(600);
}

async function drawLShape(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Draw area' }).click();
  for (const p of L_SHAPE) {
    const s = await toScreen(page, p);
    await page.mouse.click(s.x, s.y);
  }
  await page.locator('.rv-stagebar').getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
}

test.describe('editor (desktop, mouse)', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await openEditor(page);
    test.info().annotations.push({ type: 'console-errors', description: JSON.stringify(errors) });
  });

  test('A01/A02 sample room loads with library artwork applied; uploads are separate from the room', async ({ page }) => {
    await expect(area(page, 'Backsplash')).toContainText('Carrara veins');
    await chooseArtwork(page, 'Ocean bands');
    await expect(area(page, 'Backsplash')).toContainText('Ocean bands');
    // Changing artwork never replaces the room photo.
    await expect(page.locator('.rv-roombtn__name')).toHaveText('Kitchen with angled backsplash');
  });

  test('A04 obstacle cutouts stay unprinted while the surface around them is printed', async ({ page }) => {
    await chooseArtwork(page, 'Ocean bands'); // dark blue design → printed pixels are easy to tell from the wall
    const preset = geometry.kitchen[0];
    const outlet = centroid(preset.exclusions[0]);
    // Around the socket the design is printed (several samples, as one may fall on a tile joint).
    const around = [0.035, 0.045, 0.055].map((dx) => ({ x: outlet.x + dx, y: outlet.y }));
    const diffs = await Promise.all(around.map(async (p) => colorDistance(await renderedColor(page, p), await photoColor(page, KITCHEN, p))));
    expect(Math.max(...diffs)).toBeGreaterThan(40);
    const kept = await renderedColor(page, outlet);
    const keptRef = await photoColor(page, KITCHEN, outlet);
    expect(colorDistance(kept, keptRef)).toBeLessThan(24);
  });

  test('A03 irregular L-shaped outline: draw, add, move and remove points; clipping follows the shape', async ({ page }) => {
    await drawLShape(page);
    await expect(page.locator('.rv-handle--boundary')).toHaveCount(6);
    await chooseArtwork(page, 'Ocean bands');
    const inside = { x: 0.915, y: 0.5 };
    const notch = { x: 0.84, y: 0.5 }; // inside the bounding box but outside the L
    expect(colorDistance(await renderedColor(page, inside), await photoColor(page, KITCHEN, inside))).toBeGreaterThan(40);
    expect(colorDistance(await renderedColor(page, notch), await photoColor(page, KITCHEN, notch))).toBeLessThan(24);

    await tab(page, 'Shape').click();
    const before = await handlePositions(page, 'boundary');
    const h = page.locator('.rv-handle--boundary').nth(1);
    const hb = (await h.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 15, hb.y + hb.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    const after = await handlePositions(page, 'boundary');
    expect(after[1].x).toBeLessThan(before[1].x - 0.005);
    expect(after[0]).toEqual(before[0]);

    await page.locator('.rv-mid').first().click();
    await expect(page.locator('.rv-handle--boundary')).toHaveCount(7);
    await page.locator('.rv-handle--boundary').nth(1).focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('.rv-handle--boundary')).toHaveCount(6);
    // Keyboard nudge (accessible alternative to dragging).
    const k0 = (await handlePositions(page, 'boundary'))[0];
    await page.locator('.rv-handle--boundary').first().focus();
    await page.keyboard.press('Shift+ArrowRight');
    const k1 = (await handlePositions(page, 'boundary'))[0];
    expect(k1.x).toBeGreaterThan(k0.x);
  });

  test('A05 straight artwork lines follow the angled wall (visual evidence)', async ({ page }, info) => {
    await chooseArtwork(page, 'Linear grid');
    await tab(page, 'Perspective').click();
    await expect(page.locator('.rv-handle--perspective')).toHaveCount(4);
    await info.attach('angled-grid', { body: await stageShot(page), contentType: 'image/png' });
  });

  test('A06 artwork size and position change without moving the outline or cutouts', async ({ page }) => {
    await tab(page, 'Shape').click();
    const outline = await handlePositions(page, 'boundary');
    await tab(page, 'Cutouts').click();
    const cuts = await handlePositions(page, 'cutout');
    await tab(page, 'Artwork').click();
    const shot1 = await stageShot(page);
    const size = page.getByLabel('Design size');
    await size.focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowLeft');
    const pos = page.getByLabel('Horizontal position');
    await pos.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect((await stageShot(page)).equals(shot1)).toBe(false);
    // Drag the artwork itself on the photo.
    const s = await toScreen(page, { x: 0.3, y: 0.5 });
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x + 40, s.y, { steps: 4 });
    await page.mouse.up();
    await tab(page, 'Shape').click();
    expect(await handlePositions(page, 'boundary')).toEqual(outline);
    await tab(page, 'Cutouts').click();
    expect(await handlePositions(page, 'cutout')).toEqual(cuts);
  });

  test('A07 two areas keep different artwork, materials and settings; deleting one keeps the other', async ({ page }) => {
    await page.getByRole('button', { name: 'Select area 2: Upper cabinet doors' }).click();
    await chooseArtwork(page, 'Linear grid');
    await tab(page, 'Material').click();
    await page.getByRole('radio', { name: /Brushed aluminium/ }).check();
    await page.getByLabel('Print brightness').focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(area(page, 'Upper cabinet doors')).toContainText('Linear grid · Brushed aluminium');

    await area(page, 'Backsplash').locator('.rv-arealist__select').click();
    await expect(area(page, 'Backsplash')).toContainText('Carrara veins · Gloss ceramic tile');
    await tab(page, 'Material').click();
    await expect(page.getByRole('radio', { name: /Gloss ceramic tile/ })).toBeChecked();
    await expect(page.locator('.rv-slider', { hasText: 'Print brightness' }).locator('output')).toHaveText('0.00');

    await area(page, 'Upper cabinet doors').locator('.rv-arealist__select').click();
    await page.getByRole('button', { name: 'Delete area' }).click();
    await expect(page.locator('.rv-arealist__item')).toHaveCount(1);
    await expect(area(page, 'Backsplash')).toContainText('Carrara veins · Gloss ceramic tile');
    // Undo restores the deleted area with its settings.
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    await expect(area(page, 'Upper cabinet doors')).toContainText('Linear grid · Brushed aluminium');
  });

  test('A08 material and lighting controls visibly change the preview and show their values', async ({ page }) => {
    await tab(page, 'Material').click();
    const s0 = await stageShot(page);
    await page.getByRole('radio', { name: /Printed clear glass/ }).check();
    await page.waitForTimeout(300);
    const s1 = await stageShot(page);
    expect(s1.equals(s0)).toBe(false);
    await page.getByRole('button', { name: 'Warm evening' }).click();
    await page.waitForTimeout(300);
    expect((await stageShot(page)).equals(s1)).toBe(false);
    await expect(page.locator('.rv-slider', { hasText: 'Warmth' }).locator('output')).toHaveText('Warm 70');
    await expect(page.getByRole('button', { name: 'Warm evening' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('A09 changing the room never carries geometry to another photo; returning restores it', async ({ page }) => {
    await drawLShape(page);
    await page.locator('.rv-roombtn').click();
    await page.getByRole('dialog').getByRole('button', { name: /Bathroom with shower/ }).click();
    await expect(page.locator('.rv-roombtn__name')).toHaveText('Bathroom with shower and vanity');
    await expect(page.locator('.rv-arealist__item')).toHaveCount(2);
    await expect(area(page, 'Shower wall')).toBeVisible();
    await expect(area(page, 'Backsplash')).toHaveCount(0);
    await page.locator('.rv-roombtn').click();
    await page.getByRole('dialog').getByRole('button', { name: /Kitchen with angled/ }).click();
    await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
  });

  test('A10 outline handles stay aligned with the photo across viewport sizes and zoom', async ({ page }) => {
    await tab(page, 'Shape').click();
    const base = await handlePositions(page, 'boundary');
    const expected = geometry.kitchen[0].boundary;
    base.forEach((p, i) => {
      expect(Math.abs(p.x - expected[i].x)).toBeLessThan(0.004);
      expect(Math.abs(p.y - expected[i].y)).toBeLessThan(0.004);
    });
    for (const vp of [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(300);
      const now = await handlePositions(page, 'boundary');
      now.forEach((p, i) => {
        expect(Math.abs(p.x - base[i].x)).toBeLessThan(0.004);
        expect(Math.abs(p.y - base[i].y)).toBeLessThan(0.004);
      });
    }
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(300);
    const zoomed = await handlePositions(page, 'boundary');
    zoomed.forEach((p, i) => expect(Math.abs(p.x - base[i].x)).toBeLessThan(0.004));
  });

  test('A15 bad uploads, invalid geometry and folded perspective produce recoverable messages', async ({ page }) => {
    await page.locator('.rv-roombtn').click();
    const dialog = page.getByRole('dialog');
    const input = dialog.locator('input[type=file]');
    await input.setInputFiles({ name: 'room.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not an image') });
    await expect(dialog.getByRole('alert')).toContainText('not a supported image');
    await input.setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') });
    await expect(dialog.getByRole('alert')).toContainText('SVG and HTML files are not accepted');
    const hugePng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      Buffer.from('IHDR'),
      Buffer.from([0, 0, 0x4e, 0x20, 0, 0, 0x3a, 0x98, 8, 6, 0, 0, 0]),
    ]);
    await input.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: hugePng });
    await expect(dialog.getByRole('alert')).toContainText('megapixels');
    // A corrupt JPEG with a valid header.
    await input.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4]) });
    await expect(dialog.getByRole('alert')).toContainText(/could not be read|not a supported/);
    // A real photo works after the errors.
    await input.setInputFiles('public/demo/rooms/office.jpg');
    await expect(page.locator('.rv-roombtn__name')).toHaveText('office');
    await expect(page.getByText('No print areas yet.')).toBeVisible();

    // Crossed outline is rejected with an explanation.
    await page.getByRole('button', { name: 'Draw area' }).click();
    for (const p of [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.2 },
      { x: 0.2, y: 0.5 },
    ]) {
      const s = await toScreen(page, p);
      await page.mouse.click(s.x, s.y);
    }
    await page.locator('.rv-stagebar').getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('.rv-toast')).toContainText('crosses itself');
    await page.keyboard.press('Escape');

    // A rectangle area, then try to fold its perspective frame: the move is refused.
    await page.getByRole('button', { name: 'Add rectangle area' }).click();
    await tab(page, 'Perspective').click();
    const corners = await handlePositions(page, 'perspective');
    const tl = await toScreen(page, corners[0]);
    const far = await toScreen(page, { x: corners[2].x + 0.05, y: corners[2].y + 0.05 });
    await page.mouse.move(tl.x, tl.y);
    await page.mouse.down();
    await page.mouse.move(far.x, far.y, { steps: 8 });
    await page.mouse.up();
    const after = await handlePositions(page, 'perspective');
    expect(after[0].x).toBeLessThan(after[1].x);
    expect(after[0].y).toBeLessThan(after[3].y);
    await expect(page.locator('.rv-notice--error')).toHaveCount(0);

    // Artwork upload goes to the library section "Your uploads" and onto the selected area.
    await tab(page, 'Artwork').click();
    await page.locator('.rv-tabpanel input[type=file]').setInputFiles('public/demo/artwork/hex.jpg');
    await expect(page.getByRole('button', { name: 'Your uploads (1)' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'hex', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('graphics context loss shows a message and the preview recovers', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('.rv-arealist__item')).toHaveCount(2);
    await page.waitForTimeout(500);
    const handle = await page.evaluate(() => {
      const dbg = (window as unknown as { __roomVisualizerDebug?: { loseContext(): { restore(): void } | null } }).__roomVisualizerDebug;
      const h = dbg?.loseContext();
      (window as unknown as { __restore?: () => void }).__restore = () => h?.restore();
      return Boolean(h);
    });
    expect(handle).toBe(true);
    await expect(page.getByText('The graphics processor was reset')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __restore: () => void }).__restore());
    await expect(page.getByText('The graphics processor was reset')).toHaveCount(0);
  });
});
