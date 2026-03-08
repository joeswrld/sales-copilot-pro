
-- Drop restrictive policies on teams and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their team" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update team" ON public.teams;

CREATE POLICY "Authenticated users can create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Team members can view their team" ON public.teams FOR SELECT TO authenticated USING (is_team_member(auth.uid(), id));
CREATE POLICY "Team admins can update team" ON public.teams FOR UPDATE TO authenticated USING (get_team_role(auth.uid(), id) = 'admin');

-- Drop restrictive policies on team_members and recreate as permissive
DROP POLICY IF EXISTS "Team admins can delete members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can insert members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view team members" ON public.team_members;

CREATE POLICY "Team members can view team members" ON public.team_members FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team admins can insert members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (
  get_team_role(auth.uid(), team_id) = 'admin' OR (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = team_members.team_id))
);
CREATE POLICY "Team admins can update members" ON public.team_members FOR UPDATE TO authenticated USING (get_team_role(auth.uid(), team_id) = 'admin');
CREATE POLICY "Team admins can delete members" ON public.team_members FOR DELETE TO authenticated USING (get_team_role(auth.uid(), team_id) = 'admin');
