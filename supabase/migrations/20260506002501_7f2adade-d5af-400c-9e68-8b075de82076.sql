
-- Security events table for monitoring & brute-force protection
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source_ip text,
  user_agent text,
  user_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can view security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only service role can insert (edge functions)
CREATE POLICY "Service role inserts security events"
  ON public.security_events FOR INSERT TO service_role
  WITH CHECK (true);

-- Index for fast lookups by IP (brute-force detection)
CREATE INDEX idx_security_events_ip_type ON public.security_events (source_ip, event_type, created_at DESC);
CREATE INDEX idx_security_events_created ON public.security_events (created_at DESC);

-- Rate limit tracking table (in-memory in edge functions, DB for persistence)
CREATE TABLE IF NOT EXISTS public.rate_limit_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  blocked_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rate limit blocks"
  ON public.rate_limit_blocks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages rate limit blocks"
  ON public.rate_limit_blocks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_rate_limit_blocks_lookup ON public.rate_limit_blocks (identifier, endpoint, blocked_until DESC);
