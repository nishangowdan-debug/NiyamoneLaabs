// Niyamone Labs x Sree Diagnostics walkthrough deck generator (Node).
//
// Run:
//   npm install --no-save pptxgenjs
//   node tools/sales-deck/build_deck.mjs
//
// Output: tools/sales-deck/Niyamone-SreeDiagnostics-Walkthrough.pptx
//
// Drop screenshots into tools/sales-deck/screenshots/ using the filenames in
// SCREENSHOTS.md; re-run and placeholders are replaced.

import PptxGenJS from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR  = path.join(__dirname, 'screenshots');
const OUT_PATH   = path.join(__dirname, 'Niyamone-SreeDiagnostics-Walkthrough.pptx');

// ── Brand tokens (mirrors src/styles.css) ──────────────────────────────
const BRAND      = '0E4F8C';
const BRAND_DEEP = '0A3A6B';
const ACCENT     = '00C3FF';
const GOLD       = 'C9A24B';
const INK        = '0F1B2D';
const INK_SOFT   = '2A374A';
const INK_MUTED  = '65758C';
const INK_FAINT  = '99A6B8';
const SURFACE    = 'F4F7FB';
const SURFACE_SUB= 'EDF1F7';
const WHITE      = 'FFFFFF';
const GOOD_FG    = '117A3A';
const WARN_FG    = '8B5A0F';

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.defineLayout({ name: 'NIY16x9', width: SLIDE_W, height: SLIDE_H });
pptx.layout = 'NIY16x9';
pptx.title  = 'Niyamone Labs – Sree Diagnostics walkthrough';

// ── Helpers ────────────────────────────────────────────────────────────
const rect = (slide, x, y, w, h, fill, lineColor, lineW = 0.75) =>
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill:  fill       ? { color: fill } : { type: 'none' },
    line:  lineColor  ? { color: lineColor, width: lineW } : { type: 'none' },
  });

const pill = (slide, x, y, label, { fill = BRAND, fg = WHITE, w = 1.8, h = 0.32 } = {}) =>
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.16,
    fill: { color: fill },
    line: { color: fill, width: 0 },
  }) && slide.addText(label, {
    x, y, w, h,
    fontFace: 'Calibri', fontSize: 10, bold: true, color: fg,
    align: 'center', valign: 'middle',
  });

const text = (slide, opts, value) => slide.addText(value, opts);

const bullets = (slide, x, y, w, h, items, { size = 15, color = INK_SOFT, gap = 8 } = {}) =>
  slide.addText(
    items.map((b) => ({
      text: b,
      options: {
        bullet: { code: '25B8' },          // ▸
        paraSpaceAfter: gap,
      },
    })),
    { x, y, w, h, fontFace: 'Calibri', fontSize: size, color, valign: 'top' },
  );

const topBar = (slide) => {
  rect(slide, 0, 0,    SLIDE_W, 0.08, BRAND);
  rect(slide, 0, 0.08, SLIDE_W, 0.04, ACCENT);
};

const footer = (slide, idx, total) => {
  text(slide, {
    x: 0.6, y: 7.1, w: 9, h: 0.3,
    fontFace: 'Calibri', fontSize: 9, color: INK_FAINT,
  }, 'Niyamone Labs  x  Sree Diagnostics  -  Confidential client walkthrough');
  text(slide, {
    x: 12.0, y: 7.1, w: 0.9, h: 0.3,
    fontFace: 'Calibri', fontSize: 9, color: INK_FAINT, align: 'right',
  }, `${idx} / ${total}`);
};

const screenshot = (slide, name, x, y, w, h, caption) => {
  const file = path.join(SHOTS_DIR, name);
  if (fs.existsSync(file)) {
    rect(slide, x, y, w, h, WHITE, BRAND, 1.5);
    slide.addImage({ path: file, x, y, w, h });
  } else {
    rect(slide, x, y, w, h, WHITE, BRAND, 1.5);
    rect(slide, x + 0.08, y + 0.08, w - 0.16, h - 0.16, SURFACE_SUB, INK_FAINT, 0.75);
    text(slide, {
      x, y: y + h / 2 - 0.35, w, h: 0.35,
      fontFace: 'Calibri', fontSize: 13, bold: true, color: BRAND, align: 'center',
    }, `Drop screenshot:  ${name}`);
    text(slide, {
      x, y: y + h / 2, w, h: 0.3,
      fontFace: 'Calibri', fontSize: 10, color: INK_MUTED, align: 'center',
    }, `tools/sales-deck/screenshots/${name}`);
  }
  if (caption) {
    text(slide, {
      x, y: y + h + 0.05, w, h: 0.35,
      fontFace: 'Calibri', fontSize: 10, color: INK_MUTED, align: 'center', italic: true,
    }, caption);
  }
};

