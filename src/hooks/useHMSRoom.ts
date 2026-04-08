/**
 * useHMSRoom.ts
 *
 * Manages 100ms meeting room creation.
 * Calls the create-hms-room edge function and returns
 * room info (room_id, room_name, share_link, mgmt_token).
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface HMSRoomInfo {
  room_id:    string;
  room_name:  string;
  share_link: string;
  mgmt_token: string;
}

export interface CreateHMSRoomOptions {
  callId:       string;
  title?:       string;
  meetingType?: string;
}

export function useHMSRoom() {
  const [roomInfo, setRoomInfo] = useState<HMSRoomInfo | null>(null);

  const createRoomMutation = useMutation({
    mutationFn: async (opts: CreateHMSRoomOptions): Promise<HMSRoomInfo> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("create-hms-room", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          call_id:      opts.callId,
          title:        opts.title       ?? "Fixsense Meeting",
          meeting_type: opts.meetingType ?? null,
          app_origin:   typeof window !== "undefined" ? window.location.origin : "https://fixsense.com.ng",
        },
      });

      if (error) throw new Error(error.message ?? "Failed to create meeting room");
      if (data?.error) throw new Error(data.error);

      return data as HMSRoomInfo;
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

  return {
    createRoom:  createRoomMutation.mutateAsync,
    isCreating:  createRoomMutation.isPending,
    roomInfo,
    setRoomInfo,
    copyShareLink,
    error:       createRoomMutation.error,
  };
}

// Backwards-compatible alias — existing imports of useDailyRoom still work
export { useHMSRoom as useDailyRoom };
export type { HMSRoomInfo as DailyRoomInfo };