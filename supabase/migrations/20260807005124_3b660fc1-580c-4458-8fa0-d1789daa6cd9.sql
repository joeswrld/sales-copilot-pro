
-- ─────────────────────────────────────────────────────────────
-- 1. TABLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id uuid PRIMARY KEY,
  user_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  duration_ms bigint NOT NULL DEFAULT 0,
  page_views int NOT NULL DEFAULT 0,
  clicks int NOT NULL DEFAULT 0,
  rage_clicks int NOT NULL DEFAULT 0,
  dead_clicks int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  max_scroll_pct int NOT NULL DEFAULT 0,
  device text,
  browser text,
  os text,
  country text,
  timezone text,
  screen_w int,
  screen_h int,
  entry_path text,
  exit_path text,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.analytics_sessions(id) ON DELETE CASCADE,
  user_id uuid,
  ts timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  path text,
  selector text,
  label text,
  x int,
  y int,
  vw int,
  vh int,
  scroll_pct int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_an_sessions_started ON public.analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_an_sessions_user ON public.analytics_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_an_events_session_ts ON public.analytics_events (session_id, ts);
CREATE INDEX IF NOT EXISTS idx_an_events_ts ON public.analytics_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_an_events_event_path ON public.analytics_events (event, path);

GRANT ALL ON public.analytics_sessions TO service_role;
GRANT ALL ON public.analytics_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.analytics_events_id_seq TO service_role;

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read analytics sessions" ON public.analytics_sessions;
CREATE POLICY "admins read analytics sessions" ON public.analytics_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins read analytics events" ON public.analytics_events;
CREATE POLICY "admins read analytics events" ON public.analytics_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.analytics_sessions TO authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. INGEST (only writer: SECURITY DEFINER rpc)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_ingest(_session jsonb, _events jsonb DEFAULT '[]'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := (_session->>'id')::uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.analytics_sessions (
    id, user_id, started_at, last_seen_at, device, browser, os, country, timezone,
    screen_w, screen_h, entry_path, exit_path, referrer, user_agent
  ) VALUES (
    v_id, v_uid,
    COALESCE((_session->>'started_at')::timestamptz, now()), now(),
    left(_session->>'device', 40), left(_session->>'browser', 60), left(_session->>'os', 60),
    left(_session->>'country', 8), left(_session->>'timezone', 60),
    (_session->>'screen_w')::int, (_session->>'screen_h')::int,
    left(_session->>'entry_path', 300), left(_session->>'path', 300),
    left(_session->>'referrer', 500), left(_session->>'user_agent', 400)
  )
  ON CONFLICT (id) DO UPDATE SET
    last_seen_at = now(),
    user_id      = COALESCE(public.analytics_sessions.user_id, v_uid),
    exit_path    = COALESCE(left(_session->>'path', 300), public.analytics_sessions.exit_path),
    duration_ms  = GREATEST(public.analytics_sessions.duration_ms,
                            EXTRACT(EPOCH FROM (now() - public.analytics_sessions.started_at)) * 1000);

  IF jsonb_typeof(_events) = 'array' AND jsonb_array_length(_events) > 0 THEN
    INSERT INTO public.analytics_events (
      session_id, user_id, ts, event, path, selector, label, x, y, vw, vh, scroll_pct, metadata
    )
    SELECT v_id, v_uid,
           COALESCE((e->>'ts')::timestamptz, now()),
           left(e->>'event', 40),
           left(e->>'path', 300),
           left(e->>'selector', 300),
           left(e->>'label', 200),
           (e->>'x')::int, (e->>'y')::int, (e->>'vw')::int, (e->>'vh')::int,
           (e->>'scroll_pct')::int,
           COALESCE(e->'metadata', '{}'::jsonb)
    FROM jsonb_array_elements(_events) e
    WHERE (e->>'event') IS NOT NULL
    LIMIT 200;

    UPDATE public.analytics_sessions s SET
      page_views     = s.page_views + x.pv,
      clicks         = s.clicks + x.cl,
      rage_clicks    = s.rage_clicks + x.rc,
      dead_clicks    = s.dead_clicks + x.dc,
      errors         = s.errors + x.er,
      max_scroll_pct = GREATEST(s.max_scroll_pct, x.sc)
    FROM (
      SELECT
        count(*) FILTER (WHERE e->>'event' = 'page_view')::int  AS pv,
        count(*) FILTER (WHERE e->>'event' = 'click')::int      AS cl,
        count(*) FILTER (WHERE e->>'event' = 'rage_click')::int AS rc,
        count(*) FILTER (WHERE e->>'event' = 'dead_click')::int AS dc,
        count(*) FILTER (WHERE e->>'event' = 'error')::int      AS er,
        COALESCE(max((e->>'scroll_pct')::int), 0)               AS sc
      FROM jsonb_array_elements(_events) e
    ) x
    WHERE s.id = v_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_ingest(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_ingest(jsonb, jsonb) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. ADMIN REPORTING RPCs
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_overview(
  _from timestamptz, _to timestamptz,
  _device text DEFAULT NULL, _browser text DEFAULT NULL, _country text DEFAULT NULL,
  _path text DEFAULT NULL, _user uuid DEFAULT NULL
)
RETURNS TABLE(
  sessions bigint, users bigint, page_views bigint, clicks bigint,
  rage_clicks bigint, dead_clicks bigint, errors bigint,
  avg_duration_sec numeric, bounce_rate numeric, avg_scroll_pct numeric,
  conversion_rate numeric, signups bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT * FROM public.analytics_sessions x
    WHERE x.started_at >= _from AND x.started_at <= _to
      AND (_device IS NULL OR x.device = _device)
      AND (_browser IS NULL OR x.browser = _browser)
      AND (_country IS NULL OR x.country = _country)
      AND (_user IS NULL OR x.user_id = _user)
      AND (_path IS NULL OR EXISTS (
            SELECT 1 FROM public.analytics_events e
            WHERE e.session_id = x.id AND e.path = _path))
  )
  SELECT
    count(*)::bigint,
    count(DISTINCT s.user_id)::bigint,
    COALESCE(sum(s.page_views), 0)::bigint,
    COALESCE(sum(s.clicks), 0)::bigint,
    COALESCE(sum(s.rage_clicks), 0)::bigint,
    COALESCE(sum(s.dead_clicks), 0)::bigint,
    COALESCE(sum(s.errors), 0)::bigint,
    COALESCE(round(avg(s.duration_ms) / 1000.0, 1), 0),
    CASE WHEN count(*) = 0 THEN 0
         ELSE round(count(*) FILTER (WHERE s.page_views <= 1)::numeric * 100 / count(*), 1) END,
    COALESCE(round(avg(s.max_scroll_pct), 1), 0),
    CASE WHEN count(*) = 0 THEN 0
         ELSE round(count(DISTINCT s.user_id)::numeric * 100 / count(*), 2) END,
    count(DISTINCT s.user_id)::bigint
  FROM s;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_pages(
  _from timestamptz, _to timestamptz,
  _device text DEFAULT NULL, _browser text DEFAULT NULL, _country text DEFAULT NULL,
  _user uuid DEFAULT NULL, _limit int DEFAULT 25
)
RETURNS TABLE(
  path text, views bigint, sessions bigint, exits bigint, exit_rate numeric,
  rage_clicks bigint, dead_clicks bigint, errors bigint, avg_scroll_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH s AS (
    SELECT x.* FROM public.analytics_sessions x
    WHERE x.started_at >= _from AND x.started_at <= _to
      AND (_device IS NULL OR x.device = _device)
      AND (_browser IS NULL OR x.browser = _browser)
      AND (_country IS NULL OR x.country = _country)
      AND (_user IS NULL OR x.user_id = _user)
  ), e AS (
    SELECT ev.* FROM public.analytics_events ev JOIN s ON s.id = ev.session_id
  )
  SELECT
    e.path,
    count(*) FILTER (WHERE e.event = 'page_view')::bigint AS views,
    count(DISTINCT e.session_id)::bigint AS sessions,
    (SELECT count(*) FROM s WHERE s.exit_path = e.path)::bigint AS exits,
    CASE WHEN count(DISTINCT e.session_id) = 0 THEN 0 ELSE
      round((SELECT count(*) FROM s WHERE s.exit_path = e.path)::numeric * 100
            / count(DISTINCT e.session_id), 1) END AS exit_rate,
    count(*) FILTER (WHERE e.event = 'rage_click')::bigint,
    count(*) FILTER (WHERE e.event = 'dead_click')::bigint,
    count(*) FILTER (WHERE e.event = 'error')::bigint,
    COALESCE(round(avg(e.scroll_pct) FILTER (WHERE e.event = 'scroll'), 1), 0)
  FROM e
  WHERE e.path IS NOT NULL
  GROUP BY e.path
  ORDER BY views DESC, sessions DESC
  LIMIT COALESCE(_limit, 25);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_click_map(
  _from timestamptz, _to timestamptz, _path text,
  _device text DEFAULT NULL, _grid int DEFAULT 40
)
RETURNS TABLE(gx int, gy int, kind text, hits bigint, top_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g int := GREATEST(LEAST(COALESCE(_grid, 40), 100), 10);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT
    floor(LEAST(GREATEST(e.x::numeric / NULLIF(e.vw, 0), 0), 0.999) * g)::int AS gx,
    floor(LEAST(GREATEST(e.y::numeric / NULLIF(e.vh, 0), 0), 0.999) * g)::int AS gy,
    CASE WHEN e.event = 'rage_click' THEN 'rage'
         WHEN e.event = 'dead_click' THEN 'dead' ELSE 'click' END AS kind,
    count(*)::bigint AS hits,
    (array_agg(e.label ORDER BY e.ts DESC))[1] AS top_label
  FROM public.analytics_events e
  JOIN public.analytics_sessions s ON s.id = e.session_id
  WHERE e.ts >= _from AND e.ts <= _to
    AND e.event IN ('click', 'rage_click', 'dead_click')
    AND e.x IS NOT NULL AND e.vw IS NOT NULL AND e.vw > 0 AND e.vh > 0
    AND (_path IS NULL OR e.path = _path)
    AND (_device IS NULL OR s.device = _device)
  GROUP BY 1, 2, 3
  ORDER BY hits DESC
  LIMIT 2000;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_scroll_depth(
  _from timestamptz, _to timestamptz, _path text, _device text DEFAULT NULL
)
RETURNS TABLE(depth_pct int, sessions bigint, reach_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE total bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT count(DISTINCT e.session_id) INTO total
  FROM public.analytics_events e
  JOIN public.analytics_sessions s ON s.id = e.session_id
  WHERE e.ts >= _from AND e.ts <= _to AND (_path IS NULL OR e.path = _path)
    AND (_device IS NULL OR s.device = _device) AND e.event IN ('scroll', 'page_view');

  RETURN QUERY
  WITH steps AS (SELECT generate_series(10, 100, 10) AS d),
  maxima AS (
    SELECT e.session_id, max(COALESCE(e.scroll_pct, 0)) AS m
    FROM public.analytics_events e
    JOIN public.analytics_sessions s ON s.id = e.session_id
    WHERE e.ts >= _from AND e.ts <= _to AND (_path IS NULL OR e.path = _path)
      AND (_device IS NULL OR s.device = _device)
    GROUP BY e.session_id
  )
  SELECT steps.d::int,
         count(m.session_id)::bigint,
         CASE WHEN COALESCE(total, 0) = 0 THEN 0
              ELSE round(count(m.session_id)::numeric * 100 / total, 1) END
  FROM steps LEFT JOIN maxima m ON m.m >= steps.d
  GROUP BY steps.d ORDER BY steps.d;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_ignored_elements(
  _from timestamptz, _to timestamptz, _path text DEFAULT NULL, _limit int DEFAULT 25
)
RETURNS TABLE(selector text, label text, path text, seen bigint, clicked bigint, click_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH e AS (
    SELECT * FROM public.analytics_events
    WHERE ts >= _from AND ts <= _to AND selector IS NOT NULL
      AND (_path IS NULL OR path = _path)
  ),
  seen AS (
    SELECT e.selector, e.path,
           (array_agg(e.label ORDER BY e.ts DESC))[1] AS label,
           count(DISTINCT e.session_id) AS seen_n
    FROM e WHERE e.event = 'element_view' GROUP BY e.selector, e.path
  ),
  clicked AS (
    SELECT e.selector, e.path, count(DISTINCT e.session_id) AS clicked_n
    FROM e WHERE e.event IN ('click', 'rage_click') GROUP BY e.selector, e.path
  )
  SELECT s.selector, s.label, s.path, s.seen_n::bigint,
         COALESCE(c.clicked_n, 0)::bigint,
         round(COALESCE(c.clicked_n, 0)::numeric * 100 / GREATEST(s.seen_n, 1), 1)
  FROM seen s LEFT JOIN clicked c ON c.selector = s.selector AND c.path IS NOT DISTINCT FROM s.path
  WHERE s.seen_n >= 3
  ORDER BY (COALESCE(c.clicked_n, 0)::numeric / GREATEST(s.seen_n, 1)) ASC, s.seen_n DESC
  LIMIT COALESCE(_limit, 25);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_journeys(
  _from timestamptz, _to timestamptz, _limit int DEFAULT 40
)
RETURNS TABLE(from_path text, to_path text, transitions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH v AS (
    SELECT e.session_id, e.path, e.ts,
           lead(e.path) OVER (PARTITION BY e.session_id ORDER BY e.ts) AS nxt
    FROM public.analytics_events e
    WHERE e.event = 'page_view' AND e.ts >= _from AND e.ts <= _to
  )
  SELECT v.path, COALESCE(v.nxt, '(exit)'), count(*)::bigint
  FROM v WHERE v.path IS NOT NULL AND (v.nxt IS DISTINCT FROM v.path)
  GROUP BY 1, 2 ORDER BY 3 DESC LIMIT COALESCE(_limit, 40);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_friction(
  _from timestamptz, _to timestamptz, _limit int DEFAULT 25
)
RETURNS TABLE(kind text, path text, selector text, label text, occurrences bigint, sessions bigint, sample text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT
    CASE e.event WHEN 'rage_click' THEN 'Rage click'
                 WHEN 'dead_click' THEN 'Dead click'
                 ELSE 'Error' END,
    e.path, e.selector,
    (array_agg(e.label ORDER BY e.ts DESC))[1],
    count(*)::bigint,
    count(DISTINCT e.session_id)::bigint,
    (array_agg(COALESCE(e.metadata->>'message', e.label) ORDER BY e.ts DESC))[1]
  FROM public.analytics_events e
  WHERE e.ts >= _from AND e.ts <= _to
    AND e.event IN ('rage_click', 'dead_click', 'error')
  GROUP BY e.event, e.path, e.selector
  ORDER BY count(*) DESC
  LIMIT COALESCE(_limit, 25);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_sessions_list(
  _from timestamptz, _to timestamptz,
  _device text DEFAULT NULL, _browser text DEFAULT NULL, _country text DEFAULT NULL,
  _path text DEFAULT NULL, _user uuid DEFAULT NULL, _friction_only boolean DEFAULT false,
  _limit int DEFAULT 50, _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, user_id uuid, email text, full_name text, avatar_url text,
  started_at timestamptz, duration_sec int, page_views int, clicks int,
  rage_clicks int, dead_clicks int, errors int, max_scroll_pct int,
  device text, browser text, os text, country text, entry_path text, exit_path text,
  referrer text, event_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT s.id, s.user_id, p.email, p.full_name, p.avatar_url,
         s.started_at, (s.duration_ms / 1000)::int,
         s.page_views, s.clicks, s.rage_clicks, s.dead_clicks, s.errors, s.max_scroll_pct,
         s.device, s.browser, s.os, s.country, s.entry_path, s.exit_path, s.referrer,
         (SELECT count(*) FROM public.analytics_events e WHERE e.session_id = s.id)::bigint
  FROM public.analytics_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.started_at >= _from AND s.started_at <= _to
    AND (_device IS NULL OR s.device = _device)
    AND (_browser IS NULL OR s.browser = _browser)
    AND (_country IS NULL OR s.country = _country)
    AND (_user IS NULL OR s.user_id = _user)
    AND (NOT _friction_only OR s.rage_clicks > 0 OR s.dead_clicks > 0 OR s.errors > 0)
    AND (_path IS NULL OR EXISTS (
          SELECT 1 FROM public.analytics_events e WHERE e.session_id = s.id AND e.path = _path))
  ORDER BY s.started_at DESC
  LIMIT COALESCE(_limit, 50) OFFSET COALESCE(_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_session_replay(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'session', to_jsonb(s) - 'user_agent' || jsonb_build_object(
        'user_agent', s.user_agent,
        'email', p.email, 'full_name', p.full_name, 'avatar_url', p.avatar_url),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.ts)
      FROM public.analytics_events e WHERE e.session_id = s.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.analytics_sessions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.id = _session_id;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_filter_options(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'devices',   COALESCE((SELECT jsonb_agg(DISTINCT device)  FROM public.analytics_sessions WHERE started_at BETWEEN _from AND _to AND device IS NOT NULL), '[]'::jsonb),
    'browsers',  COALESCE((SELECT jsonb_agg(DISTINCT browser) FROM public.analytics_sessions WHERE started_at BETWEEN _from AND _to AND browser IS NOT NULL), '[]'::jsonb),
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT country) FROM public.analytics_sessions WHERE started_at BETWEEN _from AND _to AND country IS NOT NULL), '[]'::jsonb),
    'paths',     COALESCE((SELECT jsonb_agg(p) FROM (SELECT DISTINCT path AS p FROM public.analytics_events WHERE ts BETWEEN _from AND _to AND path IS NOT NULL LIMIT 300) q), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_series(
  _from timestamptz, _to timestamptz, _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, sessions bigint, page_views bigint, rage_clicks bigint, dead_clicks bigint, errors bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_unit := CASE WHEN _bucket IN ('hour','day','week','month','year') THEN _bucket ELSE 'day' END;
  RETURN QUERY
  SELECT date_trunc(v_unit, e.ts),
         count(DISTINCT e.session_id)::bigint,
         count(*) FILTER (WHERE e.event = 'page_view')::bigint,
         count(*) FILTER (WHERE e.event = 'rage_click')::bigint,
         count(*) FILTER (WHERE e.event = 'dead_click')::bigint,
         count(*) FILTER (WHERE e.event = 'error')::bigint
  FROM public.analytics_events e
  WHERE e.ts >= _from AND e.ts <= _to
  GROUP BY 1 ORDER BY 1;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Extend funnel series buckets (hour / year)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_funnel_series(
  _from timestamptz, _to timestamptz, _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, visitors bigint, trial_clicks bigint, signups_started bigint, signups_completed bigint, signups_abandoned bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unit text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_unit := CASE WHEN _bucket IN ('hour','day','week','month','year') THEN _bucket ELSE 'day' END;
  RETURN QUERY
  SELECT date_trunc(v_unit, e.created_at) AS bucket,
    count(DISTINCT e.session_id) AS visitors,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'trial_click') AS trial_clicks,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_started') AS signups_started,
    count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_completed') AS signups_completed,
    GREATEST(count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_started')
             - count(DISTINCT e.session_id) FILTER (WHERE e.event = 'signup_completed'), 0)
  FROM public.funnel_events e
  WHERE e.created_at >= _from AND e.created_at <= _to
  GROUP BY 1 ORDER BY 1;
END;
$$;
