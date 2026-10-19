import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { handlePositions, openEditor, stageShot, tab, toScreen, type Pt } from './helpers';

/**
 * Touch workflows in an emulated phone (390×844 CSS px, DPR 3). Touches are dispatched through
 * the Chrome DevTools Protocol, so they produce real touch/pointer events and respect
 * `touch-action`. This is emulation in desktop Chromium, not a physical iOS/Android device.
 */
async function touchDrag(cdp: CDPSession, from: Pt, to: Pt, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function pinch(cdp: CDPSession, center: Pt, startGap: number, endGap: number, steps = 8) {
  const pts = (gap: number) => [
    { x: center.x - gap / 2, y: center.y, id: 1 },
    { x: center.x + gap / 2, y: center.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(startGap) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(startGap + ((endGap - startGap) * i) / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function center(page: Page, selector: string, index = 0): Promise<Pt> {
  const b = (await page.locator(selector).nth(index).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe('editor (phone, touch)', () => {
  test('A14 touch: select areas, reshape, move and pinch artwork, draw a new area', async ({ page }, info) => {
    await openEditor(page);
    const cdp = await page.context().newCDPSession(page);
    await info.attach('phone-initial', { body: await page.screenshot(), contentType: 'image/png' });

    // Select area 2 by tapping its badge, then area 1 by tapping inside the backsplash.
    await page.getByRole('button', { name: 'Select area 2: Upper cabinet doors' }).tap();
    await expect(page.locator('.rv-arealist__item.is-selected')).toContainText('Upper cabinet doors');
    await tab(page, 'Shape').tap();
    const inside = await toScreen(page, { x: 0.45, y: 0.48 });
    await page.touchscreen.tap(inside.x, inside.y);
    await expect(page.locator('.rv-arealist__item.is-selected')).toContainText('Backsplash');

    // Drag an outline point with a finger.
    await tab(page, 'Shape').tap();
    const before = await handlePositions(page, 'boundary');
    const h = await center(page, '.rv-handle--boundary', 2);
    await touchDrag(cdp, h, { x: h.x - 12, y: h.y - 10 });
    const after = await handlePositions(page, 'boundary');
    expect(after[2].x).toBeLessThan(before[2].x - 0.01);
    expect(after[0]).toEqual(before[0]);

    // A finger drag on the photo away from handles does not change the outline.
    const empty = await toScreen(page, { x: 0.5, y: 0.92 });
    await touchDrag(cdp, empty, { x: empty.x, y: empty.y - 40 });
    expect(await handlePositions(page, 'boundary')).toEqual(after);

    // Move the artwork with one finger and resize it with a pinch.
    await tab(page, 'Artwork').tap();
    const sizeOut = page.locator('.rv-slider', { hasText: 'Design size' }).locator('output');
    const posOut = page.locator('.rv-slider', { hasText: 'Horizontal position' }).locator('output');
    const size0 = await sizeOut.textContent();
    const pos0 = await posOut.textContent();
    const art = await toScreen(page, { x: 0.3, y: 0.48 });
    await touchDrag(cdp, art, { x: art.x + 30, y: art.y });
    await expect(posOut).not.toHaveText(pos0!);
    await pinch(cdp, await toScreen(page, { x: 0.35, y: 0.48 }), 40, 110);
    await expect(sizeOut).not.toHaveText(size0!);

    // Draw a new area by tapping.
    await page.getByRole('button', { name: 'Draw area' }).tap();
    for (const p of [
      { x: 0.82, y: 0.2 },
      { x: 0.95, y: 0.22 },
      { x: 0.95, y: 0.55 },
      { x: 0.82, y: 0.52 },
    ]) {
      const s = await toScreen(page, p);
      await page.touchscreen.tap(s.x, s.y);
    }
    await page.locator('.rv-stagebar').getByRole('button', { name: 'Finish' }).tap();
    await expect(page.locator('.rv-arealist__item')).toHaveCount(3);
    await info.attach('phone-after-edits', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('A10 high-density display: handles line up with the photo at DPR 3', async ({ page }) => {
    await openEditor(page);
    await tab(page, 'Perspective').tap();
    const corners = await handlePositions(page, 'perspective');
    expect(corners).toHaveLength(4);
    corners.forEach((c) => {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(1);
    });
    expect((await stageShot(page)).length).toBeGreaterThan(1000);
  });
});
