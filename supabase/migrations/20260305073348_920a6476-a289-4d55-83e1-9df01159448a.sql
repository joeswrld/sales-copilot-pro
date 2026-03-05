
-- Add encrypted token columns to integrations table
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
ADD COLUMN IF NOT EXISTS instance_url text,
ADD COLUMN IF NOT EXISTS channel_id text;
