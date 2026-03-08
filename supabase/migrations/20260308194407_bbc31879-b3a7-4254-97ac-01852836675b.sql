
-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Team',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members table (roles stored here per security guidelines)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'manager', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited')),
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Conversations table
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- Messages table
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is in the same team
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND status = 'active'
  )
$$;

-- Helper function: check team role
CREATE OR REPLACE FUNCTION public.get_team_role(_user_id uuid, _team_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.team_members
  WHERE user_id = _user_id AND team_id = _team_id AND status = 'active'
  LIMIT 1
$$;

-- RLS: teams - members can view their teams
CREATE POLICY "Team members can view their team"
ON public.teams FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create teams"
ON public.teams FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team admins can update team"
ON public.teams FOR UPDATE TO authenticated
USING (public.get_team_role(auth.uid(), id) = 'admin');

-- RLS: team_members
CREATE POLICY "Team members can view team members"
ON public.team_members FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admins can insert members"
ON public.team_members FOR INSERT TO authenticated
WITH CHECK (
  public.get_team_role(auth.uid(), team_id) IN ('admin')
  OR (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_members.team_id))
);

CREATE POLICY "Team admins can update members"
ON public.team_members FOR UPDATE TO authenticated
USING (public.get_team_role(auth.uid(), team_id) = 'admin');

CREATE POLICY "Team admins can delete members"
ON public.team_members FOR DELETE TO authenticated
USING (public.get_team_role(auth.uid(), team_id) = 'admin');

-- RLS: team_conversations
CREATE POLICY "Participants can view conversations"
ON public.team_conversations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = id AND user_id = auth.uid()
  )
);

CREATE POLICY "Team members can create conversations"
ON public.team_conversations FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), team_id));

-- RLS: conversation_participants
CREATE POLICY "Participants can view participants"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Team members can add participants"
ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_conversations tc
    WHERE tc.id = conversation_id AND public.is_team_member(auth.uid(), tc.team_id)
  )
);

CREATE POLICY "Users can update own participant record"
ON public.conversation_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- RLS: team_messages
CREATE POLICY "Participants can view messages"
ON public.team_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = team_messages.conversation_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Participants can send messages"
ON public.team_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = team_messages.conversation_id AND user_id = auth.uid()
  )
);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
