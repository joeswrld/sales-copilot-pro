
CREATE OR REPLACE FUNCTION public.find_deal_by_participants(p_call_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_team uuid;
  v_participants text[];
  v_emails text[];
  v_deal uuid;
BEGIN
  SELECT c.user_id, c.participants INTO v_owner, v_participants
  FROM public.calls c WHERE c.id = p_call_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;

  -- extract email-shaped strings
  SELECT COALESCE(array_agg(lower(p)) FILTER (WHERE p ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'), '{}')
    INTO v_emails
  FROM unnest(COALESCE(v_participants, '{}'::text[])) p;

  IF array_length(v_emails, 1) IS NULL THEN RETURN NULL; END IF;

  SELECT team_id INTO v_team FROM public.team_members
    WHERE user_id = v_owner AND status = 'active' LIMIT 1;

  -- 1) match by deals.contact_email in same team (or owned by user)
  SELECT d.id INTO v_deal
  FROM public.deals d
  WHERE lower(d.contact_email) = ANY(v_emails)
    AND (d.owner_id = v_owner OR (v_team IS NOT NULL AND d.team_id = v_team))
  ORDER BY d.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_deal IS NOT NULL THEN RETURN v_deal; END IF;

  -- 2) match via crm_contacts.email → its most recent deal
  SELECT d.id INTO v_deal
  FROM public.crm_contacts cc
  JOIN public.deals d
    ON lower(d.contact_email) = lower(cc.email)
   AND (d.owner_id = v_owner OR (v_team IS NOT NULL AND d.team_id = v_team))
  WHERE lower(cc.email) = ANY(v_emails)
  ORDER BY d.updated_at DESC NULLS LAST
  LIMIT 1;

  RETURN v_deal;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_deal_by_participants(uuid) TO authenticated, service_role;
