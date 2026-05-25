import { test, expect } from '@playwright/test';

/**
 * Diagnostic-only: targets INV-2026-00000054 (Periyasamy Ganesan).
 * Captures the exact toast that the → Lab button produces and prints it.
 * Run:  npx playwright test e2e/diagnose-invoice-054.spec.ts --reporter=list
 */
test('diagnose: → Lab on INV-2026-00000054', async ({ page }) => {
  test.setTimeout(60_000);

  // Capture network failures and console errors too
  const networkFailures: string[] = [];
  page.on('response', async (r) => {
    if (r.status() >= 400) {
      const url = r.url();
      let body = '';
      try { body = (await r.text()).slice(0, 400); } catch {}
      networkFailures.push(`${r.status()} ${url} :: ${body}`);
    }
  });

  await page.goto('/billing');
  await page.waitForLoadState('networkidle');

  // Find the row by invoice number (works for INV- or NV- prefix)
  const row = page
    .locator('tr')
    .filter({ hasText: /INV-2026-00000054|NV-2026-00000054/ })
    .first();

  await expect(row, 'Row INV-2026-00000054 should be on screen').toBeVisible({ timeout: 10_000 });

  // Click → Lab on this specific row
  const labBtn = row.getByRole('button', { name: /→ Lab/i });
  await expect(labBtn, '→ Lab button should be on the row').toBeVisible();
  await labBtn.click();

  // Wait for toast text
  const toastRegion = page.locator('app-toast-outlet, [aria-live="polite"]').first();
  await page.waitForTimeout(2000);            // let RPC + toast settle
  const toastText = (await toastRegion.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

  console.log('========================================');
  console.log('  toast:    ', toastText);
  console.log('  failures: ', networkFailures.length);
  for (const f of networkFailures) console.log('   -', f);
  console.log('========================================');

  // Always pass — this is diagnostic. The console output is what we read.
  expect(toastText.length, `Toast should appear after clicking → Lab`).toBeGreaterThan(0);
});
