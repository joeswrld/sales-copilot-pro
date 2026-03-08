import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, TrendingUp, TrendingDown, Target, Trophy, Medal, Award,
  Lightbulb, AlertTriangle, Sparkles, Mic, CheckCircle2
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// --- PipelineFlow Demo Data ---
const summaryCards = [
  { label: "Team Meetings", value: "184", change: "+14%", up: true, icon: Users },
  { label: "Avg Meeting Score", value: "7.6", change: "+0.3", up: true, icon: Target },
  { label: "Action Items", value: "312", change: "+22%", up: true, icon: CheckCircle2 },
  { label: "Conversion Signals", value: "52", change: "+8%", up: true, icon: TrendingUp },
  { label: "Avg Talk Ratio", value: "58%", change: "-2%", up: true, icon: Mic },
];

const weeklyTrend = [
  { week: "W1", score: 7.2, meetings: 42 },
  { week: "W2", score: 7.4, meetings: 46 },
  { week: "W3", score: 7.6, meetings: 48 },
  { week: "W4", score: 7.9, meetings: 48 },
];

const coachingInsights = [
  { type: "warning", text: "Your team speaks 58% of the time during meetings. High-performing teams typically stay below 50%. Coach reps to ask more discovery questions." },
  { type: "warning", text: "Only 42% of meetings end with a clearly defined next step. Mandate a 'next steps' checklist before ending every call." },
  { type: "tip", text: "Prospects ask pricing questions in 37% of calls, but reps only address it confidently in 18% of cases. Schedule a pricing objection session." },
  { type: "success", text: "Sarah Johnson improved her meeting score by 15% this quarter. Her discovery technique could be a model for the team." },
  { type: "warning", text: "3 team members have talk ratios above 60%. Schedule immediate 1:1 coaching sessions focused on active listening." },
  { type: "tip", text: "Follow-up completion is 71% team-wide but top performers are at 90%+. Share their follow-up templates." },
];

const topPerformers = [
  { name: "Sarah Johnson", avatar: "SJ", score: 8.9, label: "Top Performer" },
  { name: "Michael Torres", avatar: "MT", score: 8.2, label: "Strong Performer" },
  { name: "Lisa Park", avatar: "LP", score: 8.0, label: "Improving Performer" },
];

const recentMeetings = [
  { name: "Sarah Johnson", avatar: "SJ", title: "Product Demo with Acme Corp", score: 9.2, summary: "Excellent discovery questions and strong close.", date: "2026-03-08" },
  { name: "Michael Torres", avatar: "MT", title: "QBR – Enterprise Solutions", score: 8.5, summary: "Thorough review. Missed one expansion signal.", date: "2026-03-08" },
  { name: "James Chen", avatar: "JC", title: "Qualification – NovaTech", score: 7.5, summary: "Good energy. Missed budget qualification.", date: "2026-03-08" },
  { name: "Rachel Adams", avatar: "RA", title: "Product Demo – HealthTech Pro", score: 8.3, summary: "Well-structured demo. Great objection handling.", date: "2026-03-08" },
  { name: "Daniel Rivera", avatar: "DR", title: "Intro Call – TechNova", score: 6.7, summary: "Rep spoke 68% of the time. Rushed the demo.", date: "2026-03-07" },
  { name: "David Kim", avatar: "DK", title: "Intro Call – ScaleUp AI", score: 6.8, summary: "High energy but prospect barely spoke.", date: "2026-03-07" },
];

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 8 ? "text-emerald-400" : score >= 7 ? "text-amber-400" : "text-red-400";
  return <span className={`font-bold ${color}`}>{score.toFixed(1)}</span>;
}

export default function TeamOverviewTab() {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <card.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium ${card.up ? "text-emerald-400" : "text-red-400"}`}>
                  {card.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {card.change}
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-display">{card.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Chart */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Weekly Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
                  <XAxis dataKey="week" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                  <YAxis domain={[6, 9]} tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(222, 44%, 9%)", border: "1px solid hsl(222, 30%, 18%)", borderRadius: 8, color: "hsl(210, 40%, 96%)" }} />
                  <Bar dataKey="score" name="Avg Score" fill="hsl(174, 72%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Meetings */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Recent Team Meetings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMeetings.map((entry, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                  <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{entry.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreIndicator score={entry.score} />
                        <span className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-primary/80 font-medium mt-0.5">{entry.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.summary}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Leaderboard */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topPerformers.map((m, i) => {
                const icons = [Trophy, Medal, Award];
                const colors = ["text-amber-400", "text-zinc-400", "text-orange-400"];
                const Icon = icons[i];
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary">
                      <Icon className={`w-4 h-4 ${colors[i]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                    </div>
                    <ScoreIndicator score={m.score} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Coaching Insights */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI Coaching Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[280px] lg:h-[360px] pr-2">
                <div className="space-y-3">
                  {coachingInsights.map((insight, i) => {
                    const iconMap = { warning: AlertTriangle, tip: Lightbulb, success: CheckCircle2 };
                    const colorMap = { warning: "text-amber-400 bg-amber-400/10", tip: "text-primary bg-primary/10", success: "text-emerald-400 bg-emerald-400/10" };
                    const Icon = iconMap[insight.type as keyof typeof iconMap];
                    const colorClass = colorMap[insight.type as keyof typeof colorMap];
                    return (
                      <div key={i} className="p-3 rounded-lg bg-secondary/20">
                        <div className="flex items-start gap-2">
                          <div className={`p-1.5 rounded-md shrink-0 ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{insight.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
