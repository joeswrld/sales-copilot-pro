-- Ensure team creator is always set from authenticated user
CREATE OR REPLACE FUNCTION public.set_team_creator_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create team';
  END IF;

  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_team_creator_before_insert ON public.teams;
CREATE TRIGGER set_team_creator_before_insert
BEFORE INSERT ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.set_team_creator_from_auth();

-- Recreate team create policy so it does not depend on client-supplied created_by
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
CREATE POLICY "Authenticated users can create teams"
ON public.teams
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Atomic team creation RPC (avoids client-side multi-step insert race/policy issues)
CREATE OR REPLACE FUNCTION public.create_team_with_owner(team_name text DEFAULT 'My Team')
RETURNS public.teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create team';
  END IF;

  INSERT INTO public.teams (name, created_by)
  VALUES (COALESCE(NULLIF(BTRIM(team_name), ''), 'My Team'), v_uid)
  RETURNING * INTO v_team;

  INSERT INTO public.team_members (team_id, user_id, role, status)
  VALUES (v_team.id, v_uid, 'admin', 'active');

  RETURN v_team;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_with_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team_with_owner(text) TO authenticated;