-- Ensure teams.created_by is always the authenticated user
CREATE OR REPLACE FUNCTION public.set_team_creator_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create team';
  END IF;

  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_team_creator_before_insert ON public.teams;
CREATE TRIGGER set_team_creator_before_insert
BEFORE INSERT ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.set_team_creator_from_auth();

-- Rebuild teams policies explicitly as PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can view their team" ON public.teams;
DROP POLICY IF EXISTS "Team admins can update team" ON public.teams;

CREATE POLICY "Authenticated users can create teams"
ON public.teams AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team members can view their team"
ON public.teams AS PERMISSIVE
FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), id));

CREATE POLICY "Team admins can update team"
ON public.teams AS PERMISSIVE
FOR UPDATE TO authenticated
USING (get_team_role(auth.uid(), id) = 'admin');

-- Rebuild team_members policies
DROP POLICY IF EXISTS "Team members can view team members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can insert members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can delete members" ON public.team_members;

CREATE POLICY "Team members can view team members"
ON public.team_members AS PERMISSIVE
FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can insert members"
ON public.team_members AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  get_team_role(auth.uid(), team_id) = 'admin'
  OR (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
    )
  )
);

CREATE POLICY "Team admins can update members"
ON public.team_members AS PERMISSIVE
FOR UPDATE TO authenticated
USING (get_team_role(auth.uid(), team_id) = 'admin');

CREATE POLICY "Team admins can delete members"
ON public.team_members AS PERMISSIVE
FOR DELETE TO authenticated
USING (get_team_role(auth.uid(), team_id) = 'admin');

-- Rebuild meeting_comments policies
DROP POLICY IF EXISTS "Team members can view meeting comments" ON public.meeting_comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.meeting_comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.meeting_comments;

CREATE POLICY "Team members can view meeting comments"
ON public.meeting_comments AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.calls c
    JOIN public.team_members tm1 ON tm1.user_id = auth.uid() AND tm1.status = 'active'
    JOIN public.team_members tm2 ON tm2.user_id = c.user_id AND tm2.status = 'active' AND tm2.team_id = tm1.team_id
    WHERE c.id = meeting_comments.meeting_id
  )
);

CREATE POLICY "Authenticated users can insert comments"
ON public.meeting_comments AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.calls c
    JOIN public.team_members tm1 ON tm1.user_id = auth.uid() AND tm1.status = 'active'
    JOIN public.team_members tm2 ON tm2.user_id = c.user_id AND tm2.status = 'active' AND tm2.team_id = tm1.team_id
    WHERE c.id = meeting_comments.meeting_id
  )
);

CREATE POLICY "Users can delete own comments"
ON public.meeting_comments AS PERMISSIVE
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Rebuild notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Team members can insert notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
ON public.notifications AS PERMISSIVE
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.notifications AS PERMISSIVE
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Team members can insert notifications"
ON public.notifications AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
      AND tm2.user_id = notifications.user_id AND tm2.status = 'active'
  )
);

-- Rebuild team_conversations policies (fix malformed SELECT condition)
DROP POLICY IF EXISTS "Participants can view conversations" ON public.team_conversations;
DROP POLICY IF EXISTS "Team members can create conversations" ON public.team_conversations;

CREATE POLICY "Participants can view conversations"
ON public.team_conversations AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = team_conversations.id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create conversations"
ON public.team_conversations AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (is_team_member(auth.uid(), team_id));

-- Rebuild conversation_participants policies
DROP POLICY IF EXISTS "Participants can view participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Team members can add participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participant record" ON public.conversation_participants;

CREATE POLICY "Participants can view participants"
ON public.conversation_participants AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can add participants"
ON public.conversation_participants AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.team_conversations tc
    WHERE tc.id = conversation_participants.conversation_id
      AND is_team_member(auth.uid(), tc.team_id)
  )
);

CREATE POLICY "Users can update own participant record"
ON public.conversation_participants AS PERMISSIVE
FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Rebuild team_messages policies
DROP POLICY IF EXISTS "Participants can view messages" ON public.team_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.team_messages;

CREATE POLICY "Participants can view messages"
ON public.team_messages AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = team_messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Participants can send messages"
ON public.team_messages AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = team_messages.conversation_id
      AND cp.user_id = auth.uid()
  )
);