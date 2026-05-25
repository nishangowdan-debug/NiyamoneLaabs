-- ============================================================
-- Lab test parameters: per-test structured parameter rows
-- Date:        2026-05-24
-- Run order:   single file, idempotent
--
-- Adds:
--   • lab_test_parameters   — one row per (test, parameter), e.g. CBC → Hb, RBC, WBC...
--   • lab_result_values     — one row per (lab_result, parameter) for patient entries
--   • RPC lab_replace_test_parameters(test_id, params jsonb)
--   • RPC lab_save_result_values(result_id, entries jsonb)
-- ============================================================

-- ── 1. lab_test_parameters ───────────────────────────────────
create table if not exists lab_test_parameters (
  id                    uuid primary key default gen_random_uuid(),
  lab_test_id           uuid not null references lab_tests(id) on delete cascade,
  sno                   int  not null,
  is_section_header     boolean not null default false,
  section               text,
  parameter             text not null default '',
  default_value         text,
  unit                  text,
  low_value             numeric,
  high_value            numeric,
  normal_range_display  text,
  method                text,
  font                  jsonb not null default '{}'::jsonb,
  ref_overrides         jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (lab_test_id, sno)
);

create index if not exists idx_lab_test_parameters_test on lab_test_parameters(lab_test_id, sno);

alter table lab_test_parameters enable row level security;

drop policy if exists lab_test_parameters_read on lab_test_parameters;
create policy lab_test_parameters_read on lab_test_parameters
  for select using (true);  -- catalog is org-wide visible to authenticated users

drop policy if exists lab_test_parameters_write on lab_test_parameters;
create policy lab_test_parameters_write on lab_test_parameters
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in ('super_admin','branch_admin')
  );

drop trigger if exists trg_lab_test_parameters_updated on lab_test_parameters;
create trigger trg_lab_test_parameters_updated before update on lab_test_parameters
  for each row execute function set_updated_at();


-- ── 2. lab_result_values ─────────────────────────────────────
-- One row per (patient result, parameter). Stores the technician-entered value
-- for each sub-parameter. Coexists with the legacy single-value columns on
-- lab_results so older tests without parameter rows continue to work.
create table if not exists lab_result_values (
  id                       uuid primary key default gen_random_uuid(),
  lab_result_id            uuid not null references lab_results(id) on delete cascade,
  lab_test_parameter_id    uuid not null references lab_test_parameters(id) on delete cascade,
  value_numeric            numeric,
  value_text               text,
  flag                     text,  -- 'normal'|'low'|'high'|'critical_low'|'critical_high'
  notes                    text,
  entered_at               timestamptz,
  entered_by_staff_id      uuid references staff(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (lab_result_id, lab_test_parameter_id)
);

create index if not exists idx_lab_result_values_result on lab_result_values(lab_result_id);
create index if not exists idx_lab_result_values_parameter on lab_result_values(lab_test_parameter_id);

alter table lab_result_values enable row level security;

drop policy if exists lab_result_values_read on lab_result_values;
create policy lab_result_values_read on lab_result_values
  for select using (
    exists (
      select 1
      from lab_results lr
      join lab_orders lo on lo.id = lr.lab_order_id
      where lr.id = lab_result_values.lab_result_id
        and (lo.branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
             or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin')
    )
  );

drop policy if exists lab_result_values_write on lab_result_values;
create policy lab_result_values_write on lab_result_values
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in ('super_admin','branch_admin','lab_tech','pathologist')
  );

drop trigger if exists trg_lab_result_values_updated on lab_result_values;
create trigger trg_lab_result_values_updated before update on lab_result_values
  for each row execute function set_updated_at();


-- ── 3. RPC: replace all parameters of a test in one transaction ──────
-- Input shape:
--   p_params = '[
--     { "id": "uuid|null", "sno": 1, "is_section_header": false,
--       "section": null, "parameter": "Haemoglobin",
--       "default_value": null, "unit": "gm/dl",
--       "low_value": 13.0, "high_value": 18.0,
--       "normal_range_display": "Male: 13.5 - 18.0",
--       "method": "Spectrophotometry",
--       "font": {"family":"Arial","size":10},
--       "ref_overrides": [{"scope":"male","low":13.5,"high":18.0}]
--     }, ...
--   ]'
create or replace function lab_replace_test_parameters(p_test_id uuid, p_params jsonb)
returns void
language plpgsql
security definer
as $$
declare
  v_keep uuid[] := array[]::uuid[];
  v_row jsonb;
  v_id uuid;
