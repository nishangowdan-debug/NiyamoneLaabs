# Screenshots checklist — Sree Diagnostics walkthrough deck

Capture each shot at **1920 × 1080** (or your laptop's native 16:9), then save
into `tools/sales-deck/screenshots/` using **exactly** these filenames.
Re-run `python tools/sales-deck/build_deck.py` and the deck picks them up.

> Tip: use the browser's device toolbar (Ctrl+Shift+M in Chrome → "Responsive"
> → 1920 × 1080) for consistent framing across all shots.

| # | File                              | What to capture |
|---|-----------------------------------|-----------------|
| 0 | `00-dashboard-hero.png`           | Dashboard with the "All branches" slicer, a couple of tiles, and the revenue chart visible. |
| 1 | `01-login.png`                    | Login page with the Sree Diagnostics branding and the "Sign in" button. |
| 2 | `02-dashboard.png`                | Full dashboard — pending verifications tile, TAT, category share donut. |
| 3 | `03-patient-register.png`         | Patient registration form filled with a sample patient (UHID auto-generated, gender = Male). |
| 4 | `04-home-collection.png`          | Home-collection create form with surcharge ₹250 visible and tests selected. |
| 5 | `05-billing-invoice.png`          | An open invoice detail dialog showing line items + Visit-details block + Apply discount button. |
| 6 | `06-smart-inbox.png`              | Smart Inbox with at least one pending discount approval (the one we just enabled). |
| 7 | `07-lab-workflow.png`             | Lab workflow page with Accession / Sample / Result / Verify tabs and a few rows. |
| 8 | `08-lab-report-pdf.png`           | The Sree Diagnostics PDF preview — header, results table, footer with QR + seals. |
| 9 | `09-pharmacy.png`                 | Pharmacy dispense queue with a few in-flight indents. |
| 10| `10-ipd.png`                      | IPD bed map or admissions screen (skip if IPD isn't in this demo). |
| 11| `11-doctor-payslip.png`           | The generated Indian-format payslip with TDS 194J row and amount-in-words. |
| 12| `12-reports.png`                  | The analytics page — category share + revenue trend. |
| 13| `13-settings.png`                 | Settings page on the Branding tab with logo, seals, and accreditations visible. |
| 14| `14-architecture.png`             | (Optional) A simple diagram — Angular → Supabase → RLS. Or skip; the placeholder is fine. |
| 15| `15-security.png`                 | (Optional) Supabase RLS policies page, or a screenshot of the JWT decoded in jwt.io. |
| 16| `16-multi-branch.png`             | Top-bar branch switcher open, showing the 5 branches. |

## How to swap a placeholder in PowerPoint
1. Open the generated `.pptx`.
2. Right-click the dashed placeholder → **Change Picture → From File** → pick your screenshot.
3. PowerPoint preserves the frame, border, and caption.

## How to capture cleanly
- Hide your bookmark bar (Ctrl+Shift+B in Chrome).
- Use a Chrome profile with **no extensions** in the toolbar.
- Demo data: log in as `nagrajdbff@gmail.com` (super_admin) — the seeded patients
  give every screen a healthy "live" feel.
- If a screen has the user's real email visible, blur it in PowerPoint after
  inserting (Format Picture → Artistic Effects → Blur).
