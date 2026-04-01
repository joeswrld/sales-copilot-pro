import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Clock, Users, TrendingUp, AlertCircle, CheckCircle,
  Loader2, Pencil, Save, X, BarChart3, Target, Sparkles, MessageSquare,
  Bot, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallDetail, useUpdateCall } from "@/hooks/useCalls";
import { format } from "date-fns";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Objection {
  text?: string;
  type?: string;
  handled?: boolean;
  response?: string;
  suggestion?: string;
  confidence?: number;
}

interface TranscriptLine {
  time?: string;
  timestamp?: string;
  speaker: string;
  text: string;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery Call",
  demo: "Product Demo",
  follow_up: "Follow-up",
  negotiation: "Negotiation",
  other: "Other",
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-coach-chat`;

function ProactiveCoachPanel({
  callName,
  sentiment,
  talkRatio,
  objections,
  buyingSignals,
  meetingScore,
  actionItems,
}: {
  callName: string;
  sentiment: number;
  talkRatio: { rep: number; prospect: number } | null;
  objections: Objection[];
  buyingSignals: string[];
  meetingScore: number | null;
  actionItems: string[];
}) {
  const [coaching, setCoaching] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prompt = `You are a sales coach. Analyze this just-completed sales call and give specific, actionable feedback.

Call: "${callName}"
Meeting Score: ${meetingScore ?? "N/A"}/10
Sentiment Score: ${sentiment}%
Talk Ratio: Rep ${talkRatio?.rep ?? "?"}% / Prospect ${talkRatio?.prospect ?? "?"}%
Objections raised: ${objections.length} (${objections.filter(o => o.handled).length} handled)
Buying signals detected: ${buyingSignals.length}
${objections.length > 0 ? `Objections: ${objections.map(o => o.text || o.type).join(", ")}` : ""}
${buyingSignals.length > 0 ? `Buying signals: ${buyingSignals.join(", ")}` : ""}
${actionItems.length > 0 ? `Action items: ${actionItems.join(", ")}` : ""}

Provide:
1. The 2 most important things the rep did well
2. The 1 most critical thing to improve before the next call with this prospect
3. One specific next step to move this deal forward

Keep it concise and direct. No fluff.`;

  const loadCoaching = async () => {
    if (coaching || isLoading) return;
    setIsLoading(true);
    setIsOpen(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) { result += chunk; setCoaching(result); }
          } catch {}
        }
      }
      setMessages([{ role: "assistant", content: result }]);
    } catch {
      setCoaching("Unable to load coaching insights right now. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const sendFollowUp = async () => {
    if (!followUpInput.trim() || isLoading) return;
    const userMsg = { role: "user" as const, content: followUpInput.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setFollowUpInput("");
    setIsLoading(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "user", content: prompt },
            ...newMessages,
          ],
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let buffer = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) {
              result += chunk;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: result } : m);
                }
                return [...prev, { role: "assistant", content: result }];
              });
            }
          } catch {}
        }
      }
    } catch {
      toast.error("Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="glass rounded-xl overflow-hidden border border-primary/20">
      <button
        onClick={isOpen ? () => setIsOpen(false) : loadCoaching}
        className="w-full p-5 flex items-center gap-3 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <Bot className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            AI Coaching Insights
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Analyzing this call…" : isOpen ? "Tap to collapse" : "Get personalized feedback on this call"}
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>

      {isOpen && (
        <div className="border-t border-border">
          <div ref={scrollRef} className="max-h-72 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && messages.length === 0 && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-secondary/60 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {coaching && (
            <div className="border-t border-border p-3 flex gap-2">
              <input
                type="text"
                placeholder="Ask a follow-up question…"
                value={followUpInput}
                onChange={e => setFollowUpInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendFollowUp()}
                disabled={isLoading}
                className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button size="sm" onClick={sendFollowUp} disabled={!followUpInput.trim() || isLoading} className="shrink-0">
                Ask
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { call, summary } = useCallDetail(id);
  const updateCall = useUpdateCall();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const callData = call.data;
  const summaryData = summary.data;

  if (call.isLoading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!callData) {
    return <DashboardLayout><div className="text-center py-20"><p className="text-muted-foreground">Call not found.</p><Link to="/dashboard/calls" className="text-primary text-sm mt-2 inline-block">← Back to calls</Link></div></DashboardLayout>;
  }

  const objections = (summaryData?.objections as unknown as Objection[] | null) || [];
  const transcript = (summaryData?.transcript as unknown as TranscriptLine[] | null) || [];
  const meetingScore = (summaryData as any)?.meeting_score as number | null;
  const talkRatio = (summaryData as any)?.talk_ratio as { rep: number; prospect: number } | null;
  const buyingSignals = ((summaryData as any)?.buying_signals as string[] | null) || [];
  const actionItems = ((summaryData as any)?.action_items as string[] | null) || [];
  const meetingType = (callData as any)?.meeting_type as string | null;

  const handleSaveName = async () => {
    try {
      await updateCall.mutateAsync({ id: callData.id, name: editName });
      setEditing(false);
      toast.success("Call updated");
    } catch { toast.error("Failed to update"); }
  };

  const hasSummaryData = !!summaryData;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link to="/dashboard/calls">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8" />
                <Button size="icon" variant="ghost" onClick={handleSaveName}><Save className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-display truncate">{callData.name}</h1>
                <button onClick={() => { setEditing(true); setEditName(callData.name); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground">{format(new Date(callData.date), "MMMM d, yyyy 'at' h:mm a")}</p>
              {meetingType && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {MEETING_TYPE_LABELS[meetingType] || meetingType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Meeting Score Hero */}
        {meetingScore !== null && meetingScore !== undefined && (
          <div className="glass rounded-xl p-6 flex items-center gap-6">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  strokeDasharray={`${(meetingScore / 10) * 100}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-2xl font-bold font-display text-primary">{meetingScore.toFixed(1)}</span>
            </div>
            <div>
              <h2 className="font-display font-semibold text-lg">Meeting Score</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {meetingScore >= 8 ? "Excellent call performance" :
                 meetingScore >= 6 ? "Good call with areas to improve" :
                 "Needs improvement — review insights below"}
              </p>
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</div>
            <div className="font-bold font-display mt-1">{callData.duration_minutes ? `${callData.duration_minutes} min` : "—"}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Participants</div>
            <div className="font-bold font-display mt-1">{callData.participants?.length || 0}</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Sentiment</div>
            <div className="font-bold font-display mt-1 text-primary">{callData.sentiment_score || 0}%</div>
          </div>
          <div className="glass rounded-lg p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Deal Score</div>
            <div className="font-bold font-display mt-1 text-success">{callData.deal_score || "—"}</div>
          </div>
        </div>

