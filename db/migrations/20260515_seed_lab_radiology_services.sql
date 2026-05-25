-- ============================================================
-- Seed: comprehensive lab + radiology service catalog
-- Date: 2026-05-15
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
-- Idempotent: uses ON CONFLICT (branch_id, code) DO NOTHING.
--             Re-running won't change existing prices.
--
-- Adjust default prices below to match your branch's rate card.
-- Per-branch prices can also be edited later from
-- Settings → Lab profile → Service catalog UI.
-- ============================================================

do $$
declare
  b record;
  default_gst numeric := 0;             -- diagnostic services in India are typically GST-exempt
begin
  for b in select id from branches where is_active = true loop

    insert into services
      (branch_id, code, name, category, unit_price_cents, gst_rate, hsn_sac, is_active)
    values
    -- ── Haematology ───────────────────────────────────
    (b.id, 'LAB-CBC',          'Complete Blood Count (CBC)',                 'lab',     30000,  default_gst, '999316', true),
    (b.id, 'LAB-ESR',          'Erythrocyte Sedimentation Rate (ESR)',       'lab',     15000,  default_gst, '999316', true),
    (b.id, 'LAB-PT-INR',       'Prothrombin Time / INR',                     'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-APTT',         'Activated Partial Thromboplastin Time',      'lab',     45000,  default_gst, '999316', true),
    (b.id, 'LAB-DDIMER',       'D-Dimer',                                    'lab',    100000,  default_gst, '999316', true),
    (b.id, 'LAB-PERIPH',       'Peripheral Smear',                           'lab',     30000,  default_gst, '999316', true),
    (b.id, 'LAB-RETIC',        'Reticulocyte Count',                         'lab',     25000,  default_gst, '999316', true),
    (b.id, 'LAB-BLOODGROUP',   'Blood Group & Rh Typing',                    'lab',     15000,  default_gst, '999316', true),
    -- ── Biochemistry ──────────────────────────────────
    (b.id, 'LAB-FBS',          'Fasting Blood Sugar',                        'lab',     10000,  default_gst, '999316', true),
    (b.id, 'LAB-PPBS',         'Post-prandial Blood Sugar',                  'lab',     10000,  default_gst, '999316', true),
    (b.id, 'LAB-RBS',          'Random Blood Sugar',                         'lab',     10000,  default_gst, '999316', true),
    (b.id, 'LAB-HBA1C',        'HbA1c (Glycated Haemoglobin)',               'lab',     50000,  default_gst, '999316', true),
    (b.id, 'LAB-LFT',          'Liver Function Test panel (LFT)',            'lab',     60000,  default_gst, '999316', true),
    (b.id, 'LAB-KFT',          'Kidney Function Test panel (KFT/RFT)',       'lab',     60000,  default_gst, '999316', true),
    (b.id, 'LAB-LIPID',        'Lipid Profile',                              'lab',     50000,  default_gst, '999316', true),
    (b.id, 'LAB-ELECTRO',      'Electrolytes (Na/K/Cl)',                     'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-CRP',          'C-Reactive Protein (CRP)',                   'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-CALCIUM',      'Serum Calcium',                              'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-MAGNESIUM',    'Serum Magnesium',                            'lab',     25000,  default_gst, '999316', true),
    (b.id, 'LAB-PHOSPHORUS',   'Serum Phosphorus',                           'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-URIC',         'Serum Uric Acid',                            'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-AMYLASE',      'Serum Amylase',                              'lab',     35000,  default_gst, '999316', true),
    (b.id, 'LAB-LIPASE',       'Serum Lipase',                               'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-IRON',         'Serum Iron / TIBC',                          'lab',     45000,  default_gst, '999316', true),
    (b.id, 'LAB-FERRITIN',     'Serum Ferritin',                             'lab',     65000,  default_gst, '999316', true),
    (b.id, 'LAB-B12',          'Vitamin B12',                                'lab',     85000,  default_gst, '999316', true),
    (b.id, 'LAB-VITD',         'Vitamin D (25-OH)',                          'lab',    140000,  default_gst, '999316', true),
    (b.id, 'LAB-TROPI',        'Troponin I (qualitative)',                   'lab',     80000,  default_gst, '999316', true),
    (b.id, 'LAB-TROPI-Q',      'Troponin I (quantitative)',                  'lab',    140000,  default_gst, '999316', true),
    (b.id, 'LAB-CPK',          'CPK-MB',                                     'lab',     45000,  default_gst, '999316', true),
    (b.id, 'LAB-PROBNP',       'Pro-BNP (heart failure)',                    'lab',    200000,  default_gst, '999316', true),
    -- ── Endocrine ─────────────────────────────────────
    (b.id, 'LAB-TSH',          'Thyroid Stimulating Hormone (TSH)',          'lab',     30000,  default_gst, '999316', true),
    (b.id, 'LAB-T3T4',         'T3 / T4',                                    'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-FT3FT4',       'Free T3 / Free T4',                          'lab',     60000,  default_gst, '999316', true),
    (b.id, 'LAB-CORTISOL',     'Cortisol (AM)',                              'lab',     80000,  default_gst, '999316', true),
    (b.id, 'LAB-PROLACTIN',    'Prolactin',                                  'lab',     60000,  default_gst, '999316', true),
    (b.id, 'LAB-HCG',          'Beta-hCG (quantitative)',                    'lab',     65000,  default_gst, '999316', true),
    (b.id, 'LAB-INSULIN',      'Insulin (fasting)',                          'lab',     80000,  default_gst, '999316', true),
    (b.id, 'LAB-PSA',          'PSA (total)',                                'lab',     90000,  default_gst, '999316', true),
    -- ── Microbiology & Serology ───────────────────────
    (b.id, 'LAB-URINE-RM',     'Urine Routine & Microscopy',                 'lab',     12000,  default_gst, '999316', true),
    (b.id, 'LAB-URINE-CS',     'Urine Culture & Sensitivity',                'lab',     45000,  default_gst, '999316', true),
    (b.id, 'LAB-BLOOD-CS',     'Blood Culture & Sensitivity',                'lab',     80000,  default_gst, '999316', true),
    (b.id, 'LAB-SPUTUM-CS',    'Sputum Culture & Sensitivity',               'lab',     60000,  default_gst, '999316', true),
    (b.id, 'LAB-STOOL-RM',     'Stool Routine & Microscopy',                 'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-MALARIA',      'Malaria Antigen (RDT)',                      'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-DENGUE-NS1',   'Dengue NS1 Antigen',                         'lab',     50000,  default_gst, '999316', true),
    (b.id, 'LAB-DENGUE-AB',    'Dengue IgM/IgG Antibody',                    'lab',     70000,  default_gst, '999316', true),
    (b.id, 'LAB-TYPHIDOT',     'Typhoid (Typhidot IgM/IgG)',                 'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-WIDAL',        'Widal Test',                                 'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-HIV',          'HIV I & II (Rapid)',                         'lab',     40000,  default_gst, '999316', true),
    (b.id, 'LAB-HBSAG',        'HBsAg (Rapid)',                              'lab',     25000,  default_gst, '999316', true),
    (b.id, 'LAB-HCV',          'Anti-HCV (Rapid)',                           'lab',     35000,  default_gst, '999316', true),
    (b.id, 'LAB-VDRL',         'VDRL / RPR',                                 'lab',     20000,  default_gst, '999316', true),
    (b.id, 'LAB-COVID-RTPCR',  'COVID-19 RT-PCR',                            'lab',    100000,  default_gst, '999316', true),
    (b.id, 'LAB-COVID-RAT',    'COVID-19 Rapid Antigen Test',                'lab',     30000,  default_gst, '999316', true),
    -- ── Common panels ─────────────────────────────────
    (b.id, 'LAB-HEALTHCHK-B',  'Basic Health Check-up Package',              'lab',    100000,  default_gst, '999316', true),
    (b.id, 'LAB-HEALTHCHK-C',  'Comprehensive Health Check-up Package',      'lab',    250000,  default_gst, '999316', true),
    (b.id, 'LAB-DIABETIC-PKG', 'Diabetic Profile Package',                   'lab',    150000,  default_gst, '999316', true),
    (b.id, 'LAB-CARDIAC-PKG',  'Cardiac Risk Package',                       'lab',    220000,  default_gst, '999316', true),
    (b.id, 'LAB-THYROID-PKG',  'Thyroid Profile Package',                    'lab',     80000,  default_gst, '999316', true),
    (b.id, 'LAB-ANC-PKG',      'Antenatal Care Package (1st trimester)',     'lab',    180000,  default_gst, '999316', true),
    (b.id, 'LAB-PRE-OP',       'Pre-Operative Workup',                       'lab',    120000,  default_gst, '999316', true),

    -- ── Radiology / Imaging ───────────────────────────
    (b.id, 'IMG-XRAY-CHEST',   'X-ray Chest PA',                             'imaging',  30000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-CHEST-LAT','X-ray Chest Lateral',                       'imaging',  30000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-ABD',     'X-ray Abdomen (erect/supine)',               'imaging',  40000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-SKULL',   'X-ray Skull AP/Lat',                         'imaging',  40000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-SPINE-C', 'X-ray Cervical Spine',                       'imaging',  45000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-SPINE-L', 'X-ray Lumbar Spine',                         'imaging',  50000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-PELVIS',  'X-ray Pelvis',                               'imaging',  45000,  default_gst, '999316', true),
    (b.id, 'IMG-XRAY-LIMB',    'X-ray Limb (per view)',                      'imaging',  35000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-ABD',      'USG Abdomen',                                'imaging',  80000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-KUB',      'USG KUB',                                    'imaging',  70000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-PELVIS',   'USG Pelvis',                                 'imaging',  70000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-TVS',      'USG Transvaginal (TVS)',                     'imaging',  90000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-OBS',      'USG Obstetric / Anomaly scan',               'imaging', 150000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-THYR',     'USG Thyroid',                                'imaging',  90000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-BREAST',   'USG Breast (bilateral)',                     'imaging', 120000,  default_gst, '999316', true),
    (b.id, 'IMG-USG-NECK',     'USG Neck / Soft tissue',                     'imaging',  90000,  default_gst, '999316', true),
    (b.id, 'IMG-DOPPLER-LL',   'Doppler — Lower limb venous',                'imaging', 200000,  default_gst, '999316', true),
    (b.id, 'IMG-DOPPLER-CAR',  'Doppler — Carotid',                          'imaging', 250000,  default_gst, '999316', true),
    (b.id, 'IMG-DOPPLER-RENAL','Doppler — Renal',                            'imaging', 220000,  default_gst, '999316', true),
    (b.id, 'IMG-ECHO',         'Echocardiogram (2D Echo)',                   'imaging', 300000,  default_gst, '999316', true),
    (b.id, 'IMG-ECG',          'ECG (12-lead)',                              'imaging',  25000,  default_gst, '999316', true),
    (b.id, 'IMG-TMT',          'TMT (Treadmill stress test)',                'imaging', 350000,  default_gst, '999316', true),
    (b.id, 'IMG-HOLTER',       'Holter Monitor (24-hr)',                     'imaging', 450000,  default_gst, '999316', true),
    (b.id, 'IMG-CT-HEAD',      'CT — Head / Brain',                          'imaging', 350000,  default_gst, '999316', true),
    (b.id, 'IMG-CT-CHEST',     'CT — Chest',                                 'imaging', 550000,  default_gst, '999316', true),
    (b.id, 'IMG-CT-ABD',       'CT — Abdomen & Pelvis',                      'imaging', 700000,  default_gst, '999316', true),
    (b.id, 'IMG-CT-KUB',       'CT — KUB',                                   'imaging', 550000,  default_gst, '999316', true),
    (b.id, 'IMG-CT-ANGIO',     'CT Angiography (per region)',                'imaging',1000000,  default_gst, '999316', true),
    (b.id, 'IMG-MRI-BRAIN',    'MRI — Brain (plain)',                        'imaging', 600000,  default_gst, '999316', true),
    (b.id, 'IMG-MRI-SPINE',    'MRI — Spine (per region)',                   'imaging', 650000,  default_gst, '999316', true),
    (b.id, 'IMG-MRI-KNEE',     'MRI — Knee',                                 'imaging', 600000,  default_gst, '999316', true),
    (b.id, 'IMG-MRI-CONTRAST', 'MRI — Contrast surcharge',                   'imaging', 200000,  default_gst, '999316', true),
    (b.id, 'IMG-MAMMO',        'Mammography (bilateral)',                    'imaging', 250000,  default_gst, '999316', true),
    (b.id, 'IMG-DEXA',         'DEXA Bone Density Scan',                     'imaging', 350000,  default_gst, '999316', true),
    (b.id, 'IMG-EEG',          'EEG (Electroencephalography)',               'imaging', 250000,  default_gst, '999316', true),
    (b.id, 'IMG-PFT',          'PFT (Pulmonary Function Test)',              'imaging', 150000,  default_gst, '999316', true)

    on conflict (branch_id, code) do nothing;

  end loop;
end $$;

-- ── Archive non-lab services so they stop appearing in this project's dropdowns ──
-- (Safe: marks them inactive, doesn't delete; existing invoices keep working.)
-- Uncomment if you want to hide consultation/IPD/pharmacy/ambulance lines completely:
/*
update services
set is_active = false
where category in ('consultation','ipd_room','procedure','pharmacy','other');
*/

-- After running, verify count per category:
-- select category, count(*) from services where is_active group by category;
