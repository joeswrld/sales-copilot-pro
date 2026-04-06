
-- Drop old function with wrong return type
DROP FUNCTION IF EXISTS public.get_deal_with_calls(uuid);

-- Recreate as jsonb returning function
CREATE OR REPLACE FUNCTION public.get_deal_with_calls(p_deal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  deal_row jsonb;
  calls_arr jsonb;
  summary_row jsonb;
  events_arr jsonb;
BEGIN
  SELECT to_jsonb(d.*) INTO deal_row
  FROM deals d
  WHERE d.id = p_deal_id
    AND (d.owner_id = auth.uid() OR (d.team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = d.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    )));

  IF deal_row IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'date', c.date,
      'status', c.status,
      'duration_minutes', c.duration_minutes,
      'sentiment_score', c.sentiment_score,
      'objections_count', c.objections_count,
      'platform', c.platform,
      'meeting_type', c.meeting_type,
      'call_summary', cs.summary,
      'next_steps', cs.next_steps,
      'key_decisions', cs.key_decisions,
      'call_objections', cs.objections
    ) ORDER BY c.date DESC
  ), '[]'::jsonb) INTO calls_arr
  FROM calls c
  LEFT JOIN LATERAL (
    SELECT s.summary, s.next_steps, s.key_decisions, s.objections
    FROM call_summaries s
    WHERE s.call_id = c.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) cs ON true
  WHERE c.deal_id = p_deal_id;

  SELECT to_jsonb(ds.*) INTO summary_row
  FROM deal_summaries ds
  WHERE ds.deal_id = p_deal_id
  ORDER BY ds.generated_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(e.*) ORDER BY e.happened_at DESC
  ), '[]'::jsonb) INTO events_arr
  FROM deal_timeline_events e
  WHERE e.deal_id = p_deal_id;

  result := jsonb_build_object(
    'deal', deal_row,
    'calls', calls_arr,
    'summary', summary_row,
    'events', events_arr
  );

  RETURN result;
END;
$$;

-- Create coaching_playlists table
CREATE TABLE IF NOT EXISTS public.coaching_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.coaching_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playlist_select" ON public.coaching_playlists FOR SELECT
  USING (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = coaching_playlists.team_id AND tm.user_id = auth.uid() AND tm.status = 'active'
    ))
  );

CREATE POLICY "playlist_insert" ON public.coaching_playlists FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "playlist_update" ON public.coaching_playlists FOR UPDATE
  USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM team_members tm WHERE tm.team_id = coaching_playlists.team_id AND tm.user_id = auth.uid() AND tm.role IN ('admin','manager') AND tm.status = 'active'
  ));

CREATE POLICY "playlist_delete" ON public.coaching_playlists FOR DELETE
  USING (auth.uid() = created_by);

-- Add coaching columns to coaching_clips
ALTER TABLE public.coaching_clips
  ADD COLUMN IF NOT EXISTS playlist_id uuid REFERENCES public.coaching_playlists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS coaching_tag text;
