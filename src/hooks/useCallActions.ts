import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CallAction {
  id: string;
  call_id: string;
  user_id: string;
  priority_action: string;
  draft_email_subject: string | null;
  draft_email_body: string | null;
  crm_pushed: boolean;
  crm_provider: string | null;
  crm_task_id: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useCallAction(callId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["call-action", callId],
    queryFn: async (): Promise<CallAction | null> => {
      if (!callId) return null;
      const { data, error } = await supabase
        .from("call_actions" as any)
        .select("*")
        .eq("call_id", callId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CallAction | null;
    },
    enabled: !!callId,
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: async (callId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("generate-call-action", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { call_id: callId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.action as CallAction;
    },
    onSuccess: (action) => {
      qc.setQueryData(["call-action", action.call_id], action);
      toast.success("Next action generated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate action");
    },
  });

  const toggleComplete = useMutation({
    mutationFn: async ({ actionId, completed }: { actionId: string; completed: boolean }) => {
      const { error } = await supabase
        .from("call_actions" as any)
        .update({
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-action", callId] });
      qc.invalidateQueries({ queryKey: ["call-actions-stats"] });
    },
  });

  const markCrmPushed = useMutation({
    mutationFn: async ({ actionId, provider }: { actionId: string; provider: string }) => {
      const { error } = await supabase
        .from("call_actions" as any)
        .update({ crm_pushed: true, crm_provider: provider })
        .eq("id", actionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-action", callId] });
      toast.success("Action pushed to CRM!");
    },
  });

  return { action: query.data, isLoading: query.isLoading, generate, toggleComplete, markCrmPushed };
}

// Stats hook for Analytics page
export function useActionStats() {
  return useQuery({
    queryKey: ["call-actions-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_actions" as any)
        .select("id, is_completed, created_at, user_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const actions = (data || []) as unknown as Pick<CallAction, "id" | "is_completed" | "created_at" | "user_id">[];
      const total = actions.length;
      const completed = actions.filter(a => a.is_completed).length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { total, completed, rate, actions };
    },
    staleTime: 60_000,
  });
}
