
DROP FUNCTION IF EXISTS public.get_channel_messages_v2(uuid, integer);
DROP FUNCTION IF EXISTS public.get_team_messages_with_senders(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_channel_messages_v2(p_channel_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, channel_id uuid, user_id uuid, parent_id uuid, content text, type text, metadata jsonb, is_pinned boolean, created_at timestamp with time zone, edited_at timestamp with time zone, is_deleted boolean, sender_full_name text, sender_email text, sender_avatar_url text, reactions jsonb, reply_to_text text, reply_to_sender_name text, mentions uuid[], reply_count integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    dcm.id, dcm.channel_id, dcm.user_id, dcm.parent_id, dcm.content, dcm.type,
    COALESCE(dcm.metadata, '{}'::jsonb),
    COALESCE(dcm.is_pinned, false),
    dcm.created_at, dcm.edited_at,
    COALESCE(dcm.is_deleted, false),
    p.full_name, p.email, p.avatar_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'by_me', r.by_me))
      FROM (SELECT mr.emoji, COUNT(*) AS cnt, bool_or(mr.user_id = auth.uid()) AS by_me
            FROM message_reactions mr WHERE mr.message_id = dcm.id GROUP BY mr.emoji) r
    ), '[]'::jsonb),
    parent_dcm.content,
    parent_p.full_name,
    COALESCE((SELECT array_agg(dmm.mentioned_user) FROM deal_message_mentions dmm WHERE dmm.message_id = dcm.id), '{}'::uuid[]),
    COALESCE((SELECT COUNT(*)::int FROM deal_channel_messages child
              WHERE child.parent_id = dcm.id AND (child.is_deleted IS NULL OR child.is_deleted = false)), 0)
  FROM deal_channel_messages dcm
  LEFT JOIN profiles p ON p.id = dcm.user_id
  LEFT JOIN deal_channel_messages parent_dcm ON parent_dcm.id = dcm.parent_id
  LEFT JOIN profiles parent_p ON parent_p.id = parent_dcm.user_id
  WHERE dcm.channel_id = p_channel_id
    AND (dcm.is_deleted IS NULL OR dcm.is_deleted = false)
  ORDER BY dcm.created_at ASC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_messages_with_senders(p_conversation_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, message_text text, created_at timestamp with time zone, file_url text, file_name text, file_type text, parent_id uuid, edited_at timestamp with time zone, is_deleted boolean, sender_full_name text, sender_email text, sender_avatar_url text, reactions jsonb, reply_to_text text, reply_to_sender_name text, read_by uuid[], is_pinned boolean, reply_count integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_conv_id uuid := p_conversation_id;
BEGIN
  INSERT INTO message_read_receipts (message_id, user_id, read_at)
  SELECT tm.id, auth.uid(), now()
  FROM team_messages tm
  WHERE tm.conversation_id = v_conv_id
    AND tm.sender_id != auth.uid()
    AND (tm.is_deleted IS NULL OR tm.is_deleted = false)
  ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = now();

  UPDATE conversation_participants cp SET last_read_at = now()
  WHERE cp.conversation_id = v_conv_id AND cp.user_id = auth.uid();

  RETURN QUERY
  SELECT
    tm.id, tm.conversation_id, tm.sender_id, tm.message_text, tm.created_at,
    tm.file_url, tm.file_name, tm.file_type, tm.parent_id, tm.edited_at,
    COALESCE(tm.is_deleted, false),
    p.full_name, p.email, p.avatar_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'by_me', r.by_me))
      FROM (SELECT tmr.emoji, COUNT(*) AS cnt, bool_or(tmr.user_id = auth.uid()) AS by_me
            FROM team_message_reactions tmr WHERE tmr.message_id = tm.id GROUP BY tmr.emoji) r
    ), '[]'::jsonb),
    parent_msg.message_text,
    parent_p.full_name,
    COALESCE((SELECT array_agg(mrr.user_id) FROM message_read_receipts mrr
              WHERE mrr.message_id = tm.id AND mrr.user_id != tm.sender_id), '{}'::uuid[]),
    EXISTS (SELECT 1 FROM pinned_messages pm WHERE pm.message_id = tm.id AND pm.conversation_id = v_conv_id),
    COALESCE((SELECT COUNT(*)::int FROM team_messages child
              WHERE child.parent_id = tm.id AND (child.is_deleted IS NULL OR child.is_deleted = false)), 0)
  FROM team_messages tm
  LEFT JOIN profiles p ON p.id = tm.sender_id
  LEFT JOIN team_messages parent_msg ON parent_msg.id = tm.parent_id
  LEFT JOIN profiles parent_p ON parent_p.id = parent_msg.sender_id
  WHERE tm.conversation_id = v_conv_id
    AND (tm.is_deleted IS NULL OR tm.is_deleted = false)
  ORDER BY tm.created_at ASC
  LIMIT p_limit;
END;
$function$;

-- Mention notification trigger
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_msg record; v_sender_name text;
BEGIN
  SELECT dcm.user_id, dcm.content, dcm.channel_id, dc.name AS channel_name
  INTO v_msg
  FROM deal_channel_messages dcm
  LEFT JOIN deal_channels dc ON dc.id = dcm.channel_id
  WHERE dcm.id = NEW.message_id;

  IF v_msg.user_id = NEW.mentioned_user THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email, 'Someone') INTO v_sender_name
  FROM profiles WHERE id = v_msg.user_id;

  INSERT INTO notifications (user_id, type, title, message, reference_id, link, is_read)
  VALUES (
    NEW.mentioned_user, 'mention',
    v_sender_name || ' mentioned you in #' || COALESCE(v_msg.channel_name, 'channel'),
    LEFT(COALESCE(v_msg.content, ''), 200),
    NEW.message_id, '/messages', false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_mention ON public.deal_message_mentions;
CREATE TRIGGER trg_notify_on_mention
  AFTER INSERT ON public.deal_message_mentions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_mention();

-- Storage policies on team-attachments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='team_attachments_read') THEN
    CREATE POLICY team_attachments_read ON storage.objects FOR SELECT TO authenticated, anon
      USING (bucket_id = 'team-attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='team_attachments_upload') THEN
    CREATE POLICY team_attachments_upload ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'team-attachments' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='team_attachments_delete_own') THEN
    CREATE POLICY team_attachments_delete_own ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'team-attachments' AND owner = auth.uid());
  END IF;
END $$;
