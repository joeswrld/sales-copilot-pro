CREATE OR REPLACE FUNCTION public.security_scan_probe()
RETURNS TABLE (
  finding_key text,
  title text,
  severity text,
  category text,
  detail text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- 1. Tables without RLS
  RETURN QUERY
  SELECT 'rls_disabled:' || c.relname,
         'Table in public schema without RLS enabled',
         'critical', 'rls',
         'public.' || c.relname || ' has row level security disabled',
         jsonb_build_object('table', c.relname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

  -- 2. RLS enabled but no policies
  RETURN QUERY
  SELECT 'rls_no_policy:' || c.relname,
         'RLS enabled but no policies defined',
         'high', 'rls',
         'public.' || c.relname || ' has RLS on but zero policies',
         jsonb_build_object('table', c.relname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

  -- 3. Unrestricted anonymous write policies
  RETURN QUERY
  SELECT 'anon_write_policy:' || c.relname || ':' || p.polname,
         'Anonymous role can write via an unrestricted policy',
         'high', 'rls',
         'policy "' || p.polname || '" on public.' || c.relname || ' lets anon modify rows with no restriction',
         jsonb_build_object('table', c.relname, 'policy', p.polname, 'cmd', p.polcmd)
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND p.polcmd IN ('w', 'd', '*')
    AND EXISTS (
      SELECT 1 FROM pg_roles r WHERE r.oid = ANY (p.polroles) AND r.rolname = 'anon'
    )
    AND COALESCE(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true';

  -- 4. SECURITY DEFINER functions without a fixed search_path
  RETURN QUERY
  SELECT 'secdef_search_path:' || p.proname,
         'SECURITY DEFINER function without a fixed search_path',
         'medium', 'functions',
         'public.' || p.proname || '() is SECURITY DEFINER without SET search_path',
         jsonb_build_object('function', p.proname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
    );

  -- 5. Public storage buckets
  RETURN QUERY
  SELECT 'public_bucket:' || b.id,
         'Storage bucket is publicly readable',
         'high', 'storage',
         'storage bucket "' || b.id || '" is public — objects readable without a signed URL',
         jsonb_build_object('bucket', b.id)
  FROM storage.buckets b
  WHERE b.public = true;

  -- 6. Token/secret columns readable by client roles
  RETURN QUERY
  SELECT 'exposed_secret_column:' || cp.table_name || '.' || cp.column_name || ':' || cp.grantee,
         'Token/secret column readable by client roles',
         'critical', 'secrets',
         cp.grantee || ' can select public.' || cp.table_name || '.' || cp.column_name,
         jsonb_build_object('table', cp.table_name, 'column', cp.column_name, 'grantee', cp.grantee)
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public'
    AND cp.privilege_type = 'SELECT'
    AND cp.grantee IN ('anon', 'authenticated')
    AND (cp.column_name ILIKE '%access_token%'
      OR cp.column_name ILIKE '%refresh_token%'
      OR cp.column_name ILIKE '%secret%'
      OR cp.column_name = 'key_hash');

  -- 7. Privilege columns stored outside user_roles
  RETURN QUERY
  SELECT 'role_column_outside_user_roles:' || col.table_name || '.' || col.column_name,
         'Privilege column stored outside user_roles',
         'high', 'authorization',
         'public.' || col.table_name || '.' || col.column_name || ' allows privilege escalation — roles belong in public.user_roles',
         jsonb_build_object('table', col.table_name, 'column', col.column_name)
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND col.table_name IN ('profiles', 'users', 'user_preferences')
    AND col.column_name IN ('role', 'is_admin', 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.security_scan_probe() FROM anon;
GRANT EXECUTE ON FUNCTION public.security_scan_probe() TO authenticated, service_role;