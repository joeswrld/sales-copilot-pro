
CREATE TABLE public.call_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  priority_action text NOT NULL,
  draft_email_subject text,
  draft_email_body text,
  crm_pushed boolean NOT NULL DEFAULT false,
  crm_provider text,
  crm_task_id text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_call_actions_call_id ON public.call_actions(call_id);

ALTER TABLE public.call_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own actions"
  ON public.call_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Team members can view team actions"
  ON public.call_actions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.status = 'active'
      AND tm2.user_id = call_actions.user_id AND tm2.status = 'active'
  ));

CREATE POLICY "Users can insert own actions"
  ON public.call_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions"
  ON public.call_actions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own actions"
  ON public.call_actions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.call_actions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
