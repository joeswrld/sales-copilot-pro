
-- Fix overly permissive notifications insert policy
DROP POLICY "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Team members can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm1
      JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
      WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
        AND tm2.user_id = notifications.user_id AND tm2.status = 'active'
    )
    OR auth.uid() = user_id
  );
