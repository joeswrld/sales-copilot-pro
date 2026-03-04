
-- user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  auto_join_meetings boolean NOT NULL DEFAULT false,
  real_time_objection_alerts boolean NOT NULL DEFAULT true,
  post_call_email_summary boolean NOT NULL DEFAULT true,
  crm_auto_sync boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations" ON public.integrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integrations" ON public.integrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own integrations" ON public.integrations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own integrations" ON public.integrations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add plan fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS calls_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS gdpr_consent boolean NOT NULL DEFAULT false;

-- crm_sync_logs table
CREATE TABLE IF NOT EXISTS public.crm_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  call_id uuid NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crm_sync_logs" ON public.crm_sync_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own crm_sync_logs" ON public.crm_sync_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;

-- Auto-create user_preferences on new user (via trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_preferences();

-- Seed default integrations for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_integrations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.integrations (user_id, provider, status) VALUES
    (NEW.id, 'zoom', 'disconnected'),
    (NEW.id, 'google_meet', 'disconnected'),
    (NEW.id, 'teams', 'disconnected'),
    (NEW.id, 'salesforce', 'disconnected'),
    (NEW.id, 'hubspot', 'disconnected'),
    (NEW.id, 'slack', 'disconnected')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_integrations
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_integrations();
