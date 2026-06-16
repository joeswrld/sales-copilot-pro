/**
 * useMeetingWorkspace.ts
 *
 * Single data layer for the rebuilt LiveMeeting workspace.
 * Wraps the `get_meeting_workspace` RPC (one round trip) and keeps it in
 * sync via Supabase Realtime on every backing table:
 *   meeting_agenda_items, meeting_notes, meeting_files, meeting_signals,
 *   meeting_engagement, meeting_hand_raises, ai_coaching_suggestions.
 *
 * Backed by tables/RPCs deployed to the `dkvtufanmaiclmsnpyae` project:
 *   - get_meeting_workspace(p_call_id)
 *   - add_agenda_item / toggle_agenda_item / delete_agenda_item
 *   - add_meeting_note
 *   - add_meeting_file (storage bucket: meeting-files, private)
 *   - raise_hand / lower_hand
 *   - record_speaking_time
 *   - dismiss_coaching_suggestion
 */

import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface AgendaItem {
  id: string;
  title: string;
  is_completed: boolean;
  order_index: number;
  created_at: string;
}

export interface MeetingNote {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface MeetingFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
  user_id: string;
}

export type SignalType =
  | "competitor_mention"
  | "buying_signal"
  | "follow_up_commitment"
  | "next_step"
  | "sentiment_shift"
  | "pricing_objection";

export interface MeetingSignal {
  id: string;
  signal_type: SignalType;
  text: string;
  confidence: number;
  metadata: Record<string, any>;
  detected_at: string;
}

export interface EngagementRow {
  session_id: string;
  user_name: string | null;
  is_local: boolean;
  speaking_seconds: number;
  engagement_score: number;
  last_active_at: string;
}

export interface HandRaise {
  id: string;
  session_id: string;
  user_name: string | null;
  raised_at: string;
}

export interface CoachingSuggestion {
  id: string;
  suggestion_text: string;
  category: string;
  priority: string;
  created_at: string;
}

export interface LinkedDeal {
  id: string;
  deal_name: string;
  company: string | null;
  stage: string;
  sentiment_score: number | null;
  last_call_score: number | null;
  next_step: string | null;
  conversation_id: string | null;
}

export interface MeetingWorkspace {
  agenda: AgendaItem[];
  notes: MeetingNote[];
  files: MeetingFile[];
  signals: MeetingSignal[];
  engagement: EngagementRow[];
  hand_raises: HandRaise[];
  coaching_suggestions: CoachingSuggestion[];
  deal: LinkedDeal | null;
}

const EMPTY_WORKSPACE: MeetingWorkspace = {
  agenda: [],
  notes: [],
  files: [],
  signals: [],
  engagement: [],
  hand_raises: [],
  coaching_suggestions: [],
  deal: null,
};

