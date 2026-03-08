
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paystack_customer_code text,
  paystack_subscription_code text,
  paystack_email_token text,
  plan_name text NOT NULL DEFAULT 'Fixsense Monthly',
  amount_kobo integer NOT NULL DEFAULT 1900,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'inactive',
  next_payment_date timestamp with time zone,
  card_last4 text,
  card_brand text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role bypass for webhook updates (edge functions use service role)
CREATE POLICY "Service role full access"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
