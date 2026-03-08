import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Send, ArrowLeft, Sparkles, Clock,
  TrendingUp, AlertTriangle, ChevronRight, Phone
} from "lucide-react";
import { useCoaching, useTeamCalls, type TeamCall } from "@/hooks/useCoaching";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

function ScoreBadge({ score }: { score: number }) {
  const normalized = Math.min(score / 10, 10);
  const color = normalized >= 8 ? "bg-emerald-500/10 text-emerald-400" : normalized >= 6 ? "bg-amber-500/10 text-amber-400" : "bg-destructive/10 text-destructive";
  return <Badge className={`${color} text-xs font-bold`}>{normalized.toFixed(1)}</Badge>;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function TeamCoachingTab() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const { teamCalls, teamCallsLoading } = useTeamCalls();

  if (teamCallsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedCall = teamCalls.find(c => c.id === selectedCallId);

  if (selectedCall) {
    return (
      <MeetingCoachingView
        call={selectedCall}
        onBack={() => setSelectedCallId(null)}
      />
    );
  }

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

  // Split into calls with no comments (needs review) vs those with comments
  const needsReview = teamCalls.filter(c => c.comment_count === 0);
  const reviewed = teamCalls.filter(c => c.comment_count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display">Meeting Coaching</h2>
        <p className="text-xs text-muted-foreground">Review meetings, leave feedback, and help your team improve.</p>
      </div>

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
          <h3 className="text-sm font-semibold text-muted-foreground">Reviewed ({reviewed.length})</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {reviewed.slice(0, 10).map(c => (
              <CallCard key={c.id} call={c} onClick={() => setSelectedCallId(c.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CallCard({ call, onClick }: { call: TeamCall; onClick: () => void }) {
  const repName = call.profile?.full_name || call.profile?.email || "Unknown Rep";
  const initials = getInitials(call.profile?.full_name);

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials}</AvatarFallback>
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

function MeetingCoachingView({ call, onBack }: { call: TeamCall; onBack: () => void }) {
  const { user } = useAuth();
  const { comments, commentsLoading, addComment } = useCoaching(call.id);
  const [newComment, setNewComment] = useState("");

  const repName = call.profile?.full_name || call.profile?.email || "Unknown";

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ text: newComment.trim() });
    setNewComment("");
  };

  // Build AI suggestions from call summary data
  const suggestions: string[] = [];
  if (call.summary?.summary) suggestions.push(call.summary.summary);
  if (call.summary?.next_steps?.length) {
    suggestions.push(`Next steps: ${call.summary.next_steps.join(", ")}`);
  }
  if (call.summary?.key_decisions?.length) {
    suggestions.push(`Key decisions: ${call.summary.key_decisions.join(", ")}`);
  }
  if (call.objections_count && call.objections_count > 0) {
    suggestions.push(`${call.objections_count} objection(s) were detected during this call.`);
  }
  if (call.sentiment_score != null) {
    const s = call.sentiment_score;
    if (s < 50) suggestions.push("Low sentiment score — review call for potential issues.");
    else if (s >= 80) suggestions.push("Strong positive sentiment throughout the conversation.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold font-display truncate">{call.name}</h2>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{repName}</span>
            {call.sentiment_score != null && <ScoreBadge score={call.sentiment_score} />}
            <span className="text-xs text-muted-foreground">{format(new Date(call.date), "MMM d, yyyy")}</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Discussion Thread */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Coaching Discussion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="max-h-[400px]">
                {commentsLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                ) : comments.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No comments yet. Be the first to leave feedback.</p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-2">
                    {comments.map(c => {
                      const name = c.profile?.full_name || c.profile?.email || "Unknown";
                      const initial = name[0]?.toUpperCase() || "?";
                      const isMe = c.user_id === user?.id;
                      return (
                        <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-secondary/20">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">{initial}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium">{name}</p>
                              {isMe && <Badge variant="secondary" className="text-[9px] h-4">You</Badge>}
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(c.created_at), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{c.comment_text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="space-y-2 pt-2 border-t border-border">
                <Textarea
                  placeholder="Leave coaching feedback on this meeting..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!newComment.trim() || addComment.isPending}
                    className="gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Post Feedback
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {suggestions.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestions.map((s, i) => {
                  const isPositive = s.toLowerCase().includes("strong") || s.toLowerCase().includes("positive") || s.toLowerCase().includes("excellent");
                  return (
                    <div key={i} className="p-3 rounded-lg bg-secondary/20">
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded-md shrink-0 ${isPositive ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}>
                          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{s}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Meeting Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rep</span>
                <span className="font-medium">{repName}</span>
              </div>
              {call.sentiment_score != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sentiment</span>
                  <span className="font-medium">{call.sentiment_score}/100</span>
                </div>
              )}
              {call.duration_minutes != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{call.duration_minutes} min</span>
                </div>
              )}
              {call.objections_count != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Objections</span>
                  <span className="font-medium">{call.objections_count}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(new Date(call.date), "MMM d, yyyy")}</span>
              </div>
              {call.status && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="text-xs capitalize">{call.status}</Badge>
                </div>
              )}
              {call.summary?.topics?.length ? (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1.5">Topics</p>
                  <div className="flex flex-wrap gap-1">
                    {call.summary.topics.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
