/**
 * useCallPrep.ts
 *
 * Pre-call preparation hook.
 * Fetches previous call history for the same participants,
 * open action items from the last summary, and generates
 * context-aware talking points based on meeting type.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PastCall {
  id: string;
  name: string;
  date: string;
  sentiment_score: number | null;
  status: string | null;
  duration_minutes: number | null;
}

export interface CallPrepData {
  pastCalls: PastCall[];
  latestSummary: {
    summary: string | null;
    next_steps: string[] | null;
    key_decisions: string[] | null;
  } | null;
  talkingPoints: string[];
  participantContext: string | null; // e.g. "3 previous calls with these participants"
}

// ─── Talking points by meeting type ──────────────────────────────────────────

const TALKING_POINTS: Record<string, string[]> = {
  discovery: [
    "Ask about their current process and biggest frustrations",
    "Understand team size, budget authority, and decision timeline",
    "Identify the primary pain point driving this conversation",
    "Ask who else needs to be involved in a buying decision",
    "End with a clear next step — demo, proposal, or follow-up call",
  ],
  demo: [
    "Open by recapping pain points from the discovery call",
    "Show the 2–3 features most relevant to their stated problems",
    "Prepare ROI numbers or a case study from a similar company",
    "Ask for reactions after each major feature, not just at the end",
    "Handle pricing questions with confidence — have ranges ready",
  ],
  negotiation: [
    "Review all objections raised in previous calls before starting",
    "Know your walkaway point and minimum acceptable terms",
    "Prepare three concession tiers (what you'll give first, second, last)",
    "Confirm all key stakeholders are on this call",
    "Aim to close or agree on explicit next steps before hanging up",
  ],
  follow_up: [
    "Reference specific action items you both committed to last time",
    "Open with: what changed on their end since the last call?",
    "Ask what internal conversations they've had about your proposal",
    "Re-qualify urgency — has their timeline shifted?",
    "Push for a clear decision or a defined next milestone",
  ],
  other: [
    "State the goal of this call in the first 60 seconds",
    "Keep your agenda to 3 items or fewer",
    "Send a quick recap email within an hour of hanging up",
    "Confirm the next step before ending",
  ],
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCallPrep(
  participants: string[],
  meetingType: string
): { prep: CallPrepData | null; isLoading: boolean } {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["call-prep", participants.sort().join(","), meetingType],
    queryFn: async (): Promise<CallPrepData> => {
      const talkingPoints =
        TALKING_POINTS[meetingType] ?? TALKING_POINTS.other;

      // No participants → return just the talking points
      if (!participants.length) {
        return {
          pastCalls: [],
          latestSummary: null,
          talkingPoints,
          participantContext: null,
        };
      }

      // ── Find past calls with these participants ──────────────────────────
      // We search for calls where any of the participant emails appear.
      // Supabase array overlap operator: &&
      const { data: pastCalls } = await supabase
        .from("calls")
        .select("id, name, date, sentiment_score, status, duration_minutes")
        .eq("user_id", user!.id)
        .neq("status", "live")
        .overlaps("participants", participants)
        .order("date", { ascending: false })
        .limit(5);

      if (!pastCalls?.length) {
        return {
          pastCalls: [],
          latestSummary: null,
          talkingPoints,
          participantContext: "No previous calls with these participants",
        };
      }

      // ── Get the summary for the most recent call ─────────────────────────
      const { data: latestSummary } = await supabase
        .from("call_summaries")
        .select("summary, next_steps, key_decisions")
        .eq("call_id", pastCalls[0].id)
        .maybeSingle();

      const participantContext =
        pastCalls.length === 1
          ? "1 previous call with these participants"
          : `${pastCalls.length} previous calls with these participants`;

      return {
        pastCalls: pastCalls as PastCall[],
        latestSummary: latestSummary ?? null,
        talkingPoints,
        participantContext,
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { prep: query.data ?? null, isLoading: query.isLoading };
}
