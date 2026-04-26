import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type ScenarioKey = "cold_call" | "saas_demo" | "enterprise";

interface AnalysisResult {
  sentiment: number;
  sentimentLabel: string;
  dealRisk: number;
  objections: { timestamp: string; text: string; response: string }[];
  opportunities: string[];
  revenueAtRisk: string;
  coachingTips: string[];
}

// ─── Scroll animation hook ────────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0, y = 28 }: { children: React.ReactNode; delay?: number; y?: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : `translateY(${y}px)`,
      transition: `opacity 0.75s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.75s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ size = 30 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />
  );
}

// ─── Animated Counter ────────────────────────────────────────────────────────
function AnimCounter({ target, prefix = "", suffix = "", duration = 1800 }: {
  target: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [val, setVal] = useState(0);
  const { ref, inView } = useInView(0.3);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ─── LIVE DEMO ────────────────────────────────────────────────────────────────
const SCENARIOS: Record<ScenarioKey, { label: string; emoji: string; transcript: string }> = {
  cold_call: {
    label: "Cold Call",
    emoji: "📞",
    transcript: `Rep: Hi Sarah, this is Marcus from Fixsense. I know you're busy — I'll be quick. We help sales teams like yours stop losing deals to objections they never saw coming. Is that something worth 2 minutes?
Prospect: We already have a tool for call recording. I don't think we need another.
Rep: Totally fair — most teams have recording. What they're missing is real-time intelligence. When a prospect says your pricing is too high, your reps find out in the debrief. We tell them in 3 seconds, with a counter-response ready.
Prospect: How much does it cost? We're pretty budget-constrained right now.
Rep: Less than losing one deal. Our Growth plan is $29/month. One recovered deal pays for 3 years. What's your average deal size?
Prospect: Around $40k... ok that's a fair point. Can you send me more info?`
  },
  saas_demo: {
    label: "SaaS Demo",
    emoji: "🎯",
    transcript: `Rep: Today I'll show you how Fixsense works inside a real call. Before I do — what's your biggest pain point with your current sales process?
Prospect: Honestly? Our reps wing it on objection handling. We lose deals we should win because they freeze on pricing questions.
Rep: That's exactly what we fix. Let me show you what your rep would see in real-time...
Prospect: This looks interesting but we tried Gong and our team hated the bots joining calls. Prospects always got uncomfortable.
Rep: That's a fair concern — and it's why we built natively. No bot joins your calls. Fixsense IS your meeting room. Zero friction for the prospect.
Prospect: Okay that's actually a differentiator. What about our CRM? We're on Salesforce.
Rep: One-click sync. Call score, sentiment, objections, next steps — pushed automatically the moment the call ends.
Prospect: I want to run this by our VP of Sales. Can you set up a trial?`
  },
  enterprise: {
    label: "Enterprise Pitch",
    emoji: "🏢",
    transcript: `Rep: Thank you for the time today. I understand your team has 60 reps across 4 regions and you're looking to standardize your sales methodology.
Prospect: That's right. Our biggest problem is consistency. Top reps close at 34%, bottom at 8%. We need to close that gap.
Rep: We've seen that exact gap at teams your size. Fixsense gives every rep the same AI co-pilot as your top performers — live objection handling, real-time sentiment, guided responses.
Prospect: We've had concerns about security. Our legal team will have questions about where call data is stored.
Rep: Understood. We're SOC2 certified, GDPR compliant, AES-256 encryption at rest. All data stays in your region. I can send our security whitepaper today.
Prospect: What's the implementation timeline? We can't afford disruption.
Rep: Most enterprise teams are live in 48 hours. No new hardware, no IT involvement. Reps download nothing — they join through a link.
Prospect: The price will be a sticking point. We're locked into our current tool through Q2.
Rep: Perfect timing — we offer a phased migration with no overlap billing. And our enterprise contracts include a 90-day performance guarantee.`
  }
};

const SCENARIO_ANALYSIS: Record<ScenarioKey, AnalysisResult> = {
  cold_call: {
    sentiment: 62, sentimentLabel: "Warming",
    dealRisk: 44,
    objections: [
      { timestamp: "0:18", text: "We already have a call recording tool", response: "Reframe: recording ≠ intelligence. Ask what they do with the data post-call." },
      { timestamp: "0:47", text: "Budget constraint flagged", response: "ROI anchor: link cost to average deal value. Calculate payback period live." },
    ],
    opportunities: ["High curiosity signal: asked for more info", "Disclosed $40k ACV — qualify budget authority", "Meeting request = strong buying intent"],
    revenueAtRisk: "$40,000",
    coachingTips: ["Lock in a specific next step — 'send info' is a soft close", "Ask who else needs to be in the next call", "Share ROI calculator before follow-up email"],
  },
  saas_demo: {
    sentiment: 78, sentimentLabel: "Engaged",
    dealRisk: 28,
    objections: [
      { timestamp: "1:02", text: "Bot join experience ruined Gong adoption", response: "Native room is a hard differentiator. Demo the prospect join flow live." },
      { timestamp: "1:34", text: "Salesforce CRM compatibility question", response: "Confirm integration → remove technical blocker, accelerate timeline." },
    ],
    opportunities: ["VP of Sales involvement = champion identified", "Trial request = 85% close probability signal", "CRM question shows technical evaluation stage"],
    revenueAtRisk: "$0 — deal is moving",
    coachingTips: ["Propose trial with success metrics defined upfront", "Get VP of Sales on the next call", "Send Salesforce integration doc within 1 hour"],
  },
  enterprise: {
    sentiment: 55, sentimentLabel: "Evaluating",
    dealRisk: 61,
    objections: [
      { timestamp: "1:15", text: "Security/legal concerns raised", response: "Proactively send SOC2 report. Offer security review call with CISO." },
      { timestamp: "2:08", text: "Implementation disruption risk", response: "Confirm 48-hour onboarding → reduce perceived switching cost." },
      { timestamp: "2:41", text: "Locked into current tool until Q2", response: "Phased migration + overlap billing removal. Start pilot in Q1 with 5 reps." },
    ],
    opportunities: ["Performance gap (34% vs 8%) = clear ROI case to build", "60-rep team = $58k+ ARR opportunity", "Q2 contract end = natural window for full switch"],
    revenueAtRisk: "$58,000",
    coachingTips: ["Send security whitepaper before EOD", "Propose 5-rep pilot starting Q1", "Build ROI model showing cost of 26-point close rate gap"],
  }
};