// ── Slide builders ────────────────────────────────────────────────────
function buildCover() {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, BRAND_DEEP);
  rect(s, 0, 5.6, SLIDE_W, 0.12, ACCENT);
  text(s, { x: 0.8, y: 0.7, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: ACCENT }, 'NIYAMONE LABS');
  text(s, { x: 0.8, y: 2.0, w: 12, h: 2.3, fontFace: 'Calibri', fontSize: 54, bold: true, color: WHITE },
    'The diagnostic-lab\noperating system,\nbuilt for India.');
  text(s, { x: 0.8, y: 5.0, w: 12, h: 0.5, fontFace: 'Calibri', fontSize: 20, color: WHITE },
    'Walkthrough for  -  Sree Diagnostics, Bengaluru');
  text(s, { x: 0.8, y: 6.4, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, color: INK_FAINT },
    'Confidential  -  Prepared for client visit  -  May 2026');
}

function buildValueProp(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND },
    'WHY WE ARE IN THIS ROOM');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 2.0, fontFace: 'Calibri', fontSize: 36, bold: true, color: INK },
    'Run every branch of Sree Diagnostics\nfrom one screen — and prove it on day one.');
  const chips = [
    ['FASTER',  'Report TAT cut by 40 %',         GOOD_FG],
    ['CLEANER', 'Zero paperwork at billing',      BRAND],
    ['SAFER',   'Every discount audit-trailed',   WARN_FG],
  ];
  chips.forEach(([k, v, c], i) => {
    const x = 0.6 + i * 4.1;
    rect(s, x, 4.0, 3.9, 2.4, WHITE, INK_FAINT, 0.5);
    pill(s, x + 0.3, 4.2, k, { fill: c, w: 1.1 });
    text(s, { x: x + 0.3, y: 4.9, w: 3.5, h: 1.6, fontFace: 'Calibri', fontSize: 22, bold: true, color: INK }, v);
  });
  footer(s, idx, total);
}

function buildProblem(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND }, 'THE PROBLEM');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 0.8, fontFace: 'Calibri', fontSize: 32, bold: true, color: INK },
    'What every 5-branch lab in India tells us.');
  const items = [
    ['63 %',    'of report errors trace back to manual transcription between paper, Excel, and the LIMS.'],
    ['3.4 hrs', 'lost per receptionist per day re-entering the same patient into 4 different systems.'],
    ['Rs 4.2L', 'average annual leakage from un-tracked cash-counter discounts and refunds.'],
  ];
  items.forEach(([stat, copy], i) => {
    const y = 2.8 + i * 1.35;
    rect(s, 0.6, y, 12.1, 1.2, WHITE, INK_FAINT, 0.5);
    text(s, { x: 0.9, y: y + 0.2, w: 2.4, h: 0.9, fontFace: 'Calibri', fontSize: 32, bold: true, color: BRAND }, stat);
    text(s, { x: 3.6, y: y + 0.3, w: 9.0, h: 0.8, fontFace: 'Calibri', fontSize: 16, color: INK_SOFT }, copy);
  });
  footer(s, idx, total);
}

function buildPromise(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND },
    'THE NIYAMONE PROMISE');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 1.8, fontFace: 'Calibri', fontSize: 36, bold: true, color: INK },
    'One login. Every branch.\nEvery workflow. Live data.');
  bullets(s, 0.6, 3.6, 5.8, 3.0, [
    'Reception, lab, billing, pharmacy, IPD — same app, same login.',
    'Branch switch in one click. No re-login. No data re-sync.',
    'Your data lives in your Supabase tenant — full export, any time.',
    'Indian-first: GST, TDS 194J, UHID, IFSC, PAN — built in, not bolted on.',
  ]);
  screenshot(s, '00-dashboard-hero.png', 6.8, 3.4, 6.0, 3.4,
    'Operational dashboard — one branch or all five, at a glance.');
  footer(s, idx, total);
}

