ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.scheduled_meetings ADD COLUMN IF NOT EXISTS scheduled_timezone text;