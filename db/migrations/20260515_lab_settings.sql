-- ============================================================
-- Lab project: settings + home collection schema
-- Date:        2026-05-15
-- Run order:   single file, idempotent (uses IF NOT EXISTS)
-- ============================================================

-- ── 1. Lab test catalog: per-branch pricing ──────────────────
create table if not exists lab_test_prices (
  branch_id                       uuid not null references branches(id) on delete cascade,
  lab_test_id                     uuid not null references lab_tests(id) on delete cascade,
  price_inr                       numeric(10,2) not null default 0 check (price_inr >= 0),
  home_collection_eligible        boolean not null default false,
  home_collection_surcharge_inr   numeric(10,2) not null default 0 check (home_collection_surcharge_inr >= 0),
  is_active                       boolean not null default true,
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid references staff(id),
  primary key (branch_id, lab_test_id)
);

create index if not exists idx_lab_test_prices_branch on lab_test_prices(branch_id) where is_active;
create index if not exists idx_lab_test_prices_home on lab_test_prices(branch_id) where home_collection_eligible and is_active;

alter table lab_test_prices enable row level security;

drop policy if exists lab_test_prices_read on lab_test_prices;
create policy lab_test_prices_read on lab_test_prices
  for select using (
    branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
    or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

drop policy if exists lab_test_prices_write on lab_test_prices;
create policy lab_test_prices_write on lab_test_prices
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in ('super_admin','branch_admin')
    and (
      branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
      or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin'
    )
  );


-- ── 2. Phlebotomists (home-collection staff roster) ──────────
create table if not exists phlebotomists (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branches(id) on delete cascade,
  staff_id        uuid not null references staff(id) on delete cascade,
  vehicle_no      text,
  service_areas   text[] not null default '{}',   -- pin codes covered
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (branch_id, staff_id)
);

create index if not exists idx_phlebotomists_branch on phlebotomists(branch_id) where is_active;

alter table phlebotomists enable row level security;

drop policy if exists phlebotomists_read on phlebotomists;
create policy phlebotomists_read on phlebotomists
  for select using (
    branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
    or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

drop policy if exists phlebotomists_write on phlebotomists;
create policy phlebotomists_write on phlebotomists
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in ('super_admin','branch_admin')
  );


-- ── 3. Home-collection requests ──────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'home_collection_status') then
    create type home_collection_status as enum (
      'requested','assigned','en_route','collected','received','cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'home_collection_payment_method') then
    create type home_collection_payment_method as enum ('cash','upi','pending');
  end if;
end $$;

create table if not exists home_collection_requests (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references branches(id) on delete cascade,
  patient_id          uuid not null references patients(id) on delete restrict,
  address             jsonb not null,                       -- line1, line2, city, pincode, lat, lng
  scheduled_at        timestamptz not null,
  contact_mobile      text not null,
  status              home_collection_status not null default 'requested',
  phlebotomist_id     uuid references phlebotomists(id),
  notes               text,
  -- Pricing snapshot at booking time (catalog price + surcharge)
  total_inr           numeric(10,2) not null default 0,
  surcharge_inr       numeric(10,2) not null default 0,
  -- Payment captured at collection
  payment_method      home_collection_payment_method not null default 'pending',
  payment_ref         text,                                 -- UPI txn ref, if any
  paid_inr            numeric(10,2),
  -- Lifecycle timestamps
  created_at          timestamptz not null default now(),
  created_by          uuid references staff(id),
  assigned_at         timestamptz,
  collected_at        timestamptz,
  received_at         timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text
);

create index if not exists idx_hc_requests_branch_status on home_collection_requests(branch_id, status);
create index if not exists idx_hc_requests_phleb on home_collection_requests(phlebotomist_id) where status in ('assigned','en_route');
create index if not exists idx_hc_requests_scheduled on home_collection_requests(scheduled_at desc);

alter table home_collection_requests enable row level security;

drop policy if exists hc_requests_read on home_collection_requests;
create policy hc_requests_read on home_collection_requests
  for select using (
    branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
    or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

drop policy if exists hc_requests_write on home_collection_requests;
create policy hc_requests_write on home_collection_requests
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in (
      'super_admin','branch_admin','lab_tech','reception','nurse'
    )
    and (
      branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
      or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin'
    )
  );


-- ── 4. Home-collection line items (which lab tests) ──────────
create table if not exists home_collection_items (
  request_id      uuid not null references home_collection_requests(id) on delete cascade,
  lab_test_id     uuid not null references lab_tests(id) on delete restrict,
  price_inr       numeric(10,2) not null,
  surcharge_inr   numeric(10,2) not null default 0,
  lab_order_id    uuid references lab_orders(id),
  primary key (request_id, lab_test_id)
);

create index if not exists idx_hc_items_test on home_collection_items(lab_test_id);
create index if not exists idx_hc_items_order on home_collection_items(lab_order_id);

alter table home_collection_items enable row level security;

drop policy if exists hc_items_read on home_collection_items;
create policy hc_items_read on home_collection_items
  for select using (
    exists (
      select 1 from home_collection_requests r
      where r.id = home_collection_items.request_id
        and (r.branch_id = any((auth.jwt() ->> 'branch_ids')::uuid[])
             or coalesce(auth.jwt() ->> 'user_role', '') = 'super_admin')
    )
  );

drop policy if exists hc_items_write on home_collection_items;
create policy hc_items_write on home_collection_items
  for all using (
    coalesce(auth.jwt() ->> 'user_role', '') in (
      'super_admin','branch_admin','lab_tech','reception','nurse'
    )
  );


-- ── 5. updated_at triggers ───────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end
$$ language plpgsql;

drop trigger if exists trg_lab_test_prices_updated on lab_test_prices;
create trigger trg_lab_test_prices_updated before update on lab_test_prices
  for each row execute function set_updated_at();

drop trigger if exists trg_phlebotomists_updated on phlebotomists;
create trigger trg_phlebotomists_updated before update on phlebotomists
  for each row execute function set_updated_at();
