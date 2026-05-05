
-- Fix dcm_reactions: drop both old and new, recreate
DROP POLICY IF EXISTS "dcm_reactions_all" ON public.dcm_reactions;
DROP POLICY IF EXISTS "Team members can manage reactions" ON public.dcm_reactions;

CREATE POLICY "Team members can manage reactions"
ON public.dcm_reactions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deal_channel_messages dcm
    JOIN public.deal_channels dc ON dc.id = dcm.channel_id
    JOIN public.team_members tm ON tm.team_id = dc.team_id
    WHERE dcm.id = message_id AND tm.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.deal_channel_messages dcm
    JOIN public.deal_channels dc ON dc.id = dcm.channel_id
    JOIN public.team_members tm ON tm.team_id = dc.team_id
    WHERE dcm.id = message_id AND tm.user_id = auth.uid()
  )
);

-- Fix deal_channels_insert: require team_id
DROP POLICY IF EXISTS "deal_channels_insert" ON public.deal_channels;
DROP POLICY IF EXISTS "Team members can create deal channels" ON public.deal_channels;

CREATE POLICY "Team members can create deal channels"
ON public.deal_channels FOR INSERT
TO authenticated
WITH CHECK (
  team_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = deal_channels.team_id AND tm.user_id = auth.uid()
  )
);
