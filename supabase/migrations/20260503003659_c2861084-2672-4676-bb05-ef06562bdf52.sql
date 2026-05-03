
-- Add extra minutes columns to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS extra_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_minutes_expires_at timestamptz;

-- Function to reset extra minutes on billing cycle renewal
CREATE OR REPLACE FUNCTION public.reset_extra_minutes_on_renewal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When next_payment_date changes (renewal), reset extras
  IF OLD.next_payment_date IS DISTINCT FROM NEW.next_payment_date
     AND NEW.next_payment_date > OLD.next_payment_date THEN
    NEW.extra_minutes := 0;
    NEW.extra_minutes_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for auto-reset on renewal
DROP TRIGGER IF EXISTS trg_reset_extra_minutes ON public.subscriptions;
CREATE TRIGGER trg_reset_extra_minutes
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_extra_minutes_on_renewal();