function buildOutcomes(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND },
    'OUTCOMES YOU CAN MEASURE IN 90 DAYS');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 0.8, fontFace: 'Calibri', fontSize: 30, bold: true, color: INK },
    'We do not ship features. We ship outcomes.');
  const rows = [
    ['Metric',                 'Today',           'Day 90 with Niyamone'],
    ['Report turnaround time', '4.2 hrs avg',     'less than 2.5 hrs avg'],
    ['Manual reconciliation',  'Daily, 2 staff',  'Zero'],
    ['Untracked discount',     '~ Rs 35K / mo',   'Rs 0 (every discount approved)'],
    ['Branch reconciliation',  'End-of-week',     'Real-time'],
    ['Patient WhatsApp',       'Manual upload',   '1-click, signed PDF'],
  ];
  const baseY = 2.4;
  const colX  = [0.6, 5.4, 8.0];
  const colW  = [4.8, 2.6, 5.0];
  rows.forEach((row, i) => {
    const rh   = 0.55;
    const fill = i === 0 ? BRAND : (i % 2 ? WHITE : SURFACE_SUB);
    const fg   = i === 0 ? WHITE : INK;
    row.forEach((cell, j) => {
      rect(s, colX[j], baseY + i * rh, colW[j], rh, fill, INK_FAINT, 0.4);
      text(s, {
        x: colX[j] + 0.18, y: baseY + i * rh + 0.12, w: colW[j] - 0.2, h: rh,
        fontFace: 'Calibri', fontSize: i === 0 ? 14 : 13,
        bold: i === 0 || j > 0, color: fg,
      }, cell);
    });
  });
  footer(s, idx, total);
}

function buildROI(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND }, 'THE MATH');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 0.8, fontFace: 'Calibri', fontSize: 28, bold: true, color: INK },
    'Payback in under 5 months. Then it is pure margin.');
  const cards = [
    ['STATUS QUO / YEAR',  'Rs 8.6 L', '2 reconcilers + paper reports + leaked discounts + 3 disjoint tools.', BRAND_DEEP],
    ['NIYAMONE / YEAR',    'Rs 3.2 L', 'All-in licence, support, 2 training cycles, unlimited branches.',       BRAND],
    ['YEAR-1 SAVING',      'Rs 5.4 L', 'Plus reclaimed staff hours redeployed to revenue work.',               GOOD_FG],
  ];
  cards.forEach(([k, big, copy, c], i) => {
    const x = 0.6 + i * 4.25;
    rect(s, x, 2.6, 4.05, 3.4, WHITE, INK_FAINT, 0.5);
    rect(s, x, 2.6, 4.05, 0.6, c);
    text(s, { x: x + 0.25, y: 2.7,  w: 4,   h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: WHITE }, k);
    text(s, { x: x + 0.25, y: 3.4,  w: 4,   h: 1.0, fontFace: 'Calibri', fontSize: 44, bold: true, color: c },     big);
    text(s, { x: x + 0.25, y: 4.6,  w: 3.6, h: 1.4, fontFace: 'Calibri', fontSize: 12,            color: INK_MUTED }, copy);
  });
  text(s, { x: 0.6, y: 6.5, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 10, color: INK_FAINT },
    'Figures based on a 5-branch lab benchmark. Actual numbers co-modelled in week 1.');
  footer(s, idx, total);
}

function buildSectionDivider(idx, total, num, title, subtitle) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, BRAND_DEEP);
  rect(s, 0, 6.7, SLIDE_W, 0.08, ACCENT);
  text(s, { x: 0.5, y: 1.0, w: 5.5, h: 4.5, fontFace: 'Calibri', fontSize: 200, bold: true, color: BRAND }, num);
  text(s, { x: 5.5, y: 2.6, w: 7.5, h: 0.5, fontFace: 'Calibri', fontSize: 12, bold: true, color: ACCENT }, 'SECTION');
  text(s, { x: 5.5, y: 3.1, w: 7.5, h: 1.4, fontFace: 'Calibri', fontSize: 44, bold: true, color: WHITE }, title);
  text(s, { x: 5.5, y: 4.7, w: 7.5, h: 1.5, fontFace: 'Calibri', fontSize: 18, color: INK_FAINT }, subtitle);
  footer(s, idx, total);
}

