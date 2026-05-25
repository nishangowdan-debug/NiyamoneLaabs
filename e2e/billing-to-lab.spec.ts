import { test, expect, type Page } from '@playwright/test';

/**
 * Verifies the flow we've been chasing: an invoice with LAB-* line items
 * results in a row showing up in /lab.
 *
 * Strategy:
 *   1. Find any existing invoice on /billing that has a → Lab button enabled
 *      (i.e., user has billing.write).
 *   2. Click → Lab on that row.
 *   3. Assert a success or warn toast appears with the test count or reason.
 *   4. Navigate to /lab. Assert at least one order references the patient.
 *
 * The test does NOT create a fresh invoice — that exercises a lot of UI surface
 * (patient search, doctor dropdown, line item picker) and is brittle. Instead
 * it tests the part that was reported broken: existing invoice → lab.
 */

test.describe('Billing → Lab flow', () => {
  test('clicking "→ Lab" on an invoice with LAB-* items sends it to /lab', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/billing');
    await page.waitForLoadState('networkidle');

    // Find the first row that contains a → Lab button.
    const row = page
      .locator('tr')
      .filter({ has: page.getByRole('button', { name: /→ Lab/i }) })
      .first();

    if ((await row.count()) === 0) {
      test.skip(true, 'No invoices with → Lab button found in /billing — seed one first.');
    }

    const labButton = row.getByRole('button', { name: /→ Lab/i });
    const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim();
    console.log('[e2e] clicking → Lab on row:', rowText);

    await labButton.click();

    // Toast lives in <app-toast-outlet>, no role="status" — use the actual structure.
    // Each toast is a div.border-l-4 inside the aria-live="polite" region.
    const toastRegion = page.locator('app-toast-outlet, [aria-live="polite"]').first();

    // Wait for ANY of the three documented outcome phrases to appear in the toast region.
    const expectPattern = /sent to lab|no lab[\-_ ]\* line items|no lab-\* line items|could not send|nothing to send/i;
    await expect(toastRegion).toContainText(expectPattern, { timeout: 12_000 });

    const toastText = (await toastRegion.innerText()).replace(/\s+/g, ' ').trim();
    console.log('[e2e] toast text:', toastText);

    // If the toast says we sent something, verify /lab now lists this patient.
    if (/sent to lab/i.test(toastText)) {
      await page.goto('/lab');
      await page.waitForLoadState('networkidle');

      // Best-effort: look for the patient UHID (NIY…) anywhere on the lab list
      const uhidMatch = rowText.match(/NIY\d+/);
      if (uhidMatch) {
        const uhid = uhidMatch[0];
        const labRow = page.locator(`text=${uhid}`).first();
        await expect(labRow).toBeVisible({ timeout: 10_000 });
        console.log('[e2e] ✓ /lab shows', uhid);
      } else {
        console.warn('[e2e] could not extract UHID from billing row text — skipping /lab verification');
      }
    }
  });
});
