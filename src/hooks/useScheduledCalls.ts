import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ScheduledCall {
  id: string;
  user_id: string;
  meeting_provider: string;
  meeting_url: string | null;
  title: string;
  scheduled_time: string;
  status: string;
  created_at: string;
}

export function useScheduledCalls() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["scheduled-calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_calls")
        .select("*")
        .order("scheduled_time", { ascending: true });
      if (error) throw error;
      return data as ScheduledCall[];
    },
    enabled: !!user,
  });

  const scheduleMeeting = useMutation({
    mutationFn: async (input: { title: string; meeting_provider: string; meeting_url?: string; scheduled_time: string }) => {
      const { data, error } = await supabase
        .from("scheduled_calls")
        .insert({
          user_id: user!.id,
          title: input.title,
          meeting_provider: input.meeting_provider,
          meeting_url: input.meeting_url || null,
          scheduled_time: input.scheduled_time,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-calls"] });
      toast.success("Meeting scheduled successfully");
    },
    onError: () => toast.error("Failed to schedule meeting"),
  });

  const cancelScheduled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scheduled_calls")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-calls"] });
      toast.success("Meeting cancelled");
    },
  });

  return {
    scheduledCalls: query.data?.filter((c) => c.status === "scheduled") || [],
    isLoading: query.isLoading,
    scheduleMeeting,
    cancelScheduled,
  };
}
