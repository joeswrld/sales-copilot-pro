import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
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

export interface TeamCall {
  id: string;
  name: string;
  user_id: string;
  date: string;
  status: string | null;
  sentiment_score: number | null;
  duration_minutes: number | null;
  objections_count: number | null;
  participants: string[] | null;
  profile?: { full_name: string | null; email: string | null; avatar_url: string | null };
  comment_count: number;
  summary?: {
    summary: string | null;
    topics: string[] | null;
    next_steps: string[] | null;
    key_decisions: string[] | null;
  } | null;
}

export function useTeamCalls() {
  const { team, members } = useTeam();

  const teamCallsQuery = useQuery({
    queryKey: ["team-calls", team?.id],
    queryFn: async () => {
      const memberUserIds = members.filter(m => m.user_id).map(m => m.user_id);
      if (!memberUserIds.length) return [];

      // Fetch calls from all team members
      const { data: calls } = await supabase
        .from("calls")
        .select("*")
        .in("user_id", memberUserIds)
        .order("date", { ascending: false })
        .limit(50);

      if (!calls?.length) return [];

      const callIds = calls.map(c => c.id);
      const userIds = [...new Set(calls.map(c => c.user_id))];

      // Fetch profiles, summaries, and comment counts in parallel
      const [profilesRes, summariesRes, commentsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds),
        supabase.from("call_summaries").select("call_id, summary, topics, next_steps, key_decisions").in("call_id", callIds),
        supabase.from("meeting_comments").select("meeting_id").in("meeting_id", callIds),
      ]);

      const profileMap = new Map(profilesRes.data?.map(p => [p.id, p]) ?? []);
      const summaryMap = new Map(summariesRes.data?.map(s => [s.call_id, s]) ?? []);

      // Count comments per meeting
      const commentCounts = new Map<string, number>();
      commentsRes.data?.forEach(c => {
        commentCounts.set(c.meeting_id, (commentCounts.get(c.meeting_id) ?? 0) + 1);
      });

      return calls.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id) ?? null,
        summary: summaryMap.get(c.id) ?? null,
        comment_count: commentCounts.get(c.id) ?? 0,
      })) as TeamCall[];
    },
    enabled: !!team?.id && members.length > 0,
  });

  return {
    teamCalls: teamCallsQuery.data ?? [],
    teamCallsLoading: teamCallsQuery.isLoading,
  };
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
