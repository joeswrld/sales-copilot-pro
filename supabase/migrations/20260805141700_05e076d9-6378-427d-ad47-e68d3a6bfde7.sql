CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_security_regression_scan(_trigger text DEFAULT 'cron')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_now timestamptz := now();
  v_new int := 0;
  v_resolved int := 0;
  v_total int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.security_scan_runs (status, trigger_source)
  VALUES ('running', COALESCE(_trigger, 'cron'))
  RETURNING id INTO v_run_id;

  CREATE TEMP TABLE _probe ON COMMIT DROP AS
  SELECT * FROM public.security_scan_probe();

  SELECT count(*) INTO v_total FROM _probe;

  -- Update findings that still reproduce
  UPDATE public.security_scan_findings f
  SET run_id = v_run_id,
      state = 'open',
      severity = p.severity,
      title = p.title,
      detail = p.detail,
      metadata = p.metadata,
      last_seen_at = v_now,
      updated_at = v_now
  FROM _probe p
  WHERE f.finding_key = p.finding_key AND f.state <> 'resolved';

  -- Insert brand-new findings
  WITH ins AS (
    INSERT INTO public.security_scan_findings (
      run_id, finding_key, title, severity, category, detail, metadata,
      state, first_seen_at, last_seen_at
    )
    SELECT v_run_id, p.finding_key, p.title, p.severity, p.category, p.detail, p.metadata,
           'new', v_now, v_now
    FROM _probe p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.security_scan_findings f
      WHERE f.finding_key = p.finding_key AND f.state <> 'resolved'
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_new FROM ins;

  -- Auto-resolve findings that no longer reproduce
  WITH res AS (
    UPDATE public.security_scan_findings f
    SET state = 'resolved', resolved_at = v_now, updated_at = v_now
    WHERE f.state <> 'resolved'
      AND NOT EXISTS (SELECT 1 FROM _probe p WHERE p.finding_key = f.finding_key)
    RETURNING 1
  )
  SELECT count(*) INTO v_resolved FROM res;

  UPDATE public.security_scan_runs
  SET status = 'completed',
      finished_at = now(),
      total_findings = v_total,
      new_findings = v_new,
      resolved_findings = v_resolved
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_security_regression_scan(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.run_security_regression_scan(text) TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('security-regression-scan-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'security-regression-scan-hourly',
  '17 * * * *',
  $$SELECT public.run_security_regression_scan('cron');$$
);