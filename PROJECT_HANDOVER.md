# Sree Diagnostics — Project Handover

End-to-end implementation notes for the lab-information-system frontend running at
**Sree Diagnostics — Vijayawada (HQ)**, branch code `SDX01`. Backed by Supabase
(Postgres + PostgREST + Edge Functions). Document covers everything changed or
added in the latest engagement so the next engineer can pick up immediately.

---

## 1. Project overview

A multi-branch lab management system for an Indian diagnostic chain (NABL/ISO
9001:2015 certified, CLSI-aligned). One Angular SPA covers:

- Patient registration + chart
- Lab orders, sample workflow, results entry, verification, reporting
- Outsource (reference lab) dispatch
- Home sample collection
- Billing + invoices (inline discount + payment in one flow)
- Operational reports (24 exportable views)
- HR — activity-driven attendance, payroll, doctor commissions
- Roles & permissions (Settings → Roles)

Default tenant in production: **Sree Diagnostics — Vijayawada**.
Demo branches retained for testing: Delhi NCR, Bengaluru, Chennai, Hyderabad
(soft-disabled).

---

## 2. Branding

Replaced the placeholder "Srinivasa Hospital" branding across the UI with
**Sree Diagnostics**:

| File | Change |
|---|---|
| `src/app/layouts/app-layout/topbar/topbar.ts` | brand mark + small caption |
| `src/app/layouts/auth-layout/auth-layout.ts` | login art panel |
| `src/app/features/auth/pages/login.page.ts` | "Sign in to continue to Sree Diagnostics" |
| `src/app/features/patient-qr/pages/*.ts` | QR public pages |
| `src/app/features/patients/pages/patients-list.page.ts` | header tagline |
| `src/app/features/opd-queue/pages/opd-queue-tv.page.ts` | TV display |
| `src/app/features/settings/pages/settings.page.ts` | placeholder |
| `src/app/app.routes.ts` + `patient-qr.routes.ts` | route titles |
| `src/app/shared/export/export.types.ts` | comment example |
| `src/app/layouts/app-layout/topbar/branch-switcher.ts` | label regex (now strips "Sree Diagnostics — ") |

The full branch identity lives in `hospital_settings` (per branch). Reports and
invoices pull the name, tagline, address, phone, email, website, GSTIN, and
accreditations from that row at render time.

---

## 3. Tech stack

- **Frontend**: Angular 20 standalone components, TypeScript strict, Tailwind,
  Lucide icons. State via Angular Signals.
- **Backend**: Supabase (Postgres 15, PostgREST, Auth, Edge Functions, Storage).
- **Build**: `npm run build` (esbuild), `ng serve` for dev.
- **Tooling**: `npx tsc --noEmit -p tsconfig.app.json` for type-check.

---

## 4. Database

### 4.1 Migrations applied this session

Files in `db/migrations/` (and applied via Supabase MCP):

