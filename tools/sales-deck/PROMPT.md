# Enhanced Prompt — Client-Closing Walkthrough Deck (Sree Diagnostics × Niyamone Labs)

> Use this prompt verbatim with any GenAI tool that can produce slides
> (Gamma, Beautiful.ai, Canva Magic, ChatGPT + python-pptx, Claude, etc.).
> It is designed to produce a deck that **closes the deal in a single sitting**.

---

## ROLE
You are a senior B2B SaaS pre-sales solution architect with 15 years of
healthcare IT experience. You have personally closed multi-crore HIS/LIMS
deals for multi-branch diagnostic chains in India. You write the way the
CTO of a 5-branch lab actually buys — concrete outcomes, zero fluff,
proof shots on every slide.

## OUTCOME
Produce a **25-slide, 16:9, client-meeting-ready presentation** that
walks the client (a multi-branch diagnostic lab) through **the entire
Niyamone Labs application, window-by-window, with one annotated
screenshot per workflow**, and ends with a frictionless "yes" path.

The deck must:
1. Replace 90 % of verbal explanation — the client should be able to
   follow it cold without the presenter.
2. Make every screen earn its slide: each slide answers
   **"so what does this do for *my* lab?"**, not "what does this feature do".
3. Drive a single decision: **green-light the rollout in this meeting.**

## AUDIENCE
- **Primary**: Lab owner / Managing Director (decision authority, ₹).
- **Secondary**: Lab manager / IT lead (operational pain owner).
- **Implicit**: Their accountant (TCO check) and their existing vendor
  (whom we are replacing).
Tone for each must be addressed in different slides — see structure.

## DESIGN SYSTEM (must follow exactly)
- Aspect ratio: 16:9 widescreen (13.333" × 7.5").
- Brand primary: **#0E4F8C** (deep navy). Accent: **#00C3FF** (electric blue).
- Ink: **#0F1B2D**. Muted ink: **#65758C**. Page surface: **#F4F7FB**.
- Headline font: Inter / Calibri bold, 32–40 pt.
- Body font: Inter / Calibri regular, 14–18 pt. Never below 12 pt.
- Every content slide: 60 % copy left / 40 % annotated screenshot right
  with a 2-px navy border + a one-line **caption** below the shot.
- Top of each content slide: a thin 6-px brand gradient bar (navy → blue).
- Bottom of each slide: page number + "Niyamone Labs × Sree Diagnostics".
- Section dividers are full-bleed navy with one giant section number.

## STRUCTURE (25 slides — do not deviate)

**Act I — Open (4 slides)**
1. Cover — client logo, our logo, meeting date, presenter name.
2. "Why we're in this room" — one-sentence value prop + 3 outcome chips.
3. The problem we keep seeing in 5-branch labs (3 bullets, 1 stat each).
4. The Niyamone promise — one line, one screenshot of the live dashboard.

**Act II — The business case (3 slides)**
5. Outcomes the client will measure in 90 days (table: metric → today → with Niyamone).
6. ROI snapshot (cost of status quo vs. cost of Niyamone, payback in months).
7. Who else trusts us — logos / quotes (if available; else: "Pilot reference available on request").

**Act III — Window-by-window walkthrough (13 slides — the heart)**
For each slide: **screenshot right, 3 bullets left, 1 "What it saves you" callout.**
8. Login & role-based access — JWT, app_metadata, super/branch/staff scopes.
9. Operational dashboard — revenue, TAT, pending, by-branch slicer.
10. Patient registration & UHID — duplicate guard, address book, mobile-first.
11. Appointments & home collection — pickup surcharge auto-line, address capture.
12. Billing & invoice — line provenance, GST, discount tiers, WhatsApp share.
13. Discount approval (Smart Inbox) — tiered approval, audit trail, no rogue discounts.
14. Lab workflow — accession → sample → result → verify → report.
15. Lab report PDF — Sree Diagnostics letterhead, QR, signatures, instructions.
16. Pharmacy & inventory — indents, dispensing, GRN, expiry guard.
17. IPD / wards (if scoped) — bed map, doctor visits, consolidated invoice.
18. Doctor payouts & payslip — TDS 194J, amount-in-words, Indian standard.
19. Reports & analytics — PDF export matches on-screen, category share, branch drill.
20. Settings — lab branding, signatures, accreditations, instructions.

**Act IV — Trust (3 slides)**
21. Architecture & data ownership — Angular + Supabase + RLS, data lives in *your* tenant.
22. Security & compliance — RLS per-branch, audit log, role-based perms, JWT.
23. Multi-branch & realtime — switch branches in one click, live data, no double entry.

**Act V — Close (2 slides)**
24. Rollout plan & pricing — 3-phase deployment, fixed milestones, support SLA.
25. Decision page — "Here's what we agree today" + signature block + next 7-day calendar.

## CONTENT RULES
- Every claim must be verifiable in the live app — no marketing fluff.
- No more than 6 lines of body copy per slide.
- All numbers are rupees in **₹ Lakh / Crore**, never USD.
- Indian context: GST, TDS 194J, UHID, IFSC, PAN — use the right vocabulary.
- Every screenshot caption is **action-oriented**:
  "Reception books a home collection in 18 seconds." (not: "Home collection screen.")

## DELIVERABLE
A single `.pptx` file produced by python-pptx (or equivalent) with:
- Master slide carrying the colour tokens above.
- 25 slides in the exact order above.
- A "Screenshots needed" appendix mapping every placeholder to a
  filename in `tools/sales-deck/screenshots/`.
- A README explaining how to swap a placeholder with the real screenshot
  in PowerPoint (Right-click → Change Picture).

## SUCCESS CRITERIA
After the meeting, the client says one of:
- "Send me the SOW today, we start next week."  ✅
- "Can you do branch 6 in the same phase?"      ✅ (upsell happened)
And **does not** say:
- "Send me a proposal, we'll review internally and revert."  ❌
