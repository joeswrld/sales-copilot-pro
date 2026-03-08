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

// --- PipelineFlow Demo Data (10-person sales team) ---
const teamMembers = [
  {
    id: "1", name: "Sarah Johnson", role: "Senior AE", avatar: "SJ",
    meetings: 32, avgScore: 8.9, talkRatio: 47, followUps: 29, followUpRate: 92, lastMeeting: "2026-03-08",
    discoveryQuestionsPerMeeting: 7, objectionsHandled: "high",
    coaching: "Top performer – model for the team",
    strengths: ["Excellent discovery questions — averages 7 per meeting", "Strong closing technique with clear next steps", "Balanced talk ratio at 47%", "Effectively handles pricing objections"],
    weaknesses: ["Occasionally rushes closing when running over time", "Could improve demo pacing on complex products"],
    suggestions: ["Practice deliberate pauses before closing", "Use more customer success stories in enterprise demos", "Consider mentoring newer reps on discovery techniques"],
    recentMeetings: [
      { title: "Product Demo with Acme Corp", score: 9.2, summary: "Excellent discovery questions and strong close. Prospect highly engaged throughout. Clear next steps defined with timeline.", date: "2026-03-08" },
      { title: "Enterprise Demo – TechCorp", score: 9.1, summary: "Exceptional discovery phase. Strong ROI presentation. Identified 3 upsell opportunities.", date: "2026-03-07" },
      { title: "Renewal Call – DataFlow Inc", score: 8.4, summary: "Good relationship building. Addressed all concerns. Upsell opportunity identified and scheduled follow-up.", date: "2026-03-05" },
    ]
  },
  {
    id: "2", name: "Michael Torres", role: "Senior AE", avatar: "MT",
    meetings: 28, avgScore: 8.2, talkRatio: 49, followUps: 23, followUpRate: 82, lastMeeting: "2026-03-08",
    discoveryQuestionsPerMeeting: 6, objectionsHandled: "high",
    coaching: "Strong performer – refine objection handling",
    strengths: ["Consistent meeting quality", "Good talk-to-listen balance", "Strong rapport building with C-level prospects"],
    weaknesses: ["Sometimes misses subtle pricing objections", "Could push harder on expansion opportunities"],
    suggestions: ["Practice the 'Feel-Felt-Found' objection technique", "Prepare expansion talking points before QBRs"],
    recentMeetings: [
      { title: "QBR – Enterprise Solutions", score: 8.5, summary: "Thorough quarterly review. Good relationship management. Missed one expansion signal.", date: "2026-03-08" },
      { title: "Negotiation – FinServ Pro", score: 8.8, summary: "Excellent negotiation. Secured favorable terms. Clear next steps defined.", date: "2026-03-06" },
      { title: "Discovery Call – MedTech", score: 7.4, summary: "Good initial discovery but could probe deeper on budget and timeline.", date: "2026-03-04" },
    ]
  },
  {
    id: "3", name: "Daniel Rivera", role: "Account Executive", avatar: "DR",
    meetings: 29, avgScore: 7.1, talkRatio: 63, followUps: 20, followUpRate: 68, lastMeeting: "2026-03-07",
    discoveryQuestionsPerMeeting: 3, objectionsHandled: "medium",
    coaching: "Improve listening ratio and discovery",
    strengths: ["Clear product explanations", "Confident tone during demos", "Good energy and persistence"],
    weaknesses: ["Does not ask enough discovery questions — only 3 per meeting", "Dominates the conversation too early", "Sometimes forgets to confirm next steps", "Misses pricing objections"],
    suggestions: ["Ask at least 5 discovery questions before presenting the product", "Pause more frequently to allow the prospect to speak", "Always confirm the next step before ending the call", "Practice the SPIN selling framework"],
    recentMeetings: [
      { title: "Product Demo – Acme Inc", score: 7.5, summary: "Strong product explanation but missed pricing objection. Talked 65% of the time. Need to improve closing.", date: "2026-03-07" },
      { title: "Intro Call – TechNova", score: 6.7, summary: "Rep spoke 68% of the time and rushed the demo. Prospect seemed interested but unclear on next steps.", date: "2026-03-05" },
      { title: "Discovery Call – CloudBase", score: 7.2, summary: "Good initial rapport but dominated conversation. Prospect had limited chance to share pain points.", date: "2026-03-04" },
    ]
  },
  {
    id: "4", name: "Maya Patel", role: "Account Executive", avatar: "MP",
    meetings: 21, avgScore: 6.8, talkRatio: 66, followUps: 13, followUpRate: 60, lastMeeting: "2026-03-06",
    discoveryQuestionsPerMeeting: 2, objectionsHandled: "low",
    coaching: "Critical: reduce talk ratio, add discovery",
    strengths: ["Good product knowledge", "Enthusiastic presentation style"],
    weaknesses: ["Talks 66% of the time — significantly above target", "Only asks 2 discovery questions per meeting", "Weak objection handling — low confidence scores", "Poor follow-up clarity and consistency"],
    suggestions: ["Target 45–50% talk ratio immediately", "Prepare 5 open-ended discovery questions before each call", "Shadow Sarah Johnson for discovery technique training", "Implement a follow-up template for consistency"],
    recentMeetings: [
      { title: "Demo – RetailMax", score: 6.5, summary: "Feature dump approach. Prospect disengaged halfway. No clear next steps defined.", date: "2026-03-06" },
      { title: "Intro Call – ScaleUp AI", score: 7.0, summary: "High energy but prospect barely spoke. Needs to ask more questions and listen.", date: "2026-03-04" },
      { title: "Discovery – CloudFirst", score: 6.9, summary: "Jumped into product pitch within 2 minutes. Missed budget and timeline qualification.", date: "2026-03-02" },
    ]
  },
  {
    id: "5", name: "Lisa Park", role: "Account Executive", avatar: "LP",
    meetings: 15, avgScore: 8.0, talkRatio: 46, followUps: 12, followUpRate: 80, lastMeeting: "2026-03-07",
    discoveryQuestionsPerMeeting: 6, objectionsHandled: "high",
    coaching: "Increase meeting volume",
    strengths: ["Excellent listening skills", "Strong closing technique", "Clear action items after every call"],
    weaknesses: ["Low meeting volume — 15 vs team avg 18", "Could be more assertive in negotiations"],
    suggestions: ["Schedule 3+ more meetings per week", "Practice assertive negotiation techniques", "Work with SDRs to increase pipeline fill rate"],
    recentMeetings: [
      { title: "Negotiation – FinServ Pro", score: 8.8, summary: "Excellent negotiation. Secured favorable terms. Clear next steps defined.", date: "2026-03-07" },
      { title: "QBR – MegaCorp", score: 7.9, summary: "Thorough review but could push harder on expansion opportunities.", date: "2026-03-05" },
    ]
  },
  {
    id: "6", name: "James Chen", role: "SDR", avatar: "JC",
    meetings: 24, avgScore: 7.3, talkRatio: 55, followUps: 17, followUpRate: 71, lastMeeting: "2026-03-08",
    discoveryQuestionsPerMeeting: 4, objectionsHandled: "medium",
    coaching: "Improve qualification depth",
    strengths: ["High meeting volume", "Good energy and enthusiasm", "Quick rapport building"],
    weaknesses: ["Surface-level qualification — doesn't dig into BANT", "Inconsistent follow-up timing"],
    suggestions: ["Use BANT framework for every qualification call", "Send follow-up emails within 1 hour of meetings", "Prepare qualification checklist before each call"],
    recentMeetings: [
      { title: "Qualification – NovaTech", score: 7.5, summary: "Good energy. Identified basic needs but missed budget qualification. Follow-up sent same day.", date: "2026-03-08" },
      { title: "Cold Outreach – BrightPath", score: 7.1, summary: "Solid initial connection. Booked demo with AE. Could improve pain point discovery.", date: "2026-03-06" },
    ]
  },
  {
    id: "7", name: "Emily Watson", role: "SDR", avatar: "EW",
    meetings: 22, avgScore: 7.5, talkRatio: 52, followUps: 18, followUpRate: 82, lastMeeting: "2026-03-07",
    discoveryQuestionsPerMeeting: 5, objectionsHandled: "medium",
    coaching: "Strong SDR – ready for AE track",
    strengths: ["Balanced conversations", "Good discovery depth for SDR level", "Reliable follow-up"],
    weaknesses: ["Could improve closing for demo bookings", "Sometimes too passive in objection moments"],
    suggestions: ["Practice assumptive close for demo booking", "Role-play objection scenarios weekly", "Study AE techniques to prepare for promotion"],
    recentMeetings: [
      { title: "Discovery – InnovateCo", score: 7.8, summary: "Good qualification. Identified pain points and decision-maker. Booked demo for next week.", date: "2026-03-07" },
      { title: "Cold Call – StackFlow", score: 7.2, summary: "Solid intro. Prospect engaged but hesitant. Could have pushed harder to book meeting.", date: "2026-03-05" },
    ]
  },
  {
    id: "8", name: "David Kim", role: "SDR", avatar: "DK",
    meetings: 20, avgScore: 6.5, talkRatio: 68, followUps: 10, followUpRate: 50, lastMeeting: "2026-03-07",
    discoveryQuestionsPerMeeting: 2, objectionsHandled: "low",
    coaching: "Urgent: coaching session needed",
    strengths: ["High activity level", "Good prospecting instincts"],
    weaknesses: ["Talks 68% of the time — highest on the team", "Only 2 discovery questions per meeting", "50% follow-up rate — lowest on team", "Weak closing attempts"],
    suggestions: ["Mandatory: reduce talk ratio to under 50%", "Prepare 5 open-ended questions per call minimum", "End every meeting with 3 clear next steps", "Schedule weekly 1:1 coaching with manager"],
    recentMeetings: [
      { title: "Intro Call – ScaleUp AI", score: 6.8, summary: "High energy but prospect barely spoke. Talked 72% of the time. No next steps confirmed.", date: "2026-03-07" },
      { title: "Demo – RetailMax", score: 6.2, summary: "Feature dump approach. Prospect disengaged halfway. No clear next steps.", date: "2026-03-04" },
    ]
  },
  {
    id: "9", name: "Rachel Adams", role: "Account Executive", avatar: "RA",
    meetings: 18, avgScore: 7.8, talkRatio: 50, followUps: 15, followUpRate: 83, lastMeeting: "2026-03-08",
    discoveryQuestionsPerMeeting: 5, objectionsHandled: "high",
    coaching: "Solid performer – push for more volume",
    strengths: ["Perfect talk ratio balance", "Strong objection handling", "Clear and structured follow-ups"],
    weaknesses: ["Meeting volume below potential", "Tends to over-prepare leading to fewer bookings"],
    suggestions: ["Aim for 22+ meetings per month", "Reduce prep time per meeting by using templates", "Delegate scheduling to SDR partners"],
    recentMeetings: [
      { title: "Product Demo – HealthTech Pro", score: 8.3, summary: "Well-structured demo. Great objection handling on pricing. Clear 3-step follow-up plan.", date: "2026-03-08" },
      { title: "Discovery – LogiFlow", score: 7.4, summary: "Good discovery but took too long to get to value proposition. Prospect remained engaged.", date: "2026-03-05" },
    ]
  },
  {
    id: "10", name: "Alex Nguyen", role: "SDR", avatar: "AN",
    meetings: 19, avgScore: 7.0, talkRatio: 58, followUps: 13, followUpRate: 68, lastMeeting: "2026-03-06",
    discoveryQuestionsPerMeeting: 3, objectionsHandled: "medium",
    coaching: "Improve discovery and follow-up cadence",
    strengths: ["Good rapport building", "Energetic and positive", "Handles rejection well"],
    weaknesses: ["Talk ratio trending high at 58%", "Only 3 discovery questions per meeting", "Inconsistent follow-up — 68% completion"],
    suggestions: ["Target 50% talk ratio or lower", "Use a discovery question template", "Set calendar reminders for follow-ups within 2 hours"],
    recentMeetings: [
      { title: "Qualification – DataBridge", score: 7.3, summary: "Good energy. Prospect interested. Missed timeline qualification. Follow-up delayed by 1 day.", date: "2026-03-06" },
      { title: "Cold Outreach – SkylineAI", score: 6.7, summary: "Talked too much in opener. Prospect was polite but disengaged by minute 5.", date: "2026-03-03" },
    ]
  },
];

