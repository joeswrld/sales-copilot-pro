
CREATE OR REPLACE FUNCTION public.trg_log_usage_on_call_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_minutes int;
  v_team_id uuid;
  v_admin_id uuid;
  v_sub_id uuid;
BEGIN
  -- Only when transitioning into a terminal state
  IF NEW.status NOT IN ('completed','ended') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Compute duration in whole minutes (min 1 for any completed call)
  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    v_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60.0)::int);
  ELSE
    v_minutes := 1;
  END IF;

  -- Find team (if any) for the call owner
  SELECT team_id INTO v_team_id
  FROM team_members
  WHERE user_id = NEW.user_id AND status='active'
  LIMIT 1;

  -- Record per-user/team usage row (idempotent per call)
  IF v_team_id IS NOT NULL THEN
    INSERT INTO team_minute_usage (team_id, user_id, call_id, minutes_used)
    VALUES (v_team_id, NEW.user_id, NEW.id, v_minutes)
    ON CONFLICT DO NOTHING;

    -- Locate admin's active subscription for the team
    SELECT s.id INTO v_sub_id
    FROM subscriptions s
    JOIN team_members tm ON tm.user_id = s.user_id
    WHERE tm.team_id = v_team_id
      AND tm.role='admin' AND tm.status='active'
      AND s.status='active'
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      SELECT id INTO v_sub_id FROM subscriptions
      WHERE team_id = v_team_id AND status='active' LIMIT 1;
    END IF;
  ELSE
    SELECT id INTO v_sub_id FROM subscriptions
    WHERE user_id = NEW.user_id AND status='active' LIMIT 1;
  END IF;

  -- Increment aggregate minutes_used on the resolved subscription
  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET minutes_used = COALESCE(minutes_used,0) + v_minutes,
        updated_at = now()
    WHERE id = v_sub_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on calls table (AFTER UPDATE)
DROP TRIGGER IF EXISTS trg_calls_log_usage ON public.calls;
CREATE TRIGGER trg_calls_log_usage
AFTER UPDATE OF status ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_usage_on_call_complete();
