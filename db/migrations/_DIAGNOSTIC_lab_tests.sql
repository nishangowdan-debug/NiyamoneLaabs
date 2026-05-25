-- ============================================================
-- DIAGNOSTIC: inspect the live lab_tests schema
-- Run:  Supabase SQL Editor → paste → Run
-- Paste the result rows back so we can fix the seed correctly.
-- ============================================================

-- 1. Row count
select 'lab_tests row count' as label,
       (select count(*) from public.lab_tests) as value;

-- 2. Full column list with NOT NULL flags and defaults
select column_name,
       data_type,
       is_nullable,
       column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'lab_tests'
order by ordinal_position;

-- 3. RLS status & policies on the table
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'lab_tests';

select policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'lab_tests';

-- 4. Show any branches that exist (so we know what branch_ids to seed against)
select id, code, name, is_active from public.branches order by created_at;
