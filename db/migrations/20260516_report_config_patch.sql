-- ============================================================
-- Patch for projects where hospital_settings already existed
-- before the report-config columns were introduced.
-- Idempotent: safe to re-run.
-- Date: 2026-05-16
-- ============================================================

-- ─── 1. Patch hospital_settings with new columns ─────────────────
alter table public.hospital_settings
  add column if not exists hospital_tagline               text,
  add column if not exists logo_url                       text,
  add column if not exists header_seal_urls               jsonb not null default '[]'::jsonb,
  add column if not exists footer_seal_urls               jsonb not null default '[]'::jsonb,
  add column if not exists header_tagline_lab             text,
  add column if not exists header_html                    text,
  add column if not exists footer_html                    text,
  add column if not exists general_instructions           jsonb not null default '[]'::jsonb,
  add column if not exists report_disclaimer              text,
  add column if not exists terms_overleaf                 text,
  add column if not exists accreditations                 jsonb not null default '[]'::jsonb,
  add column if not exists lab_report_template            text not null default 'standard',
  add column if not exists lab_report_print_mode          jsonb not null default jsonb_build_object(
    'headerMode',         'with-header',
    'footerMode',         'with-footer',
    'includeInstructions', true,
    'includeInfographics', true,
    'letterheadTopMm',     38,
    'letterheadBottomMm',  30
  ),
  add column if not exists watermark_text                 text,
  add column if not exists show_medico_legal_note         boolean not null default true;

-- ─── 2. lab_test_catalog_settings ─────────────────────────────────
create table if not exists public.lab_test_catalog_settings (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references public.branches(id) on delete cascade,
  category                text not null,
  general_instructions    jsonb,
  interpretation_template text,
  cover_page_html         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(branch_id, category)
);

alter table public.lab_test_catalog_settings enable row level security;

drop policy if exists lab_test_catalog_settings_read on public.lab_test_catalog_settings;
create policy lab_test_catalog_settings_read on public.lab_test_catalog_settings for select using (true);

drop policy if exists lab_test_catalog_settings_write on public.lab_test_catalog_settings;
create policy lab_test_catalog_settings_write on public.lab_test_catalog_settings for all using (
  coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin')
);

-- ─── 3. lab_tests report fields (guarded) ────────────────────────
do $$ begin
  if to_regclass('public.lab_tests') is not null then
    alter table public.lab_tests
      add column if not exists method                text,
      add column if not exists clinical_significance text,
      add column if not exists patient_instructions  jsonb,
      add column if not exists pre_test_preparation  text,
      add column if not exists infographic           jsonb;
  end if;
end $$;

-- ─── 4. staff signature columns ──────────────────────────────────
alter table public.staff
  add column if not exists signature_data_url    text,
  add column if not exists signature_role        text,
  add column if not exists signature_uploaded_at timestamptz;

-- ─── 5. lab_orders reporter (guarded) ────────────────────────────
do $$ begin
  if to_regclass('public.lab_orders') is not null then
    alter table public.lab_orders
      add column if not exists reported_by_staff_id uuid references public.staff(id),
      add column if not exists reported_at          timestamptz;
  end if;
end $$;

-- ─── 6. Storage buckets ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lab-assets', 'lab-assets', true,  2 * 1024 * 1024,
   array['image/png','image/jpeg','image/svg+xml','image/webp']),
  ('signatures', 'signatures', false, 512 * 1024,
   array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists lab_assets_write on storage.objects;
create policy lab_assets_write on storage.objects
  for all using (
    bucket_id = 'lab-assets'
    and coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin')
  );

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

-- ─── 7. Seed default instructions into existing rows ─────────────
update public.hospital_settings
set general_instructions = jsonb_build_array(
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
    report_disclaimer = coalesce(report_disclaimer,
      'This report is intended solely for patient education and informational purposes and does not constitute a final medical diagnosis. All findings must be clinically correlated by a qualified medical practitioner. This report is not valid for medico-legal purposes.'),
    terms_overleaf = coalesce(terms_overleaf,
      'All investigations are limited by the sensitivity and speciality of the assay and the condition of the specimen received by the laboratory. Assay result should be interpreted only in the context of other clinical findings and the clinical status of the patient.')
where general_instructions is null
   or jsonb_typeof(general_instructions) <> 'array'
   or jsonb_array_length(general_instructions) = 0;

-- ─── 8. Trigger helper + triggers ────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_hospital_settings_updated_at on public.hospital_settings;
create trigger trg_hospital_settings_updated_at
  before update on public.hospital_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_lab_test_catalog_settings_updated_at on public.lab_test_catalog_settings;
create trigger trg_lab_test_catalog_settings_updated_at
  before update on public.lab_test_catalog_settings
  for each row execute function public.set_updated_at();

-- ─── 9. Verify ───────────────────────────────────────────────────
select column_name
from information_schema.columns
where table_schema='public' and table_name='hospital_settings'
  and column_name in ('logo_url','header_seal_urls','footer_seal_urls','general_instructions','accreditations','lab_report_print_mode','watermark_text')
order by column_name;
