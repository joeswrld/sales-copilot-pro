import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Users, TrendingUp, TrendingDown, Target, MessageSquare, ArrowUpRight,
  Trophy, Medal, Award, ChevronLeft, Lightbulb, AlertTriangle, Sparkles,
  Calendar, BarChart3, Mic, CheckCircle2, Clock
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar } from "recharts";

// --- Demo Data ---
const teamMembers = [
  {
    id: "1", name: "Sarah Lee", role: "Senior AE", avatar: "SL",
    meetings: 18, avgScore: 8.7, talkRatio: 42, followUps: 14, lastMeeting: "2026-03-07",
    coaching: "Excellent performer",
    strengths: ["Strong discovery questions", "Clear value articulation", "Effective objection handling"],
    weaknesses: ["Occasionally rushes closing", "Could improve demo pacing"],
    suggestions: ["Practice deliberate pauses before closing", "Use customer stories more in demos"],
    recentMeetings: [
      { title: "Enterprise Demo – TechCorp", score: 9.1, summary: "Exceptional discovery phase. Strong ROI presentation. Prospect highly engaged.", date: "2026-03-07" },
      { title: "Renewal Call – DataFlow", score: 8.4, summary: "Good relationship building. Addressed all concerns. Upsell opportunity identified.", date: "2026-03-05" },
    ]
  },
  {
    id: "2", name: "John Smith", role: "Account Executive", avatar: "JS",
    meetings: 15, avgScore: 7.8, talkRatio: 58, followUps: 11, lastMeeting: "2026-03-06",
    coaching: "Improve listening ratio",
    strengths: ["Strong product knowledge", "Good rapport building", "Persistent follow-up"],
    weaknesses: ["Talks too much during meetings", "Weak next-step definition", "Misses pricing objections"],
    suggestions: ["Reduce talk ratio to under 50%", "Always define clear next steps", "Practice handling pricing objections"],
    recentMeetings: [
      { title: "Product Demo – Acme Inc", score: 8.5, summary: "Strong product explanation but missed pricing objection. Need to improve closing.", date: "2026-03-06" },
      { title: "Discovery Call – CloudBase", score: 7.2, summary: "Good initial rapport but dominated conversation. Prospect had limited chance to share pain points.", date: "2026-03-04" },
    ]
  },
  {
    id: "3", name: "Mike Chen", role: "SDR", avatar: "MC",
    meetings: 22, avgScore: 7.1, talkRatio: 62, followUps: 8, lastMeeting: "2026-03-08",
    coaching: "Focus on discovery questions",
    strengths: ["High meeting volume", "Good energy and enthusiasm", "Quick qualification"],
    weaknesses: ["Poor discovery question depth", "Talks over prospects", "Weak follow-up clarity"],
    suggestions: ["Use SPIN selling framework", "Practice active listening", "Send structured follow-up emails within 2 hours"],
    recentMeetings: [
      { title: "Cold Outreach – NovaTech", score: 7.3, summary: "Good energy but rushed through discovery. Prospect seemed interested but unclear on next steps.", date: "2026-03-08" },
      { title: "Qualification Call – BrightPath", score: 6.8, summary: "Talked 70% of the time. Missed key budget signals from prospect.", date: "2026-03-06" },
    ]
  },
  {
    id: "4", name: "Lisa Park", role: "Account Executive", avatar: "LP",
    meetings: 12, avgScore: 8.2, talkRatio: 46, followUps: 10, lastMeeting: "2026-03-05",
    coaching: "Increase meeting volume",
    strengths: ["Excellent listening skills", "Strong closing technique", "Clear action items"],
    weaknesses: ["Low meeting volume", "Could be more assertive in negotiations"],
    suggestions: ["Schedule 3+ more meetings per week", "Practice assertive negotiation techniques"],
    recentMeetings: [
      { title: "Negotiation – FinServ Pro", score: 8.8, summary: "Excellent negotiation. Secured favorable terms. Clear next steps defined.", date: "2026-03-05" },
      { title: "QBR – MegaCorp", score: 7.9, summary: "Thorough review but could push harder on expansion opportunities.", date: "2026-03-03" },
    ]
  },
  {
    id: "5", name: "David Kim", role: "SDR", avatar: "DK",
    meetings: 20, avgScore: 6.9, talkRatio: 66, followUps: 6, lastMeeting: "2026-03-07",
    coaching: "Critical: reduce talk ratio",
    strengths: ["High activity level", "Good prospecting instincts"],
    weaknesses: ["Talks far too much", "Doesn't ask discovery questions", "Weak closing attempts", "Poor follow-up clarity"],
    suggestions: ["Aim for 45% talk ratio max", "Prepare 5 open-ended questions per call", "End every meeting with 3 clear next steps"],
    recentMeetings: [
      { title: "Intro Call – ScaleUp AI", score: 7.0, summary: "High energy but prospect barely spoke. Needs to listen more.", date: "2026-03-07" },
      { title: "Demo – RetailMax", score: 6.5, summary: "Feature dump approach. Prospect disengaged halfway. No clear next steps.", date: "2026-03-04" },
    ]
  },
];

