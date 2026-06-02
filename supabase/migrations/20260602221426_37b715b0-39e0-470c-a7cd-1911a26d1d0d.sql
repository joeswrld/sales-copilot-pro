
-- =============================================================
-- Security hardening: tighten RLS, fix permissive policies,
-- fill storage gaps, lock down coaching clips & subscriptions
-- =============================================================

-- Helper: is the current user an active member of the channel?
CREATE OR REPLACE FUNCTION public.is_deal_channel_member(_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deal_channels dc
    JOIN public.team_members tm ON tm.team_id = dc.team_id
    WHERE dc.id = _channel_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.deal_channels dc
    WHERE dc.id = _channel_id AND dc.created_by = auth.uid()
  );
$$;

-- ---------- coaching_clips ----------
ALTER TABLE public.coaching_clips ALTER COLUMN is_public SET DEFAULT false;
UPDATE public.coaching_clips SET is_public = false WHERE is_public = true;
DROP POLICY IF EXISTS coaching_clips_public_share ON public.coaching_clips;

-- ---------- subscriptions: remove broad team-member read ----------
DROP POLICY IF EXISTS team_members_can_read_team_subscription ON public.subscriptions;

-- ---------- dcm_typing: members only, user_id must equal caller ----------
DROP POLICY IF EXISTS dcm_typing_all ON public.dcm_typing;
CREATE POLICY dcm_typing_select ON public.dcm_typing FOR SELECT
  USING (public.is_deal_channel_member(channel_id));
CREATE POLICY dcm_typing_insert ON public.dcm_typing FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_deal_channel_member(channel_id));
CREATE POLICY dcm_typing_update ON public.dcm_typing FOR UPDATE
  USING (user_id = auth.uid() AND public.is_deal_channel_member(channel_id))
  WITH CHECK (user_id = auth.uid() AND public.is_deal_channel_member(channel_id));
CREATE POLICY dcm_typing_delete ON public.dcm_typing FOR DELETE
  USING (user_id = auth.uid() AND public.is_deal_channel_member(channel_id));

-- ---------- deal_channel_members: tighten INSERT ----------
DROP POLICY IF EXISTS dcmem_insert ON public.deal_channel_members;
CREATE POLICY dcmem_insert ON public.deal_channel_members FOR INSERT
  WITH CHECK (
    public.is_deal_channel_member(channel_id)
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.deal_channels dc
        WHERE dc.id = channel_id AND dc.created_by = auth.uid()
      )
    )
  );

-- ---------- deal_message_tasks: tighten INSERT ----------
DROP POLICY IF EXISTS dmt_insert ON public.deal_message_tasks;
CREATE POLICY dmt_insert ON public.deal_message_tasks FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      team_id IS NULL
      OR team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ---------- deal_message_mentions: tighten INSERT ----------
DROP POLICY IF EXISTS dmm_insert ON public.deal_message_mentions;
CREATE POLICY dmm_insert ON public.deal_message_mentions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deal_channel_messages m
      WHERE m.id = message_id
        AND (m.user_id = auth.uid() OR public.is_deal_channel_member(m.channel_id))
    )
  );

-- ---------- deal_channel_messages: remove redundant permissive INSERT ----------
DROP POLICY IF EXISTS dcm_insert ON public.deal_channel_messages;
-- Existing "Team members can insert channel messages" policy already enforces membership.

-- ---------- storage: team-attachments UPDATE/DELETE ----------
CREATE POLICY "Conversation participants can update attachments"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
      AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
      AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Conversation participants can delete attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'team-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.user_id = auth.uid()
      AND cp.conversation_id::text = (storage.foldername(name))[1]
  )
);

-- ---------- storage: call-recordings UPDATE ----------
CREATE POLICY "Owner can update own recordings"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'call-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
