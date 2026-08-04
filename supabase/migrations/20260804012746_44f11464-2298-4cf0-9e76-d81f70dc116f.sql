ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role text;

CREATE TABLE IF NOT EXISTS public.security_scan_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'manual',
  total_findings integer NOT NULL DEFAULT 0,
  new_findings integer NOT NULL DEFAULT 0,
  resolved_findings integer NOT NULL DEFAULT 0,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_scan_runs TO authenticated;
GRANT ALL ON public.security_scan_runs TO service_role;
ALTER TABLE public.security_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view security scan runs"
  ON public.security_scan_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.security_scan_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid REFERENCES public.security_scan_runs(id) ON DELETE SET NULL,
  finding_key text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'database',
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'new',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_scan_findings_key_unique UNIQUE (finding_key)
);

GRANT SELECT ON public.security_scan_findings TO authenticated;
GRANT ALL ON public.security_scan_findings TO service_role;
ALTER TABLE public.security_scan_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view security scan findings"
  ON public.security_scan_findings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ssf_state ON public.security_scan_findings(state, severity);
CREATE INDEX IF NOT EXISTS idx_ssf_run ON public.security_scan_findings(run_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_ssf_updated_at ON public.security_scan_findings;
CREATE TRIGGER update_ssf_updated_at BEFORE UPDATE ON public.security_scan_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();