
CREATE OR REPLACE FUNCTION public.get_team_minute_pool(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_team_id uuid;
  v_sub record;
  v_base_minutes int;
  v_total_minutes int;
  v_remaining int;
  v_pct numeric;
  v_is_unlimited boolean;
  v_is_admin boolean;
  v_minutes_used int;
  v_cycle_start timestamptz;
  v_member_breakdown jsonb;
BEGIN
  v_cycle_start := date_trunc('month', now());

  SELECT team_id INTO v_team_id
  FROM team_members
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  -- ─── Solo user ────────────────────────────────────────────────────────
  IF v_team_id IS NULL THEN
    SELECT s.*, p.minute_quota, p.name as plan_display_name
    INTO v_sub
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id AND s.status = 'active'
    LIMIT 1;

    IF v_sub IS NULL THEN
      -- Free plan fallback: tally minutes from this month's calls
      SELECT COALESCE(SUM(GREATEST(1, CEIL(EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0)::int)), 0)
      INTO v_minutes_used
      FROM calls
      WHERE user_id = p_user_id
        AND status IN ('completed','ended')
        AND end_time IS NOT NULL
        AND start_time IS NOT NULL
        AND created_at >= v_cycle_start;

      v_base_minutes := 30;
      v_total_minutes := 30;
      v_remaining := GREATEST(0, v_total_minutes - v_minutes_used);
      v_pct := LEAST(100, (v_minutes_used::numeric / v_total_minutes) * 100);

      RETURN jsonb_build_object(
        'team_id', null,
        'plan_name', 'Free',
        'base_minutes', v_base_minutes,
        'extra_minutes', 0,
        'total_minutes', v_total_minutes,
        'minutes_used', v_minutes_used,
        'remaining', v_remaining,
        'is_unlimited', false,
        'is_at_limit', v_minutes_used >= v_total_minutes,
        'is_near_limit', v_pct >= 80 AND v_minutes_used < v_total_minutes,
        'pct', v_pct,
        'is_team_plan', false,
        'is_admin', true,
        'member_breakdown', '[]'::jsonb,
        'extra_minutes_expires_at', null
      );
    END IF;

    v_base_minutes := COALESCE(v_sub.minutes_limit, 30);
    v_is_unlimited := v_base_minutes <= 0;
    v_minutes_used := COALESCE(v_sub.minutes_used, 0);
    v_total_minutes := CASE WHEN v_is_unlimited THEN -1
                            ELSE v_base_minutes + COALESCE(v_sub.extra_minutes, 0) END;
    v_remaining := CASE WHEN v_is_unlimited THEN -1
                        ELSE GREATEST(0, v_total_minutes - v_minutes_used) END;
    v_pct := CASE WHEN v_is_unlimited OR v_total_minutes = 0 THEN 0
                  ELSE LEAST(100, (v_minutes_used::numeric / v_total_minutes) * 100) END;

    RETURN jsonb_build_object(
      'team_id', null,
      'plan_name', COALESCE(v_sub.plan_name, 'Free'),
      'base_minutes', v_base_minutes,
      'extra_minutes', COALESCE(v_sub.extra_minutes, 0),
      'total_minutes', v_total_minutes,
      'minutes_used', v_minutes_used,
      'remaining', v_remaining,
      'is_unlimited', v_is_unlimited,
      'is_at_limit', NOT v_is_unlimited AND v_minutes_used >= v_total_minutes,
      'is_near_limit', NOT v_is_unlimited AND v_pct >= 80 AND v_minutes_used < v_total_minutes,
      'pct', v_pct,
      'is_team_plan', false,
      'is_admin', true,
      'member_breakdown', '[]'::jsonb,
      'extra_minutes_expires_at', v_sub.extra_minutes_expires_at
    );
  END IF;

  -- ─── Team user ────────────────────────────────────────────────────────
  SELECT s.*, p.minute_quota, p.name as plan_display_name
  INTO v_sub
  FROM subscriptions s
  LEFT JOIN plans p ON p.id = s.plan_id
  JOIN team_members tm ON tm.user_id = s.user_id
    AND tm.team_id = v_team_id AND tm.role = 'admin' AND tm.status = 'active'
  WHERE s.status = 'active'
  LIMIT 1;

  IF v_sub IS NULL THEN
    SELECT s.*, p.minute_quota, p.name as plan_display_name
    INTO v_sub
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.team_id = v_team_id AND s.status = 'active'
    LIMIT 1;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM team_members
    WHERE team_id = v_team_id AND user_id = p_user_id
      AND role IN ('admin','manager') AND status = 'active'
  ) INTO v_is_admin;

  -- Aggregate team member breakdown from team_minute_usage this cycle
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_member_breakdown
  FROM (
    SELECT tmu.user_id,
           p.full_name,
           p.email,
           SUM(tmu.minutes_used)::int AS minutes_used
    FROM team_minute_usage tmu
    LEFT JOIN profiles p ON p.id = tmu.user_id
    WHERE tmu.team_id = v_team_id
      AND tmu.recorded_at >= v_cycle_start
    GROUP BY tmu.user_id, p.full_name, p.email
    ORDER BY 4 DESC
  ) t;

  IF v_sub IS NULL THEN
    -- Team without a paid sub: tally team calls this month
    SELECT COALESCE(SUM(minutes_used), 0)::int INTO v_minutes_used
    FROM team_minute_usage
    WHERE team_id = v_team_id AND recorded_at >= v_cycle_start;

    v_base_minutes := 30;
    v_total_minutes := 30;
    v_remaining := GREATEST(0, v_total_minutes - v_minutes_used);
    v_pct := LEAST(100, (v_minutes_used::numeric / v_total_minutes) * 100);

    RETURN jsonb_build_object(
      'team_id', v_team_id,
      'plan_name', 'Free',
      'base_minutes', v_base_minutes,
      'extra_minutes', 0,
      'total_minutes', v_total_minutes,
      'minutes_used', v_minutes_used,
      'remaining', v_remaining,
      'is_unlimited', false,
      'is_at_limit', v_minutes_used >= v_total_minutes,
      'is_near_limit', v_pct >= 80 AND v_minutes_used < v_total_minutes,
      'pct', v_pct,
      'is_team_plan', true,
      'is_admin', v_is_admin,
      'member_breakdown', v_member_breakdown,
      'extra_minutes_expires_at', null
    );
  END IF;

  v_base_minutes := COALESCE(v_sub.minutes_limit, 30);
  v_is_unlimited := v_base_minutes <= 0;
  v_minutes_used := COALESCE(v_sub.minutes_used, 0);
  v_total_minutes := CASE WHEN v_is_unlimited THEN -1
                          ELSE v_base_minutes + COALESCE(v_sub.extra_minutes, 0) END;
  v_remaining := CASE WHEN v_is_unlimited THEN -1
                      ELSE GREATEST(0, v_total_minutes - v_minutes_used) END;
  v_pct := CASE WHEN v_is_unlimited OR v_total_minutes = 0 THEN 0
                ELSE LEAST(100, (v_minutes_used::numeric / v_total_minutes) * 100) END;

  RETURN jsonb_build_object(
    'team_id', v_team_id,
    'plan_name', COALESCE(v_sub.plan_name, 'Free'),
    'base_minutes', v_base_minutes,
    'extra_minutes', COALESCE(v_sub.extra_minutes, 0),
    'total_minutes', v_total_minutes,
    'minutes_used', v_minutes_used,
    'remaining', v_remaining,
    'is_unlimited', v_is_unlimited,
    'is_at_limit', NOT v_is_unlimited AND v_minutes_used >= v_total_minutes,
    'is_near_limit', NOT v_is_unlimited AND v_pct >= 80 AND v_minutes_used < v_total_minutes,
    'pct', v_pct,
    'is_team_plan', true,
    'is_admin', v_is_admin,
    'member_breakdown', v_member_breakdown,
    'extra_minutes_expires_at', v_sub.extra_minutes_expires_at
  );
END;
$function$;
