
-- ========== AUDIT LOGS TABLE ==========
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_email text,
  team_id uuid,
  action text NOT NULL,
  category text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  target_type text,
  target_id text,
  ip_address text,
  user_agent text,
  device text,
  browser text,
  country text,
  city text,
  risk_score int NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs (severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON public.audit_logs (team_id);

-- RLS policies
DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert own audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own audit logs" ON public.audit_logs;
CREATE POLICY "Users can read own audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

-- ========== HELPER FUNCTION ==========
CREATE OR REPLACE FUNCTION public.log_audit(
  _user_id uuid,
  _action text,
  _category text DEFAULT NULL,
  _severity text DEFAULT 'info',
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _team_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = _user_id LIMIT 1;
  INSERT INTO public.audit_logs (user_id, actor_email, team_id, action, category, severity, target_type, target_id, details)
  VALUES (_user_id, v_email, _team_id, _action, _category, _severity, _target_type, _target_id, COALESCE(_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ========== TRIGGERS ==========
-- Subscriptions
CREATE OR REPLACE FUNCTION public.trg_audit_subscriptions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.user_id, 'billing.subscription_created', 'billing', 'info', 'subscription', NEW.id::text,
      jsonb_build_object('plan', NEW.plan, 'status', NEW.status), NEW.team_id);
  ELSIF TG_OP = 'UPDATE' AND (OLD.plan IS DISTINCT FROM NEW.plan OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.log_audit(NEW.user_id, 'billing.plan_change', 'billing', 'info', 'subscription', NEW.id::text,
      jsonb_build_object('from_plan', OLD.plan, 'to_plan', NEW.plan, 'from_status', OLD.status, 'to_status', NEW.status), NEW.team_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_subscriptions ON public.subscriptions;
CREATE TRIGGER audit_subscriptions AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_subscriptions();

-- Payments
CREATE OR REPLACE FUNCTION public.trg_audit_payments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_audit(NEW.user_id, 'billing.payment', 'billing',
    CASE WHEN NEW.status = 'success' THEN 'info' ELSE 'warn' END,
    'payment', NEW.id::text,
    jsonb_build_object('amount', NEW.amount, 'status', NEW.status, 'plan', NEW.plan_selected, 'ref', NEW.paystack_reference));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_payments ON public.payments;
CREATE TRIGGER audit_payments AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_payments();

-- Bundle purchases (extra minutes)
CREATE OR REPLACE FUNCTION public.trg_audit_bundle_purchases() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_audit(NEW.user_id, 'billing.extra_minutes', 'billing', 'info',
    'bundle_purchase', NEW.id::text,
    jsonb_build_object('minutes', NEW.minutes_added, 'amount_kobo', NEW.amount_kobo, 'ref', NEW.paystack_reference));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_bundle_purchases ON public.bundle_purchases;
CREATE TRIGGER audit_bundle_purchases AFTER INSERT ON public.bundle_purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_bundle_purchases();

-- Calls (meeting lifecycle)
CREATE OR REPLACE FUNCTION public.trg_audit_calls() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.user_id, 'meeting.created', 'meeting', 'info', 'call', NEW.id::text,
      jsonb_build_object('platform', NEW.platform, 'status', NEW.status, 'name', NEW.name));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_audit(NEW.user_id,
      CASE WHEN NEW.status IN ('active','live','in_progress') THEN 'meeting.start'
           WHEN NEW.status IN ('completed','ended') THEN 'meeting.end'
           ELSE 'meeting.status_change' END,
      'meeting', 'info', 'call', NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'duration_minutes', NEW.duration_minutes));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_calls ON public.calls;
CREATE TRIGGER audit_calls AFTER INSERT OR UPDATE ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_calls();

-- Team messages
CREATE OR REPLACE FUNCTION public.trg_audit_team_messages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_audit(NEW.sender_id, 'message.sent', 'messaging', 'info',
    'message', NEW.id::text,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'has_file', NEW.file_url IS NOT NULL));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_team_messages ON public.team_messages;
CREATE TRIGGER audit_team_messages AFTER INSERT ON public.team_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_team_messages();

-- Team invitations
CREATE OR REPLACE FUNCTION public.trg_audit_team_invitations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_audit(NEW.invited_by, 'team.invite', 'team', 'info',
    'invitation', NEW.id::text,
    jsonb_build_object('email', NEW.email, 'role', NEW.role, 'team_id', NEW.team_id), NEW.team_id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_team_invitations ON public.team_invitations;
CREATE TRIGGER audit_team_invitations AFTER INSERT ON public.team_invitations
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_team_invitations();

-- Team members
CREATE OR REPLACE FUNCTION public.trg_audit_team_members() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.user_id, 'team.member_added', 'team', 'info', 'team_member', NEW.id::text,
      jsonb_build_object('team_id', NEW.team_id, 'role', NEW.role), NEW.team_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(OLD.user_id, 'team.member_removed', 'team', 'warn', 'team_member', OLD.id::text,
      jsonb_build_object('team_id', OLD.team_id, 'role', OLD.role), OLD.team_id);
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_team_members ON public.team_members;
CREATE TRIGGER audit_team_members AFTER INSERT OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_team_members();

-- Deals
CREATE OR REPLACE FUNCTION public.trg_audit_deals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(NEW.owner_id, 'deal.created', 'deal', 'info', 'deal', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'stage', NEW.stage, 'value', NEW.value), NEW.team_id);
  ELSIF TG_OP = 'UPDATE' AND (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.value IS DISTINCT FROM NEW.value) THEN
    PERFORM public.log_audit(NEW.owner_id, 'deal.updated', 'deal', 'info', 'deal', NEW.id::text,
      jsonb_build_object('from_stage', OLD.stage, 'to_stage', NEW.stage, 'from_value', OLD.value, 'to_value', NEW.value), NEW.team_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_deals ON public.deals;
CREATE TRIGGER audit_deals AFTER INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_deals();

-- Profiles
CREATE OR REPLACE FUNCTION public.trg_audit_profiles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.full_name IS DISTINCT FROM NEW.full_name)
     OR (OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
     OR (OLD.email IS DISTINCT FROM NEW.email) THEN
    PERFORM public.log_audit(NEW.id, 'profile.updated', 'profile', 'info', 'profile', NEW.id::text,
      jsonb_build_object('changed_fields',
        ARRAY(
          SELECT k FROM (VALUES
            ('full_name', OLD.full_name IS DISTINCT FROM NEW.full_name),
            ('avatar_url', OLD.avatar_url IS DISTINCT FROM NEW.avatar_url),
            ('email', OLD.email IS DISTINCT FROM NEW.email)
          ) AS t(k, changed) WHERE changed
        )));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_profiles();

-- Mirror security_events
CREATE OR REPLACE FUNCTION public.trg_audit_security_events() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, category, severity, ip_address, user_agent, details)
  VALUES (NEW.user_id, 'security.' || NEW.event_type, 'security', NEW.severity, NEW.source_ip, NEW.user_agent, NEW.details);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS audit_security_events ON public.security_events;
CREATE TRIGGER audit_security_events AFTER INSERT ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_security_events();

-- ========== ADMIN ANALYTICS RPCs ==========
CREATE OR REPLACE FUNCTION public.admin_revenue_series(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (bucket timestamptz, revenue numeric, payment_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, p.created_at) AS bucket,
           COALESCE(SUM(p.amount), 0)::numeric AS revenue,
           COUNT(*)::bigint AS payment_count
    FROM public.payments p
    WHERE p.status = 'success' AND p.created_at BETWEEN _from AND _to
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_growth(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (bucket timestamptz, signups bigint, cumulative bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    WITH s AS (
      SELECT date_trunc(_bucket, created_at) AS b, COUNT(*) AS c
      FROM public.profiles WHERE created_at BETWEEN _from AND _to
      GROUP BY 1
    )
    SELECT b, c::bigint, SUM(c) OVER (ORDER BY b)::bigint FROM s ORDER BY b;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_plan_breakdown()
RETURNS TABLE (plan text, count bigint, revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT COALESCE(s.plan, 'free') AS plan,
           COUNT(*)::bigint,
           COALESCE(SUM(s.amount_kobo)/100.0, 0)::numeric
    FROM public.subscriptions s
    WHERE s.status IN ('active','trialing') OR s.status IS NULL
    GROUP BY 1 ORDER BY 2 DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_active_users(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (bucket timestamptz, active_users bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, created_at) AS bucket, COUNT(DISTINCT user_id)::bigint
    FROM public.audit_logs
    WHERE created_at BETWEEN _from AND _to AND user_id IS NOT NULL
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_churn_rate(_from timestamptz, _to timestamptz)
RETURNS TABLE (bucket timestamptz, churn_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    WITH monthly AS (
      SELECT date_trunc('month', updated_at) AS b,
             COUNT(*) FILTER (WHERE status IN ('canceled','cancelled','expired')) AS churned,
             COUNT(*) AS total
      FROM public.subscriptions
      WHERE updated_at BETWEEN _from AND _to
      GROUP BY 1
    )
    SELECT b, CASE WHEN total > 0 THEN ROUND((churned::numeric / total) * 100, 2) ELSE 0 END
    FROM monthly ORDER BY b;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_arpu(_from timestamptz, _to timestamptz)
RETURNS TABLE (bucket timestamptz, arpu numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT date_trunc('month', p.created_at) AS bucket,
           CASE WHEN COUNT(DISTINCT p.user_id) > 0
                THEN ROUND(SUM(p.amount)::numeric / COUNT(DISTINCT p.user_id), 2)
                ELSE 0 END
    FROM public.payments p
    WHERE p.status = 'success' AND p.created_at BETWEEN _from AND _to
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_minutes_consumed(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (bucket timestamptz, minutes bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, COALESCE(end_time, created_at)) AS bucket,
           COALESCE(SUM(duration_minutes), 0)::bigint
    FROM public.calls
    WHERE COALESCE(end_time, created_at) BETWEEN _from AND _to
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_extra_minutes_series(_from timestamptz, _to timestamptz, _bucket text DEFAULT 'day')
RETURNS TABLE (bucket timestamptz, minutes bigint, revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, verified_at) AS bucket,
           COALESCE(SUM(minutes_added),0)::bigint,
           COALESCE(SUM(amount_kobo)/100.0,0)::numeric
    FROM public.bundle_purchases
    WHERE verified_at BETWEEN _from AND _to
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_profit_cost(_from timestamptz, _to timestamptz)
RETURNS TABLE (bucket timestamptz, revenue numeric, cost numeric, profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN QUERY
    WITH rev AS (
      SELECT date_trunc('month', p.created_at) AS b, SUM(p.amount)::numeric AS r
      FROM public.payments p WHERE p.status='success' AND p.created_at BETWEEN _from AND _to GROUP BY 1
    ), cost AS (
      SELECT date_trunc('month', COALESCE(end_time, created_at)) AS b, (SUM(duration_minutes)*0.05)::numeric AS c
      FROM public.calls WHERE COALESCE(end_time, created_at) BETWEEN _from AND _to GROUP BY 1
    )
    SELECT COALESCE(rev.b, cost.b) AS bucket,
           COALESCE(rev.r,0), COALESCE(cost.c,0),
           COALESCE(rev.r,0) - COALESCE(cost.c,0)
    FROM rev FULL OUTER JOIN cost USING (b) ORDER BY bucket;
END; $$;

CREATE OR REPLACE FUNCTION public.get_user_activity(_user_id uuid, _limit int DEFAULT 200)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() AND _user_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.audit_logs WHERE user_id = _user_id ORDER BY created_at DESC LIMIT _limit;
END; $$;

CREATE OR REPLACE FUNCTION public.compute_risk_score(_user_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_failed int; v_critical int; v_score int;
BEGIN
  SELECT COUNT(*) INTO v_failed FROM public.audit_logs
    WHERE user_id = _user_id AND action LIKE '%login_failed%' AND created_at > now() - interval '24 hours';
  SELECT COUNT(*) INTO v_critical FROM public.audit_logs
    WHERE user_id = _user_id AND severity IN ('error','critical') AND created_at > now() - interval '24 hours';
  v_score := LEAST(100, v_failed * 10 + v_critical * 15);
  RETURN v_score;
END; $$;