| Migration | Purpose |
|---|---|
| `20260516_sree_diagnostics_branch.sql` | Seed `SDX01` branch + `hospital_settings` (Sree address, phone, email, accreditations, lab-report template = 'sree') + pathologist & lab tech staff |
| `audit_fixes_staff_dept_saved_searches_lab_prices` (MCP) | Added `staff_departments.is_primary`, created `saved_searches` table + RLS, added `lab_test_prices.price_inr/home_collection_eligible/surcharge_inr` + sync trigger keeping `price_cents` in step, added `lab_tests.default_routing` |
| `mirror_lab_tests_into_services` (MCP) | Trigger that copies `lab_tests` → `services` so the billing dropdown sees every test |
| `dedupe_doctor_commission_rules` (MCP) | Collapsed 50 per-branch rule rows into 10 global rules + unique index |
| `hr_attendance_and_payroll_schema` (MCP) | `staff_activity_log`, `staff_attendance`, `leave_requests`, `shift_swaps`, `salary_structures`, `payroll_runs`, `salary_payments`, `doctor_payouts` |
| `hr_attendance_triggers_and_rpcs` (MCP) | Activity-log trigger function + per-table triggers + `attendance_check_in/out`, `attendance_set_status` RPCs |
| `hr_payroll_rpcs_only` (MCP) | `fn_compute_payroll`, `fn_approve_payroll`, `fn_pay_payroll`, `fn_compute_doctor_payout`, `fn_pay_doctor_payout` |
| `doctor_commission_rules_and_payout_items` (MCP) | Commission-rules table + per-payout line items + `fn_resolve_doctor_commission` + rewritten `fn_compute_doctor_payout` |
| `doctor_referrals_summary_rpc` (MCP) | `fn_doctor_referrals_summary(branch, from, to)` for both /payroll/doctors and the dashboard card |
| `hr_rls_with_check_for_inserts` + `hr_rls_uid_fallback` (MCP) | RLS policies on all HR tables get `WITH CHECK` AND a `staff.role_slug` fallback so writes work even if the JWT user_role claim is missing |
| `patients_full_demographics_schema` (MCP) | Added 11 demographic columns to `patients` + auto-UHID + full_name triggers |

### 4.2 Key tables

- `branches` — per-branch identity (code, name, address, GSTIN, prescription header)
- `hospital_settings` — branding + report layout (one row per branch_id)
- `staff` + `staff_branches` + `staff_departments` — multi-branch staff with one primary dept
- `patients` — full demographics; auto-fills `uhid = NIY######` and `full_name`
- `lab_tests` + `lab_test_prices` — master catalog + per-branch pricing
- `services` — billing catalog, auto-mirrored from `lab_tests` via trigger
- `invoices` + `invoice_items` + `payments`
- `lab_orders` + `lab_results` + `lab_critical_alerts`
- `reference_labs` + `reference_lab_dispatches` — outsource workflow
- `home_collection_requests` + `home_collection_items`
- `staff_activity_log` (append-only) + `staff_attendance` (daily rollup)
- `leave_requests` + `shift_swaps`
- `salary_structures` + `payroll_runs` + `salary_payments`
- `doctor_commission_rules` + `doctor_payout_items` + `doctor_payouts`

### 4.3 RLS pattern

All HR-write policies use this resilient pattern so they work whether or not
the custom-access-token hook is enabled:

```sql
using      (public.fn_current_staff_role() in (...allowed roles...))
with check (public.fn_current_staff_role() in (...allowed roles...))
```

`fn_current_staff_role()` reads `auth.jwt() ->> 'user_role'` first and falls
back to a `SELECT role_slug FROM staff WHERE user_id = auth.uid()` lookup.

---

## 5. Frontend features

### 5.1 Lab Reports — selector + 24 reports (`/lab-reports`)

`src/app/features/lab-reports/`

Replaced the old dashboard-style page with a simple selector:
- Report dropdown grouped by workflow stage
- From / To date pickers + presets (Today, 7d, MTD, 90d)
- Format dropdown: **PDF · CSV · Excel**
- Single Export button

Catalog service `data/lab-report-catalog.service.ts` declares every report
with typed row shape, `ExportColumn[]`, and a Supabase fetcher. Stages:

| Stage | Reports |
|---|---|
| Registration | Lab Order Register |
| Sample collection | Collection Log · Pending Collection Queue · Sample Rejection Register |
| Home collection | Requests · Test Line Items |
| Processing | Test Results Register · Pending Result Entry · Pending Verification |
| Critical alerts | Critical Result Register · Critical Alert Acknowledgement Log |
| Outsource | Outsource Dispatch Register · Overdue Tracker · Reference Lab Master |
| Reporting | Final Reports Released · Per-Order TAT Breakdown |
| **Billing** | Invoice Register · Invoice Line Items · Payments Register · Outstanding Receivables · Daily Revenue Summary · Voids & Refunds |
| Master data | Lab Test Catalog |

