-- ─────────────────────────────────────────────────────────────────────
-- Quality-control schema for Levey-Jennings charts and Westgard rules.
--
-- Tables:
--   qc_lots   — QC material lots (low / normal / high level) per test+instrument
--               with assayed mean + SD that runs are scored against.
--   qc_runs   — individual control measurements over time.
--
-- View:
--   vw_qc_runs_with_flags — adds sd_units (z-score) and rule violations
--                           (1-2s, 1-3s, 2-2s, 4-1s, 10-x) using window
--                           functions. The frontend just plots/filters this.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.qc_lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  lab_test_id        uuid NOT NULL REFERENCES public.lab_tests(id) ON DELETE RESTRICT,
  instrument_id      uuid REFERENCES public.instruments(id) ON DELETE SET NULL,
  lot_number         text NOT NULL,
  level              text NOT NULL CHECK (level IN ('low','normal','high')),
  mean_value         numeric NOT NULL,
  sd_value           numeric NOT NULL CHECK (sd_value > 0),
  manufacturer       text,
  expires_at         date,
  is_active          boolean NOT NULL DEFAULT true,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (branch_id, lab_test_id, instrument_id, lot_number, level)
);
COMMENT ON TABLE public.qc_lots IS
  'QC material lots. Each row holds the assayed mean + SD for a lot at a given level (low/normal/high) on a specific instrument.';

CREATE INDEX IF NOT EXISTS qc_lots_test_active_idx
  ON public.qc_lots (lab_test_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.qc_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_lot_id          uuid NOT NULL REFERENCES public.qc_lots(id) ON DELETE CASCADE,
  branch_id          uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  value              numeric NOT NULL,
  run_at             timestamptz NOT NULL DEFAULT now(),
  performed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shift              text CHECK (shift IN ('morning','afternoon','night')),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.qc_runs IS
  'Individual QC measurements. Each row plots one point on the Levey-Jennings chart for its lot.';

CREATE INDEX IF NOT EXISTS qc_runs_lot_runat_idx ON public.qc_runs (qc_lot_id, run_at DESC);

-- View that adds the z-score and Westgard rule flags.
-- Lag/lead window functions look at the previous N runs for the same lot
-- to evaluate consecutive-runs rules. Note: this is a deliberately
-- conservative subset of Westgard — full multi-rule logic (e.g. across
-- materials) is out of scope here.
CREATE OR REPLACE VIEW public.vw_qc_runs_with_flags AS
SELECT
  r.id,
  r.qc_lot_id,
  r.branch_id,
  l.lab_test_id,
  l.instrument_id,
  l.lot_number,
  l.level,
  l.mean_value,
  l.sd_value,
  r.value,
  r.run_at,
  r.performed_by,
  r.shift,
  -- z-score (signed SD units from mean)
  (r.value - l.mean_value) / NULLIF(l.sd_value, 0) AS sd_units,
  -- 1-2s warning: any single run beyond ±2 SD
  (ABS((r.value - l.mean_value) / NULLIF(l.sd_value, 0)) > 2)         AS warn_1_2s,
  -- 1-3s: any single run beyond ±3 SD (true error)
  (ABS((r.value - l.mean_value) / NULLIF(l.sd_value, 0)) > 3)         AS viol_1_3s,
  -- 2-2s: this run AND previous run both beyond ±2 SD on same side
  (
    ABS((r.value - l.mean_value) / NULLIF(l.sd_value, 0)) > 2
    AND ABS(
      (LAG(r.value) OVER win - l.mean_value) / NULLIF(l.sd_value, 0)
    ) > 2
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value) OVER win - l.mean_value))
  ) AS viol_2_2s,
  -- 4-1s: 4 consecutive on same side outside ±1 SD
  (
    SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 1) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 2) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 3) OVER win - l.mean_value))
    AND ABS((r.value - l.mean_value) / NULLIF(l.sd_value, 0)) > 1
    AND ABS((LAG(r.value, 1) OVER win - l.mean_value) / NULLIF(l.sd_value, 0)) > 1
    AND ABS((LAG(r.value, 2) OVER win - l.mean_value) / NULLIF(l.sd_value, 0)) > 1
    AND ABS((LAG(r.value, 3) OVER win - l.mean_value) / NULLIF(l.sd_value, 0)) > 1
  ) AS viol_4_1s,
  -- 10-x: 10 consecutive on same side of mean
  (
    SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 1) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 2) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 3) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 4) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 5) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 6) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 7) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 8) OVER win - l.mean_value))
    AND SIGN((r.value - l.mean_value)) = SIGN((LAG(r.value, 9) OVER win - l.mean_value))
  ) AS viol_10_x
FROM public.qc_runs r
JOIN public.qc_lots l ON l.id = r.qc_lot_id
WINDOW win AS (PARTITION BY r.qc_lot_id ORDER BY r.run_at);

COMMENT ON VIEW public.vw_qc_runs_with_flags IS
  'QC runs enriched with z-score and Westgard rule flags (1-2s, 1-3s, 2-2s, 4-1s, 10-x).';

-- RLS
ALTER TABLE public.qc_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qc_lots' AND policyname='qc_lots branch read'
  ) THEN
    CREATE POLICY "qc_lots branch read" ON public.qc_lots
      FOR SELECT TO authenticated
      USING (
        branch_id IS NULL
        OR EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = auth.uid()
            AND (
              (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin'))
              OR (u.raw_app_meta_data->>'branch_id')::uuid = qc_lots.branch_id
            )
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qc_lots' AND policyname='qc_lots staff write'
  ) THEN
    CREATE POLICY "qc_lots staff write" ON public.qc_lots
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = auth.uid()
            AND (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin','lab_tech'))
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qc_runs' AND policyname='qc_runs branch read'
  ) THEN
    CREATE POLICY "qc_runs branch read" ON public.qc_runs
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qc_runs' AND policyname='qc_runs staff write'
  ) THEN
    CREATE POLICY "qc_runs staff write" ON public.qc_runs
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = auth.uid()
            AND (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin','lab_tech'))
        )
      );
  END IF;
END$$;

GRANT SELECT ON public.vw_qc_runs_with_flags TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
