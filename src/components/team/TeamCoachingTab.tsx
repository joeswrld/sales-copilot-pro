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

export default function TeamCoachingTab() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [view, setView] = useState<"meetings" | "clips">("meetings");

  const { teamCalls, teamCallsLoading } = useTeamCalls();
  const { members } = useTeam();

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

  // Unique members
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
        </button>
      </div>

      {view === "clips" && <CoachingClipsTab />}

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
                <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !dateFrom && "text-muted-foreground")}>
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
                <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !dateTo && "text-muted-foreground")}>
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

/* Keep CallCard + MeetingCoachingView unchanged from your original code */

function CallCard({ call, onClick }: { call: TeamCall; onClick: () => void }) {
  const repName = call.profile?.full_name || call.profile?.email || "Unknown Rep";
  const initials = getInitials(call.profile?.full_name);

  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group" onClick={onClick}>
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

/* MeetingCoachingView remains unchanged */