All exports route through `shared/export/export.service.ts` → CSV (RFC-4180) or
Excel (ExcelJS, lazy-loaded) or PDF (print iframe). Headers carry branch
label, period, generated-by metadata from `ExportService.contextMeta()`.

### 5.2 Attendance + payroll (`/attendance`, `/payroll/salary`)

**Activity-driven attendance** — no badges, no biometric. A Postgres trigger on
the tables below appends to `staff_activity_log`. Once a staff hits **3
mutations in the same IST day**, the daily `staff_attendance` row auto-flips to
`present`.

Tracked tables: `invoices`, `payments`, `lab_results` (entered + verified),
`lab_orders` (create/collect/report), `home_collection_requests`, `patients`.

HR can override via `attendance_set_status` RPC (sets `is_override = true`, so
the auto-flip never undoes it).

**Payroll**:
- `salary_structures` — per-staff CTC + Basic/HRA/Conv/Special breakdown +
  PF %, ESI %, PT cents, TDS %.
- `fn_compute_payroll(branch, year, month)` walks active staff, picks the
  effective structure, counts (present + paid leaves), computes LOP = `(CTC ÷
  days_in_month) × LOP_days`, applies statutory deductions, writes one
  `salary_payments` row per staff.
- `fn_approve_payroll` → `fn_pay_payroll` finalises and stamps `paid_at`.

**Payslip PDF** — `src/app/features/payroll/services/payslip-pdf.service.ts`.
Indian two-column earnings/deductions layout, net pay in figures + lakh/crore
words ("Rupees Fourteen Thousand only"). Uses `hospital_settings` for the Sree
header (name, tagline, address, phone, email, website, GSTIN).

**Doctors are excluded from staff salary** — the `Salary structures` table
filters out `role_slug='doctor'` and shows a callout linking to Doctor Payouts.

### 5.3 Doctor commission system (`/payroll/doctors`)

Lab doctors get **no fixed salary** — they earn a % per referred test. Three
rule scopes (most specific wins): `test > category > default`.

- `doctor_commission_rules` — per-doctor rate. `branch_id = NULL` means
  network-wide. Unique index prevents per-branch duplication.
- `fn_compute_doctor_payout(branch, doctor, from, to, tds%)` — walks
  `lab_orders + lab_results`, looks up the catalog price + resolved rule,
  writes a `doctor_payout_items` audit row per test, sums to `doctor_payouts`.

UI surfaces:
- **Live referral activity** card with Day / Week / Month toggle.
- **Commission rules editor** with dropdown-driven category and test pickers.
- **Per-test bulk editor modal** — opens the full catalog with editable
  per-test rates, "Fill empty with X%" helper, live "earns" column.
- **Breakdown drawer** per payout — every test, price, %, rule that fired.
- **Indian-format payslip PDF** for the doctor.

### 5.4 Dashboard "Top referring doctors" card (`/dashboard`)

Sync'd to the same RPC. Primary-gradient card, top-5 horizontal bars, patient
count + tests + gross + commission per doctor, period follows the dashboard
toggle. Links to `/payroll/doctors`.

### 5.5 Combined New Invoice modal (`/billing`)

`src/app/features/billing/pages/billing.page.ts`

The old "Generate invoice → close → reopen Pay modal → record cash" four-step
flow has been collapsed into one window:

- Width bumped to `max-w-[1040px]`, padding `p-6`.
- New checkbox **"Collect cash & close invoice now"** — ON by default.
- When ticked, the modal exposes:
  - **Inline discount** (visible only to roles with `discount.apply` permission):
    rupee field, 5/10/15/20% quick chips, reason field. Live recap card.
  - **Amount / Method / Reference** fields.
- One **"Generate & collect"** button runs:
  1. `create_invoice` RPC
  2. `pushInvoiceToLab` (auto-routes lab lines)
  3. Insert `home_collection_requests` row if Home collection is enabled
  4. `apply_invoice_discount_internal` if discount > 0
  5. `recordPayment` if amount > 0
  
  Discount failure aborts the payment to avoid stale-balance collection. If
  steps 4/5 fail after the invoice exists, the standalone Pay modal opens as a
  fallback so the cashier can retry.

