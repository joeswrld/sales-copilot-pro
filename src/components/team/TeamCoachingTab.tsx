import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Send, ArrowLeft, Sparkles, Clock,
  TrendingUp, AlertTriangle, ChevronRight
} from "lucide-react";
import { useCoaching } from "@/hooks/useCoaching";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

// Demo meetings for coaching (will be replaced with real data)
const demoMeetings = [
  { id: "demo-1", name: "Product Demo with Acme Corp", rep: "Sarah Johnson", avatar: "SJ", score: 9.2, date: "2026-03-08", status: "reviewed" },
  { id: "demo-2", name: "Intro Call – TechNova", rep: "Daniel Rivera", avatar: "DR", score: 6.7, date: "2026-03-07", status: "needs-review" },
  { id: "demo-3", name: "QBR – Enterprise Solutions", rep: "Michael Torres", avatar: "MT", score: 8.5, date: "2026-03-08", status: "reviewed" },
  { id: "demo-4", name: "Qualification – NovaTech", rep: "James Chen", avatar: "JC", score: 7.5, date: "2026-03-08", status: "needs-review" },
  { id: "demo-5", name: "Product Demo – HealthTech Pro", rep: "Rachel Adams", avatar: "RA", score: 8.3, date: "2026-03-08", status: "reviewed" },
  { id: "demo-6", name: "Intro Call – ScaleUp AI", rep: "David Kim", avatar: "DK", score: 6.8, date: "2026-03-07", status: "needs-review" },
];

const aiSuggestions: Record<string, string[]> = {
  "demo-1": [
    "Excellent discovery phase — Sarah asked 7 targeted questions before presenting.",
    "Strong close with clear next steps and timeline commitment.",
  ],
  "demo-2": [
    "Daniel spoke 68% of the time. Coach him to stay below 50%.",
    "No discovery questions before jumping into the demo.",
    "Prospect showed interest in pricing but Daniel changed the subject.",
  ],
  "demo-3": [
    "Michael covered all key accounts but missed an expansion signal at 12:34.",
    "Good pacing and structure overall.",
  ],
  "demo-4": [
    "Budget qualification was skipped entirely.",
    "Good energy but questions were too generic — needs BANT framework coaching.",
  ],
  "demo-5": [
    "Well-structured demo with excellent objection handling at 8:45.",
    "Could improve closing — no firm next step was set.",
  ],
  "demo-6": [
    "Rep spoke 65% of the time — prospect barely engaged.",
    "Rushed through features without confirming pain points.",
  ],
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-emerald-500/10 text-emerald-400" : score >= 7 ? "bg-amber-500/10 text-amber-400" : "bg-destructive/10 text-destructive";
  return <Badge className={`${color} text-xs font-bold`}>{score.toFixed(1)}</Badge>;
}

export default function TeamCoachingTab() {
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);

  if (selectedMeeting) {
    const meeting = demoMeetings.find(m => m.id === selectedMeeting);
    if (!meeting) return null;
    return (
      <MeetingCoachingView
        meeting={meeting}
        onBack={() => setSelectedMeeting(null)}
      />
    );
  }

  const needsReview = demoMeetings.filter(m => m.status === "needs-review");
  const reviewed = demoMeetings.filter(m => m.status === "reviewed");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-display">Meeting Coaching</h2>
        <p className="text-xs text-muted-foreground">Review meetings, leave feedback, and help your team improve.</p>
      </div>

      {/* Needs Review */}
      {needsReview.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Needs Review ({needsReview.length})
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {needsReview.map(m => (
              <MeetingCard key={m.id} meeting={m} onClick={() => setSelectedMeeting(m.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Recently Reviewed</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {reviewed.map(m => (
              <MeetingCard key={m.id} meeting={m} onClick={() => setSelectedMeeting(m.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, onClick }: { meeting: typeof demoMeetings[0]; onClick: () => void }) {
  return (
    <Card
      className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{meeting.avatar}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{meeting.name}</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meeting.rep}</p>
            <div className="flex items-center gap-3 mt-2">
              <ScoreBadge score={meeting.score} />
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(meeting.date), "MMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCoachingView({ meeting, onBack }: {
  meeting: typeof demoMeetings[0];
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { comments, commentsLoading, addComment } = useCoaching(meeting.id);
  const [newComment, setNewComment] = useState("");
  const suggestions = aiSuggestions[meeting.id] ?? [];

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ text: newComment.trim() });
    setNewComment("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold font-display truncate">{meeting.name}</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">{meeting.rep}</span>
            <ScoreBadge score={meeting.score} />
            <span className="text-xs text-muted-foreground">{format(new Date(meeting.date), "MMM d, yyyy")}</span>
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

              {/* Comment Input */}
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

        {/* AI Suggestions Sidebar */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI Coaching Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestions.map((s, i) => {
                const isPositive = s.toLowerCase().includes("excellent") || s.toLowerCase().includes("strong") || s.toLowerCase().includes("good");
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

          {/* Meeting Stats */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Meeting Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Score</span>
                <span className="font-medium">{meeting.score}/10</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rep</span>
                <span className="font-medium">{meeting.rep}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(new Date(meeting.date), "MMM d, yyyy")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={meeting.status === "reviewed" ? "default" : "secondary"} className="text-xs capitalize">
                  {meeting.status.replace("-", " ")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
