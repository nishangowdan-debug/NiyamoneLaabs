-- ============================================================
-- Customizable print footer for invoices, lab reports, payslips
-- Date: 2026-05-24
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--                 (or via MCP — preferred for this project)
--
-- Adds:
--   • footer-assets storage bucket (public read, authenticated write)
--   • hospital_settings columns for the new Footer Builder
--   • staff.signature_url (Storage URL fallback for signature_data_url)
--
-- All operations are idempotent.
-- ============================================================

-- ── 1. Storage bucket ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('footer-assets', 'footer-assets', true)
on conflict (id) do update set public = excluded.public;

-- Public read for printed PDFs that the browser fetches by URL.
drop policy if exists "footer assets public read" on storage.objects;
create policy "footer assets public read"
  on storage.objects for select
  using (bucket_id = 'footer-assets');

-- Authenticated write — RLS on hospital_settings already gates *which*
-- branch a user can edit. Bucket write just requires a logged-in session.
drop policy if exists "footer assets auth write" on storage.objects;
create policy "footer assets auth write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'footer-assets');

drop policy if exists "footer assets auth update" on storage.objects;
create policy "footer assets auth update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'footer-assets')
  with check (bucket_id = 'footer-assets');

drop policy if exists "footer assets auth delete" on storage.objects;
create policy "footer assets auth delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'footer-assets');

-- ── 2. hospital_settings additions ────────────────────────────────
alter table hospital_settings
  add column if not exists customer_logo_url          text,
  add column if not exists footer_layout              jsonb default jsonb_build_object(
    'columns', 3,
    'alignment', 'center',
    'show_thankyou', true,
    'show_generated_at', true,
    'show_qr', false,
    'show_signatures', true
  ),
  add column if not exists footer_signature_staff_ids uuid[] default '{}',
  add column if not exists invoice_footer_note        text,
  add column if not exists invoice_footer_terms       text,
  add column if not exists payslip_footer_note        text,
  add column if not exists payslip_footer_terms       text,
  add column if not exists report_footer_note         text,
  add column if not exists report_footer_terms        text;

-- ── 3. Staff signature URL fallback ───────────────────────────────
-- Existing signature_data_url is base64 (heavy). New URL column points
-- to footer-assets/signatures/{staff_id}.png. Templates prefer _url,
-- fall back to _data_url for back-compat.
alter table staff
  add column if not exists signature_url text;

-- ── 4. Add validity tracking to seals (data shape evolution) ─────
-- header_seal_urls / footer_seal_urls are jsonb arrays of {name,url}.
-- New shape allows optional {valid_until, category}. No migration of
-- existing rows needed; renderer treats new fields as optional.
comment on column hospital_settings.footer_seal_urls is
  'jsonb array of { name: text, url: text, category?: ''iso''|''nabl''|''qa''|''custom'', valid_until?: date-iso }';

comment on column hospital_settings.header_seal_urls is
  'jsonb array of { name: text, url: text, category?: ''iso''|''nabl''|''qa''|''custom'', valid_until?: date-iso }';

comment on column hospital_settings.footer_layout is
  '{ columns: 1|2|3, alignment: ''left''|''center'', show_thankyou: bool, show_generated_at: bool, show_qr: bool, show_signatures: bool }';

comment on column hospital_settings.footer_signature_staff_ids is
  'Array of staff.id whose signature blocks appear in the footer. Order is preserved.';

comment on column hospital_settings.customer_logo_url is
  'Optional second logo (franchise / co-branding partner). Stored in footer-assets bucket.';
