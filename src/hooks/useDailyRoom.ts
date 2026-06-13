/**
 * useDailyRoom.ts  (v2 — fully Daily.co)
 *
 * Manages Daily.co meeting room creation via the create-daily-room edge function.
 * Drop-in replacement for the old useHMSRoom.
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyRoomInfo {
  room_name:     string;
  room_url:      string;
  share_link:    string;
  meeting_token: string | null;
  expires_at:    string;
  // Legacy aliases
  mgmt_token:    string | null;
  auth_token:    string | null;
}

export interface CreateRoomOptions {
  callId:       string;
  title?:       string;
  meetingType?: string;
  expMinutes?:  number;
  privacy?:     "public" | "private";
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
          privacy:      opts.privacy     ?? "public",
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

  const copyShareLink = useCallback(async (link?: string) => {
    const target = link ?? roomInfo?.share_link;
    if (!target) { toast.error("No share link available"); return; }
    try {
      await navigator.clipboard.writeText(target);
      toast.success("Meeting link copied to clipboard!");
    } catch {
      toast.info(`Share link: ${target}`, { duration: 8000 });
    }
  }, [roomInfo]);

  /** Open the Daily prebuilt UI in a new tab (guest join experience) */
  const openInBrowser = useCallback((rName?: string) => {
    const name = rName ?? roomInfo?.room_name;
    if (!name) return;
    window.open(`https://fixsense.daily.co/${name}`, "_blank", "noopener");
  }, [roomInfo]);

  return {
    createRoom:  createRoomMutation.mutateAsync,
    isCreating:  createRoomMutation.isPending,
    roomInfo,
    setRoomInfo,
    copyShareLink,
    openInBrowser,
    error:       createRoomMutation.error,
  };
}

// ── Backwards compatibility alias ─────────────────────────────────────────────
export { useDailyRoom as useHMSRoom };
export type { DailyRoomInfo as HMSRoomInfo };