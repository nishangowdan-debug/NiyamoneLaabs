-- ============================================================
-- Seed: populate lab_test_prices with sensible defaults
--       and mark sample-collectable tests as home-eligible.
-- Date: 2026-05-15
-- Run:  Supabase Dashboard → SQL Editor → paste → Run
--
-- Prereqs (run these first if not already done):
--   • 20260515_lab_settings.sql   — creates lab_test_prices table
--   • 20260515_fix_seed_demo_data.sql + click "Seed demo data"
--     in Settings → Demo data    — populates lab_tests rows
--
-- This script is idempotent (uses ON CONFLICT DO UPDATE).
-- Re-running refreshes flags but keeps the same primary keys.
-- Adjust prices/surcharge to match your rate card.
-- ============================================================

do $$
declare
  b record;
  t record;
  home_eligible boolean;
  price numeric;
  surcharge numeric := 150;        -- flat ₹150 home-visit surcharge by default
begin
  for b in select id from branches where is_active = true loop
    for t in select * from lab_tests where is_active = true loop

      -- A blood / serum / plasma / urine / stool test → eligible.
      -- Imaging or 'other' → not eligible (needs the equipment on-site).
      home_eligible := t.specimen_type in ('blood','serum','plasma','urine','stool','sputum','swab');

      -- Default price by category — tweak to match your branch's rate card.
      price := case t.category
        when 'haematology'    then 300
        when 'biochemistry'   then 400
        when 'endocrinology'  then 600
        when 'immunology'     then 500
        when 'microbiology'   then 500
        when 'urinalysis'     then 200
        when 'imaging'        then 800
        else 400
      end;

      -- Hand-pick a few common tests as higher-volume reference rates.
      if t.code in ('LAB-CBC','CBC')                 then price :=  300; end if;
      if t.code in ('LAB-FBS','FBS')                 then price :=  100; end if;
      if t.code in ('LAB-PPBS','PPBS')               then price :=  100; end if;
      if t.code in ('LAB-HBA1C','HBA1C')             then price :=  500; end if;
      if t.code in ('LAB-LFT','LFT')                 then price :=  600; end if;
      if t.code in ('LAB-KFT','RFT')                 then price :=  600; end if;
      if t.code in ('LAB-LIPID','LIPID')             then price :=  500; end if;
      if t.code in ('LAB-TSH','TSH')                 then price :=  300; end if;
      if t.code in ('LAB-CRP','CRP')                 then price :=  400; end if;
      if t.code in ('LAB-VITD','VITD','VIT_D')       then price := 1400; end if;
      if t.code in ('LAB-B12','VITB12','VIT_B12')    then price :=  850; end if;
      if t.code in ('LAB-URINE-RM','URINE_RM')       then price :=  120; end if;

      insert into lab_test_prices
        (branch_id, lab_test_id, price_inr,
         home_collection_eligible, home_collection_surcharge_inr, is_active)
      values
        (b.id, t.id, price,
         home_eligible, case when home_eligible then surcharge else 0 end, true)
      on conflict (branch_id, lab_test_id) do update
        set price_inr                     = excluded.price_inr,
            home_collection_eligible      = excluded.home_collection_eligible,
            home_collection_surcharge_inr = excluded.home_collection_surcharge_inr,
            is_active                     = true;

    end loop;
  end loop;
end $$;

-- Verify after running:
-- select count(*) as total,
--        count(*) filter (where home_collection_eligible) as home_eligible
-- from lab_test_prices;
