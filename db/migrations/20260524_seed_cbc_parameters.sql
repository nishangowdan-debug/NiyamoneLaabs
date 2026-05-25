-- ============================================================
-- Seed CBC parameter rows from the lab-template reference
-- Date:        2026-05-24
-- Depends on:  20260524_lab_test_parameters.sql
-- Idempotent:  re-seeds CBC parameters every time (delete + insert in one txn)
-- ============================================================

do $$
declare
  v_test_id uuid;
begin
  select id into v_test_id from lab_tests where code = 'CBC' limit 1;
  if v_test_id is null then
    raise notice 'CBC test not found in lab_tests — skipping parameter seed.';
    return;
  end if;

  -- Wipe and re-insert so re-running this script keeps the row set in sync
  delete from lab_test_parameters where lab_test_id = v_test_id;

  insert into lab_test_parameters (
    lab_test_id, sno, is_section_header, section, parameter,
    unit, low_value, high_value, normal_range_display, method, ref_overrides
  ) values
    -- ── Primary haematology block ──
    (v_test_id,  1, false, null, 'Haemoglobin',                 'gm/dl',       13.0,  18.0,  'Male: 13.5 - 18.0',  'Spectrophotometry',
       '[{"scope":"male","low":13.5,"high":18.0,"display":"Male: 13.5 - 18.0"},
         {"scope":"female","low":11.5,"high":16.0,"display":"Female: 11.5 - 16.0"}]'::jsonb),
    (v_test_id,  2, false, null, 'RBC Count',                   'mill/cumm',    4.5,   5.5,  'Male: 4.5 - 5.5',    'Electrical Impedance',
       '[{"scope":"male","low":4.5,"high":5.5,"display":"Male: 4.5 - 5.5"},
         {"scope":"female","low":3.8,"high":4.8,"display":"Female: 3.8 - 4.8"}]'::jsonb),
    (v_test_id,  3, false, null, 'WBC Count',                   'cells/cumm', 4000, 11000, '4000 - 11000',         'Electrical Impedance', '[]'::jsonb),
    (v_test_id,  4, false, null, 'Platelet Count',              'lacks/cumm',  1.50,  4.50, '1.50 - 4.50',          'Electrical Impedance', '[]'::jsonb),
    (v_test_id,  5, false, null, 'Haematocrit (PCV)',           '%',           40.0,  54.0, '40 - 54',              'Calculated',           '[]'::jsonb),
    (v_test_id,  6, false, null, 'Mean Corpuscular Volume (MCV)','fL',         83.0,  101.0,'83 - 101',             'RBC Histogram',        '[]'::jsonb),
    (v_test_id,  7, false, null, 'Mean Corpuscular Haemoglobin (MCH)', 'Pg',  27.0,   32.0, '27 - 32',              'Calculated',           '[]'::jsonb),
    (v_test_id,  8, false, null, 'Mean Corp. Haemoconc. (MCHC)', 'g/dl',       32.0,   35.0, '32 - 35',              'Calculated',           '[]'::jsonb),

    -- ── Section header ──
    (v_test_id,  9, true,  'DIFFERENTIAL COUNT', 'DIFFERENTIAL COUNT:', null, null, null, null, null, '[]'::jsonb),

    -- ── Differential count block ──
    (v_test_id, 10, false, 'DIFFERENTIAL COUNT', 'Polymorphs',  '%', 40.0, 75.0, '40 - 75', null, '[]'::jsonb),
    (v_test_id, 11, false, 'DIFFERENTIAL COUNT', 'Lymphocytes', '%', 20.0, 40.0, '20 - 40', null, '[]'::jsonb),
    (v_test_id, 12, false, 'DIFFERENTIAL COUNT', 'Eosinophils', '%',  2.0,  6.0, '02 - 06', null, '[]'::jsonb),
    (v_test_id, 13, false, 'DIFFERENTIAL COUNT', 'Monocytes',   '%',  2.0, 10.0, '02 - 10', null, '[]'::jsonb),
    (v_test_id, 14, false, 'DIFFERENTIAL COUNT', 'Basophils',   '%',  0.0,  1.0, '00 - 01', null, '[]'::jsonb);
end $$;
