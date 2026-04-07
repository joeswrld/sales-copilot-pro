/**
 * useMobileCalls.ts — Reuse existing call data + offline caching via MMKV
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { MMKV } from "react-native-mmkv";

const storage = new MMKV({ id: "fixsense-cache" });
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached<T>(key: string): T | null {
  try {
    const raw = storage.getString(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as T;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T) {
  try {
    storage.set(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export interface MobileCall {
  id: string;
  name: string;
  date: string;
  status: string | null;
  duration_minutes: number | null;
  sentiment_score: number | null;
  platform: string | null;
}

export interface MobileCallDetail extends MobileCall {
  recording_url: string | null;
  summary: {
    summary: string | null;
    action_items: string[] | null;
    next_steps: string[] | null;
    topics: string[] | null;
    objections: any[];
    buying_signals: string[] | null;
    meeting_score: number | null;
  } | null;
  transcripts: Array<{ speaker: string; text: string; timestamp: string }>;
}

export function useMobileCalls() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mobile-calls", user?.id],
    queryFn: async () => {
      // Check cache first
      const cached = getCached<MobileCall[]>(`calls:${user!.id}`);
      if (cached) return cached;

      const { data, error } = await supabase
        .from("calls")
        .select("id, name, date, status, duration_minutes, sentiment_score, platform")
        .eq("user_id", user!.id)
        .neq("status", "live")
        .order("date", { ascending: false })
        .limit(50);

      if (error) throw error;
      const calls = (data || []) as MobileCall[];
      setCache(`calls:${user!.id}`, calls);
      return calls;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    retry: (count, error: any) => {
      // On network error, use cached data
      const cached = getCached<MobileCall[]>(`calls:${user?.id}`);
      return !cached && count < 3;
    },
  });
}

export function useMobileCallDetail(callId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mobile-call-detail", callId],
    queryFn: async () => {
      const cached = getCached<MobileCallDetail>(`call-detail:${callId}`);
      if (cached) return cached;

      const [callRes, summaryRes, transcriptRes] = await Promise.all([
        supabase
          .from("calls")
          .select("id, name, date, status, duration_minutes, sentiment_score, platform, recording_url, audio_url")
          .eq("id", callId!)
          .single(),
        supabase
          .from("call_summaries")
          .select("summary, action_items, next_steps, topics, objections, buying_signals, meeting_score")
          .eq("call_id", callId!)
          .maybeSingle(),
        supabase
          .from("transcripts")
          .select("speaker, text, timestamp")
          .eq("call_id", callId!)
          .order("timestamp", { ascending: true }),
      ]);

      const detail: MobileCallDetail = {
        ...(callRes.data as any),
        recording_url: callRes.data?.recording_url || callRes.data?.audio_url || null,
        summary: summaryRes.data || null,
        transcripts: (transcriptRes.data || []) as any,
      };

      setCache(`call-detail:${callId}`, detail);
      return detail;
    },
    enabled: !!callId && !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMobileStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mobile-stats", user?.id],
    queryFn: async () => {
      const cached = getCached<any>(`stats:${user!.id}`);
      if (cached) return cached;

      const { data } = await supabase
        .from("calls")
        .select("status, sentiment_score, duration_minutes")
        .eq("user_id", user!.id);

      const calls = data || [];
      const total = calls.length;
      const won = calls.filter((c) => c.status === "Won").length;
      const atRisk = calls.filter((c) => c.status === "at_risk").length;
      const avgSentiment =
        total > 0
          ? Math.round(calls.reduce((s, c) => s + (c.sentiment_score || 0), 0) / total)
          : 0;

      const stats = {
        total,
        winRate: total > 0 ? Math.round((won / total) * 100) : 0,
        avgSentiment,
        atRisk,
      };
      setCache(`stats:${user!.id}`, stats);
      return stats;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}