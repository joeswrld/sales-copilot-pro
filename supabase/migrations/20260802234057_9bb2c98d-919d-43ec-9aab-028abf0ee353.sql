ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;