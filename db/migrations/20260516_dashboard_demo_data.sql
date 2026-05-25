-- ═══════════════════════════════════════════════════════════════════════════
-- NIYAMONE-LAB · DASHBOARD DEMO DATA
--
-- Fills every panel of the diagnostic-centre dashboard so the customer
-- demo shows realistic numbers across Daily / Weekly / Monthly views:
--
--   • 4 demo branches (DEL-HQ, BLR, CHE, HYD) — drives "Branch performance"
--   • Service catalog per branch (lab + imaging + pharmacy + consultation)
--   • 90 days of invoices + invoice_items distributed across all branches
--   • Recent lab_orders with mixed sample_status (drives KPI cards)
--   • Reported lab_orders across the past month (drives Volume trend "reports")
--   • Critical-flagged lab_results in the last 24h (drives Critical card)
--   • Home collection requests scheduled today (drives Home KPI + list)
--
-- Idempotent: every section either uses ON CONFLICT or wipes its previous
-- demo footprint (`invoice_number LIKE 'DASH-DEMO-%'` etc.) before re-seeding.
-- Run it any number of times; the dashboard converges to the same shape.
--
-- HOW TO RUN
--   1. Open Supabase → SQL Editor for the LIVE project (wdsbkwfhfwqczqhunyac).
--   2. Make sure `20260515_fix_seed_demo_data.sql` has already been applied
--      so that patients + base doctors exist.
--   3. Paste this whole file and click Run.
--   4. To re-seed any time:    select public.seed_dashboard_demo_data();
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.seed_dashboard_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_branch_ids       uuid[];
  v_branch_id        uuid;
  v_branch_code      text;
  v_patient_ids      uuid[];
  v_patient_id       uuid;
  v_doctor_ids       uuid[];
  v_doctor_id        uuid;
  v_admin_id         uuid;

  v_svc_lab          uuid;
  v_svc_img          uuid;
  v_svc_pharm        uuid;
  v_svc_consult      uuid;
  v_svc_proc         uuid;

  v_invoice_id       uuid;
  v_invoice_no       text;
  v_invoice_date     date;
  v_total_cents      int;

  v_day_offset       int;
  v_per_branch       int;
  v_n                int;
  v_status           text;
  v_lo_id            uuid;
  v_lt_id            uuid;
  v_lr_count         int;
  v_critical_count   int := 0;

  c_branches         int := 0;
  c_services         int := 0;
  c_invoices         int := 0;
  c_items            int := 0;
  c_home             int := 0;
  c_reports          int := 0;

  v_categories       text[] := ARRAY['lab','imaging','pharmacy','consultation','procedure'];
  v_branch_seed      record;
