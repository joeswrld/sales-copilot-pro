ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS retention_outcome text,
  ADD COLUMN IF NOT EXISTS retention_offer_shown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.churn_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  plan text,
  event_type text NOT NULL DEFAULT 'cancelled',
  cancellation_reason text,
  cancellation_feedback text,
  retention_outcome text,
  retention_offer_shown boolean NOT NULL DEFAULT false,
  mrr_usd numeric DEFAULT 0,
  access_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.churn_events TO authenticated;
GRANT ALL ON public.churn_events TO service_role;
ALTER TABLE public.churn_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "churn_events_own_select" ON public.churn_events;
CREATE POLICY "churn_events_own_select" ON public.churn_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE INDEX IF NOT EXISTS churn_events_created_idx ON public.churn_events (created_at DESC);
CREATE INDEX IF NOT EXISTS churn_events_user_idx ON public.churn_events (user_id);

CREATE OR REPLACE FUNCTION public.admin_churn_reasons(_from timestamptz, _to timestamptz)
RETURNS TABLE(
  reason text,
  cancellations bigint,
  reactivations bigint,
  retained bigint,
  mrr_lost_usd numeric,
  share_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT COUNT(*) INTO total
  FROM public.churn_events
  WHERE event_type = 'cancelled' AND created_at BETWEEN _from AND _to;

  RETURN QUERY
  WITH base AS (
    SELECT COALESCE(NULLIF(TRIM(ce.cancellation_reason), ''), 'Not specified') AS reason,
           ce.user_id,
           ce.retention_outcome,
           COALESCE(ce.mrr_usd, 0) AS mrr_usd
    FROM public.churn_events ce
    WHERE ce.event_type = 'cancelled' AND ce.created_at BETWEEN _from AND _to
  )
  SELECT b.reason,
         COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE b.retention_outcome = 'reactivated')::bigint,
         COUNT(*) FILTER (WHERE b.retention_outcome = 'retained')::bigint,
         ROUND(SUM(b.mrr_usd)::numeric, 2),
         CASE WHEN total > 0 THEN ROUND((COUNT(*)::numeric / total) * 100, 1) ELSE 0 END
  FROM base b
  GROUP BY b.reason
  ORDER BY 2 DESC;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_churn_feedback(_from timestamptz, _to timestamptz, _limit int DEFAULT 50)
RETURNS TABLE(
  created_at timestamptz,
  email text,
  plan text,
  reason text,
  feedback text,
  retention_outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
  SELECT ce.created_at,
         p.email,
         ce.plan,
         COALESCE(NULLIF(TRIM(ce.cancellation_reason), ''), 'Not specified'),
         ce.cancellation_feedback,
         ce.retention_outcome
  FROM public.churn_events ce
  LEFT JOIN public.profiles p ON p.id = ce.user_id
  WHERE ce.event_type = 'cancelled' AND ce.created_at BETWEEN _from AND _to
  ORDER BY ce.created_at DESC
  LIMIT COALESCE(_limit, 50);
END; $function$;