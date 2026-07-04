## Scope

Five workstreams. Each ships in one commit so nothing lands half-integrated.

---

### 1. Database migration — dedup + voice-note teardown + real-time indexes

- **DM dedup (merge-into-oldest):**
  - Introduce `team_conversations.type` (`'dm' | 'channel' | 'deal'`) and `dm_key TEXT` (canonical `least(uid_a,uid_b)||':'||greatest(...)`); backfill from `conversation_participants` for 2-person threads.
  - For each `dm_key` with >1 conversation: pick the oldest as canonical, `UPDATE team_messages/message_reactions/message_read_receipts/pinned_messages/dcm_typing SET conversation_id = canonical`, then delete the duplicate `team_conversations` rows (participants cascade).
  - Add `UNIQUE(dm_key) WHERE type='dm'` so no future duplicates.
- **New columns on `team_conversations`:** `pinned_at TIMESTAMPTZ`, `last_message_at`, `last_message_preview TEXT`, `title`, `avatar_url`. Trigger on `team_messages` insert updates the last-message fields (drives sidebar sort + preview without a join).
- **Per-user unread counts:** `conversation_participants.last_read_at`; RPC `get_unread_count(conversation_id, user_id)`.
- **Voice-note teardown (hard):** `DROP TABLE voice_notes, voice_note_plays, dcm_reactions` (voice-only), `dcm_notification_prefs`; delete every object in the `voice-notes` bucket, then delete the bucket. Remove `voice_note_url` columns from `team_messages` if present.
- **Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE team_messages, message_reactions, message_read_receipts, dcm_typing, conversation_participants, team_conversations;`

### 2. Frontend voice-note removal

Delete `src/components/messages/VoiceRecorder.tsx`, `src/hooks/useVoiceNotes.ts`, voice-note branches in `AttachmentRender.tsx`, `useTeamMessaging.ts`, `MessagesPage.tsx`, `ThreadPanel.tsx`, and any admin/coaching references. Purge imports so the build stays green.

### 3. Messages page rebuild (`src/pages/MessagesPage.tsx` + `src/components/messages/*`)

Two-pane layout, collapses to single pane under `md`. Uses existing tables (team_conversations, team_messages, message_reactions, message_read_receipts, dcm_typing, pinned_messages, user_statuses, profiles).

```text
┌─────────────────────────┬────────────────────────────────────────┐
│ Search  [+ New]         │  Avatar  Name  •online   Call  Info    │
│ ─ Pinned ───────────    │ ────────────────────────────────────── │
│ ● Ada     14:02  (3)    │  [meeting recap card]                  │
│   "Recap of demo…"      │  Reply thread ▸                        │
│ ─ Direct ───────────    │  You: file.pdf ✓✓                      │
│ ○ Ben     Tue    ·      │  Ada is typing…                        │
│ ─ Channels ────────     │                                        │
│ # deal-acme  ·          │  [ Composer  📎 😊  ⏎ Send ]           │
└─────────────────────────┴────────────────────────────────────────┘
```

**Sidebar:** debounced search over name/last-preview/channel title; sections Pinned → Direct → Channels → #activity; per-row avatar with presence dot (from `user_statuses`), unread badge, relative timestamp, muted styling for read rows.

**Thread pane:** virtualized message list, day dividers, grouped consecutive messages by same sender; per-message hover actions (react, reply, pin, copy link, delete-own). Reactions bar aggregates by emoji with own-reaction highlight. Replies open a right-side `ThreadPanel` (already exists — refit to new schema). Read receipts render as ✓ (sent) / ✓✓ (read by all other participants), computed from `message_read_receipts`. Typing indicator subscribes to `dcm_typing`. Meeting-recap and deal-update messages render as structured cards with call/deal/transcript links (metadata column already on `team_messages`).

**Composer:** textarea with @mention autocomplete (existing `MentionTextarea`), file attach via `team-attachments` bucket (already wired), emoji picker, Enter-to-send / Shift+Enter newline. **No mic button.** Typing writes upsert into `dcm_typing` throttled to 3 s.

**Realtime:** one `supabase.channel('conv:'+id)` per open thread, one global `channel('conv-list:'+userId)` for sidebar bumps. All subs live in `useEffect` with `removeChannel` cleanup.

**Responsive:** below `md` the sidebar becomes a full-screen list; picking a thread pushes a route `/messages/:conversationId` and shows a back button in the header.

### 4. Meeting → conversation routing (edge functions)

Extend `generate-call-summary/index.ts` (post-summary flow already exists):

```text
if deal_id and deal has deal_channel  → post recap into deal channel
else if exactly one other participant with a matching profile
       → find/create DM (dm_key) with that user, post recap
else   → post into #activity (existing fallback)
```

Recap payload uses `team_messages.metadata` = `{ kind: 'meeting_recap', call_id, recording_url, transcript_url, summary, action_items }` so the client can render the card. Same helper is reused by `analyze-deal-changes` for deal updates.

### 5. Live Meeting + Guest Join device controls

`src/hooks/useDailyCall.ts` already exposes camera/mic toggles internally. Add:

```ts
toggleCamera(): Promise<void>          // setLocalVideo(!localVideo)
toggleMic(): Promise<void>             // setLocalAudio(!localAudio)
switchCamera(): Promise<void>          // enumerateDevices → find next videoinput → setInputDevicesAsync
availableCameras: MediaDeviceInfo[]    // memoized
```

Wire into `LiveMeeting.tsx`, `LiveMeetingWithBot.tsx`, `GuestLobby.tsx`, `MeetingJoin.tsx`, `PreJoinAudioCheck.tsx` control bars:

- Mic/camera buttons visible any time (in-call, not just pre-join); disabled state shows red slash icon.
- Camera-switch button appears only when `availableCameras.length > 1` and the UA looks mobile; icon is `SwitchCamera` from lucide.
- All controls work identically on the guest-join surface (guests get the same three buttons plus leave).

---

## Files touched

**Migrations:** 1 new (~250 lines) — dedup + drops + realtime + last-message trigger.

**Edge functions:** `generate-call-summary` (routing), `analyze-deal-changes` (share the routing helper). New `_shared/route-recap.ts`.

**Deleted:** `src/components/messages/VoiceRecorder.tsx`, `src/hooks/useVoiceNotes.ts`, `supabase/functions/*` voice references (none currently).

**Rewritten:** `src/pages/MessagesPage.tsx`, `src/components/messages/AttachmentRender.tsx`, `src/components/messages/ThreadPanel.tsx`, `src/hooks/useTeamMessaging.ts`, `src/hooks/useTypingIndicator.ts`, `src/hooks/useUserStatus.ts`.

**New components:** `src/components/messages/ConversationList.tsx`, `MessageBubble.tsx`, `MeetingRecapCard.tsx`, `DealUpdateCard.tsx`, `ReactionBar.tsx`, `Composer.tsx`, `ReceiptTicks.tsx`.

**Modified for device controls:** `src/hooks/useDailyCall.ts`, `src/pages/LiveMeeting.tsx`, `src/pages/LiveMeetingWithBot.tsx`, `src/pages/MeetingJoin.tsx`, `src/components/GuestLobby.tsx`, `src/components/PreJoinAudioCheck.tsx`.

## Risks

- Merging duplicate DMs is destructive to `team_conversations` PK values referenced from client caches; sending a broadcast realtime event on the canonical row after the migration invalidates stale IDs.
- Dropping voice-note tables + bucket is irreversible per your instruction — confirmed.
- Adding a unique index requires that dedup runs first in the same transaction; migration is written as a single `BEGIN…COMMIT`.

Ready to build all five in order on approval.