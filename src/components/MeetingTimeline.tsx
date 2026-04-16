/**
 * MeetingTimeline.tsx
 *
 * Smart meeting timeline panel for the Live Call page.
 * Shows:
 *  - Upcoming meetings with countdown timers
 *  - "Starting soon" highlight with context (sentiment, objections)
 *  - Reschedule history ("Rescheduled from X")
 *  - Inline reschedule + cancel actions
 *  - Reminder status badges
 */

import { useState, useEffect } from "react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import {
  Calendar, Clock, Link2, Copy, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, X, Play,
  BellRing, Check, BarChart2, Edit2, Loader2,
  CalendarClock, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScheduledMeetings, ScheduledMeeting } from "@/hooks/useScheduledMeetings";
import { toast } from "sonner";

// ─── Types / config ───────────────────────────────────────────────────────────

const MEETING_TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  discovery:   { emoji: "🔍", label: "Discovery",   color: "text-blue-400"   },
  demo:        { emoji: "🎯", label: "Demo",         color: "text-purple-400" },
  follow_up:   { emoji: "📞", label: "Follow-up",   color: "text-cyan-400"   },
  negotiation: { emoji: "🤝", label: "Negotiation", color: "text-yellow-400" },
  onboarding:  { emoji: "🚀", label: "Onboarding",  color: "text-green-400"  },
  other:       { emoji: "📋", label: "Other",        color: "text-muted-foreground" },
};

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(scheduledTime: string) {
  const [minutes, setMinutes] = useState(() =>
    Math.round((parseISO(scheduledTime).getTime() - Date.now()) / 60_000)
  );

  useEffect(() => {
    const id = setInterval(() => {
      setMinutes(Math.round((parseISO(scheduledTime).getTime() - Date.now()) / 60_000));
    }, 15_000);
    return () => clearInterval(id);
  }, [scheduledTime]);

  return minutes;
}

// ─── Reminder status badges ───────────────────────────────────────────────────

function ReminderBadges({ meeting }: { meeting: ScheduledMeeting }) {
  const badges = [
    { sent: meeting.reminder_60min_sent, label: "60m" },
    { sent: meeting.reminder_10min_sent, label: "10m" },
    { sent: meeting.reminder_start_sent, label: "Start" },
  ];

  return (
    <div className="flex items-center gap-1">
      {badges.map(({ sent, label }) => (
        <span
          key={label}
          title={`${label} reminder ${sent ? "sent" : "pending"}`}
          className={cn(
            "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border leading-none",
            sent
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : "bg-muted/40 border-border text-muted-foreground/50"
          )}
        >
          {sent ? <span className="flex items-center gap-0.5"><Check className="w-2 h-2" />{label}</span> : label}
        </span>
      ))}
    </div>
  );
}

// ─── Single meeting card ──────────────────────────────────────────────────────

