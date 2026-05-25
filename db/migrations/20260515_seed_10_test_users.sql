-- ============================================================
-- Seed: 10 test users + 1 sample branch
-- Date: 2026-05-15
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Creates auth.users + auth.identities + public.staff rows.
-- Passwords are bcrypt-hashed via pgcrypto.
--
-- Prereq: the schema (branches, staff) must already exist on
-- this DB. If you're on a brand-new Supabase project, apply the
-- base schema dump first.
--
-- Idempotent: re-running won't duplicate users (matches on email).
-- ============================================================

-- pgcrypto for password hashing
create extension if not exists pgcrypto;

-- ── 1. Sample branch (skip if branches already populated) ──────────
insert into branches (id, code, name, address, phone, email, is_active)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  'NIY01',
  'Niyamone Diagnostic Centre — Chennai',
  jsonb_build_object(
    'line1','12, Mount Road',
    'city','Chennai','state','Tamil Nadu','pincode','600002','country','India'
  ),
  '+91-44-2811-0001',
  'chennai@niyamone.lab',
  true
where not exists (select 1 from branches limit 1);

-- ── 2. Test users + staff rows ─────────────────────────────────────
do $$
declare
  v_branch_id uuid;
  v_user record;
  v_user_id uuid;
  v_default_password text := 'Niyamone@2026Admin!';
begin
  select id into v_branch_id from branches order by created_at limit 1;
  if v_branch_id is null then
    raise exception 'No branch found — insert a row in branches first.';
  end if;

  -- 10 users, varied roles
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

    -- Skip if already exists
    select id into v_user_id from auth.users where email = v_user.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      -- auth.users
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated',
        v_user.email,
        crypt(v_default_password, gen_salt('bf')),
        now(),
        jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
        jsonb_build_object('full_name', v_user.full_name),
        now(), now(), '', '', '', ''
      );

      -- auth.identities (required by Supabase Auth for password login)
      insert into auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_user.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    -- public.staff (idempotent on staff_code)
    insert into staff (
      id, user_id, staff_code, full_name, email, role_slug,
      primary_branch_id, is_active, metadata
    ) values (
      gen_random_uuid(), v_user_id, v_user.staff_code, v_user.full_name,
      v_user.email, v_user.role_slug, v_branch_id, true,
      jsonb_build_object('seeded', true)
    )
    on conflict (staff_code) do update
      set user_id = excluded.user_id,
          email = excluded.email,
          role_slug = excluded.role_slug,
          is_active = true;

  end loop;
end $$;

-- ── 3. Verify ──────────────────────────────────────────────────────
select s.staff_code, s.full_name, s.role_slug, u.email
from staff s
join auth.users u on u.id = s.user_id
where s.metadata->>'seeded' = 'true'
order by s.role_slug, s.staff_code;

-- ============================================================
--  All 10 users share the same default password (change after first login):
--
--      Niyamone@2026Admin!
--
--  Logins:
--      admin@niyamone.lab        super_admin
--      manager@niyamone.lab      branch_admin
--      reception1@niyamone.lab   reception
--      reception2@niyamone.lab   reception
--      lab1@niyamone.lab         lab_tech
--      lab2@niyamone.lab         lab_tech
--      lab3@niyamone.lab         lab_tech
--      phleb1@niyamone.lab       lab_tech (home phlebotomist)
--      accountant@niyamone.lab   accountant
--      hr@niyamone.lab           hr
-- ============================================================