Combined toasts:
- "Invoice + discount + payment recorded — Disc ₹X · Paid ₹Y · Cash"
- "Invoice + full waiver — Discount ₹X · balance cleared"
- "Invoice + payment recorded — Paid ₹X · Cash"

Cashiers can uncheck "Collect cash now" to fall back to the deferred-pay flow.

### 5.6 Inline discount in standalone Pay modal

Same fields as above, gated by the `discount.apply` permission. Expanded by
default for cashier visibility. Allows full waiver (≥ subtotal) — reason
captured as `apply_invoice_discount_internal` argument.

### 5.7 Home sample collection — single editable row

When the cashier ticks **Home sample collection** in the New Invoice modal, a
single cyan-tinted **"PICKUP"** row appears at the bottom of Line Items. ONE
flat pickup fee per invoice (Amazon-style), priced at `MAX(per-test
home_collection_surcharge_inr)` so adding more tests doesn't multiply it.

- Sticky manual price — once the cashier edits the price, auto-recompute stops
  for that row.
- Untick the checkbox or click Remove → row vanishes and the toggle flips back
  to off in lock-step.
- Subtitle shows scheduled pickup time, city + pincode, "Phlebotomist TBD".
- Always sorted **last** in line-items both in the modal and the printed
  invoice (`withPickupLast()` helper applied in `addLine`, `syncPickupRow`,
  and at submit time).

### 5.8 Patient registration — age OR DOB (`/patients/register`)

`src/app/features/patients/pages/patient-register.page.ts`

Rural India reality — many patients know their age, not their birth date. The
DOB field is now paired with an **Age** input separated by "or". Either is
sufficient.

Age → DOB conversion uses `today.year - age` with **July 1** as the day so the
calendar age stays stable year-round. Stored DOB shows "(from age)" in the
review step.

### 5.9 CSV patient import (`/patients`)

Hidden file input + "Import CSV" button + "sample" download. Parser is
RFC-4180-ish (handles quoted cells, escaped quotes, BOM). 22 columns
recognised; required: `first_name`, `last_name`, `mobile`, and either
`date_of_birth` or `age`. Inserts each row via `PatientsService.create()`,
emits a toast with `imported / skipped / errors` counts (full per-row reasons
logged to console).

### 5.10 Modal close behaviour — sweep

`(click)="closeXxx()"` was removed from every backdrop (~90 instances across
63 files). Replaced with `(document:keydown.escape)="closeXxx()"`. Modals now
close only on:

- ✕ button
- Cancel button
- Successful Save (where the handler closes explicitly)
- Esc key

Clicking outside does nothing — no more lost form data. Six in-modal save
handlers that were updating data in place (saveResponse, saveTriage,
submitSelf, submitManager, saveControls) now also call `closeDetail()` on
success.

Dropdowns and popovers (command palette, saved-search button) retain
click-outside dismissal — those are intentionally different.

### 5.11 Roles & permissions changes

The legacy tiered discount permission was replaced with a single flat toggle
`discount.apply`. Granted by default to `super_admin`, `branch_admin`,
`accountant`, `reception`. Visible/toggleable in Settings → Roles &
permissions for any role (table is data-driven from `permissions`).

### 5.12 Services dedup

The `services` table previously contained two rows for every lab test (the
legacy `DASH-*` demo seed + the clean codes from the `lab_tests → services`
mirror trigger). Soft-deleted the 8 DASH-* lab/imaging duplicates that had
clean twins; renamed the 7 remaining DASH-* codes to drop the prefix
(`DASH-CT → CT-BRAIN`, `DASH-OPD → OPD`, etc.). Historical invoices still
resolve via `service_id` FK.

Final lab/imaging picker shows **16 distinct codes**, one row each.

