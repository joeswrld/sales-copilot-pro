
DROP POLICY IF EXISTS "Service role full access daily rooms" ON public.daily_rooms;
CREATE POLICY "daily_rooms_service_role_all" ON public.daily_rooms
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "daily_rooms_owner_delete" ON public.daily_rooms
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access daily sessions" ON public.daily_participant_sessions;
DROP POLICY IF EXISTS "daily_sessions_service_all" ON public.daily_participant_sessions;

DROP POLICY IF EXISTS "Service role full access daily webhooks" ON public.daily_webhook_events;
DROP POLICY IF EXISTS "daily_webhooks_admin_all" ON public.daily_webhook_events;

DROP POLICY IF EXISTS "guests_read_own_request" ON public.call_guest_requests;

DROP POLICY IF EXISTS "public_read_daily_room_by_name" ON public.calls;

DROP POLICY IF EXISTS "voice_notes_read" ON storage.objects;

DROP POLICY IF EXISTS "voice_note_plays_all" ON public.voice_note_plays;
CREATE POLICY "voice_plays_delete_own" ON public.voice_note_plays
  FOR DELETE TO authenticated USING (played_by = auth.uid());

DROP POLICY IF EXISTS "insert_device_checks" ON public.device_check_sessions;
DROP POLICY IF EXISTS "read_device_checks" ON public.device_check_sessions;
CREATE POLICY "device_checks_owner_insert" ON public.device_check_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.calls c WHERE c.daily_room_name = device_check_sessions.room_name AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.native_meeting_rooms r WHERE r.room_name = device_check_sessions.room_name AND r.host_id = auth.uid())
  );
CREATE POLICY "device_checks_owner_select" ON public.device_check_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.calls c WHERE c.daily_room_name = device_check_sessions.room_name AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.native_meeting_rooms r WHERE r.room_name = device_check_sessions.room_name AND r.host_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_health_events" ON public.meeting_health_events;
DROP POLICY IF EXISTS "read_own_health_events" ON public.meeting_health_events;
CREATE POLICY "health_events_insert" ON public.meeting_health_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND (call_id IS NULL OR public.can_access_call(call_id::uuid))
  );
CREATE POLICY "health_events_select" ON public.meeting_health_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (call_id IS NOT NULL AND public.can_access_call(call_id::uuid))
  );
