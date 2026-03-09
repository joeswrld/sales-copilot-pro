
-- Add meeting_type to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS meeting_type text DEFAULT NULL;

-- Add enriched analytics columns to call_summaries
ALTER TABLE public.call_summaries ADD COLUMN IF NOT EXISTS meeting_score numeric DEFAULT NULL;
ALTER TABLE public.call_summaries ADD COLUMN IF NOT EXISTS talk_ratio jsonb DEFAULT NULL;
ALTER TABLE public.call_summaries ADD COLUMN IF NOT EXISTS buying_signals text[] DEFAULT '{}'::text[];
ALTER TABLE public.call_summaries ADD COLUMN IF NOT EXISTS action_items text[] DEFAULT '{}'::text[];
