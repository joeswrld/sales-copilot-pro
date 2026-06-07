
-- Add sender_avatar_url to get_team_messages_with_senders
DROP FUNCTION IF EXISTS public.get_team_messages_with_senders(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_team_messages_with_senders(p_conversation_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, message_text text, created_at timestamp with time zone, file_url text, file_name text, file_type text, parent_id uuid, edited_at timestamp with time zone, is_deleted boolean, sender_full_name text, sender_email text, sender_avatar_url text, reactions jsonb, reply_to_text text, reply_to_sender_name text, read_by uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conv_id uuid := p_conversation_id;
BEGIN
  INSERT INTO message_read_receipts (message_id, user_id, read_at)
  SELECT tm.id, auth.uid(), now()
  FROM team_messages tm
  WHERE tm.conversation_id = v_conv_id
    AND tm.sender_id != auth.uid()
    AND (tm.is_deleted IS NULL OR tm.is_deleted = false)
  ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = now();

  UPDATE conversation_participants cp
  SET last_read_at = now()
  WHERE cp.conversation_id = v_conv_id
    AND cp.user_id = auth.uid();

  RETURN QUERY
  SELECT
    tm.id, tm.conversation_id, tm.sender_id, tm.message_text, tm.created_at,
    tm.file_url, tm.file_name, tm.file_type, tm.parent_id, tm.edited_at,
    COALESCE(tm.is_deleted, false) AS is_deleted,
    p.full_name AS sender_full_name,
    p.email AS sender_email,
    p.avatar_url AS sender_avatar_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'by_me', r.by_me))
      FROM (
        SELECT tmr.emoji, COUNT(*) AS cnt, bool_or(tmr.user_id = auth.uid()) AS by_me
        FROM team_message_reactions tmr
        WHERE tmr.message_id = tm.id
        GROUP BY tmr.emoji
      ) r
    ), '[]'::jsonb) AS reactions,
    parent_msg.message_text AS reply_to_text,
    parent_p.full_name AS reply_to_sender_name,
    COALESCE((
      SELECT array_agg(mrr.user_id)
      FROM message_read_receipts mrr
      WHERE mrr.message_id = tm.id AND mrr.user_id != tm.sender_id
    ), '{}'::uuid[]) AS read_by
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

-- Add sender_avatar_url to get_channel_messages_v2
DROP FUNCTION IF EXISTS public.get_channel_messages_v2(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_channel_messages_v2(p_channel_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, channel_id uuid, user_id uuid, parent_id uuid, content text, type text, metadata jsonb, is_pinned boolean, created_at timestamp with time zone, edited_at timestamp with time zone, is_deleted boolean, sender_full_name text, sender_email text, sender_avatar_url text, reactions jsonb, reply_to_text text, reply_to_sender_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    dcm.id, dcm.channel_id, dcm.user_id, dcm.parent_id, dcm.content, dcm.type,
    COALESCE(dcm.metadata, '{}'::jsonb) AS metadata,
    COALESCE(dcm.is_pinned, false) AS is_pinned,
    dcm.created_at, dcm.edited_at,
    COALESCE(dcm.is_deleted, false) AS is_deleted,
    p.full_name AS sender_full_name,
    p.email AS sender_email,
    p.avatar_url AS sender_avatar_url,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'by_me', r.by_me))
      FROM (
        SELECT mr.emoji, COUNT(*) AS cnt, bool_or(mr.user_id = auth.uid()) AS by_me
        FROM message_reactions mr
        WHERE mr.message_id = dcm.id
        GROUP BY mr.emoji
      ) r
    ), '[]'::jsonb) AS reactions,
    parent_dcm.content AS reply_to_text,
    parent_p.full_name AS reply_to_sender_name
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
