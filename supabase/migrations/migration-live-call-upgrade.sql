-- ============================================================
-- MIGRATION: Live Call System Upgrade
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ── 1. calls table additions ──────────────────────────────────────────────

-- meeting_url: the actual joinable URL (Google Meet link or manually pasted)
alter table public.calls
  add column if not exists meeting_url        text,
  add column if not exists calendar_event_id  text;

-- Index for quick lookup by meeting URL (used for cross-device resume)
create index if not exists idx_calls_meeting_url
  on public.calls(meeting_url)
  where meeting_url is not null;

-- Index to find a user's active live call fast
create index if not exists idx_calls_live_status
  on public.calls(user_id, status)
  where status = 'live';

comment on column public.calls.meeting_url       is 'Joinable Google Meet or Zoom URL';
comment on column public.calls.calendar_event_id is 'Google Calendar event ID, for updates/cancellation';


-- ── 2. Backfill meeting_url from meeting_id where meeting_id looks like a URL
-- (safe no-op if no existing rows match)
update public.calls
set meeting_url = meeting_id
where meeting_url is null
  and meeting_id like 'http%';


-- ── 3. Helper view: active live calls with full context ───────────────────
create or replace view public.active_live_calls as
  select
    c.id,
    c.user_id,
    c.name,
    c.meeting_url,
    c.calendar_event_id,
    c.platform,
    c.start_time,
    c.participants,
    c.meeting_type,
    c.sentiment_score,
    p.full_name  as user_name,
    p.email      as user_email
  from public.calls c
  join public.profiles p on p.id = c.user_id
  where c.status = 'live';

-- Done ✅
