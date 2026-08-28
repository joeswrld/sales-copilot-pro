/**
 * MeetingCard — rich, interactive meeting recap rendered inline in the
 * Messages feed. Replaces the old plain-text "call_recap" system message
 * with a card showing the recording, speaker transcript, AI summary,
 * action items, decisions, follow-up suggestions, and quick links to the
 * full Call Details page or the related Deal.
 *
 * This component is purely a renderer over `msg.metadata` — the recap
 * payload is produced server-side by the generate-call-summary edge
 * function (see supabase/functions/generate-call-summary/index.ts), so no
 * extra fetch is needed on mount. It only reaches out to the network if the
 * viewer expands the transcript further than the embedded preview.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play, Pause, FileText, CheckCircle2, Circle, Sparkles,
  Gavel, ListChecks, ArrowRight, ExternalLink, Building2,
  ChevronDown, ChevronUp, Clock, Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface MeetingCardMeta {
  call_id: string;
  deal_id?: string | null;
  call_name?: string | null;
  platform?: string | null;
  duration_minutes?: number | null;
  recording_url?: string | null;
  summary?: string | null;
  meeting_score?: number | null;
  action_items?: string[];
  key_decisions?: string[];
  next_steps?: string[];
  buying_signals?: string[];
  transcript_preview?: { speaker: string; text: string; timestamp?: string }[];
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return "rgba(23,23,15,.35)";
  if (score >= 7.5) return "#22c55e";
  if (score >= 5) return "#fbbf24";
  return "#ef4444";
}

export default function MeetingCard({ meta, isOwn }: { meta: MeetingCardMeta; isOwn: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fullTranscript, setFullTranscript] = useState<{ speaker: string; text: string; timestamp?: string }[] | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const hasRecording = !!meta.recording_url;
  const preview = meta.transcript_preview || [];
  const actionItems = meta.action_items || [];
  const decisions = meta.key_decisions || [];
  const nextSteps = meta.next_steps || [];

  const loadFullTranscript = async () => {
    if (fullTranscript || loadingTranscript) return;
    setLoadingTranscript(true);
    try {
      const { data } = await (supabase as any)
        .from("call_summaries")
        .select("transcript")
        .eq("call_id", meta.call_id)
        .maybeSingle();
      setFullTranscript((data?.transcript as any[]) || preview);
    } catch {
      setFullTranscript(preview);
    } finally {
      setLoadingTranscript(false);
    }
  };

  const onExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadFullTranscript();
  };

  const transcriptToShow = fullTranscript ?? preview;

  return (
    <div
      style={{
        width: "min(420px, 100%)",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(34,49,92,.18)",
        background: "linear-gradient(180deg, rgba(34,49,92,.05), #FFFFFF 60%)",
        boxShadow: "0 4px 16px -6px rgba(20,20,15,.12), 0 0 0 1px rgba(20,20,15,.02)",
        fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", display: "flex", alignItems: "flex-start", gap: 10, borderBottom: "1px solid rgba(23,23,15,.06)" }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(34,49,92,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Video size={15} color="#22315C" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(23,23,15,.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.call_name || "Meeting recap"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            {meta.duration_minutes != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "rgba(23,23,15,.4)" }}>
                <Clock size={10} /> {meta.duration_minutes}m
              </span>
            )}
            {meta.meeting_score != null && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: scoreColor(meta.meeting_score) }}>
                Score {meta.meeting_score}/10
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {meta.summary && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <Sparkles size={11} color="#a78bfa" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: .4 }}>AI Summary</span>
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(23,23,15,.82)", margin: 0 }}>{meta.summary}</p>
        </div>
      )}

      {/* Recording */}
      {hasRecording && (
        <div style={{ padding: "10px 14px 0" }}>
          <div
            onClick={() => setPlaying(p => !p)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "7px 10px", borderRadius: 10, background: "rgba(23,23,15,.05)", border: "1px solid rgba(23,23,15,.08)" }}
          >
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#22315C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {playing ? <Pause size={11} color="#FAFAF8" /> : <Play size={11} color="#FAFAF8" style={{ marginLeft: 1 }} />}
            </div>
            <span style={{ fontSize: 12, color: "rgba(23,23,15,.75)" }}>{playing ? "Playing recording…" : "Play recording"}</span>
          </div>
          {playing && (
            <video
              src={meta.recording_url!}
              controls
              autoPlay
              style={{ width: "100%", borderRadius: 10, marginTop: 8, maxHeight: 220, background: "#000" }}
              onEnded={() => setPlaying(false)}
            />
          )}
        </div>
      )}

      {/* Action items */}
      {actionItems.length > 0 && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <ListChecks size={11} color="#22315C" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#22315C", textTransform: "uppercase", letterSpacing: .4 }}>Action Items</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {actionItems.slice(0, expanded ? undefined : 3).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "rgba(23,23,15,.78)" }}>
                <Circle size={11} style={{ marginTop: 2, flexShrink: 0, opacity: .4 }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && expanded && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <Gavel size={11} color="#fbbf24" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: .4 }}>Decisions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "rgba(23,23,15,.78)" }}>
                <CheckCircle2 size={11} style={{ marginTop: 2, flexShrink: 0, color: "#fbbf24" }} />
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up suggestions */}
      {nextSteps.length > 0 && expanded && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <ArrowRight size={11} color="#60a5fa" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: .4 }}>Follow-up Suggestions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nextSteps.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "rgba(23,23,15,.78)" }}>
                <ArrowRight size={11} style={{ marginTop: 2, flexShrink: 0, color: "#60a5fa" }} />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {expanded && transcriptToShow.length > 0 && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <FileText size={11} color="rgba(23,23,15,.5)" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(23,23,15,.5)", textTransform: "uppercase", letterSpacing: .4 }}>
              Transcript {loadingTranscript && "· loading…"}
            </span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
            {transcriptToShow.map((line, i) => (
              <div key={i} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                <span style={{ fontWeight: 700, color: "#a78bfa" }}>{line.speaker}: </span>
                <span style={{ color: "rgba(23,23,15,.68)" }}>{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expand toggle */}
      {(actionItems.length > 3 || decisions.length > 0 || nextSteps.length > 0 || preview.length > 0) && (
        <button
          onClick={onExpand}
          style={{
            width: "100%", marginTop: 10, padding: "7px 0", background: "transparent", border: "none",
            borderTop: "1px solid rgba(23,23,15,.06)", color: "rgba(23,23,15,.45)", fontSize: 11.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer",
          }}
        >
          {expanded ? <>Show less <ChevronUp size={12} /></> : <>Show details <ChevronDown size={12} /></>}
        </button>
      )}

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px 12px" }}>
        <button
          onClick={() => navigate(`/calls/${meta.call_id}`)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px 0", borderRadius: 9, background: "rgba(34,49,92,.12)", border: "1px solid rgba(34,49,92,.25)",
            color: "#22315C", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          <ExternalLink size={12} /> Call Details
        </button>
        {meta.deal_id && (
          <button
            onClick={() => navigate(`/deals/${meta.deal_id}`)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "7px 0", borderRadius: 9, background: "rgba(167,139,250,.12)", border: "1px solid rgba(167,139,250,.25)",
              color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Building2 size={12} /> View Deal
          </button>
        )}
      </div>
    </div>
  );
}