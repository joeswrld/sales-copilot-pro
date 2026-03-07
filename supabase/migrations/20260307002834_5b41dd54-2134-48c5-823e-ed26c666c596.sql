
-- Add meeting_url and meeting_provider to calls table
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS meeting_url text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS meeting_provider text;

-- Create scheduled_calls table
CREATE TABLE IF NOT EXISTS public.scheduled_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meeting_provider text NOT NULL,
  meeting_url text,
  title text NOT NULL DEFAULT 'Scheduled Meeting',
  scheduled_time timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_calls ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own scheduled calls" ON public.scheduled_calls FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scheduled calls" ON public.scheduled_calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled calls" ON public.scheduled_calls FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled calls" ON public.scheduled_calls FOR DELETE TO authenticated USING (auth.uid() = user_id);