const summaryCards = [
  { label: "Team Meetings", value: "87", change: "+12%", up: true, icon: Users },
  { label: "Avg Meeting Score", value: "7.7", change: "+0.4", up: true, icon: Target },
  { label: "Action Items Generated", value: "142", change: "+18%", up: true, icon: CheckCircle2 },
  { label: "Conversion Signals", value: "34", change: "-3%", up: false, icon: TrendingUp },
  { label: "Avg Talk Ratio", value: "55%", change: "-2%", up: true, icon: Mic },
];

const weeklyTrend = [
  { week: "W1", score: 7.1, meetings: 18 },
  { week: "W2", score: 7.4, meetings: 21 },
  { week: "W3", score: 7.6, meetings: 24 },
  { week: "W4", score: 7.9, meetings: 24 },
];

const coachingInsights = [
  { type: "warning", text: "Your team talks 55% of the time during meetings. High-performing sales teams usually stay around 45–50%. Consider coaching reps to ask more discovery questions." },
  { type: "tip", text: "3 team members have not defined clear next steps in over 40% of their meetings this month. This correlates with lower conversion rates." },
  { type: "success", text: "Sarah Lee has improved her meeting score by 15% this quarter. Her discovery question technique could be a model for the team." },
  { type: "warning", text: "David Kim and Mike Chen have talk ratios above 60%. Schedule 1:1 coaching sessions focused on active listening." },
];

type MemberDetail = (typeof teamMembers)[number];

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 8 ? "text-emerald-400" : score >= 7 ? "text-amber-400" : "text-red-400";
  return <span className={`font-bold ${color}`}>{score.toFixed(1)}</span>;
}

function TalkRatioBadge({ ratio }: { ratio: number }) {
  const variant = ratio <= 50 ? "default" : ratio <= 58 ? "secondary" : "destructive";
  return <Badge variant={variant} className="text-xs font-mono">{ratio}%</Badge>;
}

