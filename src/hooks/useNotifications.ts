import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["notifications", user?.id];

  const notificationsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const unreadCount = notificationsQuery.data?.filter(n => !n.is_read).length ?? 0;

  // Realtime — INSERT/UPDATE/DELETE with optimistic cache updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-bell-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        queryClient.setQueryData<Notification[]>(queryKey, (prev = []) => {
          if (prev.some(p => p.id === n.id)) return prev;
          return [n, ...prev].slice(0, 50);
        });
        if (n?.message) {
          playNotificationSound();
          toast(n.title || "New notification", {
            description: n.message,
            position: "bottom-right",
            duration: 4000,
            action: n.link ? {
              label: "View",
              onClick: () => { window.location.href = n.link!; },
            } : undefined,
          });
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as Notification;
        queryClient.setQueryData<Notification[]>(queryKey, (prev = []) =>
          prev.map(p => (p.id === n.id ? { ...p, ...n } : p))
        );
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const old = payload.old as Partial<Notification>;
        if (!old?.id) return;
        queryClient.setQueryData<Notification[]>(queryKey, (prev = []) =>
          prev.filter(p => p.id !== old.id)
        );
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reconcile any events missed before subscription was active
          queryClient.invalidateQueries({ queryKey });
        }
      });
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, queryClient]);

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Notification[]>(queryKey);
      queryClient.setQueryData<Notification[]>(queryKey, (old = []) =>
        old.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Notification[]>(queryKey);
      queryClient.setQueryData<Notification[]>(queryKey, (old = []) =>
        old.map(n => ({ ...n, is_read: true }))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
  });

  return {
    notifications: notificationsQuery.data ?? [],
    notificationsLoading: notificationsQuery.isLoading,
    unreadCount,
    markRead,
    markAllRead,
  };
}
