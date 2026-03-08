-- Fix participant INSERT RLS so new conversations can add members before SELECT visibility exists
CREATE OR REPLACE FUNCTION public.can_add_conversation_participant(_conversation_id uuid, _participant_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_conversations tc
      JOIN public.team_members tm_actor
        ON tm_actor.team_id = tc.team_id
       AND tm_actor.user_id = auth.uid()
       AND tm_actor.status = 'active'
      JOIN public.team_members tm_target
        ON tm_target.team_id = tc.team_id
       AND tm_target.user_id = _participant_user_id
       AND tm_target.status = 'active'
      WHERE tc.id = _conversation_id
    )
$$;

DROP POLICY IF EXISTS "Team members can add participants" ON public.conversation_participants;

CREATE POLICY "Team members can add participants"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (public.can_add_conversation_participant(conversation_id, user_id));