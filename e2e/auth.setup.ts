import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const STATE = 'e2e/.auth/state.json';

setup('authenticate', async ({ page }) => {
  const email = process.env['NIYAMONE_EMAIL'];
  const password = process.env['NIYAMONE_PASSWORD'];
  if (!email || !password) {
    throw new Error(
      'Set NIYAMONE_EMAIL and NIYAMONE_PASSWORD env vars before running Playwright.\n' +
      '  PowerShell:  $env:NIYAMONE_EMAIL="..."; $env:NIYAMONE_PASSWORD="..."\n' +
      '  bash:        export NIYAMONE_EMAIL=...; export NIYAMONE_PASSWORD=...',
    );
  }

  mkdirSync(dirname(STATE), { recursive: true });

  await page.goto('/auth/login');
  await page.getByLabel(/email or username/i).fill(email);
  // Use the textbox role explicitly so we don't match the "Show password" button
  await page.getByRole('textbox', { name: /^password$/i }).fill(password);
  await page.getByRole('button', { name: /^continue$/i }).click();

  // Wait for the dashboard to load (any of these are fine — first one wins)
  await Promise.race([
    page.waitForURL(/\/(dashboard|patient-portal)/, { timeout: 20_000 }),
    page.locator('app-sidebar, [class*="hb-sidebar"]').waitFor({ state: 'visible', timeout: 20_000 }),
  ]);

  await expect(page).not.toHaveURL(/\/auth\/login/);

  await page.context().storageState({ path: STATE });
});
