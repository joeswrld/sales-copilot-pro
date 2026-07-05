
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS trial_blocked_reason text;

CREATE OR REPLACE FUNCTION public.normalize_email(_email text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  e text := lower(coalesce(trim(_email), ''));
  local_part text; domain text; at_pos int;
BEGIN
  IF e = '' THEN RETURN ''; END IF;
  at_pos := position('@' in e);
  IF at_pos = 0 THEN RETURN e; END IF;
  local_part := split_part(e, '@', 1);
  domain     := split_part(e, '@', 2);
  local_part := split_part(local_part, '+', 1);
  IF domain IN ('gmail.com','googlemail.com') THEN
    local_part := replace(local_part, '.', '');
    domain := 'gmail.com';
  END IF;
  RETURN local_part || '@' || domain;
END $$;

CREATE OR REPLACE FUNCTION public.hash_identifier(_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN _value IS NULL OR _value = '' THEN NULL
    ELSE encode(extensions.digest(_value::bytea, 'sha256'), 'hex')
  END
$$;

CREATE TABLE IF NOT EXISTS public.trial_history (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email_hash    text,
  google_sub_hash          text,
  ip_hash                  text,
  fingerprint_hash         text,
  original_user_id         uuid,
  first_trial_started_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  ever_paid                boolean NOT NULL DEFAULT false,
  account_deleted_at       timestamptz,
  reason                   text,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_history_email_idx       ON public.trial_history(normalized_email_hash);
CREATE INDEX IF NOT EXISTS trial_history_google_sub_idx  ON public.trial_history(google_sub_hash);
CREATE INDEX IF NOT EXISTS trial_history_fingerprint_idx ON public.trial_history(fingerprint_hash);
CREATE INDEX IF NOT EXISTS trial_history_ip_idx          ON public.trial_history(ip_hash);

GRANT ALL ON public.trial_history TO service_role;

ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial_history_service_only_select" ON public.trial_history;
DROP POLICY IF EXISTS "trial_history_service_only_write"  ON public.trial_history;
CREATE POLICY "trial_history_service_only_select"
  ON public.trial_history FOR SELECT TO service_role USING (true);
CREATE POLICY "trial_history_service_only_write"
  ON public.trial_history FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.signup_ip_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash    text NOT NULL,
  user_id    uuid,
  event      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_ip_log_ip_idx    ON public.signup_ip_log(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS signup_ip_log_event_idx ON public.signup_ip_log(event, created_at DESC);
GRANT ALL ON public.signup_ip_log TO service_role;
ALTER TABLE public.signup_ip_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signup_ip_log_service_only" ON public.signup_ip_log;
CREATE POLICY "signup_ip_log_service_only"
  ON public.signup_ip_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_trial_eligibility(
  _user_id uuid, _email text, _google_sub text, _ip text, _fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email_hash text := public.hash_identifier(public.normalize_email(_email));
  v_sub_hash   text := public.hash_identifier(_google_sub);
  v_ip_hash    text := public.hash_identifier(_ip);
  v_fp_hash    text := public.hash_identifier(_fingerprint);
  v_prior      public.trial_history;
  v_recent_ip  int;
BEGIN
  SELECT * INTO v_prior FROM public.trial_history
   WHERE (v_email_hash IS NOT NULL AND normalized_email_hash = v_email_hash)
      OR (v_sub_hash   IS NOT NULL AND google_sub_hash       = v_sub_hash)
   ORDER BY first_trial_started_at ASC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false, 'reason', 'prior_trial_exists',
      'ever_paid', v_prior.ever_paid,
      'restore_user_id', v_prior.original_user_id
    );
  END IF;

  IF v_fp_hash IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.trial_history WHERE fingerprint_hash = v_fp_hash
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'device_fingerprint_reuse');
  END IF;

  IF v_ip_hash IS NOT NULL THEN
    SELECT count(*) INTO v_recent_ip FROM public.signup_ip_log
     WHERE ip_hash = v_ip_hash AND event = 'trial_start'
       AND created_at > now() - interval '24 hours';
    IF v_recent_ip >= 3 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'ip_rate_limit');
    END IF;
  END IF;

  RETURN jsonb_build_object('eligible', true);
END $$;
REVOKE ALL ON FUNCTION public.check_trial_eligibility(uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_trial_eligibility(uuid,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.start_trial(
  _user_id uuid, _email text, _google_sub text, _ip text, _fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_eligibility jsonb;
  v_profile     public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_missing');
  END IF;
  IF v_profile.email_verified_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_not_verified');
  END IF;
  IF v_profile.trial_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_started', true);
  END IF;

  v_eligibility := public.check_trial_eligibility(_user_id, _email, _google_sub, _ip, _fingerprint);
  IF (v_eligibility->>'eligible')::boolean IS DISTINCT FROM true THEN
    UPDATE public.profiles SET trial_blocked_reason = v_eligibility->>'reason' WHERE id = _user_id;
    INSERT INTO public.signup_ip_log(ip_hash, user_id, event)
    VALUES (public.hash_identifier(_ip), _user_id, 'trial_blocked');
    RETURN jsonb_build_object('ok', false, 'reason', v_eligibility->>'reason',
                              'restore_user_id', v_eligibility->'restore_user_id',
                              'ever_paid', v_eligibility->'ever_paid');
  END IF;

  UPDATE public.profiles
     SET trial_started_at = now(),
         plan_type        = COALESCE(plan_type, 'free'),
         calls_limit      = GREATEST(COALESCE(calls_limit, 0), 5),
         trial_blocked_reason = NULL
   WHERE id = _user_id;

  INSERT INTO public.trial_history (
    normalized_email_hash, google_sub_hash, ip_hash, fingerprint_hash,
    original_user_id, reason
  ) VALUES (
    public.hash_identifier(public.normalize_email(_email)),
    public.hash_identifier(_google_sub),
    public.hash_identifier(_ip),
    public.hash_identifier(_fingerprint),
    _user_id, 'initial_trial'
  );

  INSERT INTO public.signup_ip_log(ip_hash, user_id, event)
  VALUES (public.hash_identifier(_ip), _user_id, 'trial_start');

  RETURN jsonb_build_object('ok', true, 'trial_started_at', now());
END $$;
REVOKE ALL ON FUNCTION public.start_trial(uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.start_trial(uuid,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_deleted_trial(
  _user_id uuid, _email text, _google_sub text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email_hash text := public.hash_identifier(public.normalize_email(_email));
  v_sub_hash   text := public.hash_identifier(_google_sub);
  v_ever_paid  boolean := false;
BEGIN
  SELECT true INTO v_ever_paid FROM public.subscriptions
   WHERE user_id = _user_id AND status IN ('active','paid','trialing') LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.trial_history
              WHERE (v_email_hash IS NOT NULL AND normalized_email_hash = v_email_hash)
                 OR (v_sub_hash   IS NOT NULL AND google_sub_hash       = v_sub_hash)) THEN
    UPDATE public.trial_history
       SET account_deleted_at = now(),
           ever_paid = COALESCE(ever_paid, false) OR COALESCE(v_ever_paid, false),
           last_seen_at = now()
     WHERE (v_email_hash IS NOT NULL AND normalized_email_hash = v_email_hash)
        OR (v_sub_hash   IS NOT NULL AND google_sub_hash       = v_sub_hash);
  ELSE
    INSERT INTO public.trial_history (
      normalized_email_hash, google_sub_hash, original_user_id,
      account_deleted_at, ever_paid, reason
    ) VALUES (
      v_email_hash, v_sub_hash, _user_id, now(),
      COALESCE(v_ever_paid, false), 'account_deleted'
    );
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_deleted_trial(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_deleted_trial(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at)
  THEN
    UPDATE public.profiles
       SET email_verified_at = NEW.email_confirmed_at
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified();

UPDATE public.profiles p
   SET email_verified_at = u.email_confirmed_at
  FROM auth.users u
 WHERE p.id = u.id
   AND p.email_verified_at IS NULL
   AND u.email_confirmed_at IS NOT NULL;
