import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

/**
 * Live camera capture with Chromium's fake camera device (a synthetic test video). This checks
 * the capture flow; it is not a substitute for testing on real phones.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('P10 live camera: capture a frame as the room photo', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Take a room photo with the camera' }).click();
  const dialog = page.getByRole('dialog', { name: 'Camera' });
  const shutter = dialog.getByRole('button', { name: 'Capture photo' });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Framing grid' })).toHaveAttribute('aria-pressed', 'true');
  await shutter.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.rv-roombtn__name')).toHaveText(/^Camera photo \d\d:\d\d$/);
  await expect(page.getByText('No print areas yet.')).toBeVisible();
  // The captured photo is a normal room: a rectangle area can be added and previewed.
  await page.getByRole('button', { name: 'Add rectangle area' }).click();
  await expect(page.locator('.rv-arealist__item')).toHaveCount(1);
});
