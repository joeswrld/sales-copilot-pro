/**
 * TeamCoachingTab.tsx — with plan enforcement
 * Coaching Clips tab is gated behind Growth plan.
 * Add the gate around the CoachingClipsTab render.
 */

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, Send, ArrowLeft, Sparkles, Clock,
  TrendingUp, AlertTriangle, ChevronRight, Phone, CalendarIcon, Filter
} from "lucide-react";
import { useCoaching, useTeamCalls, type TeamCall } from "@/hooks/useCoaching";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/contexts/AuthContext";
import CoachingClipsTab from "@/components/coaching/CoachingClipsTab";
import { LockedCard } from "@/components/plan/PlanGate";
import { usePlanEnforcement } from "@/contexts/PlanEnforcementContext";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

function ScoreBadge({ score }: { score: number }) {
  const normalized = Math.min(score / 10, 10);
  const color =
    normalized >= 8
      ? "bg-emerald-500/10 text-emerald-400"
      : normalized >= 6
      ? "bg-amber-500/10 text-amber-400"
      : "bg-destructive/10 text-destructive";
  return <Badge className={`${color} text-xs font-bold`}>{normalized.toFixed(1)}</Badge>;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function CallCard({ call, onClick }: { call: TeamCall; onClick: () => void }) {
  const repName = call.profile?.full_name || call.profile?.email || "Unknown Rep";
  const initials = getInitials(call.profile?.full_name);

  return (
    <Card
      className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{call.name}</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{repName}</p>
            <div className="flex items-center gap-3 mt-2">
              {call.sentiment_score != null && <ScoreBadge score={call.sentiment_score} />}
              {call.duration_minutes != null && (
                <span className="text-[10px] text-muted-foreground">{call.duration_minutes}min</span>
              )}
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(call.date), "MMM d, yyyy")}
              </span>
              {call.comment_count > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  {call.comment_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCoachingView({
  call,
  onBack,
}: {
  call: TeamCall;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { comments, commentsLoading, addComment } = useCoaching(call.id);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const repName = call.profile?.full_name || call.profile?.email || "Unknown Rep";
  const initials = getInitials(call.profile?.full_name);

  const handleSubmit = async () => {
    if (!commentText.trim()) return;
    await addComment.mutateAsync({
      text: commentText.trim(),
      parentId: replyTo ?? undefined,
    });
    setCommentText("");
    setReplyTo(null);
  };

  const topLevel = comments.filter(c => !c.parent_id);
  const replies = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-base font-bold font-display">{call.name}</h2>
            <p className="text-xs text-muted-foreground">
              {repName} · {format(new Date(call.date), "MMM d, yyyy")}
              {call.duration_minutes != null && ` · ${call.duration_minutes}min`}
            </p>
          </div>
        </div>
        {call.sentiment_score != null && (
          <div className="ml-auto">
            <ScoreBadge score={call.sentiment_score} />
          </div>
        )}
      </div>

      {call.summary?.summary && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {call.summary.summary}
            </p>
            {call.summary.next_steps && call.summary.next_steps.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-foreground mb-1">Next Steps</p>
                <ul className="space-y-1">
                  {call.summary.next_steps.map((step, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">•</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Coaching Feedback
            {comments.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-auto">
                {comments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {replyTo && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                <span>Replying to comment</span>
                <button
                  className="ml-auto text-xs hover:text-foreground"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </button>
              </div>
            )}
            <Textarea
              placeholder={replyTo ? "Write a reply…" : "Leave coaching feedback for this call…"}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              className="min-h-[80px] text-sm resize-none"
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!commentText.trim() || addComment.isPending}
                className="gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {addComment.isPending ? "Sending…" : "Send Feedback"}
              </Button>
            </div>
          </div>

          {commentsLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : topLevel.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No feedback yet. Be the first to leave a comment.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4 pr-2">
                {topLevel.map(comment => {
                  const commentReplies = replies(comment.id);
                  const commenterName =
                    comment.profile?.full_name ||
                    comment.profile?.email ||
                    "Unknown";
                  const commenterInitials = getInitials(commenterName);
                  const isMe = comment.user_id === user?.id;

                  return (
                    <div key={comment.id} className="space-y-2">
                      <div className="flex gap-3">
                        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                          <AvatarFallback className="bg-secondary text-xs font-bold">
                            {commenterInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-xs font-semibold">
                              {isMe ? "You" : commenterName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(comment.created_at), "MMM d, h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80 leading-relaxed">
                            {comment.comment_text}
                          </p>
                          <button
                            className="text-[10px] text-muted-foreground hover:text-primary mt-1 transition-colors"
                            onClick={() => setReplyTo(comment.id)}
                          >
                            Reply
                          </button>
                        </div>
                      </div>

                      {commentReplies.length > 0 && (
                        <div className="ml-10 space-y-2 border-l-2 border-border pl-3">
                          {commentReplies.map(reply => {
                            const replyName =
                              reply.profile?.full_name ||
                              reply.profile?.email ||
                              "Unknown";
                            const replyInitials = getInitials(replyName);
                            const isMyReply = reply.user_id === user?.id;

                            return (
                              <div key={reply.id} className="flex gap-2">
                                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                                  <AvatarFallback className="bg-secondary text-[10px] font-bold">
                                    {replyInitials}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-2 mb-0.5">
                                    <span className="text-xs font-semibold">
                                      {isMyReply ? "You" : replyName}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(reply.created_at), "MMM d, h:mm a")}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground/80 leading-relaxed">
                                    {reply.comment_text}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeamCoachingTab() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [view, setView] = useState<"meetings" | "clips">("meetings");

  const { teamCalls, teamCallsLoading } = useTeamCalls();
  const { hasFeature } = usePlanEnforcement();

  // Filters
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const filteredCalls = useMemo(() => {
    return teamCalls.filter(c => {
      if (memberFilter !== "all" && c.user_id !== memberFilter) return false;
      const callDate = new Date(c.date);
      if (dateFrom && isBefore(callDate, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(callDate, endOfDay(dateTo))) return false;
      return true;
    });
  }, [teamCalls, memberFilter, dateFrom, dateTo]);

  if (teamCallsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedCall = filteredCalls.find(c => c.id === selectedCallId);

  if (selectedCall) {
    return (
      <MeetingCoachingView
        call={selectedCall}
        onBack={() => setSelectedCallId(null)}
      />
    );
  }

  const callMembers = Array.from(
    new Map(
      teamCalls.map(c => [
        c.user_id,
        { id: c.user_id, name: c.profile?.full_name || c.profile?.email || "Unknown" }
      ])
    ).values()
  );

  const hasFilters = memberFilter !== "all" || dateFrom || dateTo;

  if (teamCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Phone className="w-10 h-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold">No team meetings yet</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          When team members complete calls, they'll appear here for coaching review.
        </p>
      </div>
    );
  }

  const needsReview = filteredCalls.filter(c => c.comment_count === 0);
  const reviewed = filteredCalls.filter(c => c.comment_count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display">Meeting Coaching</h2>
        <p className="text-xs text-muted-foreground">
          Review meetings, leave feedback, and help your team improve.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-3 mb-6 border-b border-border">
        <button
          onClick={() => setView("meetings")}
          className={cn(
            "pb-2 text-sm font-medium",
            view === "meetings"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          )}
        >
          Meetings
        </button>

        <button
          onClick={() => setView("clips")}
          className={cn(
            "pb-2 text-sm font-medium",
            view === "clips"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground"
          )}
        >
          Clips Library
          {/* Show lock badge if not on Growth+ */}
          {!hasFeature("coaching") && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              padding: "1px 5px", borderRadius: 20,
              background: "rgba(14,245,212,.1)", color: "#0ef5d4",
              border: "1px solid rgba(14,245,212,.2)",
              marginLeft: 6,
            }}>
              Growth
            </span>
          )}
        </button>
      </div>

      {/* Coaching Clips — gated to Growth+ */}
      {view === "clips" && (
        hasFeature("coaching")
          ? <CoachingClipsTab />
          : (
            <div className="py-8">
              <LockedCard
                feature="coaching"
                description="Create shareable coaching clips from call transcripts. Tag best practices, objection handling moments, and use them to onboard and coach your team."
              />
            </div>
          )
      )}

      {view === "meetings" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />

            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {callMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-8 text-xs gap-1.5", !dateFrom && "text-muted-foreground")}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {dateFrom ? format(dateFrom, "MMM d") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-8 text-xs gap-1.5", !dateTo && "text-muted-foreground")}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {dateTo ? format(dateTo, "MMM d") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setMemberFilter("all");
                  setDateFrom(undefined);
                  setDateTo(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {filteredCalls.length} meeting{filteredCalls.length !== 1 ? "s" : ""}
            </span>
          </div>

          {filteredCalls.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No meetings match your filters.
            </div>
          ) : (
            <>
              {needsReview.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Needs Review ({needsReview.length})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {needsReview.slice(0, 10).map(c => (
                      <CallCard key={c.id} call={c} onClick={() => setSelectedCallId(c.id)} />
                    ))}
                  </div>
                </div>
              )}

              {reviewed.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Reviewed ({reviewed.length})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {reviewed.slice(0, 10).map(c => (
                      <CallCard key={c.id} call={c} onClick={() => setSelectedCallId(c.id)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}