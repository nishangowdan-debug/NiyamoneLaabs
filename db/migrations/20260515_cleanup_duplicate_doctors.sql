-- ============================================================
-- Cleanup: collapse duplicate doctor rows in `staff`
-- Date:    2026-05-15
-- Cause:   running seed_demo_data() multiple times created
--          one staff row per run for the same doctor.
-- Strategy: keep the newest row per (lower(full_name)) where
--           role_slug='doctor', soft-delete the rest. Soft delete
--           preserves FKs from existing appointments/invoices.
-- ============================================================

-- 1. See what we're about to do (run this first to preview)
with ranked as (
  select id, full_name, created_at, metadata,
         row_number() over (
           partition by lower(full_name)
           order by
             case when (metadata ? 'specialty' or metadata ? 'speciality') then 0 else 1 end,
             created_at desc
         ) as rn
  from staff
  where role_slug = 'doctor' and is_active = true
)
select full_name, count(*) as duplicate_count
from ranked
group by full_name
having count(*) > 1
order by duplicate_count desc, full_name;


-- 2. Soft-delete the duplicates (keep the best row per name)
-- Run this block once you're happy with the preview above.
/*
with ranked as (
  select id,
         row_number() over (
           partition by lower(full_name)
           order by
             case when (metadata ? 'specialty' or metadata ? 'speciality') then 0 else 1 end,
             created_at desc
         ) as rn
  from staff
  where role_slug = 'doctor' and is_active = true
)
update staff
set is_active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deactivated_reason', 'duplicate_dropdown_cleanup',
      'deactivated_at', now()::text
    )
where id in (select id from ranked where rn > 1);
*/

-- 3. After cleanup, verify
-- select full_name, count(*) from staff
-- where role_slug='doctor' and is_active=true
-- group by full_name having count(*) > 1;
-- (should return 0 rows)
