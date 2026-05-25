-- ═══════════════════════════════════════════════════════════════════════════
-- NIYAMONE-HMS · DEMO DATA SEED  (bulletproof, idempotent, self-executing)
--
-- Run ONCE in Supabase → SQL Editor (paste this whole file and click "Run").
-- After that, you can re-seed any time by calling:
--     select public.seed_demo_data();
-- … from SQL Editor or via Supabase RPC from the app.
--
-- Seeds:
--   • 10 doctors (DOC-1001…1010)        with metadata for print rendering
--   • 20 patients (NHQ-DEMO-001…020)    realistic demographics
--   •  5 patient allergies              history sample
--   • 20 appointments                   past 14 days → next 5 days, mixed statuses
--   • 12-test lab catalog               (CBC, HBA1C, LFT, RFT, TSH, …)
--   • Encounters + vitals + Rx items    for completed/in-consultation visits
--   •  6 lab orders with verified results
--
-- Self-heals these schema gaps if missing:
--   • staff.user_id           — drops NOT NULL (demo doctors have no auth user)
--   • appointments.is_web_booking — adds boolean column
--   • roles 'doctor' / 'management' / 'admin' — inserts if missing
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Schema self-heal (runs every time, idempotent) ────────────────────────
DO $heal$
BEGIN
  -- Allow staff rows without an auth.users link (demo doctors)
  BEGIN
    ALTER TABLE public.staff ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Web bookings flag for the dashboard
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'appointments'
      AND column_name  = 'is_web_booking'
  ) THEN
    ALTER TABLE public.appointments
      ADD COLUMN is_web_booking boolean NOT NULL DEFAULT false;
  END IF;
END
$heal$;

-- Make sure the 'doctor' role exists (seed inserts depend on it)
INSERT INTO public.roles (slug, name, description)
VALUES
  ('doctor',     'Doctor',     'Clinician'),
  ('management', 'Management', 'Branch / hospital administration'),
  ('admin',      'Admin',      'System administrator')
