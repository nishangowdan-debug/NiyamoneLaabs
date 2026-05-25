-- ─────────────────────────────────────────────────────────────────────
-- NABL audit-trail schema
--
-- Three independent tables, each addressing a NABL accreditation pillar:
--   sample_chain_of_custody — every state change for a physical specimen
--                             (collected → in transit → accessioned → stored
--                              → processed → reported → disposed). Provides
--                             the audit log the assessor walks during visits.
--   instrument_calibrations — calibration / verification / user-check log
--                             per instrument, with next-due date for
--                             alerting and certificate URL.
--   staff_competencies      — competency assessments per staff member with
--                             expiry, used to gate access to high-stake
--                             procedures.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Chain of custody ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sample_chain_of_custody (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  lab_order_id      uuid REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  sample_id         text,                              -- accession number / barcode
  action            text NOT NULL CHECK (action IN (
                      'collected','in_transit','received','accessioned',
                      'stored','retrieved','processed','reported','disposed','rejected'
                    )),
  location_code     text,                              -- 'FRIDGE-2', 'BENCH-A', 'TRANSIT-VAN'
  temperature_c     numeric,                           -- when applicable
  performed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sample_chain_of_custody IS
  'Every action performed on a physical sample. Auditors walk this log during NABL assessments.';

CREATE INDEX IF NOT EXISTS coc_lab_order_idx ON public.sample_chain_of_custody (lab_order_id, occurred_at);
CREATE INDEX IF NOT EXISTS coc_sample_idx    ON public.sample_chain_of_custody (sample_id, occurred_at);

-- ── 2. Instrument calibrations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instrument_calibrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  instrument_id       uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  calibration_type    text NOT NULL CHECK (calibration_type IN (
                        'user_check','internal_verification','manufacturer_calibration','external_calibration'
                      )),
  performed_at        timestamptz NOT NULL DEFAULT now(),
  performed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_name         text,                            -- if external
  certificate_no      text,
  certificate_url     text,                            -- pdf in object storage
  result              text NOT NULL CHECK (result IN ('passed','conditional','failed')),
  next_due_at         date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.instrument_calibrations IS
  'Calibration / verification log per instrument with next-due date for alerting.';

CREATE INDEX IF NOT EXISTS calib_instrument_idx ON public.instrument_calibrations (instrument_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS calib_due_idx        ON public.instrument_calibrations (next_due_at) WHERE next_due_at IS NOT NULL;

-- ── 3. Staff competencies ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_competencies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  staff_id            uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  competency_name     text NOT NULL,
  assessed_at         date NOT NULL,
  assessor_id         uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  result              text NOT NULL CHECK (result IN ('competent','needs_training','requires_supervision','not_competent')),
  expires_at          date,
  certificate_url     text,
  evidence            text,                            -- citations / notes
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.staff_competencies IS
  'Competency assessments per staff member. Expires_at drives renewal alerts.';

CREATE INDEX IF NOT EXISTS comp_staff_idx     ON public.staff_competencies (staff_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS comp_expires_idx   ON public.staff_competencies (expires_at) WHERE expires_at IS NOT NULL;

-- ── Helper views ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_calibrations_due AS
SELECT
  c.id, c.instrument_id, c.branch_id, c.performed_at, c.result, c.next_due_at,
  c.calibration_type, c.certificate_url, c.vendor_name,
  i.code AS instrument_code, i.name AS instrument_name,
  (c.next_due_at - CURRENT_DATE) AS days_until_due,
  CASE
    WHEN c.next_due_at < CURRENT_DATE                  THEN 'overdue'
    WHEN c.next_due_at < CURRENT_DATE + INTERVAL '14 days' THEN 'due_soon'
    ELSE 'ok'
  END AS due_state
FROM public.instrument_calibrations c
JOIN public.instruments i ON i.id = c.instrument_id
WHERE c.next_due_at IS NOT NULL
  AND c.id IN (
    SELECT DISTINCT ON (instrument_id) id
    FROM public.instrument_calibrations
    ORDER BY instrument_id, performed_at DESC
  );

COMMENT ON VIEW public.vw_calibrations_due IS
  'Latest calibration per instrument with due-soon / overdue classification.';

CREATE OR REPLACE VIEW public.vw_competencies_expiring AS
SELECT
  c.id, c.staff_id, c.branch_id, c.competency_name, c.assessed_at, c.expires_at,
  c.result, c.certificate_url,
  s.full_name AS staff_name, s.role_slug,
  (c.expires_at - CURRENT_DATE) AS days_until_expiry,
  CASE
    WHEN c.expires_at < CURRENT_DATE                       THEN 'expired'
    WHEN c.expires_at < CURRENT_DATE + INTERVAL '30 days'  THEN 'expiring_soon'
    ELSE 'current'
  END AS state
FROM public.staff_competencies c
JOIN public.staff s ON s.id = c.staff_id
WHERE c.expires_at IS NOT NULL
  AND c.id IN (
    SELECT DISTINCT ON (staff_id, competency_name) id
    FROM public.staff_competencies
    ORDER BY staff_id, competency_name, assessed_at DESC
  );

COMMENT ON VIEW public.vw_competencies_expiring IS
  'Latest assessment per (staff, competency) with expiry classification.';

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.sample_chain_of_custody  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_calibrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_competencies       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sample_chain_of_custody','instrument_calibrations','staff_competencies']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='nabl read auth'
    ) THEN
      EXECUTE format('CREATE POLICY "nabl read auth" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='nabl write staff'
    ) THEN
      EXECUTE format($p$
        CREATE POLICY "nabl write staff" ON public.%I
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM auth.users u
              WHERE u.id = auth.uid()
                AND (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin','quality_officer','lab_tech'))
            )
          )
      $p$, t);
    END IF;
  END LOOP;
END$$;

GRANT SELECT ON public.vw_calibrations_due     TO authenticated;
GRANT SELECT ON public.vw_competencies_expiring TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
