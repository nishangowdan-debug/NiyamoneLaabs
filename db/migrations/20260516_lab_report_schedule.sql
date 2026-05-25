-- ─────────────────────────────────────────────────────────────────────
-- Lab report email schedule
--
-- 1. `report_recipients` table — who gets the daily/weekly/monthly emails.
-- 2. Enable pg_cron + pg_net extensions (if not already enabled).
-- 3. Schedule three cron jobs that POST to the `send-lab-report` Edge Function.
--
-- IMPORTANT: before running, set two project URL variables:
--   - <SUPABASE_URL>   e.g. https://wdsbkwfhfwqczqhunyac.supabase.co
--   - <ANON_KEY>       the project's anon key
-- Replace the placeholders in the cron.schedule() calls below.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Recipients
CREATE TABLE IF NOT EXISTS public.report_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  branch_id   uuid REFERENCES public.branches(id),       -- NULL = all hospitals
  cadence     text NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (email, cadence, branch_id)
);
COMMENT ON TABLE public.report_recipients IS
  'Recipients for scheduled lab report emails. cadence = daily | weekly | monthly. NULL branch_id receives the all-hospitals roll-up.';

CREATE INDEX IF NOT EXISTS report_recipients_active_cadence_idx
  ON public.report_recipients (cadence) WHERE is_active = true;

ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='report_recipients' AND policyname='admins manage recipients'
  ) THEN
    CREATE POLICY "admins manage recipients" ON public.report_recipients
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = auth.uid()
            AND (u.raw_app_meta_data->>'role' IN ('super_admin','admin','lab_admin'))
        )
      );
  END IF;
END$$;

-- 2. Extensions for cron + http
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Cron schedules. Replace the URL + ANON_KEY before running, or run this
--    block separately after editing.
--
-- The function URL is always: <SUPABASE_URL>/functions/v1/send-lab-report
-- The Authorization header carries the project's anon key.
--
-- Schedules (IST = UTC+5:30):
--   • Daily at 08:00 IST → 02:30 UTC
--   • Weekly Monday 08:00 IST → 02:30 UTC Monday
--   • Monthly on day 1 at 08:00 IST → 02:30 UTC day 1
--
-- If you re-run this migration, drop existing jobs first:
--   SELECT cron.unschedule('lab-report-daily');
--   SELECT cron.unschedule('lab-report-weekly');
--   SELECT cron.unschedule('lab-report-monthly');

-- Daily
SELECT cron.schedule(
  'lab-report-daily',
  '30 2 * * *',
  $job$
    SELECT net.http_post(
      url     := '<SUPABASE_URL>/functions/v1/send-lab-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body    := jsonb_build_object('range_preset', 'daily')
    );
  $job$
);

-- Weekly (Mondays)
SELECT cron.schedule(
  'lab-report-weekly',
  '30 2 * * 1',
  $job$
    SELECT net.http_post(
      url     := '<SUPABASE_URL>/functions/v1/send-lab-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body    := jsonb_build_object('range_preset', 'weekly')
    );
  $job$
);

-- Monthly (1st of each month)
SELECT cron.schedule(
  'lab-report-monthly',
  '30 2 1 * *',
  $job$
    SELECT net.http_post(
      url     := '<SUPABASE_URL>/functions/v1/send-lab-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body    := jsonb_build_object('range_preset', 'monthly')
    );
  $job$
);

COMMIT;

-- ─── How to inspect / verify ──────────────────────────────────────────
-- List schedules:   SELECT * FROM cron.job;
-- Recent runs:      SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Disable a job:    UPDATE cron.job SET active = false WHERE jobname = 'lab-report-daily';
-- Manual test:      Invoke the Edge Function from /lab-reports admin UI.
