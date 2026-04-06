/**
 * useCoachingPlaylists.ts
 * 
 * Data layer for coaching playlists — create, list, add/remove clips, update.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";

export interface CoachingPlaylist {
  id: string;
  team_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  clip_count?: number;
}

export function useCoachingPlaylists() {
  const { user } = useAuth();
  const { team } = useTeam();
  const qc = useQueryClient();

  // List playlists
  const playlistsQuery = useQuery({
    queryKey: ["coaching-playlists", team?.id],
    queryFn: async (): Promise<CoachingPlaylist[]> => {
      const { data, error } = await (supabase as any)
        .from("coaching_playlists")
        .select("*, coaching_clips(count)")
        .or(
          team?.id
            ? `created_by.eq.${user!.id},team_id.eq.${team.id}`
            : `created_by.eq.${user!.id}`
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        clip_count: p.coaching_clips?.[0]?.count ?? 0,
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Create playlist
  const createPlaylist = useMutation({
    mutationFn: async (params: { title: string; description?: string }) => {
      const { data, error } = await (supabase as any)
        .from("coaching_playlists")
        .insert({
          title: params.title,
          description: params.description || null,
          created_by: user!.id,
          team_id: team?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-playlists"] });
      toast.success("Playlist created!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to create playlist"),
  });

  // Add clip to playlist
  const addClipToPlaylist = useMutation({
    mutationFn: async ({ clipId, playlistId }: { clipId: string; playlistId: string }) => {
      const { error } = await (supabase as any)
        .from("coaching_clips")
        .update({ playlist_id: playlistId })
        .eq("id", clipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-playlists"] });
      qc.invalidateQueries({ queryKey: ["coaching-clips-team"] });
      toast.success("Clip added to playlist");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add clip"),
  });

  // Remove clip from playlist
  const removeClipFromPlaylist = useMutation({
    mutationFn: async (clipId: string) => {
      const { error } = await (supabase as any)
        .from("coaching_clips")
        .update({ playlist_id: null })
        .eq("id", clipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-playlists"] });
      qc.invalidateQueries({ queryKey: ["coaching-clips-team"] });
    },
  });

  // Delete playlist
  const deletePlaylist = useMutation({
    mutationFn: async (playlistId: string) => {
      // First remove all clips from playlist
      await (supabase as any)
        .from("coaching_clips")
        .update({ playlist_id: null })
        .eq("playlist_id", playlistId);
      const { error } = await (supabase as any)
        .from("coaching_playlists")
        .delete()
        .eq("id", playlistId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-playlists"] });
      toast.success("Playlist deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete playlist"),
  });

  // Update clip rating/tag
  const updateClipMeta = useMutation({
    mutationFn: async ({ clipId, rating, coaching_tag }: { clipId: string; rating?: number; coaching_tag?: string }) => {
      const updates: any = {};
      if (rating !== undefined) updates.rating = rating;
      if (coaching_tag !== undefined) updates.coaching_tag = coaching_tag;
      const { error } = await (supabase as any)
        .from("coaching_clips")
        .update(updates)
        .eq("id", clipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-clips-team"] });
    },
  });

  return {
    playlists: playlistsQuery.data ?? [],
    isLoading: playlistsQuery.isLoading,
    createPlaylist,
    addClipToPlaylist,
    removeClipFromPlaylist,
    deletePlaylist,
    updateClipMeta,
  };
}
