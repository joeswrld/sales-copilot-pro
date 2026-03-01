import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, Mail, Clock, Users, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const callData = {
  name: "Acme Corp - Demo Call",
  date: "March 1, 2026 at 2:30 PM",
  duration: "34 minutes",
  participants: ["John Smith (You)", "Jane Doe (Acme Corp)", "Bob Wilson (Acme Corp)"],
  sentiment: 87,
  dealScore: "A",
  summary: "Productive demo call with Acme Corp's VP of Sales and Sales Director. Walked through real-time coaching features which resonated strongly. Two objections raised: existing Gong contract (6 months remaining) and pricing concerns. Both handled effectively with competitor comparison and ROI calculator. Next steps: send proposal by Friday, schedule technical review with their IT team.",
  keyDecisions: [
    "Acme Corp interested in Team tier for 25 users",
    "Technical review scheduled for next Tuesday",
    "Proposal to be sent by end of week",
  ],
  nextSteps: [
    "Send pricing proposal with custom volume discount",
    "Schedule technical integration review",
    "Share case study from similar company",
  ],
  objections: [
    { text: "Already using Gong with 6 months remaining on contract", handled: true, response: "Offered parallel trial and migration support" },
    { text: "Pricing higher than expected for 25 seats", handled: true, response: "Presented ROI calculator showing 3x return in 60 days" },
  ],
  transcript: [
    { time: "0:00", speaker: "You", text: "Thanks for taking the time today, Jane and Bob. I know you're busy, so I want to make the most of our 30 minutes." },
    { time: "0:12", speaker: "Jane", text: "Appreciate that. We've been looking at several options and Fixsense came up in a few conversations." },
    { time: "0:24", speaker: "You", text: "Great to hear. Before I dive in, can you tell me about your current sales process and any pain points?" },
    { time: "0:38", speaker: "Bob", text: "Sure. We're using Gong right now for call recording, but we feel like we're not getting enough actionable insights from it." },
  ],
};

export default function CallDetail() {
  const { id } = useParams();

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/calls">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display truncate">{callData.name}</h1>
            <p className="text-sm text-muted-foreground">{callData.date}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-3 h-3" /> Export</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Mail className="w-3 h-3" /> Email</Button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</div>
            <div className="font-bold font-display mt-1">{callData.duration}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Participants</div>
            <div className="font-bold font-display mt-1">{callData.participants.length}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Sentiment</div>
            <div className="font-bold font-display mt-1 text-primary">{callData.sentiment}%</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Deal Score</div>
            <div className="font-bold font-display mt-1 text-success">{callData.dealScore}</div>
          </div>
        </div>

        {/* Summary */}
        <div className="glass rounded-xl p-5">
          <h2 className="font-display font-semibold mb-3">AI Summary</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{callData.summary}</p>
        </div>

        {/* Key Decisions & Next Steps */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Key Decisions</h2>
            <ul className="space-y-2">
              {callData.keyDecisions.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Next Steps</h2>
            <ul className="space-y-2">
              {callData.nextSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Objections */}
        <div className="glass rounded-xl p-5">
          <h2 className="font-display font-semibold mb-3">Objections ({callData.objections.length})</h2>
          <div className="space-y-3">
            {callData.objections.map((obj, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{obj.text}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">Handled</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Response: {obj.response}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript */}
        <div className="glass rounded-xl p-5">
          <h2 className="font-display font-semibold mb-3">Transcript</h2>
          <div className="space-y-4">
            {callData.transcript.map((line, i) => (
              <div key={i} className={line.speaker !== "You" ? "pl-4 border-l-2 border-accent/40" : ""}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${line.speaker === "You" ? "text-primary" : "text-accent"}`}>{line.speaker}</span>
                  <span className="text-xs text-muted-foreground">{line.time}</span>
                </div>
                <p className="text-sm text-foreground/90">{line.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
