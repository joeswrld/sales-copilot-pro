/**
 * useGuestApproval.ts
 *
 * Host-side hook for the Guest Join Approval system.
 * Lists pending guest requests for a live call, with realtime updates,
 * and exposes admit/deny mutations.
 *
 * Backed by:
 *  - table:  call_guest_requests (RLS: host/team can select+update)
 *  - edge fn (guest side): guest-join-request, guest-request-status
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GuestRequest {
  id: string;
  call_id: string;
  room_name: string;
  guest_name: string;
  status: "pending" | "admitted" | "denied" | "cancelled" | "expired";
  requested_at: string;
  responded_at: string | null;
}

export function usePendingGuestRequests(callId: string | undefined | null) {
  const qc = useQueryClient();
  const queryKey = ["guest-requests", callId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<GuestRequest[]> => {
      if (!callId) return [];
      const { data, error } = await (supabase as any)
        .from("call_guest_requests")
        .select("*")
        .eq("call_id", callId)
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data || []) as GuestRequest[];
    },
    enabled: !!callId,
    staleTime: 5_000,
    refetchInterval: 20_000,
  });

  // Realtime — new knocks appear instantly, with a toast
  useEffect(() => {
    if (!callId) return;
    const channel = supabase
      .channel(`guest-requests-${callId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_guest_requests", filter: `call_id=eq.${callId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as GuestRequest;
            if (row.status === "pending") {
              toast.info(`${row.guest_name} wants to join this meeting`, {
                duration: 20_000,
              });
            }
          }
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, qc]);

  const respond = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: "admitted" | "denied" }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("call_guest_requests")
        .update({
          status,
          responded_at: new Date().toISOString(),
          responded_by: user?.id ?? null,
        })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey });
      toast.success(vars.status === "admitted" ? "Guest admitted" : "Guest request denied");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update guest request"),
  });

  return {
    requests: query.data ?? [],
    isLoading: query.isLoading,
    admit: (requestId: string) => respond.mutate({ requestId, status: "admitted" }),
    deny: (requestId: string) => respond.mutate({ requestId, status: "denied" }),
    isResponding: respond.isPending,
  };
}