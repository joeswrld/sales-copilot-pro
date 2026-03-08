
-- 1. Create team_invitations table for pending invites
CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(team_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations for their team
CREATE POLICY "Team admins can view invitations"
  ON public.team_invitations FOR SELECT
  USING (get_team_role(auth.uid(), team_id) = 'admin');

CREATE POLICY "Team admins can insert invitations"
  ON public.team_invitations FOR INSERT
  WITH CHECK (get_team_role(auth.uid(), team_id) = 'admin');

CREATE POLICY "Team admins can delete invitations"
  ON public.team_invitations FOR DELETE
  USING (get_team_role(auth.uid(), team_id) = 'admin');

CREATE POLICY "Team admins can update invitations"
  ON public.team_invitations FOR UPDATE
  USING (get_team_role(auth.uid(), team_id) = 'admin');

-- 2. Create function to auto-accept pending invitations when a user signs up
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For each pending invitation matching this user's email, create a team member
  INSERT INTO public.team_members (team_id, user_id, role, status, invited_email)
  SELECT ti.team_id, NEW.id, ti.role, 'active', NEW.email
  FROM public.team_invitations ti
  WHERE LOWER(ti.email) = LOWER(NEW.email)
    AND ti.status = 'pending'
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Mark those invitations as accepted
  UPDATE public.team_invitations
  SET status = 'accepted'
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending';

  RETURN NEW;
END;
$$;

-- 3. Attach trigger to profiles table (fires when new user profile is created)
CREATE TRIGGER on_profile_created_accept_invitations
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.accept_pending_invitations();

-- 4. Create typing_indicators table for presence (used via Realtime Broadcast, but we'll use a lightweight approach)
-- Actually we'll use Supabase Realtime Broadcast which is ephemeral - no table needed.