ON CONFLICT (slug) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- The actual seed, packaged as a function so it can be re-run via RPC.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_branch       uuid;
  v_admin        uuid;
  v_doctors      uuid[];
  v_patients     uuid[];
  v_doc          uuid;
  v_pat          uuid;
  v_apt          uuid;
  v_enc          uuid;
  v_rx           uuid;
  v_lo           uuid;
  v_chief        text;
  v_diag         text;
  v_plan         text;
  v_apt_at       timestamptz;
  v_apt_status   text;
  v_visit_type   text;
  i              int;
  c_doctors      int;
  c_patients     int;
  c_appts        int;
  c_encounters   int;
  c_rx_items     int;
  c_lab_orders   int;
  rec            record;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Resolve branch + admin staff
  ----------------------------------------------------------------------------
  SELECT id INTO v_branch
  FROM public.branches
  WHERE is_active = true
  ORDER BY created_at LIMIT 1;

  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'No active branch found. Open Settings → Hospital info and save a branch first.';
  END IF;

  SELECT id INTO v_admin
  FROM public.staff
  WHERE is_active = true AND role_slug IN ('management','admin','super_admin')
  ORDER BY created_at LIMIT 1;

  -- fallback to ANY staff
  IF v_admin IS NULL THEN
    SELECT id INTO v_admin FROM public.staff WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Lab tests catalog (12 tests, idempotent on code)
  ----------------------------------------------------------------------------
  INSERT INTO public.lab_tests (code, name, category, specimen_type, unit, ref_min, ref_max, turnaround_hours, is_active)
  VALUES
    ('CBC',      'Complete Blood Count',          'haematology',  'blood', 'cells/uL',  4000,   11000,  4, true),
    ('HB',       'Hemoglobin',                    'haematology',  'blood', 'g/dL',      12.0,   16.0,   4, true),
    ('FBS',      'Fasting Blood Sugar',           'biochemistry', 'blood', 'mg/dL',     70,     100,    2, true),
    ('PPBS',     'Postprandial Blood Sugar',      'biochemistry', 'blood', 'mg/dL',     70,     140,    2, true),
    ('HBA1C',    'Glycated Hemoglobin (HbA1c)',   'biochemistry', 'blood', '%',         4.0,    5.6,    8, true),
    ('LIPID',    'Lipid Profile',                 'biochemistry', 'blood', 'mg/dL',     NULL,   NULL,   6, true),
    ('LFT',      'Liver Function Test',           'biochemistry', 'blood', 'U/L',       NULL,   NULL,   6, true),
    ('RFT',      'Renal Function Test',           'biochemistry', 'blood', 'mg/dL',     NULL,   NULL,   6, true),
    ('TSH',      'Thyroid Stimulating Hormone',   'endocrinology','blood', 'mIU/L',     0.4,    4.0,    8, true),
    ('VITD',     'Vitamin D (25-OH)',             'endocrinology','blood', 'ng/mL',     30,     100,   24, true),
    ('URINE_RM', 'Urine Routine Microscopy',      'urinalysis',   'urine', NULL,        NULL,   NULL,   4, true),
    ('ECG',      'Electrocardiogram',             'imaging',      'other', NULL,        NULL,   NULL,   1, true)
  ON CONFLICT (code) DO NOTHING;

  ----------------------------------------------------------------------------
  -- 3. Doctors (10) — UPSERT on staff_code so re-runs refresh metadata
  ----------------------------------------------------------------------------
  INSERT INTO public.staff
    (staff_code, full_name, email, role_slug, primary_branch_id, phone, is_active, joined_at, metadata)
  VALUES
    ('DOC-1001', 'Dr. Ramesh Iyer',       'ramesh.iyer@niyamone.demo',     'doctor', v_branch, '+91-9000010001', true, '2022-01-15',
        '{"qualifications":"MBBS, MD","specialty":"General Medicine","registration_no":"TNMC-12001"}'::jsonb),
    ('DOC-1002', 'Dr. Priya Subramanian', 'priya.s@niyamone.demo',         'doctor', v_branch, '+91-9000010002', true, '2021-08-20',
        '{"qualifications":"MBBS, MS","specialty":"Obstetrics & Gynaecology","registration_no":"TNMC-12002"}'::jsonb),
    ('DOC-1003', 'Dr. Arvind Kumar',      'arvind.k@niyamone.demo',        'doctor', v_branch, '+91-9000010003', true, '2020-03-10',
        '{"qualifications":"MBBS, MD, DM","specialty":"Cardiology","registration_no":"TNMC-12003"}'::jsonb),
    ('DOC-1004', 'Dr. Lakshmi Narayanan', 'lakshmi.n@niyamone.demo',       'doctor', v_branch, '+91-9000010004', true, '2019-11-01',
        '{"qualifications":"MBBS, DCH","specialty":"Paediatrics","registration_no":"TNMC-12004"}'::jsonb),
    ('DOC-1005', 'Dr. Vikram Reddy',      'vikram.r@niyamone.demo',        'doctor', v_branch, '+91-9000010005', true, '2018-06-25',
        '{"qualifications":"MBBS, MS","specialty":"Orthopaedics","registration_no":"TNMC-12005"}'::jsonb),
    ('DOC-1006', 'Dr. Anjali Krishnan',   'anjali.k@niyamone.demo',        'doctor', v_branch, '+91-9000010006', true, '2023-02-14',
        '{"qualifications":"MBBS, MD","specialty":"Dermatology","registration_no":"TNMC-12006"}'::jsonb),
    ('DOC-1007', 'Dr. Sundar Rajan',      'sundar.r@niyamone.demo',        'doctor', v_branch, '+91-9000010007', true, '2017-09-03',
        '{"qualifications":"MBBS, MS","specialty":"General Surgery","registration_no":"TNMC-12007"}'::jsonb),
    ('DOC-1008', 'Dr. Meena Lakshmi',     'meena.l@niyamone.demo',         'doctor', v_branch, '+91-9000010008', true, '2022-05-19',
        '{"qualifications":"MBBS, MD","specialty":"Psychiatry","registration_no":"TNMC-12008"}'::jsonb),
    ('DOC-1009', 'Dr. Karthik Murthy',    'karthik.m@niyamone.demo',       'doctor', v_branch, '+91-9000010009', true, '2020-12-08',
        '{"qualifications":"MBBS, MD","specialty":"ENT","registration_no":"TNMC-12009"}'::jsonb),
    ('DOC-1010', 'Dr. Deepa Venkatesh',   'deepa.v@niyamone.demo',         'doctor', v_branch, '+91-9000010010', true, '2024-01-12',
        '{"qualifications":"MBBS, MD","specialty":"Diabetology","registration_no":"TNMC-12010"}'::jsonb)
  ON CONFLICT (staff_code) DO UPDATE
  SET full_name         = EXCLUDED.full_name,
      role_slug         = EXCLUDED.role_slug,
      primary_branch_id = EXCLUDED.primary_branch_id,
      phone             = EXCLUDED.phone,
      is_active         = EXCLUDED.is_active,
      metadata          = EXCLUDED.metadata,
      updated_at        = NOW();

  -- Make sure each demo doctor is linked to the branch (for RLS / multi-branch)
  INSERT INTO public.staff_branches (staff_id, branch_id)
  SELECT s.id, s.primary_branch_id
  FROM public.staff s
  WHERE s.staff_code LIKE 'DOC-10%'
  ON CONFLICT (staff_id, branch_id) DO NOTHING;

  -- Collect doctor IDs in stable order
  SELECT array_agg(id ORDER BY staff_code) INTO v_doctors
  FROM public.staff
  WHERE staff_code LIKE 'DOC-10%' AND primary_branch_id = v_branch;

  c_doctors := COALESCE(array_length(v_doctors, 1), 0);

  ----------------------------------------------------------------------------
  -- 4. Patients (20) — UPSERT on uhid so re-runs refresh
  ----------------------------------------------------------------------------
  -- Note: full_name is a generated column (TRIM(first_name || ' ' || last_name)) — do not include
  -- Salutations must be one of: Mr / Ms / Mrs / Dr / Master (no dots, no "Miss")
  INSERT INTO public.patients
    (uhid, branch_id, salutation, first_name, last_name, gender, date_of_birth,
     mobile, email, marital_status, blood_group, status, created_by_staff_id)
  VALUES
    ('NHQ-DEMO-001', v_branch, 'Mr',    'Suresh',     'Ramachandran',  'male',     '1985-03-12', '+91-9876543201', 'suresh.r@example.com',  'married', 'B+',  'active', v_admin),
    ('NHQ-DEMO-002', v_branch, 'Mrs',   'Lalitha',    'Krishnan',      'female',   '1972-09-25', '+91-9876543202', 'lalitha.k@example.com', 'married', 'O+',  'active', v_admin),
    ('NHQ-DEMO-003', v_branch, 'Mr',    'Arun',       'Pillai',        'male',     '1995-12-04', '+91-9876543203', NULL,                    'single',  'A+',  'active', v_admin),
    ('NHQ-DEMO-004', v_branch, 'Ms',    'Kavita',     'Iyer',          'female',   '1990-07-18', '+91-9876543204', 'kavita.i@example.com',  'single',  'AB+', 'active', v_admin),
    ('NHQ-DEMO-005', v_branch, 'Mr',    'Rajesh',     'Mohan',         'male',     '1968-01-30', '+91-9876543205', NULL,                    'married', 'O-',  'active', v_admin),
    ('NHQ-DEMO-006', v_branch, 'Master','Aarav',      'Reddy',         'male',     '2018-05-22', '+91-9876543206', NULL,                    NULL,      'B+',  'active', v_admin),
    ('NHQ-DEMO-007', v_branch, 'Mrs',   'Geetha',     'Subramaniam',   'female',   '1980-11-08', '+91-9876543207', 'geetha.s@example.com',  'married', 'A+',  'active', v_admin),
    ('NHQ-DEMO-008', v_branch, 'Mr',    'Mohan',      'Das',           'male',     '1955-04-15', '+91-9876543208', NULL,                    'married', 'O+',  'active', v_admin),
    ('NHQ-DEMO-009', v_branch, 'Ms',    'Pooja',      'Sharma',        'female',   '1998-08-09', '+91-9876543209', 'pooja.s@example.com',   'single',  'B+',  'active', v_admin),
    ('NHQ-DEMO-010', v_branch, 'Mr',    'Karthik',    'Nair',          'male',     '1988-06-21', '+91-9876543210', NULL,                    'married', 'AB-', 'active', v_admin),
    ('NHQ-DEMO-011', v_branch, 'Mrs',   'Anitha',     'Balakrishnan',  'female',   '1976-02-14', '+91-9876543211', NULL,                    'married', 'A-',  'active', v_admin),
    ('NHQ-DEMO-012', v_branch, 'Mr',    'Vinod',      'Menon',         'male',     '1992-10-03', '+91-9876543212', 'vinod.m@example.com',   'single',  'O+',  'active', v_admin),
    ('NHQ-DEMO-013', v_branch, 'Ms',    'Divya',      'Bhat',          'female',   '1986-03-27', '+91-9876543213', NULL,                    'single',  'B-',  'active', v_admin),
    ('NHQ-DEMO-014', v_branch, 'Mr',    'Saravanan',  'Pandian',       'male',     '1962-12-11', '+91-9876543214', NULL,                    'married', 'O+',  'active', v_admin),
    ('NHQ-DEMO-015', v_branch, 'Mrs',   'Latha',      'Ramani',        'female',   '1965-07-04', '+91-9876543215', NULL,                    'married', 'A+',  'active', v_admin),
    ('NHQ-DEMO-016', v_branch, 'Mr',    'Praveen',    'Kumar',         'male',     '1994-09-16', '+91-9876543216', 'praveen.k@example.com', 'single',  'B+',  'active', v_admin),
    ('NHQ-DEMO-017', v_branch, 'Ms',    'Sneha',      'Joshi',         'female',   '2010-01-28', '+91-9876543217', NULL,                    NULL,      'O+',  'active', v_admin),
    ('NHQ-DEMO-018', v_branch, 'Mr',    'Bhaskar',    'Rao',           'male',     '1958-08-12', '+91-9876543218', NULL,                    'married', 'AB+', 'pending_payment', v_admin),
    ('NHQ-DEMO-019', v_branch, 'Mrs',   'Padma',      'Lakshmi',       'female',   '1983-04-06', '+91-9876543219', 'padma.l@example.com',   'married', 'A+',  'active', v_admin),
    ('NHQ-DEMO-020', v_branch, 'Mr',    'Naveen',     'Chandra',       'male',     '1979-11-23', '+91-9876543220', NULL,                    'married', 'O+',  'active', v_admin)
  ON CONFLICT (uhid) DO UPDATE
  SET first_name    = EXCLUDED.first_name,
      last_name     = EXCLUDED.last_name,
      gender        = EXCLUDED.gender,
      date_of_birth = EXCLUDED.date_of_birth,
      mobile        = EXCLUDED.mobile,
      email         = EXCLUDED.email,
      blood_group   = EXCLUDED.blood_group,
      status        = EXCLUDED.status,
      branch_id     = EXCLUDED.branch_id,
      salutation    = EXCLUDED.salutation,
      updated_at    = NOW();

  SELECT array_agg(id ORDER BY uhid) INTO v_patients
  FROM public.patients
  WHERE uhid LIKE 'NHQ-DEMO-%' AND branch_id = v_branch;

  c_patients := COALESCE(array_length(v_patients, 1), 0);

  IF c_patients = 0 OR c_doctors = 0 THEN
    RAISE EXCEPTION 'Seed aborted: patients=% doctors=% (need at least 1 of each)', c_patients, c_doctors;
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Allergies (5) — wipe & reseed (uses post-migration column names)
  ----------------------------------------------------------------------------
  DELETE FROM public.patient_allergies WHERE patient_id = ANY(v_patients);
  INSERT INTO public.patient_allergies
    (patient_id, allergen_type, allergen_name, severity, reaction_description)
  VALUES
    (v_patients[1],  'drug',          'Penicillin',  'severe',   'Rash + angioedema'),
    (v_patients[4],  'food',          'Peanuts',     'moderate', 'Hives'),
    (v_patients[7],  'drug',          'Sulfa drugs', 'moderate', 'Skin reaction'),
    (v_patients[12], 'drug',          'Aspirin',     'mild',     'GI upset'),
    (v_patients[18], 'latex',         'Latex',       'severe',   'Contact dermatitis');

  ----------------------------------------------------------------------------
  -- 6. Wipe demo encounters / appointments / prescriptions before reseeding
  ----------------------------------------------------------------------------
  -- Cascade-style cleanup tied to demo patients only:
  DELETE FROM public.lab_results
   WHERE lab_order_id IN (SELECT id FROM public.lab_orders WHERE patient_id = ANY(v_patients));
  DELETE FROM public.lab_orders         WHERE patient_id = ANY(v_patients);
  DELETE FROM public.prescription_items
   WHERE prescription_id IN (SELECT id FROM public.prescriptions WHERE patient_id = ANY(v_patients));
  DELETE FROM public.prescriptions      WHERE patient_id = ANY(v_patients);
  DELETE FROM public.vitals             WHERE patient_id = ANY(v_patients);
  DELETE FROM public.encounters         WHERE patient_id = ANY(v_patients);
  DELETE FROM public.appointments       WHERE patient_id = ANY(v_patients);

  ----------------------------------------------------------------------------
  -- 7. Appointments + (where applicable) Encounters + Vitals + Prescriptions
  ----------------------------------------------------------------------------
  c_appts := 0; c_encounters := 0; c_rx_items := 0;

  FOR i IN 1..20 LOOP
    v_doc := v_doctors[((i - 1) % c_doctors) + 1];
    v_pat := v_patients[i];

    -- Spread across past 14 days, today, future 5 days
    IF i <= 8 THEN
      v_apt_at     := (CURRENT_DATE - ((9 - i) || ' days')::interval) + ((8 + (i % 8)) || ' hours')::interval + ((i * 7 % 60) || ' minutes')::interval;
      v_apt_status := 'completed';
    ELSIF i <= 14 THEN
      v_apt_at     := CURRENT_DATE + ((8 + (i - 8)) || ' hours')::interval + ((i * 13 % 60) || ' minutes')::interval;
      v_apt_status := CASE i
                        WHEN 9  THEN 'completed'
                        WHEN 10 THEN 'completed'
                        WHEN 11 THEN 'in_consultation'
                        WHEN 12 THEN 'checked_in'
                        WHEN 13 THEN 'scheduled'
                        ELSE        'scheduled'
                      END;
    ELSE
      v_apt_at     := (CURRENT_DATE + ((i - 14) || ' days')::interval) + ((9 + (i % 6)) || ' hours')::interval + ((i * 11 % 60) || ' minutes')::interval;
      v_apt_status := 'scheduled';
    END IF;

    v_visit_type := CASE (i % 4)
                      WHEN 0 THEN 'new'
                      WHEN 1 THEN 'follow_up'
                      WHEN 2 THEN 'walk_in'
                      ELSE        'new'
                    END;

    v_chief := (ARRAY[
      'Fever and body ache for 3 days',
      'Persistent cough with phlegm',
      'Sore throat and difficulty swallowing',
      'Chest pain on exertion',
      'Routine diabetes follow-up',
      'High blood pressure check',
      'Lower back pain',
      'Headache and dizziness',
      'Skin rash on forearms',
      'Knee pain since last week',
      'Heartburn after meals',
      'Sleep disturbance',
      'Common cold symptoms',
      'General health check-up',
      'Diarrhoea since yesterday',
      'Persistent fatigue',
      'Vaccination follow-up',
      'Dressing change',
      'Antenatal review',
      'Allergy flare-up'
    ])[i];

    INSERT INTO public.appointments
      (id, patient_id, doctor_staff_id, branch_id, appointment_at, duration_minutes,
       status, visit_type, chief_complaint, room, scheduled_by_staff_id, token_number,
       checked_in_at, completed_at, is_web_booking)
    VALUES
      (gen_random_uuid(), v_pat, v_doc, v_branch, v_apt_at, 30,
       v_apt_status, v_visit_type, v_chief,
       'Room ' || (1 + (i % 5)),
       v_admin,
       i,
       CASE WHEN v_apt_status IN ('checked_in','in_consultation','completed') THEN v_apt_at + interval '5 min' END,
       CASE WHEN v_apt_status = 'completed' THEN v_apt_at + interval '40 min' END,
       (i % 5 = 0))
    RETURNING id INTO v_apt;
    c_appts := c_appts + 1;

    IF v_apt_status IN ('completed', 'in_consultation') THEN
      v_diag := (ARRAY[
        'Acute viral fever',
        'Upper respiratory tract infection',
        'Acute pharyngitis',
        'Stable angina, controlled',
        'Type 2 Diabetes Mellitus, controlled',
        'Hypertension, stage 1',
        'Mechanical lower back pain',
        'Tension-type headache',
        'Contact dermatitis',
        'Osteoarthritis (knee)',
        'GERD',
        'Insomnia',
        'Common cold (rhinitis)',
        'Healthy adult — annual exam',
        'Acute gastroenteritis',
        'Iron-deficiency anaemia (mild)',
        'Post-vaccination review',
        'Wound healing well',
        'Antenatal — second trimester',
        'Allergic rhinitis'
      ])[i];

      v_plan := (ARRAY[
        'Hydration, antipyretics, return if fever > 3 days',
        'Symptomatic treatment, steam inhalation',
        'Antibiotic course, throat lozenges',
        'Continue current meds, ECG done, repeat in 2 weeks',
        'HbA1c review, lifestyle counselling, repeat FBS/PPBS',
        'Continue antihypertensives, salt restriction, BP log',
        'Rest, NSAIDs, physiotherapy referral',
        'Hydration, sleep hygiene, follow up if no relief',
        'Topical steroid, avoid suspected allergen',
        'Analgesia, knee strengthening exercises',
        'PPI for 4 weeks, lifestyle advice',
        'Sleep hygiene + short course mild sedative',
        'Symptomatic + rest + warm fluids',
        'All vitals normal, repeat annually',
        'ORS, dietary advice, antiemetic',
        'Iron supplements, dietary counselling',
        'No reaction, schedule for next dose',
        'Continue dressings on alternate days',
        'Iron + folate, ultrasound at next visit',
        'Antihistamine, environmental control'
      ])[i];

      INSERT INTO public.encounters
        (id, patient_id, doctor_staff_id, branch_id, appointment_id, encounter_type,
         status, started_at, ended_at,
         presenting_complaint, history, physical_examination, assessment, plan)
      VALUES
        (gen_random_uuid(), v_pat, v_doc, v_branch, v_apt, 'opd',
         CASE WHEN v_apt_status = 'completed' THEN 'finalised' ELSE 'draft' END,
         v_apt_at + interval '10 min',
         CASE WHEN v_apt_status = 'completed' THEN v_apt_at + interval '40 min' END,
         v_chief,
         CASE i
           WHEN 1  THEN 'No prior medical history. Non-smoker, occasional alcohol.'
           WHEN 5  THEN 'Type 2 DM since 2018, on Metformin 500 mg BD. No retinopathy/nephropathy.'
           WHEN 6  THEN 'HTN since 2019, on Telmisartan 40 mg OD. Family h/o cardiac.'
           WHEN 19 THEN 'G2P1L1, LMP confirmed, EDD calculated. No bleeding/leaking.'
           ELSE        'No significant past medical or family history.'
         END,
         CASE i
           WHEN 4  THEN 'CVS: S1S2 normal, no murmurs. BP 138/86. Pulse 78 regular.'
           WHEN 7  THEN 'Tenderness over L4-L5, SLR negative bilaterally. No neuro deficit.'
           WHEN 9  THEN 'Erythematous papules + scaling on bilateral forearms.'
           ELSE        'General: alert, oriented. Vitals stable. Systemic exam: unremarkable.'
         END,
         v_diag, v_plan)
      RETURNING id INTO v_enc;
      c_encounters := c_encounters + 1;

      INSERT INTO public.vitals
        (patient_id, encounter_id, recorded_by_staff_id, recorded_at,
         bp_systolic, bp_diastolic, pulse, spo2_pct, temp_celsius, blood_sugar_mgdl, height_cm, weight_kg)
      VALUES
        (v_pat, v_enc, v_admin, v_apt_at + interval '12 min',
         110 + (i * 3 % 40),
         70  + (i * 2 % 20),
         70  + (i % 25),
         96  + (i % 4),
         (36.5 + ((i % 7) * 0.3))::numeric,
         85  + (i * 5 % 80),
         (150 + (i * 3 % 40))::numeric,
         (55.0 + (i * 1.7))::numeric);

      INSERT INTO public.prescriptions
        (id, patient_id, encounter_id, branch_id, prescribed_by_staff_id, prescribed_at, status)
      VALUES
        (gen_random_uuid(), v_pat, v_enc, v_branch, v_doc, v_apt_at + interval '30 min',
         CASE WHEN v_apt_status = 'completed' THEN 'active' ELSE 'draft' END)
      RETURNING id INTO v_rx;

      INSERT INTO public.prescription_items
        (prescription_id, drug_name, strength, form, route, dosage, frequency, duration_days, qty, instructions, position)
      VALUES
        (v_rx,
          (ARRAY['Paracetamol','Azithromycin','Amoxicillin','Atorvastatin','Metformin','Telmisartan','Ibuprofen','Sumatriptan','Mometasone','Diclofenac','Pantoprazole','Zolpidem','Cetirizine','Multivitamin','Ondansetron','Ferrous Sulfate','Vitamin D3','Povidone Iodine','Folic Acid','Loratadine'])[i],
          (ARRAY['650 mg','500 mg','500 mg','20 mg','500 mg','40 mg','400 mg','50 mg','0.1%','50 mg','40 mg','5 mg','10 mg','OD','4 mg','325 mg','60K IU','5%','5 mg','10 mg'])[i],
          (ARRAY['tablet','tablet','tablet','tablet','tablet','tablet','tablet','tablet','cream','tablet','tablet','tablet','tablet','tablet','tablet','tablet','capsule','ointment','tablet','tablet'])[i],
          (ARRAY['oral','oral','oral','oral','oral','oral','oral','oral','topical','oral','oral','oral','oral','oral','oral','oral','oral','topical','oral','oral'])[i],
          '1 tablet','TDS', 5, 15, 'After meals', 0),
        (v_rx,
          'Pantoprazole', '40 mg', 'tablet', 'oral',
          '1 tablet','OD', 7, 7, 'Empty stomach, before breakfast', 1),
        (v_rx,
          (ARRAY['Cetirizine','Ambroxol','Domperidone','Metoprolol','Glimepiride','Amlodipine','Tramadol','Naproxen','Calamine','Etoricoxib','Sucralfate','Melatonin','Levocetirizine','Vitamin C','Loperamide','Vitamin B12','Calcium Citrate','Mupirocin','Iron','Fluticasone'])[i],
          (ARRAY['10 mg','30 mg','10 mg','25 mg','1 mg','5 mg','50 mg','250 mg','—','60 mg','1 g','3 mg','5 mg','500 mg','2 mg','1500 mcg','500 mg','2%','100 mg','50 mcg'])[i],
          'tablet', 'oral',
          '1 tablet','BD', 5, 10, 'As needed', 2);
      c_rx_items := c_rx_items + 3;
    END IF;
  END LOOP;

  ----------------------------------------------------------------------------
  -- 8. Lab orders (6) attached to recent finalised consultations
  ----------------------------------------------------------------------------
  c_lab_orders := 0;
  FOR rec IN
    SELECT e.id AS enc_id, e.patient_id, e.doctor_staff_id, e.started_at
    FROM public.encounters e
    WHERE e.patient_id = ANY(v_patients) AND e.status = 'finalised'
    ORDER BY e.started_at DESC
    LIMIT 6
  LOOP
    INSERT INTO public.lab_orders
      (id, branch_id, patient_id, encounter_id, ordering_doctor_staff_id, ordered_at, status, priority)
    VALUES
      (gen_random_uuid(), v_branch, rec.patient_id, rec.enc_id, rec.doctor_staff_id,
       rec.started_at + interval '20 min', 'completed', 'routine')
    RETURNING id INTO v_lo;
    c_lab_orders := c_lab_orders + 1;

    INSERT INTO public.lab_results (lab_order_id, lab_test_id, status, value_numeric, value_text, entered_at)
    SELECT v_lo, t_id, 'verified',
           CASE WHEN code IN ('LIPID','LFT','URINE_RM') THEN NULL ELSE 50 + (random()*100)::int END,
           CASE WHEN code = 'URINE_RM' THEN 'Normal — no pus cells, no albumin' ELSE NULL END,
           rec.started_at + interval '4 hours'
    FROM (
      SELECT id AS t_id, code FROM public.lab_tests
      WHERE code IN ('CBC','HB','FBS','HBA1C','LIPID','LFT','TSH','URINE_RM')
      ORDER BY random() LIMIT 3
    ) sub;
  END LOOP;

  ----------------------------------------------------------------------------
  -- 9. Done — return diagnostics
  ----------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'branch_id',         v_branch,
    'doctors',           c_doctors,
    'patients',          c_patients,
    'allergies',         5,
    'lab_tests_in_catalog', (SELECT count(*) FROM public.lab_tests WHERE is_active),
    'appointments',      c_appts,
    'encounters',        c_encounters,
    'prescription_items', c_rx_items,
    'lab_orders',        c_lab_orders,
    'seeded_at',         now()
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Run the seed once now.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT public.seed_demo_data();