        {/* Proactive AI Coaching — shown as soon as summary data is available */}
        {hasSummaryData && (
          <ProactiveCoachPanel
            callName={callData.name}
            sentiment={callData.sentiment_score || 0}
            talkRatio={talkRatio}
            objections={objections}
            buyingSignals={buyingSignals}
            meetingScore={meetingScore}
            actionItems={actionItems}
          />
        )}

        {/* Talk Ratio */}
        {talkRatio && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Talk Ratio
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-primary">You ({talkRatio.rep}%)</span>
                <span className="text-accent">Prospect ({talkRatio.prospect}%)</span>
              </div>
              <div className="h-3 rounded-full bg-muted flex overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${talkRatio.rep}%` }} />
                <div className="h-full bg-accent" style={{ width: `${talkRatio.prospect}%` }} />
              </div>
              {talkRatio.rep > 65 && (
                <p className="text-xs text-warning">⚠️ You spoke more than 65% of the time. Aim for 40–60% for better engagement.</p>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {summaryData?.summary && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> AI Summary
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{summaryData.summary}</p>
          </div>
        )}

        {/* Buying Signals */}
        {buyingSignals.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-success" /> Buying Signals ({buyingSignals.length})
            </h2>
            <ul className="space-y-2">
              {buyingSignals.map((signal, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">✓</span>
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Decisions & Action Items */}
        <div className="grid md:grid-cols-2 gap-4">
          {(summaryData?.key_decisions?.length || 0) > 0 && (
            <div className="glass rounded-xl p-5">
              <h2 className="font-display font-semibold mb-3">Key Decisions</h2>
              <ul className="space-y-2">
                {summaryData!.key_decisions!.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />{d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {((summaryData?.next_steps?.length || 0) > 0 || actionItems.length > 0) && (
            <div className="glass rounded-xl p-5">
              <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Action Items
              </h2>
              <ul className="space-y-2">
                {[...(actionItems.length > 0 ? actionItems : summaryData?.next_steps || [])].map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Objections */}
        {objections.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Objections ({objections.length})</h2>
            <div className="space-y-3">
              {objections.map((obj, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{obj.text || obj.type}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${obj.handled ? "bg-success/10 text-success" : "bg-accent/10 text-accent"}`}>
                      {obj.handled ? "Handled" : "Open"}
                    </span>
                  </div>
                  {(obj.response || obj.suggestion) && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {obj.response ? `Response: ${obj.response}` : `Suggestion: ${obj.suggestion}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3">Transcript</h2>
            <div className="space-y-4">
              {transcript.map((line, i) => (
                <div key={i} className={line.speaker !== "You" && line.speaker !== "Rep" ? "pl-4 border-l-2 border-accent/40" : ""}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${(line.speaker === "You" || line.speaker === "Rep") ? "text-primary" : "text-accent"}`}>{line.speaker}</span>
                    <span className="text-xs text-muted-foreground">{line.time || line.timestamp}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{line.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {!summaryData && !summary.isLoading && (
          <div className="glass rounded-xl p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">AI summary is being generated…</p>
            <p className="text-xs text-muted-foreground mt-1">This usually takes a few seconds after the call ends.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}