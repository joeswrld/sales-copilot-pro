/**
 * useDealRooms.ts
 *
 * Manages Deal Rooms backed by the deal_rooms Supabase table.
 *
 * Features:
 *  - Fetches all deal rooms for the current user's team
 *  - Real-time updates via Supabase Realtime
 *  - CRUD: create, update stage, update next step
 *  - createFromCall: auto-creates a Deal Room when a call completes
 *  - Stage history is recorded automatically via DB trigger
 */

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DealStage =
  | "discovery"
  | "demo"
  | "negotiation"
  | "won"
  | "lost"
  | "at_risk";

export interface DealRoom {
  id: string;
  team_id: string;
  conversation_id: string | null;
  call_id: string | null;
  deal_name: string;
  company: string | null;
  stage: DealStage;
  sentiment_score: number | null;
  last_call_score: number | null;
  next_step: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // enriched on fetch
  assigned_profile?: { full_name: string | null; email: string | null } | null;
  created_by_profile?: { full_name: string | null; email: string | null } | null;
  stage_history?: DealStageHistory[];
  unread_count?: number;
}

export interface DealStageHistory {
  id: string;
  deal_room_id: string;
  old_stage: string | null;
  new_stage: string;
  changed_by: string | null;
  note: string | null;
  changed_at: string;
  changer_profile?: { full_name: string | null; email: string | null } | null;
}

// ─── Stage config ────────────────────────────────────────────────────────────

export const DEAL_STAGE_CONFIG: Record<
  DealStage,
  { label: string; color: string; bg: string; icon: string; order: number }
> = {
  discovery:   { label: "Discovery",   color: "#60a5fa", bg: "rgba(96,165,250,.12)",  icon: "🔍", order: 0 },
  demo:        { label: "Demo",        color: "#a78bfa", bg: "rgba(167,139,250,.12)", icon: "🎯", order: 1 },
  negotiation: { label: "Negotiation", color: "#fbbf24", bg: "rgba(251,191,36,.12)",  icon: "🤝", order: 2 },
  won:         { label: "Won",         color: "#22c55e", bg: "rgba(34,197,94,.12)",   icon: "🎉", order: 3 },
  lost:        { label: "Lost",        color: "#ef4444", bg: "rgba(239,68,68,.12)",   icon: "❌", order: 4 },
  at_risk:     { label: "At Risk",     color: "#f97316", bg: "rgba(249,115,22,.12)",  icon: "⚠️", order: 5 },
};

/**
 * Derives a deal stage from a call's existing status field.
 * Keeps deal rooms consistent with call data from the calls table.
 */
