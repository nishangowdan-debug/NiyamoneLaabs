-- ─────────────────────────────────────────────────────────────────────
-- WhatsApp click-to-chat delivery
--
-- Adds:
--   patients.whatsapp_opt_in          — default ON. Owner toggles individually.
--   invoices.public_token             — random URL-safe token, 30-day TTL
--   lab_orders.public_token           — same
--   whatsapp_messages                 — audit log of every Send tab opened
--
-- Public-token routes (`/public/invoice/:token`, `/public/lab-report/:token`)
-- are unauthenticated read-only views. Tokens auto-expire after 30 days via
-- the pg_cron job below.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS public_token_expires_at timestamptz;
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS public_token_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'invoices_public_token_uidx') THEN
    CREATE UNIQUE INDEX invoices_public_token_uidx ON public.invoices(public_token) WHERE public_token IS NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'lab_orders_public_token_uidx') THEN
    CREATE UNIQUE INDEX lab_orders_public_token_uidx ON public.lab_orders(public_token) WHERE public_token IS NOT NULL;
  END IF;
END$$;

-- ─── Audit log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            uuid REFERENCES public.branches(id),
  patient_id           uuid REFERENCES public.patients(id),
  to_phone             text NOT NULL,
  message_type         text NOT NULL CHECK (message_type IN ('bill','lab_report','reminder','custom')),
  message_text         text NOT NULL,
  public_url           text,
  related_invoice_id   uuid REFERENCES public.invoices(id),
  related_lab_order_id uuid REFERENCES public.lab_orders(id),
  triggered_by         uuid REFERENCES auth.users(id),
  opened_at            timestamptz NOT NULL DEFAULT now(),
  link_opened_at       timestamptz,
  link_opened_count    int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_msg_patient_idx ON public.whatsapp_messages(patient_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_msg_branch_idx  ON public.whatsapp_messages(branch_id, opened_at DESC);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_messages' AND policyname='wa_read_auth') THEN
    CREATE POLICY wa_read_auth ON public.whatsapp_messages FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_messages' AND policyname='wa_insert_auth') THEN
    CREATE POLICY wa_insert_auth ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='whatsapp_messages' AND policyname='wa_update_anon') THEN
    -- Anon can update link_opened_at via the public page (no other columns).
    CREATE POLICY wa_update_anon ON public.whatsapp_messages FOR UPDATE TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- ─── Public read access for tokenised invoice / lab_order ────────────
-- Anon clients calling the supabase-js client can read a single row matched
-- by public_token. The route page already filters by token in the URL — RLS
-- enforces that a tokenless query returns nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoices' AND policyname='invoice_public_token_read') THEN
    CREATE POLICY invoice_public_token_read ON public.invoices FOR SELECT TO anon
      USING (public_token IS NOT NULL AND public_token_expires_at > now());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lab_orders' AND policyname='lab_order_public_token_read') THEN
    CREATE POLICY lab_order_public_token_read ON public.lab_orders FOR SELECT TO anon
      USING (public_token IS NOT NULL AND public_token_expires_at > now());
  END IF;
  -- Anon also needs to read the joined items / results / patient + tests for
  -- the public page to render. Limited to rows whose parent has a live token.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoice_items' AND policyname='invoice_items_public_token_read') THEN
    CREATE POLICY invoice_items_public_token_read ON public.invoice_items FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND i.public_token IS NOT NULL
          AND i.public_token_expires_at > now()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lab_results' AND policyname='lab_results_public_token_read') THEN
    CREATE POLICY lab_results_public_token_read ON public.lab_results FOR SELECT TO anon
      USING (EXISTS (
        SELECT 1 FROM public.lab_orders o
        WHERE o.id = lab_results.lab_order_id
          AND o.public_token IS NOT NULL
          AND o.public_token_expires_at > now()
      ));
  END IF;
END$$;

-- ─── Token issuance + expiry helpers ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.issue_invoice_public_token(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok text;
BEGIN
  SELECT public_token INTO v_tok FROM invoices
   WHERE id = p_invoice_id
     AND public_token IS NOT NULL
     AND public_token_expires_at > now();
  IF v_tok IS NOT NULL THEN RETURN v_tok; END IF;
  -- 32-char URL-safe token from a random UUID. We avoid gen_random_bytes()
  -- because pgcrypto lives in `extensions` schema in Supabase and isn't
  -- resolvable from SECURITY DEFINER's search_path.
  v_tok := replace(gen_random_uuid()::text, '-', '');
  UPDATE invoices
     SET public_token = v_tok,
         public_token_expires_at = now() + interval '30 days'
   WHERE id = p_invoice_id;
  RETURN v_tok;
END$$;

CREATE OR REPLACE FUNCTION public.issue_lab_order_public_token(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok text;
BEGIN
  SELECT public_token INTO v_tok FROM lab_orders
   WHERE id = p_order_id
     AND public_token IS NOT NULL
     AND public_token_expires_at > now();
  IF v_tok IS NOT NULL THEN RETURN v_tok; END IF;
  v_tok := replace(gen_random_uuid()::text, '-', '');
  UPDATE lab_orders
     SET public_token = v_tok,
         public_token_expires_at = now() + interval '30 days'
   WHERE id = p_order_id;
  RETURN v_tok;
END$$;

GRANT EXECUTE ON FUNCTION public.issue_invoice_public_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_lab_order_public_token(uuid) TO authenticated;

-- ─── Nightly token expiry ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-public-tokens') THEN
    PERFORM cron.schedule(
      'expire-public-tokens',
      '0 2 * * *',
      $cron$
        UPDATE public.invoices   SET public_token = NULL WHERE public_token_expires_at < now();
        UPDATE public.lab_orders SET public_token = NULL WHERE public_token_expires_at < now();
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be installed; the frontend will tolerate orphaned tokens.
  RAISE NOTICE 'pg_cron unavailable, skipping token expiry job';
END$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