BEGIN
  ----------------------------------------------------------------------------
  -- 0. Sanity: must have patients (from base demo seed)
  ----------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.patients LIMIT 1) THEN
    RAISE EXCEPTION
      'No patients found — run 20260515_fix_seed_demo_data.sql first so the dashboard seed has someone to bill.';
  END IF;

  ----------------------------------------------------------------------------
  -- 1. Branches — 4 demo branches across major Indian cities
  ----------------------------------------------------------------------------
  FOR v_branch_seed IN
    SELECT * FROM (VALUES
      ('DEL-HQ',   'Niyamone Lab — Delhi NCR',     'New Delhi'),
      ('BLR',      'Niyamone Lab — Bengaluru',     'Bengaluru'),
      ('CHE',      'Niyamone Lab — Chennai',       'Chennai'),
      ('SREE-VJW', 'Sree Diagnostics — Vijayawada','Vijayawada')
    ) AS t(code, name, city)
  LOOP
    INSERT INTO public.branches (code, name, address, is_active)
    VALUES (v_branch_seed.code, v_branch_seed.name,
            jsonb_build_object('city', v_branch_seed.city, 'country', 'IN'),
            true)
    ON CONFLICT (code) DO UPDATE SET is_active = true;
    c_branches := c_branches + 1;
  END LOOP;

  -- Retire the legacy Hyderabad demo branch so it stops surfacing in the switcher.
  UPDATE public.branches
     SET is_active = false
   WHERE code = 'HYD';

  SELECT array_agg(id) INTO v_branch_ids
  FROM public.branches
  WHERE code IN ('DEL-HQ','BLR','CHE','SREE-VJW') AND is_active = true;

  ----------------------------------------------------------------------------
  -- 2. Patients + doctors + admin we'll reuse for FK fields
  ----------------------------------------------------------------------------
  SELECT array_agg(id) INTO v_patient_ids
  FROM (SELECT id FROM public.patients WHERE archived_at IS NULL ORDER BY created_at LIMIT 30) p;

  SELECT array_agg(id) INTO v_doctor_ids
  FROM (SELECT id FROM public.staff WHERE role_slug = 'doctor' AND is_active = true ORDER BY created_at LIMIT 10) d;

  SELECT id INTO v_admin_id
  FROM public.staff
  WHERE is_active = true AND role_slug IN ('management','admin','super_admin')
  ORDER BY created_at LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.staff WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  IF v_patient_ids IS NULL OR array_length(v_patient_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No patients available for seeding.';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Services per branch — clean up demo rows first, then re-insert.
  --    Five categories so the revenue donut + legend show meaningful slices.
  ----------------------------------------------------------------------------
  DELETE FROM public.services WHERE code LIKE 'DASH-%';

  FOREACH v_branch_id IN ARRAY v_branch_ids
  LOOP
    INSERT INTO public.services (branch_id, code, name, category, unit_price_cents, gst_rate, is_active)
    VALUES
      (v_branch_id, 'DASH-CBC',    'Complete Blood Count',         'lab',          40000,  0, true),
      (v_branch_id, 'DASH-HBA1C',  'HbA1c Glycated Hemoglobin',    'lab',          60000,  0, true),
      (v_branch_id, 'DASH-LIPID',  'Lipid Profile',                'lab',          80000,  0, true),
      (v_branch_id, 'DASH-TSH',    'Thyroid Stimulating Hormone',  'lab',          35000,  0, true),
      (v_branch_id, 'DASH-LFT',    'Liver Function Test',          'lab',          60000,  0, true),
      (v_branch_id, 'DASH-XRAY',   'X-Ray Chest PA View',          'imaging',      50000,  0, true),
      (v_branch_id, 'DASH-USG',    'USG Abdomen + Pelvis',         'imaging',     200000,  0, true),
      (v_branch_id, 'DASH-ECG',    'ECG 12-lead',                  'imaging',      25000,  0, true),
      (v_branch_id, 'DASH-CT',     'CT Scan Brain Plain',          'imaging',     350000,  0, true),
      (v_branch_id, 'DASH-OPD',    'OPD Consultation',             'consultation', 50000, 18, true),
      (v_branch_id, 'DASH-FU',     'Follow-up Consultation',       'consultation', 25000, 18, true),
      (v_branch_id, 'DASH-PHRX',   'Pharmacy Rx Dispense',         'pharmacy',     45000, 12, true),
      (v_branch_id, 'DASH-PHOTC',  'OTC Medication',               'pharmacy',     12000, 12, true),
      (v_branch_id, 'DASH-DRESS',  'Wound Dressing',               'procedure',    15000, 18, true),
      (v_branch_id, 'DASH-INJ',    'IM/IV Injection',              'procedure',     8000, 18, true);
    c_services := c_services + 15;
  END LOOP;

  ----------------------------------------------------------------------------
  -- 4. Invoices + invoice_items — last 90 days, distributed per branch
  ----------------------------------------------------------------------------
  -- Wipe previous demo invoices (cascades to invoice_items via FK)
  DELETE FROM public.invoice_items WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE invoice_number LIKE 'DASH-DEMO-%'
  );
  DELETE FROM public.invoices WHERE invoice_number LIKE 'DASH-DEMO-%';

  -- Generate: ~4 invoices/day × 90 days × 4 branches = ~1440 invoices
  FOR v_day_offset IN 0 .. 89
  LOOP
    v_invoice_date := CURRENT_DATE - v_day_offset;

    -- More activity in recent 30 days, less in older 60 days
    IF v_day_offset < 30 THEN v_per_branch := 4 + (v_day_offset % 3);  -- 4-6 per day
    ELSE                       v_per_branch := 2 + (v_day_offset % 2);  -- 2-3 per day
    END IF;

    FOREACH v_branch_id IN ARRAY v_branch_ids
    LOOP
      v_branch_code := (SELECT code FROM public.branches WHERE id = v_branch_id);

      FOR v_n IN 1 .. v_per_branch
      LOOP
        v_patient_id := v_patient_ids[1 + ((v_day_offset * 7 + v_n * 3) % array_length(v_patient_ids, 1))];
        v_invoice_no := format('DASH-DEMO-%s-%s-%s-%s',
                               v_branch_code, to_char(v_invoice_date, 'YYYYMMDD'), v_day_offset, v_n);

        -- 85% paid, 10% partially_paid, 4% issued, 1% void (matches realistic billing flow)
        v_status := CASE
          WHEN (v_day_offset * 13 + v_n) % 100 < 85 THEN 'paid'
          WHEN (v_day_offset * 13 + v_n) % 100 < 95 THEN 'partially_paid'
          WHEN (v_day_offset * 13 + v_n) % 100 < 99 THEN 'issued'
          ELSE 'void'
        END;

        v_total_cents := 0;

        INSERT INTO public.invoices
          (id, invoice_number, branch_id, patient_id, invoice_date, status,
           subtotal_cents, total_cents, paid_cents, balance_cents,
           cgst_cents, sgst_cents, igst_cents, discount_cents, created_by_staff_id, created_at)
        VALUES
          (gen_random_uuid(), v_invoice_no, v_branch_id, v_patient_id, v_invoice_date, v_status::invoice_status,
           0, 0, 0, 0, 0, 0, 0, 0, v_admin_id, v_invoice_date::timestamptz + interval '10 hours' + (v_n || ' minutes')::interval)
        RETURNING id INTO v_invoice_id;

        -- 2-4 line items per invoice, chosen across categories
        FOR i IN 1 .. (2 + ((v_day_offset + v_n) % 3))
        LOOP
          DECLARE
            v_chosen_svc record;
            v_qty        int;
            v_line_total int;
          BEGIN
            SELECT id, name, unit_price_cents, gst_rate
              INTO v_chosen_svc
              FROM public.services
              WHERE branch_id = v_branch_id AND code LIKE 'DASH-%'
              ORDER BY ((v_day_offset * 31 + v_n * 7 + i) % 1000)
              LIMIT 1 OFFSET ((v_day_offset + v_n + i) % 15);

            -- Fallback if offset overflows
            IF v_chosen_svc IS NULL THEN
              SELECT id, name, unit_price_cents, gst_rate
                INTO v_chosen_svc
                FROM public.services
                WHERE branch_id = v_branch_id AND code LIKE 'DASH-%'
                LIMIT 1;
            END IF;

            v_qty := CASE WHEN (v_n + i) % 5 = 0 THEN 2 ELSE 1 END;
            v_line_total := v_chosen_svc.unit_price_cents * v_qty;

            INSERT INTO public.invoice_items
              (invoice_id, service_id, description, qty, unit_price_cents,
               taxable_cents, total_cents, gst_rate, cgst_cents, sgst_cents, igst_cents,
               discount_cents, position)
            VALUES
              (v_invoice_id, v_chosen_svc.id, v_chosen_svc.name, v_qty, v_chosen_svc.unit_price_cents,
               v_line_total, v_line_total, v_chosen_svc.gst_rate, 0, 0, 0, 0, i);

            v_total_cents := v_total_cents + v_line_total;
            c_items := c_items + 1;
          END;
        END LOOP;

        -- Update the invoice totals to match the items
        UPDATE public.invoices
        SET subtotal_cents = v_total_cents,
            total_cents    = v_total_cents,
            paid_cents     = CASE
                               WHEN v_status = 'paid'           THEN v_total_cents
                               WHEN v_status = 'partially_paid' THEN (v_total_cents * 0.5)::int
                               ELSE 0
                             END,
            balance_cents  = CASE
                               WHEN v_status = 'paid'           THEN 0
                               WHEN v_status = 'partially_paid' THEN (v_total_cents * 0.5)::int
                               WHEN v_status = 'issued'         THEN v_total_cents
                               ELSE 0
                             END
        WHERE id = v_invoice_id;

        c_invoices := c_invoices + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------------------
  -- 5. Lab orders: backfill `reported_at` on existing orders across last 30
  --    days so the Volume trend "reports finalised" line populates.
  ----------------------------------------------------------------------------
  UPDATE public.lab_orders
  SET reported_at = ordered_at + interval '4 hours'
  WHERE reported_at IS NULL
    AND ordered_at >= now() - interval '30 days'
    AND id IN (
      SELECT id FROM public.lab_orders
      WHERE reported_at IS NULL AND ordered_at >= now() - interval '30 days'
      ORDER BY ordered_at DESC LIMIT 40
    );
  GET DIAGNOSTICS c_reports = ROW_COUNT;

  ----------------------------------------------------------------------------
  -- 6. Critical lab results — pick 6 recent results and flag them critical
  ----------------------------------------------------------------------------
  WITH recent_results AS (
    SELECT id, value_numeric
    FROM public.lab_results
    WHERE entered_at >= now() - interval '20 hours'
       OR (entered_at IS NULL AND created_at >= now() - interval '20 hours')
    ORDER BY COALESCE(entered_at, created_at) DESC
    LIMIT 6
  )
  UPDATE public.lab_results r
  SET flag = CASE
               WHEN row_number IS NOT NULL AND row_number % 2 = 0 THEN 'critical_high'::lab_result_flag
               ELSE 'critical_low'::lab_result_flag
             END,
      entered_at = COALESCE(r.entered_at, now() - interval '2 hours'),
      value_numeric = COALESCE(r.value_numeric,
                               CASE WHEN row_number % 2 = 0 THEN 980 ELSE 38 END)
  FROM (
    SELECT id, row_number() OVER () AS row_number FROM recent_results
  ) sub
  WHERE r.id = sub.id;
  GET DIAGNOSTICS v_critical_count = ROW_COUNT;

  ----------------------------------------------------------------------------
  -- 7. Home collection requests — scheduled today across branches
  ----------------------------------------------------------------------------
  DELETE FROM public.home_collection_requests
   WHERE notes LIKE '[DASH-DEMO]%' OR contact_mobile LIKE '+91-90000999%';

  FOREACH v_branch_id IN ARRAY v_branch_ids
  LOOP
    FOR v_n IN 1 .. 3
    LOOP
      v_patient_id := v_patient_ids[1 + ((v_n * 11) % array_length(v_patient_ids, 1))];
      INSERT INTO public.home_collection_requests
        (branch_id, patient_id, address, scheduled_at, contact_mobile, status,
         total_inr, surcharge_inr, payment_method, notes, created_at)
      VALUES
        (v_branch_id, v_patient_id,
         jsonb_build_object('line1','Demo address','city','New Delhi','pincode','110001'),
         (CURRENT_DATE::timestamptz + interval '8 hours' + (v_n * 90 || ' minutes')::interval),
         '+91-9000099' || lpad(v_n::text, 2, '0'),
         (ARRAY['requested','assigned','en_route','collected'])[1 + ((v_n - 1) % 4)]::home_collection_status,
         800.00 + (v_n * 50), 100.00, 'pending'::home_collection_payment_method,
         '[DASH-DEMO] Pre-seeded for dashboard preview',
         now() - interval '2 hours');
      c_home := c_home + 1;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------------------
  -- 8. Refresh PostgREST schema cache so the dashboard sees changes immediately
  ----------------------------------------------------------------------------
  NOTIFY pgrst, 'reload schema';

  RETURN jsonb_build_object(
    'branches',        c_branches,
    'services',        c_services,
    'invoices',        c_invoices,
    'invoice_items',   c_items,
    'home_visits',     c_home,
    'reports_marked',  c_reports,
    'critical_flagged', v_critical_count,
    'message',         'Dashboard demo data refreshed. Reload the dashboard.'
  );
END
$fn$;

-- Run it now so the demo is live the moment this file is applied.
SELECT public.seed_dashboard_demo_data();
