-- ─────────────────────────────────────────────────────────────────────
-- External Quality Assessment (EQA / PT) schema
--
-- Tables:
--   eqa_programs       — external proficiency programs the lab is enrolled in
--                        (e.g. CMC NABL, RIQAS, BIO-RAD EQAS).
--   eqa_program_tests  — which lab_tests each program covers (many-to-many).
--   eqa_cycles         — each round / shipment of blind samples.
--   eqa_results        — our submitted value vs. reference value + grade.
--
-- View:
--   vw_eqa_recent      — last 12 months of cycles + result grades, used by
--                        the reports page.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.eqa_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  code            text NOT NULL,                       -- e.g. 'CMC-CHEM-2026'
  provider_name   text NOT NULL,                       -- 'CMC NABL', 'RIQAS', 'BIO-RAD'
  frequency       text NOT NULL CHECK (frequency IN ('monthly','quarterly','biannual','annual')),
  scope           text,
  is_active       boolean NOT NULL DEFAULT true,
  contact_email   text,
  contact_phone   text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);
COMMENT ON TABLE public.eqa_programs IS
  'External proficiency programs the lab participates in.';

CREATE TABLE IF NOT EXISTS public.eqa_program_tests (
  program_id      uuid NOT NULL REFERENCES public.eqa_programs(id) ON DELETE CASCADE,
  lab_test_id     uuid NOT NULL REFERENCES public.lab_tests(id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, lab_test_id)
);

CREATE TABLE IF NOT EXISTS public.eqa_cycles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            uuid NOT NULL REFERENCES public.eqa_programs(id) ON DELETE CASCADE,
  cycle_label           text NOT NULL,                 -- e.g. '2026-Q1'
  sample_id             text,                          -- provider's tracking ID
  received_at           date,
  submit_due_at         date,
  result_published_at   date,
  status                text NOT NULL DEFAULT 'received'
                          CHECK (status IN ('received','submitted','graded','missed')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, cycle_label)
);
COMMENT ON TABLE public.eqa_cycles IS
  'One round of EQA — a shipment of blind samples with submission deadline.';

CREATE INDEX IF NOT EXISTS eqa_cycles_program_idx ON public.eqa_cycles (program_id, cycle_label);

CREATE TABLE IF NOT EXISTS public.eqa_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            uuid NOT NULL REFERENCES public.eqa_cycles(id) ON DELETE CASCADE,
  lab_test_id         uuid NOT NULL REFERENCES public.lab_tests(id) ON DELETE RESTRICT,
  branch_id           uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  our_value           numeric,
  reference_value     numeric,
  /** signed (our - reference) / reference_sd; populated when provider publishes target SD. */
  sd_units            numeric,
  grade               text CHECK (grade IN ('excellent','good','acceptable','poor','unacceptable')),
  submitted_at        timestamptz,
  submitted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at           timestamptz,
  comments            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, lab_test_id)
);
COMMENT ON TABLE public.eqa_results IS
  'Our submitted value + provider reference + grade for each test in a cycle.';

CREATE INDEX IF NOT EXISTS eqa_results_test_grade_idx ON public.eqa_results (lab_test_id, grade);

-- Convenient view for the reports page.
CREATE OR REPLACE VIEW public.vw_eqa_recent AS
SELECT
  r.id, r.cycle_id, r.lab_test_id, r.branch_id, r.our_value, r.reference_value,
  r.sd_units, r.grade, r.submitted_at, r.graded_at, r.comments,
  c.cycle_label, c.received_at, c.submit_due_at, c.result_published_at, c.status AS cycle_status,
  p.code AS program_code, p.provider_name, p.frequency,
  t.code AS test_code, t.name AS test_name, t.category AS test_category
FROM public.eqa_results r
JOIN public.eqa_cycles   c ON c.id = r.cycle_id
JOIN public.eqa_programs p ON p.id = c.program_id
JOIN public.lab_tests    t ON t.id = r.lab_test_id
WHERE COALESCE(c.received_at, c.result_published_at, CURRENT_DATE)
      >= CURRENT_DATE - INTERVAL '12 months';

COMMENT ON VIEW public.vw_eqa_recent IS
  'Last 12 months of EQA results, flattened with program + test context.';

-- RLS
ALTER TABLE public.eqa_programs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eqa_program_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eqa_cycles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eqa_results       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eqa_programs','eqa_program_tests','eqa_cycles','eqa_results']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname='eqa read all auth'
    ) THEN
      EXECUTE format('CREATE POLICY "eqa read all auth" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname='eqa write staff'
    ) THEN
      EXECUTE format($p$
        CREATE POLICY "eqa write staff" ON public.%I
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM auth.users u
              WHERE u.id = auth.uid()
                AND (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin','quality_officer'))
            )
          )
      $p$, t);
    END IF;
  END LOOP;
END$$;

GRANT SELECT ON public.vw_eqa_recent TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
