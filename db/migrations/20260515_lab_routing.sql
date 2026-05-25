-- ─────────────────────────────────────────────────────────────────────
-- Lab order routing — inhouse vs outsource
--
-- Decision used to be baked into the catalog via `lab_tests.is_outsourced`,
-- which forced every order of a test down the same path. This migration
-- moves the decision to the order level, with the catalog only providing
-- a default suggestion.
--
-- After this runs:
--   lab_tests.default_routing  -> catalog default ('inhouse' | 'outsource')
--   lab_orders.routing         -> chosen per order at billing time
--   place_lab_order(...)       -> accepts per-test routing
--
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Catalog default
ALTER TABLE public.lab_tests
  ADD COLUMN IF NOT EXISTS default_routing text NOT NULL DEFAULT 'inhouse';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_tests_default_routing_chk'
  ) THEN
    ALTER TABLE public.lab_tests
      ADD CONSTRAINT lab_tests_default_routing_chk
      CHECK (default_routing IN ('inhouse','outsource'));
  END IF;
END$$;

-- Backfill from legacy flag (only if column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lab_tests' AND column_name='is_outsourced'
  ) THEN
    UPDATE public.lab_tests
       SET default_routing = 'outsource'
     WHERE is_outsourced = true
       AND default_routing = 'inhouse';
  END IF;
END$$;

-- 2. Per-order routing
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS routing text NOT NULL DEFAULT 'inhouse';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_orders_routing_chk'
  ) THEN
    ALTER TABLE public.lab_orders
      ADD CONSTRAINT lab_orders_routing_chk
      CHECK (routing IN ('inhouse','outsource'));
  END IF;
END$$;

-- Backfill: any existing order whose ONLY tests are outsource-default → outsource.
UPDATE public.lab_orders o
   SET routing = 'outsource'
 WHERE routing = 'inhouse'
   AND NOT EXISTS (
     SELECT 1
       FROM public.lab_results r
       JOIN public.lab_tests t ON t.id = r.lab_test_id
      WHERE r.lab_order_id = o.id
        AND COALESCE(t.default_routing, 'inhouse') = 'inhouse'
   )
   AND EXISTS (
     SELECT 1
       FROM public.lab_results r
       JOIN public.lab_tests t ON t.id = r.lab_test_id
      WHERE r.lab_order_id = o.id
        AND COALESCE(t.default_routing, 'inhouse') = 'outsource'
   );

CREATE INDEX IF NOT EXISTS lab_orders_routing_idx ON public.lab_orders (routing);

-- 3. Replace place_lab_order to carry per-test routing.
--    We keep the old signature working by treating missing routing as 'inhouse'.
--    p_routings is a parallel array to p_test_codes; if NULL/empty, fallback is
--    each test's default_routing.
DROP FUNCTION IF EXISTS public.place_lab_order(uuid, text[], text, text);
DROP FUNCTION IF EXISTS public.place_lab_order(uuid, text[], text, text, text[]);

CREATE OR REPLACE FUNCTION public.place_lab_order(
  p_patient_id uuid,
  p_test_codes text[],
  p_priority   text DEFAULT 'routine',
  p_notes      text DEFAULT NULL,
  p_routings   text[] DEFAULT NULL  -- parallel to p_test_codes; NULL ⇒ derive from catalog
)
RETURNS public.lab_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_order     public.lab_orders;
  v_chosen    text;
  v_code      text;
  v_test_id   uuid;
  v_default   text;
  v_idx       int := 0;
BEGIN
  IF array_length(p_test_codes, 1) IS NULL OR array_length(p_test_codes, 1) < 1 THEN
    RAISE EXCEPTION 'place_lab_order requires at least one test code';
  END IF;

  SELECT branch_id INTO v_branch_id FROM public.patients WHERE id = p_patient_id;
  IF v_branch_id IS NULL THEN
    v_branch_id := COALESCE(
      NULLIF(current_setting('request.jwt.claim.branch_id', true), '')::uuid,
      (SELECT id FROM public.branches LIMIT 1)
    );
  END IF;

  -- Order-level routing = 'outsource' if ANY line is outsourced, else 'inhouse'
  v_chosen := 'inhouse';
  FOREACH v_code IN ARRAY p_test_codes LOOP
    v_idx := v_idx + 1;
    SELECT id, COALESCE(default_routing, 'inhouse')
      INTO v_test_id, v_default
      FROM public.lab_tests WHERE code = v_code;
    IF v_test_id IS NULL THEN
      RAISE EXCEPTION 'Unknown lab test code: %', v_code;
    END IF;

    DECLARE
      v_line_routing text := v_default;
    BEGIN
      IF p_routings IS NOT NULL AND v_idx <= COALESCE(array_length(p_routings, 1), 0) THEN
        IF p_routings[v_idx] IN ('inhouse','outsource') THEN
          v_line_routing := p_routings[v_idx];
        END IF;
      END IF;
      IF v_line_routing = 'outsource' THEN
        v_chosen := 'outsource';
      END IF;
    END;
  END LOOP;

  INSERT INTO public.lab_orders (branch_id, patient_id, source, priority, state, notes, routing)
  VALUES (v_branch_id, p_patient_id, 'opd', p_priority, 'ordered', p_notes, v_chosen)
  RETURNING * INTO v_order;

  -- Create one lab_results row per test, marking each with its individual routing
  -- via the existing schema. We piggy-back routing on the order; if the team
  -- later wants per-line routing inside a mixed order, add a `routing` column
  -- on lab_results and write it here.
  v_idx := 0;
  FOREACH v_code IN ARRAY p_test_codes LOOP
    v_idx := v_idx + 1;
    SELECT id INTO v_test_id FROM public.lab_tests WHERE code = v_code;
    INSERT INTO public.lab_results (lab_order_id, lab_test_id, status)
    VALUES (v_order.id, v_test_id, 'pending');
  END LOOP;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_lab_order(uuid, text[], text, text, text[]) TO authenticated;

-- 4. Helper to flip routing on an existing order (used by the ↗ Outsource
--    escape hatch on the inhouse kanban).
CREATE OR REPLACE FUNCTION public.set_lab_order_routing(p_order_id uuid, p_routing text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_routing NOT IN ('inhouse','outsource') THEN
    RAISE EXCEPTION 'routing must be inhouse or outsource (got %)', p_routing;
  END IF;
  UPDATE public.lab_orders SET routing = p_routing WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_lab_order_routing(uuid, text) TO authenticated;

COMMIT;