function MeetingCard({
  meeting,
  onReschedule,
  onCancel,
  onCopyLink,
}: {
  meeting: ScheduledMeeting;
  onReschedule: (m: ScheduledMeeting) => void;
  onCancel: (id: string) => void;
  onCopyLink: (link: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const minutesUntil = useCountdown(meeting.scheduled_time);
  const meta = MEETING_TYPE_META[meeting.meeting_type || "other"] || MEETING_TYPE_META.other;

  const isStartingSoon = minutesUntil >= -5 && minutesUntil <= 15;
  const isPast         = minutesUntil < -10;

  const countdownLabel =
    minutesUntil <= 0
      ? minutesUntil >= -5 ? "Starting now!" : `${Math.abs(minutesUntil)}m overdue`
      : minutesUntil < 60
      ? `${minutesUntil}m`
      : `${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        isStartingSoon
          ? "border-green-500/30 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.08)]"
          : isPast
          ? "border-orange-500/20 bg-orange-500/5"
          : "border-border bg-secondary/20"
      )}
    >
      {/* ── Header row ── */}
      <div className="p-3 flex items-start gap-2.5">
        {/* Type emoji */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base bg-background/40 border border-border/60 mt-0.5">
          {meta.emoji}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight truncate pr-1">{meeting.title}</p>
            {/* Countdown pill */}
            <span
              className={cn(
                "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 leading-tight",
                isStartingSoon
                  ? "bg-green-500/15 text-green-400 border border-green-500/25"
                  : isPast
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {countdownLabel}
            </span>
          </div>

          {/* Date + type */}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{format(parseISO(meeting.scheduled_time), "MMM d · h:mm a")}</span>
            <span className={cn("font-medium", meta.color)}>{meta.label}</span>
          </div>

          {/* Rescheduled badge */}
          {meeting.rescheduled_from && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-yellow-500/80">
              <RefreshCw className="w-2.5 h-2.5" />
              <span>
                Rescheduled {meeting.reschedule_count}× · was{" "}
                {format(parseISO(meeting.rescheduled_from), "MMM d, h:mm a")}
              </span>
            </div>
          )}

          {/* Context chips (the Fixsense differentiator) */}
          {isStartingSoon && (meeting.last_sentiment != null || meeting.last_objection_summary) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {meeting.last_sentiment != null && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-md border font-medium",
                  meeting.last_sentiment >= 70
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : meeting.last_sentiment >= 40
                    ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                )}>
                  <BarChart2 className="w-2.5 h-2.5 inline mr-0.5" />
                  Sentiment {meeting.last_sentiment}%
                </span>
              )}
              {meeting.last_objection_summary && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-orange-500/10 border-orange-500/20 text-orange-400 font-medium max-w-[180px] truncate">
                  <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />
                  {meeting.last_objection_summary}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/50 pt-2.5">
          {/* Notes */}
          {meeting.notes && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              <Info className="w-3 h-3 inline mr-1 text-muted-foreground/60" />
              {meeting.notes}
            </p>
          )}

          {/* Reminder status */}
          <div className="flex items-center gap-1.5">
            <BellRing className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[11px] text-muted-foreground">Reminders:</span>
            <ReminderBadges meeting={meeting} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {meeting.meeting_link && (
              <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="h-7 text-xs gap-1.5">
                  <Play className="w-3 h-3" />Start Now
                </Button>
              </a>
            )}
            {meeting.meeting_link && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => onCopyLink(meeting.meeting_link!)}
              >
                <Copy className="w-3 h-3" />Copy Link
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => onReschedule(meeting)}
            >
              <Edit2 className="w-3 h-3" />Reschedule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onCancel(meeting.id)}
            >
              <X className="w-3 h-3" />Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reschedule modal ─────────────────────────────────────────────────────────

function RescheduleModal({
  meeting,
  onSave,
  onClose,
  isLoading,
}: {
  meeting: ScheduledMeeting;
  onSave: (newTime: string) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const current = parseISO(meeting.scheduled_time);
  const [date, setDate] = useState(format(current, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(current, "HH:mm"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1117 0%, #141824 100%)" }}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CalendarClock className="w-4 h-4 text-indigo-400" />
              <p className="font-semibold text-sm">Reschedule Meeting</p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/70">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{meeting.title}</span>
            {meeting.rescheduled_from && (
              <span className="ml-1 text-yellow-500/70">
                · Rescheduled {meeting.reschedule_count}× before
              </span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">New Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/8 outline-none"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">New Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/8 outline-none"
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>

          <button
            onClick={() => {
              if (!date || !time) { toast.error("Pick a date and time"); return; }
              onSave(new Date(`${date}T${time}`).toISOString());
            }}
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isLoading ? "Rescheduling…" : "Confirm Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface MeetingTimelineProps {
  /** Show a compact 1-section version for embedding in LiveCall sidebar */
  compact?: boolean;
  /** Max items to show in compact mode */
  maxItems?: number;
}

export default function MeetingTimeline({ compact = false, maxItems = 4 }: MeetingTimelineProps) {
  const { upcoming, isLoading, cancel, reschedule, copyLink, startingSoon } = useScheduledMeetings();
  const [reschedulingMeeting, setReschedulingMeeting] = useState<ScheduledMeeting | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? upcoming : upcoming.slice(0, compact ? maxItems : upcoming.length);

  const handleCancel = (id: string) => {
    if (!confirm("Cancel this meeting?")) return;
    cancel.mutate(id);
  };

  const handleReschedule = async (newTime: string) => {
    if (!reschedulingMeeting) return;
    await reschedule.mutateAsync({ meetingId: reschedulingMeeting.id, newTime });
    setReschedulingMeeting(null);
  };

  return (
    <>
      {reschedulingMeeting && (
        <RescheduleModal
          meeting={reschedulingMeeting}
          onSave={handleReschedule}
          onClose={() => setReschedulingMeeting(null)}
          isLoading={reschedule.isPending}
        />
      )}

      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Upcoming Meetings
            {startingSoon.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/20 animate-pulse">
                {startingSoon.length} starting soon
              </span>
            )}
          </h2>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        {/* Empty state */}
        {!isLoading && upcoming.length === 0 && (
          <div className="text-center py-6">
            <Calendar className="w-6 h-6 text-muted-foreground/25 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground/50">No upcoming meetings</p>
          </div>
        )}

        {/* Meeting cards */}
        <div className="space-y-2">
          {displayed.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onReschedule={setReschedulingMeeting}
              onCancel={handleCancel}
              onCopyLink={copyLink}
            />
          ))}
        </div>

        {/* Show more toggle */}
        {upcoming.length > (compact ? maxItems : 999) && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 flex items-center justify-center gap-1"
          >
            {showAll ? (
              <><ChevronUp className="w-3 h-3" />Show less</>
            ) : (
              <><ChevronDown className="w-3 h-3" />Show {upcoming.length - (compact ? maxItems : 0)} more</>
            )}
          </button>
        )}
      </div>
    </>
  );
}