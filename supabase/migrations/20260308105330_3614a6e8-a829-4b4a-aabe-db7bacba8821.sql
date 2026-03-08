-- Add plan_price_usd column to track USD display price
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_price_usd numeric DEFAULT 0;