
ALTER TABLE public.team_conversations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'channel',
  ADD COLUMN IF NOT EXISTS dm_key TEXT,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_message_sender UUID,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

WITH pairs AS (
  SELECT conversation_id, array_agg(user_id ORDER BY user_id) AS members, count(*) AS n
  FROM public.conversation_participants GROUP BY conversation_id
)
UPDATE public.team_conversations c
SET type='dm', dm_key = pairs.members[1]::text||':'||pairs.members[2]::text
FROM pairs
WHERE pairs.conversation_id=c.id AND pairs.n=2
  AND (c.type IS DISTINCT FROM 'dm' OR c.dm_key IS NULL);

DO $$
DECLARE r RECORD; keep_id UUID;
BEGIN
  FOR r IN
    SELECT dm_key, array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.team_conversations
    WHERE type='dm' AND dm_key IS NOT NULL
    GROUP BY dm_key HAVING count(*)>1
  LOOP
    keep_id := r.ids[1];
    UPDATE public.team_messages   SET conversation_id=keep_id WHERE conversation_id = ANY(r.ids[2:]);
    UPDATE public.pinned_messages SET conversation_id=keep_id WHERE conversation_id = ANY(r.ids[2:]);
    UPDATE public.conversation_participants SET conversation_id=keep_id
      WHERE conversation_id = ANY(r.ids[2:])
        AND NOT EXISTS (SELECT 1 FROM public.conversation_participants cp
                        WHERE cp.conversation_id=keep_id AND cp.user_id=conversation_participants.user_id);
    DELETE FROM public.conversation_participants WHERE conversation_id = ANY(r.ids[2:]);
    DELETE FROM public.team_conversations WHERE id = ANY(r.ids[2:]);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS team_conversations_dm_key_unique
  ON public.team_conversations (dm_key) WHERE type='dm' AND dm_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.team_conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(COALESCE(NULLIF(NEW.message_text,''), NEW.file_name, ''), 140),
      last_message_sender = NEW.sender_id
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_team_msg_last ON public.team_messages;
CREATE TRIGGER trg_team_msg_last AFTER INSERT ON public.team_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_update_conversation_last_message();

UPDATE public.team_conversations c
SET last_message_at=m.created_at,
    last_message_preview=LEFT(COALESCE(NULLIF(m.message_text,''), m.file_name, ''),140),
    last_message_sender=m.sender_id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, created_at, message_text, file_name, sender_id
  FROM public.team_messages ORDER BY conversation_id, created_at DESC
) m
WHERE m.conversation_id=c.id;

CREATE TABLE IF NOT EXISTS public.typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.typing_indicators TO authenticated;
GRANT ALL ON public.typing_indicators TO service_role;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS typing_participant_all ON public.typing_indicators;
CREATE POLICY typing_participant_all ON public.typing_indicators
  FOR ALL TO authenticated
  USING (user_id=auth.uid() OR EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id=typing_indicators.conversation_id AND cp.user_id=auth.uid()
  ))
  WITH CHECK (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.find_or_create_dm(_other_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me UUID:=auth.uid(); a UUID; b UUID; key TEXT; existing UUID; new_id UUID;
BEGIN
  IF me IS NULL OR _other_user IS NULL OR me=_other_user THEN RAISE EXCEPTION 'invalid dm participants'; END IF;
  IF me < _other_user THEN a:=me; b:=_other_user; ELSE a:=_other_user; b:=me; END IF;
  key := a::text||':'||b::text;
  SELECT id INTO existing FROM public.team_conversations WHERE dm_key=key AND type='dm' LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  INSERT INTO public.team_conversations (type, dm_key) VALUES ('dm', key) RETURNING id INTO new_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (new_id, a), (new_id, b);
  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION public.find_or_create_dm(UUID) TO authenticated;

DROP TABLE IF EXISTS public.voice_note_plays CASCADE;
DROP TABLE IF EXISTS public.voice_notes CASCADE;
DROP TABLE IF EXISTS public.dcm_reactions CASCADE;
DROP TABLE IF EXISTS public.dcm_notification_prefs CASCADE;

ALTER TABLE public.team_messages
  DROP COLUMN IF EXISTS voice_duration_seconds,
  DROP COLUMN IF EXISTS voice_waveform,
  DROP COLUMN IF EXISTS voice_caption,
  DROP COLUMN IF EXISTS voice_transcript,
  DROP COLUMN IF EXISTS voice_ai_summary,
  DROP COLUMN IF EXISTS voice_action_items,
  DROP COLUMN IF EXISTS voice_urgency,
  DROP COLUMN IF EXISTS voice_follow_up_suggestions,
  DROP COLUMN IF EXISTS voice_storage_path,
  DROP COLUMN IF EXISTS voice_playback_count,
  DROP COLUMN IF EXISTS voice_upload_status;

ALTER TABLE public.team_messages ADD COLUMN IF NOT EXISTS metadata JSONB;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
