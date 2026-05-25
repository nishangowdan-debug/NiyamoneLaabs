import { defineConfig, devices } from '@playwright/test';

/**
 * Niyamone-Lab E2E config.
 *
 * Run:
 *   set NIYAMONE_EMAIL=management@niyamone.com
 *   set NIYAMONE_PASSWORD=...
 *   npx playwright test
 *
 * Open the HTML report afterwards:
 *   npx playwright show-report
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,            // shared backend → serial runs avoid race conditions
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env['NIYAMONE_URL'] ?? 'http://localhost:4300',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    // 1. Run login once and save the auth state to disk
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // 2. All other tests reuse the saved auth state
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
});
