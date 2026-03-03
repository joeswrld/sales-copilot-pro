
-- Add new columns to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS platform text,
ADD COLUMN IF NOT EXISTS meeting_id text,
ADD COLUMN IF NOT EXISTS start_time timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS end_time timestamp with time zone;

-- Create transcripts table
CREATE TABLE public.transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  speaker text NOT NULL,
  text text NOT NULL,
  timestamp timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transcripts" ON public.transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transcripts" ON public.transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own transcripts" ON public.transcripts FOR DELETE USING (auth.uid() = user_id);

-- Create objections table
CREATE TABLE public.objections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  objection_type text NOT NULL,
  suggestion text,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  confidence_score numeric DEFAULT 0
);

ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own objections" ON public.objections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own objections" ON public.objections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own objections" ON public.objections FOR DELETE USING (auth.uid() = user_id);

-- Create key_topics table
CREATE TABLE public.key_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  topic text NOT NULL,
  detected_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.key_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own key_topics" ON public.key_topics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own key_topics" ON public.key_topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own key_topics" ON public.key_topics FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcripts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.key_topics;