function LiveDemo() {
  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("saas_demo");
  const [customTranscript, setCustomTranscript] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [streamedLines, setStreamedLines] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"analysis" | "transcript">("analysis");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAnalysis = useCallback(() => {
    setRunning(true);
    setResult(null);
    setStreamedLines([]);
    setProgress(0);

    const lines = (useCustom ? customTranscript : SCENARIOS[activeScenario].transcript)
      .split("\n").filter(l => l.trim());
    let li = 0;
    let prog = 0;

    intervalRef.current = setInterval(() => {
      prog += Math.random() * 8 + 4;
      setProgress(Math.min(prog, 95));
      if (li < lines.length) {
        setStreamedLines(p => [...p, lines[li]]);
        li++;
      }
    }, 180);

    setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      setRunning(false);
      setResult(useCustom ? {
        sentiment: 68, sentimentLabel: "Mixed",
        dealRisk: 52,
        objections: [{ timestamp: "custom", text: "Detected from your transcript", response: "Analyze the resistance point and reframe around ROI." }],
        opportunities: ["Custom transcript analyzed", "Review objection timestamps for coaching moments"],
        revenueAtRisk: "Calculating...",
        coachingTips: ["Review detected objections", "Build ROI anchor for next call", "Confirm next steps before close"],
      } : SCENARIO_ANALYSIS[activeScenario]);
      setActiveTab("analysis");
    }, 3200);
  }, [activeScenario, customTranscript, useCustom]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const sentColor = result ? (result.sentiment >= 70 ? "#22c55e" : result.sentiment >= 50 ? "#f59e0b" : "#ef4444") : "#60a5fa";
  const riskColor = result ? (result.dealRisk <= 35 ? "#22c55e" : result.dealRisk <= 60 ? "#f59e0b" : "#ef4444") : "#60a5fa";

  return (
    <div className="demo-shell">
      {/* Header */}
      <div className="demo-header">
        <div className="demo-header-left">
          <div className="demo-live-dot" />
          <span className="demo-title">Try Fixsense Live</span>
          <span className="demo-subtitle">Real-time AI analysis engine</span>
        </div>
        {result && (
          <button className="demo-reset" onClick={() => { setResult(null); setStreamedLines([]); setProgress(0); }}>
            ↺ Reset
          </button>
        )}
      </div>

      {/* Scenario selector */}
      <div className="demo-scenarios">
        {(Object.keys(SCENARIOS) as ScenarioKey[]).map(k => (
          <button key={k} onClick={() => { setActiveScenario(k); setUseCustom(false); setResult(null); setStreamedLines([]); }}
            className={`demo-scenario-btn ${activeScenario === k && !useCustom ? "active" : ""}`}>
            <span>{SCENARIOS[k].emoji}</span>
            <span>{SCENARIOS[k].label}</span>
          </button>
        ))}
        <button onClick={() => { setUseCustom(true); setResult(null); setStreamedLines([]); }}
          className={`demo-scenario-btn ${useCustom ? "active" : ""}`}>
          <span>✏️</span><span>Paste Transcript</span>
        </button>
      </div>

      {/* Content area */}
      <div className="demo-content">
        {/* Left: input */}
        <div className="demo-input-panel">
          <div className="demo-panel-label">
            {useCustom ? "Your Transcript" : `${SCENARIOS[activeScenario].emoji} ${SCENARIOS[activeScenario].label} Script`}
          </div>
          {useCustom ? (
            <textarea
              className="demo-textarea"
              placeholder="Paste your sales call transcript here... (any format works)"
              value={customTranscript}
              onChange={e => setCustomTranscript(e.target.value)}
              rows={10}
            />
          ) : (
            <div className="demo-transcript-preview">
              {SCENARIOS[activeScenario].transcript.split("\n").filter(l => l.trim()).map((line, i) => {
                const isRep = line.startsWith("Rep:");
                const isActive = running && streamedLines.length > i;
                return (
                  <div key={i} className={`demo-transcript-line ${isRep ? "rep" : "prospect"} ${isActive ? "active" : ""}`}>
                    <span className="demo-speaker">{isRep ? "Rep" : "Prospect"}</span>
                    <span className="demo-line-text">{line.replace(/^(Rep|Prospect):/, "").trim()}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          {running && (
            <div className="demo-progress-wrap">
              <div className="demo-progress-bar" style={{ width: `${progress}%` }} />
              <span className="demo-progress-label">Analyzing… {Math.round(progress)}%</span>
            </div>
          )}

          <button
            className={`demo-run-btn ${running ? "running" : ""}`}
            onClick={runAnalysis}
            disabled={running || (useCustom && !customTranscript.trim())}
          >
            {running ? (
              <><span className="demo-spinner" />Analyzing in real time…</>
            ) : (
              <><span>⚡</span>Run Analysis</>
            )}
          </button>
        </div>

        {/* Right: output */}
        <div className="demo-output-panel">
          {!result && !running ? (
            <div className="demo-empty">
              <div className="demo-empty-icon">🎯</div>
              <p className="demo-empty-title">Select a scenario and run analysis</p>
              <p className="demo-empty-sub">See live objection detection, sentiment tracking, deal risk scoring, and AI coaching in seconds</p>
            </div>
          ) : running ? (
            <div className="demo-loading">
              {["Parsing conversation structure…", "Detecting objections…", "Scoring sentiment…", "Calculating deal risk…", "Generating coaching responses…"].map((step, i) => (
                <div key={i} className={`demo-loading-step ${progress > i * 20 ? "done" : progress > (i - 1) * 20 ? "current" : ""}`}>
                  <span className="demo-loading-dot" />
                  {step}
                </div>
              ))}
            </div>
          ) : result ? (
            <div className="demo-result">
              {/* KPI row */}
              <div className="demo-kpi-row">
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: sentColor }}>
                    {result.sentiment}%
                  </div>
                  <div className="demo-kpi-label">Sentiment</div>
                  <div className="demo-kpi-badge" style={{ background: `${sentColor}18`, color: sentColor, border: `1px solid ${sentColor}30` }}>
                    {result.sentimentLabel}
                  </div>
                </div>
                <div className="demo-kpi-divider" />
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: riskColor }}>{result.dealRisk}</div>
                  <div className="demo-kpi-label">Deal Risk Score</div>
                  <div className="demo-kpi-badge" style={{ background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}30` }}>
                    {result.dealRisk <= 35 ? "Low Risk" : result.dealRisk <= 60 ? "Medium Risk" : "High Risk"}
                  </div>
                </div>
                <div className="demo-kpi-divider" />
                <div className="demo-kpi">
                  <div className="demo-kpi-value" style={{ color: "#a78bfa", fontSize: 16, marginTop: 4 }}>{result.revenueAtRisk}</div>
                  <div className="demo-kpi-label">Revenue at Risk</div>
                  <div className="demo-kpi-badge" style={{ background: "rgba(167,139,250,.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,.25)" }}>
                    Monitored
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="demo-result-tabs">
                <button className={`demo-result-tab ${activeTab === "analysis" ? "active" : ""}`} onClick={() => setActiveTab("analysis")}>
                  AI Analysis
                </button>
                <button className={`demo-result-tab ${activeTab === "transcript" ? "active" : ""}`} onClick={() => setActiveTab("transcript")}>
                  Coaching Responses
                </button>
              </div>

              {activeTab === "analysis" ? (
                <div className="demo-analysis">
                  {/* Objections */}
                  <div className="demo-section-label">⚠ Objections Detected ({result.objections.length})</div>
                  {result.objections.map((obj, i) => (
                    <div key={i} className="demo-objection">
                      <div className="demo-obj-header">
                        <span className="demo-obj-timestamp">{obj.timestamp}</span>
                        <span className="demo-obj-text">{obj.text}</span>
                      </div>
                      <div className="demo-obj-response">
                        <span style={{ color: "#0ef5d4" }}>💡</span> {obj.response}
                      </div>
                    </div>
                  ))}

                  {/* Opportunities */}
                  <div className="demo-section-label" style={{ marginTop: 12 }}>✓ Revenue Opportunities</div>
                  {result.opportunities.map((opp, i) => (
                    <div key={i} className="demo-opportunity">
                      <span style={{ color: "#22c55e", flexShrink: 0 }}>→</span>
                      <span>{opp}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="demo-analysis">
                  <div className="demo-section-label">🎯 AI Coaching Responses</div>
                  {result.coachingTips.map((tip, i) => (
                    <div key={i} className="demo-coaching-tip">
                      <span className="demo-tip-num">{i + 1}</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN LANDING PAGE ────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const FAQS = [
    { q: "Why not just use a recording bot?", a: "Bots announce themselves to the call, delay 60–90 seconds before capturing audio, and cause 31% of enterprise prospects to disengage. Fixsense is natively built — your meeting room IS Fixsense. No bot. Zero friction. Transcription starts at call second zero." },
    { q: "How is this different from Gong or Chorus?", a: "Gong analyzes calls after the fact. Fixsense gives you real-time objection detection, live sentiment scoring, and coaching suggestions during the call — when you can still act on them. Same call. Completely different outcome." },
    { q: "What does 'no CRM updates' mean for my reps?", a: "After every call, Fixsense automatically pushes the summary, sentiment score, action items, and deal stage to your CRM. Your reps spend 0 minutes on post-call admin. That's 4 hours per rep, per week, back in pipeline." },
    { q: "How quickly can we get started?", a: "Most teams are live in 48 hours. No hardware. No IT. No downloads. Reps join calls through a link. Your first AI summary lands in your inbox 2 minutes after your first call ends." },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#03050d;--bg2:#060912;--bg3:#0b0e1a;
      --ink:#edf0f8;--ink2:rgba(237,240,248,0.65);--muted:rgba(237,240,248,0.35);
      --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.04);
      --cyan:#0ef5d4;--cyan2:rgba(14,245,212,0.1);--cyan3:rgba(14,245,212,0.05);
      --blue:#3b82f6;--purple:#8b5cf6;--red:#ef4444;--green:#22c55e;--amber:#f59e0b;
      --fd:'Syne',system-ui,sans-serif;
      --fb:'DM Sans',system-ui,sans-serif;
    }
    .lp{background:var(--bg);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;}

    /* ── NAV ── */
    .nav{position:fixed;top:0;left:0;right:0;z-index:200;height:60px;display:flex;align-items:center;padding:0 24px;transition:all .3s;}
    .nav.scrolled{background:rgba(3,5,13,0.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
    .nav-inner{max-width:1180px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;}
    .nav-brand{display:flex;align-items:center;gap:9px;text-decoration:none;}
    .nav-brandname{font-family:var(--fd);font-size:17px;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
    .nav-links{display:flex;align-items:center;gap:26px;}
    .nav-link{font-size:13px;font-weight:500;color:var(--muted);text-decoration:none;transition:color .18s;}
    .nav-link:hover{color:var(--ink);}
    .nav-actions{display:flex;align-items:center;gap:8px;}
    .btn-ghost{font-size:13px;font-weight:500;color:var(--muted);background:none;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;text-decoration:none;transition:color .15s;font-family:var(--fb);}
    .btn-ghost:hover{color:var(--ink);}
    .btn-primary{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#03050d;background:var(--cyan);border:none;padding:9px 20px;border-radius:9px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .15s;white-space:nowrap;}
    .btn-primary:hover{opacity:.88;transform:translateY(-1px);}
    .btn-outline{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink2);background:rgba(255,255,255,.05);border:1px solid var(--border);padding:9px 20px;border-radius:9px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .15s;}
    .btn-outline:hover{border-color:rgba(255,255,255,.18);color:var(--ink);}
    .hamburger{display:none;flex-direction:column;gap:5px;width:38px;height:38px;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:9px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
    .hamburger span{display:block;width:16px;height:1.5px;background:var(--ink);border-radius:2px;transition:all .22s;}
    .hamburger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg);}
    .hamburger.open span:nth-child(2){opacity:0;}
    .hamburger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg);}
    .mobile-menu{display:none;position:fixed;inset:0;top:60px;z-index:199;background:rgba(3,5,13,.99);backdrop-filter:blur(20px);flex-direction:column;padding:32px 24px;border-top:1px solid var(--border);}
    .mobile-menu.open{display:flex;animation:slidein .2s ease;}
    @keyframes slidein{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
    .mobile-link{font-family:var(--fd);font-size:22px;font-weight:700;color:var(--muted);text-decoration:none;padding:14px 0;border-bottom:1px solid var(--border2);display:block;transition:color .15s;}
    .mobile-link:active{color:var(--ink);}
    .mobile-ctas{margin-top:auto;display:flex;flex-direction:column;gap:10px;padding-top:24px;}
    @media(max-width:820px){
      .nav-links,.nav-actions .btn-ghost{display:none;}
      .hamburger{display:flex;}
    }

    /* ── HERO ── */
    .hero{min-height:100vh;display:flex;align-items:center;padding:80px 24px 60px;position:relative;overflow:hidden;}
    .hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(14,245,212,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(14,245,212,.025) 1px,transparent 1px);background-size:72px 72px;mask-image:radial-gradient(ellipse 100% 80% at 50% 0,black 0,transparent 100%);-webkit-mask-image:radial-gradient(ellipse 100% 80% at 50% 0,black 0,transparent 100%);}
    .hero-glow{position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:900px;height:700px;background:radial-gradient(ellipse,rgba(14,245,212,.055) 0,transparent 65%);pointer-events:none;}
    .hero-inner{max-width:1180px;margin:0 auto;width:100%;position:relative;z-index:1;}
    .hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:100px;padding:5px 14px 5px 6px;font-size:11px;font-weight:700;color:#f87171;margin-bottom:22px;font-family:'DM Sans',monospace;letter-spacing:.04em;}
    .hero-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:hpulse 2s ease-in-out infinite;}
    @keyframes hpulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}
    .hero-h{font-family:var(--fd);font-size:clamp(36px,7vw,82px);font-weight:800;line-height:1.04;letter-spacing:-.05em;color:var(--ink);max-width:960px;margin-bottom:22px;}
    .hero-h .loss{color:#ef4444;}
    .hero-h .gain{color:var(--cyan);}
    .hero-h .ghost{color:var(--muted);}
    .hero-sub{font-size:clamp(15px,2vw,19px);color:var(--ink2);line-height:1.72;max-width:540px;margin-bottom:36px;}
    .hero-ctas{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:48px;}
    .btn-hero{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:#03050d;background:var(--cyan);border:none;padding:14px 28px;border-radius:10px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .2s;box-shadow:0 0 40px rgba(14,245,212,.2);}
    .btn-hero:hover{opacity:.88;transform:translateY(-2px);box-shadow:0 4px 40px rgba(14,245,212,.35);}
    .btn-hero-outline{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--ink2);background:transparent;border:1px solid var(--border);padding:14px 26px;border-radius:10px;cursor:pointer;text-decoration:none;font-family:var(--fb);transition:all .2s;}
    .btn-hero-outline:hover{border-color:rgba(255,255,255,.2);color:var(--ink);}
    .hero-trust{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
    .trust-pill{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);font-weight:500;}
    .trust-check{width:16px;height:16px;border-radius:50%;background:rgba(14,245,212,.1);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--cyan);flex-shrink:0;}
    .hero-dashboard{margin-top:56px;position:relative;}
    .hero-dashboard-frame{background:linear-gradient(145deg,rgba(11,14,26,0.98),rgba(6,9,18,0.98));border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.7),0 0 0 1px rgba(14,245,212,.04);}
    .hero-db-bar{padding:10px 16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:8px;}
    .db-dot{width:10px;height:10px;border-radius:50%;}
    .hero-db-content{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid var(--border2);}
    .hero-db-kpi{padding:16px 20px;border-right:1px solid var(--border2);}
    .hero-db-kpi:last-child{border-right:none;}
    .hero-kpi-val{font-family:var(--fd);font-size:26px;font-weight:800;line-height:1;margin-bottom:4px;}
    .hero-kpi-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;}
    .hero-db-transcript{padding:14px 20px;display:flex;flex-direction:column;gap:8px;}
    .hero-tline{display:flex;gap:8px;align-items:flex-start;}
    .hero-tspeaker{font-size:10px;font-weight:700;min-width:56px;padding-top:1px;}
    .hero-ttext{font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;}
    .hero-objection-tag{display:inline-flex;align-items:center;gap:4px;font-size:10px;fontWeight:700;color:#f87171;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:4px;padding:1px 7px;margin-top:4px;}
    .hero-insight-bar{padding:10px 20px;background:rgba(14,245,212,.04);border-top:1px solid rgba(14,245,212,.1);display:flex;align-items:center;gap:10px;}
    @media(max-width:680px){
      .hero{padding:80px 16px 48px;}
      .hero-ctas{flex-direction:column;align-items:stretch;}
      .btn-hero,.btn-hero-outline{justify-content:center;}
      .hero-db-content{grid-template-columns:1fr 1fr;}
      .hero-kpi-val{font-size:20px;}
    }

    /* ── SECTIONS ── */
    .section{padding:80px 24px;}
    .section-inner{max-width:1180px;margin:0 auto;}
    .kicker{font-family:monospace;font-size:10px;font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:.16em;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
    .kicker::before{content:'';display:inline-block;width:24px;height:1px;background:var(--cyan);}
    .section-h{font-family:var(--fd);font-size:clamp(28px,5vw,54px);font-weight:800;color:var(--ink);letter-spacing:-.04em;line-height:1.08;margin-bottom:14px;}
    .section-sub{font-size:16px;color:var(--ink2);line-height:1.72;max-width:520px;}

    /* ── KPI CARDS ── */
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:40px;}
    .kpi-card{background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.12);border-radius:14px;padding:20px;}
    .kpi-icon{font-size:22px;margin-bottom:10px;}
    .kpi-num{font-family:var(--fd);font-size:clamp(26px,3.5vw,38px);font-weight:800;color:#f87171;letter-spacing:-.04em;line-height:1;margin-bottom:6px;}
    .kpi-desc{font-size:11.5px;color:rgba(239,68,68,.55);line-height:1.55;}
    @media(max-width:860px){.kpi-grid{grid-template-columns:repeat(2,1fr);}}
    @media(max-width:440px){.kpi-grid{grid-template-columns:1fr 1fr;gap:8px;}.kpi-card{padding:14px;}}

    /* ── DEMO SECTION ── */
    .demo-section{padding:80px 24px;background:var(--bg2);}
    .demo-shell{background:rgba(11,14,26,.98);border:1px solid rgba(255,255,255,.09);border-radius:18px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.5);}
    .demo-header{padding:14px 20px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;}
    .demo-header-left{display:flex;align-items:center;gap:10px;}
    .demo-live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:livepulse 1.4s ease-out infinite;flex-shrink:0;}
    @keyframes livepulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 6px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
    .demo-title{font-family:var(--fd);font-size:14px;font-weight:700;color:var(--ink);}
    .demo-subtitle{font-size:11px;color:var(--muted);}
    .demo-reset{font-size:12px;color:var(--muted);background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:7px;padding:5px 12px;cursor:pointer;font-family:var(--fb);transition:.13s;}
    .demo-reset:hover{color:var(--ink);}
    .demo-scenarios{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--border2);overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .demo-scenario-btn{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--fb);transition:all .13s;white-space:nowrap;flex-shrink:0;-webkit-tap-highlight-color:transparent;}
    .demo-scenario-btn:hover{border-color:rgba(14,245,212,.3);color:var(--ink2);}
    .demo-scenario-btn.active{border-color:rgba(14,245,212,.4);background:rgba(14,245,212,.07);color:var(--cyan);}
    .demo-content{display:grid;grid-template-columns:1fr 1fr;min-height:440px;}
    .demo-input-panel{border-right:1px solid var(--border2);padding:16px;display:flex;flex-direction:column;gap:12px;}
    .demo-output-panel{padding:16px;display:flex;flex-direction:column;}
    .demo-panel-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;}
    .demo-transcript-preview{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;max-height:300px;}
    .demo-transcript-line{display:flex;gap:8px;padding:6px 8px;border-radius:7px;border-left:2px solid transparent;transition:all .15s;}
    .demo-transcript-line.rep{border-left-color:rgba(96,165,250,.35);}
    .demo-transcript-line.prospect{border-left-color:rgba(45,212,191,.25);}
    .demo-transcript-line.active{background:rgba(14,245,212,.05);}
    .demo-speaker{font-size:9px;font-weight:700;min-width:42px;padding-top:2px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.05em;flex-shrink:0;}
    .demo-transcript-line.rep .demo-speaker{color:#818cf8;}
    .demo-transcript-line.prospect .demo-speaker{color:#2dd4bf;}
    .demo-line-text{font-size:11.5px;color:rgba(255,255,255,.55);line-height:1.5;}
    .demo-textarea{flex:1;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--ink);font-size:13px;font-family:var(--fb);resize:none;outline:none;min-height:240px;transition:border-color .13s;}
    .demo-textarea:focus{border-color:rgba(14,245,212,.3);}
    .demo-textarea::placeholder{color:var(--muted);}
    .demo-progress-wrap{position:relative;height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;}
    .demo-progress-bar{position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,var(--cyan),#3b82f6);border-radius:2px;transition:width .3s ease;}
    .demo-progress-label{font-size:10px;color:var(--muted);margin-top:4px;}
    .demo-run-btn{padding:12px 20px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--fd);display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;}
    .demo-run-btn:not(.running){background:linear-gradient(135deg,var(--cyan),#0891b2);color:#03050d;}
    .demo-run-btn:not(.running):hover{opacity:.88;transform:translateY(-1px);}
    .demo-run-btn.running{background:rgba(255,255,255,.06);color:var(--muted);cursor:not-allowed;}
    .demo-run-btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important;}
    .demo-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:var(--cyan);animation:spin .8s linear infinite;flex-shrink:0;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .demo-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 20px;}
    .demo-empty-icon{font-size:36px;margin-bottom:12px;}
    .demo-empty-title{font-size:13px;font-weight:700;color:rgba(255,255,255,.4);margin-bottom:8px;}
    .demo-empty-sub{font-size:12px;color:var(--muted);line-height:1.6;max-width:260px;}
    .demo-loading{flex:1;display:flex;flex-direction:column;gap:8px;padding:12px 0;}
    .demo-loading-step{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);padding:7px 10px;border-radius:8px;transition:all .2s;}
    .demo-loading-step.current{color:var(--cyan);background:rgba(14,245,212,.06);}
    .demo-loading-step.done{color:rgba(34,197,94,.7);}
    .demo-loading-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0;}
    .demo-result{display:flex;flex-direction:column;gap:12px;height:100%;}
    .demo-kpi-row{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;}
    .demo-kpi{padding:14px 16px;text-align:center;}
    .demo-kpi-divider{width:1px;background:var(--border2);align-self:stretch;}
    .demo-kpi-value{font-family:var(--fd);font-size:24px;font-weight:800;line-height:1;margin-bottom:3px;}
    .demo-kpi-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;}
    .demo-kpi-badge{display:inline-block;font-size:9px;font-weight:700;border-radius:20px;padding:2px 8px;}
    .demo-result-tabs{display:flex;border-bottom:1px solid var(--border2);}
    .demo-result-tab{flex:1;padding:8px;font-size:11px;font-weight:700;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:var(--fb);transition:all .13s;text-transform:uppercase;letter-spacing:.06em;}
    .demo-result-tab.active{color:var(--cyan);border-bottom-color:var(--cyan);}
    .demo-analysis{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:7px;}
    .demo-section-label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;}
    .demo-objection{padding:9px 11px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.14);border-radius:9px;}
    .demo-obj-header{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;}
    .demo-obj-timestamp{font-size:9px;font-weight:700;color:#f87171;background:rgba(239,68,68,.12);border-radius:4px;padding:1px 6px;flex-shrink:0;}
    .demo-obj-text{font-size:11.5px;color:rgba(255,255,255,.7);line-height:1.4;}
    .demo-obj-response{font-size:11px;color:rgba(255,255,255,.45);line-height:1.5;padding-left:4px;}
    .demo-opportunity{display:flex;gap:8px;font-size:11.5px;color:rgba(255,255,255,.6);line-height:1.45;padding:4px 0;}
    .demo-coaching-tip{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border2);border-radius:9px;font-size:11.5px;color:rgba(255,255,255,.65);line-height:1.5;}
    .demo-tip-num{width:18px;height:18px;border-radius:50%;background:rgba(14,245,212,.1);border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:var(--cyan);flex-shrink:0;margin-top:1px;}
    @media(max-width:720px){
      .demo-content{grid-template-columns:1fr;}
      .demo-input-panel{border-right:none;border-bottom:1px solid var(--border2);}
      .demo-output-panel{min-height:360px;}
    }

    /* ── OUTPUTS / FEATURES ── */
    .outputs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:40px;}
    .output-card{border-radius:16px;padding:22px;border:1px solid var(--border);background:rgba(255,255,255,.025);position:relative;overflow:hidden;transition:border-color .18s,transform .18s;}
    .output-card:hover{border-color:rgba(255,255,255,.14);transform:translateY(-2px);}
    .output-card-accent{position:absolute;top:0;left:0;right:0;height:2px;}
    .output-card-icon{font-size:24px;margin-bottom:14px;}
    .output-card-title{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);margin-bottom:8px;}
    .output-card-desc{font-size:13px;color:var(--ink2);line-height:1.65;margin-bottom:14px;}
    .output-feature-list{display:flex;flex-direction:column;gap:7px;}
    .output-feature{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);}
    .output-feature-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
    @media(max-width:860px){.outputs-grid{grid-template-columns:1fr 1fr;}}
    @media(max-width:520px){.outputs-grid{grid-template-columns:1fr;}}

    /* ── BEFORE/AFTER ── */
    .ba-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:40px;}
    .ba-card{border-radius:16px;padding:28px;border:1px solid var(--border);}
    .ba-card.before{background:rgba(239,68,68,.03);border-color:rgba(239,68,68,.15);}
    .ba-card.after{background:rgba(14,245,212,.03);border-color:rgba(14,245,212,.15);}
    .ba-header{display:flex;align-items:center;gap:10px;margin-bottom:22px;}
    .ba-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
    .ba-title{font-family:var(--fd);font-size:16px;font-weight:700;}
    .ba-items{display:flex;flex-direction:column;gap:12px;}
    .ba-item{display:flex;gap:12px;align-items:flex-start;}
    .ba-item-icon{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;margin-top:1px;}
    .ba-item-text{font-size:13px;color:var(--ink2);line-height:1.55;}
    @media(max-width:640px){.ba-grid{grid-template-columns:1fr;}}

    /* ── PROOF ── */
    .proof-section{padding:80px 24px;background:var(--bg2);}
    .testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:36px;}
    .testi-card{background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:16px;padding:22px;display:flex;flex-direction:column;transition:border-color .18s,transform .18s;}
    .testi-card:hover{border-color:rgba(14,245,212,.18);transform:translateY(-2px);}
    .testi-metric{display:inline-block;background:var(--cyan2);color:var(--cyan);border:1px solid rgba(14,245,212,.2);border-radius:6px;padding:3px 11px;font-size:10px;font-weight:700;margin-bottom:14px;font-family:monospace;letter-spacing:.04em;}
    .testi-quote{font-size:13px;color:var(--ink2);line-height:1.72;flex:1;margin-bottom:18px;}
    .testi-author{display:flex;align-items:center;gap:10px;border-top:1px solid var(--border2);padding-top:14px;}
    .testi-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(14,245,212,.1),rgba(59,130,246,.1));border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-size:12px;font-weight:700;color:var(--cyan);flex-shrink:0;}
    .testi-name{font-family:var(--fd);font-size:13px;font-weight:700;color:var(--ink);}
    .testi-role{font-size:11px;color:var(--muted);}
    .case-study{margin-top:36px;background:rgba(14,245,212,.03);border:1px solid rgba(14,245,212,.12);border-radius:16px;padding:28px;display:grid;grid-template-columns:repeat(3,1fr);gap:0;}
    .case-step{padding:0 24px;position:relative;}
    .case-step:not(:last-child)::after{content:'→';position:absolute;right:-10px;top:50%;transform:translateY(-50%);font-size:18px;color:rgba(14,245,212,.4);}
    .case-step-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;margin-bottom:8px;}
    .case-step-text{font-size:13px;color:var(--ink2);line-height:1.6;}
    .case-step-result{font-family:var(--fd);font-size:20px;font-weight:800;color:var(--cyan);margin-top:6px;}
    @media(max-width:860px){.testi-grid{grid-template-columns:1fr 1fr;}.case-study{grid-template-columns:1fr;gap:20px;}.case-step:not(:last-child)::after{display:none;}}
    @media(max-width:540px){.testi-grid{grid-template-columns:1fr;}}

    /* ── HOW IT WORKS ── */
    .how-steps{display:flex;gap:0;margin-top:40px;position:relative;}
    .how-steps::before{content:'';position:absolute;top:20px;left:20px;right:20px;height:1px;background:linear-gradient(90deg,transparent,rgba(14,245,212,.3),transparent);}
    .how-step{flex:1;text-align:center;padding:0 20px;position:relative;}
    .how-step-num{width:40px;height:40px;border-radius:12px;background:rgba(14,245,212,.07);border:1px solid rgba(14,245,212,.2);display:flex;align-items:center;justify-content:center;font-family:var(--fd);font-size:16px;font-weight:800;color:var(--cyan);margin:0 auto 14px;position:relative;z-index:1;}
    .how-step-title{font-family:var(--fd);font-size:14px;font-weight:700;color:var(--ink);margin-bottom:8px;}
    .how-step-desc{font-size:12.5px;color:var(--muted);line-height:1.6;}
    @media(max-width:640px){.how-steps{flex-direction:column;gap:24px;}.how-steps::before{display:none;}}

    /* ── POSITIONING ── */
    .pos-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start;margin-top:40px;}
    .pos-table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:12px;overflow:hidden;}
    .pos-th{padding:10px 14px;font-size:11px;font-weight:700;background:rgba(255,255,255,.03);border-bottom:1px solid var(--border);text-align:center;color:var(--muted);}
    .pos-th:first-child{text-align:left;color:rgba(255,255,255,.4);}
    .pos-th.hl{color:var(--cyan);background:rgba(14,245,212,.04);position:relative;}
    .pos-th.hl::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--cyan);}
    .pos-tr{border-bottom:1px solid rgba(255,255,255,.04);}
    .pos-td{padding:9px 14px;font-size:12px;text-align:center;color:rgba(255,255,255,.45);}
    .pos-td:first-child{text-align:left;font-weight:500;}
    .pos-td.hl{background:rgba(14,245,212,.025);}
    .pos-items{display:flex;flex-direction:column;gap:12px;}
    .pos-item{padding:14px;background:rgba(255,255,255,.02);border:1px solid var(--border2);border-radius:12px;}
    .pos-item-title{font-size:13px;font-weight:700;color:var(--ink);margin-bottom:5px;display:flex;align-items:center;gap:7px;}
    .pos-item-desc{font-size:12px;color:var(--muted);line-height:1.55;}
    @media(max-width:820px){.pos-grid{grid-template-columns:1fr;}}

    /* ── FAQ ── */
    .faq-items{max-width:720px;margin:40px auto 0;}
    .faq-item{border:1px solid var(--border);border-radius:12px;margin-bottom:8px;overflow:hidden;}
    .faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:transparent;border:none;cursor:pointer;text-align:left;font-size:13.5px;font-weight:600;color:var(--ink);font-family:var(--fb);gap:12px;min-height:50px;transition:background .13s;-webkit-tap-highlight-color:transparent;}
    .faq-q:hover{background:rgba(255,255,255,.02);}
    .faq-chev{font-size:14px;color:var(--muted);transition:transform .22s;flex-shrink:0;}
    .faq-chev.open{transform:rotate(180deg);}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease,padding .3s ease;padding:0 20px;}
    .faq-a.open{max-height:300px;padding:0 20px 18px;}
    .faq-a p{font-size:13px;color:var(--ink2);line-height:1.75;margin:0;}

    /* ── FINAL CTA ── */
    .final{padding:100px 24px;text-align:center;position:relative;overflow:hidden;}
    .final-orb{position:absolute;inset:0;background:radial-gradient(ellipse 65% 65% at 50% 50%,rgba(14,245,212,.04) 0,transparent 65%);pointer-events:none;}
    .final-inner{position:relative;z-index:1;max-width:620px;margin:0 auto;}
    .final-h{font-family:var(--fd);font-size:clamp(28px,6vw,64px);font-weight:800;color:var(--ink);letter-spacing:-.05em;line-height:1.05;margin-bottom:16px;}
    .final-sub{font-size:17px;color:var(--ink2);line-height:1.7;margin-bottom:32px;}
    .final-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:18px;}
    .final-footnote{font-size:12px;color:var(--muted);}
    @media(max-width:480px){.final-ctas{flex-direction:column;align-items:stretch;}.final-ctas a{justify-content:center;}}

    /* ── FOOTER ── */
    .footer{background:var(--bg2);padding:48px 24px 24px;border-top:1px solid var(--border);}
    .footer-inner{max-width:1180px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:32px;padding-bottom:32px;border-bottom:1px solid var(--border2);}
    .footer-brand-name{font-family:var(--fd);font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.02em;margin-bottom:8px;display:flex;align-items:center;gap:8px;}
    .footer-brand-desc{font-size:13px;color:var(--muted);line-height:1.65;max-width:220px;}
    .footer-col-title{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;font-family:monospace;}
    .footer-link{display:block;font-size:13px;color:var(--muted);text-decoration:none;margin-bottom:8px;transition:color .18s;}
    .footer-link:hover{color:var(--ink);}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
    .footer-copy{font-size:12px;color:rgba(255,255,255,.2);}
    .footer-legal-links{display:flex;gap:16px;}
    .footer-legal-link{font-size:12px;color:rgba(255,255,255,.2);text-decoration:none;transition:color .18s;}
    .footer-legal-link:hover{color:var(--muted);}
    @media(max-width:960px){.footer-top{grid-template-columns:1fr 1fr;gap:28px;}}
    @media(max-width:480px){.footer-top{grid-template-columns:1fr 1fr;gap:20px;}}
  `;

  const NAV_LINKS = [
    { label: "Problem", href: "#problem" },
    { label: "Live Demo", href: "#demo" },
    { label: "Pricing", href: "/pricing" },
    { label: "Changelog", href: "/changelog" },
  ];

  return (
    <div className="lp">
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <Logo size={26} />
            <span className="nav-brandname">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV_LINKS.map(l => l.href.startsWith("#")
              ? <a key={l.label} href={l.href} className="nav-link">{l.label}</a>
              : <Link key={l.label} to={l.href} className="nav-link">{l.label}</Link>
            )}
          </div>
          <div className="nav-actions">
            {user ? (
              <Link to="/dashboard" className="btn-primary">Dashboard →</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/login" className="btn-primary">Start Free →</Link>
              </>
            )}
            <button className={`hamburger ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(o => !o)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`mobile-menu ${mobileOpen ? "open" : ""}`}>
        {NAV_LINKS.map(l => l.href.startsWith("#")
          ? <a key={l.label} href={l.href} className="mobile-link" onClick={() => setMobileOpen(false)}>{l.label}</a>
          : <Link key={l.label} to={l.href} className="mobile-link" onClick={() => setMobileOpen(false)}>{l.label}</Link>
        )}
        <div className="mobile-ctas">
          {user ? (
            <Link to="/dashboard" className="btn-hero" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>Dashboard →</Link>
          ) : (
            <>
              <Link to="/login" className="btn-hero-outline" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>Sign in</Link>
              <Link to="/login" className="btn-hero" style={{ justifyContent: "center" }} onClick={() => setMobileOpen(false)}>Start Free — No Card →</Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-grid" />
        <div className="hero-glow" />
        <div className="hero-inner">
          <div style={{ opacity: 0, animation: "slidein .6s ease .1s forwards" }}>
            <div className="hero-badge">
              <div className="hero-dot" />
              Revenue lost in real time — recovered in real time
            </div>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .2s forwards" }}>
            <h1 className="hero-h">
              Stop watching <span className="loss">deals die</span><br />
              on calls you thought <span className="gain">were going well.</span>
            </h1>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .3s forwards" }}>
            <p className="hero-sub">
              Fixsense detects objections, tracks sentiment, and surfaces AI coaching mid-call — so your reps recover revenue in the moment, not in the debrief.
            </p>
          </div>

          <div style={{ opacity: 0, animation: "slidein .7s ease .4s forwards" }}>
            <div className="hero-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start Free Trial
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a href="#demo" className="btn-hero-outline">Try Live Demo</a>
            </div>
            <div className="hero-trust">
              {["No Zoom bot", "Real-time, not post-call", "30 min free", "Live in 48hrs"].map((t, i) => (
                <div key={i} className="trust-pill">
                  <div className="trust-check">✓</div>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard preview */}
          <div style={{ opacity: 0, animation: "slidein .8s ease .5s forwards" }}>
            <div className="hero-dashboard">
              <div className="hero-dashboard-frame">
                <div className="hero-db-bar">
                  <div className="db-dot" style={{ background: "#ef4444" }} />
                  <div className="db-dot" style={{ background: "#f59e0b" }} />
                  <div className="db-dot" style={{ background: "#22c55e" }} />
                  <span style={{ marginLeft: 8, fontSize: 11, color: "rgba(255,255,255,.25)", fontFamily: "monospace" }}>Acme Corp — Enterprise Discovery · LIVE</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "hpulse 1.4s ease infinite" }} />
                    LIVE · 00:14:32
                  </div>
                </div>
                <div className="hero-db-content">
                  {[
                    { val: "72%", label: "Sentiment", color: "#22c55e" },
                    { val: "38", label: "Deal Risk", color: "#f59e0b" },
                    { val: "2", label: "Objections", color: "#ef4444" },
                    { val: "$85K", label: "Rev at Risk", color: "#a78bfa" },
                  ].map((k, i) => (
                    <div key={i} className="hero-db-kpi">
                      <div className="hero-kpi-val" style={{ color: k.color }}>{k.val}</div>
                      <div className="hero-kpi-label">{k.label}</div>
                    </div>
                  ))}
                </div>
                <div className="hero-db-transcript">
                  {[
                    { speaker: "Prospect", text: "Honestly the price feels steep for where we are budget-wise right now.", obj: true, color: "#2dd4bf" },
                    { speaker: "AI Coach", text: "💡 Pricing objection detected — Reframe: ask what one lost $85k deal costs them annually. ROI anchor ready.", obj: false, color: "#0ef5d4", isCoach: true },
                    { speaker: "Rep", text: "What does a deal like this typically cost you when it slips? Let me frame the math...", obj: false, color: "#818cf8" },
                  ].map((line, i) => (
                    <div key={i} className="hero-tline">
                      <span className="hero-tspeaker" style={{ color: line.color }}>{line.speaker}</span>
                      <div>
                        <span className="hero-ttext" style={line.isCoach ? { color: "rgba(14,245,212,.8)", fontStyle: "italic" } : undefined}>{line.text}</span>
                        {line.obj && <div className="hero-objection-tag">⚠ Pricing Objection · 94% confidence</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hero-insight-bar">
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(14,245,212,.7)", textTransform: "uppercase", letterSpacing: ".08em" }}>Next Action</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.55)", flex: 1 }}>Ask about their average deal value to anchor ROI before discussing pricing</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 4, padding: "2px 8px" }}>Opportunity</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROBLEM / KPIs ── */}
      <section className="section" id="problem" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">The Revenue Leak</div>
            <h2 className="section-h">Every unhandled objection is<br />a wire transfer to your competitor.</h2>
            <p className="section-sub">This isn't a rep performance problem. It's a visibility problem. Your team walks into calls blind and walks out with gut feelings instead of data.</p>
          </FadeIn>
          <div className="kpi-grid">
            {[
              { num: 1200000, prefix: "$", suffix: "", label: "Average annual revenue lost to untracked objections in a 20-rep team", icon: "💸" },
              { num: 67, prefix: "", suffix: "%", label: "Of deals lost without a clear diagnosis of what went wrong", icon: "🤷" },
              { num: 4, prefix: "", suffix: "hrs/wk", label: "Per rep wasted on CRM updates and call notes instead of selling", icon: "⏰" },
              { num: 31, prefix: "", suffix: "%", label: "Prospect drop-off when a visible bot joins the call and destroys trust", icon: "🚪" },
            ].map((k, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="kpi-card">
                  <div className="kpi-icon">{k.icon}</div>
                  <div className="kpi-num">
                    <AnimCounter target={k.num} prefix={k.prefix} suffix={k.suffix} />
                  </div>
                  <div className="kpi-desc">{k.label}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE DEMO ── */}
      <section className="demo-section" id="demo">
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Interactive Live Demo</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 720, margin: "0 auto 14px" }}>
                Select a scenario. Run analysis.<br />See exactly what your reps see.
              </h2>
              <p style={{ fontSize: 15, color: "var(--ink2)", textAlign: "center", maxWidth: 500, margin: "0 auto" }}>
                This is a real simulation of the Fixsense AI engine. Objection detection, sentiment scoring, deal risk — all running live.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={80}>
            <LiveDemo />
          </FadeIn>
        </div>
      </section>

      {/* ── PRODUCT OUTPUTS ── */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">What Fixsense Produces</div>
            <h2 className="section-h">Three intelligence layers.<br />One revenue outcome.</h2>
          </FadeIn>
          <div className="outputs-grid">
            {[
              {
                icon: "📈", title: "Revenue Intelligence", color: "#ef4444",
                desc: "Know exactly how much revenue is at risk on every active call. Deal risk score, lost revenue detection, and close probability — updated every 3 seconds.",
                features: ["Deal risk score (0–100)", "Revenue at risk estimate", "Win probability tracking", "Lost deal root cause analysis"],
              },
              {
                icon: "🎯", title: "Conversation Intelligence", color: "#0ef5d4",
                desc: "Every word analyzed in real time. Objection timestamps, sentiment pulse, talk ratio tracking, and opportunity signals — captured as they happen.",
                features: ["Live sentiment tracking", "Objection detection + timestamps", "Talk ratio analysis", "Buying signal detection"],
              },
              {
                icon: "🏆", title: "Performance Intelligence", color: "#a78bfa",
                desc: "Coach every rep, every call. AI coaching responses, follow-up generators, rep improvement scores, and team leaderboards — no manager required.",
                features: ["Mid-call AI coaching tips", "Post-call follow-up drafts", "CRM auto-sync (HubSpot, SF)", "Rep performance leaderboard"],
              },
            ].map((card, i) => (
              <FadeIn key={i} delay={i * 100}>
                <div className="output-card">
                  <div className="output-card-accent" style={{ background: `linear-gradient(90deg, ${card.color}, transparent)` }} />
                  <div className="output-card-icon">{card.icon}</div>
                  <div className="output-card-title">{card.title}</div>
                  <div className="output-card-desc">{card.desc}</div>
                  <div className="output-feature-list">
                    {card.features.map((f, j) => (
                      <div key={j} className="output-feature">
                        <div className="output-feature-dot" style={{ background: card.color }} />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── BEFORE / AFTER ── */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div className="kicker">The Before / After</div>
            <h2 className="section-h">The difference between<br />a tool and a weapon.</h2>
          </FadeIn>
          <div className="ba-grid">
            <FadeIn delay={60}>
              <div className="ba-card before">
                <div className="ba-header">
                  <div className="ba-icon" style={{ background: "rgba(239,68,68,.1)" }}>🚫</div>
                  <div className="ba-title" style={{ color: "#f87171" }}>Without Fixsense</div>
                </div>
                <div className="ba-items">
                  {[
                    ["😤", "Gut-based decisions", "Reps debrief with feelings, not data. No one knows why they lost."],
                    ["🤦", "Missed objections", "Pricing challenges land like surprises. Reps freeze. Deals soften."],
                    ["🌫", "Unclear deal status", "CRM says 'In Progress'. Reality is the prospect went dark 2 weeks ago."],
                    ["🐢", "Delayed follow-ups", "4 hours of CRM admin before the follow-up email even gets drafted."],
                  ].map(([icon, title, desc], i) => (
                    <div key={i} className="ba-item">
                      <div className="ba-item-icon" style={{ background: "rgba(239,68,68,.08)" }}>{icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)", marginBottom: 3 }}>{title}</div>
                        <div className="ba-item-text">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
            <FadeIn delay={120}>
              <div className="ba-card after">
                <div className="ba-header">
                  <div className="ba-icon" style={{ background: "rgba(14,245,212,.1)" }}>⚡</div>
                  <div className="ba-title" style={{ color: "#0ef5d4" }}>With Fixsense</div>
                </div>
                <div className="ba-items">
                  {[
                    ["📊", "Real-time insights", "Sentiment score, deal risk, and objection map — updated every 3 seconds during the call."],
                    ["🎯", "Guided responses", "Objection flagged in 3 seconds. Counter-response ready before the rep pauses."],
                    ["🔍", "Deal visibility", "Every call scored. Every deal tracked. Know before the prospect ghosts."],
                    ["⚡", "Instant close loop", "AI summary + CRM push + follow-up draft — done 2 minutes after the call ends."],
                  ].map(([icon, title, desc], i) => (
                    <div key={i} className="ba-item">
                      <div className="ba-item-icon" style={{ background: "rgba(14,245,212,.08)" }}>{icon}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.8)", marginBottom: 3 }}>{title}</div>
                        <div className="ba-item-text">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── PROOF ── */}
      <section className="proof-section">
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Real Results</div>
              <h2 className="section-h" style={{ textAlign: "center" }}>Teams that switched from gut to data.</h2>
            </div>
          </FadeIn>
          <div className="testi-grid">
            {[
              { metric: "+30% close rate", name: "Sarah M.", role: "Head of Sales, Vantex Technologies", initials: "SM", quote: "We ran Gong for 18 months. Reps hated the bot. Prospects noticed. Fixsense is completely invisible — and the real-time objection alerts are a different category of product entirely." },
              { metric: "90 → 45 day ramp", name: "Priya N.", role: "CRO, Cloudpath", initials: "PN", quote: "New reps review their own AI-analyzed calls the same day. No waiting for a manager to schedule a debrief. The AI tells them exactly what to fix. Ramp time dropped in half." },
              { metric: "3× win rate lift", name: "James O.", role: "Founder, Launchflow", initials: "JO", quote: "The deal timeline AI is what nobody talks about. Watching sentiment shift across 4 calls with the same prospect — you understand that relationship in a way that feels genuinely unfair to competitors." },
            ].map((t, i) => (
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

          {/* Mini case study */}
          <FadeIn delay={100}>
            <div className="case-study">
              <div className="case-step" style={{ paddingLeft: 0 }}>
                <div className="case-step-label">Problem</div>
                <div className="case-step-text">Cloudpath's 15 reps were closing at 12%. Pricing objections killed 40% of late-stage deals. Zero visibility into why.</div>
              </div>
              <div className="case-step">
                <div className="case-step-label">Fixsense Usage</div>
                <div className="case-step-text">Real-time objection detection + AI counter-responses deployed to all reps. CRM auto-sync eliminated 4hrs/week of admin.</div>
              </div>
              <div className="case-step" style={{ paddingRight: 0 }}>
                <div className="case-step-label">Measurable Outcome</div>
                <div className="case-step-result">+28% close rate</div>
                <div className="case-step-text">in 60 days. $1.2M in additional closed revenue. Ramp time cut from 90 to 42 days.</div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── WHY NATIVE / NO BOT ── */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <div className="pos-grid">
            <FadeIn>
              <div>
                <div className="kicker">Why Not Just Use a Bot?</div>
                <h2 className="section-h" style={{ fontSize: "clamp(24px,4vw,44px)" }}>Bots poison the call before your rep says a word.</h2>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72, marginBottom: 20 }}>
                  Every competitor relies on a third-party bot joining your Zoom call. The moment that bot appears, 31% of enterprise prospects disengage. Trust is broken before value is established.
                </p>
                <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.72 }}>
                  Fixsense doesn't join your call. <strong style={{ color: "var(--ink)" }}>Fixsense IS your call.</strong> Native meeting infrastructure built on 100ms — zero bot, zero friction, zero missed seconds.
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={80}>
              <div>
                <table className="pos-table">
                  <thead>
                    <tr>
                      <th className="pos-th" style={{ textAlign: "left" }}>Capability</th>
                      <th className="pos-th hl">Fixsense</th>
                      <th className="pos-th">Gong</th>
                      <th className="pos-th">Bot Tools</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Real-time objection detection", "✓", "✗", "✗"],
                      ["No bot joins the call", "✓", "✗", "✗"],
                      ["Native meeting room", "✓", "✗", "✗"],
                      ["Live sentiment pulse", "✓", "After call", "✗"],
                      ["Mid-call AI coaching", "✓", "✗", "✗"],
                      ["Transparent pricing", "✓", "✗", "✓"],
                    ].map(([feat, fix, gong, bot], i) => (
                      <tr key={i} className="pos-tr">
                        <td className="pos-td" style={{ textAlign: "left" }}>{feat}</td>
                        <td className="pos-td hl"><span style={{ color: "#22c55e", fontSize: 15 }}>{fix}</span></td>
                        <td className="pos-td"><span style={{ color: gong === "✗" ? "rgba(255,255,255,.18)" : "#f59e0b", fontSize: gong === "✓" ? 15 : 12 }}>{gong}</span></td>
                        <td className="pos-td"><span style={{ color: bot === "✗" ? "rgba(255,255,255,.18)" : "#22c55e", fontSize: 15 }}>{bot}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, textAlign: "right" }}>
                  Gong starts at $100k/year. Fixsense starts at $18/month.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>How It Works</div>
              <h2 className="section-h" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>Up in 48 hours. Results in the first call.</h2>
            </div>
          </FadeIn>
          <FadeIn delay={60}>
            <div className="how-steps">
              {[
                { num: "1", title: "Start or join a call", desc: "Share a Fixsense link. Prospect joins in one click. No downloads, no bots, no friction." },
                { num: "2", title: "AI analyzes in real time", desc: "Sentiment, objections, deal risk, and coaching suggestions — updated every 3 seconds." },
                { num: "3", title: "Insights land instantly", desc: "Live alerts mid-call. Full AI summary + CRM push 2 minutes after you hang up." },
              ].map((step, i) => (
                <div key={i} className="how-step">
                  <div className="how-step-num">{step.num}</div>
                  <div className="how-step-title">{step.title}</div>
                  <div className="how-step-desc">{step.desc}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section" style={{ background: "var(--bg)" }}>
        <div className="section-inner">
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="kicker" style={{ justifyContent: "center" }}>Questions</div>
              <h2 className="section-h" style={{ textAlign: "center", fontSize: "clamp(24px,4vw,44px)" }}>The ones we get every day.</h2>
            </div>
          </FadeIn>
          <div className="faq-items">
            {FAQS.map((f, i) => (
              <FadeIn key={i} delay={i * 60}>
                <div className="faq-item">
                  <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                    {f.q}
                    <span className={`faq-chev ${activeFaq === i ? "open" : ""}`}>▾</span>
                  </button>
                  <div className={`faq-a ${activeFaq === i ? "open" : ""}`}><p>{f.a}</p></div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final">
        <div className="final-orb" />
        <div className="final-inner">
          <FadeIn>
            <h2 className="final-h">Every missed objection<br />is lost revenue.</h2>
            <p className="final-sub">Fix it in real time. Start with 30 free minutes — no card required, no bot joining your calls, live in 48 hours.</p>
            <div className="final-ctas">
              <Link to={user ? "/dashboard" : "/login"} className="btn-hero">
                Start Free Trial
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a href="#demo" className="btn-hero-outline">Try Live Demo</a>
            </div>
            <p className="final-footnote">30 min free · No credit card · No bot joins your calls · Native room included</p>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-name"><Logo size={20} />Fixsense</div>
              <p className="footer-brand-desc">Real-time AI sales intelligence. Revenue recovered during the call, not after it.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["#demo", "Live Demo"], ["#problem", "The Problem"], ["/pricing", "Pricing"], ["/changelog", "Changelog"]].map(([h, l]) => (
                h.startsWith("#")
                  ? <a key={h} href={h} className="footer-link">{l}</a>
                  : <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              {[["/about", "About"], ["/blog", "Blog"], ["/testimonials", "Stories"], ["/contact", "Contact"]].map(([h, l]) => (
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"], ["/security", "Security"], ["/contact", "Contact"]].map(([h, l]) => (
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-legal-link">Privacy</Link>
              <Link to="/terms" className="footer-legal-link">Terms</Link>
              <Link to="/security" className="footer-legal-link">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}