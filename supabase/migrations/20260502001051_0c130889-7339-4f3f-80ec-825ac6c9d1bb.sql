
-- 1. Add title, link, idempotency_key to notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
  ON public.notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL DEFAULT '',
  auth text NOT NULL DEFAULT '',
  browser_name text DEFAULT 'Unknown',
  user_agent text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Create #activity channel per team (function to be called)
CREATE OR REPLACE FUNCTION public.ensure_activity_channel(p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  -- Check if activity channel already exists
  SELECT id INTO v_conv_id
  FROM team_conversations
  WHERE team_id = p_team_id AND name = '#activity' AND type = 'team'
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO team_conversations (id, team_id, name, type, created_by)
    VALUES (gen_random_uuid(), p_team_id, '#activity', 'team', (SELECT owner_id FROM teams WHERE id = p_team_id))
    RETURNING id INTO v_conv_id;

    -- Add all team members as participants
    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT v_conv_id, tm.user_id
    FROM team_members tm
    WHERE tm.team_id = p_team_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- 4. Trigger: auto-post notifications to #activity channel
CREATE OR REPLACE FUNCTION public.post_notification_to_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_conv_id uuid;
  v_msg_text text;
BEGIN
  -- Find user's team
  SELECT tm.team_id INTO v_team_id
  FROM team_members tm
  WHERE tm.user_id = NEW.user_id
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure activity channel exists
  v_conv_id := ensure_activity_channel(v_team_id);

  -- Build message
  v_msg_text := COALESCE(NEW.title, '') || ': ' || NEW.message;

  -- Insert system message
  INSERT INTO team_messages (conversation_id, sender_id, message_text)
  VALUES (v_conv_id, NEW.user_id, v_msg_text);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_to_activity
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.post_notification_to_activity();

-- 5. Function to send notification with deduplication
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Dedup check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM notifications WHERE idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, link, reference_id, idempotency_key)
  VALUES (p_user_id, p_type, p_title, p_message, p_link, p_reference_id, p_idempotency_key)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
