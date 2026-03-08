import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export interface MeetingComment {
  id: string;
  meeting_id: string;
  user_id: string;
  parent_id: string | null;
  comment_text: string;
  created_at: string;
  profile?: { full_name: string | null; email: string | null; avatar_url: string | null };
}

export function useCoaching(meetingId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ["meeting-comments", meetingId],
    queryFn: async () => {
      const { data: comments } = await supabase
        .from("meeting_comments")
        .select("*")
        .eq("meeting_id", meetingId!)
        .order("created_at", { ascending: true });

      if (!comments?.length) return [];

      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

      return comments.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id) ?? null,
      })) as MeetingComment[];
    },
    enabled: !!meetingId,
  });

  // Realtime
  useEffect(() => {
    if (!meetingId) return;
    const channel = supabase
      .channel(`comments-${meetingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "meeting_comments",
        filter: `meeting_id=eq.${meetingId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["meeting-comments", meetingId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meetingId, queryClient]);

  const addComment = useMutation({
    mutationFn: async ({ text, parentId }: { text: string; parentId?: string }) => {
      const { error } = await supabase.from("meeting_comments").insert({
        meeting_id: meetingId!,
        user_id: user!.id,
        comment_text: text,
        parent_id: parentId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-comments", meetingId] });
    },
  });

  return {
    comments: commentsQuery.data ?? [],
    commentsLoading: commentsQuery.isLoading,
    addComment,
  };
}
