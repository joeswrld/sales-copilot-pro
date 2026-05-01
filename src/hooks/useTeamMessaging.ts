/**
 * useTeamMessaging.ts — v2 (Performance Fix)
 *
 * ROOT CAUSE OF PAGE HANG:
 * The old version did one query per conversation in a for-loop:
 *   - lastMessages: N queries
 *   - unreadCounts: N queries
 * With 29 conversations = 58+ sequential round-trips → browser timeout/hang
 *
 * FIX: Single RPC call `get_conversations_with_context` returns everything
 * in one query with a lateral join. 1 query replaces 60+.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef } from "react";

export interface Conversation {
  id: string;
  team_id: string;
  created_at: string;
  participants: { user_id: string; full_name: string | null; email: string | null; avatar_url: string | null }[];
  last_message?: { message_text: string; created_at: string; sender_id: string };
  unread_count: number;
  is_group: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  parent_id?: string | null;
  sender?: { full_name: string | null; email: string | null };
}

export function getConversationName(convo: Conversation): string {
  if (convo.participants.length === 0) return "Team Chat";
  if (convo.participants.length === 1) {
    return convo.participants[0].full_name || convo.participants[0].email || "Unknown";
  }
  const names = convo.participants
    .slice(0, 3)
    .map(p => p.full_name?.split(" ")[0] || p.email?.split("@")[0] || "?");
  const suffix = convo.participants.length > 3 ? ` +${convo.participants.length - 3}` : "";
  return names.join(", ") + suffix;
}

export function getConversationInitials(convo: Conversation): string {
  if (convo.participants.length <= 1) {
    const name = convo.participants[0]?.full_name || convo.participants[0]?.email || "?";
    return name[0]?.toUpperCase() || "?";
  }
  return `${convo.participants.length + 1}`;
}

export function useTeamMessaging(teamId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Fast single-RPC conversations query ───────────────────────────────────
  const conversationsQuery = useQuery({
    queryKey: ["team-conversations", teamId, user?.id],
    queryFn: async (): Promise<Conversation[]> => {
      if (!teamId || !user?.id) return [];

      // Use the new fast RPC instead of N+1 loop
      const { data, error } = await (supabase as any).rpc(
        "get_conversations_with_context",
        { p_user_id: user.id }
      );

      if (error) {
        console.error("get_conversations_with_context error:", error);
        // Graceful fallback: just return participants without counts
        const { data: fallback } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id);

        if (!fallback?.length) return [];

        const convoIds = fallback.map(f => f.conversation_id);
        const { data: convos } = await supabase
          .from("team_conversations")
          .select("*")
          .in("id", convoIds)
          .eq("team_id", teamId);

        return (convos || []).map(c => ({
          ...c,
          participants: [],
          unread_count: 0,
          is_group: false,
        })) as Conversation[];
      }

      // Parse the RPC result
      const rawConvos = Array.isArray(data) ? data : [];

      return rawConvos
        .filter((c: any) => c.team_id === teamId)
        .map((c: any) => ({
          id: c.id,
          team_id: c.team_id,
          created_at: c.created_at,
          participants: (c.participants || []) as Conversation["participants"],
          last_message: c.last_message_text
            ? {
                message_text: c.last_message_text,
                created_at: c.last_message_at,
                sender_id: c.last_message_sender_id,
              }
            : undefined,
          unread_count: c.unread_count ?? 0,
          is_group: (c.participants || []).length > 1,
        })) as Conversation[];
    },
    enabled: !!user && !!teamId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const totalUnread = conversationsQuery.data?.reduce((sum, c) => sum + c.unread_count, 0) ?? 0;

  return {
    conversations: conversationsQuery.data ?? [],
    conversationsLoading: conversationsQuery.isLoading,
    totalUnread,
    refetchConversations: () =>
      queryClient.invalidateQueries({ queryKey: ["team-conversations"] }),
  };
}

export interface ReadReceipt {
  user_id: string;
  last_read_at: string | null;
  full_name: string | null;
}

export function useConversationMessages(conversationId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastMarkCountRef = useRef(0);

  // ── Fast single-RPC messages query ────────────────────────────────────────
  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId || !user?.id) return [];

      // Use the fast RPC (also marks as read server-side)
      const { data, error } = await (supabase as any).rpc(
        "get_messages_with_senders",
        { p_conversation_id: conversationId, p_user_id: user.id }
      );

      if (error) {
        console.error("get_messages_with_senders error:", error);
        // Fallback: plain query
        const { data: msgs } = await supabase
          .from("team_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });
        return (msgs || []) as Message[];
      }

      return (Array.isArray(data) ? data : []) as Message[];
    },
    enabled: !!conversationId && !!user?.id,
    staleTime: 10_000,
  });

  // Mark as read when messages change (client-side fallback since RPC already does it)
  const messageCount = messagesQuery.data?.length ?? 0;
  useEffect(() => {
    if (!conversationId || !user || messageCount === 0) return;
    if (messageCount === lastMarkCountRef.current) return;
    lastMarkCountRef.current = messageCount;

    supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
      });
  }, [conversationId, user, messageCount, queryClient]);

  // Read receipts
  const readReceiptsQuery = useQuery({
    queryKey: ["read-receipts", conversationId],
    queryFn: async (): Promise<ReadReceipt[]> => {
      if (!conversationId || !user) return [];
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);

      if (!participants?.length) return [];

      const userIds = participants.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      return participants.map(p => ({
        user_id: p.user_id,
        last_read_at: p.last_read_at,
        full_name: profileMap.get(p.user_id)?.full_name ?? null,
      }));
    },
    enabled: !!conversationId && !!user,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "team_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        queryClient.invalidateQueries({
          queryKey: ["conversation-messages", conversationId],
        });
        queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const sendMessage = useMutation({
    mutationFn: async (payload: {
      text: string;
      file_url?: string;
      file_name?: string;
      file_type?: string;
    }) => {
      if (!conversationId || !user) throw new Error("No conversation or user");
      const { error } = await supabase.from("team_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        message_text: payload.text,
        file_url: payload.file_url ?? null,
        file_name: payload.file_name ?? null,
        file_type: payload.file_type ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

  const startConversation = useMutation({
    mutationFn: async ({
      teamId,
      memberIds,
    }: { teamId: string; memberIds: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const convoId = crypto.randomUUID();

      const { error: convoErr } = await supabase
        .from("team_conversations")
        .insert({ id: convoId, team_id: teamId });
      if (convoErr) throw convoErr;

      const participantRows = [user.id, ...memberIds].map(uid => ({
        conversation_id: convoId,
        user_id: uid,
      }));
      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(participantRows);
      if (partErr) throw partErr;

      return convoId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

  return {
    messages: messagesQuery.data ?? [],
    messagesLoading: messagesQuery.isLoading,
    readReceipts: readReceiptsQuery.data ?? [],
    sendMessage,
    startConversation,
  };
}