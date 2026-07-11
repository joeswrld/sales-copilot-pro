/**
 * useGuestTranscripts.ts — v1
 *
 * Fixes the root cause of "audio recording starts but transcripts are never
 * displayed" on the Guest Join page: guests are unauthenticated (no Supabase
 * session), and the `transcripts` table's RLS policy only allows
 * `auth.uid() = user_id` — and every row's user_id is the call HOST's id by
 * design (see upsert_partial_transcript), never the guest's. That means:
 *
 *   - A guest could never SELECT any rows directly (RLS blocks it outright).
 *   - A guest's postgres_changes Realtime subscription would ALSO receive
 *     nothing, because Realtime enforces the same RLS as a table SELECT.
 *
 * So there was no working read path for guests at all — inserts succeeded
 * (service role / SECURITY DEFINER bypass RLS) but nothing ever reached
 * their screen. This hook fixes that with two guest-safe channels:
 *
 *   1. Initial history + periodic reconciliation via the
 *      `get_guest_call_transcripts` RPC (SECURITY DEFINER, validates the
 *      guest's admitted session token server-side, scoped to that call only).
 *   2. Live updates via Supabase Realtime BROADCAST on
 *      `call-transcripts-{callId}` — broadcast is NOT RLS-gated, and is what
 *      transcribe-live / transcribe-stream / transcribe-guest-stream push to
 *      after every successful save.
 *
 * Only stops listening when explicitly stopped (meeting end / guest leaves,
 * driven by the caller) — never on its own.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GuestTranscriptLine {
  id: string;
  call_id: string;
  speaker: string;
  speaker_name: string;
  speaker_role: 'host' | 'guest' | string;
  text: string;
  is_partial: boolean;
  is_guest: boolean;
  timestamp: string;
  client_chunk_id?: string | null;
}

interface Options {
  callId: string | null;
  guestToken: string | null;
  enabled: boolean;
}

export function useGuestTranscripts({ callId, guestToken, enabled }: Options) {
  const [lines, setLines] = useState<Map<string, GuestTranscriptLine>>(new Map());
  const lastTimestampRef = useRef<string | null>(null);

  const upsertLine = useCallback((row: GuestTranscriptLine) => {
    if (!row?.id) return;
    setLines((prev) => {
      const next = new Map(prev);
      next.set(row.id, row);
      return next;
    });
    if (!lastTimestampRef.current || row.timestamp > lastTimestampRef.current) {
      lastTimestampRef.current = row.timestamp;
    }
  }, []);

  // ── Initial history + reconciliation poll ──────────────────────────────────
  // Covers the gap between "guest joins mid-meeting" (needs prior lines) and
  // any dropped broadcast message (network hiccup) — RPC is source of truth,
  // broadcast is just the low-latency push on top of it.
  const fetchHistory = useCallback(async () => {
    if (!guestToken) return;
    const { data, error } = await supabase.rpc('get_guest_call_transcripts', {
      p_token: guestToken,
      p_after: lastTimestampRef.current,
    });
    if (error) {
      console.error('[useGuestTranscripts][history] fetch failed:', error);
      return;
    }
    console.log(`[useGuestTranscripts][history] fetched ${data?.length ?? 0} rows since ${lastTimestampRef.current ?? 'start'}`);
    (data ?? []).forEach((row: any) => upsertLine(row as GuestTranscriptLine));
  }, [guestToken, upsertLine]);

  useEffect(() => {
    if (!enabled || !callId || !guestToken) return;

    fetchHistory();
    const pollTimer = setInterval(fetchHistory, 8000); // safety-net reconciliation

    const channel = supabase
      .channel(`call-transcripts-${callId}`)
      .on('broadcast', { event: 'transcript' }, (msg) => {
        const row = msg.payload as GuestTranscriptLine;
        console.log(`[useGuestTranscripts][broadcast] received chunk=${row.client_chunk_id ?? row.id} speaker=${row.speaker_name}`);
        upsertLine(row);
      })
      .subscribe((status) => {
        console.log(`[useGuestTranscripts][subscribe] channel status=${status} call=${callId}`);
      });

    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled, callId, guestToken, fetchHistory, upsertLine]);

  const sorted = Array.from(lines.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { transcripts: sorted };
}