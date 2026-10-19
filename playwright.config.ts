import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks in Chromium (WebGL via SwiftShader in headless runs).
 *
 *   npx playwright install chromium   # once, if you do not already have a Playwright Chromium
 *   npm run e2e
 *
 * Set PW_CHROMIUM_EXECUTABLE to use an existing Chromium build instead of the downloaded one.
 * Mobile projects emulate a touch phone in Chromium; they do not replace testing on real
 * iOS Safari / Android Chrome devices.
 */
const launchOptions = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  ...(process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', launchOptions },
  webServer: [
    {
      command: 'npx vite build --mode demo && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite build --mode harness --outDir dist-harness && node scripts/serve-harness.mjs',
      url: 'http://localhost:4174/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'desktop',
      testMatch: /editor\.spec\.ts|wix-harness\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:4173/' },
    },
    {
      name: 'mobile-touch',
      testMatch: /touch\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, baseURL: 'http://localhost:4173/' },
    },
  ],
});
