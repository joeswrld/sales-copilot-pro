/**
 * useCoachingClips.ts
 *
 * Full data layer for the Coaching Clips system.
 * Handles: create, fetch team clips, fetch call clips, delete, react, share.
 */

import { useQuery, useMutation, useQueryClient, useEffect } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp: string;
  seconds?: number;
}

export interface CoachingClip {
  id: string;
  call_id: string;
  team_id: string | null;
  created_by: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  transcript_excerpt: TranscriptLine[];
  manager_comment: string;
  title: string;
  tags: string[];
  call_recording_url: string | null;
  call_title: string;
  view_count: number;
  share_token: string;
  is_public: boolean;
  created_at: string;
  // enriched
  creator_name?: string;
  creator_id?: string;
  reactions?: { emoji: string; count: number }[];
}

export interface CreateClipParams {
  call_id: string;
  start_seconds: number;
  end_seconds: number;
  transcript_excerpt: TranscriptLine[];
  manager_comment: string;
  title?: string;
  tags?: string[];
  slack_webhook_url?: string;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCoachingClips() {
  const { user } = useAuth();
  const { team } = useTeam();
  const qc = useQueryClient();

  // ── All clips for the team ──────────────────────────────────────────────
  const teamClipsQuery = useQuery({
    queryKey: ["coaching-clips-team", team?.id],
    queryFn: async (): Promise<CoachingClip[]> => {
      if (!team?.id) return [];
      const { data, error } = await supabase.rpc("get_team_clips", { p_team_id: team.id });
      if (error) throw error;
      return (data || []) as CoachingClip[];
    },
    enabled: !!team?.id && !!user,
    staleTime: 30_000,
  });

  // ── Clips for a specific call ───────────────────────────────────────────
  const useCallClips = (callId: string | null) =>
    useQuery({
      queryKey: ["coaching-clips-call", callId],
      queryFn: async (): Promise<CoachingClip[]> => {
        if (!callId) return [];
        const { data, error } = await supabase
          .from("coaching_clips" as any)
          .select("*")
          .eq("call_id", callId)
          .order("start_seconds", { ascending: true });
        if (error) throw error;
        return (data || []) as CoachingClip[];
      },
      enabled: !!callId,
      staleTime: 30_000,
    });

  // ── Create clip ─────────────────────────────────────────────────────────
  const createClip = useMutation({
    mutationFn: async (params: CreateClipParams): Promise<CoachingClip> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("create-coaching-clip", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { ...params, team_id: team?.id || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.clip as CoachingClip;
    },
    onSuccess: (clip) => {
      qc.invalidateQueries({ queryKey: ["coaching-clips-team", team?.id] });
      qc.invalidateQueries({ queryKey: ["coaching-clips-call", clip.call_id] });
      toast.success("Coaching clip saved!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save clip");
    },
  });

  // ── Delete clip ─────────────────────────────────────────────────────────
  const deleteClip = useMutation({
    mutationFn: async (clipId: string) => {
      const { error } = await supabase
        .from("coaching_clips" as any)
        .delete()
        .eq("id", clipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-clips-team", team?.id] });
      toast.success("Clip deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete clip");
    },
  });

  // ── Toggle reaction ─────────────────────────────────────────────────────
  const toggleReaction = useMutation({
    mutationFn: async ({ clipId, emoji }: { clipId: string; emoji: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Check if reaction exists
      const { data: existing } = await supabase
        .from("coaching_clip_reactions" as any)
        .select("id")
        .eq("clip_id", clipId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        await supabase.from("coaching_clip_reactions" as any).delete().eq("id", (existing as any).id);
      } else {
        await supabase.from("coaching_clip_reactions" as any).insert({
          clip_id: clipId,
          user_id: user.id,
          emoji,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-clips-team", team?.id] });
    },
  });

  // ── Copy share link ─────────────────────────────────────────────────────
  const copyShareLink = (shareToken: string) => {
    const url = `${window.location.origin}/clip/${shareToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Clip link copied!"),
      () => toast.info(`Share link: ${url}`, { duration: 8000 }),
    );
    return url;
  };

  // ── Stats ───────────────────────────────────────────────────────────────
  const totalClips = teamClipsQuery.data?.length ?? 0;
  const totalViews = teamClipsQuery.data?.reduce((s, c) => s + (c.view_count || 0), 0) ?? 0;

  return {
    teamClips: teamClipsQuery.data ?? [],
    isLoading: teamClipsQuery.isLoading,
    useCallClips,
    createClip,
    deleteClip,
    toggleReaction,
    copyShareLink,
    totalClips,
    totalViews,
  };
}

// ── Public clip (no auth needed) ──────────────────────────────────────────
export function usePublicClip(shareToken: string | null) {
  return useQuery({
    queryKey: ["public-clip", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await supabase.functions.invoke(
        `get-public-clip/${shareToken}`,
        { method: "GET" } as any,
      );
      if (error) throw error;
      return data?.clip as CoachingClip | null;
    },
    enabled: !!shareToken,
    staleTime: 5 * 60_000,
  });
}