const summaryCards = [
  { label: "Team Meetings", value: "184", change: "+14%", up: true, icon: Users },
  { label: "Avg Meeting Score", value: "7.6", change: "+0.3", up: true, icon: Target },
  { label: "Action Items Generated", value: "312", change: "+22%", up: true, icon: CheckCircle2 },
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
  { type: "warning", text: "Your team speaks 58% of the time during meetings. High-performing sales teams typically stay below 50%. Consider coaching reps to ask more discovery questions and practice active listening." },
  { type: "warning", text: "Only 42% of meetings end with a clearly defined next step. This correlates with lower conversion rates. Mandate a 'next steps' checklist before ending every call." },
  { type: "tip", text: "Prospects ask pricing questions in 37% of calls, but reps only address it confidently in 18% of cases. Schedule a team session on pricing objection handling." },
  { type: "success", text: "Sarah Johnson has improved her meeting score by 15% this quarter. Her discovery question technique (7 per meeting avg) could be a model for the entire team." },
  { type: "warning", text: "Daniel Rivera, Maya Patel, and David Kim have talk ratios above 60%. Schedule immediate 1:1 coaching sessions focused on active listening and SPIN selling." },
  { type: "tip", text: "Follow-up completion rate is 71% team-wide but Sarah (92%) and Rachel (83%) are significantly above average. Share their follow-up templates with the team." },
  { type: "success", text: "Emily Watson shows strong SDR performance with balanced talk ratio (52%) and good discovery depth. Consider fast-tracking to AE role." },
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Total Meetings", value: member.meetings, icon: Calendar },
          { label: "Avg Score", value: member.avgScore.toFixed(1), icon: Target },
          { label: "Talk Ratio", value: `${member.talkRatio}%`, icon: Mic },
          { label: "Follow-up Rate", value: `${member.followUpRate}%`, icon: CheckCircle2 },
          { label: "Discovery Q's / Meeting", value: member.discoveryQuestionsPerMeeting, icon: MessageSquare },
          { label: "Objection Handling", value: member.objectionsHandled, icon: AlertTriangle },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardContent className="p-3 sm:p-4">
              <stat.icon className="w-4 h-4 text-muted-foreground mb-2" />
              <p className="text-xl sm:text-2xl font-bold font-display capitalize">{stat.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Strengths / Weaknesses / Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
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
