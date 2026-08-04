
-- 1. Restrict service-role catch-all policy on call_final_transcripts
DROP POLICY IF EXISTS "Service role full access on call_final_transcripts" ON public.call_final_transcripts;
CREATE POLICY "Service role full access on call_final_transcripts"
ON public.call_final_transcripts FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 2. Validate notification links are same-origin relative paths
CREATE OR REPLACE FUNCTION public.validate_notification_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.link IS NOT NULL AND NEW.link <> '' THEN
    IF NEW.link !~ '^/[A-Za-z0-9_\-/\.\?=&%#]*$' OR NEW.link LIKE '//%' THEN
      RAISE EXCEPTION 'Invalid notification link: must be an internal relative path';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_notification_link ON public.notifications;
CREATE TRIGGER trg_validate_notification_link
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.validate_notification_link();

-- 3. Hide secret columns from client roles (column-level grants)
REVOKE SELECT ON public.api_keys FROM authenticated, anon;
GRANT SELECT (id, user_id, key_prefix, name, scopes, last_used_at, expires_at, revoked, created_at)
  ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

REVOKE SELECT ON public.asana_configs FROM authenticated, anon;
GRANT SELECT (id, user_id, workspace_gid, workspace_name, project_gid, enabled, created_at, updated_at)
  ON public.asana_configs TO authenticated;
GRANT ALL ON public.asana_configs TO service_role;

REVOKE SELECT ON public.notion_configs FROM authenticated, anon;
GRANT SELECT (id, user_id, workspace_id, workspace_name, database_id, enabled, created_at, updated_at)
  ON public.notion_configs TO authenticated;
GRANT ALL ON public.notion_configs TO service_role;
