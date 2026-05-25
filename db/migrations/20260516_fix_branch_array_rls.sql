-- ─────────────────────────────────────────────────────────────────────
-- Fix: 'branch_ids' JWT claim was being cast directly to uuid[] —
-- Postgres rejects that because the JSON array form ["uuid", "uuid"]
-- is not the same as the Postgres array literal {uuid,uuid}.
-- Replace each policy with the jsonb_array_elements_text() pattern.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- lab_test_prices
DROP POLICY IF EXISTS lab_test_prices_read  ON lab_test_prices;
CREATE POLICY lab_test_prices_read ON lab_test_prices
  FOR SELECT USING (
    branch_id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
    )
    OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

DROP POLICY IF EXISTS lab_test_prices_write ON lab_test_prices;
CREATE POLICY lab_test_prices_write ON lab_test_prices
  FOR ALL USING (
    COALESCE(auth.jwt() ->> 'user_role', '') IN ('super_admin','branch_admin')
    AND (
      branch_id IN (
        SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
      )
      OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
    )
  );

-- phlebotomists
DROP POLICY IF EXISTS phlebotomists_read ON phlebotomists;
CREATE POLICY phlebotomists_read ON phlebotomists
  FOR SELECT USING (
    branch_id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
    )
    OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

DROP POLICY IF EXISTS phlebotomists_write ON phlebotomists;
CREATE POLICY phlebotomists_write ON phlebotomists
  FOR ALL USING (
    COALESCE(auth.jwt() ->> 'user_role', '') IN ('super_admin','branch_admin')
  );

-- home_collection_requests
DROP POLICY IF EXISTS hc_requests_read ON home_collection_requests;
CREATE POLICY hc_requests_read ON home_collection_requests
  FOR SELECT USING (
    branch_id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
    )
    OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
  );

DROP POLICY IF EXISTS hc_requests_write ON home_collection_requests;
CREATE POLICY hc_requests_write ON home_collection_requests
  FOR ALL USING (
    COALESCE(auth.jwt() ->> 'user_role', '') IN ('super_admin','branch_admin','lab_tech','reception','nurse')
    AND (
      branch_id IN (
        SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
      )
      OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
    )
  );

-- home_collection_items (uses parent subquery)
DROP POLICY IF EXISTS hc_items_read ON home_collection_items;
CREATE POLICY hc_items_read ON home_collection_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM home_collection_requests r
      WHERE r.id = home_collection_items.request_id
        AND (
          r.branch_id IN (
            SELECT value::uuid FROM jsonb_array_elements_text(auth.jwt() -> 'branch_ids')
          )
          OR COALESCE(auth.jwt() ->> 'user_role', '') = 'super_admin'
        )
    )
  );

DROP POLICY IF EXISTS hc_items_write ON home_collection_items;
CREATE POLICY hc_items_write ON home_collection_items
  FOR ALL USING (
    COALESCE(auth.jwt() ->> 'user_role', '') IN ('super_admin','branch_admin','lab_tech','reception','nurse')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
