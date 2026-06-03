# Admin Dashboard Upgrade Plan

A two-part build: (1) revamp the Admin Dashboard with rich analytics, (2) ship a new User Activity Center with a dedicated audit log pipeline.

## 1. Database (migration)

New table `public.audit_logs`:
- `id uuid pk`, `user_id uuid`, `actor_email text`, `team_id uuid`
- `action text` (e.g. `auth.login`, `auth.login_failed`, `billing.upgrade`, `meeting.start`, `ai.used`, `message.sent`, `team.invite`, `deal.update`, `file.upload`, `profile.update`, `security.event`)
- `category text`, `severity text` (`info|warn|error|critical`)
- `target_type text`, `target_id text`
- `ip_address text`, `user_agent text`, `device text`, `browser text`, `country text`, `city text`
- `risk_score int default 0`
- `details jsonb default '{}'`
- `created_at timestamptz default now()`

Indexes: `(created_at desc)`, `(user_id, created_at desc)`, `(action)`, `(severity)`, `(team_id)`.

GRANTs + RLS:
- `GRANT SELECT, INSERT ON public.audit_logs TO authenticated; GRANT ALL TO service_role;`
- RLS enabled. Policies:
  - Admin can SELECT all (via `public.is_admin()`).
  - Authenticated user can INSERT rows where `user_id = auth.uid()` (client-side hook for app events).
  - Service role bypasses (used by triggers/edge functions).

Realtime: `alter publication supabase_realtime add table public.audit_logs`.

Triggers (auto-logging) on existing tables:
- `auth_audit` trigger via `on_auth_user_created` already exists; add a SECURITY DEFINER function `log_audit(...)` reused by triggers on:
  - `subscriptions` (insert/update → `billing.plan_change`)
  - `payments` / paystack ledger (insert → `billing.payment`)
  - `extra_minutes_purchases` (insert → `billing.extra_minutes`)
  - `calls` (insert/update of `status` → `meeting.start|end`)
  - `team_messages` (insert → `message.sent`)
  - `team_invitations` (insert → `team.invite`)
  - `team_members` (insert/delete → `team.member_added|removed`)
  - `deals` (insert/update → `deal.created|updated`)
  - `profiles` (update → `profile.updated`)
  - `security_events` (insert → mirror to `audit_logs` as `security.event`)

Helper RPC `get_user_activity(_user_id uuid, _limit int)` and `compute_risk_score(_user_id)` (counts of failed logins + suspicious events in last 24h).

## 2. Edge function

`log-activity` (verify_jwt=false, validates JWT internally):
- Accepts `{ action, category, severity, target_type, target_id, details }`.
- Extracts IP from `x-forwarded-for`, parses UA → device/browser.
- Optional geo via Cloudflare headers (`cf-ipcountry`, `cf-ipcity`) when present.
- Computes `risk_score`, inserts into `audit_logs`.

Frontend hook `useActivityLogger()` wraps it; called from: login (success/failure), AI feature entry, file upload, deal/profile mutations, etc. (Server-side triggers cover the rest.)

## 3. Frontend — Admin Dashboard redesign

File: `src/pages/AdminPanel.tsx` restructured into tabs:

### Tab A: Analytics
Recharts-based (already in stack):
- Revenue: `AreaChart` MRR/ARR + monthly bars
- User growth: `LineChart` (D/W/M/Y selector)
- Subscription breakdown: `PieChart` by plan
- Extra minutes purchases: `BarChart`
- Profit vs Cost: stacked `BarChart`
- Active users: `LineChart`
- Churn rate: `LineChart` w/ % axis
- ARPU: `LineChart`
- Meeting minutes consumed: `AreaChart`

Top filter bar: date range presets (7d/30d/90d/1y/custom via shadcn DateRangePicker), team filter, export buttons (CSV + PDF via jsPDF + autoTable, already permitted).

Data sources: existing tables (`subscriptions`, `payments`, `extra_minutes_purchases`, `calls`, `profiles`). New SQL views/RPCs:
- `admin_revenue_series(_from, _to, _bucket)`
- `admin_user_growth(_from, _to, _bucket)`
- `admin_plan_breakdown()`
- `admin_active_users(_from, _to, _bucket)`
- `admin_churn_rate(_from, _to)`
- `admin_arpu(_from, _to)`
- `admin_minutes_consumed(_from, _to, _bucket)`

All `SECURITY DEFINER` + `is_admin()` guard.

### Tab B: User Activity Center
- Real-time feed (Supabase Realtime subscription on `audit_logs`)
- Toolbar: search (name/email/team/id), action-type multi-select, severity, date range
- Virtualized table (`@tanstack/react-virtual`) with columns: time, user, action, target, severity, IP, device, browser, location, risk
- Row click → side sheet with user profile timeline (RPC `get_user_activity`)
- Pagination (cursor on `created_at`)
- Risk score badge with color tiers
- Admin-only (wrapped by existing `AdminRoute`)

### Tab C: Existing admin sections preserved.

Responsive: mobile uses stacked cards + collapsible filters; desktop uses 2-col grid for charts.

## 4. Exports
- `src/lib/adminExport.ts` — `exportCsv(rows, filename)` and `exportPdf(title, rows, charts?)` using `jspdf` + `jspdf-autotable` (add deps).

## 5. Files

New:
- `supabase/migrations/<ts>_audit_logs_and_admin_rpcs.sql`
- `supabase/functions/log-activity/index.ts`
- `src/hooks/useActivityLogger.ts`
- `src/hooks/useAuditLogs.ts`
- `src/hooks/useAdminAnalytics.ts`
- `src/components/admin/AnalyticsTab.tsx`
- `src/components/admin/UserActivityTab.tsx`
- `src/components/admin/charts/*` (Revenue, Users, Plans, Minutes, Churn, ARPU, ActiveUsers, ProfitCost)
- `src/components/admin/DateRangeFilter.tsx`
- `src/components/admin/ActivityRow.tsx`
- `src/lib/adminExport.ts`

Edited:
- `src/pages/AdminPanel.tsx` (tabbed redesign, keeps current tools)
- `supabase/config.toml` (register `log-activity`)
- `package.json` (add `jspdf`, `jspdf-autotable`, `@tanstack/react-virtual`, `ua-parser-js`)

## Scope confirmation
This is a sizeable build (~15 new files, 1 large migration with ~10 triggers + 7 RPCs, 1 edge function). I'll ship it in one pass. **Confirm** before I proceed, or tell me to trim (e.g. skip exports, skip triggers, or stub some charts with mock data initially).
