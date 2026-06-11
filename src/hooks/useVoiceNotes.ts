/**
 * useVoiceNotes.ts
 *
 * Full data layer for Voice Notes in Fixsense Messaging.
 * Handles: upload, fetch, AI processing, playback tracking,
 * deal room conversion, and real-time updates.
 */

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceNote {
  id: string;
  sender_id: string;
  team_id: string | null;
  conversation_id: string | null;
  channel_id: string | null;
  deal_id: string | null;
  storage_path: string;
  storage_bucket: string;
  duration_seconds: number;
  file_size_bytes: number;
  mime_type: string;
  waveform_data: number[];
  caption: string | null;
  transcript: string | null;
  ai_summary: string | null;
  action_items: string[];
  urgency_level: "low" | "normal" | "high" | "urgent";
  suggested_actions: string[];
  ai_processed: boolean;
  converted_to_note: boolean;
  upload_status: "uploading" | "ready" | "failed";
  play_count: number;
  created_at: string;
  // enriched
  sender_name?: string | null;
  sender_avatar?: string | null;
  signed_url?: string | null;
}

export interface UploadVoiceNoteParams {
  blob: Blob;
  durationSeconds: number;
  waveformData: number[];
  caption?: string;
  conversationId?: string;
  channelId?: string;
  dealId?: string;
  teamId?: string;
  mimeType?: string;
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

async function getSignedUrl(voiceNoteId: string): Promise<string | null> {
  try {
    const { data } = await supabase.functions.invoke("process-voice-note", {
      body: { action: "signed_url", voice_note_id: voiceNoteId },
    });
    return data?.signed_url ?? null;
  } catch {
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceNotes() {
  const { user } = useAuth();
  const { effectivePlan } = useEffectivePlan();
  const qc = useQueryClient();
  const uploadAbortRef = useRef<AbortController | null>(null);

  const planKey = effectivePlan?.planKey ?? "free";
  const hasAI = ["growth", "scale"].includes(planKey);

  // ── Upload a voice note ───────────────────────────────────────────────────
  const upload = useMutation({
    mutationFn: async (params: UploadVoiceNoteParams): Promise<VoiceNote> => {
      if (!user) throw new Error("Not authenticated");

      const {
        blob, durationSeconds, waveformData, caption,
        conversationId, channelId, dealId, teamId, mimeType,
      } = params;

      // 1. Create DB record (upload_status = 'uploading')
      const { data: vn, error: insertErr } = await (supabase as any)
        .from("voice_notes")
        .insert({
          sender_id: user.id,
          team_id: teamId ?? null,
          conversation_id: conversationId ?? null,
          channel_id: channelId ?? null,
          deal_id: dealId ?? null,
          storage_path: `placeholder`, // updated after upload
          storage_bucket: "voice-notes",
          duration_seconds: durationSeconds,
          file_size_bytes: blob.size,
          mime_type: mimeType ?? blob.type ?? "audio/webm",
          waveform_data: waveformData,
          caption: caption ?? null,
          upload_status: "uploading",
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 2. Upload to Supabase storage
      const ext = (mimeType ?? blob.type ?? "audio/webm").includes("ogg") ? "ogg" : "webm";
      const storagePath = `${user.id}/${vn.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("voice-notes")
        .upload(storagePath, blob, {
          contentType: mimeType ?? blob.type ?? "audio/webm",
          upsert: false,
        });

      if (uploadErr) {
        // Mark failed
        await (supabase as any).from("voice_notes").update({ upload_status: "failed" }).eq("id", vn.id);
        throw uploadErr;
      }

      // 3. Update DB with real path and mark ready
      await (supabase as any)
        .from("voice_notes")
        .update({ storage_path: storagePath, upload_status: "ready" })
        .eq("id", vn.id);

      const ready = { ...vn, storage_path: storagePath, upload_status: "ready" };

      // 4. Send notification (fire and forget)
      supabase.functions.invoke("notify-voice-note", { body: { voice_note_id: vn.id } }).catch(() => {});

      // 5. Trigger AI processing if plan supports it
      if (hasAI) {
        supabase.functions.invoke("process-voice-note", {
          body: { action: "process_ai", voice_note_id: vn.id, plan_key: planKey },
        }).catch(() => {});
      }

      return ready as VoiceNote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Failed to send voice note");
    },
  });

  // ── Fetch voice notes for a conversation or channel ───────────────────────
  const useFetchForContext = (params: { conversationId?: string; channelId?: string }) => {
    const key = params.conversationId ?? params.channelId ?? "";
    return useQuery({
      queryKey: ["voice-notes", key],
      queryFn: async (): Promise<VoiceNote[]> => {
        let query = (supabase as any)
          .from("voice_notes")
          .select("*, profiles:sender_id(full_name, avatar_url)")
          .eq("upload_status", "ready")
          .order("created_at", { ascending: true });

        if (params.conversationId) query = query.eq("conversation_id", params.conversationId);
        else if (params.channelId) query = query.eq("channel_id", params.channelId);
        else return [];

        const { data, error } = await query;
        if (error) throw error;

        return ((data ?? []) as any[]).map((vn: any) => ({
          ...vn,
          sender_name: vn.profiles?.full_name ?? null,
          sender_avatar: vn.profiles?.avatar_url ?? null,
          waveform_data: Array.isArray(vn.waveform_data) ? vn.waveform_data : [],
          action_items: Array.isArray(vn.action_items) ? vn.action_items : [],
          suggested_actions: Array.isArray(vn.suggested_actions) ? vn.suggested_actions : [],
        })) as VoiceNote[];
      },
      enabled: !!(params.conversationId || params.channelId) && !!user,
      staleTime: 15_000,
    });
  };

  // ── Get signed playback URL ────────────────────────────────────────────────
  const getPlaybackUrl = useCallback(async (voiceNoteId: string): Promise<string | null> => {
    return getSignedUrl(voiceNoteId);
  }, []);

  // ── Record a play event ────────────────────────────────────────────────────
  const recordPlay = useMutation({
    mutationFn: async ({ voiceNoteId, durationPlayed, speed }: {
      voiceNoteId: string; durationPlayed?: number; speed?: number;
    }) => {
      await (supabase as any).rpc("record_voice_note_play", {
        p_voice_note_id: voiceNoteId,
        p_duration_played: durationPlayed ?? 0,
        p_speed: speed ?? 1.0,
      });
    },
  });

  // ── Convert to deal note ───────────────────────────────────────────────────
  const convertToDealNote = useMutation({
    mutationFn: async (voiceNoteId: string) => {
      const { data, error } = await supabase.functions.invoke("process-voice-note", {
        body: { action: "convert_to_deal_note", voice_note_id: voiceNoteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
      qc.invalidateQueries({ queryKey: ["deal-detail"] });
      toast.success("Voice note saved to deal timeline!");
    },
    onError: (err: any) => toast.error(err.message ?? "Failed to convert"),
  });

  // ── Delete a voice note ────────────────────────────────────────────────────
  const deleteVoiceNote = useMutation({
    mutationFn: async (voiceNoteId: string) => {
      const { data: vn } = await (supabase as any)
        .from("voice_notes")
        .select("storage_path, storage_bucket")
        .eq("id", voiceNoteId)
        .eq("sender_id", user!.id)
        .single();

      if (vn?.storage_path) {
        await supabase.storage.from(vn.storage_bucket).remove([vn.storage_path]);
      }
      await (supabase as any).from("voice_notes").delete().eq("id", voiceNoteId).eq("sender_id", user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Failed to delete"),
  });

  return {
    upload,
    useFetchForContext,
    getPlaybackUrl,
    recordPlay,
    convertToDealNote,
    deleteVoiceNote,
    hasAI,
    planKey,
    isUploading: upload.isPending,
    cancelUpload: () => uploadAbortRef.current?.abort(),
  };
}