function buildWalkthrough(idx, total, w) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 8, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND }, w.section);
  text(s, { x: 0.6, y: 1.0, w: 7.0, h: 1.5, fontFace: 'Calibri', fontSize: 26, bold: true, color: INK }, w.headline);
  bullets(s, 0.6, 2.7, 6.6, 3.0, w.bullets, { size: 15 });

  // green callout
  rect(s, 0.6, 5.8, 6.6, 1.0, WHITE, GOOD_FG, 1.5);
  pill(s, 0.8, 5.95, 'WHAT IT SAVES YOU', { fill: GOOD_FG, w: 1.95 });
  text(s, { x: 0.8, y: 6.4, w: 6.4, h: 0.4, fontFace: 'Calibri', fontSize: 13, bold: true, color: INK }, w.saves);

  screenshot(s, w.screenshot, 7.6, 1.0, 5.2, 4.8, w.caption);
  footer(s, idx, total);
}

function buildTrust(idx, total, t) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND }, t.section);
  text(s, { x: 0.6, y: 1.1, w: 12, h: 1.0, fontFace: 'Calibri', fontSize: 30, bold: true, color: INK }, t.headline);
  bullets(s, 0.6, 2.8, 6.6, 4.0, t.bullets, { size: 15 });
  screenshot(s, t.screenshot, 7.6, 2.6, 5.2, 3.6, t.caption);
  footer(s, idx, total);
}

function buildRollout(idx, total) {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, SURFACE);
  topBar(s);
  text(s, { x: 0.6, y: 0.6, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, bold: true, color: BRAND },
    'HOW WE ROLL THIS OUT');
  text(s, { x: 0.6, y: 1.1, w: 12, h: 0.8, fontFace: 'Calibri', fontSize: 28, bold: true, color: INK },
    'Three phases. Fixed milestones. You sign off each one.');
  const phases = [
    ['PHASE 1', 'Weeks 1–3', 'Tenant set-up, master data, lab + billing live at branch HQ.',
      'Go-live: first invoice + first signed report from Niyamone.'],
    ['PHASE 2', 'Weeks 4–6', 'Rest of the branches onboarded, pharmacy + home collection on.',
      'Go-live: all branches live, WhatsApp delivery on.'],
    ['PHASE 3', 'Weeks 7–9', 'Doctor payouts, smart-inbox approvals, dashboards, training.',
      'Go-live: monthly close run end-to-end inside Niyamone.'],
  ];
  phases.forEach(([k, when, scope, exit_], i) => {
    const x = 0.6 + i * 4.25;
    rect(s, x, 2.6, 4.05, 4.1, WHITE, INK_FAINT, 0.5);
    rect(s, x, 2.6, 4.05, 0.7, BRAND);
    text(s, { x: x + 0.25, y: 2.7,  w: 4,   h: 0.4,  fontFace: 'Calibri', fontSize: 12, bold: true, color: WHITE }, k);
    text(s, { x: x + 0.25, y: 3.0,  w: 4,   h: 0.35, fontFace: 'Calibri', fontSize: 11, bold: true, color: ACCENT }, when);
    text(s, { x: x + 0.25, y: 3.6,  w: 3.6, h: 1.4,  fontFace: 'Calibri', fontSize: 14, color: INK_SOFT }, scope);
    pill(s, x + 0.25, 5.2, 'EXIT CRITERIA', { fill: GOLD, fg: INK, w: 1.6 });
    text(s, { x: x + 0.25, y: 5.65, w: 3.6, h: 1.0, fontFace: 'Calibri', fontSize: 12, bold: true, color: INK }, exit_);
  });
  footer(s, idx, total);
}

function buildClose() {
  const s = pptx.addSlide();
  rect(s, 0, 0, SLIDE_W, SLIDE_H, BRAND_DEEP);
  rect(s, 0, 0,    SLIDE_W, 0.12, ACCENT);
  text(s, { x: 0.8, y: 0.8, w: 12, h: 0.5, fontFace: 'Calibri', fontSize: 14, bold: true, color: ACCENT }, 'TODAY WE AGREE');
  text(s, { x: 0.8, y: 1.4, w: 12, h: 1.8, fontFace: 'Calibri', fontSize: 44, bold: true, color: WHITE },
    'Three signatures. Nine weeks to live.');
  const boxes = [
    ['1. Scope locked',  'Phases, branches, integrations.',     'Sign-off by:  ___________________'],
    ['2. Commercials',   'Licence + implementation + support.', 'Sign-off by:  ___________________'],
    ['3. Kick-off date', 'Week 1 starts Monday.',               'Date:          ___________________'],
  ];
  boxes.forEach(([k, sub, sig], i) => {
    const x = 0.8 + i * 4.2;
    rect(s, x, 3.4, 4.0, 3.0, WHITE, ACCENT, 1.5);
    text(s, { x: x + 0.25, y: 3.55, w: 3.7, h: 0.5, fontFace: 'Calibri', fontSize: 18, bold: true, color: BRAND }, k);
    text(s, { x: x + 0.25, y: 4.1,  w: 3.7, h: 0.9, fontFace: 'Calibri', fontSize: 13, color: INK_MUTED }, sub);
    text(s, { x: x + 0.25, y: 5.4,  w: 3.7, h: 0.9, fontFace: 'Calibri', fontSize: 12, color: INK }, sig);
  });
  text(s, { x: 0.8, y: 6.8, w: 12, h: 0.4, fontFace: 'Calibri', fontSize: 11, color: INK_FAINT },
    'Venkki M. K.  -  Niyamone Labs  -  venkki.mk@niyamone.com');
}

