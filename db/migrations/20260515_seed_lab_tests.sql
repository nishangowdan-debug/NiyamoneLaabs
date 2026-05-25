-- ============================================================
-- Seed: lab_tests catalog (40 common tests)
--       + lab_test_prices for every active branch
--       + home-collection flags
-- Date: 2026-05-15
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Idempotent on lab_tests.code (uses ON CONFLICT DO UPDATE).
-- Re-run safely; prices and flags refresh, codes don't dup.
-- ============================================================

-- ── 1. Lab tests catalog ───────────────────────────────────────────
insert into lab_tests
  (code, name, category, specimen_type, unit,
   ref_min, ref_max, critical_low, critical_high, turnaround_hours, is_active)
values
-- Haematology
  ('CBC',          'Complete Blood Count',              'haematology',   'blood', 'cells/mcL', null,  null, null,  null, 4,  true),
  ('HB',           'Haemoglobin',                       'haematology',   'blood', 'g/dL',      12.0,  17.0, 7.0,   20.0, 2,  true),
  ('PCV',          'Packed Cell Volume',                'haematology',   'blood', '%',         36,    50,   20,    60,   4,  true),
  ('PLT',          'Platelet Count',                    'haematology',   'blood', 'lakh/mcL',  1.5,   4.5,  0.5,   10.0, 4,  true),
  ('ESR',          'Erythrocyte Sedimentation Rate',    'haematology',   'blood', 'mm/hr',     0,     20,   null,  null, 4,  true),
  ('PT-INR',       'Prothrombin Time / INR',            'haematology',   'plasma','seconds',   11,    14,   null,  null, 6,  true),
  ('APTT',         'Activated Partial Thromboplastin',  'haematology',   'plasma','seconds',   25,    35,   null,  null, 6,  true),
  ('D-DIMER',      'D-Dimer',                           'haematology',   'plasma','ng/mL',     0,     500,  null,  null, 6,  true),
  ('BLOOD-GROUP',  'Blood Group & Rh Typing',           'haematology',   'blood', null,        null,  null, null,  null, 2,  true),

-- Biochemistry
  ('FBS',          'Fasting Blood Sugar',               'biochemistry',  'serum', 'mg/dL',     70,    100,  40,    400,  2,  true),
  ('PPBS',         'Post-prandial Blood Sugar',         'biochemistry',  'serum', 'mg/dL',     100,   140,  40,    400,  2,  true),
  ('RBS',          'Random Blood Sugar',                'biochemistry',  'serum', 'mg/dL',     70,    140,  40,    400,  2,  true),
  ('HBA1C',        'HbA1c (Glycated Haemoglobin)',      'biochemistry',  'blood', '%',         4.0,   5.7,  null,  null, 24, true),
  ('LFT',          'Liver Function Test (panel)',       'biochemistry',  'serum', null,        null,  null, null,  null, 6,  true),
  ('RFT',          'Renal Function Test (panel)',       'biochemistry',  'serum', null,        null,  null, null,  null, 6,  true),
  ('LIPID',        'Lipid Profile',                     'biochemistry',  'serum', null,        null,  null, null,  null, 6,  true),
  ('CHOL',         'Total Cholesterol',                 'biochemistry',  'serum', 'mg/dL',     0,     200,  null,  null, 6,  true),
  ('CREAT',        'Serum Creatinine',                  'biochemistry',  'serum', 'mg/dL',     0.6,   1.3,  null,  5.0,  4,  true),
  ('UREA',         'Blood Urea',                        'biochemistry',  'serum', 'mg/dL',     7,     20,   null,  100,  4,  true),
  ('NA-K-CL',      'Electrolytes (Na/K/Cl)',            'biochemistry',  'serum', 'mmol/L',    null,  null, null,  null, 4,  true),
  ('CALCIUM',      'Serum Calcium',                     'biochemistry',  'serum', 'mg/dL',     8.5,   10.5, 6.0,   13.0, 4,  true),
  ('URIC-ACID',    'Serum Uric Acid',                   'biochemistry',  'serum', 'mg/dL',     3.5,   7.2,  null,  null, 4,  true),
  ('CRP',          'C-Reactive Protein',                'biochemistry',  'serum', 'mg/L',      0,     5,    null,  null, 6,  true),
  ('TROP-I',       'Troponin I',                        'biochemistry',  'serum', 'ng/mL',     0,     0.04, null,  null, 2,  true),
  ('PRO-BNP',      'Pro-BNP',                           'biochemistry',  'serum', 'pg/mL',     0,     125,  null,  null, 4,  true),

-- Endocrinology
  ('TSH',          'Thyroid Stimulating Hormone',       'endocrinology', 'serum', 'mIU/L',     0.4,   4.5,  null,  null, 6,  true),
  ('T3',           'Total T3',                          'endocrinology', 'serum', 'ng/dL',     80,    200,  null,  null, 6,  true),
  ('T4',           'Total T4',                          'endocrinology', 'serum', 'mcg/dL',    5.0,   12.0, null,  null, 6,  true),
  ('VIT-D',        'Vitamin D (25-OH)',                 'endocrinology', 'serum', 'ng/mL',     30,    100,  null,  null, 24, true),
  ('VIT-B12',      'Vitamin B12',                       'endocrinology', 'serum', 'pg/mL',     200,   900,  null,  null, 24, true),
  ('CORTISOL-AM',  'Cortisol (8 AM)',                   'endocrinology', 'serum', 'mcg/dL',    6,     23,   null,  null, 24, true),
  ('PSA',          'PSA (total)',                       'endocrinology', 'serum', 'ng/mL',     0,     4.0,  null,  null, 24, true),

