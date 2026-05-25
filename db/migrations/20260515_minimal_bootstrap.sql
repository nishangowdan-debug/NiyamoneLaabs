-- ============================================================
-- MINIMAL BOOTSTRAP for empty Supabase project
-- Date: 2026-05-15
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Creates JUST ENOUGH schema for login + dashboard shell:
--   • branches               (single sample row)
--   • role_slug enum + staff (linked to auth.users)
--   • JWT custom claims hook (injects role_slug + branch_id)
--   • Permissive RLS so seeded users can read their staff row
--   • 10 seed users (auth.users + auth.identities + staff)
--
-- This is NOT the full HMS schema. Features that touch
-- patients/lab_orders/services/invoices will still fail until
-- the rest of the schema is migrated from the old project.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 1. Enums (idempotent) ──────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'role_slug') then
    create type role_slug as enum (
      'super_admin','branch_admin','doctor','nurse','reception',
      'lab_tech','pharmacist','accountant','hr','housekeeping',
      'security','fnb','driver','patient','none'
    );
  end if;
end $$;

-- ── 2. Branches table ──────────────────────────────────────────────
create table if not exists branches (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  name            text not null,
  tagline         text,
  gstin           text,
  tax_state       text,
  registration_no text,
  phone           text,
  email           text,
  website         text,
  logo_url        text,
  address         jsonb,
  prescription_header text,
  prescription_footer text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table branches enable row level security;

drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (true);

drop policy if exists branches_write on branches;
create policy branches_write on branches for all using (
  coalesce(auth.jwt() ->> 'user_role', '') in ('super_admin','branch_admin')
);

-- ── 3. Staff table ─────────────────────────────────────────────────
create table if not exists staff (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  staff_code          text unique not null,
  full_name           text not null,
  email               text,
  phone               text,
  role_slug           role_slug not null default 'none',
  primary_branch_id   uuid references branches(id),
  is_active           boolean not null default true,
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table staff enable row level security;

drop policy if exists staff_self_read on staff;
create policy staff_self_read on staff for select using (
  user_id = auth.uid()
  or coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin','hr')
);

drop policy if exists staff_admin_write on staff;
create policy staff_admin_write on staff for all using (
  coalesce(auth.jwt() ->> 'user_role','') in ('super_admin','branch_admin','hr')
);

-- ── 4. JWT custom claims hook ──────────────────────────────────────
-- Supabase's "custom_access_token_hook" lets you inject extra claims
-- into the JWT every time a token is minted. The frontend reads role_slug
-- and primary_branch_id from these claims.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (event #>> '{user_id}')::uuid;
  v_claims jsonb := coalesce(event->'claims','{}'::jsonb);
  v_staff record;
begin
  select role_slug::text as role, id as staff_id, primary_branch_id as branch_id
    into v_staff
  from public.staff
  where user_id = v_uid and is_active
  limit 1;

  if v_staff.role is not null then
    v_claims := v_claims
      || jsonb_build_object('user_role',   v_staff.role)
      || jsonb_build_object('staff_id',    v_staff.staff_id::text)
      || jsonb_build_object('branch_id',   coalesce(v_staff.branch_id::text, null))
      || jsonb_build_object('branch_ids',  case
            when v_staff.branch_id is null then '[]'::jsonb
            else jsonb_build_array(v_staff.branch_id::text)
         end)
      || jsonb_build_object('permissions', '[]'::jsonb);
  else
    v_claims := v_claims
      || jsonb_build_object('user_role','none')
      || jsonb_build_object('permissions','[]'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- IMPORTANT: After running this script, go to:
--   Supabase Dashboard → Authentication → Hooks → "Custom Access Token"
--   Enable it and pick public.custom_access_token_hook.

-- ── 5. Sample branch ───────────────────────────────────────────────
insert into branches (id, code, name, address, phone, email)
values (
  '11111111-1111-1111-1111-111111111111',
  'NIY01',
  'Niyamone Diagnostic Centre — Chennai',
  jsonb_build_object('line1','12, Mount Road','city','Chennai','state','Tamil Nadu','pincode','600002','country','India'),
  '+91-44-2811-0001',
  'chennai@niyamone.lab'
) on conflict (id) do nothing;

-- ── 6. Ten test users ──────────────────────────────────────────────
do $$
declare
  v_branch_id uuid;
  v_user record;
  v_user_id uuid;
  v_pw text := 'Niyamone@2026Admin!';
begin
  select id into v_branch_id from branches order by created_at limit 1;

  for v_user in (
    values
      ('admin@niyamone.lab',       'Lab Admin',          'super_admin',  'NIY-ADM-001'),
      ('manager@niyamone.lab',     'Operations Manager', 'branch_admin', 'NIY-ADM-002'),
      ('reception1@niyamone.lab',  'Priya Sharma',       'reception',    'NIY-REC-001'),
      ('reception2@niyamone.lab',  'Rahul Verma',        'reception',    'NIY-REC-002'),
      ('lab1@niyamone.lab',        'Anjali Iyer',        'lab_tech',     'NIY-LAB-001'),
      ('lab2@niyamone.lab',        'Karthik Pillai',     'lab_tech',     'NIY-LAB-002'),
      ('lab3@niyamone.lab',        'Meena Reddy',        'lab_tech',     'NIY-LAB-003'),
      ('phleb1@niyamone.lab',      'Suresh Kumar',       'lab_tech',     'NIY-LAB-004'),
      ('accountant@niyamone.lab',  'Lakshmi Narayanan',  'accountant',   'NIY-ACC-001'),
      ('hr@niyamone.lab',          'Vikram Singh',       'hr',           'NIY-HR-001')
  ) as t(email, full_name, role_slug, staff_code)
  loop
    select id into v_user_id from auth.users where email = v_user.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated', v_user.email,
        crypt(v_pw, gen_salt('bf')), now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        jsonb_build_object('full_name', v_user.full_name),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_user.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    insert into staff (
      user_id, staff_code, full_name, email, role_slug,
      primary_branch_id, is_active, metadata
    ) values (
      v_user_id, v_user.staff_code, v_user.full_name, v_user.email,
      v_user.role_slug::role_slug, v_branch_id, true,
      jsonb_build_object('seeded', true)
    )
    on conflict (staff_code) do update
      set user_id = excluded.user_id, email = excluded.email,
          role_slug = excluded.role_slug, is_active = true;
  end loop;
end $$;

-- ── 7. Verify ──────────────────────────────────────────────────────
select s.staff_code, s.full_name, s.role_slug, u.email
from staff s
join auth.users u on u.id = s.user_id
where s.metadata->>'seeded' = 'true'
order by s.role_slug, s.staff_code;
