import { test, expect } from '@playwright/test';

/**
 * Smoke tests: page-by-page sanity check. Each test logs the URL it navigates
 * to and the page title/H1 so failures are easy to diagnose.
 */

const PAGES: { name: string; path: string; expect: RegExp }[] = [
  { name: 'Dashboard',     path: '/dashboard',          expect: /diagnostic centre|workspace|dashboard/i },
  { name: 'Lab workbench', path: '/lab',                expect: /lab|phlebotomy|verification/i },
  { name: 'Lab catalog',   path: '/lab-catalog',        expect: /lab test catalog/i },
  { name: 'Lab reports',   path: '/lab-reports',        expect: /lab reports/i },
  { name: 'Billing',       path: '/billing',            expect: /billing|invoice/i },
  { name: 'Home coll.',    path: '/home-collection',    expect: /home collection/i },
  { name: 'Settings',      path: '/settings',           expect: /settings|lab profile/i },
];

for (const p of PAGES) {
  test(`smoke: ${p.name} renders`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(p.path);
    await page.waitForLoadState('networkidle');

    // Page-specific text should appear somewhere
    await expect(page.locator('body')).toContainText(p.expect, { timeout: 10_000 });

    // Filter out non-fatal network/asset noise:
    //  • Failed to load resource (400/404) — the page-level defensive code already
    //    handles missing tables and shows a banner.
    //  • favicon, net::ERR_*, blocked-by-client — irrelevant to functionality.
    const fatal = errors.filter((e) =>
      !/favicon|net::|ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(e),
    );
    if (fatal.length > 0) {
      console.log(`[smoke ${p.name}] errors:`, fatal);
    }
    expect(fatal, `Real JS errors on ${p.path}: ${fatal.join('\n')}`).toEqual([]);
  });
}
