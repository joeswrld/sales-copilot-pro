import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// ─── Shared Utilities ────────────────────────────────────────────────────────

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, className = "" }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(32px)",
      transition: `opacity 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

// ─── Interactive Live Demo ────────────────────────────────────────────────────

type DemoFeature = "objections" | "sentiment" | "transcript" | "summary" | "deals";

const DEMO_SCRIPT = [
  { speaker: "You", color: "#818cf8", text: "Thanks for your time today. What's your current process for handling pricing discussions?" },
  { speaker: "Alex", color: "#2dd4bf", text: "Honestly, it's a mess. Reps just wing it and we lose deals we shouldn't lose." },
  { speaker: "You", color: "#818cf8", text: "What's the cost to your business when a deal falls apart at pricing?" },
  { speaker: "Alex", color: "#2dd4bf", text: "We lost a $220k contract last month because someone couldn't counter the competitor pricing objection." },
  { speaker: "You", color: "#818cf8", text: "That's exactly the gap Fixsense fills. Let me show you how the objection detection works in real time." },
  { speaker: "Alex", color: "#2dd4bf", text: "That sounds interesting, but honestly the price feels steep for our current budget situation." },
  { speaker: "You", color: "#818cf8", text: "I hear you — let me frame the ROI. If we stop even one $200k deal from slipping, the platform pays for itself 50× over." },
  { speaker: "Alex", color: "#2dd4bf", text: "When you put it that way... the CFO would need to see the numbers though." },
  { speaker: "You", color: "#818cf8", text: "Absolutely. I'll send you our ROI calculator tailored to your 60-rep team size." },
];

const FEATURES: { id: DemoFeature; label: string; icon: string; desc: string }[] = [
  { id: "objections", label: "Objection Radar", icon: "⚡", desc: "See pricing objections flagged the instant they happen — with counter-scripts ready before you even pause." },
  { id: "sentiment", label: "Sentiment Pulse", icon: "📊", desc: "Watch prospect engagement score update live so you know exactly when interest peaks or drops." },
  { id: "transcript", label: "Live Transcript", icon: "🎙", desc: "Every word from both sides captured instantly — no bot joining the call, no permission requests." },
  { id: "summary", label: "AI Summary", icon: "✨", desc: "Full deal summary, buying signals, and next steps generated the moment the call ends." },
  { id: "deals", label: "Deal Intel", icon: "🎯", desc: "Compare every call across the deal timeline — AI shows exactly what changed between conversations." },
];

function LiveDemo() {
  const [activeFeature, setActiveFeature] = useState<DemoFeature>("objections");
  const [lines, setLines] = useState<typeof DEMO_SCRIPT>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sentiment, setSentiment] = useState(60);
  const [objectionFired, setObjectionFired] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [mobileTab, setMobileTab] = useState<"transcript" | "insights">("transcript");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const mobileTranscriptRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLines([]);
    setSentiment(60);
    setObjectionFired(false);
    setShowSummary(false);
    setIsPlaying(false);
  }, []);

  const runNext = useCallback((idx: number, currentLines: typeof DEMO_SCRIPT) => {
    if (idx >= DEMO_SCRIPT.length) {
      setIsPlaying(false);
      setShowSummary(true);
      return;
    }
    const line = DEMO_SCRIPT[idx];
    const newLines = [...currentLines, line];
    setLines(newLines);

    if (idx === 5) { setObjectionFired(true); setSentiment(s => Math.max(s - 18, 30)); }
    else if (idx === 6) { setSentiment(s => Math.min(s + 14, 80)); }
    else if (idx === 7) { setSentiment(s => Math.min(s + 8, 85)); }
    else { setSentiment(s => Math.min(s + 3, 78)); }

    setTimeout(() => {
      [transcriptRef, mobileTranscriptRef].forEach(r => {
        if (r.current) r.current.scrollTop = r.current.scrollHeight;
      });
    }, 50);

    const delay = 1200 + Math.random() * 600;
    timerRef.current = setTimeout(() => runNext(idx + 1, newLines), delay);
  }, []);

  const handlePlay = () => {
    if (isPlaying) return;
    reset();
    setIsPlaying(true);
    setTimeout(() => runNext(0, []), 400);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const sentimentColor = sentiment >= 70 ? "#22c55e" : sentiment >= 45 ? "#f59e0b" : "#ef4444";

  const TranscriptLines = ({ ref: tRef }: { ref: React.RefObject<HTMLDivElement> }) => (
    <div ref={tRef} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      {lines.length === 0 && !isPlaying && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "20px" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎙</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.4)", margin: 0 }}>Click "Run Demo" to see a live sales call analyzed in real time</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,.2)", margin: "6px 0 0" }}>Watch objections get flagged and sentiment tracked as the call happens</p>
        </div>
      )}
      {lines.map((line, i) => {
        const isYou = line.speaker === "You";
        const isPriceObj = i === 5;
        return (
          <div key={i} style={{
            display: "flex", gap: 8, padding: "7px 10px", borderRadius: 9,
            borderLeft: isPriceObj ? "2px solid #ef4444" : isYou ? "2px solid rgba(129,140,248,.3)" : "2px solid rgba(45,212,191,.25)",
            background: isPriceObj ? "rgba(239,68,68,.04)" : "transparent",
            animation: "linefade .3s ease",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: line.color, minWidth: 30, paddingTop: 1 }}>{line.speaker}</span>
            <span style={{ fontSize: 12, color: isPriceObj ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.6)", lineHeight: 1.55 }}>{line.text}</span>
          </div>
        );
      })}
      {isPlaying && lines.length < DEMO_SCRIPT.length && (
        <div style={{ display: "flex", gap: 8, padding: "7px 10px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", minWidth: 30 }}>···</span>
          <div style={{ display: "flex", gap: 3 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.2)", animation: `tdot 1s ease ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const InsightPanel = () => (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 7, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div style={{ padding: "9px 10px", background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
        <p style={{ fontSize: 9, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".07em", margin: "0 0 5px" }}>Sentiment</p>
        <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${sentiment}%`, background: sentimentColor, borderRadius: 3, transition: "all .6s ease" }} />
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, color: sentimentColor, margin: "4px 0 0", textAlign: "right" }}>{Math.round(sentiment)}%</p>
      </div>

      {objectionFired && (
        <div style={{ padding: "9px 10px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderLeft: "2px solid #ef4444", borderRadius: "0 8px 8px 0", animation: "linefade .3s ease" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 3px" }}>⚠ Pricing Objection · 91%</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.6)", margin: "0 0 5px", lineHeight: 1.45 }}>"price feels steep for our current budget"</p>
          <p style={{ fontSize: 10, color: "#0ef5d4", margin: 0, lineHeight: 1.4 }}>💡 Reframe to ROI — ask what one lost deal costs them annually</p>
        </div>
      )}

      {lines.length >= 4 && (
        <div style={{ padding: "9px 10px", background: "rgba(34,197,94,.05)", border: "1px solid rgba(34,197,94,.15)", borderRadius: 8, animation: "linefade .3s ease" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 4px" }}>✓ Buying Signals</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {["Pain confirmed: lost $220k deal", "Decision urgency present", "CFO involvement signaled"].slice(0, Math.max(1, lines.length - 3)).map((s, i) => (
              <p key={i} style={{ fontSize: 10, color: "rgba(255,255,255,.6)", margin: 0 }}>· {s}</p>
            ))}
          </div>
        </div>
      )}

      {lines.length >= 7 && (
        <div style={{ padding: "9px 10px", background: "rgba(129,140,248,.06)", border: "1px solid rgba(129,140,248,.18)", borderRadius: 8, animation: "linefade .3s ease" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 4px" }}>→ Next Action</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.65)", margin: 0, lineHeight: 1.45 }}>Send ROI calculator tailored to 60-rep team. Invite CFO to follow-up call.</p>
        </div>
      )}

      {showSummary && (
        <div style={{ padding: "10px 10px", background: "rgba(14,245,212,.08)", border: "1px solid rgba(14,245,212,.2)", borderRadius: 8, animation: "linefade .3s ease" }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: "#0ef5d4", textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 5px" }}>✨ Summary Ready</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,.65)", margin: "0 0 5px", lineHeight: 1.45 }}>Prospect qualified. Pricing objection handled. CFO approval required.</p>
          <div style={{ display: "flex", gap: 4 }}>
            <div style={{ flex: 1, padding: "5px", background: "rgba(255,122,89,.12)", border: "1px solid rgba(255,122,89,.2)", borderRadius: 6, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#FF7A59" }}>→ HubSpot</div>
            <div style={{ flex: 1, padding: "5px", background: "rgba(0,161,224,.12)", border: "1px solid rgba(0,161,224,.2)", borderRadius: 6, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#00A1E0" }}>→ Salesforce</div>
          </div>
        </div>
      )}

      {lines.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 10px", color: "rgba(255,255,255,.2)" }}>
          <p style={{ fontSize: 11, margin: 0 }}>AI insights appear here as the call runs</p>
        </div>
      )}
    </div>
  );

  const StatsBar = ({ compact = false }) => (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
      borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0,
    }}>
      {[
        { l: "Sentiment", v: `${Math.round(sentiment)}%`, c: sentimentColor },
        { l: "Objections", v: objectionFired ? "1" : "0", c: objectionFired ? "#f59e0b" : "rgba(255,255,255,.35)" },
        { l: "Lines", v: String(lines.length), c: "rgba(255,255,255,.6)" },
        { l: compact ? "Talk%" : "Talk Ratio", v: lines.length > 0 ? `${Math.round((lines.filter(l => l.speaker === "You").length / lines.length) * 100)}%` : "—", c: "#818cf8" },
      ].map(s => (
        <div key={s.l} style={{ padding: compact ? "7px 6px" : "8px 12px", textAlign: "center", borderRight: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: s.c, fontFamily: "'Bricolage Grotesque', sans-serif", lineHeight: 1 }}>{s.v}</div>
          <div style={{ fontSize: compact ? 8 : 9, color: "rgba(255,255,255,.3)", marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.l}</div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ── Desktop layout (≥ 861px) ── */}
      <div className="demo-desktop" style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr 260px",
        gap: 0,
        background: "#080c18",
        border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 18,
        overflow: "hidden",
        height: 520,
      }}>
        {/* Feature sidebar */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,.07)", background: "#060912", padding: "12px 0", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ padding: "6px 14px 12px", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".1em", margin: 0 }}>Live Features</p>
          </div>
          {FEATURES.map(f => (
            <button key={f.id} onClick={() => { setActiveFeature(f.id); if (!isPlaying && lines.length === 0) handlePlay(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: activeFeature === f.id ? "rgba(14,245,212,.08)" : "transparent", border: "none", borderLeft: `2px solid ${activeFeature === f.id ? "#0ef5d4" : "transparent"}`, cursor: "pointer", textAlign: "left", transition: "all .13s" }}>
              <span style={{ fontSize: 14 }}>{f.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: activeFeature === f.id ? "#0ef5d4" : "rgba(255,255,255,.4)", lineHeight: 1.3 }}>{f.label}</span>
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
            <button onClick={handlePlay} disabled={isPlaying}
              style={{ width: "100%", padding: "8px 0", background: isPlaying ? "rgba(255,255,255,.05)" : "linear-gradient(135deg, #0ef5d4, #06b6d4)", border: "none", borderRadius: 8, color: isPlaying ? "rgba(255,255,255,.3)" : "#060912", fontSize: 11, fontWeight: 700, cursor: isPlaying ? "default" : "pointer", transition: "all .13s" }}>
              {isPlaying ? "● Running..." : "▶ Run Demo"}
            </button>
            {!isPlaying && lines.length > 0 && (
              <button onClick={reset} style={{ width: "100%", marginTop: 4, padding: "5px 0", background: "transparent", border: "none", color: "rgba(255,255,255,.25)", fontSize: 10, cursor: "pointer" }}>Reset</button>
            )}
          </div>
        </div>

        {/* Transcript panel */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(255,255,255,.02)" }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)", margin: 0, fontFamily: "'Bricolage Grotesque', sans-serif" }}>Acme Corp — Enterprise Discovery</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", margin: "2px 0 0" }}>100ms native room · No bot required</p>
            </div>
            {isPlaying && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 20, padding: "3px 10px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "livepulse 1.4s ease-out infinite" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171" }}>LIVE</span>
              </div>
            )}
          </div>
          <StatsBar />
          <TranscriptLines ref={transcriptRef} />
          <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,.07)", background: "rgba(14,245,212,.03)", flexShrink: 0 }}>
            <p style={{ fontSize: 11, color: "rgba(14,245,212,.8)", margin: 0 }}>
              <span style={{ fontWeight: 700 }}>Active: {FEATURES.find(f => f.id === activeFeature)?.label}</span>
              {" — "}{FEATURES.find(f => f.id === activeFeature)?.desc}
            </p>
          </div>
        </div>

        {/* AI Coach panel */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,.07)", background: "#060912", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".1em", margin: 0 }}>AI Coach</p>
          </div>
          <InsightPanel />
        </div>
      </div>

      {/* ── Mobile layout (≤ 860px) ── */}
      <div className="demo-mobile" style={{ background: "#080c18", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, overflow: "hidden" }}>
        {/* Mobile header */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,.02)" }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)", margin: 0 }}>Acme Corp — Discovery</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,.3)", margin: "2px 0 0" }}>100ms native · No bot</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isPlaying && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 20, padding: "3px 8px" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "livepulse 1.4s ease-out infinite" }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: "#f87171" }}>LIVE</span>
              </div>
            )}
            <button onClick={isPlaying ? reset : handlePlay}
              style={{ padding: "7px 14px", background: isPlaying ? "rgba(255,255,255,.07)" : "linear-gradient(135deg, #0ef5d4, #06b6d4)", border: "none", borderRadius: 8, color: isPlaying ? "rgba(255,255,255,.5)" : "#060912", fontSize: 11, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              {isPlaying ? "■ Stop" : "▶ Run"}
            </button>
          </div>
        </div>

        <StatsBar compact />

        {/* Mobile tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          {(["transcript", "insights"] as const).map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)}
              style={{ flex: 1, padding: "10px", background: "transparent", border: "none", borderBottom: `2px solid ${mobileTab === tab ? "#0ef5d4" : "transparent"}`, color: mobileTab === tab ? "#0ef5d4" : "rgba(255,255,255,.35)", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".07em", WebkitTapHighlightColor: "transparent" }}>
              {tab === "transcript" ? "🎙 Transcript" : "✨ AI Coach"}
            </button>
          ))}
        </div>

        {/* Mobile tab content */}
        <div style={{ height: 300 }}>
          {mobileTab === "transcript" ? (
            <div ref={mobileTranscriptRef} style={{ height: "100%", overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              {lines.length === 0 && !isPlaying && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎙</div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", margin: 0 }}>Tap "Run" to watch a live sales call</p>
                </div>
              )}
              {lines.map((line, i) => {
                const isYou = line.speaker === "You";
                const isPriceObj = i === 5;
                return (
                  <div key={i} style={{ display: "flex", gap: 7, padding: "7px 9px", borderRadius: 8, borderLeft: isPriceObj ? "2px solid #ef4444" : isYou ? "2px solid rgba(129,140,248,.3)" : "2px solid rgba(45,212,191,.25)", background: isPriceObj ? "rgba(239,68,68,.04)" : "transparent", animation: "linefade .3s ease" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: line.color, minWidth: 26, paddingTop: 2 }}>{line.speaker}</span>
                    <span style={{ fontSize: 12, color: isPriceObj ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.6)", lineHeight: 1.55 }}>{line.text}</span>
                  </div>
                );
              })}
              {isPlaying && lines.length < DEMO_SCRIPT.length && (
                <div style={{ display: "flex", gap: 7, padding: "7px 9px" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", minWidth: 26 }}>···</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.2)", animation: `tdot 1s ease ${i * 0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ height: "100%", overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              <InsightPanel />
            </div>
          )}
        </div>

        {/* Mobile feature chips */}
        <div className="hide-scroll" style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,.07)", overflowX: "auto", display: "flex", gap: 6 }}>
          {FEATURES.map(f => (
            <button key={f.id} onClick={() => setActiveFeature(f.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: activeFeature === f.id ? "rgba(14,245,212,.1)" : "rgba(255,255,255,.04)", border: `1px solid ${activeFeature === f.id ? "rgba(14,245,212,.3)" : "rgba(255,255,255,.08)"}`, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", WebkitTapHighlightColor: "transparent", flexShrink: 0 }}>
              <span style={{ fontSize: 11 }}>{f.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: activeFeature === f.id ? "#0ef5d4" : "rgba(255,255,255,.4)" }}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Bot vs Native comparison ─────────────────────────────────────────────────

function BotComparison() {
  const [tab, setTab] = useState<"bot" | "native">("bot");

  const botProblems = [
    { icon: "🤖", title: "The bot announces itself", desc: "\"Fixsense AI Bot has joined the call\" — the moment trust erodes and prospects clam up." },
    { icon: "🔒", title: "Waiting room blocks", desc: "Hosts must manually admit the bot. One distracted moment and no recording at all." },
    { icon: "📡", title: "Audio quality degrades", desc: "Third-party bots re-encode audio, introducing lag, artifacts, and transcription errors." },
    { icon: "⏳", title: "Join delays kill first impressions", desc: "The bot takes 30–90 seconds to join — missing your opening and the prospect's first reaction." },
    { icon: "🚫", title: "Prospects disable recording", desc: "31% of enterprise prospects opt out when they see a bot on the call." },
    { icon: "💸", title: "Platform dependency", desc: "Zoom or Meet goes down? Your entire call recording infrastructure goes down with it." },
  ];

  const nativeAdvantages = [
    { icon: "🏠", title: "Your room, your rules", desc: "Fixsense IS the meeting. Zero third-party tools. Zero permission requests. Zero bots." },
    { icon: "⚡", title: "Instant transcription start", desc: "Audio capture begins the moment the call connects — not 60 seconds later." },
    { icon: "🔐", title: "100% private by design", desc: "Your calls never touch Zoom, Google, or Microsoft servers. Fully encrypted, fully yours." },
    { icon: "🎯", title: "No waiting room surprises", desc: "Share one link. Prospect joins immediately. Recording is seamless and silent." },
    { icon: "📊", title: "Native AI hooks", desc: "Our infrastructure talks directly to our AI models — not via exported files and webhooks." },
    { icon: "💪", title: "Works when Zoom doesn't", desc: "Built on 100ms enterprise infrastructure with 99.99% uptime SLA independent of Big Tech." },
  ];

  return (
    <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <button onClick={() => setTab("bot")}
          style={{ flex: 1, padding: "12px 10px", border: "none", background: tab === "bot" ? "rgba(239,68,68,.06)" : "transparent", borderBottom: `2px solid ${tab === "bot" ? "#ef4444" : "transparent"}`, cursor: "pointer", transition: "all .15s", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: tab === "bot" ? "#f87171" : "rgba(255,255,255,.35)" }}>🤖 Bot Approach (Fails)</span>
        </button>
        <button onClick={() => setTab("native")}
          style={{ flex: 1, padding: "12px 10px", border: "none", background: tab === "native" ? "rgba(14,245,212,.04)" : "transparent", borderBottom: `2px solid ${tab === "native" ? "#0ef5d4" : "transparent"}`, cursor: "pointer", transition: "all .15s", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: tab === "native" ? "#0ef5d4" : "rgba(255,255,255,.35)" }}>🏠 Native (Fixsense)</span>
        </button>
      </div>
      <div className="bot-comparison-grid" style={{ padding: "20px" }}>
        {(tab === "bot" ? botProblems : nativeAdvantages).map((item, i) => (
          <div key={i} style={{ padding: "14px", background: tab === "bot" ? "rgba(239,68,68,.04)" : "rgba(14,245,212,.03)", border: `1px solid ${tab === "bot" ? "rgba(239,68,68,.15)" : "rgba(14,245,212,.12)"}`, borderRadius: 12 }}>
            <span style={{ fontSize: 20, display: "block", marginBottom: 6 }}>{item.icon}</span>
            <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)", margin: "0 0 5px" }}>{item.title}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.45)", margin: 0, lineHeight: 1.55 }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [problemStep, setProblemStep] = useState(0);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  useEffect(() => {
    const timer = setInterval(() => setProblemStep(p => (p + 1) % PROBLEMS.length), 3200);
    return () => clearInterval(timer);
  }, []);

  const NAV = [
    { label: "Problem", href: "#problem" },
    { label: "Demo", href: "#demo" },
    { label: "Why Native", href: "#native" },
    { label: "Pricing", href: "/pricing" },
  ];

  const PROBLEMS = [
    { stat: "$1.2M", label: "Average annual revenue lost to unhandled objections in a 20-rep team", icon: "💸" },
    { stat: "67%", label: "Of sales reps can't articulate why they lost a deal after the fact", icon: "🤷" },
    { stat: "31%", label: "Of prospects disengage when they see a recording bot join the call", icon: "🚪" },
    { stat: "4 hrs", label: "Average time wasted per rep per week on CRM updates and call notes", icon: "⏰" },
  ];

  const FAQS = [
    { q: "Why not just use Zoom with a bot?", a: "Bots announce themselves to the call, require host approval, degrade audio quality, and miss the first 60 seconds of every call. Fixsense's native meeting infrastructure is invisible to the prospect — transcription starts the instant the call connects, with zero friction." },
    { q: "How is this different from Gong or Chorus?", a: "Gong and Chorus record calls via bots and analyze them after the fact. Fixsense gives you real-time objection detection, sentiment scoring, and coaching suggestions while the call is happening — so you can fix the deal in the moment, not in the post-mortem." },
    { q: "What does 'native meeting infrastructure' mean?", a: "Fixsense is built on 100ms, an enterprise-grade WebRTC platform used by companies like Reddit and Discord. Your call room lives inside Fixsense — there's no Zoom, no Meet, no Teams. Your audio goes directly to our AI without passing through any third-party systems." },
    { q: "Can prospects join without downloading anything?", a: "Yes. Prospects click your link, enter their name, and join directly in the browser. No accounts, no downloads, no \"allow recording\" dialogs. The experience is frictionless for them and fully captured for you." },
    { q: "What about teams who already use Zoom?", a: "Fixsense is your sales call platform. You use it for prospect calls where you need intelligence. Internal Zoom calls stay on Zoom. The switch is gradual — most teams move all their prospect calls within 2 weeks of seeing the results." },
  ];

  const COMPARISON = [
    { feature: "Real-time objection detection", fixsense: true, gong: false, chorus: false, bot: false },
    { feature: "No bot joining the call", fixsense: true, gong: false, chorus: false, bot: false },
    { feature: "Native meeting room (no Zoom needed)", fixsense: true, gong: false, chorus: false, bot: false },
    { feature: "Live sentiment pulse", fixsense: true, gong: "delayed", chorus: "delayed", bot: false },
    { feature: "AI coaching mid-call", fixsense: true, gong: false, chorus: false, bot: false },
    { feature: "Deal timeline AI", fixsense: true, gong: true, chorus: false, bot: false },
    { feature: "Coaching clips library", fixsense: true, gong: true, chorus: true, bot: false },
    { feature: "Transparent pricing", fixsense: true, gong: false, chorus: false, bot: true },
    { feature: "Built for SMB & growth teams", fixsense: true, gong: false, chorus: false, bot: true },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .lp{
      --bg:#04060f;--bg2:#080c18;--bg3:#0c1022;
      --ink:#eef0f8;--ink2:rgba(238,240,248,0.65);--mu:rgba(238,240,248,0.38);--mu2:rgba(238,240,248,0.18);
      --br:rgba(255,255,255,0.07);--br2:rgba(255,255,255,0.04);
      --cyan:#0ef5d4;--cyan2:rgba(14,245,212,0.12);--cyan3:rgba(14,245,212,0.06);
      --red:#ef4444;--amber:#f59e0b;--green:#22c55e;
      --fd:'Bricolage Grotesque',system-ui,sans-serif;
      --fb:'Instrument Sans',system-ui,sans-serif;
      --fm:'JetBrains Mono',monospace;
      background:var(--bg);color:var(--ink);font-family:var(--fb);
      -webkit-font-smoothing:antialiased;overflow-x:hidden;line-height:1.6;min-height:100vh;
    }
    @keyframes livepulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 5px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
    @keyframes linefade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    @keyframes tdot{0%,80%,100%{opacity:.3;transform:scale(1)}40%{opacity:1;transform:scale(1.15)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
    @keyframes mobileslide{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}

    /* ─── NAV ─────────────────────────────────────────── */
    .nav{position:fixed;top:0;left:0;right:0;z-index:100;height:58px;display:flex;align-items:center;padding:0 20px;transition:all .3s;}
    .nav.sc{background:rgba(4,6,15,0.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-bottom:1px solid var(--br);}
    .nav-i{max-width:1160px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;flex-shrink:0;}
    .nav-name{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.03em;}
    .nav-links{display:flex;align-items:center;gap:22px;}
    .nav-link{font-size:13px;font-weight:500;color:var(--mu);text-decoration:none;transition:color .2s;}
    .nav-link:hover{color:var(--ink);}
    .nav-acts{display:flex;align-items:center;gap:6px;flex-shrink:0;}
    .btn-ghost{font-size:13px;font-weight:500;color:var(--mu);background:none;border:none;padding:7px 12px;border-radius:8px;cursor:pointer;text-decoration:none;transition:color .15s;font-family:var(--fb);-webkit-tap-highlight-color:transparent;}
    .btn-ghost:hover{color:var(--ink);}
    .btn-cta{font-size:13px;font-weight:600;color:var(--bg);background:var(--cyan);border:none;padding:8px 16px;border-radius:8px;cursor:pointer;text-decoration:none;transition:all .15s;white-space:nowrap;font-family:var(--fb);-webkit-tap-highlight-color:transparent;}
    .btn-cta:hover{opacity:.88;}

    /* Hamburger */
    .hamburger{display:none;flex-direction:column;justify-content:center;gap:5px;width:38px;height:38px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;cursor:pointer;padding:10px 9px;-webkit-tap-highlight-color:transparent;flex-shrink:0;}
    .hamburger span{display:block;height:1.5px;background:var(--ink);border-radius:2px;transition:all .25s;}
    .hamburger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg);}
    .hamburger.open span:nth-child(2){opacity:0;transform:scaleX(0);}
    .hamburger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg);}

    /* Mobile menu */
    .mobile-menu{display:none;position:fixed;inset:0;top:58px;z-index:99;background:rgba(4,6,15,0.99);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);flex-direction:column;padding:24px 20px;border-top:1px solid var(--br);overflow-y:auto;}
    .mobile-menu.open{display:flex;animation:mobileslide .22s ease;}
    .mobile-menu-link{font-family:var(--fd);font-size:24px;font-weight:700;color:var(--mu);text-decoration:none;padding:16px 0;border-bottom:1px solid var(--br);transition:color .15s;-webkit-tap-highlight-color:transparent;display:block;}
    .mobile-menu-link:active{color:var(--ink);}
    .mobile-menu-ctas{margin-top:auto;display:flex;flex-direction:column;gap:10px;padding-top:28px;}

    @media(max-width:768px){
      .nav-links,.nav-acts .btn-ghost{display:none;}
      .hamburger{display:flex;}
    }

    /* ─── HERO ─────────────────────────────────────────── */
    .hero{padding:110px 20px 72px;position:relative;overflow:hidden;}
    .hero-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(14,245,212,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(14,245,212,.03) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,black 0%,transparent 100%);-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,black 0%,transparent 100%);}
    .hero-orb{position:absolute;top:-150px;left:50%;transform:translateX(-50%);width:800px;height:600px;background:radial-gradient(ellipse,rgba(14,245,212,.06) 0%,transparent 65%);pointer-events:none;}
    .hero-inner{max-width:1160px;margin:0 auto;position:relative;z-index:1;}
    .hero-tag{display:inline-flex;align-items:center;gap:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:100px;padding:5px 14px 5px 5px;font-size:11px;font-weight:600;color:#f87171;margin-bottom:24px;font-family:var(--fm);}
    .hero-tag-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse 2s ease-in-out infinite;flex-shrink:0;}
    .hero-h{font-family:var(--fd);font-size:clamp(32px,7vw,76px);font-weight:800;line-height:1.06;letter-spacing:-.05em;color:var(--ink);max-width:900px;margin-bottom:20px;}
    .hero-h .loss{color:#ef4444;}
    .hero-h .gain{color:var(--cyan);}
    .hero-h .muted{color:var(--mu);}
    .hero-sub{font-size:clamp(15px,2.2vw,20px);color:var(--ink2);line-height:1.7;max-width:560px;margin-bottom:30px;}
    .hero-ctas{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:36px;}
    .btn-main{display:inline-flex;align-items:center;gap:8px;background:var(--cyan);color:var(--bg);border:none;border-radius:10px;padding:14px 26px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;transition:all .2s;font-family:var(--fb);-webkit-tap-highlight-color:transparent;}
    .btn-main:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 12px 32px rgba(14,245,212,.25);}
    .btn-outline{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--ink2);border:1px solid var(--br);border-radius:10px;padding:14px 24px;font-size:15px;font-weight:500;cursor:pointer;text-decoration:none;transition:all .2s;font-family:var(--fb);-webkit-tap-highlight-color:transparent;}
    .btn-outline:hover{border-color:rgba(255,255,255,.2);color:var(--ink);}
    .hero-trust{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
    .trust-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mu);font-weight:500;}

    @media(max-width:560px){
      .hero{padding:94px 16px 56px;}
      .hero-ctas{flex-direction:column;align-items:stretch;}
      .btn-main,.btn-outline{justify-content:center;padding:14px 20px;font-size:14px;}
      .hero-trust{gap:8px;}
      .trust-item{font-size:11px;}
    }

    /* ─── SECTIONS (shared) ─────────────────────────────── */
    .sec-kicker{font-family:var(--fm);font-size:10px;font-weight:600;color:var(--cyan);text-transform:uppercase;letter-spacing:.16em;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
    .sec-kicker::before{content:'';display:inline-block;width:20px;height:1px;background:var(--cyan);}
    .sec-title{font-family:var(--fd);font-size:clamp(26px,5vw,50px);font-weight:800;color:var(--ink);letter-spacing:-.04em;line-height:1.1;margin-bottom:14px;}
    .sec-sub{font-size:15px;color:var(--ink2);line-height:1.72;max-width:520px;}

    /* ─── PROBLEM ─────────────────────────────────────────── */
    .problem{padding:80px 20px;background:var(--bg2);}
    .problem-i{max-width:1160px;margin:0 auto;}
    .problem-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:40px;}
    .problem-stat{background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.12);border-radius:14px;padding:20px;}
    .problem-stat-icon{font-size:20px;margin-bottom:8px;}
    .problem-stat-num{font-family:var(--fd);font-size:clamp(26px,4vw,36px);font-weight:800;color:#f87171;letter-spacing:-.04em;line-height:1;margin-bottom:6px;}
    .problem-stat-label{font-size:11px;color:rgba(239,68,68,.6);line-height:1.5;}
    @media(max-width:860px){.problem-stats{grid-template-columns:repeat(2,1fr);}}
    @media(max-width:400px){.problem-stats{grid-template-columns:1fr 1fr;gap:8px;}.problem-stat{padding:14px;}}

    .pain-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-top:64px;}
    .pain-list{display:flex;flex-direction:column;gap:11px;}
    .pain-item{display:flex;gap:12px;padding:15px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;transition:border-color .2s;}
    .pain-icon{width:34px;height:34px;border-radius:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
    .pain-title{font-size:13px;font-weight:700;color:rgba(255,255,255,.8);margin:0 0 3px;}
    .pain-desc{font-size:12px;color:rgba(255,255,255,.4);margin:0;line-height:1.55;}
    @media(max-width:800px){.pain-grid{grid-template-columns:1fr;gap:24px;margin-top:36px;}}

    /* ─── DEMO ─────────────────────────────────────────── */
    .demo-section{padding:80px 20px;background:var(--bg);}
    .demo-i{max-width:1160px;margin:0 auto;}
    .demo-header{text-align:center;margin-bottom:36px;}
    .demo-desktop{display:grid!important;}
    .demo-mobile{display:none!important;}
    @media(max-width:860px){
      .demo-desktop{display:none!important;}
      .demo-mobile{display:block!important;}
    }

    /* ─── BOT ─────────────────────────────────────────── */
    .bot-section{padding:80px 20px;background:var(--bg2);}
    .bot-i{max-width:1160px;margin:0 auto;}
    .bot-intro-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start;margin-bottom:48px;}
    .bot-stats-col{display:flex;flex-direction:column;gap:9px;}
    .bot-comparison-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
    @media(max-width:860px){
      .bot-intro-grid{grid-template-columns:1fr;gap:28px;margin-bottom:36px;}
      .bot-comparison-grid{grid-template-columns:1fr 1fr;}
    }
    @media(max-width:500px){
      .bot-comparison-grid{grid-template-columns:1fr;}
    }

    /* ─── COMPARISON ─────────────────────────────────────── */
    .comp-section{padding:80px 20px;background:var(--bg);}
    .comp-i{max-width:1160px;margin:0 auto;}
    .comp-table{width:100%;border-collapse:collapse;margin-top:32px;border:1px solid var(--br);border-radius:14px;overflow:hidden;}
    .comp-th{padding:12px 14px;text-align:center;font-size:12px;font-weight:700;background:rgba(255,255,255,.03);border-bottom:1px solid var(--br);}
    .comp-th:first-child{text-align:left;}
    .comp-th.fixsense-col{color:var(--cyan);background:rgba(14,245,212,.04);position:relative;}
    .comp-th.fixsense-col::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--cyan);}
    .comp-tr{border-bottom:1px solid rgba(255,255,255,.04);}
    .comp-tr:nth-child(even){background:rgba(255,255,255,.015);}
    .comp-td{padding:10px 14px;text-align:center;font-size:12px;}
    .comp-td:first-child{text-align:left;color:rgba(255,255,255,.6);font-weight:500;}
    .comp-td.fixsense-col{background:rgba(14,245,212,.025);}
    @media(max-width:580px){
      .comp-th,.comp-td{padding:8px 10px;font-size:11px;}
      /* Hide Bot only column on small screens */
      .comp-th:nth-child(5),.comp-td:nth-child(5){display:none;}
    }

    /* ─── TESTIMONIALS ─────────────────────────────────── */
    .testi-section{padding:80px 20px;background:var(--bg2);}
    .testi-i{max-width:1160px;margin:0 auto;}
    .testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px;}
    .testi-card{background:rgba(255,255,255,.025);border:1px solid var(--br);border-radius:16px;padding:22px;display:flex;flex-direction:column;transition:border-color .2s,transform .2s;}
    .testi-card:hover{border-color:rgba(14,245,212,.18);transform:translateY(-2px);}
    .testi-metric{display:inline-block;background:var(--cyan2);color:var(--cyan);border:1px solid rgba(14,245,212,.2);border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;margin-bottom:12px;font-family:var(--fm);}
    .testi-quote{font-size:13px;color:var(--ink2);line-height:1.72;flex:1;margin-bottom:16px;}
    .testi-author{display:flex;align-items:center;gap:10px;border-top:1px solid var(--br);padding-top:14px;}
    .testi-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--cyan2),rgba(139,92,246,.15));border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);font-family:var(--fd);flex-shrink:0;}
    .testi-name{font-family:var(--fd);font-size:13px;font-weight:700;color:var(--ink);}
    .testi-role{font-size:11px;color:var(--mu);}
    @media(max-width:860px){.testi-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:540px){.testi-grid{grid-template-columns:1fr;}}

    /* ─── FINAL CTA ─────────────────────────────────────── */
    .final{padding:100px 20px;position:relative;overflow:hidden;text-align:center;}
    .final-orb{position:absolute;inset:0;background:radial-gradient(ellipse 65% 65% at 50% 50%,rgba(14,245,212,.055) 0%,transparent 65%);pointer-events:none;}
    .final-i{position:relative;z-index:1;max-width:600px;margin:0 auto;}
    .final-h{font-family:var(--fd);font-size:clamp(28px,6vw,60px);font-weight:800;color:var(--ink);letter-spacing:-.05em;line-height:1.07;margin-bottom:14px;}
    .final-p{font-size:16px;color:var(--ink2);line-height:1.7;margin-bottom:30px;}
    .final-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
    @media(max-width:480px){
      .final{padding:80px 16px;}
      .final-ctas{flex-direction:column;align-items:stretch;padding:0 4px;}
      .final-ctas a{justify-content:center;}
    }

    /* ─── FAQ ─────────────────────────────────────────── */
    .faq-section{padding:80px 20px;background:var(--bg2);}
    .faq-i{max-width:760px;margin:0 auto;}
    .faq-item{border:1px solid var(--br);border-radius:12px;margin-bottom:10px;overflow:hidden;}
    .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:15px 18px;background:transparent;border:none;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:var(--ink);font-family:var(--fb);gap:12px;transition:background .15s;-webkit-tap-highlight-color:transparent;min-height:48px;}
    .faq-q:hover{background:rgba(255,255,255,.03);}
    .faq-chev{flex-shrink:0;color:var(--mu);transition:transform .22s;}
    .faq-chev.op{transform:rotate(180deg);}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;padding:0 18px;}
    .faq-a.op{max-height:300px;padding:0 18px 18px;}
    .faq-a p{font-size:13px;color:var(--ink2);line-height:1.75;margin:0;}

    /* ─── FOOTER ─────────────────────────────────────────── */
    .footer{background:var(--bg2);padding:48px 20px 24px;border-top:1px solid var(--br);}
    .footer-i{max-width:1160px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid var(--br2);}
    .footer-brand-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
    .footer-brand-name{font-family:var(--fd);font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
    .footer-brand-desc{font-size:13px;color:var(--mu);line-height:1.65;max-width:210px;}
    .footer-col-title{font-size:10px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;font-family:var(--fm);}
    .footer-link{display:block;font-size:13px;color:var(--mu);text-decoration:none;margin-bottom:8px;transition:color .2s;}
    .footer-link:hover{color:var(--ink);}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
    .footer-legal{font-size:12px;color:var(--mu2);}
    .footer-ll{font-size:12px;color:var(--mu2);text-decoration:none;transition:color .2s;}
    .footer-ll:hover{color:var(--mu);}
    @media(max-width:960px){.footer-top{grid-template-columns:1fr 1fr;gap:28px;}}
    @media(max-width:480px){
      .footer-top{grid-template-columns:1fr 1fr;gap:20px;}
      .footer-bottom{flex-direction:column;align-items:flex-start;gap:8px;}
    }
    @media(max-width:360px){.footer-top{grid-template-columns:1fr;}}

    /* ─── UTILITIES ─────────────────────────────────────── */
    .hide-scroll::-webkit-scrollbar{display:none;}
    .hide-scroll{-ms-overflow-style:none;scrollbar-width:none;}
  `;

  const PAINS = [
    { icon: "😖", title: "You debrief without real data", desc: "\"I think they liked it\" — your entire post-call analysis is vibes. Deals die in the gaps you can't see." },
    { icon: "🔇", title: "Objections catch reps off guard", desc: "A pricing curveball at minute 23 and your rep fumbles. The moment passes. The deal softens." },
    { icon: "📋", title: "CRM updates eat hours", desc: "Your best reps spend 4 hours a week transcribing notes into Salesforce instead of selling." },
    { icon: "📉", title: "New reps ramp slowly and expensively", desc: "90-day ramp. One-on-one call reviews. Manual coaching. You can't scale what you can't see." },
  ];

  const TESTIMONIALS = [
    { metric: "+30% close rate", quote: "We used Chorus with bots before. Prospects noticed. Half our calls had awkward silences after 'Gong has joined'. Fixsense is invisible — and the real-time alerts are a completely different game.", name: "Sarah M.", role: "Head of Sales, Vantex Technologies", initials: "SM" },
    { metric: "90 → 45 day ramp", quote: "Our ramp time dropped in half because every new rep can watch their own calls analyzed the same day. No waiting for a manager to review. The AI tells them exactly what to fix.", name: "Priya N.", role: "CRO, Cloudpath", initials: "PN" },
    { metric: "3× win rate lift", quote: "The deal timeline feature is the thing nobody talks about enough. Seeing sentiment shift across 4 calls with the same prospect — you understand the relationship in a way that's genuinely unfair to competitors.", name: "James O.", role: "Founder, Launchflow", initials: "JO" },
  ];

  const Check = ({ on }: { on: boolean | string }) => {
    if (on === false) return <span style={{ color: "rgba(255,255,255,.18)", fontSize: 16 }}>—</span>;
    if (on === "delayed") return <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>after</span>;
    return <span style={{ color: "#22c55e", fontSize: 16 }}>✓</span>;
  };

  return (
    <div className="lp">
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className={`nav ${scrolled ? "sc" : ""}`}>
        <div className="nav-i">
          <Link to="/" className="nav-logo">
            <Logo size={26} />
            <span className="nav-name">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV.map(l => (
              l.href.startsWith("#")
                ? <a key={l.label} href={l.href} className="nav-link">{l.label}</a>
                : <Link key={l.label} to={l.href} className="nav-link">{l.label}</Link>
            ))}
          </div>
          <div className="nav-acts">
            {user ? (
              <Link to="/dashboard" className="btn-cta">Dashboard →</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-cta">Start Free →</Link>
              </>
            )}
            <button
              className={`hamburger ${mobileOpen ? "open" : ""}`}
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div className={`mobile-menu ${mobileOpen ? "open" : ""}`} role="dialog" aria-modal="true">
        {NAV.map(l => (
          l.href.startsWith("#")
            ? <a key={l.label} href={l.href} className="mobile-menu-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
            : <Link key={l.label} to={l.href} className="mobile-menu-link" onClick={() => setMobileOpen(false)}>{l.label}</Link>
        ))}
        <div className="mobile-menu-ctas">
          {user ? (
            <Link to="/dashboard" className="btn-main" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-outline" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link to="/login" className="btn-main" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>
                Start Free — No Card →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-orb" />
        <div className="hero-inner">
          <FadeIn delay={120}>
            <h1 className="hero-h">
              Your reps are flying <span className="loss">blind</span> on every call.<br />
              <span className="gain">Fixsense makes them</span> <span className="muted">prescient.</span>
            </h1>
          </FadeIn>
          <FadeIn delay={180}>
            <p className="hero-sub">
              Real-time objection detection. Live sentiment scoring. AI coaching mid-call. No bots. No Zoom dependency. Just your rep and the deal — with an AI co-pilot that never blinks.
            </p>
          </FadeIn>
          <FadeIn delay={230}>
            <div className="hero-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-main">
                See It Live — Free
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <a href="#demo" className="btn-outline">Interact with the demo</a>
            </div>
          </FadeIn>
          <FadeIn delay={270}>
            <div className="hero-trust">
              {["No Zoom required", "No bot joins", "AI in real time", "30 min free"].map((t, i) => (
                <div key={i} className="trust-item">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="6.5" cy="6.5" r="6" fill="rgba(14,245,212,.1)"/>
                    <path d="M4 6.5l1.5 1.5 3.5-3.5" stroke="#0ef5d4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="problem" id="problem">
        <div className="problem-i">
          <FadeIn>
            <div className="sec-kicker">The Revenue Problem</div>
            <h2 className="sec-title">Your team is leaving money on the table every single day</h2>
            <p className="sec-sub">This isn't a technology problem. It's a visibility problem. Your reps walk into every call with no intelligence and walk out with nothing but gut feelings.</p>
          </FadeIn>
          <FadeIn delay={80}>
            <div className="problem-stats">
              {PROBLEMS.map((p, i) => (
                <div key={i} className="problem-stat">
                  <div className="problem-stat-icon">{p.icon}</div>
                  <div className="problem-stat-num">{p.stat}</div>
                  <div className="problem-stat-label">{p.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
          <div className="pain-grid">
            <FadeIn>
              <div>
                <div className="sec-kicker">What this costs you</div>
                <h3 style={{ fontFamily: "var(--fd)", fontSize: "clamp(20px,3vw,32px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", lineHeight: 1.15, marginBottom: 14 }}>
                  Every call without Fixsense is an unforced error
                </h3>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72, marginBottom: 14 }}>
                  The problem isn't that your reps can't sell. They're doing their best in the dark. The moment a prospect raises a budget objection and your rep stumbles — that deal has a 67% chance of never closing.
                </p>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72 }}>
                  Fixsense puts a co-pilot in every call. Not after. Not in a debrief. <em>During the moment that matters.</em>
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={100}>
              <div className="pain-list">
                {PAINS.map((p, i) => (
                  <div key={i} className="pain-item">
                    <div className="pain-icon">{p.icon}</div>
                    <div>
                      <p className="pain-title">{p.title}</p>
                      <p className="pain-desc">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── DEMO ── */}
      <section className="demo-section" id="demo">
        <div className="demo-i">
          <FadeIn>
            <div className="demo-header">
              <div className="sec-kicker" style={{ justifyContent: "center" }}>Live Interactive Demo</div>
              <h2 className="sec-title" style={{ maxWidth: 700, margin: "0 auto 12px", textAlign: "center" }}>
                Click a feature. Run the demo. See exactly what your reps would see.
              </h2>
              <p style={{ fontSize: 15, color: "var(--ink2)", textAlign: "center", maxWidth: 520, margin: "0 auto 28px" }}>
                This is a real simulation of a Fixsense call room. Hit "Run Demo" to watch an $850k enterprise call play out — with every feature working live.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <LiveDemo />
          </FadeIn>
          <FadeIn delay={120}>
            <div className="hide-scroll" style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 20, overflowX: "auto" }}>
              {["Pricing objections flagged instantly", "Sentiment tracks every turn", "One-click push to CRM"].map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(14,245,212,.05)", border: "1px solid rgba(14,245,212,.12)", borderRadius: 20, padding: "5px 14px", fontSize: 12, color: "rgba(14,245,212,.8)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" fill="rgba(14,245,212,.1)"/><path d="M3.5 6l1.5 1.5 3.5-3" stroke="#0ef5d4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {t}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── BOT vs NATIVE ── */}
      <section className="bot-section" id="native">
        <div className="bot-i">
          <FadeIn>
            <div className="bot-intro-grid">
              <div>
                <div className="sec-kicker">Why Not Just Use a Bot?</div>
                <h2 className="sec-title">Bots poison the call before your rep says a word</h2>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72, marginBottom: 14 }}>
                  Every other conversation intelligence tool relies on a third-party bot joining your Zoom or Meet call. The moment that bot appears, 31% of enterprise prospects disengage. The trust signal is broken before you've earned it.
                </p>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72 }}>
                  Fixsense doesn't join your call — <strong style={{ color: "var(--ink)" }}>Fixsense IS your call.</strong> We built native meeting infrastructure on 100ms so there's no bot, no third-party server, no "allow recording" dialog.
                </p>
              </div>
              <div className="bot-stats-col">
                {[
                  { label: "Traditional bot (Gong, Chorus)", value: "31% prospect opt-out", bad: true },
                  { label: "Fixsense native room", value: "0% visible to prospect", bad: false },
                  { label: "Bot join delay (avg)", value: "45–90 seconds missed", bad: true },
                  { label: "Fixsense capture starts", value: "Instant — call second 0", bad: false },
                  { label: "Audio quality (bot re-encoded)", value: "Degraded + lag", bad: true },
                  { label: "Fixsense audio pipeline", value: "Native WebRTC — zero loss", bad: false },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: row.bad ? "rgba(239,68,68,.04)" : "rgba(14,245,212,.04)", border: `1px solid ${row.bad ? "rgba(239,68,68,.15)" : "rgba(14,245,212,.12)"}`, gap: 10 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,.55)" }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: row.bad ? "#f87171" : "#0ef5d4", flexShrink: 0 }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <BotComparison />
          </FadeIn>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="comp-section">
        <div className="comp-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div className="sec-kicker" style={{ justifyContent: "center" }}>Competitor Comparison</div>
              <h2 className="sec-title" style={{ textAlign: "center" }}>Fixsense vs everyone else</h2>
              <p style={{ fontSize: 15, color: "var(--ink2)", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
                Enterprise tools charge $100k/yr and deliver post-call analysis. We give you real-time intelligence for a fraction of the cost.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              <table className="comp-table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th className="comp-th" style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,.35)" }}>Feature</th>
                    <th className="comp-th fixsense-col">Fixsense</th>
                    <th className="comp-th" style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Gong</th>
                    <th className="comp-th" style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Chorus</th>
                    <th className="comp-th" style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Bot only</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={i} className="comp-tr">
                      <td className="comp-td">{row.feature}</td>
                      <td className="comp-td fixsense-col"><Check on={row.fixsense} /></td>
                      <td className="comp-td"><Check on={row.gong} /></td>
                      <td className="comp-td"><Check on={row.chorus} /></td>
                      <td className="comp-td"><Check on={row.bot} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeIn>
          <FadeIn delay={100}>
            <div style={{ marginTop: 18, padding: "14px 18px", background: "rgba(14,245,212,.04)", border: "1px solid rgba(14,245,212,.12)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 13, color: "var(--ink2)", margin: 0 }}>
                Gong starts at <strong style={{ color: "#f87171" }}>$100k/year</strong>. Fixsense starts at <strong style={{ color: "#0ef5d4" }}>$18/month</strong> with more real-time features.
              </p>
              <Link to="/pricing" className="btn-main" style={{ padding: "10px 20px", fontSize: 13 }}>See Full Pricing</Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="testi-section">
        <div className="testi-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div className="sec-kicker" style={{ justifyContent: "center" }}>Real Results</div>
              <h2 className="sec-title" style={{ textAlign: "center" }}>Teams that made the switch</h2>
            </div>
          </FadeIn>
          <div className="testi-grid">
            {TESTIMONIALS.map((t, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="testi-card">
                  <div className="testi-metric">{t.metric}</div>
                  <p className="testi-quote">"{t.quote}"</p>
                  <div className="testi-author">
                    <div className="testi-av">{t.initials}</div>
                    <div>
                      <div className="testi-name">{t.name}</div>
                      <div className="testi-role">{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq-section">
        <div className="faq-i">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div className="sec-kicker" style={{ justifyContent: "center" }}>Common Questions</div>
              <h2 className="sec-title" style={{ textAlign: "center", fontSize: "clamp(22px,4vw,40px)" }}>Questions we get every day</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            {FAQS.map((f, i) => (
              <div key={i} className="faq-item">
                <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                  {f.q}
                  <svg className={`faq-chev ${activeFaq === i ? "op" : ""}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 5.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className={`faq-a ${activeFaq === i ? "op" : ""}`}><p>{f.a}</p></div>
              </div>
            ))}
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final">
        <div className="final-orb" />
        <div className="final-i">
          <FadeIn>
            <h2 className="final-h">Stop running sales calls on gut feeling.</h2>
            <p className="final-p">The next deal your rep loses to an unhandled objection could have been saved. Start with 30 free minutes — no card, no bot, no Zoom required.</p>
            <div className="final-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-main">
                Start for free — no card
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Link to="/pricing" className="btn-outline">View full pricing</Link>
            </div>
            <p style={{ marginTop: 16, fontSize: 12, color: "var(--mu)" }}>
              30 min/month free · No bot joins your calls · Native meeting room included
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-i">
          <div className="footer-top">
            <div>
              <div className="footer-brand-logo"><Logo size={22} /><span className="footer-brand-name">Fixsense</span></div>
              <p className="footer-brand-desc">Real-time AI sales intelligence. No bots. No Zoom dependency. Just your rep and the deal.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#demo","Live Demo"],["#native","Why Native"],["/pricing","Pricing"],["/changelog","Changelog"]].map(([h,l])=>(
                <a key={h} href={h} className="footer-link">{l}</a>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              {[["/about","About"],["/blog","Blog"],["/testimonials","Stories"],["/contact","Contact"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/security","Security"],["/contact","Contact"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div style={{ display: "flex", gap: 16 }}>
              <Link to="/privacy" className="footer-ll">Privacy</Link>
              <Link to="/terms" className="footer-ll">Terms</Link>
              <Link to="/security" className="footer-ll">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}