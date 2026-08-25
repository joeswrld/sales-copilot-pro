/**
 * InterviewsPage.tsx — Interviews / Live Calls
 *
 * Team-wide interview agenda. CandidateDetailPage already owns per-candidate
 * interview scheduling + AI feedback confirmation (schedule_interview,
 * confirm_interview_feedback RPCs) — this page does NOT duplicate that. It's
 * the cross-candidate "what's coming up / needs action" view called for in
 * the nav spec (Interviews / Live Calls), backed by the new list_team_interviews
 * RPC (no new tables).
 *
 * Mirrors CandidatesPage.tsx / CrmPage.tsx conventions: inline styles,
 * cream/navy theme, mobile-responsive list.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/hooks/useTeam";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  Loader2, RefreshCw, Calendar, Video, Users, Building2, AlertTriangle,
  CheckCircle2, Clock, ExternalLink, ClipboardList,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InterviewItem {
  interview_id: string;
  candidate_job_id: string;
  interview_stage: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  status: "scheduled" | "completed" | string;
  interviewer_names: string[] | null;
  meeting_link: string | null;
  candidate_notified_at: string | null;
  candidate: { id: string; full_name: string; email: string | null };
  job: { id: string; title: string };
  client: { id: string; name: string } | null;
  feedback_status: string | null;
  feedback_confirmed: boolean | null;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  interview: { label: "Interview", color: "#fb923c" },
  final_interview: { label: "Final Interview", color: "#f59e0b" },
  screening: { label: "Screening Call", color: "#60a5fa" },
};

function getStageCfg(stage: string) {
  return STAGE_LABELS[stage] ?? { label: stage, color: "#94a3b8" };
}

// ─── Interview row ────────────────────────────────────────────────────────

function InterviewRow({ item, onClick }: { item: InterviewItem; onClick: () => void }) {
  const stage = getStageCfg(item.interview_stage);
  const overdueFeedback = item.status === "completed" && !item.feedback_confirmed;
  const scheduledDate = item.scheduled_at ? new Date(item.scheduled_at) : null;
  const isOverdueScheduled = item.status === "scheduled" && scheduledDate && isPast(scheduledDate);

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "13px 14px", cursor: "pointer",
        borderBottom: "1px solid rgba(23,23,15,0.05)",
        transition: "background 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(23,23,15,0.02)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: stage.color + "18", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Video style={{ width: 15, height: 15, color: stage.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#17170F", marginBottom: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {item.candidate.full_name}
          <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(23,23,15,0.4)" }}>for {item.job.title}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "rgba(23,23,15,0.4)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {item.client && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Building2 style={{ width: 10, height: 10 }} />{item.client.name}
            </span>
          )}
          {scheduledDate && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: isOverdueScheduled ? "#ef4444" : undefined }}>
              <Calendar style={{ width: 10, height: 10 }} />{format(scheduledDate, "MMM d, HH:mm")}
            </span>
          )}
          {item.interviewer_names && item.interviewer_names.length > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Users style={{ width: 10, height: 10 }} />{item.interviewer_names.join(", ")}
            </span>
          )}
        </div>
      </div>

      {overdueFeedback && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(239,68,68,0.12)", color: "#ef4444", flexShrink: 0 }}>
          <AlertTriangle style={{ width: 10, height: 10 }} />Feedback overdue
        </div>
      )}
      {isOverdueScheduled && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(251,191,36,0.15)", color: "#b45309", flexShrink: 0 }}>
          <Clock style={{ width: 10, height: 10 }} />Overdue
        </div>
      )}
      {item.status === "completed" && item.feedback_confirmed && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(34,197,94,0.12)", color: "#22c55e", flexShrink: 0 }}>
          <CheckCircle2 style={{ width: 10, height: 10 }} />Feedback confirmed
        </div>
      )}
      {item.meeting_link && item.status === "scheduled" && (
        <a
          href={item.meeting_link}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
            padding: "6px 10px", borderRadius: 8, background: "#22315C", color: "#FAFAF8",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          <Video style={{ width: 11, height: 11 }} />Join
        </a>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type FilterTab = "upcoming" | "needs_feedback" | "completed" | "all";

export default function InterviewsPage() {
  const navigate = useNavigate();
  const { teamId, teamLoading } = useTeam();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("upcoming");

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("list_team_interviews", { p_team_id: teamId, p_status: null });
      if (error) throw error;
      setInterviews((data ?? []) as InterviewItem[]);
    } catch (e: any) {
      setError(e.message ?? "Failed to load interviews");
      toast.error(e.message ?? "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { if (teamId) load(); }, [teamId, load]);

  const filtered = useMemo(() => {
    switch (tab) {
      case "upcoming":
        return interviews.filter(i => i.status === "scheduled");
      case "needs_feedback":
        return interviews.filter(i => i.status === "completed" && !i.feedback_confirmed);
      case "completed":
        return interviews.filter(i => i.status === "completed");
      default:
        return interviews;
    }
  }, [interviews, tab]);

  const counts = useMemo(() => ({
    upcoming: interviews.filter(i => i.status === "scheduled").length,
    needsFeedback: interviews.filter(i => i.status === "completed" && !i.feedback_confirmed).length,
    completed: interviews.filter(i => i.status === "completed").length,
  }), [interviews]);

  const TABS: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "needs_feedback", label: "Needs Feedback", count: counts.needsFeedback },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "all", label: "All", count: interviews.length },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#17170F", margin: 0 }}>Interviews</h1>
            <p style={{ fontSize: 12.5, color: "rgba(23,23,15,0.4)", margin: "3px 0 0" }}>
              {teamLoading ? "Loading…" : `${counts.upcoming} upcoming · ${counts.needsFeedback} need feedback`}
            </p>
          </div>
          <button onClick={load} style={{ padding: "7px", borderRadius: 8, border: "1px solid rgba(23,23,15,0.07)", background: "rgba(23,23,15,0.03)", color: "rgba(23,23,15,0.4)", cursor: "pointer" }}>
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {counts.needsFeedback > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12 }}>
            <AlertTriangle style={{ width: 15, height: 15, color: "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: "#991b1b", fontWeight: 600 }}>
              {counts.needsFeedback} completed interview{counts.needsFeedback === 1 ? "" : "s"} still need{counts.needsFeedback === 1 ? "s" : ""} recruiter-confirmed feedback.
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "none",
                background: tab === t.key ? "rgba(23,23,15,0.12)" : "rgba(23,23,15,0.04)",
                color: tab === t.key ? "#17170F" : "rgba(23,23,15,0.4)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, minWidth: 16, padding: "0 4px", borderRadius: 20,
                  background: t.key === "needs_feedback" ? "#ef4444" : "rgba(23,23,15,0.15)",
                  color: t.key === "needs_feedback" ? "#FAFAF8" : "#17170F",
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading || teamLoading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200 }}>
            <Loader2 style={{ width: 24, height: 24, color: "#22315C", animation: "spin 1s linear infinite" }} />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.5)", marginBottom: 16 }}>Unable to load interviews.</p>
            <button onClick={load} style={{ padding: "9px 18px", background: "rgba(23,23,15,0.06)", border: "none", borderRadius: 10, color: "#17170F", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <ClipboardList style={{ width: 40, height: 40, margin: "0 auto 14px", opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(23,23,15,0.5)", marginBottom: 8 }}>
              Nothing here
            </div>
            <p style={{ fontSize: 13, color: "rgba(23,23,15,0.35)" }}>
              {tab === "upcoming" ? "No interviews scheduled. Schedule one from a candidate's pipeline card." : "No interviews match this filter."}
            </p>
          </div>
        ) : (
          <div style={{ background: "rgba(23,23,15,0.02)", border: "1px solid rgba(23,23,15,0.06)", borderRadius: 14, overflow: "hidden" }}>
            {filtered.map(i => (
              <InterviewRow key={i.interview_id} item={i} onClick={() => navigate(`/candidates/${i.candidate.id}`)} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}