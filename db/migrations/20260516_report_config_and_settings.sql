-- ============================================================
-- Report configuration & lab settings
-- Date: 2026-05-16
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Adds tables/columns powering the Sree Diagnostics-style lab
-- report template:
--   • hospital_settings           (branch-level branding & content)
--   • lab_test_catalog_settings   (per-category overrides)
--   • lab_tests + report fields   (method, instructions, infographic)
--   • staff + signature columns
--
-- All operations are idempotent.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 1. hospital_settings ───────────────────────────────────────────
create table if not exists hospital_settings (
  id                       uuid primary key default gen_random_uuid(),
  branch_id                uuid not null references branches(id) on delete cascade,
  hospital_name            text not null default '',
  hospital_tagline         text,
  -- Structured address (used by pharmacy invoice)
  hospital_address_line1   text,
  hospital_address_line2   text,
  hospital_city            text,
  hospital_state           text,
  hospital_pincode         text,
  hospital_country         text default 'India',
  hospital_phone           text,
  hospital_alt_phone       text,
  hospital_email           text,
  hospital_website         text,
  hospital_logo_url        text,
  hospital_address         text,                  -- flat fallback
  -- Pharmacy
  pharmacy_name            text default '',
  pharmacy_address         text,
  pharmacy_phone           text,
  pharmacy_email           text,
  pharmacy_license         text,
  -- Drug license
  drug_license_retail_number    text,
  drug_license_wholesale_number text,
  drug_license_issuing_authority text,
  drug_license_issued_on        date,
  drug_license_valid_until      date,
  -- Pharmacist
  pharmacist_name              text,
  pharmacist_qualification     text,
  pharmacist_registration_number text,
  pharmacist_registration_council text,
  -- Tax / legal
  gst_number               text,
  pan_number               text,
  fssai_number             text,
  cin_number               text,
  registration_number      text,
  hospital_registration_number text,
  -- Bank
  bank_name                text,
  bank_account_number      text,
  bank_ifsc                text,
  upi_id                   text,
  -- Receipt footer (pharmacy + lab share)
  receipt_footer_note      text,
  receipt_terms_and_conditions text,
  -- Lab-report branding assets
  logo_url                 text,
  header_seal_urls         jsonb not null default '[]'::jsonb, -- [{name,url}]
  footer_seal_urls         jsonb not null default '[]'::jsonb, -- [{name,url}]
  header_tagline_lab       text,
  header_html              text,
  footer_html              text,
  -- Report content
  general_instructions     jsonb not null default '[]'::jsonb, -- [{title,bullets[]}]
  report_disclaimer        text,
  terms_overleaf           text,
  accreditations           jsonb not null default '[]'::jsonb, -- [{label,number}]
  -- Print mode
  lab_report_template      text not null default 'standard',   -- 'standard' | 'sree'
  lab_report_print_mode    jsonb not null default jsonb_build_object(
    'headerMode',         'with-header',
    'footerMode',         'with-footer',
    'includeInstructions', true,
    'includeInfographics', true,
    'letterheadTopMm',     38,
    'letterheadBottomMm',  30
  ),
  watermark_text           text,
  show_medico_legal_note   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique(branch_id)
);

create index if not exists hospital_settings_branch_idx
  on hospital_settings(branch_id);

alter table hospital_settings enable row level security;

drop policy if exists hospital_settings_read on hospital_settings;
create policy hospital_settings_read on hospital_settings
  for select using (true);

drop policy if exists hospital_settings_write on hospital_settings;
create policy hospital_settings_write on hospital_settings
  for all using (
    coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin')
  );

-- ── 2. lab_test_catalog_settings (per-category overrides) ──────────
create table if not exists lab_test_catalog_settings (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references branches(id) on delete cascade,
  category                text not null,
  general_instructions    jsonb,                  -- null = inherit branch
  interpretation_template text,
  cover_page_html         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(branch_id, category)
);

create index if not exists lab_test_catalog_settings_branch_idx
  on lab_test_catalog_settings(branch_id);

alter table lab_test_catalog_settings enable row level security;

drop policy if exists lab_test_catalog_settings_read on lab_test_catalog_settings;
create policy lab_test_catalog_settings_read on lab_test_catalog_settings
  for select using (true);

drop policy if exists lab_test_catalog_settings_write on lab_test_catalog_settings;
create policy lab_test_catalog_settings_write on lab_test_catalog_settings
  for all using (
    coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin')
  );

-- ── 3. lab_tests: report fields ────────────────────────────────────
alter table lab_tests
  add column if not exists method                text,
  add column if not exists clinical_significance text,
  add column if not exists patient_instructions  jsonb,  -- [{title,bullets[]}] or null
  add column if not exists pre_test_preparation  text,
  add column if not exists infographic           jsonb;  -- {ranges:[…], causes:[…], interpretation}

-- ── 4. staff: signature columns ────────────────────────────────────
alter table staff
  add column if not exists signature_data_url   text,
  add column if not exists signature_role       text,  -- 'technician'|'pathologist'|'radiologist'|'doctor'
  add column if not exists signature_uploaded_at timestamptz;

