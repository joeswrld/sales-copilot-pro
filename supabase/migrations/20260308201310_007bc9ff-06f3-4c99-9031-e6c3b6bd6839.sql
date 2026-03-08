
-- Allow team members to view calls of other team members (managers/admins need this for coaching)
CREATE POLICY "Team members can view team calls"
ON public.calls FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
      AND tm2.user_id = calls.user_id AND tm2.status = 'active'
  )
);

-- Allow team members to view profiles of other team members
CREATE POLICY "Team members can view team profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
      AND tm2.user_id = profiles.id AND tm2.status = 'active'
  )
);

-- Allow team members to view call summaries of team members
CREATE POLICY "Team members can view team call summaries"
ON public.call_summaries FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
      AND tm2.user_id = call_summaries.user_id AND tm2.status = 'active'
  )
);
