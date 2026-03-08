
-- Trigger: notify meeting owner when someone comments on their meeting
CREATE OR REPLACE FUNCTION public.notify_on_meeting_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_meeting_owner uuid;
  v_commenter_name text;
  v_meeting_name text;
BEGIN
  -- Get the meeting owner
  SELECT user_id, name INTO v_meeting_owner, v_meeting_name
  FROM public.calls WHERE id = NEW.meeting_id;

  -- Don't notify yourself
  IF v_meeting_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get commenter name
  SELECT COALESCE(full_name, email, 'Someone') INTO v_commenter_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, message, reference_id)
  VALUES (
    v_meeting_owner,
    'comment',
    v_commenter_name || ' commented on your meeting "' || COALESCE(v_meeting_name, 'Untitled') || '"',
    NEW.meeting_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_meeting_comment ON public.meeting_comments;
CREATE TRIGGER trg_notify_meeting_comment
  AFTER INSERT ON public.meeting_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_meeting_comment();

-- Trigger: notify other conversation participants when a message is sent
CREATE OR REPLACE FUNCTION public.notify_on_team_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_name text;
  v_participant record;
BEGIN
  SELECT COALESCE(full_name, email, 'Someone') INTO v_sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  FOR v_participant IN
    SELECT user_id FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, type, message, reference_id)
    VALUES (
      v_participant.user_id,
      'mention',
      v_sender_name || ' sent a message: "' || LEFT(NEW.message_text, 80) || CASE WHEN LENGTH(NEW.message_text) > 80 THEN '...' ELSE '' END || '"',
      NEW.conversation_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_team_message ON public.team_messages;
CREATE TRIGGER trg_notify_team_message
  AFTER INSERT ON public.team_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_team_message();

-- Trigger: notify team admins when a new member joins (invitation accepted)
CREATE OR REPLACE FUNCTION public.notify_on_team_member_joined()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_member_name text;
  v_team_name text;
  v_admin record;
BEGIN
  -- Only for active members being added
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'A new member') INTO v_new_member_name
  FROM public.profiles WHERE id = NEW.user_id;

  SELECT name INTO v_team_name
  FROM public.teams WHERE id = NEW.team_id;

  -- Notify all existing team admins (except the new member themselves)
  FOR v_admin IN
    SELECT user_id FROM public.team_members
    WHERE team_id = NEW.team_id AND role = 'admin' AND status = 'active' AND user_id != NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, message, reference_id)
    VALUES (
      v_admin.user_id,
      'system',
      v_new_member_name || ' joined ' || COALESCE(v_team_name, 'the team'),
      NEW.team_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_team_member_joined ON public.team_members;
CREATE TRIGGER trg_notify_team_member_joined
  AFTER INSERT ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_team_member_joined();