-- Urinalysis
  ('URINE-RM',     'Urine Routine & Microscopy',        'urinalysis',    'urine', null,        null,  null, null,  null, 4,  true),
  ('URINE-CS',     'Urine Culture & Sensitivity',       'microbiology',  'urine', null,        null,  null, null,  null, 48, true),
  ('MICRO-ALB',    'Urine Microalbumin',                'urinalysis',    'urine', 'mg/L',      0,     30,   null,  null, 24, true),

-- Microbiology / Serology
  ('BLOOD-CS',     'Blood Culture & Sensitivity',       'microbiology',  'blood', null,        null,  null, null,  null, 72, true),
  ('SPUTUM-CS',    'Sputum Culture & Sensitivity',      'microbiology',  'sputum',null,        null,  null, null,  null, 72, true),
  ('STOOL-RM',     'Stool Routine & Microscopy',        'microbiology',  'stool', null,        null,  null, null,  null, 24, true),
  ('MALARIA',      'Malaria Antigen (RDT)',             'immunology',    'blood', null,        null,  null, null,  null, 2,  true),
  ('DENGUE-NS1',   'Dengue NS1 Antigen',                'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('TYPHIDOT',     'Typhoid (Typhidot IgM/IgG)',        'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('WIDAL',        'Widal Test',                        'immunology',    'serum', 'titre',     null,  null, null,  null, 4,  true),
  ('HIV',          'HIV I & II (Rapid)',                'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('HBSAG',        'HBsAg',                             'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('HCV',          'Anti-HCV',                          'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('VDRL',         'VDRL / RPR',                        'immunology',    'serum', null,        null,  null, null,  null, 4,  true),
  ('COVID-PCR',    'COVID-19 RT-PCR',                   'microbiology',  'swab',  null,        null,  null, null,  null, 24, true),
  ('COVID-RAT',    'COVID-19 Rapid Antigen Test',       'immunology',    'swab',  null,        null,  null, null,  null, 1,  true)
on conflict (code) do update
  set name             = excluded.name,
      category         = excluded.category,
      specimen_type    = excluded.specimen_type,
      unit             = excluded.unit,
      ref_min          = excluded.ref_min,
      ref_max          = excluded.ref_max,
      critical_low     = excluded.critical_low,
      critical_high    = excluded.critical_high,
      turnaround_hours = excluded.turnaround_hours,
      is_active        = excluded.is_active;

-- ── 2. Prices + home-collection flags per branch ───────────────────
do $$
declare
  b record;
  t record;
  v_eligible boolean;
  v_price numeric;
  v_surcharge numeric := 150;
begin
  for b in select id from branches where is_active = true loop
    for t in select * from lab_tests where is_active = true loop

      v_eligible := t.specimen_type in ('blood','serum','plasma','urine','stool','sputum','swab');

      v_price := case t.category
        when 'haematology'    then 300
        when 'biochemistry'   then 400
        when 'endocrinology'  then 600
        when 'immunology'     then 500
        when 'microbiology'   then 600
        when 'urinalysis'     then 200
        else 400
      end;

      -- Hand-tuned overrides for common high-volume tests
      v_price := case t.code
        when 'CBC'        then 300
        when 'HB'         then 150
        when 'FBS'        then 100
        when 'PPBS'       then 100
        when 'RBS'        then 100
        when 'HBA1C'      then 500
        when 'LFT'        then 600
        when 'RFT'        then 600
        when 'LIPID'      then 500
        when 'TSH'        then 300
        when 'VIT-D'      then 1400
        when 'VIT-B12'    then 850
        when 'URINE-RM'   then 120
        when 'BLOOD-GROUP' then 150
        when 'CRP'        then 400
        when 'MALARIA'    then 200
        when 'DENGUE-NS1' then 500
        when 'COVID-PCR'  then 1000
        when 'COVID-RAT'  then 300
        when 'HIV'        then 400
        else v_price
      end;

      insert into lab_test_prices
        (branch_id, lab_test_id, price_inr,
         home_collection_eligible, home_collection_surcharge_inr, is_active)
      values
        (b.id, t.id, v_price,
         v_eligible, case when v_eligible then v_surcharge else 0 end, true)
      on conflict (branch_id, lab_test_id) do update
        set price_inr                     = excluded.price_inr,
            home_collection_eligible      = excluded.home_collection_eligible,
            home_collection_surcharge_inr = excluded.home_collection_surcharge_inr,
            is_active                     = true;

    end loop;
  end loop;
end $$;

-- ── 3. Verify ──────────────────────────────────────────────────────
select
  (select count(*) from lab_tests where is_active) as tests_seeded,
  (select count(*) from lab_test_prices where is_active) as priced_rows,
  (select count(*) from lab_test_prices where home_collection_eligible) as home_eligible;
