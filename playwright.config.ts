import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Keep Playwright's default worker count (2 workers on the 4-core CI runner).
  // Historical note: workers: 1 previously hit 8-11 failures/run (vs 1-2 with
  // 2 workers) because lower IPC latency let consecutive clicks outpace Phaser's
  // requestAnimationFrame InputPlugin.preUpdate() flush of `_pendingInsertion`.
  // That race is now eliminated in tests/e2e/helpers.ts (clickLogical waits 2
  // rAF ticks before clicking), while 2 workers keeps CI wall-clock time low.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // CI runners are slower (software rendering + parallel workers): the
  // multi-day flow tests need more than Playwright's 30s test default,
  // and phase/animation waits need more than the 5s expect default.
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
