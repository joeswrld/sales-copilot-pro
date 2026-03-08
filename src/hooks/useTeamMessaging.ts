import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

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
  sender?: { full_name: string | null; email: string | null };
}

/** Returns display name for a conversation */
export function getConversationName(convo: Conversation): string {
  if (convo.participants.length === 0) return "Empty Chat";
  if (convo.participants.length === 1) {
    return convo.participants[0].full_name || convo.participants[0].email || "Unknown";
  }
  // Group: show first 3 names
  const names = convo.participants
    .slice(0, 3)
    .map(p => p.full_name?.split(" ")[0] || p.email?.split("@")[0] || "?");
  const suffix = convo.participants.length > 3 ? ` +${convo.participants.length - 3}` : "";
  return names.join(", ") + suffix;
}

/** Returns initials for avatar */
export function getConversationInitials(convo: Conversation): string {
  if (convo.participants.length <= 1) {
    const name = convo.participants[0]?.full_name || convo.participants[0]?.email || "?";
    return name[0]?.toUpperCase() || "?";
  }
  // Group: show count
  return `${convo.participants.length + 1}`;
}

export function useTeamMessaging(teamId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery({
    queryKey: ["team-conversations", teamId],
    queryFn: async () => {
      const { data: participantRows } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user!.id);

      if (!participantRows?.length) return [];

      const convoIds = participantRows.map(p => p.conversation_id);
      const lastReadMap = new Map(participantRows.map(p => [p.conversation_id, p.last_read_at]));

      const { data: convos } = await supabase
        .from("team_conversations")
        .select("*")
        .in("id", convoIds)
        .eq("team_id", teamId!)
        .order("created_at", { ascending: false });

      if (!convos?.length) return [];

      const { data: allParticipants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", convoIds);

      const allUserIds = [...new Set(allParticipants?.map(p => p.user_id) ?? [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", allUserIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      const results: Conversation[] = [];
      for (const convo of convos) {
        const { data: lastMsg } = await supabase
          .from("team_messages")
          .select("message_text, created_at, sender_id")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const lastRead = lastReadMap.get(convo.id);
        const { count } = await supabase
          .from("team_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convo.id)
          .neq("sender_id", user!.id)
          .gt("created_at", lastRead ?? "1970-01-01");

        const participants = (allParticipants ?? [])
          .filter(p => p.conversation_id === convo.id && p.user_id !== user!.id)
          .map(p => {
            const prof = profileMap.get(p.user_id);
            return {
              user_id: p.user_id,
              full_name: prof?.full_name ?? null,
              email: prof?.email ?? null,
              avatar_url: prof?.avatar_url ?? null,
            };
          });

        results.push({
          ...convo,
          participants,
          last_message: lastMsg ?? undefined,
          unread_count: count ?? 0,
          is_group: participants.length > 1,
        });
      }

      results.sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.created_at;
        const bTime = b.last_message?.created_at ?? b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      return results;
    },
    enabled: !!user && !!teamId,
    refetchInterval: 30000,
  });

  const totalUnread = conversationsQuery.data?.reduce((sum, c) => sum + c.unread_count, 0) ?? 0;

  return {
    conversations: conversationsQuery.data ?? [],
    conversationsLoading: conversationsQuery.isLoading,
    totalUnread,
    refetchConversations: () => queryClient.invalidateQueries({ queryKey: ["team-conversations"] }),
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

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: async () => {
      const { data: messages } = await supabase
        .from("team_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });

      if (!messages?.length) return [];

      const senderIds = [...new Set(messages.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", senderIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      return messages.map(m => ({
        ...m,
        sender: profileMap.get(m.sender_id) ?? null,
      })) as Message[];
    },
    enabled: !!conversationId,
  });

  // Read receipts: fetch other participants' last_read_at
  const readReceiptsQuery = useQuery({
    queryKey: ["read-receipts", conversationId],
    queryFn: async () => {
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id, last_read_at")
        .eq("conversation_id", conversationId!)
        .neq("user_id", user!.id);

      if (!participants?.length) return [] as ReadReceipt[];

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
      })) as ReadReceipt[];
    },
    enabled: !!conversationId && !!user,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!conversationId || !user) return;
    supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
      });
  }, [conversationId, user, messagesQuery.data?.length]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const sendMessage = useMutation({
    mutationFn: async (payload: { text: string; file_url?: string; file_name?: string; file_type?: string }) => {
      const { error } = await supabase
        .from("team_messages")
        .insert({
          conversation_id: conversationId!,
          sender_id: user!.id,
          message_text: payload.text,
          file_url: payload.file_url ?? null,
          file_name: payload.file_name ?? null,
          file_type: payload.file_type ?? null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["read-receipts", conversationId] });
    },
  });

  /** Start a new conversation with one or more users */
  const startConversation = useMutation({
    mutationFn: async ({ teamId, memberIds }: { teamId: string; memberIds: string[] }) => {
      const { data: convo, error: convoErr } = await supabase
        .from("team_conversations")
        .insert({ team_id: teamId })
        .select()
        .single();
      if (convoErr) throw convoErr;

      const participantRows = [user!.id, ...memberIds].map(uid => ({
        conversation_id: convo.id,
        user_id: uid,
      }));

      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(participantRows);
      if (partErr) throw partErr;

      return convo.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

  return {
    messages: messagesQuery.data ?? [],
    messagesLoading: messagesQuery.isLoading,
    sendMessage,
    startConversation,
  };
}
