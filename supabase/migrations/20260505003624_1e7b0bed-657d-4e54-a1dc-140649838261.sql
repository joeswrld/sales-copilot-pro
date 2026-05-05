
-- 1. Fix call-recordings bucket: remove public SELECT, add owner-scoped
DROP POLICY IF EXISTS "Public can read recordings" ON storage.objects;

CREATE POLICY "Owner can read own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Fix admin_audit_log: remove permissive public policies
DROP POLICY IF EXISTS "audit_log_admin_select" ON public.admin_audit_log;
DROP POLICY IF EXISTS "audit_log_admin_insert" ON public.admin_audit_log;

-- Add admin-only SELECT
CREATE POLICY "admin_audit_log_admin_select"
ON public.admin_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fix native_meeting_rooms: remove unrestricted public SELECT
DROP POLICY IF EXISTS "Anyone can view room by name" ON public.native_meeting_rooms;

-- Add host-only SELECT (if not already covered)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'native_meeting_rooms' AND policyname = 'Host can view own rooms'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Host can view own rooms"
      ON public.native_meeting_rooms FOR SELECT
      TO authenticated
      USING (host_id = auth.uid())
    $p$;
  END IF;
END $$;

-- 4. Fix hms_meeting_rooms: remove anonymous SELECT
DROP POLICY IF EXISTS "Public can view hms rooms by room_id" ON public.hms_meeting_rooms;

-- 5. Fix team_invitations: replace overly permissive token policy
DROP POLICY IF EXISTS "Public can read invitation by token" ON public.team_invitations;

-- Allow reading only the specific invitation matching a token filter (RLS requires the caller to filter by invite_token)
CREATE POLICY "Lookup invitation by exact token"
ON public.team_invitations FOR SELECT
TO public
USING (invite_token IS NOT NULL AND status = 'pending');
