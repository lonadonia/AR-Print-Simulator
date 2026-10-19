import { expect, test, type Page } from '@playwright/test';
import { area, colorDistance, handlePositions, openEditor, photoColor, renderedColor, stageShot, tab, toScreen, type Pt } from './helpers';

/** Professional editing tools: magic select, snapping, magnifier, compare, export, patterns. */

async function openRoom(page: Page, name: RegExp) {
  await page.locator('.rv-roombtn').click();
  await page.getByRole('dialog').getByRole('button', { name }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(600);
}

async function clickAt(page: Page, p: Pt, modifiers: ('Shift' | 'Alt')[] = []) {
  const s = await toScreen(page, p);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(s.x, s.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

const bbox = (pts: Pt[]) => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  y1: Math.max(...pts.map((p) => p.y)),
});

test.describe('professional tools (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test('P01 magic select finds a whole glass-block panel across its joints', async ({ page }) => {
    await openRoom(page, /Reception/);
    await expect(page.locator('.rv-arealist__item')).toHaveCount(2);
    await page.keyboard.press('w');
    await expect(page.getByRole('button', { name: 'Magic select: tap a surface (W)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Across joints/ })).toHaveAttribute('aria-pressed', 'true');
    await clickAt(page, { x: 0.72, y: 0.55 });
    await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
    await expect(page.locator('.rv-toast')).toContainText('Surface selected');
    // Switch to the select tool to see the outline points; compare with the hand-drawn preset.
    await page.keyboard.press('v');
    const pts = await handlePositions(page, 'boundary');
    const b = bbox(pts);
    expect(Math.abs(b.x0 - 0.636)).toBeLessThan(0.02);
    expect(Math.abs(b.x1 - 0.893)).toBeLessThan(0.02);
    expect(Math.abs(b.y0 - 0.256)).toBeLessThan(0.02);
    expect(Math.abs(b.y1 - 0.809)).toBeLessThan(0.02);
    // A rectangular panel also gets a matching perspective frame.
    await tab(page, 'Perspective').click();
    const frame = bbox(await handlePositions(page, 'perspective'));
    expect(Math.abs(frame.x0 - b.x0)).toBeLessThan(0.02);
    expect(Math.abs(frame.y1 - b.y1)).toBeLessThan(0.02);
  });

  test('P02 magic select: one tile without joints, add with Shift, subtract with Alt, undo', async ({ page }) => {
    await openRoom(page, /Reception/);
    await page.keyboard.press('w');
    await page.getByRole('button', { name: /Across joints/ }).click();
    await clickAt(page, { x: 0.72, y: 0.55 });
    await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
    await page.keyboard.press('v');
    const single = bbox(await handlePositions(page, 'boundary'));
    expect(single.x1 - single.x0).toBeLessThan(0.06); // a single glass block
    // Add the neighbouring block with Shift + tap (the magic tool stays active).
    await page.keyboard.press('w');
    await clickAt(page, { x: 0.72 + 0.032, y: 0.55 }, ['Shift']);
    await expect(page.locator('.rv-toast')).toContainText('Added to the area');
    await page.keyboard.press('v');
    const two = bbox(await handlePositions(page, 'boundary'));
    expect(two.x1 - two.x0).toBeGreaterThan(single.x1 - single.x0 + 0.015);
    // A surface that does not touch the area is refused for Add, with an explanation.
    await page.keyboard.press('w');
    await clickAt(page, { x: 0.2, y: 0.3 }, ['Shift']);
    await expect(page.locator('.rv-toast')).toContainText('does not touch');
    // Subtract the added block again.
    await clickAt(page, { x: 0.72 + 0.032, y: 0.55 }, ['Alt']);
    await expect(page.locator('.rv-toast')).toContainText('Removed from the area');
    await page.keyboard.press('v');
    const back = bbox(await handlePositions(page, 'boundary'));
    expect(back.x1 - back.x0).toBeLessThan(two.x1 - two.x0 - 0.015);
    // Undo restores the two-block outline.
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    const undone = bbox(await handlePositions(page, 'boundary'));
    expect(Math.abs(undone.x1 - two.x1)).toBeLessThan(0.004);
  });

  test('P03 pen snaps to photo corners, shows a readout and closes on the first point', async ({ page }) => {
    await page.keyboard.press('p');
    await expect(page.locator('.rv-stagebar')).toBeVisible();
    // A corner of the right-hand upper cabinets in the kitchen photo is at about (0.506, 0.150).
    const near = await toScreen(page, { x: 0.51, y: 0.155 });
    await page.mouse.move(near.x, near.y, { steps: 3 });
    await expect(page.locator('.rv-snap--corner')).toHaveCount(1);
    await expect(page.locator('.rv-statusbar__snap')).toContainText('Snapped to corner');
    await page.mouse.click(near.x, near.y);
    const next = await toScreen(page, { x: 0.6, y: 0.2 });
    await page.mouse.move(next.x, next.y, { steps: 3 });
    await expect(page.locator('.rv-readout')).toContainText(/\d+ px · -?\d+°/);
    // Alt places without snapping.
    await page.keyboard.down('Alt');
    await page.mouse.move(near.x + 3, near.y + 3);
    await expect(page.locator('.rv-snap--corner')).toHaveCount(0);
    await page.keyboard.up('Alt');
    await page.keyboard.press('Escape');
    await expect(page.locator('.rv-stagebar')).toHaveCount(0);
  });

  test('P04 magnifier while dragging, outline moving and rectangle tool', async ({ page }) => {
    await tab(page, 'Shape').click();
    const before = await handlePositions(page, 'boundary');
    const h = (await page.locator('.rv-handle--boundary').nth(1).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 30, h.y + h.height / 2 + 30, { steps: 4 });
    await expect(page.locator('.rv-loupe')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.rv-loupe')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    expect(await handlePositions(page, 'boundary')).toEqual(before);

    // Drag inside the selected outline to move all of it (points and cutouts together).
    const inside = await toScreen(page, { x: 0.45, y: 0.5 });
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.down();
    await page.mouse.move(inside.x + 20, inside.y - 10, { steps: 5 });
    await page.mouse.up();
    const moved = await handlePositions(page, 'boundary');
    const dx = moved[0].x - before[0].x;
    expect(dx).toBeGreaterThan(0.005);
    moved.forEach((p, i) => expect(Math.abs(p.x - before[i].x - dx)).toBeLessThan(0.003));

    // Rectangle tool: drag corner to corner.
    await page.keyboard.press('r');
    const a = await toScreen(page, { x: 0.8, y: 0.15 });
    const b = await toScreen(page, { x: 0.95, y: 0.45 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await expect(page.locator('.rv-readout')).toContainText(/\d+ × \d+ px/);
    await page.mouse.up();
    await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
    await expect(page.locator('.rv-handle--boundary')).toHaveCount(4);
  });

  test('P05 zoom at the cursor keeps the outline aligned with the photo', async ({ page }) => {
    await tab(page, 'Shape').click();
    const base = await handlePositions(page, 'boundary');
    const c = await toScreen(page, { x: 0.4, y: 0.5 });
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -400);
    await page.keyboard.up('Control');
    await expect(page.locator('.rv-statusbar')).toContainText(/Zoom (1[5-9]\d|[2-8]\d\d)%/);
    const zoomed = await handlePositions(page, 'boundary');
    zoomed.forEach((p, i) => {
      expect(Math.abs(p.x - base[i].x)).toBeLessThan(0.004);
      expect(Math.abs(p.y - base[i].y)).toBeLessThan(0.004);
    });
    await page.keyboard.press('0');
    await expect(page.locator('.rv-statusbar')).toContainText('Zoom 100%');
  });

  test('P06 before/after comparison and hiding an area', async ({ page }) => {
    await page.keyboard.press('b');
    const slider = page.getByRole('slider', { name: 'Before / after divider' });
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '55');
    await page.keyboard.press('b');
    await expect(slider).toHaveCount(0);

    // Hiding the backsplash shows the original photo there; showing it prints it again.
    // (Several samples, as one may fall on a tile joint.)
    const pts = [0.4, 0.42, 0.44].map((x) => ({ x, y: 0.52 }));
    const refs = await Promise.all(pts.map((p) => photoColor(page, 'demo/rooms/kitchen.jpg', p)));
    const diffs = async () => Promise.all(pts.map(async (p, i) => colorDistance(await renderedColor(page, p), refs[i])));
    await tab(page, 'Artwork').click();
    await page.getByRole('option', { name: 'Ocean bands' }).click();
    await page.waitForTimeout(500);
    expect(Math.max(...(await diffs()))).toBeGreaterThan(40);
    await page.getByRole('button', { name: 'Hide Backsplash in the preview' }).click();
    await page.waitForTimeout(300);
    expect(Math.max(...(await diffs()))).toBeLessThan(24);
    await page.getByRole('button', { name: 'Show Backsplash in the preview' }).click();
    await page.waitForTimeout(300);
    expect(Math.max(...(await diffs()))).toBeGreaterThan(40);
  });

  test('P07 save image renders the full preview and downloads a JPEG', async ({ page }) => {
    await page.getByRole('button', { name: 'Save image of the preview' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save the preview' });
    await expect(dialog.getByRole('img', { name: /Rendered room preview/ })).toBeVisible();
    const size = await dialog.getByRole('img').evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    expect(size.w).toBeGreaterThanOrEqual(1200); // working resolution, not the on-screen size
    expect(size.h).toBeGreaterThan(size.w * 0.6);
    const download = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Download JPEG' }).click();
    expect((await download).suggestedFilename()).toBe('room-preview-kitchen-with-angled-backsplash.jpg');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('P08 pattern maker: apply, recolour (keeping the repeat size) and tile layouts', async ({ page }) => {
    await tab(page, 'Artwork').click();
    await page.getByRole('button', { name: 'Pattern maker' }).click();
    const s0 = await stageShot(page);
    await page.getByRole('option', { name: 'Zellige squares' }).click();
    await expect(area(page, 'Backsplash')).toContainText('Zellige squares · Ivory & gold');
    await expect(page.getByRole('switch', { name: 'Repeat design as a pattern' })).toBeChecked();
    const sizeOut = page.locator('.rv-slider', { hasText: 'Design size' }).locator('output');
    const size = page.getByLabel('Design size');
    await size.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    const sized = await sizeOut.textContent();
    await page.getByRole('button', { name: 'Navy & brass' }).click();
    await expect(area(page, 'Backsplash')).toContainText('Zellige squares · Navy & brass');
    await expect(sizeOut).toHaveText(sized!);
    await page.waitForTimeout(400);
    expect((await stageShot(page)).equals(s0)).toBe(false);

    await tab(page, 'Material').click();
    await page.getByRole('radio', { name: /Subway tile, brick bond/ }).check();
    await expect(page.getByRole('radio', { name: 'Brick ½', exact: true })).toBeChecked();
    await expect(page.locator('.rv-slider', { hasText: 'Tile proportion' }).locator('output')).toHaveText('3.0 : 1');
    const s1 = await stageShot(page);
    await page.getByRole('radio', { name: 'Herringbone', exact: true }).check();
    await page.waitForTimeout(400);
    expect((await stageShot(page)).equals(s1)).toBe(false);
    await expect(page.locator('.rv-slider', { hasText: 'Tile proportion' })).toHaveCount(0);
  });

  test('P09 workflow steps and keyboard shortcut help', async ({ page }) => {
    await page.getByRole('button', { name: /Step 3: Design/ }).click();
    await expect(tab(page, 'Artwork')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: /Step 4: Finish/ }).click();
    await expect(tab(page, 'Material')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Step 1: Room/ }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a room' })).toBeVisible();
  });
});