export function useMeetingWorkspace(callId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["meeting-workspace", callId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<MeetingWorkspace> => {
      if (!callId) return EMPTY_WORKSPACE;
      const { data, error } = await (supabase as any).rpc("get_meeting_workspace", {
        p_call_id: callId,
      });
      if (error) throw error;
      return (data ?? EMPTY_WORKSPACE) as MeetingWorkspace;
    },
    enabled: !!callId && !!user,
    staleTime: 4_000,
  });

  // ── Realtime: any change on the meeting tables refreshes the bundle ──────
  useEffect(() => {
    if (!callId) return;
    const tables = [
      "meeting_agenda_items",
      "meeting_notes",
      "meeting_files",
      "meeting_signals",
      "meeting_engagement",
      "meeting_hand_raises",
      "ai_coaching_suggestions",
    ];
    const channel = supabase.channel(`meeting-workspace-${callId}`);
    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `call_id=eq.${callId}` },
        () => qc.invalidateQueries({ queryKey }),
      );
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, qc]);

  // ── Agenda ────────────────────────────────────────────────────────────
  const addAgendaItem = useCallback(async (title: string) => {
    if (!callId || !title.trim()) return;
    const { error } = await (supabase as any).rpc("add_agenda_item", {
      p_call_id: callId,
      p_title: title.trim(),
    });
    if (error) toast.error(error.message || "Failed to add agenda item");
  }, [callId]);

  const toggleAgendaItem = useCallback(async (itemId: string, completed: boolean) => {
    const { error } = await (supabase as any).rpc("toggle_agenda_item", {
      p_item_id: itemId,
      p_completed: completed,
    });
    if (error) toast.error(error.message || "Failed to update agenda item");
  }, []);

  const deleteAgendaItem = useCallback(async (itemId: string) => {
    const { error } = await (supabase as any).rpc("delete_agenda_item", { p_item_id: itemId });
    if (error) toast.error(error.message || "Failed to delete agenda item");
  }, []);

  // ── Notes ─────────────────────────────────────────────────────────────
  const addNote = useCallback(async (content: string) => {
    if (!callId || !content.trim()) return;
    const { error } = await (supabase as any).rpc("add_meeting_note", {
      p_call_id: callId,
      p_content: content.trim(),
    });
    if (error) toast.error(error.message || "Failed to add note");
  }, [callId]);

  // ── Files ─────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File) => {
    if (!callId) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be under 25MB");
      return;
    }
    const path = `${callId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("meeting-files").upload(path, file);
    if (upErr) { toast.error(upErr.message || "Upload failed"); return; }

    const { data: signed } = await supabase.storage
      .from("meeting-files")
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day signed URL

    const { error } = await (supabase as any).rpc("add_meeting_file", {
      p_call_id: callId,
      p_file_name: file.name,
      p_file_url: signed?.signedUrl ?? path,
      p_file_size: file.size,
      p_file_type: file.type,
    });
    if (error) toast.error(error.message || "Failed to save file record");
    else toast.success(`${file.name} shared with the meeting`);
  }, [callId]);

  // ── Hand raises ───────────────────────────────────────────────────────
  const raiseHand = useCallback(async (sessionId: string, userName: string) => {
    if (!callId) return;
    await (supabase as any).rpc("raise_hand", {
      p_call_id: callId, p_session_id: sessionId, p_user_name: userName,
    });
  }, [callId]);

  const lowerHand = useCallback(async (sessionId: string) => {
    if (!callId) return;
    await (supabase as any).rpc("lower_hand", { p_call_id: callId, p_session_id: sessionId });
  }, [callId]);

  // ── Engagement / speaking time ────────────────────────────────────────
  const recordSpeakingTime = useCallback(async (
    sessionId: string, userName: string, isLocal: boolean, secondsDelta: number,
  ) => {
    if (!callId || secondsDelta <= 0) return;
    await (supabase as any).rpc("record_speaking_time", {
      p_call_id: callId,
      p_session_id: sessionId,
      p_user_name: userName,
      p_is_local: isLocal,
      p_seconds_delta: secondsDelta,
    });
  }, [callId]);

  // ── Coaching ──────────────────────────────────────────────────────────
  const dismissCoachingSuggestion = useCallback(async (id: string) => {
    await (supabase as any).rpc("dismiss_coaching_suggestion", { p_id: id });
  }, []);

  const data = query.data ?? EMPTY_WORKSPACE;

  const grouped = useMemo(() => {
    const signals = data.signals ?? [];
    return {
      competitorMentions: signals.filter((s) => s.signal_type === "competitor_mention"),
      buyingSignals: signals.filter((s) => s.signal_type === "buying_signal"),
      followUps: signals.filter((s) => s.signal_type === "follow_up_commitment"),
      nextSteps: signals.filter((s) => s.signal_type === "next_step"),
      sentimentShifts: signals.filter((s) => s.signal_type === "sentiment_shift"),
    };
  }, [data.signals]);

  return {
    workspace: data,
    grouped,
    isLoading: query.isLoading,
    addAgendaItem,
    toggleAgendaItem,
    deleteAgendaItem,
    addNote,
    uploadFile,
    raiseHand,
    lowerHand,
    recordSpeakingTime,
    dismissCoachingSuggestion,
    refresh: () => qc.invalidateQueries({ queryKey }),
  };
}