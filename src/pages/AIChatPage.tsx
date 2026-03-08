import { useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import SubscriptionGate from "@/components/SubscriptionGate";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-coach-chat`;

const suggestions = [
  "How do I handle pricing objections?",
  "Tips for better discovery calls",
  "How to improve my close rate?",
  "Best follow-up strategies after a demo",
];

export default function AIChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.error || `Error ${resp.status}`;
        toast({ title: "AI Error", description: errMsg, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsert(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsert(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Connection Error", description: "Failed to connect to AI service.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold font-display">AI Sales Coach</h1>
            <p className="text-sm text-muted-foreground">Get real-time coaching tips and objection handling advice</p>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="gap-1.5 text-muted-foreground">
              <Trash2 className="w-3 h-3" /> Clear
            </Button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto glass rounded-xl p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-primary-foreground" />
              </div>
              <h2 className="font-display font-semibold text-lg mb-2">Fixsense AI Coach</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Ask me anything about sales techniques, objection handling, call coaching, or deal strategy.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-sm px-4 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-secondary/50 transition-colors text-muted-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4 text-accent" />
                  </div>
                )}
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
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

        <form onSubmit={e => { e.preventDefault(); send(input); }} className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="Ask about sales techniques, objections, coaching..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="h-[46px] w-[46px] rounded-xl">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
