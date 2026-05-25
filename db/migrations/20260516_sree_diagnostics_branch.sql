-- ============================================================
-- Sree Diagnostics — Vijayawada
-- Date: 2026-05-16
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Replaces the legacy "Srinivasa Hospital — Hyderabad" demo branch
-- with the real-world Sree Diagnostics tenant. Populates both the
-- `branches` row (used by invoice header, prescription header, branch
-- switcher, etc.) and the `hospital_settings` row (used by lab report
-- header/footer, accreditations, disclaimers, instructions).
--
-- Effect: every invoice, lab report, prescription, and export header
-- for this branch now prints the Sree Diagnostics identity.
--
-- All operations are idempotent.
-- ============================================================

-- ── 1. Retire the legacy Hyderabad branch ──────────────────────────
-- Existing data (invoices, orders, payments) keeps its FK to HYD so we
-- soft-disable rather than delete. The branch switcher hides inactive
-- branches; reports for HYD-era records remain queryable.
update public.branches
   set is_active = false,
       updated_at = now()
 where code = 'HYD';

-- ── 2. Upsert the Sree Diagnostics branch ──────────────────────────
insert into public.branches (
  code, name, tagline, gstin, tax_state, registration_no,
  phone, email, website, logo_url, address,
  prescription_header, prescription_footer, is_active
) values (
  'SREE-VJW',
  'Sree Diagnostics — Vijayawada',
  'Accurate diagnostics. Trusted reports.',
  null,
  'AP',
  'QA-53036/0425',
  '8008331234',
  'sreediagnostics9@gmail.com',
  'sreediagnostics.in',
  null,
  jsonb_build_object(
    'line1',   'High Tension Road, APIIC Colony',
    'line2',   'Bharathi Nagar (adjacent to Masjid & Anuradha Hospital)',
    'city',    'Vijayawada',
    'state',   'Andhra Pradesh',
    'pin',     '520007',
    'country', 'IN'
  ),
  'Sree Diagnostics',
  'Powered by Niyamone technology · sreediagnostics.in',
  true
)
on conflict (code) do update set
  name                = excluded.name,
  tagline             = excluded.tagline,
  tax_state           = excluded.tax_state,
  registration_no     = excluded.registration_no,
  phone               = excluded.phone,
  email               = excluded.email,
  website             = excluded.website,
  address             = excluded.address,
  prescription_header = excluded.prescription_header,
  prescription_footer = excluded.prescription_footer,
  is_active           = true,
  updated_at          = now();

-- ── 3. Upsert hospital_settings for the lab report layout ──────────
do $$
declare
  v_branch_id uuid;
begin
  select id into v_branch_id
  from public.branches
  where code = 'SREE-VJW';

  if v_branch_id is null then
    raise exception 'Sree Diagnostics branch missing — branches insert failed.';
  end if;

  insert into public.hospital_settings (
    branch_id,
    hospital_name,
    hospital_tagline,
    hospital_address_line1,
    hospital_address_line2,
    hospital_city,
    hospital_state,
    hospital_pincode,
    hospital_country,
    hospital_phone,
    hospital_email,
    hospital_website,
    hospital_address,
    pharmacy_name,
    registration_number,
    hospital_registration_number,
    receipt_footer_note,
    receipt_terms_and_conditions,
    header_tagline_lab,
    general_instructions,
    report_disclaimer,
    terms_overleaf,
    accreditations,
    lab_report_template,
    show_medico_legal_note
  ) values (
    v_branch_id,
    'Sree Diagnostics',
    'ISO 9001:2015 Certified Diagnostic Laboratory',
    'High Tension Road, APIIC Colony',
    'Bharathi Nagar (adjacent to Masjid & Anuradha Hospital)',
    'Vijayawada',
    'Andhra Pradesh',
    '520007',
    'India',
    '8008331234',
    'sreediagnostics9@gmail.com',
    'sreediagnostics.in',
    'High Tension Road, APIIC Colony, Bharathi Nagar, Vijayawada, Andhra Pradesh 520007',
    'Sree Diagnostics Pharmacy',
    'QA-53036/0425',
    'QA-53036/0425',
    'Thank you for trusting Sree Diagnostics. Get well soon.',
    'Reports are valid only when carrying the laboratory seal and approving pathologist signature.',
    'Accurate diagnostics. Trusted reports.',
    jsonb_build_array(
      jsonb_build_object(
        'title', 'Follow Medical Advice',
        'bullets', jsonb_build_array(
          'Please consult your physician for proper interpretation of this report.',
          'Do not start or stop any medication without medical guidance.'
        )
      ),
      jsonb_build_object(
        'title', 'Maintain a Balanced Diet',
        'bullets', jsonb_build_array(
          'Include fresh fruits and vegetables daily.',
          'Reduce excess salt, sugar, and oily foods.',
          'Stay hydrated (6-8 glasses of water per day unless advised otherwise).'
        )
      ),
      jsonb_build_object(
        'title', 'Regular Physical Activity',
        'bullets', jsonb_build_array(
          'Engage in at least 30 minutes of moderate exercise (walking, cycling, yoga, etc.) at least 5 days a week, as advised by your doctor.'
        )
      ),
      jsonb_build_object(
        'title', 'Periodic Health Checkups',
        'bullets', jsonb_build_array(
          'Routine health screenings help detect issues early and prevent complications.'
        )
      )
    ),
    'This report is intended solely for patient education and informational purposes and does not constitute a final medical diagnosis. All findings must be clinically correlated by a qualified medical practitioner. This report is not valid for medico-legal purposes.',
    'Testing workflows adhere to international protocols established by the CLSI (Clinical and Laboratory Standards Institute). All investigations are limited by the sensitivity and specificity of the assay and the condition of the specimen received by the laboratory. Results should be interpreted in the context of clinical findings.',
    jsonb_build_array(
      jsonb_build_object('label', 'ISO 9001:2015 Certified', 'number', 'ISO 9001:2015'),
      jsonb_build_object('label', 'Quality Control Approval', 'number', 'QA-53036/0425'),
      jsonb_build_object('label', 'CLSI Guidelines', 'number', 'CLSI'),
      jsonb_build_object('label', 'Powered by Niyamone Technology', 'number', null)
    ),
    'sree',
    true
  )
  on conflict (branch_id) do update set
    hospital_name                = excluded.hospital_name,
    hospital_tagline             = excluded.hospital_tagline,
    hospital_address_line1       = excluded.hospital_address_line1,
    hospital_address_line2       = excluded.hospital_address_line2,
    hospital_city                = excluded.hospital_city,
    hospital_state               = excluded.hospital_state,
    hospital_pincode             = excluded.hospital_pincode,
    hospital_country             = excluded.hospital_country,
    hospital_phone               = excluded.hospital_phone,
    hospital_email               = excluded.hospital_email,
    hospital_website             = excluded.hospital_website,
    hospital_address             = excluded.hospital_address,
    pharmacy_name                = excluded.pharmacy_name,
    registration_number          = excluded.registration_number,
    hospital_registration_number = excluded.hospital_registration_number,
    receipt_footer_note          = excluded.receipt_footer_note,
    receipt_terms_and_conditions = excluded.receipt_terms_and_conditions,
    header_tagline_lab           = excluded.header_tagline_lab,
    general_instructions         = excluded.general_instructions,
    report_disclaimer            = excluded.report_disclaimer,
    terms_overleaf               = excluded.terms_overleaf,
    accreditations               = excluded.accreditations,
    lab_report_template          = excluded.lab_report_template,
    show_medico_legal_note       = excluded.show_medico_legal_note,
    updated_at                   = now();