-- ── 5. lab_orders: reporter (verifying pathologist) ────────────────
-- Needed so the report footer can show "Approved by Dr. X" distinct
-- from "Reported by tech Y". If the column already exists this is a no-op.
alter table lab_orders
  add column if not exists reported_by_staff_id uuid references staff(id),
  add column if not exists reported_at          timestamptz;

-- ── 6. Storage buckets for branding assets & signatures ────────────
-- Public bucket for logos/seals (readable by report popup).
-- Private bucket for raw signature uploads (referenced by data URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lab-assets', 'lab-assets', true,  2 * 1024 * 1024,
   array['image/png','image/jpeg','image/svg+xml','image/webp']),
  ('signatures', 'signatures', false, 512 * 1024,
   array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

-- Public read for lab-assets
drop policy if exists lab_assets_read on storage.objects;
create policy lab_assets_read on storage.objects
  for select using (bucket_id = 'lab-assets');

drop policy if exists lab_assets_write on storage.objects;
create policy lab_assets_write on storage.objects
  for all using (
    bucket_id = 'lab-assets'
    and coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin')
  );

-- Signatures: staff can read/write their own, admins all
drop policy if exists signatures_read on storage.objects;
create policy signatures_read on storage.objects
  for select using (
    bucket_id = 'signatures'
    and (
      coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin','hr')
      or owner = auth.uid()
    )
  );

drop policy if exists signatures_write on storage.objects;
create policy signatures_write on storage.objects
  for all using (
    bucket_id = 'signatures'
    and (
      coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin','hr')
      or owner = auth.uid()
    )
  );

-- ── 7. Seed default hospital_settings + instructions ───────────────
insert into hospital_settings (
  branch_id, hospital_name, hospital_address,
  hospital_address_line1, hospital_city, hospital_state, hospital_pincode,
  hospital_phone, hospital_email, hospital_website,
  hospital_tagline,
  general_instructions, report_disclaimer, terms_overleaf,
  accreditations
)
select
  b.id,
  b.name,
  coalesce(
    nullif(concat_ws(', ',
      b.address->>'line1', b.address->>'line2',
      b.address->>'city',  b.address->>'state', b.address->>'pincode'
    ), ''),
    'Address not configured'
  ),
  b.address->>'line1',
  b.address->>'city',
  b.address->>'state',
  b.address->>'pincode',
  b.phone,
  b.email,
  b.website,
  coalesce(b.tagline, 'Advanced Health Analytics. Simplified for You.'),
  jsonb_build_array(
    jsonb_build_object(
      'title','Follow Medical Advice',
      'bullets', jsonb_build_array(
        'Please consult your physician for proper interpretation of this report.',
        'Do not start or stop any medication without medical guidance.'
      )
    ),
    jsonb_build_object(
      'title','Maintain a Balanced Diet',
      'bullets', jsonb_build_array(
        'Include fresh fruits and vegetables daily.',
        'Reduce excess salt, sugar, and oily foods.',
        'Stay hydrated (6-8 glasses of water per day unless advised otherwise).'
      )
    ),
    jsonb_build_object(
      'title','Regular Physical Activity',
      'bullets', jsonb_build_array(
        'Engage in at least 30 minutes of moderate exercise (walking, cycling, yoga, etc.) at least 5 days a week, as advised by your doctor.'
      )
    ),
    jsonb_build_object(
      'title','Monitor Key Health Parameters',
      'bullets', jsonb_build_array(
        'Check blood pressure regularly.',
        'Monitor blood sugar levels.',
        'Track weight and BMI.'
      )
    ),
    jsonb_build_object(
      'title','Adequate Rest & Stress Management',
      'bullets', jsonb_build_array(
        'Sleep 6-8 hours daily.',
        'Practice relaxation techniques like meditation or breathing exercises.'
      )
    ),
    jsonb_build_object(
      'title','Avoid Harmful Habits',
      'bullets', jsonb_build_array(
        'Avoid smoking and tobacco use.',
        'Limit alcohol consumption.'
      )
    ),
    jsonb_build_object(
      'title','Periodic Health Checkups',
      'bullets', jsonb_build_array(
        'Routine health screenings help detect issues early and prevent complications.'
      )
    )
  ),
  'This report is intended solely for patient education and informational purposes and does not constitute a final medical diagnosis. All findings must be clinically correlated by a qualified medical practitioner. This report is not valid for medico-legal purposes.',
  'All investigations are limited by the sensitivity and speciality of the assay and the condition of the specimen received by the laboratory. Assay result should be interpreted only in the context of other clinical findings and the clinical status of the patient.',
  '[]'::jsonb
from branches b
on conflict (branch_id) do nothing;

-- ── 8. updated_at trigger helpers ──────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_hospital_settings_updated_at on hospital_settings;
create trigger trg_hospital_settings_updated_at
  before update on hospital_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_lab_test_catalog_settings_updated_at on lab_test_catalog_settings;
create trigger trg_lab_test_catalog_settings_updated_at
  before update on lab_test_catalog_settings
  for each row execute function public.set_updated_at();

-- ── 9. Verify ──────────────────────────────────────────────────────
select 'hospital_settings'           as table_name, count(*) from hospital_settings
union all
select 'lab_test_catalog_settings',  count(*) from lab_test_catalog_settings;
