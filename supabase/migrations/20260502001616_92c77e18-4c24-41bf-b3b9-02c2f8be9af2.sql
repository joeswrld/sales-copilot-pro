
-- Update existing cron job to use the new meeting-reminders function
SELECT cron.unschedule('send-meeting-reminders');

SELECT cron.schedule(
  'meeting-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dkvtufanmaiclmsnpyae.supabase.co/functions/v1/meeting-reminders',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdnR1ZmFubWFpY2xtc25weWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMjAxMzAsImV4cCI6MjA4Nzg5NjEzMH0.YF-IQCoUFicNTIi1IBHb99sN08U3WJAkIVs9vDDHumQ"}'::jsonb,
    body    := concat('{"time": "', now(), '"}')::jsonb
  );
  $$
);