export function stageFromCall(call: {
  status?: string | null;
  meeting_type?: string | null;
  sentiment_score?: number | null;
}): DealStage {
  if (call.status === "Won")    return "won";
  if (call.status === "Lost")   return "lost";
  if (call.status === "At Risk") return "at_risk";
  if (call.meeting_type === "demo")        return "demo";
  if (call.meeting_type === "negotiation") return "negotiation";
  return "discovery";
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDealRooms() {
  const { user } = useAuth();
  const { team } = useTeam();
  const qc = useQueryClient();
  const teamId = team?.id;

  // ── Fetch ──────────────────────────────────────────────────────────────
  const { data: dealRooms = [], isLoading } = useQuery({
    queryKey: ["deal-rooms", teamId],
    queryFn: async (): Promise<DealRoom[]> => {
      if (!teamId) return [];

      const { data: rooms, error } = await (supabase as any)
        .from("deal_rooms")
        .select("*")
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!rooms?.length) return [];

      // Enrich with profiles
      const userIds = [
        ...new Set([
          ...(rooms as any[]).map((r: any) => r.assigned_to).filter(Boolean),
          ...(rooms as any[]).map((r: any) => r.created_by).filter(Boolean),
        ]),
      ];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const pm = new Map(profiles?.map((p: any) => [p.id, p]) ?? []);

      // Fetch unread counts from conversations
      const convIds = (rooms as any[]).map((r: any) => r.conversation_id).filter(Boolean);
      let unreadMap = new Map<string, number>();
      if (convIds.length && user) {
        for (const cid of convIds) {
          const { data: part } = await supabase
            .from("conversation_participants")
            .select("last_read_at")
            .eq("conversation_id", cid)
            .eq("user_id", user.id)
            .maybeSingle();

          const lastRead = (part as any)?.last_read_at ?? "1970-01-01";
          const { count } = await supabase
            .from("team_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", cid)
            .neq("sender_id", user.id)
            .gt("created_at", lastRead);

          unreadMap.set(cid, count ?? 0);
        }
      }

      return (rooms as any[]).map((r: any) => ({
        ...r,
        assigned_profile:    r.assigned_to ? pm.get(r.assigned_to) ?? null : null,
        created_by_profile:  r.created_by  ? pm.get(r.created_by)  ?? null : null,
        unread_count:        r.conversation_id ? (unreadMap.get(r.conversation_id) ?? 0) : 0,
      })) as DealRoom[];
    },
    enabled: !!teamId && !!user,
    staleTime: 15_000,
  });

  // ── Realtime ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase
      .channel(`deal-rooms:${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deal_rooms" },
        () => qc.invalidateQueries({ queryKey: ["deal-rooms", teamId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId, qc]);

  // ── Create from call ──────────────────────────────────────────────────
  const createFromCall = useMutation({
    mutationFn: async (params: {
      callId: string;
      dealName: string;
      company?: string;
      stage?: DealStage;
      sentimentScore?: number;
      lastCallScore?: number;
      nextStep?: string;
    }) => {
      if (!teamId) throw new Error("No team");
      const { data, error } = await (supabase as any).rpc(
        "create_deal_room_for_call",
        {
          p_call_id:         params.callId,
          p_team_id:         teamId,
          p_deal_name:       params.dealName,
          p_company:         params.company ?? null,
          p_stage:           params.stage ?? "discovery",
          p_sentiment_score: params.sentimentScore ?? null,
          p_last_call_score: params.lastCallScore ?? null,
          p_next_step:       params.nextStep ?? null,
        }
      );
      if (error) throw error;
      return data as string; // deal_room_id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-rooms", teamId] });
    },
    onError: (err: any) => {
      console.error("createFromCall error:", err);
    },
  });

  // ── Update stage ──────────────────────────────────────────────────────
  const updateStage = useMutation({
    mutationFn: async ({
      dealRoomId,
      stage,
      note,
    }: {
      dealRoomId: string;
      stage: DealStage;
      note?: string;
    }) => {
      const { error } = await (supabase as any)
        .from("deal_rooms")
        .update({ stage, updated_at: new Date().toISOString() })
        .eq("id", dealRoomId);
      if (error) throw error;

      // note is stored separately if provided
      if (note) {
        const room = dealRooms.find(r => r.id === dealRoomId);
        if (room) {
          await (supabase as any)
            .from("deal_stage_history")
            .insert({
              deal_room_id: dealRoomId,
              old_stage:    room.stage,
              new_stage:    stage,
              changed_by:   user?.id,
              note,
            });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-rooms", teamId] });
      toast("Deal stage updated");
    },
    onError: (err: any) => {
      toast(`Failed to update stage: ${err.message}`);
    },
  });

  // ── Update next step ──────────────────────────────────────────────────
  const updateNextStep = useMutation({
    mutationFn: async ({
      dealRoomId,
      nextStep,
    }: {
      dealRoomId: string;
      nextStep: string;
    }) => {
      const { error } = await (supabase as any)
        .from("deal_rooms")
        .update({ next_step: nextStep, updated_at: new Date().toISOString() })
        .eq("id", dealRoomId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-rooms", teamId] });
    },
  });

  // ── Create manual deal room ───────────────────────────────────────────
  const createDealRoom = useMutation({
    mutationFn: async (params: {
      dealName: string;
      company?: string;
      stage?: DealStage;
      assignedTo?: string;
    }) => {
      if (!teamId || !user) throw new Error("No team or user");

      // Create a backing conversation
      const { data: convo, error: convoErr } = await supabase
        .from("team_conversations")
        .insert({ team_id: teamId })
        .select()
        .single();
      if (convoErr) throw convoErr;

      // Add all active members to the conversation
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("status", "active");

      if (members?.length) {
        await supabase.from("conversation_participants").insert(
          members.map((m: any) => ({
            conversation_id: (convo as any).id,
            user_id: m.user_id,
          }))
        );
      }

      const { data, error } = await (supabase as any)
        .from("deal_rooms")
        .insert({
          team_id:         teamId,
          conversation_id: (convo as any).id,
          deal_name:       params.dealName,
          company:         params.company ?? null,
          stage:           params.stage ?? "discovery",
          assigned_to:     params.assignedTo ?? null,
          created_by:      user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-rooms", teamId] });
      toast("Deal room created");
    },
    onError: (err: any) => {
      toast(`Failed to create deal room: ${err.message}`);
    },
  });

  // ── Stage history ─────────────────────────────────────────────────────
  const useStageHistory = (dealRoomId: string | null) =>
    useQuery({
      queryKey: ["deal-stage-history", dealRoomId],
      queryFn: async () => {
        if (!dealRoomId) return [];
        const { data } = await (supabase as any)
          .from("deal_stage_history")
          .select("*")
          .eq("deal_room_id", dealRoomId)
          .order("changed_at", { ascending: false })
          .limit(20);
        return (data || []) as DealStageHistory[];
      },
      enabled: !!dealRoomId,
    });

  // ── Derived ───────────────────────────────────────────────────────────
  const byStage = useCallback(
    (stage: DealStage) => dealRooms.filter(r => r.stage === stage),
    [dealRooms]
  );

  const totalUnread = dealRooms.reduce((sum, r) => sum + (r.unread_count ?? 0), 0);

  return {
    dealRooms,
    isLoading,
    byStage,
    totalUnread,
    createFromCall,
    createDealRoom,
    updateStage,
    updateNextStep,
    useStageHistory,
  };
}