export default function TeamPage() {
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null);

  if (selectedMember) {
    return (
      <DashboardLayout>
        <MemberDetailView member={selectedMember} onBack={() => setSelectedMember(null)} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display">Team Performance</h1>
          <p className="text-sm text-muted-foreground">Sales performance command center · Monitor, coach, and improve</p>
        </div>

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

        {/* Main Grid: Table + Sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Table + Trend */}
          <div className="lg:col-span-2 space-y-6">
            {/* Weekly Trend Chart */}
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

            {/* Team Members - Card list on mobile, table on md+ */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Team Members</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile: Card List */}
                <div className="md:hidden divide-y divide-border">
                  {teamMembers.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 active:bg-secondary/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{m.avatar}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.role}</p>
                        </div>
                        <ScoreIndicator score={m.avgScore} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-secondary/20 py-1.5 px-1">
                          <p className="text-xs font-bold font-mono">{m.meetings}</p>
                          <p className="text-[10px] text-muted-foreground">Meetings</p>
                        </div>
                        <div className="rounded-md bg-secondary/20 py-1.5 px-1">
                          <TalkRatioBadge ratio={m.talkRatio} />
                          <p className="text-[10px] text-muted-foreground mt-0.5">Talk</p>
                        </div>
                        <div className="rounded-md bg-secondary/20 py-1.5 px-1">
                          <p className="text-xs font-bold font-mono">{m.followUps}</p>
                          <p className="text-[10px] text-muted-foreground">Follow-ups</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Member</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Meetings</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Avg Score</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Talk Ratio</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Follow-ups</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Coaching</th>
                        <th className="text-left p-4 text-xs font-medium text-muted-foreground">Last Meeting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {teamMembers.map((m) => (
                        <tr
                          key={m.id}
                          className="hover:bg-secondary/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedMember(m)}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{m.avatar}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{m.name}</p>
                                <p className="text-xs text-muted-foreground">{m.role}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 font-mono">{m.meetings}</td>
                          <td className="p-4"><ScoreIndicator score={m.avgScore} /></td>
                          <td className="p-4"><TalkRatioBadge ratio={m.talkRatio} /></td>
                          <td className="p-4 font-mono">{m.followUps}</td>
                          <td className="p-4">
                            <span className="text-xs text-muted-foreground">{m.coaching}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs text-muted-foreground">{new Date(m.lastMeeting).toLocaleDateString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recent Team Meetings Feed */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display">Recent Team Meetings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {teamMembers.flatMap(m =>
                  m.recentMeetings.map((rm, i) => ({ ...rm, memberName: m.name, memberAvatar: m.avatar, key: `${m.id}-${i}` }))
                )
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 6)
                  .map((entry) => (
                    <div key={entry.key} className="flex gap-3 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                      <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{entry.memberAvatar}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{entry.memberName}</p>
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

          {/* Right Sidebar: Leaderboard + Coaching */}
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
                {[...teamMembers]
                  .sort((a, b) => b.avgScore - a.avgScore)
                  .slice(0, 3)
                  .map((m, i) => {
                    const icons = [Trophy, Medal, Award];
                    const colors = ["text-amber-400", "text-zinc-400", "text-orange-400"];
                    const labels = ["Top Performer", "Strong Performer", "Improving Performer"];
                    const Icon = icons[i];
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 cursor-pointer hover:bg-secondary/30 transition-colors"
                        onClick={() => setSelectedMember(m)}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary">
                          <Icon className={`w-4 h-4 ${colors[i]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{labels[i]}</p>
                        </div>
                        <ScoreIndicator score={m.avgScore} />
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            {/* AI Coaching Insights */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI Coaching Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[360px] pr-2">
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
    </DashboardLayout>
  );
}

// --- Member Detail View ---
function MemberDetailView({ member, onBack }: { member: MemberDetail; onBack: () => void }) {
  const talkRadialData = [{ name: "Talk", value: member.talkRatio, fill: member.talkRatio <= 50 ? "hsl(174, 72%, 50%)" : member.talkRatio <= 58 ? "hsl(38, 92%, 55%)" : "hsl(0, 72%, 55%)" }];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-primary/20 text-primary font-bold">{member.avatar}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg sm:text-xl font-bold font-display">{member.name}</h1>
            <p className="text-sm text-muted-foreground">{member.role}</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Meetings", value: member.meetings, icon: Calendar },
          { label: "Avg Score", value: member.avgScore.toFixed(1), icon: Target },
          { label: "Talk Ratio", value: `${member.talkRatio}%`, icon: Mic },
          { label: "Follow-ups Done", value: member.followUps, icon: CheckCircle2 },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardContent className="p-4">
              <stat.icon className="w-4 h-4 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold font-display">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Strengths / Weaknesses / Suggestions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {member.strengths.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {member.weaknesses.map((w, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              Coaching Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {member.suggestions.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recent Meetings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display">Recent Meetings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {member.recentMeetings.map((rm, i) => (
            <div key={i} className="p-3 rounded-lg bg-secondary/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                <p className="text-sm font-medium truncate">{rm.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreIndicator score={rm.score} />
                  <span className="text-xs text-muted-foreground">{new Date(rm.date).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{rm.summary}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