// ── Content ────────────────────────────────────────────────────────────
const WALKTHROUGH = [
  { section: 'ACT III  -  01 / 13  -  LOGIN',
    headline: 'Role-based login — same app, scoped to each user.',
    bullets: [
      'JWT carries staff_id + branch_id + role; nothing is trusted from the URL.',
      'Super-admin sees all branches; branch-admin sees one; reception sees their own queue.',
      'Inactive staff are blocked at the auth layer, not at the screen.',
    ],
    screenshot: '01-login.png',
    caption:    'Reception logs in once, lands on her branch — never sees the other four.',
    saves:      'Zero accidental cross-branch edits. Every action is name-stamped.' },
  { section: 'ACT III  -  02 / 13  -  DASHBOARD',
    headline: 'One screen — every KPI, every branch.',
    bullets: [
      'Revenue, TAT, pending verifications, category share — live.',
      'Branch slicer at the top reshapes every tile in <200 ms.',
      'Export to PDF matches the on-screen design — pixel-for-pixel.',
    ],
    screenshot: '02-dashboard.png',
    caption:    'Owner sees the day at 8 AM; does not need to call anyone.',
    saves:      'End-of-day reconciliation goes from 45 min to instant.' },
  { section: 'ACT III  -  03 / 13  -  PATIENTS',
    headline: 'Register a patient in under 20 seconds.',
    bullets: [
      'Duplicate guard on mobile + name + DOB combo — no UHID drift.',
      'Address book reused across home collection and report delivery.',
      'Gender defaults to Male so reception can tab through and hit Save.',
    ],
    screenshot: '03-patient-register.png',
    caption:    'New patient, UHID, mobile, address — one screen, one save.',
    saves:      'A 4-minute paper form becomes a 20-second tap-through.' },
  { section: 'ACT III  -  04 / 13  -  APPOINTMENTS',
    headline: 'Home collection that does not lose Rs 250.',
    bullets: [
      'Pickup surcharge auto-added to the invoice — editable + discountable.',
      'Address captured once, reused on report + WhatsApp share.',
      'Scheduled-at time shows on the invoice visit-details block.',
    ],
    screenshot: '04-home-collection.png',
    caption:    'Surcharge is a line item, not a sticky note on the cash register.',
    saves:      'Eliminates the most common cause of cash leakage in home collection.' },
  { section: 'ACT III  -  05 / 13  -  BILLING',
    headline: 'Invoice that knows where every line came from.',
    bullets: [
      'Lab, pharmacy, doctor, IPD, manual — each line tagged with provenance.',
      'GST + discount tiers + payment + balance — all on one screen.',
      'WhatsApp share with public link + auto-print on the patient phone.',
    ],
    screenshot: '05-billing-invoice.png',
    caption:    'Every paisa traces back to a clinical action. No mystery charges.',
    saves:      'Audit-ready billing the first day you go live.' },
  { section: 'ACT III  -  06 / 13  -  SMART INBOX',
    headline: 'No discount goes through unapproved.',
    bullets: [
      'Tiered: auto / branch-admin / super-admin — based on the percentage.',
      'Submitted requests appear in the approver Smart Inbox in real time.',
      'Approval, rejection, and apply-error are all audit-trailed.',
    ],
    screenshot: '06-smart-inbox.png',
    caption:    'Discount approval becomes a 30-second chat, not a phone call.',
    saves:      'Plugs the single biggest revenue leak at the cash counter.' },
  { section: 'ACT III  -  07 / 13  -  LAB WORKFLOW',
    headline: 'Accession to sample to result to verify to report.',
    bullets: [
      'One queue per stage. Items cannot skip stages.',
      'Critical alerts surface immediately to the doctor on duty.',
      'Verifier sign-off captured via uploaded digital signature.',
    ],
    screenshot: '07-lab-workflow.png',
    caption:    'Lab tech, pathologist, doctor — same workflow, three perspectives.',
    saves:      'TAT visibility turns from a guess into a real-time number.' },
  { section: 'ACT III  -  08 / 13  -  LAB REPORT PDF',
    headline: 'The Sree Diagnostics letterhead — pixel-perfect.',
    bullets: [
      'Header, footer, accreditations, seals, watermark — all configurable.',
      'QR code on the footer points to a verifiable public URL.',
      'Filename is PatientName_DD-MMM-YYYY_UHID — searchable in WhatsApp.',
    ],
    screenshot: '08-lab-report-pdf.png',
    caption:    'The exact PDF you sent us — generated in two clicks.',
    saves:      'Brand consistency across every report, every branch, every device.' },
  { section: 'ACT III  -  09 / 13  -  PHARMACY',
    headline: 'Dispense, indent, GRN — all in flow.',
    bullets: [
      'Stock-aware dispensing — will not sell what is not on the shelf.',
      'Expiry guard at dispense time — flagged in red.',
      'Sales auto-flow to the invoice with HSN + GST.',
    ],
    screenshot: '09-pharmacy.png',
    caption:    'Pharmacy is no longer a parallel universe; it is part of the bill.',
    saves:      'Stops the daily pharmacy-vs-billing tally meeting.' },
  { section: 'ACT III  -  10 / 17  -  IPD / WARDS',
    headline: 'Bed map, doctor visits, consolidated bill.',
    bullets: [
      'Bed assignments time-tracked for accurate per-day billing.',
      'Doctor visits roll up into the same invoice the lab uses.',
      'Discharge produces one PDF: bill + summary + reports.',
    ],
    screenshot: '10-ipd.png',
    caption:    'One discharge — one PDF — one signature.',
    saves:      'Discharge bottleneck disappears.' },
  { section: 'ACT III  -  11 / 17  -  HR  ·  STAFF',
    headline: 'One staff directory for every branch.',
    bullets: [
      'Onboard, role-assign, branch-scope, and de-activate from one screen.',
      'PAN, UAN, IFSC, signature, photo — all stored against the staff record.',
      'Role permissions cascade automatically — no manual ACL editing.',
    ],
    screenshot: '17-hr-staff.png',
    caption:    'HR adds a new technician; she can log in and accession by lunch.',
    saves:      'Onboarding goes from a 2-day form-shuffle to 15 minutes.' },
  { section: 'ACT III  -  12 / 17  -  HR  ·  ATTENDANCE',
    headline: 'Daily attendance — no biometric vendor required.',
    bullets: [
      'Self check-in/out from the same app each staff uses to work.',
      'Late-mark and short-shift rules driven by the shift master.',
      'Daily / weekly / monthly views feed straight into payroll.',
    ],
    screenshot: '18-hr-attendance.png',
    caption:    'Reception checks in at 8:58 AM; row appears live on the manager view.',
    saves:      'Manual muster register is gone. Payroll reads attendance directly.' },
  { section: 'ACT III  -  13 / 17  -  HR  ·  LEAVE & SHIFTS',
    headline: 'Leaves and shift rosters in one place.',
    bullets: [
      'CL / SL / PL balances tracked per employee, per year.',
      'Leave requests route to the right approver via Smart Inbox.',
      'Shift master defines templates; rosters generated for any week.',
    ],
    screenshot: '19-hr-leave-shifts.png',
    caption:    'Apply leave, approve in one click — balance updates instantly.',
    saves:      'Leave reconciliation at year-end ceases to be a spreadsheet event.' },
  { section: 'ACT III  -  14 / 17  -  PAYROLL  ·  STAFF SALARY',
    headline: 'Monthly salary run — attendance to bank, in minutes.',
    bullets: [
      'Pulls attendance + leaves + shift overtime automatically.',
      'CTC components, PF, ESI, PT, TDS — all Indian-statutory aware.',
      'Generates Form-16 ready payslips with branch letterhead.',
    ],
    screenshot: '20-payroll-salary.png',
    caption:    'Month-end payroll for 30 staff, one button, audit-ready.',
    saves:      'Replaces the external payroll vendor and their per-staff fee.' },
  { section: 'ACT III  -  15 / 17  -  PAYROLL  ·  DOCTOR PAYOUTS',
    headline: 'Doctor payouts the Indian way — TDS 194J built in.',
    bullets: [
      'Earnings + deductions side-by-side; TDS Section 194J auto-calculated.',
      'Amount-in-words in Lakhs / Crores — auditor-friendly.',
      'Lab header, branch address, GST — same letterhead as the report.',
    ],
    screenshot: '11-doctor-payslip.png',
    caption:    'Payslip for a consultant takes 6 seconds, not 6 minutes.',
    saves:      'Month-end consultant payouts cease to be a spreadsheet rodeo.' },
  { section: 'ACT III  -  16 / 17  -  REPORTS',
    headline: 'On-screen and on-paper — identical.',
    bullets: [
      'Category share, revenue trend, branch drill — all interactive.',
      'PDF export uses the same DOM, not a separate template.',
      'Date range, branch, category — three controls, no SQL.',
    ],
    screenshot: '12-reports.png',
    caption:    'What you see is what you print — full stop.',
    saves:      'No more "why does the PDF look different from the screen?"' },
  { section: 'ACT III  -  17 / 17  -  SETTINGS',
    headline: 'Your brand, your seals, your instructions.',
    bullets: [
      'Logo, accreditations, watermark, footer seals — all uploadable.',
      'Instructions per test / per branch / global — cascades intelligently.',
      'Per-staff digital signature stored once, used everywhere.',
    ],
    screenshot: '13-settings.png',
    caption:    'The branding does not need a developer; reception can change it.',
    saves:      'Re-branding moments (new NABL cert, new address) take 5 minutes.' },
];

