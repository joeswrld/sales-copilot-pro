-- Make team conversation creation check explicit and reliable for active team members
CREATE OR REPLACE FUNCTION public.can_create_team_conversation(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = _team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'active'
    )
$$;

DROP POLICY IF EXISTS "Team members can create conversations" ON public.team_conversations;

CREATE POLICY "Team members can create conversations"
ON public.team_conversations
FOR INSERT
TO authenticated
WITH CHECK (public.can_create_team_conversation(team_id));