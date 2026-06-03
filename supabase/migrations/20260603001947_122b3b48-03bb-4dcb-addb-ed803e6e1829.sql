
CREATE OR REPLACE FUNCTION public.notify_on_team_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  preview text;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Someone') INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  preview := COALESCE(NEW.message_text, '');
  IF NEW.file_url IS NOT NULL AND length(preview) = 0 THEN
    preview := '📎 ' || COALESCE(NEW.file_name, 'Attachment');
  END IF;
  IF length(preview) > 140 THEN
    preview := substr(preview, 1, 140) || '…';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link, reference_id, idempotency_key)
  SELECT
    cp.user_id,
    'message',
    'New message from ' || COALESCE(sender_name, 'Someone'),
    preview,
    '/messages?c=' || NEW.conversation_id::text,
    NEW.id::text,
    'msg:' || NEW.id::text || ':' || cp.user_id::text
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_team_message ON public.team_messages;
CREATE TRIGGER trg_notify_on_team_message
AFTER INSERT ON public.team_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_team_message();
