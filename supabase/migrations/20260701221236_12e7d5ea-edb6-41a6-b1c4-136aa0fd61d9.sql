-- billing_audit_log for tracking auto-downgrade actions
CREATE TABLE IF NOT EXISTS public.billing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  old_plan text,
  new_plan text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_audit_log TO authenticated;
GRANT ALL ON public.billing_audit_log TO service_role;

ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='billing_audit_log'
      AND policyname='own_billing_audit_read'
  ) THEN
    CREATE POLICY own_billing_audit_read ON public.billing_audit_log
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Schedule hourly billing lifecycle reconciliation
DO $$
DECLARE
  v_url text := 'https://dkvtufanmaiclmsnpyae.supabase.co/functions/v1/billing-lifecycle';
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-lifecycle-hourly') THEN
    PERFORM cron.unschedule('billing-lifecycle-hourly');
  END IF;

  PERFORM cron.schedule(
    'billing-lifecycle-hourly',
    '0 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{}'::jsonb
      );
    $cron$, v_url, COALESCE(v_key, ''))
  );
END $$;
