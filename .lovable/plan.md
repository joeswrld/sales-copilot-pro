
## 1. Post-call save → Call Details

`useLiveCall.endCall` already: marks call `completed`, calls `update-usage`, `generate-call-summary`, Slack notify, and creates a deal-room system message. `generate-call-summary` already inserts into `call_summaries` (summary, key_decisions, next_steps, topics, objections, transcript, action_items, meeting_score, talk_ratio, buying_signals).

Gaps to fix:
- Recording URL (from Daily) isn't consistently attached to `calls.recording_url` at call end — depends on `daily-recording-webhook` firing later. Add a client-side fallback: on `endCall`, if `daily.recordingId` exists, poll `daily_webhook_events` / `daily_rooms.recording_url` for a few seconds and copy to `calls.recording_url` when available.
- Ensure `calls.duration_minutes` and `objections_count` are set (already handled in summary function).
- Invalidate `["call", callId]` + `["call-summary", callId]` after `endCall` so Call Details page reflects immediately.
- Add missing invalidations in `endCall.onSuccess`.

## 2. Billing: Paystack becomes source of truth

Root cause of stale "June 10" date: `paystack-sync-subscription` only updates the subscription row when `status !== "active"` AND filters `.eq("status","pending")`. Active subscriptions with an outdated `next_payment_date` are never refreshed.

Changes:
- **Edge function `paystack-sync-subscription`**: when a `verifiedTransaction` is found (or the latest successful tx in list), ALWAYS update `next_payment_date`, `card_last4`, `card_brand`, `paystack_customer_code` — remove the `status="pending"` filter. Only guard the `status` field itself against downgrade (don't flip active→pending). Compute `next_payment_date` as `paid_at + 1 month` for the latest successful transaction.
- **Also** query Paystack `GET /subscription?customer=<code>` and use its `next_payment_date` when present (authoritative for auto-renewals).
- **BillingPage**: on mount, if the user has an active subscription, call `verifyPayment({ includeTransactions: true })` once so dates auto-refresh on page load. Add a manual "Sync with Paystack" button next to the next-billing-date row.
- Display: if `next_payment_date` is in the past, show a "Refreshing…" state and trigger sync instead of the stale date.

## 3. Deal auto-update from meetings

Extend `endCall`:
- Determine `deal_id`:
  1. `calls.deal_id` if set.
  2. Otherwise call a new RPC `find_deal_by_participants(p_call_id)` that matches `calls.participants` emails against `deals.contact_email` / `crm_contacts.email` within the user's team; returns the best match (most recent).
  3. If a match found, `UPDATE calls SET deal_id = ...`.
- If a `deal_id` is resolved, insert a `deal_timeline_events` row (`event_type='meeting_completed'`) with the summary/score/next step, and update `deals.last_activity_at`, `deals.next_step` (only if empty), and append action items to `deal_message_tasks` linked to the deal.
- Call `analyze-deal-changes` edge function (already exists) with the deal id after summary is saved so AI insights refresh.

## 4. Meeting → Messages auto-recap

Today `endCall` posts a system message only to the auto-created deal-room conversation. Replace with:
- If `deal_id` resolved AND a `deal_channels` row exists for that deal → post recap into `deal_channel_messages` with type=`system` and metadata `{ call_id, deal_id, transcript_url }`.
- Else if the user's team has a channel named `#activity` (or first team channel) → post there.
- Recap body: title + summary + score + next step + three links: `/dashboard/calls/:id` (Call Details), `/dashboard/calls/:id#transcript`, `/dashboard/deals/:deal_id` (only when deal linked).
- Add real-time hook: `MessagesPage` already subscribes to `deal_channel_messages` / `team_messages` inserts, so the recap appears live.

## 5. Files to change

- `supabase/functions/paystack-sync-subscription/index.ts` — always refresh dates for active subs; pull subscription endpoint from Paystack.
- `supabase/functions/generate-call-summary/index.ts` — after saving summary, resolve `deal_id` (participant fallback via new RPC), write timeline event, update deal, invoke `analyze-deal-changes`, and post recap message to the right channel.
- `src/hooks/useLiveCall.ts` — invalidate `call` + `call-summary` queries; short recording-URL poll fallback; drop duplicated deal-room posting (moved server-side).
- `src/pages/BillingPage.tsx` — mount-time sync call; "Sync with Paystack" button; stale-date guard.
- New migration:
  - `find_deal_by_participants(p_call_id uuid)` SQL function (SECURITY DEFINER, scoped to caller's team).
  - Ensure `deal_channels` lookup and `#activity` fallback query permissions.

## 6. Out of scope

- No UI redesign of Call Details, Deals, or Messages.
- No changes to Paystack plan-change / upgrade flow (only sync + date refresh).
- Mobile-only `useMobileCalls.ts` not touched.

## 7. Verification

- End a live meeting → within ~10s Call Details shows summary, action items, transcript; deal timeline gets `meeting_completed`; a system message appears in the deal channel or #activity.
- Load Billing page with an active sub → `next_payment_date` refreshes from Paystack, stale June date gone.
- Manual "Sync with Paystack" button triggers same refresh and shows toast on success.
