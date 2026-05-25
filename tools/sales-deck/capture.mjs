// Drives the live app and captures screenshots for the sales deck.
//
// Run:
//   npm install --no-save playwright
//   npx playwright install chromium
//   node tools/sales-deck/capture.mjs
//
// Env vars (optional):
//   APP_URL    default http://localhost:4200
//   APP_EMAIL  default nagrajdbff@gmail.com
//   APP_PASS   default Demo@123456

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const APP_URL  = process.env.APP_URL  || 'http://localhost:4200';
const EMAIL    = process.env.APP_EMAIL || 'nagrajdbff@gmail.com';
const PASS     = process.env.APP_PASS  || 'Demo@123456';

const VIEW = { width: 1920, height: 1080 };

const shoot = async (page, name) => {
  const file = path.join(SHOTS, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('  ✓', name);
};

const goto = async (page, route, waitMs = 1500) => {
  await page.goto(APP_URL + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(waitMs);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  console.log('Login…');
  await page.goto(APP_URL + '/auth/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill(EMAIL);
  await shoot(page, '01-login.png');
  await page.locator('#password').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard|home)/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // 00 — Dashboard hero (top half)
  await goto(page, '/dashboard', 2500);
  await shoot(page, '02-dashboard.png');
  await page.screenshot({ path: path.join(SHOTS, '00-dashboard-hero.png'), clip: { x: 0, y: 0, width: 1920, height: 720 } });
  console.log('  ✓ 00-dashboard-hero.png');

  // 03 — Patient register
  await goto(page, '/patients/register', 2500);
  await shoot(page, '03-patient-register.png');

  // 04 — Home collection
  await goto(page, '/lab/home-collection', 2500);
  await shoot(page, '04-home-collection.png');

  // 05 — Billing list
  await goto(page, '/billing', 3000);
  await shoot(page, '05-billing-invoice.png');

  // 06 — Smart Inbox
  await goto(page, '/smart-inbox', 2500);
  await shoot(page, '06-smart-inbox.png');

  // 07 — Lab workflow
  await goto(page, '/lab', 3000);
  await shoot(page, '07-lab-workflow.png');

  // 08 — Lab report settings (proxy for the PDF look until a real PDF screenshot is dropped in)
  await goto(page, '/settings', 2000);
  // try to click the "Lab profile" or "Lab report" tab
  try {
    await page.locator('button:has-text("Lab profile"), button:has-text("Lab report")').first().click({ timeout: 3000 });
    await page.waitForTimeout(1500);
  } catch {}
  await shoot(page, '08-lab-report-pdf.png');

  // 09 — Pharmacy
  await goto(page, '/pharmacy', 2500);
  await shoot(page, '09-pharmacy.png');

  // 10 — IPD
  await goto(page, '/ipd-beds', 2500);
  await shoot(page, '10-ipd.png');

  // 17 — HR · Staff
  await goto(page, '/hr/staff', 3000);
  await shoot(page, '17-hr-staff.png');

  // 18 — HR · Attendance
  await goto(page, '/hr/attendance', 3000);
  await shoot(page, '18-hr-attendance.png');

  // 19 — HR · Leave & Shifts
  await goto(page, '/hr/attendance/leave', 3000);
  await shoot(page, '19-hr-leave-shifts.png');

  // 20 — Payroll · Staff salary
  await goto(page, '/payroll/salary', 3000);
  await shoot(page, '20-payroll-salary.png');

  // 11 — Doctor payouts
  await goto(page, '/payroll/doctors', 3000);
  await shoot(page, '11-doctor-payslip.png');

  // 12 — Reports / analytics (lab catalog + dashboard combined; we use lab-catalog as reports stand-in)
  await goto(page, '/dashboard', 3000);
  // scroll down to the analytics block
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(800);
  await shoot(page, '12-reports.png');
  await page.evaluate(() => window.scrollTo(0, 0));

  // 13 — Settings (default tab)
  await goto(page, '/settings', 2500);
  await shoot(page, '13-settings.png');

  // 14/15 — Architecture & Security: synthetic placeholders (drop your own diagrams later)
  // We screenshot the settings page once more as a stand-in; the deck shows the dashed
  // placeholder if these files are absent, so we deliberately do NOT create 14/15/16 here
  // unless the user wants a stand-in.

  // 16 — Multi-branch switcher: open the branch selector
  await goto(page, '/dashboard', 1500);
  // Try the top-bar branch chip — selector is loose; tolerate failure
  try {
    await page.locator('button:has-text("Branch"), [data-branch-switcher], [aria-label*="branch" i]').first().click({ timeout: 3000 });
    await page.waitForTimeout(800);
  } catch {}
  await shoot(page, '16-multi-branch.png');

  await browser.close();
  console.log('\nAll captures written to:', SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