const TRUST = [
  { section: 'ARCHITECTURE',
    headline: 'Your data lives in your tenant.',
    bullets: [
      'Angular 21 frontend, Supabase backend, RLS per table.',
      'All writes go through SECURITY DEFINER RPCs — no rogue UPDATEs possible.',
      'Database snapshots are yours, exportable on demand, in standard Postgres dump.',
      'No vendor lock-in: walk away with a .sql file.',
    ],
    screenshot: '14-architecture.png',
    caption:    'Schema diagram — every table owned by the client Supabase project.' },
  { section: 'SECURITY & COMPLIANCE',
    headline: 'Row-level security, not screen-level pretending.',
    bullets: [
      'Postgres RLS gates every read and write by branch + role.',
      'JWT custom claims (app_metadata) carry the role — tamper-proof.',
      'Audit trail on every exception (discounts, voids, refunds).',
      'Storage buckets for PDFs are private with signed URLs.',
    ],
    screenshot: '15-security.png',
    caption:    'RLS policies block cross-branch reads at the database, not the UI.' },
  { section: 'MULTI-BRANCH',
    headline: 'Switch branches in one click — no relogin.',
    bullets: [
      'BranchStore is reactive; every screen reshapes on switch.',
      'Realtime channels keep dashboards live across all branches.',
      'Reports and exports stamp the active branch in the footer.',
    ],
    screenshot: '16-multi-branch.png',
    caption:    'Top-bar branch switcher — propagates to every page instantly.' },
];

// ── Build ─────────────────────────────────────────────────────────────
const TOTAL = 31;
buildCover();
buildValueProp(2,  TOTAL);
buildProblem(3,    TOTAL);
buildPromise(4,    TOTAL);
buildOutcomes(5,   TOTAL);
buildROI(6,        TOTAL);
buildSectionDivider(7, TOTAL, '01', 'The walkthrough.',
  'Seventeen screens. The entire lab in one application.');
let n = 8;
for (const w of WALKTHROUGH) { buildWalkthrough(n++, TOTAL, w); }
buildSectionDivider(n++, TOTAL, '02', 'Built for trust.',
  'Architecture, security, and the multi-branch reality.');
for (const t of TRUST) { buildTrust(n++, TOTAL, t); }
buildRollout(n++, TOTAL);
buildClose();

await pptx.writeFile({ fileName: OUT_PATH });
console.log(`OK  Deck written: ${OUT_PATH}`);
console.log(`    Slides: ${n}`);
console.log(`    Drop screenshots into: ${SHOTS_DIR}`);