---

## 6. Permissions model

Permissions catalog (`public.permissions`) is data-driven. `role_permissions`
joins each role slug to permission slugs. UI auto-builds the matrix in Settings
→ Roles & permissions.

Notable additions during this engagement:

| Slug | Description | Default roles |
|---|---|---|
| `discount.apply` | Apply discount on invoice (reason required) | super_admin, branch_admin, accountant, reception |
| `holidays.read` | Used to gate the `/attendance` page | every internal role |
| `ap.write` | Gates payroll edits | super_admin, branch_admin, accountant |
| `staff.read` | HR-only | super_admin, branch_admin, hr |

Sidebar entries respect `roles?: RoleSlug[]` on each `NavItem` and hide the
section header when all items are filtered out.

---

## 7. Open issues / next steps

These were flagged during audit but are not yet addressed end-to-end:

1. **Apply the latest migration file**:
   `db/migrations/20260516_sree_diagnostics_branch.sql` — already applied
   directly via MCP in production, but the file is the canonical record for
   any future fresh-clone setup.
2. **Upload Sree logo + pathologist & lab tech signatures** via Settings →
   Branding / Staff so the lab-report PDF carries them.
3. **Smoke test** a real end-to-end flow on each branch: register → order →
   collect → result → verify → report → invoice → pay → payslip.
4. **`staff_attendance` rollup recompute** — currently the rollup is updated
   live by triggers. Consider a nightly `pg_cron` refresh to backstop any
   missed events.
5. **Apply latest migrations** on staging / DR replicas if any exist.

---

## 8. How to run

```bash
# install
npm ci

# dev server (localhost:4200)
npm run start
# or: ng serve

# type-check only
npx tsc --noEmit -p tsconfig.app.json

# production build
npm run build
```

Supabase project URL + anon key live in `src/environments/`. The custom
access-token hook should be enabled in **Supabase Dashboard → Authentication
→ Hooks** (function: `public.custom_access_token_hook`). The HR-write
policies have a fallback path so missing JWT claims won't lock everyone out,
but the hook is still recommended for performance.

---

## 9. Repository layout (high level)

```
src/app/
├── core/                 # auth, supabase, branches, logging, messaging
├── shared/               # ui kit, export (CSV/Excel/PDF adapters), validators
├── layouts/              # app-layout (sidebar/topbar), auth-layout, patient-portal-layout
└── features/
    ├── attendance/       # roster + leave management
    ├── billing/          # invoices + combined New Invoice modal
    ├── dashboard/        # KPIs, charts, "Top referring doctors" card
    ├── lab/              # workflow, references, QC, reports
    ├── lab-catalog/      # tests + per-branch pricing editor
    ├── lab-reports/      # 24-report exporter (PDF/CSV/Excel)
    ├── patients/         # registry, age-or-DOB form, CSV import
    ├── payroll/          # staff salary, doctor payouts, commission rules
    ├── settings/         # hospital identity, services, roles & permissions
    └── ... (smart-inbox, ipd-beds, nursing, ot, ed, blood-bank, etc.)
db/
└── migrations/           # canonical SQL files (also applied via MCP in prod)
```

---

## 10. Branding notes

The active branch identity for production is **Sree Diagnostics — Vijayawada
(HQ)** (`branches.code = 'SDX01'`). Contact info in `hospital_settings`:

- Name: **Sree Diagnostics**
- Tagline: *ISO 9001:2015 Certified Diagnostic Laboratory*
- Address: High Tension Road, APIIC Colony, Bharathi Nagar, Vijayawada, AP 520007
- Phone: 8008331234
- Email: sreediagnostics9@gmail.com
- Website: sreediagnostics.in
- Registration: QA-53036/0425
- Tax state: AP
- Lab report template: `sree`
- Accreditations: ISO 9001:2015 · Quality Approval (QA-53036/0425) · CLSI

Reports, invoices, payslips, and doctor payouts all pull from this single
source.
