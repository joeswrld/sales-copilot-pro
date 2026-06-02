-- Enable extensions needed for HTTP from triggers + vault secrets
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- ───────────────────────────────────────────────────────────────────────
-- Store the internal handshake token in vault (idempotent)
-- ───────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  existing uuid;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = 'internal_push_token';
  IF existing IS NULL THEN
    PERFORM vault.create_secret(
      '381e98c49cee5285f226a19b859e9d63cfa52cc6d3e1aa815e3e8c69e92909da',
      'internal_push_token',
      'Internal token used by DB triggers to authenticate to send-push-notification edge function'
    );
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- Helper RPC the edge function calls to read the token
-- (security definer; not exposed to anon/authenticated)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.read_internal_push_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v
  FROM vault.decrypted_secrets
  WHERE name = 'internal_push_token'
  LIMIT 1;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.read_internal_push_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_internal_push_token() TO service_role;

-- ───────────────────────────────────────────────────────────────────────
-- Trigger function: fire push on every new notification row
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  token text;
  project_url text := 'https://dkvtufanmaiclmsnpyae.supabase.co';
BEGIN
  -- Read the internal token from vault
  SELECT decrypted_secret INTO token
  FROM vault.decrypted_secrets
  WHERE name = 'internal_push_token'
  LIMIT 1;

  IF token IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := project_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-token', token
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title',   COALESCE(NEW.title, 'Fixsense'),
      'message', NEW.message,
      'link',    NEW.link,
      'tag',     COALESCE(NEW.type, 'notification')
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if push dispatch fails
  RAISE WARNING 'dispatch_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- Attach trigger to notifications table
-- ───────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS notifications_dispatch_push ON public.notifications;
CREATE TRIGGER notifications_dispatch_push
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_push_on_notification();