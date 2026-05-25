-- ─────────────────────────────────────────────────────────────────────
-- Add `routing` to invoice_items so the inhouse/outsource decision
-- captured at billing time persists per line — independent of whether
-- the lab order was successfully created.
--
-- Allowed values: 'inhouse' | 'outsource' | NULL (non-lab lines).
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS routing text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_routing_chk'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_routing_chk
      CHECK (routing IS NULL OR routing IN ('inhouse','outsource'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS invoice_items_routing_idx
  ON public.invoice_items (routing) WHERE routing IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
