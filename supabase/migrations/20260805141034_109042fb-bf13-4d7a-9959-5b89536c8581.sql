CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event text NOT NULL,
  path text,
  referrer text,
  user_agent text,
  user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.funnel_events TO anon;
GRANT INSERT, SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record funnel events"
  ON public.funnel_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read funnel events"
  ON public.funnel_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS funnel_events_created_idx ON public.funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_event_idx ON public.funnel_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_session_idx ON public.funnel_events (session_id);

CREATE OR REPLACE FUNCTION public.admin_funnel_metrics(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  visitors bigint,
  page_views bigint,
  trial_clicks bigint,
  signups_started bigint,
  signups_completed bigint,
  signups_abandoned bigint,
  visit_to_trial_pct numeric,
  trial_to_signup_pct numeric,
  signup_abandon_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitors bigint;
  v_views bigint;
  v_clicks bigint;
  v_started bigint;
  v_completed bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(DISTINCT session_id), count(*) FILTER (WHERE event = 'page_view')
    INTO v_visitors, v_views
  FROM public.funnel_events
  WHERE created_at >= _from AND created_at <= _to;

  SELECT count(DISTINCT session_id) INTO v_clicks
  FROM public.funnel_events
  WHERE event = 'trial_click' AND created_at >= _from AND created_at <= _to;

  SELECT count(DISTINCT session_id) INTO v_started
  FROM public.funnel_events
  WHERE event = 'signup_started' AND created_at >= _from AND created_at <= _to;

  SELECT count(DISTINCT session_id) INTO v_completed
  FROM public.funnel_events
  WHERE event = 'signup_completed' AND created_at >= _from AND created_at <= _to;

  RETURN QUERY SELECT
    COALESCE(v_visitors, 0),
    COALESCE(v_views, 0),
    COALESCE(v_clicks, 0),
    COALESCE(v_started, 0),
    COALESCE(v_completed, 0),
    GREATEST(COALESCE(v_started, 0) - COALESCE(v_completed, 0), 0),
    CASE WHEN COALESCE(v_visitors, 0) = 0 THEN 0 ELSE round(v_clicks::numeric * 100 / v_visitors, 2) END,
    CASE WHEN COALESCE(v_clicks, 0) = 0 THEN 0 ELSE round(v_completed::numeric * 100 / v_clicks, 2) END,
    CASE WHEN COALESCE(v_started, 0) = 0 THEN 0 ELSE round(GREATEST(v_started - v_completed, 0)::numeric * 100 / v_started, 2) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_funnel_series(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (
  bucket timestamptz,
  visitors bigint,
  trial_clicks bigint,
  signups_started bigint,
  signups_completed bigint,
  signups_abandoned bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_unit := CASE WHEN _bucket IN ('day', 'week', 'month') THEN _bucket ELSE 'day' END;

  RETURN QUERY
  SELECT
    date_trunc(v_unit, e.created_at) AS bucket,
    count(DISTINCT e.session_id) AS visitors,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'trial_click') AS trial_clicks,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_started') AS signups_started,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_completed') AS signups_completed,
    GREATEST(
      count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_started')
      - count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_completed'), 0
    ) AS signups_abandoned
  FROM public.funnel_events e
  WHERE e.created_at >= _from AND e.created_at <= _to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_security_scan_overview(_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runs jsonb;
  v_findings jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC), '[]'::jsonb) INTO v_runs
  FROM (SELECT * FROM public.security_scan_runs ORDER BY started_at DESC LIMIT COALESCE(_limit, 20)) r;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.last_seen_at DESC), '[]'::jsonb) INTO v_findings
  FROM (SELECT * FROM public.security_scan_findings ORDER BY last_seen_at DESC LIMIT 200) f;

  RETURN jsonb_build_object('runs', v_runs, 'findings', v_findings);
END;
$$;