begin
  -- Authorization check: only org admins can edit catalog
  if coalesce(auth.jwt() ->> 'user_role', '') not in ('super_admin','branch_admin') then
    raise exception 'Only super_admin or branch_admin can edit lab test parameters';
  end if;

  if p_params is null or jsonb_typeof(p_params) <> 'array' then
    raise exception 'p_params must be a JSON array';
  end if;

  for v_row in select * from jsonb_array_elements(p_params)
  loop
    v_id := nullif(v_row->>'id','')::uuid;
    if v_id is null then
      insert into lab_test_parameters (
        lab_test_id, sno, is_section_header, section, parameter, default_value,
        unit, low_value, high_value, normal_range_display, method, font, ref_overrides
      ) values (
        p_test_id,
        (v_row->>'sno')::int,
        coalesce((v_row->>'is_section_header')::boolean, false),
        v_row->>'section',
        coalesce(v_row->>'parameter',''),
        v_row->>'default_value',
        v_row->>'unit',
        nullif(v_row->>'low_value','')::numeric,
        nullif(v_row->>'high_value','')::numeric,
        v_row->>'normal_range_display',
        v_row->>'method',
        coalesce(v_row->'font','{}'::jsonb),
        coalesce(v_row->'ref_overrides','[]'::jsonb)
      ) returning id into v_id;
    else
      update lab_test_parameters set
        sno                  = (v_row->>'sno')::int,
        is_section_header    = coalesce((v_row->>'is_section_header')::boolean, false),
        section              = v_row->>'section',
        parameter            = coalesce(v_row->>'parameter',''),
        default_value        = v_row->>'default_value',
        unit                 = v_row->>'unit',
        low_value            = nullif(v_row->>'low_value','')::numeric,
        high_value           = nullif(v_row->>'high_value','')::numeric,
        normal_range_display = v_row->>'normal_range_display',
        method               = v_row->>'method',
        font                 = coalesce(v_row->'font','{}'::jsonb),
        ref_overrides        = coalesce(v_row->'ref_overrides','[]'::jsonb)
      where id = v_id and lab_test_id = p_test_id;
    end if;

    v_keep := array_append(v_keep, v_id);
  end loop;

  -- Delete rows that were dropped from the editor
  delete from lab_test_parameters
   where lab_test_id = p_test_id
     and id <> all(v_keep);
end $$;

grant execute on function lab_replace_test_parameters(uuid, jsonb) to authenticated;


-- ── 4. RPC: batch save parameter values for one lab_result ────
-- Input shape:
--   p_entries = '[
--     { "parameter_id": "uuid", "value_numeric": 12.5, "value_text": null,
--       "flag": "low", "notes": null }, ...
--   ]'
create or replace function lab_save_result_values(p_result_id uuid, p_entries jsonb)
returns void
language plpgsql
security definer
as $$
declare
  v_entry jsonb;
  v_staff uuid := nullif(auth.jwt() ->> 'staff_id','')::uuid;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'p_entries must be a JSON array';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    insert into lab_result_values (
      lab_result_id, lab_test_parameter_id,
      value_numeric, value_text, flag, notes, entered_at, entered_by_staff_id
    ) values (
      p_result_id,
      (v_entry->>'parameter_id')::uuid,
      nullif(v_entry->>'value_numeric','')::numeric,
      nullif(v_entry->>'value_text',''),
      nullif(v_entry->>'flag',''),
      nullif(v_entry->>'notes',''),
      now(),
      v_staff
    )
    on conflict (lab_result_id, lab_test_parameter_id) do update set
      value_numeric       = excluded.value_numeric,
      value_text          = excluded.value_text,
      flag                = excluded.flag,
      notes               = excluded.notes,
      entered_at          = now(),
      entered_by_staff_id = v_staff;
  end loop;

  -- Bump the parent result to 'entered' so the existing verification workflow
  -- picks it up. Don't downgrade an already-verified result.
  -- Promote the parent result to 'entered' (unless already verified). PG resolves
  -- the literal against the underlying status enum/type without an explicit cast.
  update lab_results
     set status     = case when status::text = 'verified' then status else 'entered' end,
         entered_at = coalesce(entered_at, now()),
         entered_by_staff_id = coalesce(entered_by_staff_id, v_staff)
   where id = p_result_id;
end $$;

grant execute on function lab_save_result_values(uuid, jsonb) to authenticated;