end $$;

-- ── 4. Seed approving pathologist & lab technician ─────────────────
-- Reports footer reads `staff.full_name` + `signature_data_url` for the
-- "Approved by" and "Lab Technician" blocks. We register them as active
-- staff rows scoped to the branch; signatures can be uploaded later via
-- Settings → Staff. `staff_code` is the natural unique key.
do $$
declare
  v_branch_id    uuid;
  v_pathologist  uuid;
  v_technician   uuid;
begin
  select id into v_branch_id
  from public.branches
  where code = 'SREE-VJW';

  -- Approving pathologist (signs every report).
  insert into public.staff (
    staff_code, full_name, email, role_slug,
    primary_branch_id, signature_role, is_active, metadata
  )
  values (
    'SREE-PATH-001',
    'Dr. N. Sudha Prasuja, MD',
    'sudha.prasuja@sreediagnostics.in',
    'doctor',
    v_branch_id,
    'pathologist',
    true,
    jsonb_build_object(
      'qualifications', 'MD',
      'specialty',      'Pathology',
      'role_title',     'Laboratory Director / Approving Pathologist'
    )
  )
  on conflict (staff_code) do update set
    full_name         = excluded.full_name,
    email             = excluded.email,
    role_slug         = excluded.role_slug,
    primary_branch_id = excluded.primary_branch_id,
    signature_role    = excluded.signature_role,
    metadata          = excluded.metadata,
    is_active         = true,
    updated_at        = now()
  returning id into v_pathologist;

  -- Technical analyst (specimen handling, processing, technical reporting).
  insert into public.staff (
    staff_code, full_name, email, role_slug,
    primary_branch_id, signature_role, is_active, metadata
  )
  values (
    'SREE-TECH-001',
    'K.D. Ch Prasad',
    'kd.prasad@sreediagnostics.in',
    'lab_tech',
    v_branch_id,
    'technician',
    true,
    jsonb_build_object('role_title', 'Lab Technician — Technical Analyst')
  )
  on conflict (staff_code) do update set
    full_name         = excluded.full_name,
    email             = excluded.email,
    role_slug         = excluded.role_slug,
    primary_branch_id = excluded.primary_branch_id,
    signature_role    = excluded.signature_role,
    metadata          = excluded.metadata,
    is_active         = true,
    updated_at        = now()
  returning id into v_technician;

  -- Bind both to the Sree Diagnostics branch (idempotent).
  if v_branch_id is not null then
    begin
      insert into public.staff_branches (staff_id, branch_id)
      values (v_pathologist, v_branch_id), (v_technician, v_branch_id)
      on conflict do nothing;
    exception
      when undefined_table then null;  -- staff_branches not deployed yet
    end;
  end if;
exception
  when undefined_column then
    -- Schema predates signature_role / staff_branches; staff still seeded above.
    null;
end $$;
