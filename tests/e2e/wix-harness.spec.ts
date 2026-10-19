import { expect, test, type FrameLocator, type Page } from '@playwright/test';

/**
 * Integration with a simulated Wix page on a different origin (wix/harness/host.html).
 * Verifies the ready/catalog handshake, origin checks, catalog validation and error states
 * through real cross-origin postMessage. It does not replace verification on the live Wix site.
 */
const HOST = 'http://localhost:4174/';

function editor(page: Page): FrameLocator {
  return page.frameLocator('#roomVisualizer');
}

test.describe('Wix page integration (local simulator)', () => {
  test('A13 (simulated) catalog arrives through the handshake, theme applies, images load', async ({ page }) => {
    await page.goto(`${HOST}?mode=ok&delay=1500`); // the iframe loads late: no race either way
    const f = editor(page);
    await expect(f.locator('.rv-roombtn__name')).toHaveText('Harness kitchen');
    await expect(f.locator('.rv-arealist__item')).toHaveCount(2); // presets sent by the page
    await expect(f.locator('.rv-arealist__item').first()).toContainText('Carrara (CMS) · Gloss tile (CMS)');
    await expect(f.locator('.rv-badge-demo')).toHaveCount(0); // production mode shows no demo label
    const accent = await f.locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--rv-accent').trim());
    expect(accent).toBe('#7a3e9d');
    await expect(page.locator('#log')).toContainText('editor → page: ready');
    await expect(page.locator('#log')).toContainText('editor → page: catalog-received');
  });

  test('camera inside an iframe without camera permission falls back to the camera app honestly', async ({ page }) => {
    await page.goto(`${HOST}?mode=ok`);
    const f = editor(page);
    await expect(f.locator('.rv-roombtn__name')).toHaveText('Harness kitchen');
    await f.getByRole('button', { name: 'Take a room photo with the camera' }).click();
    const cam = f.getByRole('dialog', { name: 'Camera' });
    await expect(cam.getByRole('alert')).toContainText('does not allow live camera access');
    await expect(cam.getByRole('button', { name: 'Take a photo with the camera app' })).toBeVisible();
    await expect(cam.locator('input[type=file][capture=environment]')).toHaveCount(1);
    await expect(cam.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
    await cam.getByRole('button', { name: 'Close camera' }).click();
    await expect(cam).toHaveCount(0);
  });

  test('A15 CMS failure shows an honest error and recovers on retry', async ({ page }) => {
    await page.goto(`${HOST}?mode=error`);
    const f = editor(page);
    await expect(f.getByText('The visualizer content could not be loaded')).toBeVisible();
    await expect(f.getByText('Simulated CMS failure.')).toBeVisible();
    await f.getByRole('button', { name: 'Try again' }).click();
    await expect(f.locator('.rv-roombtn__name')).toHaveText('Harness kitchen');
  });

  test('A15 empty catalog leaves the editor usable with uploads', async ({ page }) => {
    await page.goto(`${HOST}?mode=empty`);
    const f = editor(page);
    await expect(f.getByRole('heading', { name: 'Start with a room' })).toBeVisible();
    await f.locator('.rv-emptystage input[type=file]').setInputFiles('public/demo/rooms/bathroom.jpg');
    await expect(f.locator('.rv-roombtn__name')).toHaveText('bathroom');
    await f.getByRole('button', { name: 'Add rectangle area' }).click();
    await f.getByRole('tab', { name: 'Artwork' }).click();
    await expect(f.getByText('The artwork library is empty.')).toBeVisible();
    await f.getByRole('tab', { name: 'Material' }).click();
    await expect(f.getByText('No materials have been added to the library yet.')).toBeVisible();
  });

  test('A15 a missing library image shows a clear state instead of breaking', async ({ page }) => {
    await page.goto(`${HOST}?mode=missing`);
    const f = editor(page);
    await expect(f.locator('.rv-arealist__item')).toHaveCount(2);
    await f.getByRole('tab', { name: 'Artwork' }).click();
    await expect(f.getByRole('option', { name: /Terrazzo \(CMS\)/ })).toContainText('Image unavailable');
    await f.getByRole('option', { name: /Terrazzo \(CMS\)/ }).click();
    await expect(f.getByRole('alert')).toContainText('could not be loaded');
    await f.getByRole('option', { name: 'Grid (CMS)' }).click();
    await expect(f.locator('.rv-arealist__item').first()).toContainText('Grid (CMS)');
    await expect(f.getByRole('alert')).toHaveCount(0);
  });

  test('messages are never sent to, or accepted from, a page that is not allow-listed', async ({ page }) => {
    test.setTimeout(90_000);
    // Same harness, but on 127.0.0.1 — a different origin from the allow-listed localhost:4174.
    // `push` mode makes the untrusted page send a catalog without being asked.
    await page.goto('http://127.0.0.1:4174/?mode=push');
    const f = editor(page);
    await expect(f.getByText('The visualizer content did not arrive')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#log')).not.toContainText('editor → page');
    await f.getByText('Details for the site owner').click();
    await expect(f.getByText('Ignored messages from http://127.0.0.1:4174')).toBeVisible();
  });
});
