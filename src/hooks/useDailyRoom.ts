/**
 * useDailyRoom.ts
 *
 * Manages Daily.co native meeting room creation.
 * Calls the create-daily-room edge function and returns
 * room info (room_name, room_url, share_link).
 *
 * Usage:
 *   const { createRoom, isCreating, roomInfo, copyShareLink } = useDailyRoom();
 *   await createRoom({ callId: "...", title: "Demo Call" });
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyRoomInfo {
  room_name:  string;
  room_url:   string;
  share_link: string;
  expires_at: string;
}

export interface CreateRoomOptions {
  callId:       string;
  title?:       string;
  meetingType?: string;
  expMinutes?:  number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyRoom() {
  const [roomInfo, setRoomInfo] = useState<DailyRoomInfo | null>(null);

  const createRoomMutation = useMutation({
    mutationFn: async (opts: CreateRoomOptions): Promise<DailyRoomInfo> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("create-daily-room", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          call_id:      opts.callId,
          title:        opts.title       ?? "Fixsense Meeting",
          meeting_type: opts.meetingType ?? null,
          exp_minutes:  opts.expMinutes  ?? 180,
          // Detect app origin dynamically
          app_origin:   typeof window !== "undefined" ? window.location.origin : "https://fixsense.com.ng",
        },
      });

      if (error) throw new Error(error.message ?? "Failed to create meeting room");
      if (data?.error) throw new Error(data.error);

      return data as DailyRoomInfo;
    },

    onSuccess: (data) => {
      setRoomInfo(data);
    },

    onError: (err: Error) => {
      toast.error(err.message || "Failed to create meeting room");
    },
  });

  /** Copy the share link to clipboard and show a toast */
  const copyShareLink = useCallback(async (link?: string) => {
    const target = link ?? roomInfo?.share_link;
    if (!target) { toast.error("No share link available"); return; }
    try {
      await navigator.clipboard.writeText(target);
      toast.success("Meeting link copied to clipboard!");
    } catch {
      // Fallback: show the link so user can copy manually
      toast.info(`Share link: ${target}`, { duration: 8000 });
    }
  }, [roomInfo]);

  return {
    createRoom:  createRoomMutation.mutateAsync,
    isCreating:  createRoomMutation.isPending,
    roomInfo,
    setRoomInfo,
    copyShareLink,
    error:       createRoomMutation.error,
  };
}